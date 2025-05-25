import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getBaseUrl(): string {
  // In production, use the environment variable or fallback to the production domain
  if (process.env.NODE_ENV === "production") {
    return (
      process.env.NEXT_PUBLIC_BASE_URL || "https://pdf-culture.netlify.app"
    );
  }

  // In development, use localhost
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  // Fallback for server-side rendering in development
  return "http://localhost:3000";
}
