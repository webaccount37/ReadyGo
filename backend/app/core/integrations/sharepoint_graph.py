"""
Microsoft Graph client (application permissions) for SharePoint provisioning.

Supports:
- Pattern B (default): one document library per opportunity on the site.
- Pattern A: one folder inside an existing document library.
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote, urlparse

import httpx
from msal import ConfidentialClientApplication

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

# Entra application ID for Office 365 SharePoint Online (token aud when calling *.sharepoint.com/_api)
_SHAREPOINT_ENTRA_APP_ID = "00000003-0000-0ff1-ce00-000000000000"


def _client_credential_from_pfx(pfx_path: str, password: str) -> dict[str, str]:
    """Build MSAL client_credential dict from a PFX (same app registration as AZURE_CLIENT_ID)."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, pkcs12

    path = Path(pfx_path)
    if not path.is_file():
        raise FileNotFoundError(f"Certificate not found: {pfx_path}")
    raw = path.read_bytes()
    pwd = password.encode("utf-8") if password else None
    private_key, cert, _extra = pkcs12.load_key_and_certificates(raw, pwd)
    if private_key is None or cert is None:
        raise ValueError("PFX must contain a private key and leaf certificate")
    pem_key = private_key.private_bytes(
        Encoding.PEM,
        PrivateFormat.PKCS8,
        NoEncryption(),
    ).decode("utf-8")
    thumb = cert.fingerprint(hashes.SHA1()).hex().upper()
    return {"private_key": pem_key, "thumbprint": thumb}


def _jwt_payload(token: str) -> dict[str, Any]:
    try:
        part = token.split(".")[1]
        part += "=" * (4 - len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part.encode("utf-8")))
    except (IndexError, ValueError, json.JSONDecodeError):
        return {}


def _sharepoint_rest_token_is_authorized(payload: dict[str, Any]) -> bool:
    """SharePoint _api expects aud for SPO and non-empty application roles (or delegated scp)."""
    aud = str(payload.get("aud") or "")
    if _SHAREPOINT_ENTRA_APP_ID not in aud and "sharepoint.com" not in aud.casefold():
        return False
    roles = payload.get("roles")
    if isinstance(roles, list) and len(roles) > 0:
        return True
    scp = payload.get("scp")
    if isinstance(scp, str) and scp.strip():
        return True
    return False

_GRAPH_AUTH_HINT = (
    "Provisioning uses app-only Graph (client credentials). In Entra: API permissions → Microsoft Graph → "
    "add an Application permission such as Sites.ReadWrite.All (or grant Sites.Selected on the Active Projects site), "
    "then click 'Grant admin consent for your tenant'. Delegated permissions alone do not apply to this flow."
)

_GRAPH_403_CREATE_LIST_HINT = (
    "Creating a document library calls POST /sites/{id}/lists. If the app-only token already includes "
    "Sites.ReadWrite.All but you still get 403, add Application permission Sites.Manage.All (Microsoft describes it as "
    "the permission to create/delete document libraries and lists); grant admin consent and restart the backend. "
    "If you use Sites.Selected only: grant this app write (or full control) on the site—not just admin consent on the API permission. "
    "Otherwise confirm AZURE_CLIENT_ID/secret, decode the token (jwt.ms) and check `roles`, and review SharePoint/M365 policies."
)


def _graph_http_error(method: str, url: str, response: httpx.Response) -> RuntimeError:
    """Build a RuntimeError with body and actionable hints for common Graph failures."""
    status = response.status_code
    snippet = (response.text or "")[:800]
    msg = f"Graph {method} {url} -> {status}: {snippet}"
    if status in (401, 403):
        msg = f"{msg}\n\n{_GRAPH_AUTH_HINT}"
    if (
        status == 403
        and method == "POST"
        and "/lists" in url
        and "graph.microsoft.com" in url
    ):
        msg = f"{msg}\n\n{_GRAPH_403_CREATE_LIST_HINT}"
    logger.warning(
        "Microsoft Graph request failed",
        extra={"status": status, "url": url, "body_preview": snippet[:200]},
    )
    return RuntimeError(msg)


# Windows / SharePoint invalid name characters (conservative set)
_INVALID_NAME_CHARS = re.compile(r'[<>:"/\\|?*#\x00-\x1f]')


def sanitize_sharepoint_folder_name(name: str, max_len: int = 200) -> str:
    """Normalize opportunity name for use as a SharePoint library or folder name."""
    cleaned = _INVALID_NAME_CHARS.sub(" ", (name or "").strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        cleaned = "Untitled"
    return cleaned[:max_len]


def folder_names_match(display_name: str, opportunity_name: str) -> bool:
    """Case-insensitive match after sanitization (existing names may use raw spelling)."""
    a = sanitize_sharepoint_folder_name(display_name).casefold()
    b = sanitize_sharepoint_folder_name(opportunity_name).casefold()
    return a == b


def quick_launch_node_title(node: dict[str, Any]) -> str:
    return str(node.get("Title") or "").strip()


def quick_launch_node_id(node: dict[str, Any]) -> int:
    v = node.get("Id")
    if v is None:
        v = node.get("id")
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _quicklaunch_is_pinned_first(node: dict[str, Any]) -> bool:
    return quick_launch_node_title(node).casefold() == "home"


def _quicklaunch_is_pinned_last(node: dict[str, Any]) -> bool:
    t = quick_launch_node_title(node).casefold()
    u = str(node.get("Url") or "").strip().casefold()
    if t == "home":
        return False
    if "recycle" in t or "recyclebin" in u:
        return True
    if t == "edit":
        return True
    if "editingnavigation" in u or "designnavigation" in u:
        return True
    return False


def compute_quick_launch_sort_order(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Desired top-to-bottom Quick Launch order: Home, then A–Z by title, then Recycle Bin / Edit.
    """
    if not nodes:
        return []
    first = [n for n in nodes if _quicklaunch_is_pinned_first(n)]
    last = [n for n in nodes if _quicklaunch_is_pinned_last(n)]
    middle = [n for n in nodes if n not in first and n not in last]
    middle_sorted = sorted(middle, key=lambda n: quick_launch_node_title(n).casefold())
    last_sorted = sorted(last, key=lambda n: quick_launch_node_title(n).casefold())
    first_sorted = sorted(first, key=lambda n: quick_launch_node_title(n).casefold())
    return first_sorted + middle_sorted + last_sorted


@dataclass
class SharePointFolderLink:
    web_url: str
    drive_id: str
    item_id: str


def sharepoint_site_absolute_url() -> str:
    """HTTPS URL of the SharePoint web (same site as SHAREPOINT_SITE_PATH)."""
    host = settings.SHAREPOINT_HOSTNAME.strip().rstrip("/")
    path = settings.SHAREPOINT_SITE_PATH.strip().strip("/")
    return f"https://{host}/{path}"


class SharePointGraphAppClient:
    """App-only Graph calls for provisioning."""

    def __init__(self) -> None:
        self._authority = f"{settings.AZURE_AUTHORITY}/{settings.AZURE_TENANT_ID}"
        self._app = ConfidentialClientApplication(
            client_id=settings.AZURE_CLIENT_ID,
            client_credential=settings.AZURE_CLIENT_SECRET,
            authority=self._authority,
        )
        self._spo_cert_msal: ConfidentialClientApplication | None = None
        self._spo_cert_msal_load_error: str | None = None

    def _acquire_token(self) -> str:
        result = self._app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
        if "access_token" not in result:
            err = result.get("error_description") or result.get("error") or str(result)
            raise RuntimeError(f"Graph app token failed: {err}")
        return result["access_token"]

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        token = await asyncio.to_thread(self._acquire_token)
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=120.0) as client:
            return await client.request(method, url, headers=headers, **kwargs)

    async def _get_json(self, url: str) -> dict[str, Any]:
        r = await self._request("GET", url)
        if r.status_code >= 400:
            raise _graph_http_error("GET", url, r)
        return r.json()

    async def _post_json(self, url: str, body: dict) -> dict[str, Any]:
        r = await self._request("POST", url, json=body)
        if r.status_code >= 400:
            raise _graph_http_error("POST", url, r)
        return r.json()

    async def _patch_json(self, url: str, body: dict[str, Any]) -> dict[str, Any] | None:
        r = await self._request("PATCH", url, json=body)
        if r.status_code >= 400:
            raise _graph_http_error("PATCH", url, r)
        if r.content:
            return r.json()
        return None

    async def move_item_to_parent(
        self,
        source_drive_id: str,
        item_id: str,
        dest_drive_id: str,
        dest_parent_item_id: str,
    ) -> None:
        url = f"{GRAPH_BASE}/drives/{source_drive_id}/items/{item_id}"
        body: dict[str, Any] = {
            "parentReference": {
                "id": dest_parent_item_id,
                "driveId": dest_drive_id,
            },
            "@microsoft.graph.conflictBehavior": "rename",
        }
        await self._patch_json(url, body)

    async def _poll_graph_monitor(
        self,
        monitor_url: str,
        *,
        timeout_sec: float = 300.0,
        interval: float = 2.0,
    ) -> None:
        deadline = time.monotonic() + timeout_sec
        while time.monotonic() < deadline:
            r = await self._request("GET", monitor_url)
            if r.status_code >= 400:
                raise _graph_http_error("GET", monitor_url, r)
            data = r.json()
            status = (data.get("status") or "").casefold()
            if status == "completed":
                return
            if status == "failed":
                raise RuntimeError(f"Graph async operation failed: {data}")
            await asyncio.sleep(interval)
        raise RuntimeError(f"Graph async operation timed out after {timeout_sec}s")

    async def copy_item_to_parent_async(
        self,
        source_drive_id: str,
        item_id: str,
        dest_drive_id: str,
        dest_parent_item_id: str,
    ) -> None:
        url = f"{GRAPH_BASE}/drives/{source_drive_id}/items/{item_id}/copy"
        body: dict[str, Any] = {
            "parentReference": {
                "id": dest_parent_item_id,
                "driveId": dest_drive_id,
            },
            "@microsoft.graph.conflictBehavior": "rename",
        }
        r = await self._request("POST", url, json=body)
        if r.status_code not in (200, 202):
            raise _graph_http_error("POST", url, r)
        if r.status_code == 200:
            return
        loc = r.headers.get("Location") or r.headers.get("location")
        if not loc:
            raise RuntimeError("Graph copy returned 202 without Location monitor URL")
        await self._poll_graph_monitor(loc)

    def _get_spo_cert_msal(self) -> ConfidentialClientApplication | None:
        """Second MSAL app using a PFX — SharePoint _api often rejects client-secret app-only tokens."""
        path = (settings.AZURE_SP_REST_CLIENT_CERTIFICATE_PATH or "").strip()
        if not path:
            return None
        if self._spo_cert_msal_load_error:
            return None
        if self._spo_cert_msal is not None:
            return self._spo_cert_msal
        try:
            cred = _client_credential_from_pfx(
                path, settings.AZURE_SP_REST_CLIENT_CERTIFICATE_PASSWORD or ""
            )
            self._spo_cert_msal = ConfidentialClientApplication(
                client_id=settings.AZURE_CLIENT_ID,
                client_credential=cred,
                authority=self._authority,
            )
        except Exception as e:
            self._spo_cert_msal_load_error = str(e)[:500]
            logger.exception("Quick Launch: failed to load AZURE_SP_REST_CLIENT_CERTIFICATE_PATH")
            return None
        return self._spo_cert_msal

    def _acquire_sharepoint_host_token(self) -> str | None:
        """
        Token for https://{tenant}.sharepoint.com/.default (aud is SharePoint's Entra app id).
        Add Office 365 SharePoint Online application permissions. Many tenants require a **certificate**
        (AZURE_SP_REST_CLIENT_CERTIFICATE_PATH): client-secret tokens may carry roles but still get 401 on _api.
        """
        host = settings.SHAREPOINT_HOSTNAME.strip().rstrip("/")
        if not host:
            return None
        scope = f"https://{host}/.default"

        cert_app = self._get_spo_cert_msal()
        if cert_app is not None:
            result = cert_app.acquire_token_for_client(scopes=[scope])
            if "access_token" in result:
                return result["access_token"]
            logger.warning(
                "SharePoint host token (certificate) failed",
                extra={
                    "error": result.get("error"),
                    "description": (result.get("error_description") or "")[:300],
                },
            )
            return None

        if (settings.AZURE_SP_REST_CLIENT_CERTIFICATE_PATH or "").strip():
            if self._spo_cert_msal_load_error:
                logger.warning(
                    "SharePoint REST certificate configured but not loaded; skipping secret fallback",
                    extra={"reason": self._spo_cert_msal_load_error[:200]},
                )
            return None

        result = self._app.acquire_token_for_client(scopes=[scope])
        if "access_token" in result:
            return result["access_token"]
        logger.info(
            "SharePoint host token not issued",
            extra={
                "error": result.get("error"),
                "description": (result.get("error_description") or "")[:240],
            },
        )
        return None

    async def _spo_rest_request(
        self,
        method: str,
        absolute_url: str,
        *,
        token: str,
        json_body: dict[str, Any] | None = None,
    ) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json;odata=verbose",
        }
        if json_body is not None:
            headers["Content-Type"] = "application/json;odata=verbose"
        async with httpx.AsyncClient(timeout=60.0) as client:
            return await client.request(method, absolute_url, headers=headers, json=json_body)

    async def _spo_rest_post_json_plain(
        self,
        absolute_url: str,
        *,
        token: str,
        json_body: dict[str, Any],
    ) -> httpx.Response:
        """POST JSON without OData verbose wrapper (SharePoint navigation MoveAfter expects plain JSON)."""
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            return await client.request("POST", absolute_url, headers=headers, json=json_body)

    @staticmethod
    def _quicklaunch_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
        d = payload.get("d")
        if isinstance(d, dict) and isinstance(d.get("results"), list):
            return list(d["results"])
        return []

    @staticmethod
    def _navigation_url_path_for_compare(url_fragment: str, *, host: str) -> str:
        """
        Normalize nav or library URLs so Graph webUrl and Quick Launch nodes compare equal.

        Do not use parent-path prefix matching: a \"Home\" node at /sites/ActiveProjects would
        incorrectly match every library under that site and skip adding Quick Launch links.
        """
        raw = (url_fragment or "").strip()
        if not raw:
            return ""
        h = host.strip().casefold()
        if raw.casefold().startswith("http"):
            p = urlparse(unquote(raw))
            path = p.path.rstrip("/").casefold()
        else:
            rel = raw if raw.startswith("/") else f"/{raw}"
            path = urlparse(f"https://{h}{rel}").path.rstrip("/").casefold()
        for suffix in ("/forms/allitems.aspx", "/allitems.aspx"):
            if path.endswith(suffix):
                path = path[: -len(suffix)]
                break
        return path

    @classmethod
    def _quicklaunch_has_link_to_library(
        cls,
        nodes: list[dict[str, Any]],
        library_web_url: str,
    ) -> bool:
        """True only if some Quick Launch node points at this library (exact path, after normalization)."""
        lib_parsed = urlparse(unquote(library_web_url.strip()))
        host = lib_parsed.netloc.casefold()
        want = cls._navigation_url_path_for_compare(library_web_url, host=host)
        if not want or not host:
            return False
        for n in nodes:
            raw = (n.get("Url") or "").strip()
            if not raw:
                continue
            path = cls._navigation_url_path_for_compare(raw, host=host)
            if path and path == want:
                return True
        return False

    async def ensure_quick_launch_link(
        self,
        *,
        site_absolute_url: str,
        link_title: str,
        library_web_url: str,
    ) -> None:
        """
        Add a Quick Launch (left nav) link via SharePoint REST — Graph has no equivalent.
        Best-effort: logs and returns on failure (does not raise).
        """
        site = site_absolute_url.rstrip("/")
        if not library_web_url.strip():
            return
        ql_get = f"{site}/_api/web/navigation/QuickLaunch"
        ql_post = ql_get

        spo = await asyncio.to_thread(self._acquire_sharepoint_host_token)
        if not spo:
            logger.warning(
                "Quick Launch skipped: no SharePoint host token. Add API permission "
                "Office 365 SharePoint Online → Application → Sites.Manage.All (or Sites.FullControl.All), "
                "grant admin consent, restart the backend."
            )
            return
        spo_claims = _jwt_payload(spo)
        if not _sharepoint_rest_token_is_authorized(spo_claims):
            logger.warning(
                "Quick Launch skipped: SharePoint token aud=%s has roles=%s scp=%s. "
                "If Sites.Manage.All / Sites.FullControl.All / Sites.ReadWrite.All appear only under "
                "**Microsoft Graph** in Entra, they do NOT apply to https://%s/_api — that is a different "
                "resource. Add a separate permission: API permissions → Add permission → tab "
                "**APIs my organization uses** → search **SharePoint** → choose **Office 365 SharePoint Online** "
                "(not Microsoft Graph) → Application permissions → Sites.Manage.All or Sites.FullControl.All → "
                "Grant admin consent for the tenant, restart backend, Retry link to SharePoint.",
                spo_claims.get("aud"),
                spo_claims.get("roles"),
                spo_claims.get("scp"),
                settings.SHAREPOINT_HOSTNAME,
            )
            return

        get_resp = await self._spo_rest_request("GET", ql_get, token=spo)
        if get_resp.status_code != 200:
            body = (get_resp.text or "")[:800]
            cert_hint = ""
            if (settings.AZURE_SP_REST_CLIENT_CERTIFICATE_PATH or "").strip():
                cert_hint = " Check PFX password/path and that the certificate is uploaded to the same app registration."
            elif get_resp.status_code == 401:
                cert_hint = (
                    " SharePoint Online often returns 401 for app-only tokens from a client secret even when "
                    "roles are present; upload a certificate in Entra for this app, set "
                    "AZURE_SP_REST_CLIENT_CERTIFICATE_PATH (and password) in backend .env, restart, retry."
                )
            logger.warning(
                "Quick Launch: could not read navigation status=%s%s snippet=%r",
                get_resp.status_code,
                cert_hint,
                body,
            )
            return

        try:
            nodes = self._quicklaunch_results(get_resp.json())
        except Exception:
            logger.warning("Quick Launch: unexpected GET response shape")
            return

        if self._quicklaunch_has_link_to_library(nodes, library_web_url):
            logger.info(
                "Quick Launch: library already in navigation (skipped POST)",
                extra={"title": link_title},
            )
            if settings.SHAREPOINT_QUICK_LAUNCH_ALPHABETIZE:
                await self.quick_launch_reorder_alphabetically(
                    site_absolute_url=site_absolute_url,
                    token=spo,
                    navigation_nodes=nodes,
                )
            return

        body: dict[str, Any] = {
            "__metadata": {"type": "SP.NavigationNode"},
            "Title": link_title[:256],
            "Url": library_web_url.strip(),
        }
        post_resp = await self._spo_rest_request("POST", ql_post, token=spo, json_body=body)
        if post_resp.status_code in (200, 201):
            logger.info(
                "Quick Launch: added document library link",
                extra={"title": link_title},
            )
            if settings.SHAREPOINT_QUICK_LAUNCH_ALPHABETIZE:
                await self.quick_launch_reorder_alphabetically(
                    site_absolute_url=site_absolute_url,
                    token=spo,
                )
            return
        logger.warning(
            "Quick Launch: POST failed",
            extra={
                "status": post_resp.status_code,
                "body_preview": (post_resp.text or "")[:500],
            },
        )

    async def quick_launch_reorder_alphabetically(
        self,
        *,
        site_absolute_url: str,
        token: str,
        navigation_nodes: list[dict[str, Any]] | None = None,
    ) -> None:
        """
        Reorder Quick Launch: Home first, library links A–Z by title, Recycle Bin / Edit last.
        Uses POST .../navigation/QuickLaunch/MoveAfter (SharePoint REST).
        """
        if not settings.SHAREPOINT_QUICK_LAUNCH_ALPHABETIZE:
            return
        site = site_absolute_url.rstrip("/")
        ql_url = f"{site}/_api/web/navigation/QuickLaunch"
        if navigation_nodes is not None:
            nodes = navigation_nodes
        else:
            get_resp = await self._spo_rest_request("GET", ql_url, token=token)
            if get_resp.status_code != 200:
                logger.warning(
                    "Quick Launch: alphabetize skipped (GET navigation failed)",
                    extra={"status": get_resp.status_code},
                )
                return
            try:
                nodes = self._quicklaunch_results(get_resp.json())
            except Exception:
                logger.warning("Quick Launch: alphabetize skipped (unexpected GET shape)")
                return
        if len(nodes) < 2:
            return

        desired = compute_quick_launch_sort_order(nodes)
        desired_ids = [quick_launch_node_id(n) for n in desired if quick_launch_node_id(n)]
        current_ids = [quick_launch_node_id(n) for n in nodes if quick_launch_node_id(n)]

        if len(desired_ids) != len(current_ids) or set(desired_ids) != set(current_ids):
            logger.warning(
                "Quick Launch: alphabetize skipped (unexpected node id set)",
                extra={"desired": len(desired_ids), "current": len(current_ids)},
            )
            return

        if desired_ids == current_ids:
            return

        move_url = f"{site}/_api/web/navigation/QuickLaunch/MoveAfter"
        for i in range(1, len(desired_ids)):
            prev_id, node_id = desired_ids[i - 1], desired_ids[i]
            post_resp = await self._spo_rest_post_json_plain(
                move_url,
                token=token,
                json_body={"nodeId": node_id, "previousNodeId": prev_id},
            )
            if post_resp.status_code not in (200, 201, 204):
                logger.warning(
                    "Quick Launch: MoveAfter failed during alphabetize",
                    extra={
                        "status": post_resp.status_code,
                        "node_id": node_id,
                        "previous_node_id": prev_id,
                        "body_preview": (post_resp.text or "")[:500],
                    },
                )
                return

        logger.info(
            "Quick Launch: navigation reordered alphabetically",
            extra={"node_count": len(desired_ids)},
        )

    async def resolve_site_id(self) -> str:
        host = settings.SHAREPOINT_HOSTNAME
        path = settings.SHAREPOINT_SITE_PATH.strip().lstrip("/")
        site_path = quote(f"{host}:/{path}", safe=":/")
        data = await self._get_json(f"{GRAPH_BASE}/sites/{site_path}")
        return str(data["id"])

    async def iter_site_drives(self, site_id: str) -> list[dict[str, Any]]:
        """Document library drives on the site (name matches library title in SharePoint)."""
        out: list[dict[str, Any]] = []
        url = f"{GRAPH_BASE}/sites/{site_id}/drives"
        while url:
            data = await self._get_json(url)
            out.extend(data.get("value", []))
            url = data.get("@odata.nextLink") or ""
        return out

    async def create_document_library(self, site_id: str, display_name: str) -> dict[str, Any]:
        """Create a new document library (list) on the site."""
        endpoint = f"{GRAPH_BASE}/sites/{site_id}/lists"
        body = {
            "displayName": display_name,
            "list": {"template": "documentLibrary"},
        }
        return await self._post_json(endpoint, body)

    async def get_list_drive(self, site_id: str, list_id: str) -> dict[str, Any]:
        return await self._get_json(f"{GRAPH_BASE}/sites/{site_id}/lists/{list_id}/drive")

    async def resolve_drive_id(self, site_id: str) -> str:
        data = await self._get_json(f"{GRAPH_BASE}/sites/{site_id}/drives")
        target = settings.SHAREPOINT_LIBRARY_NAME.strip()
        for d in data.get("value", []):
            if d.get("name", "").casefold() == target.casefold():
                return str(d["id"])
        names = [d.get("name") for d in data.get("value", [])]
        raise RuntimeError(
            f"No drive named {target!r} on site. Available drives: {names}"
        )

    async def get_item_by_path(self, drive_id: str, item_path: str) -> dict[str, Any]:
        """item_path: relative path inside drive, e.g. 'Projects/Archive' (no leading slash)."""
        enc = quote(item_path.strip().lstrip("/"), safe="/")
        url = f"{GRAPH_BASE}/drives/{drive_id}/root:/{enc}:"
        return await self._get_json(url)

    async def get_drive_root(self, drive_id: str) -> dict[str, Any]:
        return await self._get_json(f"{GRAPH_BASE}/drives/{drive_id}/root")

    async def list_children(self, drive_id: str, item_id: str) -> list[dict[str, Any]]:
        url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/children"
        items: list[dict[str, Any]] = []
        while url:
            data = await self._get_json(url)
            items.extend(data.get("value", []))
            url = data.get("@odata.nextLink") or ""
        return items

    async def create_folder(
        self, drive_id: str, parent_item_id: str, folder_name: str
    ) -> dict[str, Any]:
        url = f"{GRAPH_BASE}/drives/{drive_id}/items/{parent_item_id}/children"
        body = {
            "name": folder_name,
            "folder": {},
            "@microsoft.graph.conflictBehavior": "fail",
        }
        return await self._post_json(url, body)


class SharePointProjectFolderService:
    """Find or create SharePoint storage for an opportunity (library or folder)."""

    def __init__(self) -> None:
        self._client = SharePointGraphAppClient()

    async def _link_from_list(self, site_id: str, lst: dict[str, Any]) -> SharePointFolderLink:
        list_id = str(lst["id"])
        last_err: RuntimeError | None = None
        drive: dict[str, Any] | None = None
        for attempt in range(3):
            try:
                drive = await self._client.get_list_drive(site_id, list_id)
                break
            except RuntimeError as e:
                last_err = e
                if attempt < 2:
                    await asyncio.sleep(1.5)
                else:
                    raise last_err
        if not drive:
            raise last_err or RuntimeError("Could not resolve drive for SharePoint list")
        drive_id = str(drive["id"])
        root = await self._client.get_drive_root(drive_id)
        web_url = str(lst.get("webUrl") or drive.get("webUrl") or "")
        return SharePointFolderLink(
            web_url=web_url,
            drive_id=drive_id,
            item_id=str(root["id"]),
        )

    async def _find_matching_project_drive(
        self, site_id: str, opportunity_name: str
    ) -> SharePointFolderLink | None:
        """
        Match by drive name — same as the document library title in Site Contents.
        (Listing /sites/lists with $select omitted template, so list-based detection was unreliable.)
        """
        for d in await self._client.iter_site_drives(site_id):
            drive_name = d.get("name") or ""
            if not folder_names_match(drive_name, opportunity_name):
                continue
            drive_id = str(d["id"])
            root = await self._client.get_drive_root(drive_id)
            web_url = str(d.get("webUrl") or "")
            return SharePointFolderLink(
                web_url=web_url,
                drive_id=drive_id,
                item_id=str(root["id"]),
            )
        return None

    async def _ensure_document_library(self, opportunity_name: str) -> SharePointFolderLink:
        display_name = sanitize_sharepoint_folder_name(opportunity_name)
        site_id = await self._client.resolve_site_id()

        existing = await self._find_matching_project_drive(site_id, opportunity_name)
        if existing:
            return existing

        try:
            created = await self._client.create_document_library(site_id, display_name)
        except RuntimeError as e:
            msg = str(e).lower()
            if "namealreadyexists" in msg or "already exists" in msg or "409" in str(e):
                existing = await self._find_matching_project_drive(site_id, opportunity_name)
                if existing:
                    return existing
            raise

        return await self._link_from_list(site_id, created)

    async def _ensure_folder_in_parent_library(self, opportunity_name: str) -> SharePointFolderLink:
        folder_name = sanitize_sharepoint_folder_name(opportunity_name)
        site_id = await self._client.resolve_site_id()
        drive_id = await self._client.resolve_drive_id(site_id)

        parent_path = settings.SHAREPOINT_PROJECTS_PARENT_PATH.strip().strip("/")
        if parent_path:
            parent_item = await self._client.get_item_by_path(drive_id, parent_path)
            parent_id = str(parent_item["id"])
        else:
            root = await self._client.get_drive_root(drive_id)
            parent_id = str(root["id"])

        children = await self._client.list_children(drive_id, parent_id)
        for ch in children:
            if "folder" in ch and folder_names_match(ch.get("name", ""), opportunity_name):
                return SharePointFolderLink(
                    web_url=str(ch["webUrl"]),
                    drive_id=drive_id,
                    item_id=str(ch["id"]),
                )

        created = await self._client.create_folder(drive_id, parent_id, folder_name)
        return SharePointFolderLink(
            web_url=str(created["webUrl"]),
            drive_id=drive_id,
            item_id=str(created["id"]),
        )

    async def _maybe_pin_library_to_quick_launch(
        self, link: SharePointFolderLink, opportunity_name: str
    ) -> None:
        if not settings.SHAREPOINT_ADD_LIBRARY_TO_QUICK_LAUNCH:
            return
        if not link.web_url:
            return
        title = sanitize_sharepoint_folder_name(opportunity_name)
        try:
            await self._client.ensure_quick_launch_link(
                site_absolute_url=sharepoint_site_absolute_url(),
                link_title=title,
                library_web_url=link.web_url,
            )
        except Exception:
            logger.warning(
                "Quick Launch: unexpected error (provisioning still succeeded)",
                exc_info=True,
            )

    async def ensure_project_folder(self, opportunity_name: str) -> SharePointFolderLink:
        if not settings.AZURE_CLIENT_ID or not settings.AZURE_CLIENT_SECRET or not settings.AZURE_TENANT_ID:
            raise RuntimeError("Azure app credentials are not configured")

        mode = (settings.SHAREPOINT_PROVISIONING_MODE or "document_library").strip().casefold()
        if mode in ("folder_inside_library", "folder", "legacy"):
            return await self._ensure_folder_in_parent_library(opportunity_name)
        link = await self._ensure_document_library(opportunity_name)
        await self._maybe_pin_library_to_quick_launch(link, opportunity_name)
        return link

    async def migrate_previous_folder_to_library(
        self,
        old_drive_id: str,
        old_folder_item_id: str,
        new_link: SharePointFolderLink,
    ) -> None:
        """
        After linking to a new drive (e.g. project library), optionally move or copy children
        from the previously stored folder into the new library root.
        """
        mode = (settings.SHAREPOINT_FOLDER_MIGRATION_MODE or "none").strip().casefold()
        if mode in ("", "none"):
            return
        if mode not in ("move", "copy"):
            raise ValueError(
                f"Invalid SHAREPOINT_FOLDER_MIGRATION_MODE: {mode!r}; use none, move, or copy"
            )

        if old_drive_id == new_link.drive_id and old_folder_item_id == new_link.item_id:
            return

        root = await self._client.get_drive_root(old_drive_id)
        if old_folder_item_id == str(root["id"]):
            logger.warning(
                "Skipping SharePoint migration: stored item id is drive root",
                extra={"drive_id": old_drive_id},
            )
            return

        if old_drive_id == new_link.drive_id:
            logger.info(
                "Skipping SharePoint migration: same drive id (only cross-library moves are migrated)",
                extra={"drive_id": old_drive_id},
            )
            return

        children = await self._client.list_children(old_drive_id, old_folder_item_id)
        if not children:
            logger.info(
                "SharePoint migration: no children in previous folder",
                extra={"old_drive_id": old_drive_id},
            )
            return

        logger.info(
            "SharePoint folder migration starting",
            extra={"mode": mode, "count": len(children), "to_drive_id": new_link.drive_id},
        )
        for ch in children:
            cid = str(ch["id"])
            if mode == "move":
                await self._client.move_item_to_parent(
                    old_drive_id,
                    cid,
                    new_link.drive_id,
                    new_link.item_id,
                )
            else:
                await self._client.copy_item_to_parent_async(
                    old_drive_id,
                    cid,
                    new_link.drive_id,
                    new_link.item_id,
                )
