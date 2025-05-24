import { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onShareViaEmail: (email: string) => Promise<void>;
  onShareViaLink: () => Promise<string>;
  pdfName: string;
}

export default function ShareDialog({
  isOpen,
  onClose,
  onShareViaEmail,
  onShareViaLink,
  pdfName
}: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [shareLink, setShareLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleEmailShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await onShareViaEmail(email);
      setSuccess(`Successfully shared "${pdfName}" with ${email}`);
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Failed to share PDF');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkShare = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const link = await onShareViaLink();
      setShareLink(link);
      setSuccess('Share link generated successfully');
    } catch (err: any) {
      console.error('🔥 Firestore update failed:', err);
      setError(err.message || 'Failed to generate share link');
    } finally {
      setIsLoading(false);
    }
  };
  

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setSuccess('Link copied to clipboard!');
    } catch (err) {
      setError('Failed to copy link');
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900"
                >
                  Share "{pdfName}"
                </Dialog.Title>

                {/* Error/Success Messages */}
                {error && (
                  <div className="mt-2 p-2 bg-red-50 text-red-500 rounded-md text-sm">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="mt-2 p-2 bg-green-50 text-green-500 rounded-md text-sm">
                    {success}
                  </div>
                )}

                {/* Share via Email */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900">Share via Email</h4>
                  <form onSubmit={handleEmailShare} className="mt-2">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter email address"
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isLoading}
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !email}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        Share
                      </button>
                    </div>
                  </form>
                </div>

                {/* Share via Link */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900">Share via Link</h4>
                  <div className="mt-2">
                    {shareLink ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={shareLink}
                          readOnly
                          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm bg-gray-50"
                        />
                        <button
                          onClick={copyToClipboard}
                          className="rounded-md bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleLinkShare}
                        disabled={isLoading}
                        className="w-full rounded-md bg-gray-600 px-4 py-2 text-sm text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50"
                      >
                        Generate Link
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={onClose}
                    className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
} 