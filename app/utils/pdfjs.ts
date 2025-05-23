'use client';

let pdfjsLib: any = null;

async function loadPdfJs() {
  if (typeof window === 'undefined') return null;
  
  try {
    if (!pdfjsLib) {
      pdfjsLib = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.entry');
      pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
    }
    return pdfjsLib;
  } catch (error) {
    console.warn('PDF.js loading failed:', error);
    return null;
  }
}

export async function generatePdfThumbnail(url: string): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;

  try {
    const pdfjs = await loadPdfJs();
    if (!pdfjs) return undefined;

    const loadingTask = pdfjs.getDocument({ url });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      console.warn('Canvas context creation failed');
      return undefined;
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    try {
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      return canvas.toDataURL();
    } catch (error) {
      console.warn('PDF page rendering failed:', error);
      return undefined;
    } finally {
      try {
        if (page && typeof page.cleanup === 'function') await page.cleanup();
        if (pdf && typeof pdf.cleanup === 'function') await pdf.cleanup();
        if (pdf && typeof pdf.destroy === 'function') await pdf.destroy();
      } catch (error) {
        console.warn('PDF cleanup failed:', error);
      }
    }
  } catch (error) {
    console.warn('Error generating PDF thumbnail:', error);
    return undefined;
  }
} 