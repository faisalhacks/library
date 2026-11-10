import NoteEditor from "@/components/note-editor";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key={id} gives each note a fresh editor when you switch between notes.
  return <NoteEditor key={id} id={id} />;
}
