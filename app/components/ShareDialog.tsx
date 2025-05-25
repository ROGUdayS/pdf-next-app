import { useState } from "react";
import { Dialog, Transition, Switch } from "@headlessui/react";
import { Fragment } from "react";

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onShareViaEmail: (email: string, allowSave: boolean) => Promise<void>;
  onShareViaLink: (allowSave: boolean) => Promise<string>;
  pdfName: string;
}

export default function ShareDialog({
  isOpen,
  onClose,
  onShareViaEmail,
  onShareViaLink,
  pdfName,
}: ShareDialogProps) {
  const [email, setEmail] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [allowSave, setAllowSave] = useState(false);

  const handleEmailShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await onShareViaEmail(email, allowSave);
      setSuccess(`Successfully shared "${pdfName}" with ${email}`);
      setEmail("");
    } catch (err: any) {
      setError(err.message || "Failed to share PDF");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkShare = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const link = await onShareViaLink(allowSave);
      setShareLink(link);
      setSuccess("Share link generated successfully");
    } catch (err: any) {
      console.error("🔥 Firestore update failed:", err);
      setError(err.message || "Failed to generate share link");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setSuccess("Link copied to clipboard!");
    } catch (err) {
      setError("Failed to copy link");
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
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 dark:text-white"
                >
                  Share &ldquo;{pdfName}&rdquo;
                </Dialog.Title>

                {/* Permissions Section */}
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      Allow recipients to save PDF
                    </span>
                    <Switch
                      checked={allowSave}
                      onChange={setAllowSave}
                      className={`${
                        allowSave
                          ? "bg-blue-600"
                          : "bg-gray-200 dark:bg-gray-600"
                      } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
                    >
                      <span
                        className={`${
                          allowSave ? "translate-x-6" : "translate-x-1"
                        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                      />
                    </Switch>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {allowSave
                      ? "Recipients can save, download, and open the PDF in a new tab"
                      : "Recipients can only view the PDF"}
                  </p>
                </div>

                {/* Error/Success Messages */}
                {error && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-md text-sm border border-red-200 dark:border-red-800">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/30 text-green-500 dark:text-green-400 rounded-md text-sm border border-green-200 dark:border-green-800">
                    {success}
                  </div>
                )}

                {/* Share via Email */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Share via Email
                  </h4>
                  <form onSubmit={handleEmailShare} className="mt-2">
                    <div className="flex gap-2">
                      <label htmlFor="email-input" className="sr-only">
                        Email address
                      </label>
                      <input
                        id="email-input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter email address"
                        className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                        disabled={isLoading}
                        aria-label="Email address to share PDF with"
                      />
                      <button
                        type="submit"
                        disabled={isLoading || !email}
                        className="rounded-md bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50"
                        aria-label="Share PDF via email"
                      >
                        Share
                      </button>
                    </div>
                  </form>
                </div>

                {/* Share via Link */}
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Share via Link
                  </h4>
                  <div className="mt-2">
                    {shareLink ? (
                      <div className="flex gap-2">
                        <label htmlFor="share-link-input" className="sr-only">
                          Generated share link
                        </label>
                        <input
                          id="share-link-input"
                          type="text"
                          value={shareLink}
                          readOnly
                          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                          aria-label="Generated share link"
                        />
                        <button
                          onClick={copyToClipboard}
                          className="rounded-md bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400"
                          aria-label="Copy share link to clipboard"
                        >
                          Copy
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleLinkShare}
                        disabled={isLoading}
                        className="w-full rounded-md bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 disabled:opacity-50"
                        aria-label="Generate shareable link for PDF"
                      >
                        Generate Link
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={onClose}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400"
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
