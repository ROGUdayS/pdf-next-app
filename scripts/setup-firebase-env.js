import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Function to get Firebase config
function getFirebaseConfig() {
  try {
    const configOutput = execSync("firebase functions:config:get", {
      encoding: "utf8",
    });
    return JSON.parse(configOutput);
  } catch (error) {
    console.error("Error getting Firebase config:", error.message);
    return null;
  }
}

// Function to create environment variables from Firebase config
function createEnvFromFirebaseConfig() {
  const config = getFirebaseConfig();

  if (!config) {
    console.error("Could not retrieve Firebase config");
    return;
  }

  const envVars = [];

  // Map Firebase config to environment variables
  if (config.next_public) {
    envVars.push(
      `NEXT_PUBLIC_FIREBASE_API_KEY=${config.next_public.firebase_api_key}`
    );
    envVars.push(
      `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${config.next_public.firebase_auth_domain}`
    );
    envVars.push(
      `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${config.next_public.firebase_project_id}`
    );
    envVars.push(
      `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${config.next_public.firebase_storage_bucket}`
    );
    envVars.push(
      `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${config.next_public.firebase_messaging_sender_id}`
    );
    envVars.push(
      `NEXT_PUBLIC_FIREBASE_APP_ID=${config.next_public.firebase_app_id}`
    );
    envVars.push(
      `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${config.next_public.firebase_measurement_id}`
    );
  }

  if (config.email) {
    envVars.push(`EMAIL_USER=${config.email.user}`);
    envVars.push(`EMAIL_APP_PASSWORD=${config.email.app_password}`);
  }

  if (config.admin) {
    envVars.push(`FIREBASE_PRIVATE_KEY_ID=${config.admin.private_key_id}`);
    envVars.push(`FIREBASE_PRIVATE_KEY="${config.admin.private_key}"`);
    envVars.push(`FIREBASE_CLIENT_EMAIL=${config.admin.client_email}`);
    envVars.push(`FIREBASE_CLIENT_ID=${config.admin.client_id}`);
    envVars.push(`FIREBASE_AUTH_URI=${config.admin.auth_uri}`);
    envVars.push(`FIREBASE_TOKEN_URI=${config.admin.token_uri}`);
    envVars.push(
      `FIREBASE_AUTH_PROVIDER_X509_CERT_URL=${config.admin.auth_provider_x509_cert_url}`
    );
    envVars.push(`FIREBASE_CERT_URL=${config.admin.cert_url}`);
  }

  if (config.redis) {
    envVars.push(`REDIS_URL=${config.redis.url}`);
  }

  // Write to .env.production file
  const envContent = envVars.join("\n") + "\n";
  const envPath = path.join(process.cwd(), ".env.production");

  try {
    fs.writeFileSync(envPath, envContent);
    console.log(
      "✅ Environment variables set up successfully for Firebase deployment"
    );
    console.log(`📝 Created ${envPath} with ${envVars.length} variables`);
  } catch (error) {
    console.error("❌ Error writing environment file:", error.message);
  }
}

// Run the setup
createEnvFromFirebaseConfig();
