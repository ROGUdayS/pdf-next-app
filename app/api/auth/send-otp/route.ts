import { NextResponse } from "next/server";
import { sendEmail, emailTemplates } from "@/lib/email";
import { auth } from "@/lib/firebase";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { getAuth } from "firebase-admin/auth";
import { adminApp } from "@/lib/firebase-admin";
import redis from "@/lib/redis";

// Initialize Firebase Admin Auth
const adminAuth = getAuth(adminApp);

// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Check if account exists using Firebase Admin SDK
async function checkAccountExists(email: string) {
  try {
    // First try using fetchSignInMethodsForEmail
    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods.length > 0) {
      return true;
    }

    // If no methods found, try using Admin SDK
    try {
      await adminAuth.getUserByEmail(email);
      return true;
    } catch (adminError: unknown) {
      if (
        adminError &&
        typeof adminError === "object" &&
        "code" in adminError &&
        adminError.code === "auth/user-not-found"
      ) {
        return false;
      }
      // For any other error, assume user exists to be safe
      return true;
    }
  } catch {
    // If there's any error in the main try block, assume user exists to be safe
    return true;
  }
}

export async function POST(request: Request) {
  try {
    const { email, type = "signup" } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    let shouldSendOTP = true;

    // For password reset, check if account exists but always proceed
    if (type === "password-reset") {
      try {
        const accountExists = await checkAccountExists(email);
        shouldSendOTP = accountExists;
      } catch {
        // If there's an error checking Firebase, we'll still try to send the OTP
        shouldSendOTP = true;
      }
    }

    // Generate OTP
    const otp = generateOTP();

    if (shouldSendOTP) {
      // Store OTP in Redis with 5-minute expiration
      const key = `otp:${email}`;

      try {
        await redis.set(key, otp, "EX", 300);

        // Verify the OTP was stored
        const storedOTP = await redis.get(key);

        if (!storedOTP || storedOTP !== otp) {
          throw new Error("Failed to store OTP in Redis");
        }
      } catch {
        throw new Error("Failed to store OTP. Please try again.");
      }

      // Generate email content using template
      const emailContent = emailTemplates.otp({
        otp,
        type: type as "signup" | "password-reset",
      });

      // Send email using the shared utility with connection pooling
      await sendEmail({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
      });
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send OTP" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email and OTP are required" },
        { status: 400 }
      );
    }

    try {
      // Get OTP from Redis
      const key = `otp:${email}`;
      const storedOTP = await redis.get(key);

      if (!storedOTP) {
        return NextResponse.json(
          { error: "No OTP found for this email or OTP has expired" },
          { status: 400 }
        );
      }

      if (storedOTP !== otp) {
        return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
      }

      // Delete the OTP after successful verification
      await redis.del(key);

      return NextResponse.json({ success: true });
    } catch {
      throw new Error("Failed to verify OTP. Please try again.");
    }
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to verify OTP",
      },
      { status: 500 }
    );
  }
}
