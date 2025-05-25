import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase";
import redis from "@/lib/redis";
import { getAuth } from "firebase-admin/auth";
import { adminApp } from "@/lib/firebase-admin";

// Initialize Firebase Admin Auth
const adminAuth = getAuth(adminApp);

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    try {
      // Update the user's password directly using Firebase Admin SDK
      const user = await adminAuth.getUserByEmail(email);
      await adminAuth.updateUser(user.uid, {
        password: password,
      });

      return NextResponse.json({
        success: true,
        message: "Password updated successfully",
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: "Failed to update password. Please try again." },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
