// Column lists used by both server code (the signed-in layout) and browser code.
// They live in a plain module because server code can't read values exported
// from a "use client" file such as lib/workspace.tsx.

export const NOTE_COLUMNS = "id, title, folder_id, updated_by, updated_at, created_at";
export const FOLDER_COLUMNS = "id, name, parent_id, created_at";
export const FILE_COLUMNS =
  "id, name, storage_path, content_type, size_bytes, uploader_email, created_at, folder_id";
