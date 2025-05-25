import nodemailer from "nodemailer";

// Create a single transporter instance with connection pooling
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
  // Enable connection pooling for better performance
  pool: true,
  // Maximum number of connections to keep open
  maxConnections: 5,
  // Maximum number of messages to send per connection
  maxMessages: 100,
  // Keep connections alive for 5 minutes
  rateDelta: 20000,
  rateLimit: 5,
  // Connection timeout
  connectionTimeout: 60000,
  // Socket timeout
  socketTimeout: 60000,
  // Enable debug logging in development
  debug: process.env.NODE_ENV === "development",
});

// Verify the transporter configuration on startup
transporter.verify((error: Error | null) => {
  if (error) {
    console.error("Email transporter verification failed:", error);
  } else {
    console.log("Email transporter is ready to send messages");
  }
});

export { transporter };

// Email templates
export const emailTemplates = {
  shareNotification: (data: {
    sharedByEmail: string;
    pdfName: string;
    pdfUrl: string;
    allowSave: boolean;
  }) => ({
    subject: `${data.sharedByEmail} shared a PDF with you: ${data.pdfName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">PDF Sharing</h2>
        <p>${data.sharedByEmail} has shared a PDF document with you:</p>
        <h3 style="color: #1F2937;">${data.pdfName}</h3>
        
        <div style="margin: 20px 0; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">
          <p style="margin: 0;">Access permissions:</p>
          <ul style="margin: 10px 0;">
            <li>View PDF ✓</li>
            ${
              data.allowSave
                ? "<li>Download and save PDF ✓</li>"
                : "<li>Download and save PDF ✗</li>"
            }
          </ul>
        </div>

        <a href="${
          data.pdfUrl
        }" style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px;">
          View PDF
        </a>

        <p style="margin-top: 20px; color: #6B7280; font-size: 14px;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `,
  }),

  otp: (data: { otp: string; type: "signup" | "password-reset" }) => {
    const subject =
      data.type === "password-reset"
        ? "Reset Your PDF Culture Password"
        : "Verify Your PDF Culture Email";

    const message =
      data.type === "password-reset"
        ? "To reset your password, enter this verification code:"
        : "To verify your email address, enter this verification code:";

    return {
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">PDF Culture</h2>
          <p>${message}</p>
          <h1 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px; text-align: center; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">${data.otp}</h1>
          <p>This code will expire in 5 minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    };
  },
};

// Helper function to send emails with error handling and retries
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  retries?: number;
}) {
  const { to, subject, html, retries = 2 } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html,
      });

      console.log(
        `Email sent successfully to ${to}, messageId: ${result.messageId}`
      );
      return result;
    } catch (error) {
      console.error(`Email send attempt ${attempt + 1} failed:`, error);

      if (attempt === retries) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
