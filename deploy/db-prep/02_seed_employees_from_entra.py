#!/usr/bin/env python3
"""
Seed employees from a CSV export (default) or Microsoft Graph / JSON.

Default CSV (repo uploads): users_4_17_2026 7_22_59 AM.csv
  Columns (header row): First name, Last name, Create date (or Crate date), Title,
  Country, Proxy address (email). Optional: When created, Phone number.

Per-row: delivery_center resolved from Country -> delivery_centers.name;
  default_currency = that row's delivery_centers.default_currency.

Constants: employee_type FULL_TIME, status ACTIVE (Postgres enum labels; matches SQLAlchemy SQLEnum on Employee),
  timezone UTC, billable true, ICR/IBR/EBR 0.

Run after 01_purge_data.sql. DATABASE_URL must be asyncpg-compatible.

Optional: --from-graph (Entra licensed users), --from-json PATH, EMPLOYEE_SEED_DELIVERY_CENTER
when Country is empty (fallback DC name, default North America).
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import re
import sys
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, TypedDict

import asyncpg
import httpx
from msal import ConfidentialClientApplication


GRAPH_BASE = "https://graph.microsoft.com/v1.0"
FALLBACK_DC_NAME = os.environ.get("EMPLOYEE_SEED_DELIVERY_CENTER", "North America").strip() or "North America"

# Map CSV Country (or similar) to delivery_centers.name when names differ (align with 03_load_crm_from_excel).
COUNTRY_TO_DC_NAME: dict[str, str] = {
    "united states": "North America",
    "usa": "North America",
    "us": "North America",
    "u.s.": "North America",
    "u.s.a.": "North America",
    "australia": "Australia",
    "philippines": "Philippines",
    "thailand": "Thailand",
    "canada": "North America",
    "mexico": "North America",
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_employee_csv() -> Path:
    return repo_root() / "uploads" / "users_4_17_2026 7_22_59 AM.csv"


def normalize_database_url(url: str) -> str:
    u = url.strip()
    if "+asyncpg" in u:
        u = u.replace("postgresql+asyncpg://", "postgresql://", 1)
    return u


class EmployeeSeed(TypedDict, total=False):
    email: str
    first_name: str
    last_name: str
    start_date: date
    role_title: str | None
    country: str | None


async def pg_enum_typname(conn: asyncpg.Connection, table: str, column: str) -> str:
    row = await conn.fetchrow(
        """
        SELECT t.typname::text AS typname
        FROM pg_attribute a
        JOIN pg_class c ON a.attrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        JOIN pg_type t ON a.atttypid = t.oid
        WHERE n.nspname = 'public'
          AND c.relname = $1
          AND a.attname = $2
          AND a.attnum > 0
          AND NOT a.attisdropped
        """,
        table,
        column,
    )
    if not row:
        raise RuntimeError(f"Column not found: public.{table}.{column}")
    name = row["typname"]
    if not re.fullmatch(r"[a-z0-9_]+", name):
        raise RuntimeError(f"Unexpected enum type name: {name!r}")
    return name


def acquire_graph_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    authority = f"https://login.microsoftonline.com/{tenant_id}"
    app = ConfidentialClientApplication(
        client_id,
        authority=authority,
        client_credential=client_secret,
    )
    result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    if "access_token" not in result:
        err = result.get("error_description") or result.get("error") or str(result)
        raise RuntimeError(f"MSAL token failed: {err}")
    return result["access_token"]


def _primary_email(user: dict[str, Any]) -> str | None:
    mail = (user.get("mail") or "").strip()
    if mail and "@" in mail:
        return mail.lower()
    upn = (user.get("userPrincipalName") or "").strip()
    if upn and "@" in upn and "#ext#" not in upn.lower():
        return upn.lower()
    return None


def _licensed(user: dict[str, Any]) -> bool:
    lic = user.get("assignedLicenses")
    return isinstance(lic, list) and len(lic) > 0


def _names(user: dict[str, Any]) -> tuple[str, str]:
    gn = (user.get("givenName") or "").strip()
    sn = (user.get("surname") or "").strip()
    if gn or sn:
        return gn or "Unknown", sn or "Unknown"
    dn = (user.get("displayName") or "").strip()
    if not dn:
        return "Unknown", "Unknown"
    parts = dn.split(None, 1)
    if len(parts) == 1:
        return parts[0], "Unknown"
    return parts[0], parts[1]


def country_key(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def resolve_dc_name_from_country(country_cell: str | None) -> str:
    if not country_cell or not str(country_cell).strip():
        return FALLBACK_DC_NAME
    k = country_key(str(country_cell))
    if k in COUNTRY_TO_DC_NAME:
        return COUNTRY_TO_DC_NAME[k]
    return str(country_cell).strip()


def normalize_email_from_proxy(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s_lower = s.lower()
    if s_lower.startswith("smtp:"):
        s = s[5:].strip()
    if "<" in s and ">" in s:
        inner = s[s.find("<") + 1 : s.find(">")].strip()
        if "@" in inner:
            return inner.lower()
    if "@" in s:
        return s.lower()
    return None


def parse_create_date(v: Any) -> date | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    if not s:
        return None
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%d", "%m/%d/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _header_map(fieldnames: list[str] | None) -> dict[str, str]:
    out: dict[str, str] = {}
    if not fieldnames:
        return out
    for h in fieldnames:
        if h is None:
            continue
        key = str(h).strip().lower()
        if key:
            out[key] = str(h).strip()
    return out


def _col(row: dict[str, Any], hmap: dict[str, str], *candidates: str) -> Any:
    for c in candidates:
        orig = hmap.get(c.lower().strip())
        if orig is not None and orig in row:
            return row.get(orig)
    return None


def load_seeds_from_csv(path: Path, default_start: date) -> list[EmployeeSeed]:
    text = path.read_text(encoding="utf-8-sig")
    reader = csv.DictReader(text.splitlines())
    hmap = _header_map(reader.fieldnames)
    seeds: list[EmployeeSeed] = []
    for row in reader:
        fn = (_col(row, hmap, "first name") or "").strip()
        ln = (_col(row, hmap, "last name") or "").strip()
        proxy = _col(row, hmap, "proxy address", "proxy addresses")
        email = normalize_email_from_proxy(proxy if isinstance(proxy, str) else str(proxy or ""))
        title_raw = _col(row, hmap, "title")
        role_title = str(title_raw).strip() if title_raw else None
        country_raw = _col(row, hmap, "country")
        country = str(country_raw).strip() if country_raw else None

        create_raw = _col(row, hmap, "create date", "crate date", "created date")
        start = parse_create_date(create_raw) or default_start
        if not email:
            print(f"SKIP CSV row (no email): {fn!r} {ln!r}", file=sys.stderr)
            continue
        if not fn and not ln:
            print(f"SKIP CSV row (no name): {email}", file=sys.stderr)
            continue
        seeds.append(
            EmployeeSeed(
                email=email,
                first_name=fn or "Unknown",
                last_name=ln or "Unknown",
                start_date=start,
                role_title=role_title or None,
                country=country or None,
            )
        )
    return seeds


def load_seeds_from_json(path: Path, default_start: date) -> list[EmployeeSeed]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError("JSON root must be an array")
    seeds: list[EmployeeSeed] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        email = (row.get("email") or row.get("mail") or "").strip().lower()
        if not email or "@" not in email:
            continue
        fn = (row.get("first_name") or row.get("givenName") or "").strip() or "Unknown"
        ln = (row.get("last_name") or row.get("surname") or "").strip() or "Unknown"
        seeds.append(
            EmployeeSeed(
                email=email,
                first_name=fn,
                last_name=ln,
                start_date=default_start,
                role_title=row.get("role_title") or row.get("title"),
                country=row.get("country"),
            )
        )
    return seeds


def graph_users_to_seeds(users: list[dict[str, Any]], default_start: date) -> list[EmployeeSeed]:
    seeds: list[EmployeeSeed] = []
    for u in users:
        email = _primary_email(u)
        if not email:
            continue
        fn, ln = _names(u)
        seeds.append(
            EmployeeSeed(
                email=email,
                first_name=fn,
                last_name=ln,
                start_date=default_start,
                role_title=None,
                country=None,
            )
        )
    return seeds


async def graph_list_licensed_users(token: str) -> list[dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}"}
    select = "id,displayName,givenName,surname,mail,userPrincipalName,assignedLicenses"
    params = {"$select": select, "$top": "100"}
    url: str | None = f"{GRAPH_BASE}/users"
    first = True
    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        while url:
            r = await client.get(url, headers=headers, params=params if first else None)
            first = False
            if r.status_code >= 400:
                raise RuntimeError(f"Graph GET failed {r.status_code}: {r.text[:800]}")
            data = r.json()
            for u in data.get("value", []):
                if _licensed(u):
                    out.append(u)
            url = data.get("@odata.nextLink")
    return out


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


async def load_delivery_centers(conn: asyncpg.Connection) -> list[asyncpg.Record]:
    return list(await conn.fetch("SELECT id, name, default_currency FROM delivery_centers"))


def match_dc_row(
    dc_rows: list[asyncpg.Record],
    country: str | None,
) -> tuple[Any, str]:
    """Return (delivery_center_id, default_currency) for seed."""
    target_name = resolve_dc_name_from_country(country)
    tl = target_name.strip().lower()
    for r in dc_rows:
        if str(r["name"]).strip().lower() == tl:
            cur = (r["default_currency"] or "USD").strip()[:3] if r["default_currency"] else "USD"
            return r["id"], cur
    for r in dc_rows:
        if str(r["name"]).strip().lower() == FALLBACK_DC_NAME.strip().lower():
            cur = (r["default_currency"] or "USD").strip()[:3] if r["default_currency"] else "USD"
            return r["id"], cur
    raise RuntimeError(
        f"No delivery_centers row for country/name={target_name!r} "
        f"(fallback {FALLBACK_DC_NAME!r}). Check seed data."
    )


async def run_db(
    dsn: str,
    seeds: list[EmployeeSeed],
    on_conflict: str,
) -> None:
    if not seeds:
        print("No employees to insert; skipping.", file=sys.stderr)
        return

    conn = await asyncpg.connect(dsn)
    try:
        etype = await pg_enum_typname(conn, "employees", "employee_type")
        estatus = await pg_enum_typname(conn, "employees", "status")
        dc_rows = await load_delivery_centers(conn)

        insert_sql = f"""
INSERT INTO employees (
    id, first_name, last_name, email, employee_type, status,
    role_title, skills, internal_cost_rate, internal_bill_rate, external_bill_rate,
    start_date, end_date, billable, default_currency, timezone, delivery_center_id
) VALUES (
    $1, $2, $3, $4, $5::{etype}, $6::{estatus},
    $7, $8::json, 0, 0, 0,
    $9, NULL, TRUE, $10, 'UTC', $11
)
"""

        update_tail = """
ON CONFLICT (email) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    employee_type = EXCLUDED.employee_type,
    status = EXCLUDED.status,
    role_title = EXCLUDED.role_title,
    skills = EXCLUDED.skills,
    internal_cost_rate = EXCLUDED.internal_cost_rate,
    internal_bill_rate = EXCLUDED.internal_bill_rate,
    external_bill_rate = EXCLUDED.external_bill_rate,
    start_date = EXCLUDED.start_date,
    billable = EXCLUDED.billable,
    default_currency = EXCLUDED.default_currency,
    timezone = EXCLUDED.timezone,
    delivery_center_id = EXCLUDED.delivery_center_id
"""

        skip_tail = "ON CONFLICT (email) DO NOTHING"

        sql = insert_sql.strip() + "\n" + (update_tail.strip() if on_conflict == "update" else skip_tail)

        skills_json = "[]"
        n = 0
        for s in seeds:
            dc_id, currency = match_dc_row(dc_rows, s.get("country"))
            eid = uuid.uuid4()
            await conn.execute(
                sql,
                eid,
                s["first_name"],
                s["last_name"],
                s["email"],
                "FULL_TIME",
                "ACTIVE",
                s.get("role_title"),
                skills_json,
                s["start_date"],
                currency,
                dc_id,
            )
            n += 1
        print(f"Employees inserted/upserted: {n}", file=sys.stderr)
    finally:
        await conn.close()


def emit_sql(
    seeds: list[EmployeeSeed],
    path: Path,
    etype: str,
    estatus: str,
    on_conflict: str,
) -> None:
    if not seeds:
        path.write_text("-- No employees to insert\n", encoding="utf-8")
        print(f"Wrote empty SQL file: {path}", file=sys.stderr)
        return

    lines: list[str] = ["BEGIN;"]
    conflict = (
        "ON CONFLICT (email) DO UPDATE SET "
        "first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, "
        "employee_type = EXCLUDED.employee_type, status = EXCLUDED.status, "
        "role_title = EXCLUDED.role_title, skills = EXCLUDED.skills, "
        "internal_cost_rate = EXCLUDED.internal_cost_rate, "
        "internal_bill_rate = EXCLUDED.internal_bill_rate, external_bill_rate = EXCLUDED.external_bill_rate, "
        "start_date = EXCLUDED.start_date, billable = EXCLUDED.billable, "
        "default_currency = EXCLUDED.default_currency, timezone = EXCLUDED.timezone, "
        "delivery_center_id = EXCLUDED.delivery_center_id"
        if on_conflict == "update"
        else "ON CONFLICT (email) DO NOTHING"
    )
    for s in seeds:
        tname = resolve_dc_name_from_country(s.get("country"))
        rt = s.get("role_title")
        rt_sql = "NULL" if not rt else f"'{sql_escape(rt)}'"
        lines.append(
            "INSERT INTO employees ("
            "id, first_name, last_name, email, employee_type, status, "
            "role_title, skills, internal_cost_rate, internal_bill_rate, external_bill_rate, "
            "start_date, end_date, billable, default_currency, timezone, delivery_center_id"
            ") SELECT "
            f"gen_random_uuid(), '{sql_escape(s['first_name'])}', '{sql_escape(s['last_name'])}', "
            f"'{sql_escape(s['email'])}', 'FULL_TIME'::{etype}, 'ACTIVE'::{estatus}, "
            f"{rt_sql}, '[]'::json, 0, 0, 0, "
            f"'{s['start_date'].isoformat()}'::date, NULL, TRUE, "
            f"(SELECT default_currency FROM delivery_centers WHERE lower(trim(name)) = lower(trim('{sql_escape(tname)}')) LIMIT 1), "
            f"'UTC', "
            f"(SELECT id FROM delivery_centers WHERE lower(trim(name)) = lower(trim('{sql_escape(tname)}')) LIMIT 1) "
            f"{conflict};"
        )
    lines.append("COMMIT;")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {path}", file=sys.stderr)


async def async_main() -> int:
    p = argparse.ArgumentParser(description="Seed employees from CSV (default), Graph, or JSON.")
    p.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="Employee CSV path (default: uploads/users_4_17_2026 7_22_59 AM.csv under repo root).",
    )
    p.add_argument(
        "--from-graph",
        action="store_true",
        help="Use Microsoft Graph licensed users instead of CSV.",
    )
    p.add_argument(
        "--from-json",
        type=Path,
        default=None,
        help="Load employees from JSON (see earlier format); overrides CSV.",
    )
    p.add_argument(
        "--emit-sql",
        type=Path,
        default=None,
        help="Write INSERT SQL to this path instead of connecting to the database.",
    )
    p.add_argument(
        "--on-conflict",
        choices=("skip", "update"),
        default="skip",
        help="skip = ON CONFLICT DO NOTHING; update = upsert by email.",
    )
    p.add_argument(
        "--on-graph-forbidden",
        action="store_true",
        help="If Graph /users returns 403, continue with zero employees instead of failing.",
    )
    args = p.parse_args()

    default_start = datetime.now(timezone.utc).date()
    seeds: list[EmployeeSeed] = []

    if args.from_json is not None:
        seeds = load_seeds_from_json(args.from_json.resolve(), default_start)
        print(f"Loaded {len(seeds)} row(s) from JSON {args.from_json}", file=sys.stderr)
    elif args.from_graph:
        tenant = os.environ.get("AZURE_TENANT_ID", "").strip()
        cid = os.environ.get("AZURE_CLIENT_ID", "").strip()
        secret = os.environ.get("AZURE_CLIENT_SECRET", "").strip()
        if not tenant or not cid or not secret:
            print("Missing AZURE_TENANT_ID, AZURE_CLIENT_ID, or AZURE_CLIENT_SECRET", file=sys.stderr)
            return 2
        token = acquire_graph_token(tenant, cid, secret)
        try:
            users = await graph_list_licensed_users(token)
        except RuntimeError as e:
            if args.on_graph_forbidden and "403" in str(e):
                print(
                    "Graph returned 403 (--on-graph-forbidden): zero employees.",
                    file=sys.stderr,
                )
                users = []
            else:
                raise
        print(f"Graph licensed users: {len(users)}", file=sys.stderr)
        seeds = graph_users_to_seeds(users, default_start)
    else:
        csv_path = (args.csv or default_employee_csv()).resolve()
        if not csv_path.is_file():
            print(
                f"No employee CSV at {csv_path}. Add the file or use --from-graph / --from-json.",
                file=sys.stderr,
            )
            return 2
        seeds = load_seeds_from_csv(csv_path, default_start)
        print(f"Loaded {len(seeds)} row(s) from {csv_path}", file=sys.stderr)

    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        print("Missing DATABASE_URL", file=sys.stderr)
        return 2
    dsn = normalize_database_url(dsn)

    if args.emit_sql:
        etype = "employeetype"
        estatus = "employeestatus"
        if seeds:
            conn = await asyncpg.connect(dsn)
            try:
                etype = await pg_enum_typname(conn, "employees", "employee_type")
                estatus = await pg_enum_typname(conn, "employees", "status")
            finally:
                await conn.close()
        emit_sql(seeds, args.emit_sql, etype, estatus, args.on_conflict)
        return 0

    await run_db(dsn, seeds, args.on_conflict)
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(async_main()))


if __name__ == "__main__":
    main()
