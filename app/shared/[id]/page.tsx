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
  getDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";

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
  allowSave: boolean;
  linkAllowSave?: boolean;
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
  const [userCanSave, setUserCanSave] = useState(false);

  // Check if PDF is already saved in user's collection
  useEffect(() => {
    if (!user || !pdfData) return;

    const checkIfSaved = async () => {
      try {
        console.log("Checking if PDF is saved for user:", user.uid);
        // Query user's PDFs collection to check if this PDF is already saved
        const q = query(
          collection(db, "pdfs"),
          where("originalId", "==", pdfData.id),
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
    if (!savedPdfId || !newName.trim() || !user || !pdfData) return;
    const pdfId = pdfData.id;
    if (!pdfId) return;

    try {
      setIsRenaming(true);

      // Get the current saved PDF data
      const savedPdfDoc = await getDocs(
        query(
          collection(db, "pdfs"),
          where("originalId", "==", pdfId),
          where("savedBy", "==", user.uid)
        )
      );

      if (!savedPdfDoc.empty) {
        const savedPdf = savedPdfDoc.docs[0].data();

        // Create new storage paths with new name
        const newFileName = `${Date.now()}-${newName.trim()}${
          newName.toLowerCase().endsWith(".pdf") ? "" : ".pdf"
        }`;
        const newStoragePath = `pdfs/${user.uid}/${newFileName}`;

        console.log("Renaming saved PDF:", {
          oldPath: savedPdf.storagePath,
          newPath: newStoragePath,
          pdfId: savedPdfId,
          userId: user.uid,
        });

        // Get the old file and create new reference
        const oldFileRef = ref(storage, savedPdf.storagePath);
        const newFileRef = ref(storage, newStoragePath);

        try {
          // Download the old file
          console.log("Downloading old file from:", savedPdf.url);
          const oldFileBlob = await (await fetch(savedPdf.url)).blob();
          console.log("Old file downloaded, size:", oldFileBlob.size);

          // Upload to new location
          console.log("Uploading to new location:", newStoragePath);
          await uploadBytes(newFileRef, oldFileBlob, {
            contentType: "application/pdf",
            customMetadata: {
              originalPdfId: pdfId,
              originalName: newName.trim(),
              originalOwnerId: savedPdf.ownerId,
            },
          });
          console.log("Upload completed");

          // Get the new URL
          const newUrl = await getDownloadURL(newFileRef);
          console.log("New URL obtained:", newUrl);

          // Delete the old file
          console.log("Deleting old file:", savedPdf.storagePath);
          await deleteObject(oldFileRef);
          console.log("Old file deleted");

          // Update in Firestore
          console.log("Updating Firestore document");
          await updateDoc(doc(db, "pdfs", savedPdfId), {
            name: newName.trim(),
            url: newUrl,
            storagePath: newStoragePath,
          });
          console.log("Firestore document updated");

          // Also rename the thumbnail if it exists
          if (savedPdf.thumbnailPath) {
            console.log("Renaming thumbnail:", {
              oldPath: savedPdf.thumbnailPath,
              newPath: `pdfs/${user.uid}/thumbnails/${savedPdfId}.png`,
            });
            const oldThumbnailRef = ref(storage, savedPdf.thumbnailPath);
            const newThumbnailFileName = `${savedPdfId}.png`;
            const newThumbnailPath = `pdfs/${user.uid}/thumbnails/${newThumbnailFileName}`;
            const newThumbnailRef = ref(storage, newThumbnailPath);

            // Download and upload thumbnail with new name
            const thumbnailBlob = await (
              await fetch(savedPdf.thumbnailUrl)
            ).blob();
            await uploadBytes(newThumbnailRef, thumbnailBlob, {
              contentType: "image/png",
              customMetadata: {
                pdfId: savedPdfId,
                originalName: newName.trim(),
                originalOwnerId: savedPdf.ownerId,
              },
            });

            // Get new thumbnail URL
            const newThumbnailUrl = await getDownloadURL(newThumbnailRef);

            // Delete old thumbnail
            await deleteObject(oldThumbnailRef);

            // Update thumbnail info in Firestore
            await updateDoc(doc(db, "pdfs", savedPdfId), {
              thumbnailUrl: newThumbnailUrl,
              thumbnailPath: newThumbnailPath,
            });
          }
        } catch (renameError) {
          console.error("Error renaming PDF:", renameError);
          setError("Failed to rename PDF");
          setIsRenaming(false);
          return;
        }
      }

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
    const pdfId = params.id?.toString();
    if (!pdfId) return;

    try {
      setIsDeleting(true);

      // Get the saved PDF document
      const savedPdfDoc = await getDocs(
        query(
          collection(db, "pdfs"),
          where("originalId", "==", pdfId),
          where("savedBy", "==", user.uid)
        )
      );

      if (!savedPdfDoc.empty) {
        const savedPdf = savedPdfDoc.docs[0].data();

        // Delete the PDF file from storage if it exists
        if (savedPdf.storagePath) {
          const pdfRef = ref(storage, savedPdf.storagePath);
          await deleteObject(pdfRef);
        }

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
    if (!user || !pdfData || isSaving) return;
    const pdfId = pdfData.id;
    if (!pdfId) return;

    try {
      setIsSaving(true);
      setError(null);

      // Check if already saved
      const savedQuery = query(
        collection(db, "pdfs"),
        where("originalId", "==", pdfId),
        where("savedBy", "==", user.uid)
      );
      const savedSnapshot = await getDocs(savedQuery);

      if (!savedSnapshot.empty) {
        setError("You have already saved this PDF");
        setTimeout(() => setError(null), 3000);
        return;
      }

      // Create a new document in the PDFs collection
      const firestoreDocRef = doc(collection(db, "pdfs"));

      // First, download the PDF file
      const pdfResponse = await fetch(pdfData.url);
      const pdfBlob = await pdfResponse.blob();

      // Create a new storage path for the user's copy
      const fileName = `${Date.now()}-${pdfData.name}`;
      const newStoragePath = `pdfs/${user.uid}/${fileName}`;
      const storageRef = ref(storage, newStoragePath);

      // Upload the PDF to the user's storage bucket
      await uploadBytes(storageRef, pdfBlob, {
        contentType: "application/pdf",
        customMetadata: {
          originalPdfId: pdfId,
          originalName: pdfData.name,
          originalOwnerId: pdfData.ownerId,
        },
      });

      // Get the URL for the new PDF
      const newPdfUrl = await getDownloadURL(storageRef);

      // Handle thumbnail
      let thumbnailUrl = null;
      let thumbnailPath = null;

      // If original has thumbnail, copy it
      if (pdfData.thumbnailUrl) {
        try {
          const thumbnailResponse = await fetch(pdfData.thumbnailUrl);
          const thumbnailBlob = await thumbnailResponse.blob();

          const thumbnailFileName = `${firestoreDocRef.id}.png`;
          thumbnailPath = `pdfs/${user.uid}/thumbnails/${thumbnailFileName}`;
          const thumbnailRef = ref(storage, thumbnailPath);

          await uploadBytes(thumbnailRef, thumbnailBlob, {
            contentType: "image/png",
            customMetadata: {
              pdfId: firestoreDocRef.id,
              originalName: pdfData.name,
              originalOwnerId: pdfData.ownerId,
            },
          });

          thumbnailUrl = await getDownloadURL(thumbnailRef);
        } catch (thumbnailError) {
          console.error("Error copying thumbnail:", thumbnailError);
        }
      }

      const savedPdfData = {
        name: pdfData.name,
        url: newPdfUrl,
        uploadedBy: pdfData.uploadedBy,
        uploadedAt: new Date(),
        savedBy: user.uid,
        originalId: pdfId,
        isPubliclyShared: false,
        accessUsers: [user.email],
        thumbnailUrl: thumbnailUrl,
        thumbnailPath: thumbnailPath,
        size: pdfData.size,
        ownerId: user.uid,
        storagePath: newStoragePath,
        allowSave: pdfData.allowSave,
      };

      await setDoc(firestoreDocRef, savedPdfData);
      console.log("PDF saved successfully:", savedPdfData);
      setIsSaved(true);
      setSavedPdfId(firestoreDocRef.id);
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
      if (!params.id) return;

      try {
        setIsLoading(true);
        setError(null);

        let pdfSnapshot;
        let actualPdfId = params.id.toString();

        // First, try to get the PDF document directly (for backward compatibility with old links)
        const directPdfDoc = doc(db, "pdfs", params.id.toString());
        const directSnapshot = await getDoc(directPdfDoc);

        if (directSnapshot.exists()) {
          // Direct PDF ID found (old format)
          pdfSnapshot = directSnapshot;
        } else {
          // Not found directly, search by shareId (new format)
          const q = query(
            collection(db, "pdfs"),
            where("shareId", "==", params.id.toString())
          );
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            // Found PDF by shareId
            pdfSnapshot = querySnapshot.docs[0];
            actualPdfId = pdfSnapshot.id;
          } else {
            setError("PDF not found or link has expired");
            setIsLoading(false);
            return;
          }
        }

        if (!pdfSnapshot.exists()) {
          setError("PDF not found");
          setIsLoading(false);
          return;
        }

        const data = pdfSnapshot.data();

        // ACCESS CONTROL LOGIC:
        // 1. Check if PDF is publicly shared OR user has explicit access
        // 2. For non-authenticated users: only allow if publicly shared
        // 3. For authenticated users: allow if publicly shared OR in accessUsers OR is owner

        const isOwner = user?.uid === data.ownerId;

        // Handle both old format (string array) and new format (object array)
        const accessUsers = data.accessUsers || [];
        const userAccess = user?.email
          ? accessUsers.find(
              (userAccess: string | { email: string; canSave: boolean }) => {
                if (typeof userAccess === "string") {
                  return userAccess === user.email;
                } else {
                  return userAccess.email === user.email;
                }
              }
            )
          : null;

        const hasExplicitAccess = !!userAccess;
        const isPubliclyShared = data.isPubliclyShared === true;

        // Determine save permissions based on access type:
        // Use the HIGHEST permission level available to the user
        // 1. Owner always can save
        // 2. Compare explicit access vs public link access and use the higher permission
        let canSave = false;
        if (isOwner) {
          canSave = true;
        } else {
          // Get explicit permission (if user has explicit access)
          let explicitCanSave = false;
          if (hasExplicitAccess && typeof userAccess === "object") {
            explicitCanSave = userAccess.canSave;
          } else if (hasExplicitAccess && typeof userAccess === "string") {
            // Old format - assume they had the old allowSave permission
            explicitCanSave = data.allowSave || false;
          }

          // Get public link permission (if PDF is publicly shared)
          const linkCanSave = isPubliclyShared
            ? data.linkAllowSave || false
            : false;

          // Use the highest permission available
          canSave = explicitCanSave || linkCanSave;
        }

        // Update user permission state
        setUserCanSave(canSave);

        // Check access permissions
        // Allow access if: owner OR has explicit access OR PDF is publicly shared
        const hasAccess = isOwner || hasExplicitAccess || isPubliclyShared;

        if (!hasAccess) {
          setError(
            "This PDF is not publicly shared and you don't have access to it"
          );
          setIsLoading(false);
          return;
        }

        // If user is authenticated and not already in accessUsers, add them (only if they have access)
        const isUserInAccessList = data.accessUsers.some(
          (userAccess: string | { email: string; canSave: boolean }) => {
            if (typeof userAccess === "string") {
              return userAccess === user?.email;
            } else {
              return userAccess.email === user?.email;
            }
          }
        );

        // Only add user to access list if they're accessing via public link
        // (not if they already have explicit access or are the owner)
        if (
          user?.email &&
          !isUserInAccessList &&
          !isOwner &&
          isPubliclyShared &&
          !hasExplicitAccess
        ) {
          try {
            // Add user in the new object format with link permissions
            const newUserAccess = {
              email: user.email,
              canSave: data.linkAllowSave || false, // Use link permission for public access
              addedAt: new Date(),
            };

            // Use the actual PDF document reference
            const pdfDocRef = doc(db, "pdfs", actualPdfId);
            await updateDoc(pdfDocRef, {
              accessUsers: [...data.accessUsers, newUserAccess],
            });
            console.log("Added user to shared list:", user.email);
            // Update the data object with the new accessUsers list
            data.accessUsers = [...data.accessUsers, newUserAccess];
          } catch (error) {
            console.error("Error adding user to shared list:", error);
            // Continue showing the PDF even if adding to shared list fails
          }
        }

        setPdfData({
          id: actualPdfId, // Use the actual PDF ID for consistency
          name: data.name || "Untitled",
          url: data.url,
          uploadedBy: data.uploadedBy || "Unknown",
          uploadedAt: data.uploadedAt?.toDate?.() || new Date().toISOString(),
          isPubliclyShared: data.isPubliclyShared || false,
          thumbnailUrl: data.thumbnailUrl || null,
          size: data.size || 0,
          accessUsers: data.accessUsers || [],
          ownerId: data.ownerId,
          storagePath: data.storagePath,
          allowSave: data.allowSave || false,
          linkAllowSave: data.linkAllowSave || false,
        });
      } catch (err) {
        console.error("Error fetching PDF:", err);
        setError("Failed to load PDF");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPdfData();
  }, [params.id, user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500 mb-4">{error}</div>
        <Link href="/" className="text-blue-500 hover:text-blue-600 underline">
          Go to Home
        </Link>
      </div>
    );
  }

  if (!pdfData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500 mb-4">PDF not found</div>
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

              {/* Permission Status Messages */}
              {!user && (
                <div className="mt-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-md inline-block">
                  📖 Viewing mode -
                  <Link
                    href={`/signin?redirect=${encodeURIComponent(
                      `/shared/${params.id}`
                    )}`}
                    className="underline hover:text-blue-800 ml-1"
                  >
                    Log in
                  </Link>
                  {(pdfData.linkAllowSave || pdfData.allowSave) &&
                    " to save and download this PDF"}
                </div>
              )}

              {user && !userCanSave && (
                <div className="mt-2 text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-md inline-block">
                  🔒 View only - Neither your access level nor the public link
                  allows saving
                </div>
              )}

              {user && userCanSave && !isSaved && (
                <div className="mt-2 text-sm text-green-600 bg-green-50 px-3 py-1 rounded-md inline-block">
                  💾 Save this PDF to your collection to enable download and
                  open in new tab
                </div>
              )}

              {user && isSaved && (
                <div className="mt-2 text-sm text-green-600 bg-green-50 px-3 py-1 rounded-md inline-block">
                  ✅ Saved to your collection - Full access enabled
                </div>
              )}
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
            ) : pdfData.allowSave ? (
              <div className="text-sm text-gray-600">
                Save this PDF to your collection to rename or delete your copy.
              </div>
            ) : null}
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
            canDownload={!!user && isSaved}
            canOpenInNewTab={!!user && isSaved}
            onLogin={() =>
              router.push(
                `/signin?redirect=${encodeURIComponent(`/shared/${params.id}`)}`
              )
            }
            onSaveToCollection={
              user && userCanSave ? handleSaveToCollection : undefined
            }
            isSaved={isSaved}
            pdfId={pdfData.id}
          />
        </div>
      </div>
    </div>
  );
}
