import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { FirebaseError } from "firebase/app";

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    // Await the params to satisfy Next.js 14 requirements
    const { id } = await Promise.resolve(context.params);

    // Get the PDF document from Firestore
    const pdfDoc = await getDoc(doc(db, "pdfs", id));

    if (!pdfDoc.exists()) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    const pdfData = pdfDoc.data();

    // Check if the PDF is publicly shared or if the user has access
    const isPubliclyShared = pdfData.isPubliclyShared === true;

    if (!isPubliclyShared) {
      // If not publicly shared, check if user has access through email
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user || !pdfData.accessUsers.includes(user.email)) {
        return NextResponse.json(
          { error: "You do not have access to this PDF" },
          { status: 403 }
        );
      }
    }

    // Return the PDF data
    return NextResponse.json({
      id: pdfDoc.id,
      name: pdfData.name,
      url: pdfData.url,
      uploadedBy: pdfData.uploadedBy,
      uploadedAt: pdfData.uploadedAt,
      isPubliclyShared: pdfData.isPubliclyShared,
      size: pdfData.size || 0,
      thumbnailUrl: pdfData.thumbnailUrl || null,
      accessUsers: pdfData.accessUsers || [],
      ownerId: pdfData.ownerId,
      storagePath: pdfData.storagePath,
    });
  } catch (error) {
    console.error("Error fetching shared PDF:", error);

    if (error instanceof FirebaseError) {
      if (error.code === "permission-denied") {
        return NextResponse.json(
          { error: "You do not have access to this PDF" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
