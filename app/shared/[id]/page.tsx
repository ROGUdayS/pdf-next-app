"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PDFViewer from "@/app/components/PDFViewer";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

interface SharedPdfData {
  id: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
  isPubliclyShared: boolean;
}

export default function SharedPDFPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [pdfData, setPdfData] = useState<SharedPdfData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {pdfData.name}
          </h1>
          <div className="text-sm text-gray-500 mb-6">
            Shared by: {pdfData.uploadedBy}
          </div>
          <PDFViewer
            fileUrl={pdfData.url}
            onClose={() => router.push("/")}
            fileName={pdfData.name}
            canShare={false}
            isAuthenticated={!!user}
            canDownload={!!user}
            canOpenInNewTab={!!user}
            onLogin={() => router.push("/")}
          />
        </div>
      </div>
    </div>
  );
}
