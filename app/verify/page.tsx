"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import { updateProfile } from "firebase/auth";

export default function VerifyEmail() {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  const { signUp } = useAuth();

  useEffect(() => {
    if (!email) {
      router.push("/signup");
      return;
    }

    // Check if we have signup data
    const signupData = sessionStorage.getItem("signupData");
    if (!signupData) {
      router.push("/signup");
      return;
    }

    // Start countdown
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [email, router]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const handleResendOTP = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send OTP");
      }

      // Reset countdown
      setCountdown(300);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otp) {
      setError("Please enter the verification code");
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Verify OTP
      const response = await fetch("/api/auth/send-otp", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid verification code");
      }

      // Get signup data from session storage
      const signupDataStr = sessionStorage.getItem("signupData");
      if (!signupDataStr) {
        throw new Error("Signup data not found");
      }

      const signupData = JSON.parse(signupDataStr);

      // Create the account
      const userCredential = await signUp(
        signupData.email,
        signupData.password
      );

      // Update the user's display name
      if (userCredential.user) {
        await updateProfile(userCredential.user, {
          displayName: `${signupData.firstName} ${signupData.lastName}`,
        });
      }

      // Clear signup data from session storage
      sessionStorage.removeItem("signupData");

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div className="text-center">
          <h2 className="mt-4 sm:mt-6 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Verify your email
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent a verification code to{" "}
            <span className="font-medium text-primary">{email}</span>
          </p>
        </div>

        <form
          className="mt-6 sm:mt-8 space-y-4 sm:space-y-6"
          onSubmit={handleVerify}
        >
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 sm:p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="otp"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Verification Code
            </label>
            <div className="mt-1">
              <Input
                id="otp"
                name="otp"
                type="text"
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="Enter 6-digit code"
                className="text-center text-2xl tracking-widest h-11 sm:h-12"
                maxLength={6}
              />
            </div>
          </div>

          <div>
            <Button
              type="submit"
              className="w-full h-11 sm:h-12"
              disabled={loading || countdown === 0}
            >
              {loading ? "Verifying..." : "Verify Email"}
            </Button>
          </div>

          <div className="text-center">
            {countdown > 0 ? (
              <p className="text-sm text-muted-foreground">
                Code expires in {formatTime(countdown)}
              </p>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={handleResendOTP}
                disabled={loading}
                className="text-primary hover:text-primary/80"
              >
                Resend verification code
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
