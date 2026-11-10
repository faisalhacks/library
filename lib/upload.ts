// Uploads one file to the private "files" bucket and reports progress.
// supabase-js uploads with fetch(), which can't report progress, so this sends
// the same request with XMLHttpRequest. It uses the logged-in user's token, so
// the same storage access rules apply.
export function uploadWithProgress(
  storagePath: string,
  file: File,
  accessToken: string,
  onProgress: (bytesSent: number) => void
): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/files/${encodedPath}`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText);
        message = body.message || body.error || message;
      } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}
