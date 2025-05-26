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
        // Set maximum number of workers for better resource management
        if (typeof pdfjs.getDocument === "function") {
          // Store original function
          const originalGetDocument = pdfjs.getDocument;

          // Override getDocument to force fresh instances in production
          pdfjs.getDocument = function (src: any) {
            const isProduction =
              window.location.hostname.includes("netlify") ||
              window.location.hostname.includes("vercel") ||
              process.env.NODE_ENV === "production";

            // If src is already an object with options, merge with our options
            let finalSrc = src;
            if (
              typeof src === "object" &&
              src !== null &&
              !ArrayBuffer.isView(src)
            ) {
              finalSrc = {
                ...src,
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
                // Production-specific options
                ...(isProduction && {
                  // Disable all caching in production
                  disableRange: true,
                  disableWorker: true,
                  verbosity: 0,
                  // Force fresh document loading
                  cacheKey: `${Date.now()}-${Math.random()}`,
                  // Disable any internal caching
                  useOnlyCssZoom: true,
                }),
              };
            } else if (isProduction) {
              // For string URLs or other types, wrap in options object
              finalSrc = {
                url: src,
                disableStream: true,
                disableAutoFetch: true,
                maxImageSize: 1024 * 1024,
                disableFontFace: false,
                useSystemFonts: true,
                disableRange: true,
                disableWorker: true,
                verbosity: 0,
                cacheKey: `${Date.now()}-${Math.random()}`,
                useOnlyCssZoom: true,
              };
            }

            return originalGetDocument(finalSrc);
          };

          // Clear any existing caches in production
          if (
            window.location.hostname.includes("netlify") ||
            window.location.hostname.includes("vercel") ||
            process.env.NODE_ENV === "production"
          ) {
            try {
              // Force cleanup of any cached documents
              if (typeof (pdfjs.getDocument as any).cache !== "undefined") {
                try {
                  (pdfjs.getDocument as any).cache.clear();
                } catch (e) {
                  console.log("Cache clear attempt:", e);
                }
              }

              // Additional cleanup for production
              if (typeof (pdfjs as any).PDFDocumentProxy !== "undefined") {
                try {
                  (pdfjs as any).PDFDocumentProxy.prototype.cleanup =
                    function () {
                      // Force cleanup of all resources
                      if ((this as any)._transport) {
                        (this as any)._transport.destroy();
                      }
                    };
                } catch (e) {
                  console.log("Prototype cleanup setup:", e);
                }
              }
            } catch (e) {
              console.log("Cache clearing:", e);
            }
          }
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
