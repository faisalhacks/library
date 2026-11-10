// Builds a .zip in the browser. Files are fetched straight from Supabase
// Storage through short-lived signed links, so nothing passes through a Vercel
// function. Folder structure is kept, and notes are added as .md files.

import { downloadZip } from "client-zip";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileItem, Folder, NoteMeta } from "@/lib/workspace";
import { noteFilename, saveBlob } from "@/lib/download";

type Entry =
  | { kind: "folder"; path: string }
  | { kind: "file"; path: string; file: FileItem }
  | { kind: "note"; path: string; note: NoteMeta };

export type ZipSelection = { folders: Folder[]; files: FileItem[]; notes: NoteMeta[] };

export type ZipSource = {
  foldersIn: (id: string | null) => Folder[];
  filesIn: (id: string | null) => FileItem[];
  notesIn: (id: string | null) => NoteMeta[];
};

const clean = (name: string) => name.replace(/[\\/:*?"<>|]/g, "_").trim() || "untitled";

// Lists every entry with its path inside the zip, renaming duplicates "name (2).ext".
export function planZip(selection: ZipSelection, source: ZipSource): Entry[] {
  const entries: Entry[] = [];
  const used = new Set<string>();

  const unique = (dir: string, name: string) => {
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = dir + name;
    for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${dir}${stem} (${i})${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };

  const addFolder = (folder: Folder, dir: string, depth: number) => {
    const path = unique(dir, clean(folder.name)) + "/";
    const subfolders = source.foldersIn(folder.id);
    const files = source.filesIn(folder.id);
    const notes = source.notesIn(folder.id);
    if (subfolders.length + files.length + notes.length === 0) entries.push({ kind: "folder", path });
    if (depth > 50) return;
    for (const f of files) entries.push({ kind: "file", path: unique(path, clean(f.name)), file: f });
    for (const n of notes) entries.push({ kind: "note", path: unique(path, noteFilename(n.title)), note: n });
    for (const sub of subfolders) addFolder(sub, path, depth + 1);
  };

  for (const f of selection.files) entries.push({ kind: "file", path: unique("", clean(f.name)), file: f });
  for (const n of selection.notes) entries.push({ kind: "note", path: unique("", noteFilename(n.title)), note: n });
  for (const folder of selection.folders) addFolder(folder, "", 0);
  return entries;
}

type SaveTarget = { write: (response: Response) => Promise<void>; toDisk: boolean };

type SaveFilePicker = (options: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableStream> }>;

// Must be called directly from a click, before any other await: Chrome and Edge
// then let us stream the zip straight to disk. Other browsers build it in memory.
export async function chooseSaveTarget(filename: string): Promise<SaveTarget | null> {
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }],
      });
      const writable = await handle.createWritable();
      return { write: (response) => response.body!.pipeTo(writable), toDisk: true };
    } catch (err) {
      if ((err as Error).name === "AbortError") return null; // user cancelled
      // Any other problem: fall back to the in-memory download below.
    }
  }
  return { write: async (response) => saveBlob(await response.blob(), filename), toDisk: false };
}

export async function writeZip(
  supabase: SupabaseClient,
  entries: Entry[],
  target: SaveTarget,
  onProgress: (fraction: number, detail: string) => void
) {
  const fileEntries = entries.filter((e): e is Extract<Entry, { kind: "file" }> => e.kind === "file");
  const noteEntries = entries.filter((e): e is Extract<Entry, { kind: "note" }> => e.kind === "note");

  // Signed links (valid 1 hour) for every file, 100 at a time.
  const urls = new Map<string, string>();
  const paths = fileEntries.map((e) => e.file.storage_path);
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await supabase.storage.from("files").createSignedUrls(paths.slice(i, i + 100), 3600);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }

  // Note bodies, 100 at a time.
  const bodies = new Map<string, string>();
  const noteIds = noteEntries.map((e) => e.note.id);
  for (let i = 0; i < noteIds.length; i += 100) {
    const { data, error } = await supabase.from("notes").select("id, body").in("id", noteIds.slice(i, i + 100));
    if (error) throw new Error(error.message);
    for (const n of data ?? []) bodies.set(n.id, n.body);
  }

  const totalBytes = fileEntries.reduce((sum, e) => sum + (e.file.size_bytes ?? 0), 0) || 1;
  let bytesDone = 0;
  let filesDone = 0;
  const report = () =>
    onProgress(Math.min(1, bytesDone / totalBytes), `${filesDone} of ${fileEntries.length} files`);

  async function* inputs() {
    for (const entry of entries) {
      if (entry.kind === "folder") {
        yield { name: entry.path };
      } else if (entry.kind === "note") {
        yield {
          name: entry.path,
          input: bodies.get(entry.note.id) ?? "",
          lastModified: new Date(entry.note.updated_at),
        };
      } else {
        const url = urls.get(entry.file.storage_path);
        if (!url) throw new Error(`Missing link for ${entry.file.name}`);
        const res = await fetch(url);
        if (!res.ok || !res.body) throw new Error(`Couldn't download ${entry.file.name} (${res.status})`);
        // Count bytes as they stream through, for the progress bar.
        const counted = res.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              bytesDone += chunk.byteLength;
              report();
              controller.enqueue(chunk);
            },
            flush() {
              filesDone++;
              report();
            },
          })
        );
        yield { name: entry.path, input: counted, lastModified: new Date(entry.file.created_at) };
      }
    }
  }

  report();
  await target.write(downloadZip(inputs()));
}
