"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  getGraphAccessToken,
  graphScopesAllowWrite,
  parseGraphScopes,
} from "@/lib/msalGraph";
import { getFileIconForName } from "@/lib/graphDriveFileIcon";
import { graphCreateFolder, graphUploadFile } from "@/lib/graphDriveUpload";
import { opportunitiesApi } from "@/lib/api/opportunities";
import { lucideManilaFolderSolid } from "@/lib/manilaFolder";
import type { Opportunity } from "@/types/opportunity";
import {
  ArrowLeft,
  ExternalLink,
  Folder,
  FolderPlus,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";

interface GraphDriveItem {
  id: string;
  name: string;
  webUrl: string;
  folder?: Record<string, unknown>;
  file?: Record<string, unknown>;
}

async function fetchDriveChildren(
  accessToken: string,
  driveId: string,
  itemId: string
): Promise<GraphDriveItem[]> {
  const out: GraphDriveItem[] = [];
  let url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/children?$top=200`;
  while (url) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Microsoft Graph error ${r.status}: ${t.slice(0, 240)}`);
    }
    const data = (await r.json()) as { value?: GraphDriveItem[]; "@odata.nextLink"?: string };
    out.push(...(data.value || []));
    url = data["@odata.nextLink"] || "";
  }
  return out.sort((a, b) => {
    const da = a.folder ? 0 : 1;
    const db = b.folder ? 0 : 1;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

interface OpportunityDocumentsTabProps {
  opportunity: Opportunity;
  onOpportunityUpdated: () => void;
}

export function OpportunityDocumentsTab({
  opportunity,
  onOpportunityUpdated,
}: OpportunityDocumentsTabProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stack, setStack] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<GraphDriveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const canWrite = graphScopesAllowWrite();
  const parentItemId =
    stack.length === 0 ? opportunity.sharepoint_item_id : stack[stack.length - 1].id;

  const loadChildren = useCallback(async () => {
    if (!opportunity.sharepoint_drive_id || !parentItemId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let token: string;
      try {
        token = await getGraphAccessToken(user?.email);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("NEXT_PUBLIC_AZURE")) {
          setConfigError(msg);
          setLoading(false);
          return;
        }
        throw e;
      }
      setConfigError(null);
      const rows = await fetchDriveChildren(
        token,
        opportunity.sharepoint_drive_id!,
        parentItemId
      );
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [opportunity.sharepoint_drive_id, parentItemId, user?.email]);

  useEffect(() => {
    if (opportunity.sharepoint_drive_id && opportunity.sharepoint_item_id) {
      void loadChildren();
    }
  }, [
    opportunity.sharepoint_drive_id,
    opportunity.sharepoint_item_id,
    parentItemId,
    loadChildren,
  ]);

  const reprovision = useMutation({
    mutationFn: () => opportunitiesApi.reprovisionSharepoint(opportunity.id),
    onSuccess: () => onOpportunityUpdated(),
  });

  const getToken = useCallback(async () => {
    return getGraphAccessToken(user?.email);
  }, [user?.email]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length || !opportunity.sharepoint_drive_id || !parentItemId) {
      return;
    }
    setBusyAction(true);
    setError(null);
    try {
      const token = await getToken();
      for (const file of Array.from(list)) {
        await graphUploadFile(token, opportunity.sharepoint_drive_id, parentItemId, file);
      }
      await loadChildren();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(false);
      e.target.value = "";
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !opportunity.sharepoint_drive_id || !parentItemId) {
      return;
    }
    setBusyAction(true);
    setError(null);
    try {
      const token = await getToken();
      await graphCreateFolder(token, opportunity.sharepoint_drive_id, parentItemId, name);
      setFolderDialogOpen(false);
      setNewFolderName("");
      await loadChildren();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(false);
    }
  };

  if (!process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || !process.env.NEXT_PUBLIC_AZURE_TENANT_ID) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600">
          Set <code className="text-xs bg-gray-100 px-1 rounded">NEXT_PUBLIC_AZURE_CLIENT_ID</code>{" "}
          and{" "}
          <code className="text-xs bg-gray-100 px-1 rounded">NEXT_PUBLIC_AZURE_TENANT_ID</code> in
          the frontend environment to browse SharePoint files with your Microsoft account.
        </CardContent>
      </Card>
    );
  }

  if (!opportunity.sharepoint_folder_web_url || !opportunity.sharepoint_drive_id || !opportunity.sharepoint_item_id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-gray-700">
            No SharePoint folder is linked to this opportunity yet.
            {opportunity.sharepoint_provisioning_error && (
              <span className="block mt-2 text-red-700 text-xs whitespace-pre-wrap">
                {opportunity.sharepoint_provisioning_error}
              </span>
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reprovision.isPending}
            onClick={() => reprovision.mutate()}
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            {reprovision.isPending ? "Retrying…" : "Retry link to SharePoint"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Documents (SharePoint)</CardTitle>
        <div className="flex flex-wrap gap-2 items-center">
          {stack.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStack((s) => s.slice(0, -1))}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Up
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            disabled={!canWrite || busyAction || loading}
            onChange={(e) => void handleFileChange(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canWrite || busyAction || loading}
            title={
              canWrite
                ? "Upload files to the current folder (replaces same file name)"
                : "Add Files.ReadWrite.All (or Sites.ReadWrite.All) to scopes and Entra delegated permissions"
            }
            onClick={() => fileInputRef.current?.click()}
          >
            {busyAction ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1" />
            )}
            Upload
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canWrite || busyAction || loading}
            title={
              canWrite
                ? "Create a subfolder"
                : "Add Files.ReadWrite.All (or Sites.ReadWrite.All) to scopes and Entra delegated permissions"
            }
            onClick={() => setFolderDialogOpen(true)}
          >
            <FolderPlus className="w-4 h-4 mr-1" />
            New folder
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadChildren()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reprovision.isPending}
            onClick={() => reprovision.mutate()}
            title="Re-runs backend provisioning (e.g. switch from a Documents subfolder to a document library)"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            {reprovision.isPending ? "Retrying…" : "Retry link to SharePoint"}
          </Button>
          <a
            href={opportunity.sharepoint_folder_web_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-sm text-blue-600 hover:underline"
          >
            Open folder in SharePoint
            <ExternalLink className="w-3 h-3 ml-1" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Scopes: {parseGraphScopes().join(", ")}.{" "}
          <strong>Refresh</strong> reloads the list; <strong>Upload</strong> / <strong>New folder</strong> need write
          scopes (e.g. <code className="text-[11px] bg-gray-100 px-0.5 rounded">Files.ReadWrite.All</code>) plus the
          same delegated permission in Entra — you may be prompted to consent again after changing{" "}
          <code className="text-[11px] bg-gray-100 px-0.5 rounded">NEXT_PUBLIC_GRAPH_SCOPES</code>.
        </p>
        {!canWrite && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Upload and new folder are disabled: set{" "}
            <code className="text-xs bg-amber-100 px-1 rounded">NEXT_PUBLIC_GRAPH_SCOPES</code> to include{" "}
            <code className="text-xs bg-amber-100 px-1 rounded">Files.ReadWrite.All</code> (or{" "}
            <code className="text-xs bg-amber-100 px-1 rounded">Sites.ReadWrite.All</code>), add that{" "}
            <strong>delegated</strong> permission in Entra, grant consent, rebuild the frontend, then sign in again.
          </p>
        )}
        {opportunity.sharepoint_provisioning_error && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 whitespace-pre-wrap">
            {opportunity.sharepoint_provisioning_error}
          </p>
        )}
        {configError && <p className="text-sm text-red-700">{configError}</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {(loading || busyAction) && (
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            {busyAction ? "Working with SharePoint…" : "Loading…"}
          </p>
        )}
        {!loading && !busyAction && !error && items.length === 0 && (
          <p className="text-sm text-gray-600">This folder is empty.</p>
        )}
        {!loading && items.length > 0 && (
          <ul className="border rounded-md divide-y text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                {it.folder ? (
                  <button
                    type="button"
                    className="flex items-center gap-2 min-w-0 text-left text-blue-700 hover:underline flex-1"
                    onClick={() => setStack((s) => [...s, { id: it.id, name: it.name }])}
                  >
                    <Folder className="w-4 h-4 shrink-0" {...lucideManilaFolderSolid} />
                    <span className="truncate">{it.name}</span>
                  </button>
                ) : (
                  (() => {
                    const { Icon, className } = getFileIconForName(it.name);
                    return (
                      <a
                        href={it.webUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 min-w-0 flex-1 text-blue-700 hover:underline"
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${className}`} />
                        <span className="truncate">{it.name}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 ml-auto text-gray-500" />
                      </a>
                    );
                  })()
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen} contentClassName="max-w-md w-full">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>Create a folder in the current location ({stack.map((s) => s.name).join(" / ") || "library root"}).</DialogDescription>
        </DialogHeader>
        <DialogContent>
          <Input
            placeholder="Folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreateFolder();
            }}
            autoFocus
          />
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setFolderDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!newFolderName.trim() || busyAction}
            onClick={() => void handleCreateFolder()}
          >
            {busyAction ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
