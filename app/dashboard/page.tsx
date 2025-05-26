"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { storage, db } from "@/lib/firebase";
import { Menu } from "@headlessui/react";
import { ref, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import {
  collection,
  addDoc,
  query,
  where,
  Timestamp,
  orderBy,
  limit,
  onSnapshot,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import Image from "next/image";
import Link from "next/link";
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
  ownerId: string;
  thumbnailUrl?: string;
  thumbnailPath?: string;
  storagePath?: string;
  isPubliclyShared?: boolean;
  allowSave: boolean;
  isOwned?: boolean;
}

export default function Dashboard() {
  const { user, pdfStats, loading } = useAuth();
  const [recentPdfs, setRecentPdfs] = useState<PdfFile[]>([]);
  const [ownedPdfs, setOwnedPdfs] = useState<PdfFile[]>([]);
  const [sharedPdfs, setSharedPdfs] = useState<PdfFile[]>([]);
  const [allPdfs, setAllPdfs] = useState<PdfFile[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<PdfFile | null>(null);
  const [sharingPdf, setSharingPdf] = useState<PdfFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const processPdf = async (
    doc: QueryDocumentSnapshot<DocumentData>
  ): Promise<PdfFile> => {
    const data = doc.data();
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
      isOwned: data.ownerId === user?.uid,
    };
  };

  useEffect(() => {
    if (!user) return;

    // Get all PDFs and filter client-side to handle both old and new accessUsers formats
    const allPdfsQuery = query(
      collection(db, "pdfs"),
      orderBy("uploadedAt", "desc")
    );

    const unsubscribe = onSnapshot(allPdfsQuery, async (snapshot) => {
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

      const pdfs = await Promise.all(
        filteredDocs.slice(0, 6).map((doc) => processPdf(doc))
      );
      setRecentPdfs(pdfs);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const ownedQuery = query(
      collection(db, "pdfs"),
      where("ownerId", "==", user.uid),
      orderBy("uploadedAt", "desc"),
      limit(4)
    );

    const unsubscribe = onSnapshot(ownedQuery, async (snapshot) => {
      const pdfs = await Promise.all(
        snapshot.docs.map((doc) => processPdf(doc))
      );
      setOwnedPdfs(pdfs);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Get all PDFs and filter client-side to handle both old and new accessUsers formats
    const allPdfsQuery = query(
      collection(db, "pdfs"),
      orderBy("uploadedAt", "desc")
    );

    const unsubscribe = onSnapshot(allPdfsQuery, async (snapshot) => {
      const filteredDocs = snapshot.docs.filter((doc) => {
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
      });

      const pdfs = await Promise.all(
        filteredDocs.slice(0, 4).map((doc) => processPdf(doc))
      );
      setSharedPdfs(pdfs);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Get all PDFs and filter client-side to handle both old and new accessUsers formats
    const allPdfsQuery = query(
      collection(db, "pdfs"),
      orderBy("uploadedAt", "desc")
    );

    const unsubscribe = onSnapshot(allPdfsQuery, async (snapshot) => {
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

      const pdfs = await Promise.all(
        filteredDocs.map((doc) => processPdf(doc))
      );
      setAllPdfs(pdfs);
    });

    return () => unsubscribe();
  }, [user]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];

    return allPdfs.filter((pdf) =>
      pdf.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allPdfs, searchTerm]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowSearchResults(value.trim().length > 0);
  };

  const handleSearchResultClick = (pdf: PdfFile) => {
    setSelectedPdf(pdf);
    setSearchTerm("");
    setShowSearchResults(false);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    event.target.value = "";
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

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

      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          setError(`Upload failed: ${error.message}`);
          setIsUploading(false);
          setUploadProgress(0);
        },
        async () => {
          try {
            const url = await getDownloadURL(storageRef);

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

            setError("PDF uploaded successfully!");
            setTimeout(() => setError(null), 3000);
            setIsUploading(false);
            setUploadProgress(0);
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            setError(`Failed to save PDF: ${errorMessage}`);
            setIsUploading(false);
            setUploadProgress(0);
          }
        }
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setError(`Upload failed: ${errorMessage}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownload = async (pdf: PdfFile) => {
    try {
      const response = await fetch(pdf.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = pdf.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading PDF:", error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user?.displayName || user?.email?.split("@")[0]}!
          </p>
        </div>

        <div className="mt-4 lg:mt-0 relative">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="h-5 w-5 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
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
              onChange={handleSearchChange}
              onFocus={() => setShowSearchResults(true)}
              className="block w-full pl-10 pr-3 py-2 border border-border rounded-md leading-5 bg-background placeholder-muted-foreground focus:outline-none focus:placeholder-muted-foreground/70 focus:ring-1 focus:ring-primary focus:border-primary text-foreground"
            />
          </div>
          {showSearchResults && searchTerm && (
            <div className="absolute z-50 mt-1 w-full bg-card rounded-md shadow-lg border border-border max-h-60 overflow-auto">
              {searchResults.length > 0 ? (
                searchResults.map((pdf) => (
                  <button
                    key={pdf.id}
                    onClick={() => handleSearchResultClick(pdf)}
                    className="w-full px-4 py-2 text-left hover:bg-accent flex items-center space-x-3"
                  >
                    <div className="flex-shrink-0">
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">
                        {pdf.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(pdf.size)} •{" "}
                        {formatDate(pdf.uploadedAt)}
                      </p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-2 text-sm text-muted-foreground">
                  No PDFs found
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-primary">
              Uploading PDF...
            </span>
            <span className="text-sm text-primary">
              {Math.round(uploadProgress)}%
            </span>
          </div>
          <div className="w-full bg-primary/20 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div
          className={`rounded-lg p-4 ${
            error.includes("successfully")
              ? "bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400"
              : "bg-destructive/10 border border-destructive/20 text-destructive"
          }`}
        >
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Link
          href="/dashboard/pdfs"
          className="bg-card rounded-lg shadow-sm border border-border p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">
                My PDFs
              </h3>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
                {pdfStats.ownedCount}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Documents owned
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <svg
                className="w-6 h-6 text-blue-600 dark:text-blue-400"
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
          </div>
        </Link>

        <Link
          href="/dashboard/shared"
          className="bg-card rounded-lg shadow-sm border border-border p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">
                Shared with Me
              </h3>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
                {pdfStats.sharedCount}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Documents shared
              </p>
            </div>
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <svg
                className="w-6 h-6 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
            </div>
          </div>
        </Link>

        <div className="bg-card rounded-lg shadow-sm border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">
                Total Storage
              </h3>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">
                {formatFileSize(pdfStats.storageUsed)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Space used by your PDFs
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
              <svg
                className="w-6 h-6 text-purple-600 dark:text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Recent PDFs Section */}
      <div className="bg-card rounded-lg shadow-sm border border-border">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-card-foreground">
              Recent PDFs
            </h2>
            <div className="flex items-center space-x-2">
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
        </div>
        <div className="p-6">
          {recentPdfs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentPdfs.slice(0, 6).map((pdf) => (
                <div
                  key={pdf.id}
                  className="group cursor-pointer bg-muted/30 rounded-lg p-4 hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedPdf(pdf)}
                >
                  <div className="flex items-start space-x-3">
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate group-hover:text-primary">
                        {pdf.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pdf.isOwned
                          ? "Owned by you"
                          : `Shared by ${pdf.uploadedBy}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(pdf.uploadedAt)}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <Menu as="div" className="relative">
                        <Menu.Button
                          className="p-1 hover:bg-accent rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg
                            className="w-4 h-4 text-muted-foreground"
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
                        <Menu.Items className="absolute right-0 z-10 mt-1 w-32 origin-top-right rounded-md bg-popover shadow-lg ring-1 ring-border focus:outline-none overflow-visible z-50">
                          <div className="py-1">
                            {pdf.isOwned && (
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSharingPdf(pdf);
                                    }}
                                    className={`${
                                      active ? "bg-accent" : ""
                                    } block px-4 py-2 text-sm text-popover-foreground w-full text-left`}
                                  >
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
                                    handleDownload(pdf);
                                  }}
                                  className={`${
                                    active ? "bg-accent" : ""
                                  } block px-4 py-2 text-sm text-popover-foreground w-full text-left`}
                                >
                                  Download
                                </button>
                              )}
                            </Menu.Item>
                          </div>
                        </Menu.Items>
                      </Menu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-card-foreground">
                No PDFs yet
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Get started by uploading your first PDF document.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* My PDFs and Shared PDFs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-card-foreground">
                My PDFs
              </h2>
              <Link
                href="/dashboard/pdfs"
                className="text-sm text-primary hover:text-primary/80"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="p-6">
            {ownedPdfs.length > 0 ? (
              <div className="space-y-3">
                {ownedPdfs.slice(0, 4).map((pdf) => (
                  <div
                    key={pdf.id}
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => setSelectedPdf(pdf)}
                  >
                    {pdf.thumbnailUrl ? (
                      <Image
                        src={pdf.thumbnailUrl}
                        alt={`${pdf.name} thumbnail`}
                        width={32}
                        height={24}
                        className="rounded object-cover"
                      />
                    ) : (
                      <div className="w-8 h-6 bg-muted rounded flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-muted-foreground"
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">
                        {pdf.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(pdf.uploadedAt)}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(pdf.size)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No PDFs uploaded yet
              </p>
            )}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-card-foreground">
                Shared with Me
              </h2>
              <Link
                href="/dashboard/shared"
                className="text-sm text-primary hover:text-primary/80"
              >
                View all →
              </Link>
            </div>
          </div>
          <div className="p-6">
            {sharedPdfs.length > 0 ? (
              <div className="space-y-3">
                {sharedPdfs.slice(0, 4).map((pdf) => (
                  <div
                    key={pdf.id}
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-accent cursor-pointer"
                    onClick={() => setSelectedPdf(pdf)}
                  >
                    {pdf.thumbnailUrl ? (
                      <Image
                        src={pdf.thumbnailUrl}
                        alt={`${pdf.name} thumbnail`}
                        width={32}
                        height={24}
                        className="rounded object-cover"
                      />
                    ) : (
                      <div className="w-8 h-6 bg-muted rounded flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-muted-foreground"
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">
                        {pdf.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Shared by {pdf.uploadedBy}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(pdf.size)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                No shared PDFs yet
              </p>
            )}
          </div>
        </div>
      </div>

      {selectedPdf && (
        <PDFViewer
          fileUrl={selectedPdf.url}
          fileName={selectedPdf.name}
          onClose={() => setSelectedPdf(null)}
          onShare={
            selectedPdf.isOwned ? () => setSharingPdf(selectedPdf) : undefined
          }
          canShare={selectedPdf.isOwned}
          canDownload={selectedPdf.allowSave}
          canOpenInNewTab={selectedPdf.allowSave}
          isSaved={selectedPdf.isOwned}
          pdfId={selectedPdf.id}
          isOwner={selectedPdf.isOwned}
        />
      )}

      {sharingPdf && (
        <ShareDialog
          isOpen={!!sharingPdf}
          pdfName={sharingPdf.name}
          pdfId={sharingPdf.id}
          onClose={() => setSharingPdf(null)}
          onShareViaEmail={async (email: string, allowSave: boolean) => {
            console.log("Share via email:", email, allowSave);
          }}
        />
      )}
    </div>
  );
}
