import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Create a transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

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

    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipientEmail,
      subject: `${sharedByEmail} shared a PDF with you: ${pdfName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">PDF Sharing</h2>
          <p>${sharedByEmail} has shared a PDF document with you:</p>
          <h3 style="color: #1F2937;">${pdfName}</h3>
          
          <div style="margin: 20px 0; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">
            <p style="margin: 0;">Access permissions:</p>
            <ul style="margin: 10px 0;">
              <li>View PDF ✓</li>
              ${
                allowSave
                  ? "<li>Download and save PDF ✓</li>"
                  : "<li>Download and save PDF ✗</li>"
              }
            </ul>
          </div>

          <a href="${pdfUrl}" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px;">
            View PDF
          </a>

          <p style="margin-top: 20px; color: #6B7280; font-size: 14px;">
            This is an automated message. Please do not reply to this email.
          </p>
        </div>
      `,
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
