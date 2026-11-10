import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/files/<id>: downloads the file under its original name.
// The bucket is private, so we create a short-lived signed link and redirect to it.
// (Previews don't use this route: the preview panel fetches the file directly.)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: file, error } = await supabase
    .from("files")
    .select("name, storage_path")
    .eq("id", id)
    .single();
  if (error || !file) {
    return new NextResponse("File not found", { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("files")
    .createSignedUrl(file.storage_path, 60, { download: file.name });
  if (signError || !signed) {
    return new NextResponse("Could not create link", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
