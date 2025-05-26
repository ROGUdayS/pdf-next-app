"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { storage, db } from "@/lib/firebase";
import { Menu } from "@headlessui/react";
import { generatePdfThumbnail } from "@/app/utils/pdfjs";
import { getBaseUrl } from "@/lib/utils";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,
} from "firebase/storage";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  Timestamp,
  deleteDoc,
  updateDoc,
  doc,
  orderBy,
  onSnapshot,
  setDoc,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import Image from "next/image";
import PDFViewer from "@/app/components/PDFViewer";
import ShareDialog from "@/app/components/ShareDialog";

interface PdfFile {
  id: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  size: number;
  accessUsers: string[];
  thumbnail?: string;
  ownerId: string;
  thumbnailUrl?: string;
  thumbnailPath?: string;
  storagePath?: string;
  isPubliclyShared?: boolean;
  allowSave: boolean;
}

// Cache for storing thumbnails - move outside component to persist between renders
const thumbnailCache = new Map<string, string>();
const processedPdfs = new Set<string>();

type ViewMode = "grid" | "list";
type SortOption = "name" | "date" | "size";
type SortDirection = "asc" | "desc";

export default function PDFsPage() {
  const { user } = useAuth();
  const [pdfs, setPdfs] = useState<Map<string, PdfFile>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [deletingPdfId, setDeletingPdfId] = useState<string | null>(null);
  const [renamingPdfId, setRenamingPdfId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [selectedPdf, setSelectedPdf] = useState<PdfFile | null>(null);
  const [sharingPdf, setSharingPdf] = useState<PdfFile | null>(null);

  // New state for view options, search, and sorting
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Function to process a PDF and generate its thumbnail
  const processPdf = async (
    doc: QueryDocumentSnapshot<DocumentData>
  ): Promise<PdfFile> => {
    const data = doc.data();

    // If we already have the thumbnailUrl from Firestore, use that directly
    if (data.thumbnailUrl && !processedPdfs.has(doc.id)) {
      processedPdfs.add(doc.id);
      return {
        id: doc.id,
        name: data.name || "Untitled",
        url: data.url,
        uploadedBy: data.uploadedBy || "Unknown",
        uploadedAt: data.uploadedAt?.toDate() || new Date(),
        size: data.size || 0,
        accessUsers: data.accessUsers || [],
        ownerId: data.ownerId,
        thumbnailUrl: data.thumbnailUrl,
        thumbnailPath: data.thumbnailPath,
        storagePath: data.storagePath,
        allowSave: data.allowSave,
      };
    }

    let thumbnail: string | undefined = thumbnailCache.get(doc.id);

    if (
      !thumbnail &&
      data.url &&
      data.storagePath &&
      !processedPdfs.has(doc.id)
    ) {
      try {
        console.log("Generating thumbnail for PDF:", data.name);
        const storageRef = ref(storage, data.storagePath);
        const freshUrl = await getDownloadURL(storageRef);

        const newThumbnail = await generatePdfThumbnail(freshUrl);
        if (newThumbnail) {
          thumbnailCache.set(doc.id, newThumbnail);
          thumbnail = newThumbnail;

          try {
            const response = await fetch(newThumbnail);
            const blob = await response.blob();

            const thumbnailFileName = `${doc.id}.png`;
            const thumbnailPath = `pdfs/${data.ownerId}/thumbnails/${thumbnailFileName}`;
            const thumbnailRef = ref(storage, thumbnailPath);

            await uploadBytes(thumbnailRef, blob, {
              contentType: "image/png",
              customMetadata: {
                pdfId: doc.id,
                originalName: data.name,
              },
            });

            const thumbnailUrl = await getDownloadURL(thumbnailRef);

            await updateDoc(doc.ref, {
              thumbnailUrl: thumbnailUrl,
              thumbnailPath: thumbnailPath,
            });

            // Mark this PDF as processed
            processedPdfs.add(doc.id);

            return {
              id: doc.id,
              name: data.name || "Untitled",
              url: data.url,
              uploadedBy: data.uploadedBy || "Unknown",
              uploadedAt: data.uploadedAt?.toDate() || new Date(),
              size: data.size || 0,
              accessUsers: data.accessUsers || [],
              ownerId: data.ownerId,
              thumbnailUrl: thumbnailUrl,
              thumbnailPath: thumbnailPath,
              storagePath: data.storagePath,
              allowSave: data.allowSave,
            };
          } catch (thumbnailError) {
            console.error("Error saving thumbnail:", thumbnailError);
          }
        }
      } catch (error) {
        console.error("Failed to process PDF:", doc.id, error);
      }
    }

    return {
      id: doc.id,
      name: data.name || "Untitled",
      url: data.url,
      uploadedBy: data.uploadedBy || "Unknown",
      uploadedAt: data.uploadedAt?.toDate() || new Date(),
      size: data.size || 0,
      accessUsers: data.accessUsers || [],
      thumbnail,
      ownerId: data.ownerId,
      thumbnailUrl: data.thumbnailUrl,
      thumbnailPath: data.thumbnailPath,
      storagePath: data.storagePath,
      allowSave: data.allowSave,
    };
  };

  // Effect to set up real-time listeners for PDFs
  useEffect(() => {
    let ownedUnsubscribe: (() => void) | null = null;
    let isMounted = true;

    const setupRealTimeListeners = async () => {
      if (!user) {
        setIsInitialLoading(false);
        return;
      }

      try {
        // Query for owned PDFs and saved copies (where user is the owner)
        const ownedQuery = query(
          collection(db, "pdfs"),
          where("ownerId", "==", user.uid),
          orderBy("uploadedAt", "desc")
        );

        // Set up real-time listener for owned PDFs
        ownedUnsubscribe = onSnapshot(
          ownedQuery,
          async (snapshot) => {
            if (!isMounted) return;

            const processedPdfs = await Promise.all(
              snapshot.docs.map(processPdf)
            );

            setPdfs((current) => {
              const newMap = new Map(current);
              // Update or add owned PDFs
              processedPdfs.forEach((pdf) => {
                newMap.set(pdf.id, pdf);
              });
              // Remove any PDFs that no longer exist
              const ownedIds = new Set(processedPdfs.map((pdf) => pdf.id));
              for (const [id] of newMap) {
                if (!ownedIds.has(id)) {
                  newMap.delete(id);
                }
              }
              return newMap;
            });
          },
          (error) => {
            console.error("Error in owned PDFs listener:", error);
            setError("Error loading your PDFs");
          }
        );

        setIsInitialLoading(false);
      } catch (error) {
        console.error("Error setting up PDF listeners:", error);
        setError("Failed to load PDFs");
        setIsInitialLoading(false);
      }
    };

    setupRealTimeListeners();

    return () => {
      isMounted = false;
      if (ownedUnsubscribe) ownedUnsubscribe();
    };
  }, [user]);

  // Enhanced sorted and filtered PDFs with search and sorting
  const filteredAndSortedPdfs = useMemo(() => {
    let filtered = Array.from(pdfs.values());

    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter((pdf) =>
        pdf.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "date":
          comparison = a.uploadedAt.getTime() - b.uploadedAt.getTime();
          break;
        case "size":
          comparison = a.size - b.size;
          break;
        default:
          comparison = b.uploadedAt.getTime() - a.uploadedAt.getTime();
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [pdfs, searchTerm, sortBy, sortDirection]);

  // Modified handleFileUpload to store storage path
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user) {
      console.log("No file selected or user not logged in");
      return;
    }

    // Clear input and reset states immediately
    event.target.value = "";
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    // Validate file
    if (file.type !== "application/pdf") {
      setError("Please upload only PDF files");
      setIsUploading(false);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("File size should be less than 100MB");
      setIsUploading(false);
      return;
    }

    try {
      const fileName = `${Date.now()}-${file.name}`;
      const storagePath = `pdfs/${user.uid}/${fileName}`;
      const storageRef = ref(storage, storagePath);

      // Upload file
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log("Upload progress:", progress);
          setUploadProgress(progress);

          if (progress === 100) {
            setTimeout(() => {
              setIsUploading(false);
              setUploadProgress(0);
            }, 500);
          }
        },
        (error) => {
          console.error("Upload error:", error);
          setError(`Upload failed: ${error.message}`);
          setIsUploading(false);
          setUploadProgress(0);
        },
        async () => {
          try {
            const url = await getDownloadURL(storageRef);

            // Add to Firestore with storage path
            await addDoc(collection(db, "pdfs"), {
              name: file.name,
              url: url,
              storagePath: storagePath,
              uploadedBy: user.email,
              uploadedAt: Timestamp.now(),
              size: file.size,
              accessUsers: [user.email as string],
              ownerId: user.uid,
              thumbnailUrl: null,
              allowSave: true,
            });

            setError(null);
          } catch (error: unknown) {
            console.error("Error in upload completion:", error);
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            setError(`Failed to save PDF: ${errorMessage}`);
          }
        }
      );
    } catch (error: unknown) {
      console.error("Upload process failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Upload failed: ${errorMessage}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Delete PDF function
  const handleDelete = async (pdf: PdfFile) => {
    if (!user) {
      setError("You must be logged in to delete PDFs");
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to delete "${pdf.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setError(null);
      setDeletingPdfId(pdf.id);

      if (pdf.uploadedBy === user.email) {
        // For owned PDFs, delete from storage and Firestore
        if (pdf.storagePath) {
          const pdfRef = ref(storage, pdf.storagePath);
          await deleteObject(pdfRef);
        }

        if (pdf.thumbnailPath) {
          const thumbnailRef = ref(storage, pdf.thumbnailPath);
          await deleteObject(thumbnailRef);
        }

        await deleteDoc(doc(db, "pdfs", pdf.id));
      } else {
        // For saved shared PDFs, only delete the user's copy
        if (pdf.storagePath && pdf.storagePath.includes(user.uid)) {
          const pdfRef = ref(storage, pdf.storagePath);
          await deleteObject(pdfRef);
        }

        if (pdf.thumbnailPath && pdf.thumbnailPath.includes(user.uid)) {
          const thumbnailRef = ref(storage, pdf.thumbnailPath);
          await deleteObject(thumbnailRef);
        }

        await deleteDoc(doc(db, "pdfs", pdf.id));
      }

      setError("PDF deleted successfully");
      setTimeout(() => setError(null), 3000);
    } catch (error: unknown) {
      console.error("Error deleting PDF:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to delete PDF: ${errorMessage}`);
    } finally {
      setDeletingPdfId(null);
    }
  };

  // Rename PDF function
  const handleRename = async (pdf: PdfFile) => {
    if (!user) {
      setError("You must be logged in to rename PDFs");
      return;
    }

    console.log("Starting rename process for PDF:", {
      pdfId: pdf.id,
      currentName: pdf.name,
      newName: newName.trim(),
      isOwnedPdf: pdf.uploadedBy === user.email,
      userId: user.uid,
      storagePath: pdf.storagePath,
    });

    if (!newName.trim()) {
      setError("Please enter a valid name");
      return;
    }

    const invalidChars = /[<>:"\/\\|?*\x00-\x1F]/g;
    if (invalidChars.test(newName)) {
      setError("File name contains invalid characters");
      return;
    }

    if (newName.trim() === pdf.name) {
      handleCancelRename();
      return;
    }

    try {
      setError(null);
      const pdfRef = doc(db, "pdfs", pdf.id);

      // Reset rename mode first
      handleCancelRename();

      // Check ownership using ownerId instead of uploadedBy
      if (pdf.ownerId === user.uid) {
        // For owned PDFs, update both storage and Firestore
        const newFileName = `${Date.now()}-${newName.trim()}${
          newName.toLowerCase().endsWith(".pdf") ? "" : ".pdf"
        }`;
        const newStoragePath = `pdfs/${user.uid}/${newFileName}`;

        console.log("Preparing storage operation:", {
          oldPath: pdf.storagePath,
          newPath: newStoragePath,
          userId: user.uid,
          pdfId: pdf.id,
          isOwner: true,
        });

        if (pdf.storagePath) {
          try {
            // Get the old file reference
            const oldFileRef = ref(storage, pdf.storagePath);
            // Create new file reference
            const newFileRef = ref(storage, newStoragePath);

            console.log("Storage references created:", {
              oldRef: oldFileRef.fullPath,
              newRef: newFileRef.fullPath,
            });

            // Download the old file
            console.log("Downloading file from:", pdf.url);
            const response = await fetch(pdf.url);
            console.log("Fetch response status:", response.status);
            const oldFileBlob = await response.blob();
            console.log("File downloaded, size:", oldFileBlob.size);

            // Upload to new location with explicit content type
            console.log("Starting upload to new location");
            const uploadResult = await uploadBytes(newFileRef, oldFileBlob, {
              contentType: "application/pdf",
              customMetadata: {
                pdfId: pdf.id,
                originalName: newName.trim(),
                ownerId: user.uid,
              },
            });
            console.log("Upload completed:", {
              fullPath: uploadResult.ref.fullPath,
              metadata: uploadResult.metadata,
            });

            // Get the new URL
            const newUrl = await getDownloadURL(newFileRef);
            console.log("New URL obtained");

            // Delete the old file
            console.log("Attempting to delete old file:", oldFileRef.fullPath);
            try {
              await deleteObject(oldFileRef);
              console.log("Old file deleted successfully");
            } catch (deleteError) {
              console.error("Error deleting old file:", {
                error: deleteError,
                path: oldFileRef.fullPath,
              });
              // Continue with the process even if delete fails
            }

            // Update in Firestore
            console.log("Updating Firestore document");
            await updateDoc(pdfRef, {
              name: newName.trim(),
              url: newUrl,
              storagePath: newStoragePath,
            });
            console.log("Firestore document updated successfully");

            setError("PDF renamed successfully");
            setTimeout(() => setError(null), 3000);
          } catch (error) {
            console.error("Storage operation failed:", {
              error,
              phase: "unknown",
              code: "unknown",
              message: error instanceof Error ? error.message : "unknown",
            });
            throw error;
          }
        } else {
          console.log("No storage path found, updating only Firestore");
          await updateDoc(pdfRef, {
            name: newName.trim(),
          });
        }
      } else {
        console.log("Updating shared PDF name in Firestore only");
        await updateDoc(pdfRef, {
          name: newName.trim(),
        });
      }
    } catch (error) {
      console.error("Rename operation failed:", {
        error,
        pdfId: pdf.id,
        oldName: pdf.name,
        newName: newName.trim(),
      });
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Failed to rename PDF: ${errorMessage}`);

      // Restore the original PDF in case of error
      setPdfs((current) => {
        const newMap = new Map(current);
        newMap.set(pdf.id, pdf);
        return newMap;
      });
    }
  };

  // Cancel rename function with cleanup
  const handleCancelRename = () => {
    setNewName("");
    setError(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Add this function at the top level of your component, alongside other functions like handleDelete
  const handleDownload = async (pdf: PdfFile) => {
    try {
      // Fetch the PDF file
      const response = await fetch(pdf.url);
      const blob = await response.blob();

      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);

      // Create temporary link element
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = pdf.name.endsWith(".pdf") ? pdf.name : `${pdf.name}.pdf`; // Ensure .pdf extension

      // Append to document, click, and cleanup
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup blob URL
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      // You might want to show an error message to the user here
    }
  };

  // Add sharing functions
  const handleShareViaEmail = async (email: string, allowSave: boolean) => {
    if (!sharingPdf || !user) return;

    try {
      // Update the PDF document with the new access user
      const pdfRef = doc(db, "pdfs", sharingPdf.id);

      // Create user object with permissions
      const newUserAccess = {
        email: email,
        canSave: allowSave,
        addedAt: new Date(),
      };

      // Check if the email is already in the access list
      const isExistingUser = sharingPdf.accessUsers.some((userEmail: string) =>
        typeof userEmail === "string"
          ? userEmail === email
          : userEmail.email === email
      );

      // Update Firestore with new user access structure
      if (!isExistingUser) {
        await updateDoc(pdfRef, {
          accessUsers: [...sharingPdf.accessUsers, newUserAccess],
        });
      }

      // Always send email notification
      const shareUrl = `${getBaseUrl()}/shared/${sharingPdf.id}`;
      const response = await fetch("/api/share-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientEmail: email,
          pdfName: sharingPdf.name,
          sharedByEmail: user.email,
          pdfUrl: shareUrl,
          allowSave: allowSave,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to send share notification");
      }

      // Update local state only if needed
      if (!isExistingUser) {
        setPdfs((current) => {
          const newMap = new Map(current);
          const updatedPdf = {
            ...sharingPdf,
            accessUsers: [...sharingPdf.accessUsers, newUserAccess],
          };
          newMap.set(sharingPdf.id, updatedPdf);
          return newMap;
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to share PDF";
      throw new Error("Failed to share PDF: " + errorMessage);
    }
  };

  const handleShareViaLink = async (allowSave: boolean) => {
    if (!sharingPdf || !user) return "";

    try {
      // Update the PDF document to make it publicly shared
      const pdfRef = doc(db, "pdfs", sharingPdf.id);
      await updateDoc(pdfRef, {
        isPubliclyShared: true,
        allowSave: allowSave,
      });

      // Update local state
      setPdfs((current) => {
        const newMap = new Map(current);
        const updatedPdf = {
          ...sharingPdf,
          isPubliclyShared: true,
          allowSave: allowSave,
        };
        newMap.set(sharingPdf.id, updatedPdf);
        return newMap;
      });

      // Return the shareable link
      return `${getBaseUrl()}/shared/${sharingPdf.id}`;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error("Failed to generate share link: " + errorMessage);
    }
  };

  const handleSaveToCollection = async () => {
    if (!user || !selectedPdf) return;

    try {
      setError(null);

      // First check if this PDF is already saved
      const savedQuery = query(
        collection(db, "pdfs"),
        where("originalPdfId", "==", selectedPdf.id),
        where("ownerId", "==", user.uid)
      );
      const savedSnapshot = await getDocs(savedQuery);

      // If already saved, just show a message
      if (!savedSnapshot.empty) {
        setError("This PDF is already saved to your collection");
        setTimeout(() => setError(null), 3000);
        return;
      }

      // Create a new document in the PDFs collection
      const firestoreDocRef = doc(collection(db, "pdfs"));

      // First, download the PDF file
      const pdfResponse = await fetch(selectedPdf.url);
      const pdfBlob = await pdfResponse.blob();

      // Create a new storage path for the user's copy
      const fileName = `${Date.now()}-${selectedPdf.name}`;
      const newStoragePath = `pdfs/${user.uid}/${fileName}`;
      const storageRef = ref(storage, newStoragePath);

      // Upload the PDF to the user's storage bucket
      await uploadBytes(storageRef, pdfBlob, {
        contentType: "application/pdf",
        customMetadata: {
          originalPdfId: selectedPdf.id,
          originalName: selectedPdf.name,
          originalOwnerId: selectedPdf.ownerId,
        },
      });

      // Get the URL for the new PDF
      const newPdfUrl = await getDownloadURL(storageRef);

      // Handle thumbnail
      let thumbnailUrl = null;
      let thumbnailPath = null;

      // If original has thumbnail, copy it
      if (selectedPdf.thumbnailUrl) {
        try {
          const thumbnailResponse = await fetch(selectedPdf.thumbnailUrl);
          const thumbnailBlob = await thumbnailResponse.blob();

          const thumbnailFileName = `${firestoreDocRef.id}.png`;
          thumbnailPath = `pdfs/${user.uid}/thumbnails/${thumbnailFileName}`;
          const thumbnailRef = ref(storage, thumbnailPath);

          await uploadBytes(thumbnailRef, thumbnailBlob, {
            contentType: "image/png",
            customMetadata: {
              pdfId: firestoreDocRef.id,
              originalName: selectedPdf.name,
              originalOwnerId: selectedPdf.ownerId,
            },
          });

          thumbnailUrl = await getDownloadURL(thumbnailRef);
        } catch (thumbnailError) {
          console.error("Error copying thumbnail:", thumbnailError);
        }
      }

      const savedPdfData = {
        name: selectedPdf.name,
        url: newPdfUrl,
        uploadedBy: user.email,
        uploadedAt: Timestamp.now(),
        size: pdfBlob.size,
        accessUsers: [user.email],
        ownerId: user.uid,
        originalPdfId: selectedPdf.id,
        thumbnailUrl: thumbnailUrl,
        thumbnailPath: thumbnailPath,
        storagePath: newStoragePath,
        allowSave: selectedPdf.allowSave,
      };

      await setDoc(firestoreDocRef, savedPdfData);
      setError("PDF saved successfully");
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error("Error saving PDF to collection:", err);
      setError("Failed to save PDF to your collection");
    }
  };

  // Grid view component
  const GridView = ({ pdfs }: { pdfs: PdfFile[] }) => (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {pdfs.map((pdf) => (
        <div
          key={pdf.id}
          className="bg-card rounded-lg shadow-sm overflow-visible hover:shadow-md transition-shadow duration-200 border border-border"
        >
          {/* Thumbnail and content section */}
          <div className="cursor-pointer" onClick={() => setSelectedPdf(pdf)}>
            {pdf.thumbnailUrl ? (
              <div className="pdf-thumbnail-container">
                <div className="pdf-thumbnail-wrapper">
                  <Image
                    src={pdf.thumbnailUrl}
                    alt={`${pdf.name} thumbnail`}
                    width={400}
                    height={300}
                    className="pdf-thumbnail"
                    loading="lazy"
                    priority={false}
                    onError={(e) => {
                      console.error("Failed to load thumbnail:", {
                        name: pdf.name,
                        url: pdf.thumbnailUrl,
                      });
                      const container = (e.target as HTMLElement).parentElement
                        ?.parentElement;
                      if (container) {
                        container.innerHTML = "";
                        container.className = "pdf-fallback";
                      }
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="pdf-fallback">
                <svg
                  className="w-12 h-12 text-muted-foreground mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                <span className="text-sm text-muted-foreground">
                  PDF Preview
                </span>
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0 pr-4">
                <h3 className="text-lg font-semibold text-card-foreground truncate">
                  {pdf.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {pdf.uploadedBy === user?.email
                    ? "Owned by you"
                    : `Shared by ${pdf.uploadedBy}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(pdf.uploadedAt).toLocaleDateString()}
                </p>
              </div>

              {/* Actions menu */}
              <div className="relative flex-shrink-0">
                <Menu as="div" className="relative inline-block text-left">
                  <Menu.Button className="p-2 hover:bg-accent rounded-full">
                    <svg
                      className="w-5 h-5 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                      />
                    </svg>
                  </Menu.Button>

                  <Menu.Items className="absolute right-0 z-50 bottom-full mb-2 w-48 origin-bottom-right divide-y divide-border rounded-md bg-popover shadow-lg ring-1 ring-border focus:outline-none">
                    <div className="py-1">
                      {/* Share option only for owned PDFs */}
                      {pdf.uploadedBy === user?.email && (
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSharingPdf(pdf);
                              }}
                              className={`${
                                active ? "bg-accent" : ""
                              } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                            >
                              <svg
                                className="mr-3 h-5 w-5 text-muted-foreground"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                />
                              </svg>
                              Share
                            </button>
                          )}
                        </Menu.Item>
                      )}

                      {/* Rename option for all PDFs */}
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingPdfId(pdf.id);
                              setNewName(pdf.name);
                            }}
                            className={`${
                              active ? "bg-accent" : ""
                            } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                          >
                            <svg
                              className="mr-3 h-5 w-5 text-muted-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                            Rename
                          </button>
                        )}
                      </Menu.Item>

                      {/* Download option for all PDFs */}
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(pdf);
                            }}
                            className={`${
                              active ? "bg-accent" : ""
                            } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                          >
                            <svg
                              className="mr-3 h-5 w-5 text-muted-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                            Download
                          </button>
                        )}
                      </Menu.Item>

                      {/* Delete option for all PDFs */}
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingPdfId(pdf.id);
                            }}
                            className={`${
                              active ? "bg-accent" : ""
                            } flex w-full items-center px-4 py-2 text-sm text-destructive`}
                          >
                            <svg
                              className="mr-3 h-5 w-5 text-destructive"
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
                            Delete
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Menu>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // List view component
  const ListView = ({ pdfs }: { pdfs: PdfFile[] }) => (
    <div className="bg-card shadow-sm rounded-lg overflow-visible border border-border">
      {/* Desktop header - hidden on mobile */}
      <div className="hidden md:block px-6 py-3 bg-muted border-b border-border">
        <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
          <div className="col-span-1"></div>
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-2">Uploaded By</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-1"></div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {pdfs.map((pdf) => (
          <div
            key={pdf.id}
            className="px-4 md:px-6 py-4 hover:bg-accent cursor-pointer transition-colors"
            onClick={() => setSelectedPdf(pdf)}
          >
            {/* Desktop layout */}
            <div className="hidden md:grid grid-cols-12 gap-4 items-center">
              <div className="col-span-1">
                {pdf.thumbnailUrl ? (
                  <Image
                    src={pdf.thumbnailUrl}
                    alt={`${pdf.name} thumbnail`}
                    width={40}
                    height={30}
                    className="rounded object-cover"
                  />
                ) : (
                  <div className="w-10 h-8 bg-muted rounded flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-muted-foreground"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <div className="col-span-4">
                <p className="text-sm font-medium text-card-foreground truncate">
                  {pdf.name}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(pdf.size)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">
                  {pdf.uploadedBy === user?.email ? "You" : pdf.uploadedBy}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">
                  {formatDate(pdf.uploadedAt)}
                </p>
              </div>
              <div className="col-span-1">
                <Menu as="div" className="relative inline-block text-left">
                  <Menu.Button
                    className="p-2 hover:bg-accent rounded-full"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg
                      className="w-5 h-5 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                      />
                    </svg>
                  </Menu.Button>

                  <Menu.Items className="absolute right-0 z-50 mt-2 w-48 origin-top-right divide-y divide-border rounded-md bg-popover shadow-lg ring-1 ring-border focus:outline-none">
                    <div className="py-1">
                      {/* Same menu items as grid view */}
                      {pdf.uploadedBy === user?.email && (
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSharingPdf(pdf);
                              }}
                              className={`${
                                active ? "bg-accent" : ""
                              } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                            >
                              <svg
                                className="mr-3 h-5 w-5 text-muted-foreground"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                />
                              </svg>
                              Share
                            </button>
                          )}
                        </Menu.Item>
                      )}

                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingPdfId(pdf.id);
                              setNewName(pdf.name);
                            }}
                            className={`${
                              active ? "bg-accent" : ""
                            } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                          >
                            <svg
                              className="mr-3 h-5 w-5 text-muted-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                            Rename
                          </button>
                        )}
                      </Menu.Item>

                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(pdf);
                            }}
                            className={`${
                              active ? "bg-accent" : ""
                            } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                          >
                            <svg
                              className="mr-3 h-5 w-5 text-muted-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                              />
                            </svg>
                            Download
                          </button>
                        )}
                      </Menu.Item>

                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingPdfId(pdf.id);
                            }}
                            className={`${
                              active ? "bg-accent" : ""
                            } flex w-full items-center px-4 py-2 text-sm text-destructive`}
                          >
                            <svg
                              className="mr-3 h-5 w-5 text-destructive"
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
                            Delete
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Menu>
              </div>
            </div>

            {/* Mobile layout */}
            <div className="md:hidden">
              <div className="flex items-start gap-3">
                {/* Thumbnail */}
                <div className="flex-shrink-0">
                  {pdf.thumbnailUrl ? (
                    <Image
                      src={pdf.thumbnailUrl}
                      alt={`${pdf.name} thumbnail`}
                      width={48}
                      height={36}
                      className="rounded object-cover"
                    />
                  ) : (
                    <div className="w-12 h-9 bg-muted rounded flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-card-foreground truncate">
                        {pdf.name}
                      </h3>
                      <div className="mt-1 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {pdf.uploadedBy === user?.email
                            ? "Owned by you"
                            : `Shared by ${pdf.uploadedBy}`}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatFileSize(pdf.size)}</span>
                          <span>•</span>
                          <span>{formatDate(pdf.uploadedAt)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions menu */}
                    <div className="flex-shrink-0 ml-2">
                      <Menu
                        as="div"
                        className="relative inline-block text-left"
                      >
                        <Menu.Button
                          className="p-2 hover:bg-accent rounded-full"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg
                            className="w-5 h-5 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                            />
                          </svg>
                        </Menu.Button>

                        <Menu.Items className="absolute right-0 z-50 mt-2 w-48 origin-top-right divide-y divide-border rounded-md bg-popover shadow-lg ring-1 ring-border focus:outline-none">
                          <div className="py-1">
                            {/* Same menu items as desktop */}
                            {pdf.uploadedBy === user?.email && (
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSharingPdf(pdf);
                                    }}
                                    className={`${
                                      active ? "bg-accent" : ""
                                    } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                                  >
                                    <svg
                                      className="mr-3 h-5 w-5 text-muted-foreground"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                      />
                                    </svg>
                                    Share
                                  </button>
                                )}
                              </Menu.Item>
                            )}

                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingPdfId(pdf.id);
                                    setNewName(pdf.name);
                                  }}
                                  className={`${
                                    active ? "bg-accent" : ""
                                  } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                                >
                                  <svg
                                    className="mr-3 h-5 w-5 text-muted-foreground"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                    />
                                  </svg>
                                  Rename
                                </button>
                              )}
                            </Menu.Item>

                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(pdf);
                                  }}
                                  className={`${
                                    active ? "bg-accent" : ""
                                  } flex w-full items-center px-4 py-2 text-sm text-popover-foreground`}
                                >
                                  <svg
                                    className="mr-3 h-5 w-5 text-muted-foreground"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                    />
                                  </svg>
                                  Download
                                </button>
                              )}
                            </Menu.Item>

                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingPdfId(pdf.id);
                                  }}
                                  className={`${
                                    active ? "bg-accent" : ""
                                  } flex w-full items-center px-4 py-2 text-sm text-destructive`}
                                >
                                  <svg
                                    className="mr-3 h-5 w-5 text-destructive"
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
                                  Delete
                                </button>
                              )}
                            </Menu.Item>
                          </div>
                        </Menu.Items>
                      </Menu>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedPdf && (
        <PDFViewer
          fileUrl={selectedPdf.url}
          onClose={() => setSelectedPdf(null)}
          fileName={selectedPdf.name}
          canShare={selectedPdf.uploadedBy === user?.email}
          onShare={() => setSharingPdf(selectedPdf)}
          pdfId={selectedPdf.id}
          isOwner={selectedPdf.ownerId === user?.uid}
          onSaveToCollection={
            selectedPdf.allowSave && selectedPdf.ownerId !== user?.uid
              ? handleSaveToCollection
              : undefined
          }
          isSaved={false}
        />
      )}

      {sharingPdf && (
        <ShareDialog
          isOpen={!!sharingPdf}
          onClose={() => setSharingPdf(null)}
          onShareViaEmail={handleShareViaEmail}
          onShareViaLink={handleShareViaLink}
          pdfName={sharingPdf.name}
          pdfId={sharingPdf.id}
        />
      )}

      {/* Rename Dialog */}
      {renamingPdfId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 border border-border">
            <h2 className="text-xl font-bold mb-4 text-card-foreground">
              Rename PDF
            </h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new name"
              className="w-full px-3 py-2 border border-border rounded-md mb-4 bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setRenamingPdfId(null);
                  setNewName("");
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const pdf = pdfs.get(renamingPdfId);
                  if (pdf) {
                    handleRename(pdf);
                  }
                  setRenamingPdfId(null);
                }}
                disabled={!newName.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deletingPdfId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg p-6 w-96 border border-border">
            <h2 className="text-xl font-bold mb-4 text-card-foreground">
              Delete PDF
            </h2>
            <p className="mb-4 text-card-foreground">
              Are you sure you want to delete this PDF? This action cannot be
              undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeletingPdfId(null)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const pdf = pdfs.get(deletingPdfId);
                  if (pdf) {
                    handleDelete(pdf);
                  }
                  setDeletingPdfId(null);
                }}
                className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header with search, view toggle, and upload */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold text-foreground">My PDFs</h1>
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
              id="pdf-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="pdf-upload"
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary cursor-pointer ${
                isUploading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              {isUploading ? "Uploading..." : "Upload PDF"}
            </label>
          </div>
        </div>

        {/* Search and controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search PDFs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-border rounded-md leading-5 bg-background placeholder-muted-foreground focus:outline-none focus:placeholder-muted-foreground/70 focus:ring-1 focus:ring-primary focus:border-primary text-foreground"
            />
          </div>

          <div className="flex items-center gap-4">
            {/* Sort dropdown */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-foreground">Sort by:</label>
              <select
                value={`${sortBy}-${sortDirection}`}
                onChange={(e) => {
                  const [newSortBy, newSortDirection] = e.target.value.split(
                    "-"
                  ) as [SortOption, SortDirection];
                  setSortBy(newSortBy);
                  setSortDirection(newSortDirection);
                }}
                className="border border-border rounded-md px-3 py-1 text-sm bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              >
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="size-desc">Largest first</option>
                <option value="size-asc">Smallest first</option>
              </select>
            </div>

            {/* View toggle */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-background shadow-sm text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Grid view"
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
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                  />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-background shadow-sm text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="List view"
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
                    d="M4 6h16M4 10h16M4 14h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="mb-6">
          <div className="w-full bg-muted rounded-full h-2.5">
            <div
              className="bg-primary h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Uploading... {uploadProgress.toFixed(0)}%
          </p>
        </div>
      )}

      {/* Loading state */}
      {isInitialLoading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading PDFs...</p>
        </div>
      )}

      {/* PDF Grid or List */}
      {!isInitialLoading && (
        <>
          {viewMode === "grid" ? (
            <GridView pdfs={filteredAndSortedPdfs} />
          ) : (
            <ListView pdfs={filteredAndSortedPdfs} />
          )}
        </>
      )}

      {/* Empty state */}
      {!isInitialLoading && filteredAndSortedPdfs.length === 0 && !error && (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-foreground">
            {searchTerm ? "No PDFs found" : "No PDFs"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm
              ? `No PDFs match "${searchTerm}"`
              : "Upload your first PDF to get started"}
          </p>
        </div>
      )}
    </div>
  );
}
