export type FileKind = "pdf" | "image" | "text" | "other";

// Color category shared by icons, labels and the graph:
// PDF red, doc blue, image green, note accent, anything else gray.
export type ColorKind = "pdf" | "doc" | "image" | "note" | "other" | "folder";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "heic"];
const TEXT_EXT = ["md", "markdown", "txt"];
const DOC_EXT = [
  ...TEXT_EXT,
  "doc", "docx", "odt", "rtf", "pages",
  "xls", "xlsx", "ods", "csv", "numbers",
  "ppt", "pptx", "odp", "key",
];

export function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

// Decide how a file can be previewed, from its MIME type or, failing that, its extension.
export function fileKind(name: string, contentType: string | null): FileKind {
  const ext = extension(name);
  const type = (contentType ?? "").toLowerCase();

  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.startsWith("image/") || IMAGE_EXT.includes(ext)) return "image";
  if (TEXT_EXT.includes(ext) || type === "text/plain" || type === "text/markdown") return "text";
  return "other";
}

export function colorKind(name: string, contentType: string | null): ColorKind {
  const kind = fileKind(name, contentType);
  if (kind === "pdf" || kind === "image") return kind;
  const type = (contentType ?? "").toLowerCase();
  if (
    DOC_EXT.includes(extension(name)) ||
    type.startsWith("text/") ||
    type.includes("word") ||
    type.includes("spreadsheet") ||
    type.includes("presentation") ||
    type.includes("opendocument")
  ) {
    return "doc";
  }
  return "other";
}

// Short label printed inside the file-type icon.
export function typeLabel(name: string, kind: ColorKind) {
  if (kind === "note") return "MD";
  if (kind === "pdf") return "PDF";
  const ext = extension(name);
  if (ext && ext.length <= 4) return ext.toUpperCase();
  if (kind === "image") return "IMG";
  if (kind === "doc") return "DOC";
  return "FILE";
}

export function formatBytes(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// Turn any name into something safe to use in a storage path or zip entry.
export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim() || "file";
}
