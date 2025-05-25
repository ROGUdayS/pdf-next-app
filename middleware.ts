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

  // If the user is authenticated and trying to access auth pages, redirect to dashboard
  if (token && isAuthPage) {
    const redirectTo =
      request.nextUrl.searchParams.get("redirect") || "/dashboard";
    const redirectUrl = new URL(redirectTo, request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // If the user is authenticated and trying to access the home page, redirect to dashboard
  if (token && isPublicPage) {
    const redirectUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // For dashboard routes without a token, let the client-side handle the redirect
  // This prevents the middleware from being too aggressive and allows proper loading states
  if (!token && path.startsWith("/dashboard")) {
    // Only redirect if this is a direct navigation (not a client-side navigation)
    const isDirectNavigation = !request.headers.get("x-middleware-prefetch");
    if (isDirectNavigation) {
      const redirectUrl = new URL("/signin", request.url);
      redirectUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/signin", "/signup"],
};
