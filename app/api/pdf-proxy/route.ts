import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pdfUrl = searchParams.get("url");
    const authToken = searchParams.get("token");
    const pdfId = searchParams.get("pdfId");
    const timestamp = searchParams.get("t");

    console.log("PDF Proxy Request:", {
      url: pdfUrl?.substring(0, 100) + "...", // Log first 100 chars for debugging
      pdfId,
      timestamp,
      hasToken: !!authToken,
      requestTime: new Date().toISOString(),
    });

    if (!pdfUrl) {
      return new NextResponse("PDF URL is required", { status: 400 });
    }

    if (!authToken) {
      return new NextResponse("Authentication token is required", {
        status: 401,
      });
    }

    // Forward the request with the auth token
    const response = await fetch(pdfUrl, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      console.error("PDF fetch failed:", response.status, response.statusText);
      throw new Error(
        `Failed to fetch PDF: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log("PDF fetched successfully:", {
      size: arrayBuffer.byteLength,
      pdfId,
      timestamp,
    });

    // Generate unique response identifier
    const responseId = `${pdfId}-${timestamp}-${Date.now()}`;

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Access-Control-Allow-Origin": "*",
        // Aggressive cache prevention
        "Cache-Control":
          "no-cache, no-store, must-revalidate, private, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
        // Vary headers to prevent proxy caching
        Vary: "Authorization, Accept, Accept-Encoding",
        // Unique response identifier
        "X-PDF-Response-ID": responseId,
        // Additional cache busting
        "Last-Modified": new Date().toUTCString(),
        ETag: `"${responseId}"`,
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
