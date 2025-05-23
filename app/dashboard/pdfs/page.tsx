'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { storage, db } from '@/lib/firebase';
import type { FirebaseStorage } from 'firebase/storage';
import type { Firestore } from 'firebase/firestore';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { generatePdfThumbnail } from '@/app/utils/pdfjs';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  uploadBytesResumable,
  StorageReference,
  deleteObject
} from 'firebase/storage';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  Timestamp,
  deleteDoc,
  updateDoc,
  doc,
  DocumentReference,
  orderBy,
  onSnapshot,
  getDoc
} from 'firebase/firestore';
import Image from 'next/image';
import PDFViewer from '@/app/components/PDFViewer';

interface PdfFile {
  id: string;
  name: string;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
  size: number;
  accessUsers: string[];
  thumbnail?: string;
  ownerId: string;
  thumbnailUrl?: string;
  thumbnailPath?: string;
  storagePath?: string;
}

// Cache for storing thumbnails - move outside component to persist between renders
const thumbnailCache = new Map<string, string>();
const processedPdfs = new Set<string>();

export default function PDFsPage() {
  const { user } = useAuth();
  const [pdfs, setPdfs] = useState<Map<string, PdfFile>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [deletingPdfId, setDeletingPdfId] = useState<string | null>(null);
  const [renamingPdfId, setRenamingPdfId] = useState<string | null>(null);
  const [editingPdf, setEditingPdf] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [selectedPdf, setSelectedPdf] = useState<PdfFile | null>(null);

  // Function to process a PDF and generate its thumbnail
  const processPdf = async (doc: any): Promise<PdfFile> => {
    const data = doc.data();
    
    // If we already have the thumbnailUrl from Firestore, use that directly
    if (data.thumbnailUrl && !processedPdfs.has(doc.id)) {
      processedPdfs.add(doc.id);
      return {
        id: doc.id,
        name: data.name || 'Untitled',
        url: data.url,
        uploadedBy: data.uploadedBy || 'Unknown',
        uploadedAt: data.uploadedAt?.toDate() || new Date(),
        size: data.size || 0,
        accessUsers: data.accessUsers || [],
        ownerId: data.ownerId,
        thumbnailUrl: data.thumbnailUrl,
        thumbnailPath: data.thumbnailPath,
        storagePath: data.storagePath
      };
    }

    let thumbnail: string | undefined = thumbnailCache.get(doc.id);

    if (!thumbnail && data.url && data.storagePath && !processedPdfs.has(doc.id)) {
      try {
        console.log('Generating thumbnail for PDF:', data.name);
        const storageRef = ref(storage, data.storagePath);
        const freshUrl = await getDownloadURL(storageRef);
        
        const newThumbnail = await generatePdfThumbnail(freshUrl);
        if (newThumbnail) {
          thumbnailCache.set(doc.id, newThumbnail);
          thumbnail = newThumbnail;

          try {
            const response = await fetch(newThumbnail);
            const blob = await response.blob();
            
            const thumbnailFileName = `${doc.id}.png`;
            const thumbnailPath = `pdfs/${data.ownerId}/thumbnails/${thumbnailFileName}`;
            const thumbnailRef = ref(storage, thumbnailPath);
            
            await uploadBytes(thumbnailRef, blob, {
              contentType: 'image/png',
              customMetadata: {
                pdfId: doc.id,
                originalName: data.name
              }
            });
            
            const thumbnailUrl = await getDownloadURL(thumbnailRef);
            
            await updateDoc(doc.ref, {
              thumbnailUrl: thumbnailUrl,
              thumbnailPath: thumbnailPath
            });
            
            // Mark this PDF as processed
            processedPdfs.add(doc.id);
            
            return {
              id: doc.id,
              name: data.name || 'Untitled',
              url: data.url,
              uploadedBy: data.uploadedBy || 'Unknown',
              uploadedAt: data.uploadedAt?.toDate() || new Date(),
              size: data.size || 0,
              accessUsers: data.accessUsers || [],
              ownerId: data.ownerId,
              thumbnailUrl: thumbnailUrl,
              thumbnailPath: thumbnailPath,
              storagePath: data.storagePath
            };
          } catch (thumbnailError) {
            console.error('Error saving thumbnail:', thumbnailError);
          }
        }
      } catch (error) {
        console.error('Failed to process PDF:', doc.id, error);
      }
    }

    return {
      id: doc.id,
      name: data.name || 'Untitled',
      url: data.url,
      uploadedBy: data.uploadedBy || 'Unknown',
      uploadedAt: data.uploadedAt?.toDate() || new Date(),
      size: data.size || 0,
      accessUsers: data.accessUsers || [],
      thumbnail,
      ownerId: data.ownerId,
      thumbnailUrl: data.thumbnailUrl,
      thumbnailPath: data.thumbnailPath,
      storagePath: data.storagePath
    };
  };

  // Effect to set up real-time listeners for PDFs
  useEffect(() => {
    let ownedUnsubscribe: (() => void) | null = null;
    let sharedUnsubscribe: (() => void) | null = null;
    let isMounted = true;

    const setupRealTimeListeners = async () => {
      if (!user) {
        setIsInitialLoading(false);
        return;
      }

      try {
        // Query for owned PDFs
        const ownedQuery = query(
          collection(db, 'pdfs'),
          where('ownerId', '==', user.uid),
          orderBy('uploadedAt', 'desc')
        );

        // Query for shared PDFs
        const sharedQuery = query(
          collection(db, 'pdfs'),
          where('accessUsers', 'array-contains', user.email),
          orderBy('uploadedAt', 'desc')
        );

        // Set up real-time listener for owned PDFs
        ownedUnsubscribe = onSnapshot(ownedQuery, async (snapshot) => {
          if (!isMounted) return;

          const processedPdfs = await Promise.all(
            snapshot.docs.map(processPdf)
          );

          setPdfs(current => {
            const newMap = new Map(current);
            // Update or add owned PDFs
            processedPdfs.forEach(pdf => {
              newMap.set(pdf.id, pdf);
            });
            // Remove any owned PDFs that no longer exist
            const ownedIds = new Set(processedPdfs.map(pdf => pdf.id));
            for (const [id, pdf] of newMap) {
              if (pdf.ownerId === user.uid && !ownedIds.has(id)) {
                newMap.delete(id);
              }
            }
            return newMap;
          });
        }, (error) => {
          console.error('Error in owned PDFs listener:', error);
          setError('Error loading your PDFs');
        });

        // Set up real-time listener for shared PDFs
        sharedUnsubscribe = onSnapshot(sharedQuery, async (snapshot) => {
          if (!isMounted) return;

          const processedPdfs = await Promise.all(
            snapshot.docs.map(processPdf)
          );

          setPdfs(current => {
            const newMap = new Map(current);
            // Update or add shared PDFs
            processedPdfs.forEach(pdf => {
              if (!newMap.has(pdf.id) || pdf.ownerId !== user.uid) {
                newMap.set(pdf.id, pdf);
              }
            });
            // Remove any shared PDFs that no longer exist
            const sharedIds = new Set(processedPdfs.map(pdf => pdf.id));
            for (const [id, pdf] of newMap) {
              if (pdf.ownerId !== user.uid && !sharedIds.has(id)) {
                newMap.delete(id);
              }
            }
            return newMap;
          });
        }, (error) => {
          console.error('Error in shared PDFs listener:', error);
          setError('Error loading shared PDFs');
        });

        setIsInitialLoading(false);
      } catch (error) {
        console.error('Error setting up PDF listeners:', error);
        setError('Failed to load PDFs');
        setIsInitialLoading(false);
      }
    };

    setupRealTimeListeners();

    return () => {
      isMounted = false;
      if (ownedUnsubscribe) ownedUnsubscribe();
      if (sharedUnsubscribe) sharedUnsubscribe();
    };
  }, [user]);

  // Convert Map to sorted array for rendering
  const sortedPdfs = useMemo(() => {
    return Array.from(pdfs.values()).sort((a, b) => 
      b.uploadedAt.getTime() - a.uploadedAt.getTime()
    );
  }, [pdfs]);

  // Modified handleFileUpload to store storage path
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) {
      console.log('No file selected or user not logged in');
      return;
    }
    
    // Clear input and reset states immediately
    event.target.value = '';
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    // Validate file
    if (file.type !== 'application/pdf') {
      setError('Please upload only PDF files');
      setIsUploading(false);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File size should be less than 10MB');
      setIsUploading(false);
      return;
    }
    
    try {
      const fileName = `${Date.now()}-${file.name}`;
      const storagePath = `pdfs/${user.uid}/${fileName}`;
      const storageRef = ref(storage, storagePath);
      
      // Upload file
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress);
          setUploadProgress(progress);
          
          if (progress === 100) {
            setTimeout(() => {
              setIsUploading(false);
              setUploadProgress(0);
            }, 500);
          }
        },
        (error) => {
          console.error('Upload error:', error);
          setError(`Upload failed: ${error.message}`);
          setIsUploading(false);
          setUploadProgress(0);
        },
        async () => {
          try {
            const url = await getDownloadURL(storageRef);
            
            // Add to Firestore with storage path
            await addDoc(collection(db, 'pdfs'), {
              name: file.name,
              url: url,
              storagePath: storagePath,
              uploadedBy: user.email,
              uploadedAt: Timestamp.now(),
              size: file.size,
              accessUsers: [user.email as string],
              ownerId: user.uid,
              thumbnailUrl: null
            });

            setError(null);
          } catch (error: any) {
            console.error('Error in upload completion:', error);
            setError(`Failed to save PDF: ${error.message}`);
          }
        }
      );
    } catch (error: any) {
      console.error('Upload process failed:', error);
      setError(`Upload failed: ${error.message}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Delete PDF function
  const handleDelete = async (pdf: PdfFile) => {
    if (!user) {
      setError('You must be logged in to delete PDFs');
      return;
    }

    if (pdf.uploadedBy !== user.email) {
      setError('You can only delete PDFs that you own');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete "${pdf.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      setDeletingPdfId(pdf.id);

      // Delete the PDF file from Storage
      if (pdf.storagePath) {
        const pdfRef = ref(storage, pdf.storagePath);
        await deleteObject(pdfRef);
      }

      // Delete the thumbnail from Storage if it exists
      if (pdf.thumbnailPath) {
        const thumbnailRef = ref(storage, pdf.thumbnailPath);
        await deleteObject(thumbnailRef);
      }

      // Delete from Firestore last (in case storage operations fail)
      await deleteDoc(doc(db, 'pdfs', pdf.id));

      setError('PDF deleted successfully');
      setTimeout(() => setError(null), 3000);
    } catch (error: any) {
      console.error('Error deleting PDF:', error);
      setError(`Failed to delete PDF: ${error.message}`);
    } finally {
      setDeletingPdfId(null);
    }
  };

  // Rename PDF function
  const handleRename = async (pdf: PdfFile) => {
    if (!user) {
      setError('You must be logged in to rename PDFs');
      return;
    }

    if (pdf.uploadedBy !== user.email) {
      setError('You can only rename PDFs that you own');
      return;
    }

    if (!newName.trim()) {
      setError('Please enter a valid name');
      return;
    }

    const invalidChars = /[<>:"\/\\|?*\x00-\x1F]/g;
    if (invalidChars.test(newName)) {
      setError('File name contains invalid characters');
      return;
    }

    if (newName.trim() === pdf.name) {
      handleCancelRename();
      return;
    }

    try {
      setError(null);
      const pdfRef = doc(db, 'pdfs', pdf.id);
      
      // Reset rename mode first
      handleCancelRename();

      // Create new storage paths
      const newFileName = `${Date.now()}-${newName.trim()}${newName.toLowerCase().endsWith('.pdf') ? '' : '.pdf'}`;
      const newStoragePath = `pdfs/${user.uid}/${newFileName}`;
      
      if (pdf.storagePath) {
        // Get the old file reference
        const oldFileRef = ref(storage, pdf.storagePath);
        // Create new file reference
        const newFileRef = ref(storage, newStoragePath);

        // Download the old file
        const oldFileBlob = await (await fetch(pdf.url)).blob();
        
        // Upload to new location
        await uploadBytes(newFileRef, oldFileBlob);
        
        // Get the new URL
        const newUrl = await getDownloadURL(newFileRef);

        // Delete the old file
        await deleteObject(oldFileRef);

        // Update in Firestore
        await updateDoc(pdfRef, {
          name: newName.trim(),
          url: newUrl,
          storagePath: newStoragePath
        });
      } else {
        // If no storagePath (legacy data), just update the name
        await updateDoc(pdfRef, {
          name: newName.trim()
        });
      }

      setError('PDF renamed successfully');
      setTimeout(() => setError(null), 3000);
    } catch (error: any) {
      console.error('Error renaming PDF:', error);
      setError(`Failed to rename PDF: ${error.message}`);
      
      // Restore the original PDF in case of error
      setPdfs(current => {
        const newMap = new Map(current);
        newMap.set(pdf.id, pdf);
        return newMap;
      });
    }
  };

  // Cancel rename function with cleanup
  const handleCancelRename = () => {
    setEditingPdf(null);
    setNewName('');
    setError(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Add this helper function at the top of your component
  const showFallback = (element: HTMLElement) => {
    element.style.display = 'none';
    element.parentElement?.classList.add('pdf-fallback');
  };

  // Add this function at the top level of your component, alongside other functions like handleDelete
  const handleDownload = async (pdf: PdfFile) => {
    try {
      // Fetch the PDF file
      const response = await fetch(pdf.url);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create temporary link element
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = pdf.name.endsWith('.pdf') ? pdf.name : `${pdf.name}.pdf`; // Ensure .pdf extension
      
      // Append to document, click, and cleanup
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup blob URL
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 100);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      // You might want to show an error message to the user here
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {selectedPdf && (
        <PDFViewer
          fileUrl={selectedPdf.url}
          onClose={() => setSelectedPdf(null)}
        />
      )}
      
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My PDFs</h1>
        <div className="relative">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
            id="pdf-upload"
            disabled={isUploading}
          />
          <label
            htmlFor="pdf-upload"
            className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            {isUploading ? `Uploading ${uploadProgress.toFixed(0)}%` : 'Upload PDF'}
          </label>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="mb-6">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Uploading... {uploadProgress.toFixed(0)}%
          </p>
        </div>
      )}

      {/* Loading state */}
      {isInitialLoading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Loading PDFs...</p>
        </div>
      )}

      {/* PDF Grid */}
      {!isInitialLoading && (
        <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedPdfs.map((pdf) => (
            <div
              key={pdf.id}
              className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-visible hover:shadow-md transition-shadow ${
                deletingPdfId === pdf.id || renamingPdfId === pdf.id ? 'opacity-50' : ''
              } cursor-pointer group`}
              onClick={(e) => {
                // Only open PDF viewer if we didn't click on a button or input
                if (!(e.target as HTMLElement).closest('button, input')) {
                  setSelectedPdf(pdf);
                }
              }}
            >
              {/* Thumbnail */}
              {pdf.thumbnailUrl ? (
                <div className="pdf-thumbnail-container">
                  <div className="pdf-thumbnail-wrapper">
                    <Image
                      src={pdf.thumbnailUrl}
                      alt={`${pdf.name} thumbnail`}
                      width={400}
                      height={300}
                      className="pdf-thumbnail"
                      loading="lazy"
                      priority={false}
                      onError={(e) => {
                        console.error('Failed to load thumbnail:', {
                          name: pdf.name,
                          url: pdf.thumbnailUrl
                        });
                        const container = (e.target as HTMLElement).parentElement?.parentElement;
                        if (container) {
                          container.innerHTML = '';
                          container.className = 'pdf-fallback';
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="pdf-fallback">
                  <svg
                    className="w-12 h-12 text-gray-400 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm text-gray-400">PDF Preview</span>
                </div>
              )}

              {/* Content */}
              <div className="p-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {editingPdf === pdf.id ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          placeholder="Enter new name"
                          autoFocus
                          disabled={renamingPdfId === pdf.id}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleRename(pdf);
                            } else if (e.key === 'Escape') {
                              handleCancelRename();
                            }
                          }}
                        />
                        <button
                          onClick={() => handleRename(pdf)}
                          disabled={renamingPdfId === pdf.id}
                          className="inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Save"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={handleCancelRename}
                          disabled={renamingPdfId === pdf.id}
                          className="inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Cancel"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-lg font-medium text-gray-900 truncate" title={pdf.name}>
                          {pdf.name}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                          {formatDate(pdf.uploadedAt)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatFileSize(pdf.size)}
                        </p>
                        {pdf.uploadedBy !== user?.email && (
                          <p className="text-xs text-gray-500 mt-1">
                            Shared by: {pdf.uploadedBy}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Actions Menu */}
                  {pdf.uploadedBy === user?.email && (
                    <Menu as="div" className="relative">
                      <Menu.Button 
                        className="flex items-center text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 disabled:opacity-50"
                        disabled={deletingPdfId === pdf.id || renamingPdfId === pdf.id}
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </Menu.Button>
                      <Transition
                        as={Fragment}
                        enter="transition ease-out duration-100"
                        enterFrom="transform opacity-0 scale-95"
                        enterTo="transform opacity-100 scale-100"
                        leave="transition ease-in duration-75"
                        leaveFrom="transform opacity-100 scale-100"
                        leaveTo="transform opacity-0 scale-95"
                      >
                        <Menu.Items className="absolute right-0 z-50 bottom-full mb-2 w-48 origin-bottom-right divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                          <div className="py-1">
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent event bubbling
                                    handleDownload(pdf);
                                  }}
                                  className={`${
                                    active ? 'bg-gray-100' : ''
                                  } flex w-full items-center px-4 py-2 text-sm text-gray-700`}
                                >
                                  <svg 
                                    className="mr-3 h-5 w-5 text-gray-400" 
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
                                  Download
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => {
                                    setEditingPdf(pdf.id);
                                    setNewName(pdf.name);
                                  }}
                                  disabled={deletingPdfId === pdf.id || renamingPdfId === pdf.id}
                                  className={`${
                                    active ? 'bg-gray-100' : ''
                                  } flex w-full items-center px-4 py-2 text-sm text-gray-700 disabled:opacity-50`}
                                >
                                  <svg className="mr-3 h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                  Rename
                                </button>
                              )}
                            </Menu.Item>
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => handleDelete(pdf)}
                                  disabled={deletingPdfId === pdf.id || renamingPdfId === pdf.id}
                                  className={`${
                                    active ? 'bg-gray-100' : ''
                                  } flex w-full items-center px-4 py-2 text-sm text-red-600 disabled:opacity-50`}
                                >
                                  <svg className="mr-3 h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Delete
                                </button>
                              )}
                            </Menu.Item>
                          </div>
                        </Menu.Items>
                      </Transition>
                    </Menu>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isInitialLoading && sortedPdfs.length === 0 && !error && (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No PDFs</h3>
          <p className="mt-1 text-sm text-gray-500">
            Upload your first PDF to get started
          </p>
        </div>
      )}
    </div>
  );
} 