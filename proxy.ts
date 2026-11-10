import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before every page request: keeps the Supabase session fresh and
// sends anyone who isn't logged in to /login.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const onLoginPage = request.nextUrl.pathname.startsWith("/login");

  // Redirects must carry any session cookies Supabase just refreshed.
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && !onLoginPage) return redirectTo("/login");
  if (user && onLoginPage) return redirectTo("/");

  return response;
}

export const config = {
  // Skip Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
