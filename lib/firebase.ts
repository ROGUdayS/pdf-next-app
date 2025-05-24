import {
  initializeApp,
  getApps,
  FirebaseOptions,
  FirebaseApp,
} from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import {
  getFirestore,
  FirestoreError,
  Firestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { getAnalytics, Analytics } from "firebase/analytics";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Debug: Log config values (without sensitive data)
console.log("Firebase Config Check:", {
  hasApiKey: !!firebaseConfig.apiKey,
  hasAuthDomain: !!firebaseConfig.authDomain,
  hasProjectId: !!firebaseConfig.projectId,
  hasStorageBucket: !!firebaseConfig.storageBucket,
  hasMessagingSenderId: !!firebaseConfig.messagingSenderId,
  hasAppId: !!firebaseConfig.appId,
});

// Check if all required config values are present
const requiredConfig = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

const missingConfig = requiredConfig.filter((key) => !firebaseConfig[key]);
if (missingConfig.length > 0) {
  throw new Error(
    `Missing required Firebase configuration: ${missingConfig.join(", ")}`
  );
}

// Initialize Firebase
let app: FirebaseApp;
try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    console.log("Firebase App initialized successfully");
  } else {
    app = getApps()[0];
    console.log("Using existing Firebase App");
  }
} catch (error) {
  console.error("Error initializing Firebase:", error);
  throw error;
}

// Initialize services with error handling
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let analytics: Analytics | null = null;

try {
  auth = getAuth(app);
  console.log("Firebase Auth initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase Auth:", error);
  throw error;
}

try {
  db = getFirestore(app);
  // Enable offline persistence
  if (typeof window !== "undefined") {
    // Only enable in browser environment
    enableIndexedDbPersistence(db).catch((err: FirestoreError) => {
      if (err.code === "failed-precondition") {
        // Multiple tabs open, persistence can only be enabled in one tab at a time.
        console.log("Persistence failed: Multiple tabs open");
      } else if (err.code === "unimplemented") {
        // The current browser doesn't support persistence
        console.log("Persistence not supported by browser");
      }
    });
  }
  console.log("Firestore initialized successfully");
} catch (error) {
  console.error("Error initializing Firestore:", error);
  throw error;
}

try {
  storage = getStorage(app);
  console.log("Firebase Storage initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase Storage:", error);
  throw error;
}

// Initialize Analytics only in browser environment
if (typeof window !== "undefined") {
  try {
    analytics = getAnalytics(app);
    console.log("Firebase Analytics initialized successfully");
  } catch (error) {
    console.warn("Error initializing Firebase Analytics:", error);
  }
}

export { app, auth, db, storage, analytics };
