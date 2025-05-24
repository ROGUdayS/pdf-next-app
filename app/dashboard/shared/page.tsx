"use client";

import { useState, useEffect } from "react";
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

interface SharedPDF {
  id: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  thumbnailUrl: string | null;
  ownerId: string;
  isSaved: boolean;
}

export default function SharedPDFsPage() {
  const { user } = useAuth();
  const [sharedPdfs, setSharedPdfs] = useState<SharedPDF[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<SharedPDF | null>(null);
  const [sharingPdf, setSharingPdf] = useState<SharedPDF | null>(null);
  const [removingPdfId, setRemovingPdfId] = useState<string | null>(null);

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
                const pdf = {
                  id: doc.id,
                  name: data.name || "Untitled",
                  url: data.url,
                  uploadedBy: data.uploadedBy || "Unknown",
                  uploadedAt: data.uploadedAt?.toDate() || new Date(),
                  thumbnailUrl: data.thumbnailUrl,
                  ownerId: data.ownerId,
                  isSaved: false,
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

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Shared with Me</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sharedPdfs.map((pdf) => (
          <div
            key={pdf.id}
            className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-200"
          >
            <div className="cursor-pointer" onClick={() => setSelectedPdf(pdf)}>
              {pdf.thumbnailUrl ? (
                <div className="pdf-thumbnail-container">
                  <div className="pdf-thumbnail-wrapper">
                    <img
                      src={pdf.thumbnailUrl}
                      alt={`${pdf.name} thumbnail`}
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
                    className="w-12 h-12 text-gray-400 mb-2"
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
                  <span className="text-sm text-gray-400">PDF Preview</span>
                </div>
              )}
            </div>

            <div className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-4">
                  <h3 className="text-lg font-semibold text-gray-900 truncate">
                    {pdf.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Shared by: {pdf.uploadedBy}
                  </p>
                  <p className="text-sm text-gray-500">
                    {pdf.uploadedAt.toLocaleDateString()}
                  </p>
                  {pdf.isSaved && (
                    <span className="inline-block mt-2 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                      Saved to My PDFs
                    </span>
                  )}
                </div>

                <div className="relative flex-shrink-0">
                  <Menu as="div" className="relative inline-block text-left">
                    <Menu.Button className="p-2 hover:bg-gray-100 rounded-full">
                      <svg
                        className="w-5 h-5 text-gray-500"
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

                    <Menu.Items className="absolute right-0 z-50 bottom-full mb-2 w-48 origin-bottom-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
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
                              className={`${active ? "bg-gray-100" : ""} ${
                                removingPdfId === pdf.id
                                  ? "opacity-50 cursor-not-allowed"
                                  : ""
                              } flex w-full items-center px-4 py-2 text-sm text-red-600`}
                            >
                              {removingPdfId === pdf.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-3"></div>
                              ) : (
                                <svg
                                  className="mr-3 h-5 w-5 text-red-400"
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

      {!isLoading && sharedPdfs.length === 0 && !error && (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No Shared PDFs
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            No PDFs have been shared with you yet
          </p>
        </div>
      )}
    </div>
  );
}
