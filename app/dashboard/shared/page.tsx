"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  DocumentData,
  doc,
  updateDoc,
  arrayRemove,
  deleteDoc,
} from "firebase/firestore";
import PDFViewer from "@/app/components/PDFViewer";
import ShareDialog from "@/app/components/ShareDialog";
import { Menu } from "@headlessui/react";
import Image from "next/image";

interface SharedPDF {
  id: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  thumbnailUrl: string | null;
  ownerId: string;
  isSaved: boolean;
  size?: number;
  allowSave?: boolean;
}

type ViewMode = "grid" | "list";
type SortOption = "name" | "date" | "size" | "sharedBy";
type SortDirection = "asc" | "desc";

export default function SharedPDFsPage() {
  const { user } = useAuth();
  const [sharedPdfs, setSharedPdfs] = useState<SharedPDF[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<SharedPDF | null>(null);
  const [sharingPdf, setSharingPdf] = useState<SharedPDF | null>(null);
  const [removingPdfId, setRemovingPdfId] = useState<string | null>(null);

  // New state for view options, search, and sorting
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Enhanced sorted and filtered PDFs with search and sorting
  const filteredAndSortedPdfs = useMemo(() => {
    let filtered = [...sharedPdfs];

    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (pdf) =>
          pdf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          pdf.uploadedBy.toLowerCase().includes(searchTerm.toLowerCase())
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
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case "sharedBy":
          comparison = a.uploadedBy.localeCompare(b.uploadedBy);
          break;
        default:
          comparison = b.uploadedAt.getTime() - a.uploadedAt.getTime();
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [sharedPdfs, searchTerm, sortBy, sortDirection]);

  const removeFromShared = async (pdfId: string) => {
    if (!user?.email) return;

    try {
      setRemovingPdfId(pdfId);
      setError(null);

      // First, check if there's a saved copy
      const savedQuery = query(
        collection(db, "pdfs"),
        where("originalPdfId", "==", pdfId),
        where("ownerId", "==", user.uid)
      );
      const savedSnapshot = await getDocs(savedQuery);

      // If there's a saved copy, delete it
      if (!savedSnapshot.empty) {
        await deleteDoc(doc(db, "pdfs", savedSnapshot.docs[0].id));
      }

      // Remove user's access from the original shared PDF
      const pdfRef = doc(db, "pdfs", pdfId);
      await updateDoc(pdfRef, {
        accessUsers: arrayRemove(user.email),
      });

      setError("Removed from shared list");
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error("Error removing from shared list:", err);
      setError("Failed to remove from shared list");
    } finally {
      setRemovingPdfId(null);
    }
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

  useEffect(() => {
    if (!user?.email) {
      setIsLoading(false);
      return;
    }

    setError(null);

    const sharedQuery = query(
      collection(db, "pdfs"),
      where("accessUsers", "array-contains", user.email)
    );

    const unsubscribe = onSnapshot(
      sharedQuery,
      async (snapshot) => {
        try {
          const updatedPdfs = await Promise.all(
            snapshot.docs
              .filter((doc) => doc.data().ownerId !== user.uid)
              .map(async (doc) => {
                const data = doc.data() as DocumentData;
                const pdf: SharedPDF = {
                  id: doc.id,
                  name: data.name || "Untitled",
                  url: data.url,
                  uploadedBy: data.uploadedBy || "Unknown",
                  uploadedAt: data.uploadedAt?.toDate() || new Date(),
                  thumbnailUrl: data.thumbnailUrl || null,
                  ownerId: data.ownerId,
                  isSaved: false,
                  size: data.size || 0,
                  allowSave: data.allowSave || false,
                };

                if (user?.uid) {
                  const savedQuery = query(
                    collection(db, "pdfs"),
                    where("originalPdfId", "==", pdf.id),
                    where("ownerId", "==", user.uid)
                  );
                  const savedSnapshot = await getDocs(savedQuery);
                  pdf.isSaved = !savedSnapshot.empty;
                }

                return pdf;
              })
          );

          setSharedPdfs(updatedPdfs);
          setIsLoading(false);
        } catch (err) {
          console.error("Error processing shared PDFs:", err);
          setError("Failed to load shared PDFs");
          setIsLoading(false);
        }
      },
      (err) => {
        console.error("Error in shared PDFs listener:", err);
        setError("Error loading shared PDFs");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Grid view component
  const GridView = ({ pdfs }: { pdfs: SharedPDF[] }) => (
    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {pdfs.map((pdf) => (
        <div
          key={pdf.id}
          className="bg-card rounded-lg shadow-sm overflow-visible hover:shadow-md transition-shadow duration-200 border border-border"
        >
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
                    onError={(e) => {
                      const target = e.target as HTMLElement;
                      target.style.display = "none";
                      target.parentElement?.classList.add("pdf-fallback");
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
                  Shared by: {pdf.uploadedBy}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pdf.uploadedAt.toLocaleDateString()}
                </p>
                {pdf.isSaved && (
                  <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded">
                    Saved to My PDFs
                  </span>
                )}
              </div>

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
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(
                                  "Remove this PDF from your shared list? You can always regain access through the share link."
                                )
                              ) {
                                removeFromShared(pdf.id);
                              }
                            }}
                            disabled={removingPdfId === pdf.id}
                            className={`${active ? "bg-accent" : ""} ${
                              removingPdfId === pdf.id
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            } flex w-full items-center px-4 py-2 text-sm text-destructive`}
                          >
                            {removingPdfId === pdf.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-destructive mr-3"></div>
                            ) : (
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
                            )}
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
  const ListView = ({ pdfs }: { pdfs: SharedPDF[] }) => (
    <div className="bg-card shadow-sm rounded-lg overflow-visible border border-border">
      <div className="px-6 py-3 bg-muted border-b border-border">
        <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
          <div className="col-span-1"></div>
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-2">Shared By</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-1"></div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {pdfs.map((pdf) => (
          <div
            key={pdf.id}
            className="px-6 py-4 hover:bg-accent cursor-pointer transition-colors"
            onClick={() => setSelectedPdf(pdf)}
          >
            <div className="grid grid-cols-12 gap-4 items-center">
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
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-card-foreground truncate">
                    {pdf.name}
                  </p>
                  {pdf.isSaved && (
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 rounded">
                      Saved
                    </span>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(pdf.size || 0)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-muted-foreground">
                  {pdf.uploadedBy}
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
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                window.confirm(
                                  "Remove this PDF from your shared list? You can always regain access through the share link."
                                )
                              ) {
                                removeFromShared(pdf.id);
                              }
                            }}
                            disabled={removingPdfId === pdf.id}
                            className={`${active ? "bg-accent" : ""} ${
                              removingPdfId === pdf.id
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            } flex w-full items-center px-4 py-2 text-sm text-destructive`}
                          >
                            {removingPdfId === pdf.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-destructive mr-3"></div>
                            ) : (
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
                            )}
                            Remove
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
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Please Log In</h2>
          <p className="text-gray-600">
            You need to be logged in to view shared PDFs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedPdf && (
        <PDFViewer
          fileUrl={selectedPdf.url}
          onClose={() => setSelectedPdf(null)}
          fileName={selectedPdf.name}
          canShare={selectedPdf.ownerId === user.uid}
          onShare={() => setSharingPdf(selectedPdf)}
          pdfId={selectedPdf.id}
          isOwner={selectedPdf.ownerId === user.uid}
          onSaveToCollection={
            selectedPdf.allowSave && selectedPdf.ownerId !== user?.uid
              ? async () => {
                  // Add your save to collection logic here
                  console.log("Save to collection:", selectedPdf.id);
                }
              : undefined
          }
          isSaved={selectedPdf.isSaved}
        />
      )}

      {sharingPdf && (
        <ShareDialog
          isOpen={!!sharingPdf}
          onClose={() => setSharingPdf(null)}
          onShareViaEmail={async () => {}}
          onShareViaLink={async () => ""}
          pdfName={sharingPdf.name}
        />
      )}

      {/* Header with search, view toggle */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Shared with Me
            </h1>
            <p className="text-muted-foreground mt-1">
              PDFs that have been shared with you by other users.
            </p>
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
              placeholder="Search shared PDFs..."
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
                <option value="sharedBy-asc">Shared by A-Z</option>
                <option value="sharedBy-desc">Shared by Z-A</option>
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

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* PDF Grid or List */}
      {viewMode === "grid" ? (
        <GridView pdfs={filteredAndSortedPdfs} />
      ) : (
        <ListView pdfs={filteredAndSortedPdfs} />
      )}

      {!isLoading && filteredAndSortedPdfs.length === 0 && !error && (
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
            {searchTerm ? "No PDFs found" : "No Shared PDFs"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm
              ? `No PDFs match "${searchTerm}"`
              : "No PDFs have been shared with you yet"}
          </p>
        </div>
      )}
    </div>
  );
}
