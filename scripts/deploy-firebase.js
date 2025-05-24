import { execSync } from "child_process";

console.log("🚀 Starting Firebase deployment process...\n");

try {
  // Step 1: Set up environment variables
  console.log("📝 Setting up environment variables from Firebase config...");
  execSync("node scripts/setup-firebase-env.js", { stdio: "inherit" });

  // Step 2: Deploy to Firebase
  console.log("\n🔥 Deploying to Firebase...");
  execSync("firebase deploy", { stdio: "inherit" });

  console.log("\n✅ Firebase deployment completed successfully!");
  console.log("🌐 Your app should now be live on Firebase Hosting");
} catch (error) {
  console.error("\n❌ Deployment failed:", error.message);
  process.exit(1);
}
