"use client";

// Shared app state. It lives in the (app) layout, so it is loaded once and stays
// in memory while you move between pages. Every change (create, rename, move,
// delete) is sent to Supabase and then applied to this in-memory copy, instead
// of reloading everything.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeName } from "@/lib/file-kind";
import { uploadWithProgress } from "@/lib/upload";
import { FILE_COLUMNS, FOLDER_COLUMNS, NOTE_COLUMNS } from "@/lib/columns";

export { FILE_COLUMNS, FOLDER_COLUMNS, NOTE_COLUMNS };

export type User = { id: string; email: string };

// The people who can log in (from the list_members() database function).
export type Member = { id: string; email: string };

export type Folder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export type FileItem = {
  id: string;
  name: string;
  storage_path: string;
  content_type: string | null;
  size_bytes: number | null;
  uploader_email: string;
  created_at: string;
  folder_id: string | null;
};

// Note metadata only; the body is loaded by the editor and the graph when needed.
export type NoteMeta = {
  id: string;
  title: string;
  folder_id: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};


export type InitialData = {
  user: User;
  members: Member[];
  folders: Folder[];
  files: FileItem[];
  notes: NoteMeta[];
};

// Something in progress (upload, zip) or a short message, shown bottom-right.
export type Activity = {
  id: string;
  label: string;
  state: "running" | "done" | "error";
  progress?: number; // 0..1
  detail?: string;
};

export type ActivityHandle = {
  progress: (fraction: number, detail?: string) => void;
  done: (detail?: string) => void;
  fail: (detail: string) => void;
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

function useWorkspaceState(initial: InitialData) {
  const supabase = useMemo(() => createClient(), []);
  const [folders, setFolders] = useState(initial.folders);
  const [files, setFiles] = useState(initial.files);
  const [notes, setNotes] = useState(initial.notes);
  // Always-current copy, so several notes created in a row get distinct titles.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const [preview, setPreview] = useState<FileItem | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);

  // ---- Activity / messages -------------------------------------------------
  const removeActivity = useCallback((id: string) => {
    setActivity((list) => list.filter((a) => a.id !== id));
  }, []);

  const patchActivity = useCallback((id: string, patch: Partial<Activity>) => {
    setActivity((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const startActivity = useCallback(
    (label: string): ActivityHandle => {
      const id = crypto.randomUUID();
      setActivity((list) => [...list, { id, label, state: "running", progress: 0 }]);
      return {
        progress: (fraction, detail) => patchActivity(id, { progress: fraction, detail }),
        done: (detail) => {
          patchActivity(id, { state: "done", progress: 1, detail });
          setTimeout(() => removeActivity(id), 4000);
        },
        fail: (detail) => patchActivity(id, { state: "error", detail }),
      };
    },
    [patchActivity, removeActivity]
  );

  const notify = useCallback(
    (label: string, tone: "done" | "error" = "done") => {
      const id = crypto.randomUUID();
      setActivity((list) => [...list, { id, label, state: tone }]);
      setTimeout(() => removeActivity(id), tone === "error" ? 8000 : 3500);
    },
    [removeActivity]
  );

  // ---- Lookups -------------------------------------------------------------
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  const foldersIn = useCallback(
    (parentId: string | null) => folders.filter((f) => f.parent_id === parentId).sort(byName),
    [folders]
  );

  const filesIn = useCallback(
    (folderId: string | null) => files.filter((f) => f.folder_id === folderId),
    [files]
  );

  const notesIn = useCallback(
    (folderId: string | null) => notes.filter((n) => n.folder_id === folderId),
    [notes]
  );

  // Folders from the top level down to (and including) the given folder.
  const folderPath = useCallback(
    (id: string | null) => {
      const path: Folder[] = [];
      let current = id ? folderById.get(id) : undefined;
      while (current && path.length < 100) {
        path.unshift(current);
        current = current.parent_id ? folderById.get(current.parent_id) : undefined;
      }
      return path;
    },
    [folderById]
  );

  // The folder plus every folder nested inside it.
  const descendantIds = useCallback(
    (id: string) => {
      const ids = new Set([id]);
      let added = true;
      while (added) {
        added = false;
        for (const f of folders) {
          if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
            ids.add(f.id);
            added = true;
          }
        }
      }
      return ids;
    },
    [folders]
  );

  // ---- Folders -------------------------------------------------------------
  const createFolder = useCallback(
    async (name: string, parentId: string | null) => {
      const { data, error } = await supabase
        .from("folders")
        .insert({ name: name.trim(), parent_id: parentId })
        .select(FOLDER_COLUMNS)
        .single<Folder>();
      if (error || !data) throw new Error(error?.message ?? "Could not create folder");
      setFolders((list) => [...list, data]);
      return data;
    },
    [supabase]
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const { error } = await supabase.from("folders").update({ name: name.trim() }).eq("id", id);
      if (error) throw new Error(error.message);
      setFolders((list) => list.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)));
    },
    [supabase]
  );

  // ---- Files ---------------------------------------------------------------
  const addFile = useCallback((file: FileItem) => setFiles((list) => [file, ...list]), []);

  // Uploads several files (3 at a time) into a folder, with one combined
  // progress bar. Each file gets a storage object plus a metadata row.
  const uploadFiles = useCallback(
    async (list: File[], folderId: string | null) => {
      if (list.length === 0) return;
      const job = startActivity(
        list.length === 1 ? `Uploading "${list[0].name}"` : `Uploading ${list.length} files`
      );
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        job.fail("You are signed out. Reload the page and sign in again.");
        return;
      }

      const totalBytes = list.reduce((sum, f) => sum + f.size, 0) || 1;
      const sent = new Map<File, number>();
      let finished = 0;
      const failures: string[] = [];
      const report = () => {
        const bytes = [...sent.values()].reduce((a, b) => a + b, 0);
        job.progress(bytes / totalBytes, `${finished} of ${list.length} done`);
      };

      const queue = [...list];
      const worker = async () => {
        while (queue.length > 0) {
          const file = queue.shift()!;
          const storagePath = `${crypto.randomUUID()}/${safeName(file.name)}`;
          try {
            await uploadWithProgress(storagePath, file, session.access_token, (n) => {
              sent.set(file, n);
              report();
            });
            const { data, error } = await supabase
              .from("files")
              .insert({
                name: file.name,
                storage_path: storagePath,
                content_type: file.type || null,
                size_bytes: file.size,
                uploader_email: initial.user.email,
                folder_id: folderId,
              })
              .select(FILE_COLUMNS)
              .single<FileItem>();
            if (error || !data) {
              // Don't leave an object behind that no card points to.
              await supabase.storage.from("files").remove([storagePath]);
              throw new Error(error?.message ?? "Could not save file details");
            }
            setFiles((prev) => [data, ...prev]);
          } catch (err) {
            failures.push(`${file.name}: ${(err as Error).message}`);
            sent.set(file, file.size);
          }
          finished++;
          report();
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      if (failures.length > 0) job.fail(failures.join("; "));
      else job.done(list.length === 1 ? "Done" : `${list.length} files uploaded`);
    },
    [supabase, startActivity, initial.user.email]
  );

  const renameFile = useCallback(
    async (id: string, name: string) => {
      const { error } = await supabase.from("files").update({ name: name.trim() }).eq("id", id);
      if (error) throw new Error(error.message);
      setFiles((list) => list.map((f) => (f.id === id ? { ...f, name: name.trim() } : f)));
    },
    [supabase]
  );

  // Deletes stored objects, 100 at a time. The rows are already gone when this
  // runs, so a failure only leaves invisible leftovers; still, say so.
  const removeObjects = useCallback(
    async (paths: string[]) => {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await supabase.storage.from("files").remove(paths.slice(i, i + 100));
        if (error) throw new Error(`Deleted, but couldn't remove the stored data: ${error.message}`);
      }
    },
    [supabase]
  );

  // Removes the table rows first, then the stored objects. If the second part
  // fails, the worst case is an invisible leftover object, never a broken card.
  const deleteFiles = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const targets = files.filter((f) => ids.includes(f.id));
      const { error } = await supabase.from("files").delete().in("id", ids);
      if (error) throw new Error(error.message);
      setFiles((list) => list.filter((f) => !ids.includes(f.id)));
      setPreview((p) => (p && ids.includes(p.id) ? null : p));

      await removeObjects(targets.map((f) => f.storage_path));
    },
    [supabase, files, removeObjects]
  );

  const moveFiles = useCallback(
    async (ids: string[], folderId: string | null) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("files").update({ folder_id: folderId }).in("id", ids);
      if (error) throw new Error(error.message);
      setFiles((list) => list.map((f) => (ids.includes(f.id) ? { ...f, folder_id: folderId } : f)));
    },
    [supabase]
  );

  // Deletes the folder, its subfolders, and every file inside them. Asks the
  // database what is inside (not the in-memory copy), so files the other person
  // added a moment ago are included and the folder delete can't fail halfway.
  const deleteFolder = useCallback(
    async (id: string) => {
      const { data: allFolders, error: fErr } = await supabase
        .from("folders")
        .select("id, parent_id")
        .returns<{ id: string; parent_id: string | null }[]>();
      if (fErr) throw new Error(fErr.message);
      const ids = new Set([id]);
      for (let added = true; added; ) {
        added = false;
        for (const f of allFolders ?? []) {
          if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
            ids.add(f.id);
            added = true;
          }
        }
      }

      const { data: inside, error: iErr } = await supabase
        .from("files")
        .select("id, storage_path")
        .in("folder_id", [...ids])
        .returns<{ id: string; storage_path: string }[]>();
      if (iErr) throw new Error(iErr.message);
      const fileIds = (inside ?? []).map((f) => f.id);
      if (fileIds.length > 0) {
        const { error } = await supabase.from("files").delete().in("id", fileIds);
        if (error) throw new Error(error.message);
        setFiles((list) => list.filter((f) => !fileIds.includes(f.id)));
        setPreview((p) => (p && fileIds.includes(p.id) ? null : p));
      }

      const { error } = await supabase.from("folders").delete().eq("id", id);
      if (error) throw new Error(error.message);
      setFolders((list) => list.filter((f) => !ids.has(f.id)));
      // Notes inside were deleted by the database ("on delete cascade").
      setNotes((list) => list.filter((n) => !(n.folder_id && ids.has(n.folder_id))));

      await removeObjects((inside ?? []).map((f) => f.storage_path));
    },
    [supabase, removeObjects]
  );

  // Counts what a folder delete would remove, for the confirmation message.
  const folderContents = useCallback(
    (id: string) => {
      const ids = descendantIds(id);
      return {
        folders: ids.size - 1,
        files: files.filter((f) => f.folder_id && ids.has(f.folder_id)).length,
        notes: notes.filter((n) => n.folder_id && ids.has(n.folder_id)).length,
      };
    },
    [descendantIds, files, notes]
  );

  // ---- Notes ---------------------------------------------------------------
  // Picks "Untitled", "Untitled 2", ... so [[Title]] links stay unambiguous.
  const uniqueTitle = useCallback(
    (wanted: string) => {
      const taken = new Set(notesRef.current.map((n) => n.title.toLowerCase()));
      const base = wanted.trim() || "Untitled";
      if (!taken.has(base.toLowerCase())) return base;
      let i = 2;
      while (taken.has(`${base} ${i}`.toLowerCase())) i++;
      return `${base} ${i}`;
    },
    []
  );

  const createNote = useCallback(
    async (folderId: string | null, title = "Untitled", body = "") => {
      const { data, error } = await supabase
        .from("notes")
        .insert({ title: uniqueTitle(title), body, folder_id: folderId })
        .select(NOTE_COLUMNS)
        .single<NoteMeta>();
      if (error || !data) throw new Error(error?.message ?? "Could not create note");
      notesRef.current = [data, ...notesRef.current];
      setNotes((list) => [data, ...list]);
      return data;
    },
    [supabase, uniqueTitle]
  );

  // Called by the editor after each save, so lists and the tree stay current.
  const updateNoteMeta = useCallback((meta: NoteMeta) => {
    setNotes((list) => list.map((n) => (n.id === meta.id ? meta : n)));
  }, []);

  const renameNote = useCallback(
    async (id: string, title: string) => {
      const { data, error } = await supabase
        .from("notes")
        .update({ title: title.trim() })
        .eq("id", id)
        .select(NOTE_COLUMNS)
        .single<NoteMeta>();
      if (error || !data) throw new Error(error?.message ?? "Could not rename note");
      updateNoteMeta(data);
    },
    [supabase, updateNoteMeta]
  );

  const moveNotes = useCallback(
    async (ids: string[], folderId: string | null) => {
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from("notes")
        .update({ folder_id: folderId })
        .in("id", ids)
        .select(NOTE_COLUMNS)
        .returns<NoteMeta[]>();
      if (error) throw new Error(error.message);
      const moved = new Map((data ?? []).map((n) => [n.id, n]));
      setNotes((list) => list.map((n) => moved.get(n.id) ?? n));
    },
    [supabase]
  );

  const deleteNotes = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("notes").delete().in("id", ids);
      if (error) throw new Error(error.message);
      setNotes((list) => list.filter((n) => !ids.includes(n.id)));
    },
    [supabase]
  );


  // ---- Keep in sync with the other person ----------------------------------
  // When you come back to the tab (at most every 30 s), quietly reload the
  // list of folders and files so changes made by the other user show up.
  const lastSync = useRef(Date.now());
  const resync = useCallback(async () => {
    lastSync.current = Date.now();
    const [f, fi, n] = await Promise.all([
      supabase.from("folders").select(FOLDER_COLUMNS).returns<Folder[]>(),
      supabase.from("files").select(FILE_COLUMNS).order("created_at", { ascending: false }).returns<FileItem[]>(),
      supabase.from("notes").select(NOTE_COLUMNS).order("updated_at", { ascending: false }).returns<NoteMeta[]>(),
    ]);
    if (f.data) setFolders(f.data);
    if (fi.data) setFiles(fi.data);
    if (n.data) setNotes(n.data);
  }, [supabase]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastSync.current > 30_000) {
        resync();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [resync]);

  return {
    supabase,
    user: initial.user,
    members: initial.members,
    folders,
    files,
    notes,
    folderById,
    foldersIn,
    filesIn,
    notesIn,
    folderPath,
    descendantIds,
    folderContents,
    createFolder,
    renameFolder,
    deleteFolder,
    addFile,
    uploadFiles,
    renameFile,
    deleteFiles,
    moveFiles,
    createNote,
    updateNoteMeta,
    renameNote,
    moveNotes,
    deleteNotes,
    preview,
    openPreview: setPreview as (file: FileItem) => void,
    closePreview: useCallback(() => setPreview(null), []),
    activity,
    startActivity,
    notify,
    dismissActivity: removeActivity,
  };
}

export type Workspace = ReturnType<typeof useWorkspaceState>;

const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: InitialData;
  children: React.ReactNode;
}) {
  const value = useWorkspaceState(initial);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
