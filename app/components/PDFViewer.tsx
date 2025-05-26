"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Document, Page } from "react-pdf";
import { getAuth } from "firebase/auth";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "../lib/pdfjs-config";
import PDFComments from "./PDFComments";
import { getBaseUrl } from "@/lib/utils";

interface PDFViewerProps {
  fileUrl: string;
  onClose: () => void;
  fileName?: string;
  onShare?: () => void;
  canShare?: boolean;
  canDownload?: boolean;
  canOpenInNewTab?: boolean;
  isAuthenticated?: boolean;
  onLogin?: () => void;
  onSaveToCollection?: () => Promise<void>;
  isSaved?: boolean;
  pdfId: string;
  isOwner?: boolean;
}

export default function PDFViewer({
  fileUrl,
  onClose,
  fileName = "document.pdf",
  onShare,
  canShare = false,
  canDownload = true,
  canOpenInNewTab = true,
  isAuthenticated = true,
  onLogin,
  onSaveToCollection,
  isSaved = false,
  pdfId,
  isOwner = false,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSideBySide, setIsSideBySide] = useState(false);
  const [jumpToPage, setJumpToPage] = useState("");
  const [rotation, setRotation] = useState(0);
  const [pageDimensions, setPageDimensions] = useState<{
    width: number;
    height: number;
  }>({
    width: 0,
    height: 0,
  });
  const [fitMode, setFitMode] = useState<"width" | "page">("width");
  const [isSaving, setIsSaving] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [viewMode, setViewMode] = useState<"single" | "continuous">(
    "continuous"
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Set mobile-friendly defaults
  useEffect(() => {
    const isMobile = window.innerWidth < 768; // md breakpoint
    if (isMobile) {
      setFitMode("page");
    }
  }, []);

  // Set view mode based on number of pages
  useEffect(() => {
    if (numPages !== null) {
      if (numPages === 1) {
        setViewMode("single");
      } else {
        setViewMode("continuous");
      }
    }
  }, [numPages]);

  // Auto-hide keyboard help after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowKeyboardHelp(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle keyboard events if user is typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          if (viewMode === "single") {
            changePage(-1);
          }
          break;
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          if (viewMode === "single") {
            changePage(1);
          }
          break;
        case "Home":
          event.preventDefault();
          if (viewMode === "single") {
            setPageNumber(1);
          } else {
            // Scroll to top in continuous mode
            const pdfViewer = document.querySelector(".pdf-viewer-content");
            if (pdfViewer) {
              pdfViewer.scrollTop = 0;
            }
          }
          break;
        case "End":
          event.preventDefault();
          if (viewMode === "single") {
            setPageNumber(numPages || 1);
          } else {
            // Scroll to bottom in continuous mode
            const pdfViewer = document.querySelector(".pdf-viewer-content");
            if (pdfViewer) {
              pdfViewer.scrollTop = pdfViewer.scrollHeight;
            }
          }
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "+":
        case "=":
          event.preventDefault();
          changeScale(0.1);
          break;
        case "-":
          event.preventDefault();
          changeScale(-0.1);
          break;
        case "0":
          event.preventDefault();
          setScale(1.0);
          setFitMode("width");
          break;
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [numPages, onClose, viewMode]);

  // Capture the rendered page dimensions (already scaled & rotated)
  const handlePageLoadSuccess = ({
    width,
    height,
  }: {
    width: number;
    height: number;
  }) => {
    setPageDimensions({ width, height });
  };

  // Reset zoom/fit on window resize
  useEffect(() => {
    const onResize = () => {
      const isMobile = window.innerWidth < 768;
      setScale(1.0);
      setFitMode(isMobile ? "page" : "width");
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Fit logic, now accounts for 90°/270° by swapping intrinsic dimensions
  function toggleFit() {
    if (!containerRef.current) return;
    const { width: renderedW, height: renderedH } = pageDimensions;
    if (!renderedW || !renderedH) return;

    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight - 100; // toolbar height

    // if side-by-side, split width (space-x-4 = 16px gap)
    const pages = isSideBySide ? 2 : 1;
    const totalGap = isSideBySide ? 16 * (pages - 1) : 0;
    const availW = (containerW - totalGap) / pages;

    // intrinsic = rendered ÷ current scale
    let intrinsicW = renderedW / scale;
    let intrinsicH = renderedH / scale;

    // if rotated 90 or 270, swap them
    if (rotation % 180 !== 0) {
      [intrinsicW, intrinsicH] = [intrinsicH, intrinsicW];
    }

    if (fitMode === "width") {
      // fit to page
      const scaleW = availW / intrinsicW;
      const scaleH = containerH / intrinsicH;
      setScale(Math.min(scaleW, scaleH));
      setFitMode("page");
    } else {
      // fit to width
      setScale(availW / intrinsicW);
      setFitMode("width");
    }
  }

  // PDF.js options
  const options = useMemo(
    () => ({
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
      cMapPacked: true,
      standardFontDataUrl:
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
    }),
    []
  );

  // Fullscreen listener
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // Fetch Firebase token only if authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setAuthToken(null);
      return;
    }

    (async () => {
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        setAuthToken(token || null);
      } catch {
        setError("Authentication error. Please try again.");
      }
    })();
  }, [isAuthenticated]);

  // Build URL - use proxy for authenticated users, direct URL for non-authenticated
  const pdfUrl = useMemo(() => {
    if (!isAuthenticated) {
      return fileUrl;
    }
    if (!authToken) return null;
    const u = new URL("/api/pdf-proxy", getBaseUrl());
    u.searchParams.set("url", fileUrl);
    u.searchParams.set("token", authToken);
    // Add unique identifiers to prevent caching
    u.searchParams.set("pdfId", pdfId);
    u.searchParams.set("t", Date.now().toString());
    return u.toString();
  }, [fileUrl, authToken, isAuthenticated, pdfId]);

  // Reset state on file change
  useEffect(() => {
    setError(null);
    setPageNumber(1);
    setScale(1.0);
    const isMobile = window.innerWidth < 768;
    setFitMode(isMobile ? "page" : "width");

    // Clear any potential PDF.js caches
    if (typeof window !== "undefined") {
      try {
        // Clear PDF.js internal caches by forcing worker reload
        const pdfjsLib = (window as any).pdfjsLib;
        if (pdfjsLib?.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            "/pdf-worker/pdf.worker.min.js";
        }
      } catch (e) {
        console.log("PDF.js cache clear attempt:", e);
      }
    }
  }, [fileUrl, pdfId]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
  };

  function onDocumentLoadError(e: Error) {
    console.error(e);
    setError("Failed to load PDF. Please try again.");
  }

  function changePage(offset: number) {
    setPageNumber((p) => Math.min(Math.max(1, p + offset), numPages || 1));
  }

  function handleJumpToPage(e: React.FormEvent) {
    e.preventDefault();
    const p = parseInt(jumpToPage);
    if (!isNaN(p) && p >= 1 && p <= (numPages || 1)) {
      setPageNumber(p);
      setJumpToPage("");
    }
  }

  function changeScale(delta: number) {
    setScale((s) => Math.max(0.1, Math.min(2.0, s + delta)));
    setFitMode("width");
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  async function toggleFullscreen() {
    const viewer = document.getElementById("pdf-viewer-container");
    if (!viewer) return;
    if (!document.fullscreenElement) await viewer.requestFullscreen();
    else await document.exitFullscreen();
  }

  async function handleDownload() {
    try {
      // Fetch the PDF file as a blob
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const blob = await response.blob();

      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);

      // Create temporary link element and force download
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      a.style.display = "none";

      // Append to document, click, and cleanup
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Cleanup blob URL after a short delay
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      // Fallback to the original method if fetch fails
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
    }
  }

  function openInNewTab() {
    window.open(fileUrl, "_blank");
  }

  function rotatePages(deg: number) {
    setRotation((r) => (r + deg) % 360);
  }

  const handleSaveToCollection = async () => {
    if (!onSaveToCollection || isSaved || isSaving) return;

    try {
      setIsSaving(true);
      await onSaveToCollection();
    } catch (err) {
      console.error("Error saving PDF:", err);
      setError("Failed to save PDF");
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // Render all pages for continuous view
  const renderAllPages = () => {
    if (!numPages) return null;

    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      pages.push(
        <div key={`page_${i}`} className="mb-4">
          <Page
            pageNumber={i}
            scale={scale}
            rotate={rotation}
            onLoadSuccess={handlePageLoadSuccess}
            className="shadow-lg"
          />
        </div>
      );
    }
    return pages;
  };

  if (!pdfUrl) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-card rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div
        id="pdf-viewer-container"
        ref={containerRef}
        className={`bg-background rounded-lg p-2 sm:p-4 w-full flex flex-col ${
          isFullscreen ? "h-screen max-w-none" : "max-h-[95vh] max-w-6xl"
        }`}
        tabIndex={0}
      >
        {/* Mobile Toolbar */}
        <div className="md:hidden">
          {/* Mobile Top Bar */}
          <div className="flex justify-between items-center mb-2 p-2 bg-card rounded-lg border border-border">
            <div className="flex items-center space-x-2">
              {viewMode === "single" && (
                <>
                  <button
                    onClick={() => changePage(-1)}
                    disabled={pageNumber <= 1}
                    className="p-2 bg-secondary text-secondary-foreground rounded-md disabled:opacity-50 hover:bg-secondary/80"
                    title="Previous page"
                    aria-label="Go to previous page"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>

                  <form
                    onSubmit={handleJumpToPage}
                    className="flex items-center space-x-1"
                  >
                    <label
                      htmlFor="page-number-input-mobile"
                      className="sr-only"
                    >
                      Page number
                    </label>
                    <input
                      id="page-number-input-mobile"
                      type="number"
                      value={jumpToPage}
                      onChange={(e) => setJumpToPage(e.target.value)}
                      className="w-12 px-1 py-1 text-sm border border-border rounded-md bg-background text-foreground"
                      placeholder={`${pageNumber}`}
                      min={1}
                      max={numPages || 1}
                      aria-label="Jump to page number"
                    />
                    <span className="text-sm text-foreground">
                      /{numPages || "?"}
                    </span>
                  </form>

                  <button
                    onClick={() => changePage(1)}
                    disabled={pageNumber >= (numPages || 1)}
                    className="p-2 bg-secondary text-secondary-foreground rounded-md disabled:opacity-50 hover:bg-secondary/80"
                    title="Next page"
                    aria-label="Go to next page"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </>
              )}

              {viewMode === "continuous" && (
                <div className="text-sm text-foreground">
                  Continuous View ({numPages || "?"} pages)
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 hover:bg-secondary rounded-md text-foreground"
                title="More options"
                aria-label="Show more options"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                  />
                </svg>
              </button>

              <button
                onClick={onClose}
                className="p-2 hover:bg-secondary rounded-md text-foreground"
                title="Close"
                aria-label="Close PDF viewer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {showMobileMenu && (
            <div className="mb-2 p-3 bg-card rounded-lg border border-border space-y-3">
              {/* View Mode Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">View:</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setViewMode("single")}
                    className={`p-2 rounded-md ${
                      viewMode === "single"
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "hover:bg-secondary text-foreground"
                    }`}
                    title="Single page view"
                    aria-label="Switch to single page view"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode("continuous")}
                    className={`p-2 rounded-md ${
                      viewMode === "continuous"
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "hover:bg-secondary text-foreground"
                    }`}
                    title="Continuous scroll view"
                    aria-label="Switch to continuous scroll view"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Zoom:</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => changeScale(-0.1)}
                    className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                  <span className="min-w-[50px] text-center text-sm text-foreground">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    onClick={() => changeScale(0.1)}
                    className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={toggleFit}
                  className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 text-sm flex items-center justify-center space-x-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
                    />
                  </svg>
                  <span>{fitMode === "width" ? "Fit Page" : "Fit Width"}</span>
                </button>

                <button
                  onClick={() => rotatePages(90)}
                  className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 text-sm flex items-center justify-center space-x-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Rotate</span>
                </button>

                {canDownload && (
                  <button
                    onClick={handleDownload}
                    className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 text-sm flex items-center justify-center space-x-2"
                  >
                    <svg
                      className="w-4 h-4"
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
                    <span>Download</span>
                  </button>
                )}

                {canShare && onShare && (
                  <button
                    onClick={onShare}
                    className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 text-sm flex items-center justify-center space-x-2"
                  >
                    <svg
                      className="w-4 h-4"
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
                    <span>Share</span>
                  </button>
                )}

                {isAuthenticated && onSaveToCollection && !isSaved && (
                  <button
                    onClick={handleSaveToCollection}
                    disabled={isSaving}
                    className="px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 text-sm flex items-center justify-center space-x-2"
                  >
                    {isSaving ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span>Save PDF</span>
                      </>
                    )}
                  </button>
                )}

                {isAuthenticated && isSaved && (
                  <div className="px-3 py-2 bg-secondary text-secondary-foreground rounded-md flex items-center justify-center space-x-2 text-sm">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>Saved</span>
                  </div>
                )}

                {!isAuthenticated && onLogin && (
                  <button
                    onClick={onLogin}
                    className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center justify-center space-x-2 text-sm col-span-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                      />
                    </svg>
                    <span>Log in</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop Toolbar */}
        <div className="hidden md:flex flex-wrap justify-between items-center gap-4 mb-4 p-2 bg-card rounded-lg border border-border">
          {/* Left */}
          <div className="flex items-center space-x-4">
            {viewMode === "single" ? (
              <>
                <button
                  onClick={() => changePage(-1)}
                  disabled={pageNumber <= 1}
                  className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md disabled:opacity-50 hover:bg-secondary/80"
                  title="Previous page (← or ↑)"
                >
                  Previous
                </button>
                <form
                  onSubmit={handleJumpToPage}
                  className="flex items-center space-x-2"
                >
                  <label
                    htmlFor="page-number-input-desktop"
                    className="sr-only"
                  >
                    Page number
                  </label>
                  <input
                    id="page-number-input-desktop"
                    type="number"
                    value={jumpToPage}
                    onChange={(e) => setJumpToPage(e.target.value)}
                    className="w-16 px-2 py-1 border border-border rounded-md bg-background text-foreground"
                    placeholder={`${pageNumber}`}
                    min={1}
                    max={numPages || 1}
                    aria-label="Jump to page number"
                  />
                  <span className="text-foreground">/ {numPages || "?"}</span>
                </form>
                <button
                  onClick={() => changePage(1)}
                  disabled={pageNumber >= (numPages || 1)}
                  className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md disabled:opacity-50 hover:bg-secondary/80"
                  title="Next page (→ or ↓)"
                >
                  Next
                </button>
              </>
            ) : (
              <div className="text-foreground">
                Continuous View ({numPages || "?"} pages)
              </div>
            )}
          </div>

          {/* Center */}
          <div className="flex items-center space-x-4">
            {/* View Mode Toggle */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode("single")}
                className={`p-2 rounded-md ${
                  viewMode === "single"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-secondary text-foreground"
                }`}
                title="Single page view"
                aria-label="Switch to single page view"
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("continuous")}
                className={`p-2 rounded-md ${
                  viewMode === "continuous"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-secondary text-foreground"
                }`}
                title="Continuous scroll view"
                aria-label="Switch to continuous scroll view"
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
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </button>
            </div>

            <div className="h-6 w-px bg-border" />

            <div className="flex items-center space-x-2">
              <button
                onClick={() => changeScale(-0.1)}
                className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
                title="Zoom out (-)"
                aria-label="Zoom out"
              >
                -
              </button>
              <span className="min-w-[60px] text-center text-foreground">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={() => changeScale(0.1)}
                className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
                title="Zoom in (+)"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>

            <button
              onClick={toggleFit}
              className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
              title={fitMode === "width" ? "Fit to page" : "Fit to width"}
              aria-label={fitMode === "width" ? "Fit to page" : "Fit to width"}
            >
              {fitMode === "width" ? "Fit Page" : "Fit Width"}
            </button>

            <div className="h-6 w-px bg-border" />

            <button
              onClick={() => rotatePages(90)}
              className="p-2 hover:bg-secondary rounded-md text-foreground"
              title="Rotate"
              aria-label="Rotate pages 90 degrees"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            <button
              onClick={() => setIsSideBySide((s) => !s)}
              className={`p-2 rounded-md ${
                isSideBySide
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "hover:bg-secondary text-foreground"
              }`}
              title="Toggle side-by-side view"
              disabled={viewMode === "continuous"}
              aria-label="Toggle side-by-side view"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"
                />
              </svg>
            </button>
          </div>

          {/* Right */}
          <div className="flex items-center space-x-4">
            {isAuthenticated && onSaveToCollection && !isSaved && (
              <button
                onClick={handleSaveToCollection}
                disabled={isSaving}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center space-x-2 disabled:opacity-50"
                title="Save to My PDFs"
              >
                {isSaving ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  <>
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
                        d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>Save PDF</span>
                  </>
                )}
              </button>
            )}

            {isAuthenticated && isSaved && (
              <div className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md flex items-center space-x-2">
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Saved</span>
              </div>
            )}

            {canShare && onShare && (
              <button
                onClick={onShare}
                className="p-2 hover:bg-secondary rounded-md text-foreground"
                title="Share PDF"
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
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
              </button>
            )}

            {canDownload && (
              <button
                onClick={handleDownload}
                className="p-2 hover:bg-secondary rounded-md text-foreground"
                title="Download PDF"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </button>
            )}

            {canOpenInNewTab && (
              <button
                onClick={openInNewTab}
                className="p-2 hover:bg-secondary rounded-md text-foreground"
                title="Open in new tab"
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
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </button>
            )}

            {!isAuthenticated && onLogin && (
              <button
                onClick={onLogin}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center space-x-2"
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
                    d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                  />
                </svg>
                <span>Log in</span>
              </button>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-secondary rounded-md text-foreground"
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {isFullscreen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
                  />
                )}
              </svg>
            </button>

            {isAuthenticated && (
              <button
                onClick={() => setShowComments(!showComments)}
                className={`p-2 rounded-md ${
                  showComments
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-secondary text-foreground"
                }`}
                title="Toggle Comments"
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
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 hover:bg-secondary rounded-md text-foreground"
              title="Close"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Keyboard shortcuts help text with fade out animation */}
        {showKeyboardHelp && (
          <div className="hidden md:block text-xs text-muted-foreground mb-2 text-center transition-opacity duration-500 ease-in-out">
            Use arrow keys to navigate pages • + / - to zoom • 0 to reset zoom •
            Esc to close
          </div>
        )}

        {/* Mobile Floating Comments Button */}
        {isAuthenticated && (
          <button
            onClick={() => setShowComments(!showComments)}
            className={`md:hidden fixed bottom-6 right-6 z-10 w-14 h-14 rounded-full shadow-lg flex items-center justify-center ${
              showComments
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-card text-foreground hover:bg-card/90 border border-border"
            }`}
            title="Toggle Comments"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
              />
            </svg>
          </button>
        )}

        {/* Main Content */}
        <div
          className={`flex-1 overflow-hidden ${
            showComments ? "flex flex-col md:flex-row" : "flex"
          }`}
        >
          {/* PDF Viewer */}
          <div
            className={`flex-1 overflow-auto pdf-viewer-content ${
              showComments ? "md:mr-4" : ""
            }`}
          >
            <div
              className={`flex justify-center ${
                isSideBySide && !showComments && viewMode === "single"
                  ? "space-x-4"
                  : ""
              }`}
            >
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                key={`pdf-${pdfId}-${fileUrl}`}
                loading={
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
                  </div>
                }
                error={
                  <div className="text-center py-8">
                    <div className="text-destructive mb-2">
                      {error || "Failed to load PDF."}
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                    >
                      Try Again
                    </button>
                  </div>
                }
                options={options}
              >
                {viewMode === "continuous" ? (
                  <div className="space-y-4">{renderAllPages()}</div>
                ) : (
                  <div
                    className={`flex ${
                      isSideBySide && !showComments ? "space-x-4" : ""
                    }`}
                  >
                    <Page
                      key={`page_${pageNumber}_rot_${rotation}`}
                      pageNumber={pageNumber}
                      scale={scale}
                      rotate={rotation}
                      onLoadSuccess={handlePageLoadSuccess}
                    />
                    {isSideBySide &&
                      pageNumber < (numPages || 0) &&
                      !showComments && (
                        <Page
                          key={`page_${pageNumber + 1}_rot_${rotation}`}
                          pageNumber={pageNumber + 1}
                          scale={scale}
                          rotate={rotation}
                          onLoadSuccess={handlePageLoadSuccess}
                        />
                      )}
                  </div>
                )}
              </Document>
            </div>
          </div>

          {/* Comments Sidebar */}
          {showComments && (
            <div
              className={`${
                showComments
                  ? "w-full md:w-80 mt-4 md:mt-0 h-64 md:h-auto"
                  : "w-80"
              } flex-shrink-0 bg-card rounded-lg overflow-hidden border border-border`}
            >
              <PDFComments
                pdfId={pdfId}
                isOwner={isOwner}
                isAuthorized={isAuthenticated}
                fileUrl={fileUrl}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
