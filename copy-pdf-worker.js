const fs = require('fs');
const path = require('path');

// Create directories if they don't exist
const publicDir = path.join(process.cwd(), 'public', 'pdf-worker');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy the worker file
const workerSrc = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js');
const workerDest = path.join(publicDir, 'pdf.worker.min.js');

fs.copyFileSync(workerSrc, workerDest);
console.log('PDF.js worker file copied successfully!'); 