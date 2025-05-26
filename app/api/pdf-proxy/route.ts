import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(
  identifier: string,
  maxRequests = 10,
  windowMs = 60000
): boolean {
  const now = Date.now();
  const userLimit = rateLimitStore.get(identifier);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (userLimit.count >= maxRequests) {
    return false;
  }

  userLimit.count++;
  return true;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pdfUrl = searchParams.get("url");
    const authToken = searchParams.get("token");
    const pdfId = searchParams.get("pdfId");
    const timestamp = searchParams.get("t");
    const referer = request.headers.get("referer") || "";

    // Security validations
    if (!pdfUrl) {
      return new NextResponse("PDF URL is required", { status: 400 });
    }

    if (!authToken) {
      return new NextResponse("Authentication token is required", {
        status: 401,
      });
    }

    if (!pdfId || !timestamp) {
      return new NextResponse("Missing required parameters", { status: 400 });
    }

    // Validate referer to prevent direct access
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_APP_URL,
      "http://localhost:3000",
      "https://pdf-culture.netlify.app",
    ].filter(Boolean);

    const isValidReferer = allowedOrigins.some((origin) =>
      referer.startsWith(origin || "")
    );

    if (!isValidReferer && process.env.NODE_ENV === "production") {
      return new NextResponse("Invalid referer", { status: 403 });
    }

    // Verify Firebase token
    let decodedToken;
    try {
      const auth = getAuth();
      decodedToken = await auth.verifyIdToken(authToken);
    } catch (error) {
      console.error("Token verification failed:", error);
      return new NextResponse("Invalid authentication token", { status: 401 });
    }

    // Rate limiting per user
    const userId = decodedToken.uid;
    if (!checkRateLimit(userId, 20, 60000)) {
      // 20 requests per minute
      return new NextResponse("Rate limit exceeded", { status: 429 });
    }

    // Timestamp validation (prevent replay attacks)
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (now - requestTime > maxAge) {
      return new NextResponse("Request expired", { status: 410 });
    }

    console.log("Secure PDF Proxy Request:", {
      userId: decodedToken.uid,
      userEmail: decodedToken.email,
      pdfId,
      timestamp,
      requestTime: new Date().toISOString(),
    });

    // Forward the request with the auth token
    const response = await fetch(pdfUrl, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "User-Agent": "PDF-Sharing-App/1.0",
      },
    });

    if (!response.ok) {
      console.error("PDF fetch failed:", response.status, response.statusText);
      throw new Error(
        `Failed to fetch PDF: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();

    // Generate unique response identifier
    const responseId = `${pdfId}-${timestamp}-${Date.now()}`;

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        // Security headers
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        // Aggressive cache prevention
        "Cache-Control":
          "no-cache, no-store, must-revalidate, private, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        // Vary headers to prevent proxy caching
        Vary: "Authorization, Accept, Accept-Encoding, User-Agent",
        // Unique response identifier
        "X-PDF-Response-ID": responseId,
        // Additional cache busting
        "Last-Modified": new Date().toUTCString(),
        ETag: `"${responseId}"`,
        // CORS for specific origins only
        "Access-Control-Allow-Origin": isValidReferer
          ? referer.split("/").slice(0, 3).join("/")
          : "*",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  } catch (error) {
    console.error("PDF proxy error:", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Failed to fetch PDF",
      { status: 500 }
    );
  }
}
