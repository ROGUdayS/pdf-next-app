import { useState, useEffect } from "react";
import { Dialog, Transition, Switch } from "@headlessui/react";
import { Fragment } from "react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  arrayRemove,
  arrayUnion,
  query,
  collection,
  where,
  getDocs,
} from "firebase/firestore";

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onShareViaEmail: (email: string, allowSave: boolean) => Promise<void>;
  pdfName: string;
  pdfId: string;
}

interface AccessUser {
  email: string;
  addedAt?: Date;
  canSave: boolean;
  hasSavedCopy?: boolean;
}

export default function ShareDialog({
  isOpen,
  onClose,
  onShareViaEmail,
  pdfName,
  pdfId,
}: ShareDialogProps) {
  const [email, setEmail] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Separate permission states for email and link sharing
  const [emailAllowSave, setEmailAllowSave] = useState(false);
  const [linkAllowSave, setLinkAllowSave] = useState(false);

  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [isPubliclyShared, setIsPubliclyShared] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [removingUser, setRemovingUser] = useState<string | null>(null);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"share" | "manage">("share");

  // Load current access users when dialog opens
  useEffect(() => {
    if (isOpen && pdfId) {
      loadAccessUsers();
    }
  }, [isOpen, pdfId]);

  // Refresh data when dialog closes
  const handleClose = () => {
    loadAccessUsers(); // Refresh data before closing
    onClose();
  };

  // Generate a random share ID for the link
  const generateRandomShareId = () => {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  };

  const checkForSavedCopies = async () => {
    try {
      // Query for PDFs that might be saved copies
      const savedCopiesQuery = query(
        collection(db, "pdfs"),
        where("name", "==", pdfName) // Assuming saved copies keep the same name
      );

      const savedCopiesSnapshot = await getDocs(savedCopiesQuery);
      const savedCopyOwners = new Set<string>();

      savedCopiesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        // Check if this is a saved copy (different document but same name and different owner)
        if (doc.id !== pdfId && data.uploadedBy) {
          savedCopyOwners.add(data.uploadedBy);
        }
      });

      return savedCopyOwners;
    } catch (error) {
      console.warn("Error checking for saved copies:", error);
      return new Set<string>();
    }
  };

  const loadAccessUsers = async () => {
    try {
      setLoadingUsers(true);
      const pdfDoc = await getDoc(doc(db, "pdfs", pdfId));

      if (pdfDoc.exists()) {
        const data = pdfDoc.data();

        // Handle both old format (string array) and new format (object array)
        const rawAccessUsers = data.accessUsers || [];
        const userMap = new Map<string, AccessUser>();

        rawAccessUsers.forEach((user: string | AccessUser) => {
          if (typeof user === "string") {
            // Old format - convert to new format with default canSave from global allowSave
            // Only add if not already present (prefer object format over string format)
            if (!userMap.has(user)) {
              userMap.set(user, {
                email: user,
                canSave: data.allowSave || false,
                addedAt: new Date(),
              });
            }
          } else {
            // New format - always prefer this over string format
            let addedAtDate: Date;
            try {
              // Handle various date formats that might be in the database
              if (user.addedAt) {
                if (user.addedAt instanceof Date) {
                  addedAtDate = isNaN(user.addedAt.getTime())
                    ? new Date()
                    : user.addedAt;
                } else if (typeof user.addedAt === "string") {
                  addedAtDate = new Date(user.addedAt);
                  if (isNaN(addedAtDate.getTime())) {
                    addedAtDate = new Date();
                  }
                } else if (
                  user.addedAt &&
                  typeof user.addedAt === "object" &&
                  "toDate" in user.addedAt
                ) {
                  // Firestore Timestamp
                  addedAtDate = (
                    user.addedAt as { toDate: () => Date }
                  ).toDate();
                } else {
                  addedAtDate = new Date();
                }
              } else {
                addedAtDate = new Date();
              }
            } catch (error) {
              console.warn("Invalid date found for user:", user.email, error);
              addedAtDate = new Date();
            }

            userMap.set(user.email, {
              email: user.email,
              canSave: user.canSave || false,
              addedAt: addedAtDate,
            });
          }
        });

        const formattedUsers: AccessUser[] = Array.from(userMap.values());

        // Check for saved copies
        const savedCopyOwners = await checkForSavedCopies();

        // Update users with saved copy information
        const usersWithSavedInfo = formattedUsers.map((user) => ({
          ...user,
          hasSavedCopy: savedCopyOwners.has(user.email),
        }));

        setAccessUsers(usersWithSavedInfo);
        setIsPubliclyShared(data.isPubliclyShared || false);
        setEmailAllowSave(false); // Always start with view-only for email
        setLinkAllowSave(data.linkAllowSave || false); // Use separate linkAllowSave field

        if (data.isPubliclyShared) {
          const shareId = data.shareId || pdfId; // Fallback to pdfId for old links
          setShareLink(`${window.location.origin}/shared/${shareId}`);
        } else {
          setShareLink("");
        }
      }
    } catch (error) {
      console.error("Error loading access users:", error);
      setError("Failed to load user access information");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleEmailShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await onShareViaEmail(email, emailAllowSave);
      setSuccess(
        `Successfully shared "${pdfName}" with ${email} (${
          emailAllowSave ? "Can Save" : "View Only"
        })`
      );
      setEmail("");
      // Reload access users to show the new user
      await loadAccessUsers();
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to share PDF";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeAccess = async (userEmail: string) => {
    const user = accessUsers.find((u) => u.email === userEmail);
    const confirmMessage = user?.hasSavedCopy
      ? `Remove access for ${userEmail}?\n\nNote: This user has a saved copy and will retain access to their personal copy even after removal.`
      : `Remove access for ${userEmail}?\n\nThey will no longer be able to view this shared PDF.`;

    if (!confirm(confirmMessage)) return;

    try {
      setRemovingUser(userEmail);
      setError(null);

      // Find the user object to remove
      const userToRemove = accessUsers.find((user) => user.email === userEmail);
      if (!userToRemove) return;

      // Create Firestore-compatible object for arrayRemove
      const userToRemoveForFirestore = {
        email: userToRemove.email,
        canSave: userToRemove.canSave,
        addedAt: userToRemove.addedAt || new Date(),
      };

      // Update Firestore to remove user from accessUsers array
      const pdfRef = doc(db, "pdfs", pdfId);
      await updateDoc(pdfRef, {
        accessUsers: arrayRemove(userToRemoveForFirestore),
      });

      // Update local state
      setAccessUsers((prev) => prev.filter((user) => user.email !== userEmail));
      setSuccess(
        `Removed access for ${userEmail}. They will no longer be able to view the shared PDF, but any saved copies they made will remain in their collection.`
      );
    } catch (error) {
      console.error("Error revoking access:", error);
      setError("Failed to revoke access");
    } finally {
      setRemovingUser(null);
    }
  };

  const handleUpdateUserPermission = async (
    userEmail: string,
    canSave: boolean
  ) => {
    try {
      setUpdatingUser(userEmail);
      setError(null);

      // Find the current user object
      const currentUser = accessUsers.find((user) => user.email === userEmail);
      if (!currentUser) return;

      // Create updated user object with proper Firestore-compatible date
      const updatedUser = {
        email: currentUser.email,
        canSave: canSave,
        addedAt: currentUser.addedAt || new Date(),
      };

      // Create Firestore-compatible objects for arrayRemove/arrayUnion
      const currentUserForFirestore = {
        email: currentUser.email,
        canSave: currentUser.canSave,
        addedAt: currentUser.addedAt || new Date(),
      };

      // Update Firestore - remove old and add new
      const pdfRef = doc(db, "pdfs", pdfId);
      await updateDoc(pdfRef, {
        accessUsers: arrayRemove(currentUserForFirestore),
      });
      await updateDoc(pdfRef, {
        accessUsers: arrayUnion(updatedUser),
      });

      // Update local state
      setAccessUsers((prev) =>
        prev.map((user) => (user.email === userEmail ? updatedUser : user))
      );

      setSuccess(`Updated permissions for ${userEmail}`);
    } catch (error) {
      console.error("Error updating user permission:", error);
      setError("Failed to update user permission");
    } finally {
      setUpdatingUser(null);
    }
  };

  const handleTogglePublicSharing = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const pdfRef = doc(db, "pdfs", pdfId);
      const newPublicState = !isPubliclyShared;
      const newShareId = newPublicState ? generateRandomShareId() : null;

      await updateDoc(pdfRef, {
        isPubliclyShared: newPublicState,
        linkAllowSave: linkAllowSave, // Use separate field for link permissions
        shareId: newShareId,
      });

      setIsPubliclyShared(newPublicState);

      if (newPublicState && newShareId) {
        const link = `${window.location.origin}/shared/${newShareId}`;
        setShareLink(link);
        setSuccess("PDF is now publicly accessible via new link");
      } else {
        setShareLink("");
        setSuccess("Public link access disabled");
      }

      // Refresh data to show updated settings
      await loadAccessUsers();
    } catch (error) {
      console.error("Error toggling public sharing:", error);
      setError("Failed to update sharing settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkPermissionChange = async (newAllowSave: boolean) => {
    try {
      setIsLoading(true);
      setError(null);

      setLinkAllowSave(newAllowSave);

      if (isPubliclyShared) {
        // Generate new link when permissions change
        const newShareId = generateRandomShareId();
        const pdfRef = doc(db, "pdfs", pdfId);

        await updateDoc(pdfRef, {
          linkAllowSave: newAllowSave,
          shareId: newShareId,
        });

        const newLink = `${window.location.origin}/shared/${newShareId}`;
        setShareLink(newLink);
        setSuccess(
          `Link permissions updated - new link generated (${
            newAllowSave ? "Can Save" : "View Only"
          })`
        );

        // Refresh data
        await loadAccessUsers();
      } else {
        // Just update the permission for future use
        const pdfRef = doc(db, "pdfs", pdfId);
        await updateDoc(pdfRef, {
          linkAllowSave: newAllowSave,
        });
        setSuccess(
          `Link permissions updated (${
            newAllowSave ? "Can Save" : "View Only"
          })`
        );
      }
    } catch (error) {
      console.error("Error updating link permissions:", error);
      setError("Failed to update link permissions");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setSuccess("Link copied to clipboard!");
    } catch {
      setError("Failed to copy link");
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-4"
                >
                  Share &ldquo;{pdfName}&rdquo;
                </Dialog.Title>

                {/* Tab Navigation */}
                <div className="flex space-x-1 rounded-xl bg-gray-100 dark:bg-gray-700 p-1 mb-6">
                  <button
                    onClick={() => setActiveTab("share")}
                    className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all ${
                      activeTab === "share"
                        ? "bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow"
                        : "text-gray-700 dark:text-gray-300 hover:bg-white/[0.12] hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    Share PDF
                  </button>
                  <button
                    onClick={() => setActiveTab("manage")}
                    className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all ${
                      activeTab === "manage"
                        ? "bg-white dark:bg-gray-600 text-blue-700 dark:text-blue-300 shadow"
                        : "text-gray-700 dark:text-gray-300 hover:bg-white/[0.12] hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    Manage Access ({accessUsers.length})
                  </button>
                </div>

                {/* Error/Success Messages */}
                {error && (
                  <div className="mb-4 rounded-md bg-red-50 dark:bg-red-900/30 p-4">
                    <div className="text-sm text-red-700 dark:text-red-300">
                      {error}
                    </div>
                  </div>
                )}

                {success && (
                  <div className="mb-4 rounded-md bg-green-50 dark:bg-green-900/30 p-4">
                    <div className="text-sm text-green-700 dark:text-green-300">
                      {success}
                    </div>
                  </div>
                )}

                {/* Share Tab */}
                {activeTab === "share" && (
                  <div className="space-y-6">
                    {/* Share via Email */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                        Share via Email
                      </h4>

                      {/* Email Permission Toggle */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <label className="text-sm text-gray-700 dark:text-gray-300">
                            Email Permission
                          </label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {emailAllowSave
                              ? "User can save & download"
                              : "View only access"}
                          </p>
                        </div>
                        <Switch
                          checked={emailAllowSave}
                          onChange={setEmailAllowSave}
                          className={`${
                            emailAllowSave
                              ? "bg-green-600 dark:bg-green-500"
                              : "bg-gray-200 dark:bg-gray-600"
                          } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
                        >
                          <span
                            className={`${
                              emailAllowSave ? "translate-x-6" : "translate-x-1"
                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                          />
                        </Switch>
                      </div>

                      <form onSubmit={handleEmailShare}>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter email address"
                            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                            disabled={isLoading}
                          />
                          <button
                            type="submit"
                            disabled={isLoading || !email}
                            className="rounded-md bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50"
                          >
                            Share
                          </button>
                        </div>
                      </form>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        User will receive an email with{" "}
                        {emailAllowSave ? "save & download" : "view only"}{" "}
                        permissions
                      </p>
                    </div>

                    {/* Share via Link */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                          Share via Link
                        </h4>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Enable Public Link
                          </span>
                          <Switch
                            checked={isPubliclyShared}
                            onChange={handleTogglePublicSharing}
                            disabled={isLoading}
                            className={`${
                              isPubliclyShared
                                ? "bg-blue-600 dark:bg-blue-500"
                                : "bg-gray-200 dark:bg-gray-600"
                            } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50`}
                          >
                            <span
                              className={`${
                                isPubliclyShared
                                  ? "translate-x-6"
                                  : "translate-x-1"
                              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                            />
                          </Switch>
                        </div>
                      </div>

                      {isPubliclyShared && (
                        <div className="space-y-3">
                          {/* Link Permission Toggle */}
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="text-sm text-gray-700 dark:text-gray-300">
                                Link Permission
                              </label>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {linkAllowSave
                                  ? "Users can save & download"
                                  : "View only access"}
                              </p>
                            </div>
                            <Switch
                              checked={linkAllowSave}
                              onChange={handleLinkPermissionChange}
                              disabled={isLoading}
                              className={`${
                                linkAllowSave
                                  ? "bg-green-600 dark:bg-green-500"
                                  : "bg-gray-200 dark:bg-gray-600"
                              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50`}
                            >
                              <span
                                className={`${
                                  linkAllowSave
                                    ? "translate-x-6"
                                    : "translate-x-1"
                                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                              />
                            </Switch>
                          </div>

                          {/* Share Link Display */}
                          {shareLink && (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={shareLink}
                                readOnly
                                className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                              />
                              <button
                                onClick={copyToClipboard}
                                className="rounded-md bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400"
                              >
                                Copy
                              </button>
                            </div>
                          )}

                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Public link users will have{" "}
                            {linkAllowSave ? "save & download" : "view only"}{" "}
                            permissions
                          </p>
                        </div>
                      )}

                      {!isPubliclyShared && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Enable public link to share this PDF with anyone
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Manage Access Tab */}
                {activeTab === "manage" && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-4">
                      Users with Access
                    </h4>

                    {loadingUsers ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                      </div>
                    ) : accessUsers.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No users have been shared with yet
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {accessUsers.map((user) => (
                          <div
                            key={user.email}
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                          >
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {user.email}
                                {user.hasSavedCopy && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    📁 Has saved copy
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Added{" "}
                                {user.addedAt
                                  ? new Date(user.addedAt).toLocaleDateString()
                                  : "recently"}
                                {user.hasSavedCopy && (
                                  <span className="block text-xs text-blue-600 dark:text-blue-400 mt-1">
                                    Will retain access to their saved copy even
                                    if removed
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-3">
                              {/* Permission Toggle */}
                              <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                  {user.canSave ? "Can Save" : "View Only"}
                                </span>
                                <Switch
                                  checked={user.canSave}
                                  onChange={(canSave) =>
                                    handleUpdateUserPermission(
                                      user.email,
                                      canSave
                                    )
                                  }
                                  disabled={updatingUser === user.email}
                                  className={`${
                                    user.canSave
                                      ? "bg-green-600 dark:bg-green-500"
                                      : "bg-gray-300 dark:bg-gray-600"
                                  } relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50`}
                                >
                                  <span
                                    className={`${
                                      user.canSave
                                        ? "translate-x-5"
                                        : "translate-x-1"
                                    } inline-block h-3 w-3 transform rounded-full bg-white transition-transform`}
                                  />
                                </Switch>
                              </div>

                              {/* Remove Access Button */}
                              <button
                                onClick={() => handleRevokeAccess(user.email)}
                                disabled={removingUser === user.email}
                                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm disabled:opacity-50"
                              >
                                {removingUser === user.email
                                  ? "Removing..."
                                  : "Remove"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {isPubliclyShared && (
                      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                        <div className="flex">
                          <div className="flex-shrink-0">
                            <svg
                              className="h-5 w-5 text-yellow-400"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                              <strong>Public Link Active:</strong> Anyone with
                              the link can access this PDF with{" "}
                              {linkAllowSave ? "save & download" : "view only"}{" "}
                              permissions. Users shown above have individual
                              permission settings.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={handleClose}
                    className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400"
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
