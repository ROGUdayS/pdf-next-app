"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  UserCredential,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<UserCredential>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  pdfStats: {
    ownedCount: number;
    sharedCount: number;
    recentPdfs: RecentPdf[];
    storageUsed: number;
  };
}

interface RecentPdf {
  id: string;
  name: string;
  uploadedAt: Date;
  uploadedBy: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfStats, setPdfStats] = useState({
    ownedCount: 0,
    sharedCount: 0,
    recentPdfs: [] as RecentPdf[],
    storageUsed: 0,
  });
  const router = useRouter();

  useEffect(() => {
    // Set a minimum loading time to ensure Firebase has time to restore auth state
    const minLoadingTime = setTimeout(() => {
      // This will be cleared if auth state is determined earlier
    }, 1000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Clear the minimum loading timeout since we have auth state
      clearTimeout(minLoadingTime);

      setUser(user);

      if (!user) {
        setPdfStats({
          ownedCount: 0,
          sharedCount: 0,
          recentPdfs: [],
          storageUsed: 0,
        });
        // Remove the token cookie
        document.cookie =
          "__firebase_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";

        setLoading(false);

        // If on a protected page, redirect to signin
        if (window.location.pathname.startsWith("/dashboard")) {
          router.push("/signin");
        }
        return;
      }

      try {
        // Get the ID token
        const token = await user.getIdToken();

        // Store the token in a cookie with proper settings
        document.cookie = `__firebase_auth_token=${token}; path=/; max-age=3600; SameSite=Strict; Secure`;

        // If on an auth page, redirect to dashboard
        if (
          window.location.pathname === "/signin" ||
          window.location.pathname === "/signup"
        ) {
          router.push("/dashboard");
        }

        setLoading(false);
      } catch (error) {
        console.error("Error getting ID token:", error);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      clearTimeout(minLoadingTime);
    };
  }, [router]);

  useEffect(() => {
    let unsubscribeOwned: (() => void) | null = null;
    let unsubscribeShared: (() => void) | null = null;
    let unsubscribeRecent: (() => void) | null = null;

    if (user) {
      console.log("Auth state:", {
        uid: user.uid,
        email: user.email,
        isAnonymous: user.isAnonymous,
        emailVerified: user.emailVerified,
      });

      // Listen for owned PDFs count and storage used
      const ownedQuery = query(
        collection(db, "pdfs"),
        where("ownerId", "==", user.uid)
      );
      unsubscribeOwned = onSnapshot(
        ownedQuery,
        (snapshot) => {
          const ownedCount = snapshot.size;
          const storageUsed = snapshot.docs.reduce((total, doc) => {
            const data = doc.data();
            return total + (data.size || 0);
          }, 0);

          console.log("Owned PDFs query result:", {
            size: ownedCount,
            storageUsed: storageUsed,
          });

          setPdfStats((prev) => ({
            ...prev,
            ownedCount: ownedCount,
            storageUsed: storageUsed,
          }));
        },
        (error: FirebaseError) => {
          console.error("Error in owned PDFs query:", error);
        }
      );

      // Listen for shared PDFs count - get all PDFs and filter client-side
      const allPdfsQuery = query(collection(db, "pdfs"));
      unsubscribeShared = onSnapshot(
        allPdfsQuery,
        (snapshot) => {
          // Filter for PDFs where user has access but is not the owner
          const sharedPdfsCount = snapshot.docs.filter((doc) => {
            const data = doc.data();

            // Skip if this is the user's own PDF
            if (data.ownerId === user.uid) return false;

            const accessUsers = data.accessUsers || [];

            // Check both old format (string array) and new format (object array)
            return accessUsers.some(
              (userAccess: string | { email: string; canSave: boolean }) => {
                if (typeof userAccess === "string") {
                  return userAccess === user.email;
                } else {
                  return userAccess.email === user.email;
                }
              }
            );
          }).length;

          console.log("Shared PDFs query result:", {
            total: snapshot.size,
            sharedByOthers: sharedPdfsCount,
          });
          setPdfStats((prev) => ({ ...prev, sharedCount: sharedPdfsCount }));
        },
        (error: FirebaseError) => {
          console.error("Error in shared PDFs query:", error);
        }
      );

      // Listen for recent PDFs - get all PDFs and filter client-side
      const recentPdfsQuery = query(
        collection(db, "pdfs"),
        orderBy("uploadedAt", "desc")
      );
      unsubscribeRecent = onSnapshot(
        recentPdfsQuery,
        (snapshot) => {
          // Filter for PDFs where user has access
          const filteredDocs = snapshot.docs.filter((doc) => {
            const data = doc.data();
            const accessUsers = data.accessUsers || [];

            // Check both old format (string array) and new format (object array)
            return accessUsers.some(
              (userAccess: string | { email: string; canSave: boolean }) => {
                if (typeof userAccess === "string") {
                  return userAccess === user.email;
                } else {
                  return userAccess.email === user.email;
                }
              }
            );
          });

          console.log("Recent PDFs query result:", {
            size: filteredDocs.length,
          });
          const recentPdfs = filteredDocs.slice(0, 3).map((doc) => ({
            id: doc.id,
            name: doc.data().name,
            uploadedAt: doc.data().uploadedAt.toDate(),
            uploadedBy: doc.data().uploadedBy,
          }));
          setPdfStats((prev) => ({ ...prev, recentPdfs }));
        },
        (error: FirebaseError) => {
          console.error("Error in recent PDFs query:", error);
        }
      );
    } else {
      console.log("No user authenticated");
    }

    return () => {
      if (unsubscribeOwned) unsubscribeOwned();
      if (unsubscribeShared) unsubscribeShared();
      if (unsubscribeRecent) unsubscribeRecent();
    };
  }, [user]);

  const signUp = async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      return userCredential;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      throw new Error(errorMessage);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      throw new Error(errorMessage);
    }
  };

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      throw new Error(errorMessage);
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
      router.push("/");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "An unknown error occurred";
      throw new Error(errorMessage);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        logout,
        pdfStats,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
