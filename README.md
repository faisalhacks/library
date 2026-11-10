# Library

Private workspace for two people: files, markdown notes, folders, a graph view and a task tracker.
Next.js (App Router) + Supabase (Auth, Storage, Postgres, Realtime).

## Setup

1. Supabase → **SQL Editor**: run `supabase/setup.sql`, then `supabase/v2.sql`. Both are safe to re-run.
2. Supabase → **Authentication → Users → Add user**: create both people (tick **Auto Confirm User**).
3. Copy the Project URL and anon (or publishable) key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
4. `npm install`, then `npm run dev`, and open http://localhost:3000.

## Features

- **Files**: folders and subfolders, upload (button or drag from the desktop, several at once, with progress),
  rename, move (drag onto a folder or "Move to…"), delete, grid/list, sort, filter, multi-select.
- **Preview**: PDFs, images, .md/.txt open in a side panel; other types download.
- **Notes**: markdown editor with live preview, autosave, "edited by" info, and a guard against
  overwriting the other person's changes. `[[Note Title]]` links other notes. Download as .md;
  uploading a .md offers to import it as a note.
- **Zip**: download a selection or a whole folder as a .zip, built in the browser.
- **Graph**: folders, files and notes as a force-directed graph, including `[[links]]` between notes.
- **Tracker**: tasks with status, assignee and due date; changes appear live for the other person.
- **Themes**: light and dark ("Slate"), following the system setting until you choose.

## Where things are

| Path | What |
| --- | --- |
| `app/(app)/layout.tsx` | Signed-in shell; loads folders, files, notes and members once |
| `lib/workspace.tsx` | Shared in-memory store and all data changes |
| `components/` | UI: shell, folder tree, files view, note editor, graph, tracker, home |
| `lib/zip.ts`, `lib/upload.ts` | In-browser zip, upload with progress |
| `app/api/files/[id]/route.ts` | Short-lived signed download links |
| `proxy.ts` | Redirects logged-out visitors to `/login` |
| `supabase/*.sql` | Database, storage and access rules |
