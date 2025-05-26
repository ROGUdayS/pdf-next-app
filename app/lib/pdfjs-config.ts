// Dynamic PDF.js configuration for client-side only
if (typeof window !== "undefined") {
  // Use a self-executing async function with error handling
  (async () => {
    try {
      // First try to import the main PDF.js module
      const pdfjs = await import("pdfjs-dist");

      // Configure the worker source
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.js";

      console.log("PDF.js worker configured successfully");
    } catch (error) {
      console.error("Failed to configure PDF.js worker:", error);

      // Fallback: try to configure using the build export
      try {
        const { GlobalWorkerOptions } = await import("pdfjs-dist/build/pdf");
        GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.js";
        console.log("PDF.js worker configured via fallback");
      } catch (fallbackError) {
        console.error(
          "Failed to configure PDF.js worker via fallback:",
          fallbackError
        );
      }
    }
  })();
}
