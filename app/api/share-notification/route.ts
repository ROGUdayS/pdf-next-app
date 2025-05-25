import { NextResponse } from "next/server";
import { sendEmail, emailTemplates } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const { recipientEmail, pdfName, sharedByEmail, pdfUrl, allowSave } =
      await request.json();

    if (!recipientEmail || !pdfName || !sharedByEmail || !pdfUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Generate email content using template
    const emailContent = emailTemplates.shareNotification({
      sharedByEmail,
      pdfName,
      pdfUrl,
      allowSave,
    });

    // Send email using the shared utility with connection pooling
    await sendEmail({
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return NextResponse.json({ success: true });
  } catch (error: Error | unknown) {
    console.error("Error sending share notification:", error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to send share notification";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
