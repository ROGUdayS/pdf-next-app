"use client";

import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.js";
}

export async function generatePdfThumbnail(
  url: string
): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;

  try {
    console.log("Starting thumbnail generation for:", url);

    // Create loading task with range request enabled
    const loadingTask = pdfjsLib.getDocument({
      url: url,
      rangeChunkSize: 65536,
      disableRange: false,
      disableStream: false,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
      cMapPacked: true,
    });

    console.log("PDF loading started");
    const pdf = await loadingTask.promise;
    console.log("PDF loaded successfully");

    const page = await pdf.getPage(1);
    const originalViewport = page.getViewport({ scale: 1.0 });

    // Calculate scale to achieve desired width while maintaining aspect ratio
    const DESIRED_WIDTH = 800; // Increased width for better quality
    const scale = DESIRED_WIDTH / originalViewport.width;
    const viewport = page.getViewport({ scale });

    console.log("Viewport dimensions:", {
      original: {
        width: originalViewport.width,
        height: originalViewport.height,
      },
      scaled: { width: viewport.width, height: viewport.height, scale },
    });

    // Create a canvas with the desired dimensions
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: true,
    });

    if (!context) {
      console.error("Canvas context creation failed");
      return undefined;
    }

    // Set white background
    context.fillStyle = "rgb(255, 255, 255)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    try {
      // Render PDF page
      await page.render({
        canvasContext: context,
        viewport: viewport,
        background: "rgb(255, 255, 255)",
        intent: "display",
      }).promise;

      console.log("Page rendered successfully");

      // Create a new canvas for the final image
      const finalCanvas = document.createElement("canvas");
      const finalContext = finalCanvas.getContext("2d", {
        alpha: false,
        willReadFrequently: true,
      });

      if (!finalContext) {
        console.error("Final canvas context creation failed");
        return undefined;
      }

      // Set dimensions for the final canvas
      finalCanvas.width = viewport.width;
      finalCanvas.height = viewport.height;

      // Fill with white background
      finalContext.fillStyle = "rgb(255, 255, 255)";
      finalContext.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

      // Draw the rendered PDF
      finalContext.drawImage(canvas, 0, 0);

      // Convert to PNG with maximum quality
      const thumbnailUrl = finalCanvas.toDataURL("image/png", 1.0);

      // Verify the thumbnail
      const verifyPromise = new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          if (img.width > 0 && img.height > 0) {
            console.log("Thumbnail verified:", {
              width: img.width,
              height: img.height,
              dataLength: thumbnailUrl.length,
            });
            resolve(thumbnailUrl);
          } else {
            reject(new Error("Generated thumbnail has invalid dimensions"));
          }
        };
        img.onerror = () => reject(new Error("Failed to verify thumbnail"));
        img.src = thumbnailUrl;
      });

      return await verifyPromise;
    } catch (error) {
      console.error("PDF page rendering failed:", error);
      return undefined;
    } finally {
      // Cleanup
      try {
        if (page && typeof page.cleanup === "function") await page.cleanup();
        if (pdf && typeof pdf.cleanup === "function") await pdf.cleanup();
        if (pdf && typeof pdf.destroy === "function") await pdf.destroy();
      } catch (error) {
        console.error("PDF cleanup failed:", error);
      }
    }
  } catch (error) {
    console.error("Error generating PDF thumbnail:", error);
    return undefined;
  }
}
