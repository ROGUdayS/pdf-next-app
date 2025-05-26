// Dynamic PDF.js configuration for client-side only
if (typeof window !== "undefined") {
  // Use a self-executing async function with error handling
  (async () => {
    try {
      // First try to import the main PDF.js module
      const pdfjs = await import("pdfjs-dist");

      // Configure the worker source with better fallback handling
      const workerSrc = "/pdf-worker/pdf.worker.min.js";

      // Set worker options with additional configuration for production
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

      // Additional configuration for better performance and stability
      if (pdfjs.GlobalWorkerOptions) {
        // Disable worker port for better compatibility
        pdfjs.GlobalWorkerOptions.workerPort = null;

        // Set maximum number of workers for better resource management
        if (typeof pdfjs.getDocument === "function") {
          // Configure document loading options
          const originalGetDocument = pdfjs.getDocument;
          pdfjs.getDocument = function (src, options = {}) {
            return originalGetDocument(src, {
              ...options,
              // Disable streaming for better compatibility on Netlify
              disableStream: true,
              // Disable auto-fetch for better control
              disableAutoFetch: true,
              // Set maximum image size
              maxImageSize: 1024 * 1024,
              // Disable font face for better performance
              disableFontFace: false,
              // Use system fonts when possible
              useSystemFonts: true,
            });
          };
        }
      }

      console.log(
        "PDF.js worker configured successfully with enhanced settings"
      );
    } catch (error) {
      console.error("Failed to configure PDF.js worker:", error);

      // Fallback: try to configure using the build export
      try {
        const { GlobalWorkerOptions } = await import("pdfjs-dist/build/pdf");
        GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.js";
        GlobalWorkerOptions.workerPort = null;
        console.log("PDF.js worker configured via fallback");
      } catch (fallbackError) {
        console.error(
          "Failed to configure PDF.js worker via fallback:",
          fallbackError
        );

        // Final fallback - try CDN worker
        try {
          const pdfjs = await import("pdfjs-dist");
          pdfjs.GlobalWorkerOptions.workerSrc =
            "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
          console.log("PDF.js worker configured via CDN fallback");
        } catch (cdnError) {
          console.error(
            "All PDF.js worker configuration attempts failed:",
            cdnError
          );
        }
      }
    }
  })();
}
