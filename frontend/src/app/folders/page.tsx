"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FolderMinus, FolderOpen, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { PageLoading } from "@/components/app/page-state";
import { GenerationCard } from "@/components/app/generation-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/lib/auth-client";
import { fetchGenerations, type GenerationSummary } from "@/lib/generations";

type Folder = { id: string; name: string; task_count: number };

async function readError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch { /* ignore */ }
  return fallback;
}

export default function FoldersPage() {
  const { data: session, isPending } = useSession();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tasks, setTasks] = useState<GenerationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<Folder | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [foldersResponse, nextTasks] = await Promise.all([
      fetch("/api/folders", { cache: "no-store" }),
      fetchGenerations(),
    ]);
    if (!foldersResponse.ok) throw new Error(await readError(foldersResponse, "Failed to load folders"));
    const data = await foldersResponse.json();
    setFolders((data.folders || []) as Folder[]);
    setTasks(nextTasks);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load folders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id, load]);

  const openFolder = useMemo(() => folders.find((folder) => folder.id === openId) ?? null, [folders, openId]);
  const inFolder = useMemo(() => tasks.filter((task) => task.folder_id === openId), [tasks, openId]);
  const available = useMemo(() => tasks.filter((task) => task.folder_id !== openId), [tasks, openId]);

  const run = async (action: () => Promise<Response>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await action();
      if (!response.ok) throw new Error(await readError(response, fallback));
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    const name = newName.trim();
    if (!name) return;
    const ok = await run(
      () => fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
      "Could not create the folder",
    );
    if (ok) setNewName("");
  };

  const renameFolder = async () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (!name) return;
    const ok = await run(
      () => fetch(`/api/folders/${renaming.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }),
      "Could not rename the folder",
    );
    if (ok) setRenaming(null);
  };

  const deleteFolder = async () => {
    if (!deleting) return;
    const target = deleting;
    const ok = await run(() => fetch(`/api/folders/${target.id}`, { method: "DELETE" }), "Could not delete the folder");
    if (ok) {
      setDeleting(null);
      if (openId === target.id) setOpenId(null);
    }
  };

  const moveTasks = (taskIds: string[], folderId: string | null) =>
    run(
      () => fetch("/api/folders/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task_ids: taskIds, folder_id: folderId }) }),
      "Could not move the videos",
    );

  const addPicked = async () => {
    if (!openId || pickedIds.length === 0) return;
    const ok = await moveTasks(pickedIds, openId);
    if (ok) { setAdding(false); setPickedIds([]); }
  };

  if (isPending || loading) return <PageLoading />;

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center">
        <h1 className="mb-4 text-3xl font-bold">Sign In Required</h1>
        <Link href="/sign-in"><Button size="lg">Sign In</Button></Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {openFolder ? (
        <>
          <button type="button" onClick={() => setOpenId(null)} className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />All folders
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">{openFolder.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{inFolder.length} {inFolder.length === 1 ? "video" : "videos"} stored in this folder</p>
            </div>
            <Button onClick={() => { setPickedIds([]); setAdding(true); }} disabled={available.length === 0}>
              <Plus className="size-4" aria-hidden />Add videos
            </Button>
          </div>
          {error && <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
          {inFolder.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              This folder is empty. Use “Add videos” to move your generations here.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {inFolder.map((task) => (
                <div key={task.id} className="space-y-2">
                  <GenerationCard generation={task} showStatus />
                  <div className="flex gap-2">
                    {task.source_type !== "youtube" && (
                      <Button asChild variant="outline" size="sm" className="flex-1">
                        <a href={`/api/folders/original/${task.id}`} download><Download className="size-3.5" aria-hidden />Original</a>
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => void moveTasks([task.id], null)}>
                      <FolderMinus className="size-3.5" aria-hidden />Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold tracking-tight">Folders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organize your videos and clips. Everything you upload stays stored on the server.</p>
          <form
            className="mt-6 flex max-w-md gap-2"
            onSubmit={(event) => { event.preventDefault(); void createFolder(); }}
          >
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={80} placeholder="New folder name" aria-label="New folder name" />
            <Button type="submit" disabled={busy || !newName.trim()}><FolderPlus className="size-4" aria-hidden />Create folder</Button>
          </form>
          {error && <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert>}
          {folders.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No folders yet. Create your first folder above.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {folders.map((folder) => (
                <div key={folder.id} className="group relative rounded-2xl border bg-background p-4 transition-colors hover:border-foreground/20">
                  <button type="button" onClick={() => setOpenId(folder.id)} className="flex w-full items-center gap-3 text-left">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-muted"><FolderOpen className="size-5" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{folder.name}</span>
                      <span className="block text-xs text-muted-foreground">{folder.task_count} {folder.task_count === 1 ? "video" : "videos"}</span>
                    </span>
                  </button>
                  <div className="absolute right-2 top-2 flex gap-1">
                    <button type="button" aria-label={`Rename ${folder.name}`} onClick={() => { setRenaming(folder); setRenameValue(folder.name); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" aria-label={`Delete ${folder.name}`} onClick={() => setDeleting(folder)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={Boolean(renaming)} onOpenChange={(open) => { if (!open) setRenaming(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription>Choose a new name for this folder.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => { event.preventDefault(); void renameFolder(); }}>
            <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={80} aria-label="Folder name" autoFocus />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
              <Button type="submit" disabled={busy || !renameValue.trim()}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add videos</DialogTitle>
            <DialogDescription>Select the generations to move into “{openFolder?.name}”.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {available.map((task) => (
              <li key={task.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-accent">
                  <Checkbox
                    checked={pickedIds.includes(task.id)}
                    onCheckedChange={() => setPickedIds((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id])}
                  />
                  <span className="line-clamp-2 flex-1">{task.source_title}</span>
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button onClick={() => void addPicked()} disabled={busy || pickedIds.length === 0}>Add to folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this folder?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder “{deleting?.name}” will be removed. Your videos are not deleted; they just leave the folder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteFolder()}>Delete folder</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
