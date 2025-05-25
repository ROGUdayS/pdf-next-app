"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Image from "next/image";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { updateProfile, User } from "firebase/auth";

const getInitials = (name: string) => {
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const isUserFromGoogle = (user: User | null): boolean => {
  return user?.providerData?.[0]?.providerId === "google.com";
};

interface AvatarWithUploadProps {
  user: User | null;
  hasValidPhoto: boolean;
  isUploading: boolean;
  onUploadClick: () => void;
  size?: "small" | "large";
  showUploadHover: boolean;
}

const AvatarWithUpload = ({
  user,
  hasValidPhoto,
  isUploading,
  onUploadClick,
  size = "small",
  showUploadHover = true,
}: AvatarWithUploadProps) => {
  const [isHovering, setIsHovering] = useState(false);
  const isGoogleUser = isUserFromGoogle(user);
  const sizeClasses = size === "small" ? "w-9 h-9" : "w-12 h-12";

  const shouldShowOverlay = (): boolean => {
    if (!isHovering) return false;
    if (isGoogleUser) return false;
    return showUploadHover;
  };

  return (
    <div
      className={`relative ${sizeClasses} rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center ring-2 ring-white shadow-sm ${
        !isGoogleUser && showUploadHover ? "cursor-pointer" : ""
      }`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={(e) => {
        if (!isGoogleUser && showUploadHover) {
          e.stopPropagation();
          onUploadClick();
        }
      }}
    >
      {hasValidPhoto && user?.photoURL ? (
        <>
          <Image
            src={user.photoURL}
            alt="Profile"
            fill
            className="object-cover"
          />
          {shouldShowOverlay() && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center transition-opacity duration-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`${
                  size === "small" ? "h-4 w-4" : "h-5 w-5"
                } text-white`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          )}
        </>
      ) : (
        <>
          <span
            className={`${
              size === "small" ? "text-sm" : "text-lg"
            } font-semibold text-white`}
          >
            {getInitials(
              user?.displayName || user?.email?.split("@")[0] || "User"
            )}
          </span>
          {shouldShowOverlay() && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center transition-opacity duration-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`${
                  size === "small" ? "h-4 w-4" : "h-5 w-5"
                } text-white`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          )}
        </>
      )}
      {isUploading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div
            className={`${
              size === "small" ? "w-5 h-5" : "w-6 h-6"
            } border-2 border-white border-t-transparent rounded-full animate-spin`}
          ></div>
        </div>
      )}
    </div>
  );
};

export default function UserProfileMenu() {
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePhotoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    try {
      setIsUploading(true);
      setImageError(false);
      setUploadStatus("Starting upload...");

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("File size too large. Maximum size is 5MB.");
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        throw new Error("Invalid file type. Please upload an image.");
      }

      // Create a unique filename
      const fileExtension = file.name.split(".").pop();
      const fileName = `${user.uid}_${Date.now()}.${fileExtension}`;

      setUploadStatus("Uploading to storage...");
      // Upload to Firebase Storage
      const storageRef = ref(storage, `profile-photos/${user.uid}/${fileName}`);
      const snapshot = await uploadBytes(storageRef, file);

      setUploadStatus("Getting download URL...");
      // Get the download URL
      const photoURL = await getDownloadURL(snapshot.ref);

      setUploadStatus("Updating profile...");
      // Update user profile
      await updateProfile(user, {
        photoURL: photoURL,
      });

      setUploadStatus("Refreshing user data...");
      // Wait for a moment to ensure the profile update is complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Force a refresh of the auth state
      await user.reload();

      // Get the updated user data
      const currentUser = user;
      if (currentUser.photoURL !== photoURL) {
        throw new Error("Profile update failed. Please try again.");
      }

      setUploadStatus("Upload complete!");
      // Clear any previous errors
      setImageError(false);

      // Force a re-render after successful upload
      window.location.reload();
    } catch (error: unknown) {
      console.error("Error uploading photo:", error);
      setImageError(true);
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      setUploadStatus(`Error: ${errorMessage}`);
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      setIsUploading(false);
    }
  };

  const displayName = user?.displayName || user?.email?.split("@")[0] || "User";
  const hasValidPhoto = Boolean(user?.photoURL && !imageError);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="flex items-center space-x-3 px-3 py-2 rounded-full transition-all duration-200 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        <AvatarWithUpload
          user={user}
          hasValidPhoto={hasValidPhoto}
          isUploading={isUploading}
          onUploadClick={() => {}}
          size="small"
          showUploadHover={false}
        />
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-sm font-medium text-foreground">
            {displayName}
          </span>
          <span className="text-xs text-muted-foreground truncate max-w-[150px]">
            {user?.email}
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`hidden sm:block w-4 h-4 text-muted-foreground transition-transform duration-200 ${
            isMenuOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        accept="image/*"
        className="hidden"
      />

      {isMenuOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg py-2 bg-popover ring-1 ring-border transform opacity-100 scale-100 transition-all duration-200 ease-out origin-top-right">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center space-x-3">
              <AvatarWithUpload
                user={user}
                hasValidPhoto={hasValidPhoto}
                isUploading={isUploading}
                onUploadClick={() => fileInputRef.current?.click()}
                size="large"
                showUploadHover={true}
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-popover-foreground">
                  {displayName}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {user?.email}
                </span>
                {uploadStatus && (
                  <span
                    className={`text-xs mt-1 ${
                      imageError ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {uploadStatus}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="flex items-center w-full px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors duration-150"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4 mr-3 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
