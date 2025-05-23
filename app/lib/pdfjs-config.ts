import { GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';

if (typeof window !== 'undefined') {
  // Dynamically import the worker
  import('pdfjs-dist/build/pdf.worker.entry').then((worker) => {
    GlobalWorkerOptions.workerSrc = worker.default;
  });
} 