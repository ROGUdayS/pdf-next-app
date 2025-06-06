"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import UserProfileMenu from "@/components/UserProfileMenu";
import { Tooltip } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const checkIfMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (window.innerWidth >= 768) {
        setIsSidebarOpen(false);
      }
    };

    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);
    return () => window.removeEventListener("resize", checkIfMobile);
  }, []);

  // Redirect to signin if not authenticated and not loading
  useEffect(() => {
    if (!loading && !user) {
      router.push("/signin");
    }
  }, [user, loading, router]);

  // Show loading spinner while authentication is being determined
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render dashboard if user is not authenticated
  if (!user) {
    return null;
  }

  const sidebarItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      ),
    },
    {
      name: "My PDFs",
      href: "/dashboard/pdfs",
      icon: (
        <svg
          className="w-5 h-5"
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
      ),
    },
    {
      name: "Shared",
      href: "/dashboard/shared",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <nav className="bg-card shadow-sm fixed w-full z-10 border-b border-border">
        <div className="max-w-full px-3 sm:px-4 lg:px-6">
          <div className="flex justify-between items-center h-14 sm:h-16">
            <div className="flex items-center min-w-0">
              {isMobile && (
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none md:hidden mr-2"
                >
                  <svg
                    className="h-5 w-5 sm:h-6 sm:w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
              )}
              <span className="text-lg sm:text-xl font-bold text-foreground truncate">
                PDF Culture
              </span>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <ThemeToggle />
              <UserProfileMenu />
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-14 sm:top-16 h-full bg-card shadow-sm border-r border-border transition-all duration-300 z-20
          ${
            isMobile
              ? isSidebarOpen
                ? "w-64 translate-x-0"
                : "-translate-x-full w-64"
              : "w-16 translate-x-0"
          } 
          md:translate-x-0`}
      >
        <div className="py-4 flex flex-col gap-1">
          {sidebarItems.map((item) => (
            <Tooltip key={item.name} content={item.name} side="right">
              <Link
                href={item.href}
                onClick={() => isMobile && setIsSidebarOpen(false)}
                className={`flex items-center px-3 sm:px-4 py-3 text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg mx-2 transition-colors
                  ${
                    isMobile && isSidebarOpen
                      ? "justify-start"
                      : "justify-center"
                  }`}
              >
                <div className="flex items-center">
                  {item.icon}
                  {isMobile && isSidebarOpen && (
                    <span className="ml-3 text-sm font-medium">
                      {item.name}
                    </span>
                  )}
                </div>
              </Link>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div
        className={`pt-14 sm:pt-16 transition-all duration-300 ${
          isMobile ? (isSidebarOpen ? "pl-64" : "pl-0") : "pl-16"
        }`}
      >
        <main className="p-3 sm:p-4 lg:p-6">{children}</main>
      </div>

      {/* Mobile Overlay */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-[15] top-14 sm:top-16"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
}
