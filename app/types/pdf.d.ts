declare module 'pdfjs-dist/webpack' {
  export * from 'pdfjs-dist';
}

declare module 'pdfjs-dist/build/pdf.worker.entry' {
  const worker: any;
  export = worker;
}

declare module 'pdfjs-dist/build/pdf.worker.mjs' {
  const workerUrl: string;
  export default workerUrl;
} 