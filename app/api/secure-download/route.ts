import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

const db = getFirestore();

// Rate limiting store
const downloadLimitStore = new Map<
  string,
  { count: number; resetTime: number }
>();

function checkDownloadLimit(
  userId: string,
  maxDownloads = 5,
  windowMs = 60000
): boolean {
  const now = Date.now();
  const userLimit = downloadLimitStore.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    downloadLimitStore.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (userLimit.count >= maxDownloads) {
    return false;
  }

  userLimit.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    const { pdfId, authToken } = await request.json();
    const referer = request.headers.get("referer") || "";

    // Validate required parameters
    if (!pdfId || !authToken) {
      return new NextResponse("Missing required parameters", { status: 400 });
    }

    // Validate referer
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

    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;

    // Check download rate limit
    if (!checkDownloadLimit(userId, 5, 60000)) {
      // 5 downloads per minute
      return new NextResponse("Download rate limit exceeded", { status: 429 });
    }

    // Get PDF document from Firestore
    const pdfDoc = await db.collection("pdfs").doc(pdfId).get();

    if (!pdfDoc.exists) {
      return new NextResponse("PDF not found", { status: 404 });
    }

    const pdfData = pdfDoc.data();
    if (!pdfData) {
      return new NextResponse("PDF data not found", { status: 404 });
    }

    // Check if user has download permissions
    const isOwner = pdfData.ownerId === userId;

    // Check if user is in access list with download permission
    const accessUsers = pdfData.accessUsers || [];
    const userAccess = accessUsers.find(
      (access: string | { email: string; canSave: boolean }) => {
        if (typeof access === "string") {
          return access === userEmail;
        } else {
          return access.email === userEmail && access.canSave === true;
        }
      }
    );

    const hasDownloadPermission = isOwner || userAccess;

    if (!hasDownloadPermission) {
      return new NextResponse("Download not authorized", { status: 403 });
    }

    // Log the download attempt
    console.log("Secure Download Request:", {
      userId,
      userEmail,
      pdfId,
      pdfName: pdfData.name,
      isOwner,
      hasAccess: !!userAccess,
      timestamp: new Date().toISOString(),
    });

    // Generate a secure download token
    const downloadToken = `${pdfId}-${userId}-${Date.now()}`;

    // Return the secure download URL
    const downloadUrl = new URL(
      "/api/pdf-proxy",
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    );
    downloadUrl.searchParams.set("url", pdfData.url);
    downloadUrl.searchParams.set("token", authToken);
    downloadUrl.searchParams.set("pdfId", pdfId);
    downloadUrl.searchParams.set("t", Date.now().toString());
    downloadUrl.searchParams.set("download", "true");

    return NextResponse.json({
      success: true,
      downloadUrl: downloadUrl.toString(),
      fileName: pdfData.name || "document.pdf",
      downloadToken,
    });
  } catch (error) {
    console.error("Secure download error:", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Download failed",
      { status: 500 }
    );
  }
}
