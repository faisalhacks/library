-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to re-run.

-- 1. Table that stores one row of metadata per uploaded file.
create table if not exists public.files (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,                 -- original filename, e.g. "report.pdf"
  storage_path   text not null unique,          -- where the file lives in the "files" bucket
  content_type   text,                          -- e.g. "application/pdf"
  size_bytes     bigint,
  uploader_email text not null,
  created_at     timestamptz not null default now()
);

-- 2. Row Level Security: only logged-in users can see or add rows.
alter table public.files enable row level security;

drop policy if exists "Logged-in users can list files" on public.files;
create policy "Logged-in users can list files"
  on public.files for select
  to authenticated
  using (true);

drop policy if exists "Logged-in users can add files as themselves" on public.files;
create policy "Logged-in users can add files as themselves"
  on public.files for insert
  to authenticated
  with check (uploader_email = (auth.jwt() ->> 'email'));

-- 3. Private storage bucket named "files" (not publicly readable).
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- 4. Storage policies: logged-in users can read and upload objects in that bucket.
drop policy if exists "Logged-in users can read library files" on storage.objects;
create policy "Logged-in users can read library files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'files');

drop policy if exists "Logged-in users can upload library files" on storage.objects;
create policy "Logged-in users can upload library files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'files');
