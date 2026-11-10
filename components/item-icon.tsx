import { colorKind, typeLabel, type ColorKind } from "@/lib/file-kind";
import { FolderIcon } from "./icons";

// Colored square showing the file type (PDF red, doc blue, image green, note accent).
export function TypeIcon({ kind, label, small }: { kind: ColorKind; label: string; small?: boolean }) {
  return (
    <span className={`type-icon kind-${kind}${small ? " small" : ""}`} aria-hidden="true">
      {kind === "folder" ? <FolderIcon size={small ? 14 : 18} /> : label}
    </span>
  );
}

export function FileTypeIcon({
  name,
  contentType,
  small,
}: {
  name: string;
  contentType: string | null;
  small?: boolean;
}) {
  const kind = colorKind(name, contentType);
  return <TypeIcon kind={kind} label={typeLabel(name, kind)} small={small} />;
}

export function NoteTypeIcon({ small }: { small?: boolean }) {
  return <TypeIcon kind="note" label="MD" small={small} />;
}

export function FolderTypeIcon({ small }: { small?: boolean }) {
  return <TypeIcon kind="folder" label="" small={small} />;
}
