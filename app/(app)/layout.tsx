import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FILE_COLUMNS, FOLDER_COLUMNS, NOTE_COLUMNS } from "@/lib/columns";
import {
  WorkspaceProvider,
  type FileItem,
  type Folder,
  type Member,
  type NoteMeta,
} from "@/lib/workspace";
import Shell from "@/components/shell";

// Shared layout for every signed-in page. It loads the library once on the
// server; after that, the sidebar and data stay in memory while you navigate.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [folders, files, notes, members] = await Promise.all([
    supabase.from("folders").select(FOLDER_COLUMNS).returns<Folder[]>(),
    supabase
      .from("files")
      .select(FILE_COLUMNS)
      .order("created_at", { ascending: false })
      .returns<FileItem[]>(),
    supabase
      .from("notes")
      .select(NOTE_COLUMNS)
      .order("updated_at", { ascending: false })
      .returns<NoteMeta[]>(),
    supabase.rpc("list_members"),
  ]);

  return (
    <WorkspaceProvider
      initial={{
        user: { id: user.id, email: user.email ?? "" },
        folders: folders.data ?? [],
        files: files.data ?? [],
        notes: notes.data ?? [],
        members: (members.data as Member[] | null) ?? [],
      }}
    >
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
