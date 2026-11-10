import FilesView from "@/components/files-view";

// /files shows the top level; /files?folder=<id> shows one folder.
export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { folder } = await searchParams;
  return <FilesView folderId={folder ?? null} />;
}
