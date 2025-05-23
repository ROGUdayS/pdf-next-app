'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function Dashboard() {
  const { user, pdfStats, loading } = useAuth();

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  if (loading) {
    return (
      <div className="rounded-lg bg-white p-8 shadow-sm">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                </div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Welcome to PDF Culture</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/dashboard/pdfs" className="rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">My PDFs</h2>
            <span className="text-sm text-gray-500">{pdfStats.ownedCount} files</span>
          </div>
          <p className="text-gray-600">Upload and manage your PDF documents</p>
        </Link>

        <Link href="/dashboard/shared" className="rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Shared with me</h2>
            <span className="text-sm text-gray-500">{pdfStats.sharedCount} files</span>
          </div>
          <p className="text-gray-600">Access PDFs shared by others</p>
        </Link>

        <div className="rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <span className="text-sm text-gray-500">
              {pdfStats.recentPdfs.length ? `${pdfStats.recentPdfs.length} recent` : 'No activity'}
            </span>
          </div>
          {pdfStats.recentPdfs.length > 0 ? (
            <div className="space-y-3">
              {pdfStats.recentPdfs.map((pdf) => (
                <Link 
                  key={pdf.id}
                  href={`/dashboard/pdfs#${pdf.id}`}
                  className="block group"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-900 group-hover:text-blue-600 truncate flex-1">
                      {pdf.name}
                    </span>
                    <span className="text-gray-500 ml-2 shrink-0">
                      {formatDate(pdf.uploadedAt)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    by {pdf.uploadedBy === user?.email ? 'you' : pdf.uploadedBy}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">Track your recent interactions</p>
          )}
        </div>
      </div>
    </div>
  );
} 