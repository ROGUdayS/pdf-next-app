import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Get the pathname of the request
  const path = request.nextUrl.pathname;

  // Define authentication pages
  const isAuthPage = path === "/signin" || path === "/signup";
  const isPublicPage = path === "/";

  // Get the token from the session cookie
  const token = request.cookies.get("__firebase_auth_token");

  // If the user is not authenticated and trying to access protected routes
  if (!token && path.startsWith("/dashboard")) {
    // Store the original URL to redirect back after authentication
    const redirectUrl = new URL("/signin", request.url);
    redirectUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(redirectUrl);
  }

  // If the user is authenticated and trying to access auth pages
  if (token && isAuthPage) {
    const redirectTo =
      request.nextUrl.searchParams.get("redirect") || "/dashboard";
    const redirectUrl = new URL(redirectTo, request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // If the user is authenticated and trying to access the home page
  if (token && isPublicPage) {
    const redirectUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/signin", "/signup"],
};
