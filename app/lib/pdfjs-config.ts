import { GlobalWorkerOptions } from "pdfjs-dist/build/pdf";

if (typeof window !== "undefined") {
  // Set the worker source path
  GlobalWorkerOptions.workerSrc = "/pdf-worker/pdf.worker.min.js";
}
