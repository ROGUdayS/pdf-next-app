import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import admin from "firebase-admin";
import "dotenv/config";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read .env.local file manually
const envPath = join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const envVars = Object.fromEntries(
  envContent
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"))
    .map((line) =>
      line.split("=").map((part) => part.trim().replace(/^["']|["']$/g, ""))
    )
);

// Add environment variables to process.env
Object.assign(process.env, envVars);

// Check if required environment variables are present
const requiredEnvVars = [
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "FIREBASE_PRIVATE_KEY_ID",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_CLIENT_ID",
  "FIREBASE_AUTH_URI",
  "FIREBASE_TOKEN_URI",
  "FIREBASE_AUTH_PROVIDER_X509_CERT_URL",
  "FIREBASE_CERT_URL",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
];

const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName]
);

if (missingEnvVars.length > 0) {
  console.error("Missing required environment variables:", missingEnvVars);
  process.exit(1);
}

// Create service account credential object from environment variables
const serviceAccount = {
  type: "service_account",
  project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CERT_URL,
};

// Initialize Firebase Admin
initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

async function deleteAllFiles() {
  try {
    const storage = getStorage();
    const bucket = storage.bucket();

    console.log("Fetching all files...");
    const [files] = await bucket.getFiles();

    console.log(`Found ${files.length} files. Deleting...`);
    const deletePromises = files.map((file) => {
      console.log(`Deleting ${file.name}...`);
      return file.delete();
    });

    await Promise.all(deletePromises);
    console.log("All files deleted successfully!");
  } catch (error) {
    console.error("Error deleting files:", error);
  }
}

deleteAllFiles();
