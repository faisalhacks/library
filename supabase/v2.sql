-- File Library v2: folders, notes, tasks, rename/delete rules, Realtime.
-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Requires setup.sql to have been run first. Safe to re-run.
--
-- Access model: the two people who can log in ("authenticated") can see and change
-- everything. Logged-out visitors ("anon") get nothing: every table has row-level
-- security with policies only for the authenticated role.

-- ---------------------------------------------------------------------------
-- 1. Folders
-- ---------------------------------------------------------------------------
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  parent_id  uuid references public.folders (id) on delete cascade,  -- null = top level
  created_at timestamptz not null default now()
);
create index if not exists folders_parent_id_idx on public.folders (parent_id);

alter table public.folders enable row level security;

drop policy if exists "Logged-in users can list folders" on public.folders;
create policy "Logged-in users can list folders"
  on public.folders for select to authenticated using (true);

drop policy if exists "Logged-in users can create folders" on public.folders;
create policy "Logged-in users can create folders"
  on public.folders for insert to authenticated with check (true);

drop policy if exists "Logged-in users can rename folders" on public.folders;
create policy "Logged-in users can rename folders"
  on public.folders for update to authenticated using (true) with check (true);

drop policy if exists "Logged-in users can delete folders" on public.folders;
create policy "Logged-in users can delete folders"
  on public.folders for delete to authenticated using (true);

grant select, insert, delete on public.folders to authenticated;
-- Only the name can be edited (folders can't be moved, so no loops are possible).
revoke update on public.folders from authenticated;
grant update (name) on public.folders to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Files: folder, rename, move, delete
-- ---------------------------------------------------------------------------
alter table public.files
  add column if not exists folder_id uuid references public.folders (id);
-- No "on delete cascade" on purpose: a folder can only be deleted after the app
-- has removed its files from Storage, so no stored file is ever left orphaned.
create index if not exists files_folder_id_idx on public.files (folder_id);

drop policy if exists "Logged-in users can rename and move files" on public.files;
create policy "Logged-in users can rename and move files"
  on public.files for update to authenticated using (true) with check (true);

drop policy if exists "Logged-in users can delete files" on public.files;
create policy "Logged-in users can delete files"
  on public.files for delete to authenticated using (true);

grant select, insert, delete on public.files to authenticated;
-- Only the display name and folder can change; uploader and storage path stay fixed.
revoke update on public.files from authenticated;
grant update (name, folder_id) on public.files to authenticated;

-- Storage: allow deleting objects in the "files" bucket (needed for file delete).
drop policy if exists "Logged-in users can delete library files" on storage.objects;
create policy "Logged-in users can delete library files"
  on storage.objects for delete to authenticated using (bucket_id = 'files');

-- ---------------------------------------------------------------------------
-- 3. Notes (markdown)
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Untitled',
  body       text not null default '',                               -- raw markdown
  folder_id  uuid references public.folders (id) on delete cascade,  -- null = top level
  updated_by text,                                                   -- email, set automatically
  updated_at timestamptz not null default now(),                     -- set automatically
  created_at timestamptz not null default now()
);
create index if not exists notes_folder_id_idx on public.notes (folder_id);

alter table public.notes enable row level security;

drop policy if exists "Logged-in users can read notes" on public.notes;
create policy "Logged-in users can read notes"
  on public.notes for select to authenticated using (true);

drop policy if exists "Logged-in users can create notes" on public.notes;
create policy "Logged-in users can create notes"
  on public.notes for insert to authenticated with check (true);

drop policy if exists "Logged-in users can edit notes" on public.notes;
create policy "Logged-in users can edit notes"
  on public.notes for update to authenticated using (true) with check (true);

drop policy if exists "Logged-in users can delete notes" on public.notes;
create policy "Logged-in users can delete notes"
  on public.notes for delete to authenticated using (true);

grant select, insert, delete on public.notes to authenticated;
revoke update on public.notes from authenticated;
grant update (title, body, folder_id) on public.notes to authenticated;

-- Every insert/update stamps who changed the note and when. The editor's
-- collision guard relies on updated_at changing on every save.
create or replace function public.stamp_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end;
$$;

drop trigger if exists notes_stamp on public.notes;
create trigger notes_stamp
  before insert or update on public.notes
  for each row execute function public.stamp_note();

-- ---------------------------------------------------------------------------
-- 4. Tasks (tracker)
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(trim(title)) > 0),
  status     text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  assignee   uuid references auth.users (id) on delete set null,  -- null = both of us
  due_date   date,
  created_at timestamptz not null default now()
);
create index if not exists tasks_status_idx on public.tasks (status);

alter table public.tasks enable row level security;

drop policy if exists "Logged-in users can read tasks" on public.tasks;
create policy "Logged-in users can read tasks"
  on public.tasks for select to authenticated using (true);

drop policy if exists "Logged-in users can create tasks" on public.tasks;
create policy "Logged-in users can create tasks"
  on public.tasks for insert to authenticated with check (true);

drop policy if exists "Logged-in users can edit tasks" on public.tasks;
create policy "Logged-in users can edit tasks"
  on public.tasks for update to authenticated using (true) with check (true);

drop policy if exists "Logged-in users can delete tasks" on public.tasks;
create policy "Logged-in users can delete tasks"
  on public.tasks for delete to authenticated using (true);

grant select, insert, update, delete on public.tasks to authenticated;

-- Realtime: broadcast task changes so the other person sees them immediately.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Member list (for the task assignee dropdown and "mine" filter)
-- ---------------------------------------------------------------------------
-- The app can't read Supabase's internal user list directly, so this function
-- returns just id + email, and only to logged-in users.
create or replace function public.list_members()
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text from auth.users u order by u.email;
$$;

revoke all on function public.list_members() from public, anon;
grant execute on function public.list_members() to authenticated;
