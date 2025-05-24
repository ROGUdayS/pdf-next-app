"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PDFViewer from "@/app/components/PDFViewer";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { db, storage } from "@/lib/firebase";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { generatePdfThumbnail } from "@/app/utils/pdfjs";

interface SharedPdfData {
  id: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
  isPubliclyShared: boolean;
  thumbnailUrl: string | null;
  size: number;
  accessUsers: string[];
  ownerId: string;
  storagePath: string;
}

export default function SharedPDFPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [pdfData, setPdfData] = useState<SharedPdfData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPdfId, setSavedPdfId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Check if PDF is already saved in user's collection
  useEffect(() => {
    if (!user || !pdfData) return;

    const checkIfSaved = async () => {
      try {
        console.log("Checking if PDF is saved for user:", user.uid);
        // Query user's PDFs collection to check if this PDF is already saved
        const q = query(
          collection(db, "pdfs"),
          where("originalId", "==", params.id),
          where("savedBy", "==", user.uid)
        );
        const querySnapshot = await getDocs(q);
        console.log("Query results:", querySnapshot.size);

        if (!querySnapshot.empty) {
          const savedDoc = querySnapshot.docs[0];
          const savedData = savedDoc.data();
          console.log("Found saved PDF:", savedData);
          setIsSaved(true);
          setSavedPdfId(savedDoc.id);
          setNewName(savedData.name || "");
        } else {
          console.log("No saved PDF found");
          setIsSaved(false);
          setSavedPdfId(null);
          setNewName("");
        }
      } catch (err) {
        console.error("Error checking if PDF is saved:", err);
      }
    };

    checkIfSaved();
  }, [user, pdfData, params.id]);

  // Handle renaming saved PDF
  const handleRename = async () => {
    if (!savedPdfId || !newName.trim()) return;

    try {
      setIsRenaming(true);
      await updateDoc(doc(db, "pdfs", savedPdfId), {
        name: newName.trim(),
      });
      setNewName("");
      setIsRenaming(false);
      router.refresh();
    } catch (err) {
      console.error("Error renaming PDF:", err);
      setError("Failed to rename PDF");
      setIsRenaming(false);
    }
  };

  // Handle deleting saved PDF
  const handleDelete = async () => {
    if (!savedPdfId || !user) return;

    try {
      setIsDeleting(true);

      // Get the saved PDF document
      const savedPdfDoc = await getDocs(
        query(
          collection(db, "pdfs"),
          where("originalId", "==", params.id),
          where("savedBy", "==", user.uid)
        )
      );

      if (!savedPdfDoc.empty) {
        const savedPdf = savedPdfDoc.docs[0].data();

        // Delete thumbnail if it exists
        if (savedPdf.thumbnailPath) {
          const thumbnailRef = ref(storage, savedPdf.thumbnailPath);
          await deleteObject(thumbnailRef);
        }

        // Delete the Firestore document
        await deleteDoc(doc(db, "pdfs", savedPdfId));
      }

      setIsSaved(false);
      setSavedPdfId(null);
      setIsDeleting(false);
      router.refresh();
    } catch (err) {
      console.error("Error deleting PDF:", err);
      setError("Failed to delete PDF");
      setIsDeleting(false);
    }
  };

  // Handle saving PDF to user's collection
  const handleSaveToCollection = async () => {
    if (!user || !pdfData || isSaving || !params.id) return;

    try {
      setIsSaving(true);
      // Create a new document in the PDFs collection
      const newPdfRef = doc(collection(db, "pdfs"));

      // Generate thumbnail if not already available
      let thumbnailUrl = pdfData.thumbnailUrl;
      let thumbnailPath = null;

      if (!thumbnailUrl) {
        try {
          const newThumbnail = await generatePdfThumbnail(pdfData.url);
          if (newThumbnail) {
            const response = await fetch(newThumbnail);
            const blob = await response.blob();

            const thumbnailFileName = `${newPdfRef.id}.png`;
            thumbnailPath = `pdfs/${user.uid}/thumbnails/${thumbnailFileName}`;
            const thumbnailRef = ref(storage, thumbnailPath);

            await uploadBytes(thumbnailRef, blob, {
              contentType: "image/png",
              customMetadata: {
                pdfId: params.id.toString(),
                originalName: pdfData.name,
                originalOwnerId: pdfData.ownerId,
              },
            });

            thumbnailUrl = await getDownloadURL(thumbnailRef);
          }
        } catch (thumbnailError) {
          console.error("Error generating thumbnail:", thumbnailError);
        }
      }

      const savedPdfData = {
        name: pdfData.name,
        url: pdfData.url,
        uploadedBy: pdfData.uploadedBy,
        uploadedAt: new Date(),
        savedBy: user.uid,
        originalId: params.id.toString(),
        isPubliclyShared: false,
        accessUsers: [user.email],
        thumbnailUrl: thumbnailUrl,
        thumbnailPath: thumbnailPath,
        size: pdfData.size,
        ownerId: user.uid,
      };

      await setDoc(newPdfRef, savedPdfData);
      console.log("PDF saved successfully:", savedPdfData);
      setIsSaved(true);
      setSavedPdfId(newPdfRef.id);
      setNewName(pdfData.name);
    } catch (err) {
      console.error("Error saving PDF to collection:", err);
      setError("Failed to save PDF to your collection");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const fetchPdfData = async () => {
      try {
        const response = await fetch(`/api/shared-pdf/${params.id}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to load PDF");
        }
        const data = await response.json();
        setPdfData(data);
      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load PDF");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchPdfData();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !pdfData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500 mb-4">{error || "PDF not found"}</div>
        {!user && (
          <div className="mb-4">
            <button
              onClick={() => router.push("/login")}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Log in to access
            </button>
          </div>
        )}
        <Link href="/" className="text-blue-500 hover:text-blue-600 underline">
          Go to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col space-y-4 mb-6">
            {/* Original PDF Info */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {pdfData.name}
              </h1>
              <div className="text-sm text-gray-500">
                Shared by: {pdfData.uploadedBy}
              </div>
            </div>

            {/* Debug Info - Remove in production */}
            <div className="text-xs text-gray-400">
              Debug: isSaved: {isSaved ? "true" : "false"}, savedPdfId:{" "}
              {savedPdfId || "none"}
            </div>

            {/* Saved PDF Info and Actions */}
            {isSaved ? (
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">
                      Your Saved Copy
                    </h2>
                    <p className="text-sm text-gray-600">
                      Saved name: {newName || pdfData.name}
                    </p>
                  </div>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => {
                        console.log("Rename clicked");
                        setIsRenaming(true);
                      }}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center space-x-2"
                      disabled={isRenaming}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      <span>Rename</span>
                    </button>
                    <button
                      onClick={() => {
                        console.log("Delete clicked");
                        setIsDeleting(true);
                      }}
                      className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 flex items-center space-x-2"
                      disabled={isDeleting}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                Save this PDF to your collection to rename or delete your copy.
              </div>
            )}
          </div>

          {/* Rename Dialog */}
          {isRenaming && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-96">
                <h2 className="text-xl font-bold mb-4">Rename PDF</h2>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter new name"
                  className="w-full px-3 py-2 border rounded-md mb-4"
                  autoFocus
                />
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setIsRenaming(false);
                      setNewName("");
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRename}
                    disabled={!newName.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                  >
                    Rename
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Dialog */}
          {isDeleting && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-96">
                <h2 className="text-xl font-bold mb-4">Delete PDF</h2>
                <p className="mb-4">
                  Are you sure you want to delete this PDF from your saved
                  collection?
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setIsDeleting(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          <PDFViewer
            fileUrl={pdfData.url}
            onClose={() => router.push("/")}
            fileName={pdfData.name}
            canShare={false}
            isAuthenticated={!!user}
            canDownload={!!user}
            canOpenInNewTab={!!user}
            onLogin={() => router.push("/login")}
            onSaveToCollection={handleSaveToCollection}
            isSaved={isSaved}
          />
        </div>
      </div>
    </div>
  );
}
