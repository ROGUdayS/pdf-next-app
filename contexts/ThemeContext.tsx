"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "auto";

interface ThemeContextType {
  theme: Theme;
  actualTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("auto");
  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");

  // Function to determine theme based on time
  const getTimeBasedTheme = (): "light" | "dark" => {
    const hour = new Date().getHours();
    // Dark mode from 6 PM (18:00) to 6 AM (06:00)
    return hour >= 18 || hour < 6 ? "dark" : "light";
  };

  // Update actual theme based on current theme setting
  useEffect(() => {
    let newActualTheme: "light" | "dark";

    if (theme === "auto") {
      newActualTheme = getTimeBasedTheme();
    } else {
      newActualTheme = theme;
    }

    setActualTheme(newActualTheme);

    // Apply theme to document
    const root = document.documentElement;
    if (newActualTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    // Store theme preference in localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as Theme;
    if (savedTheme && ["light", "dark", "auto"].includes(savedTheme)) {
      setTheme(savedTheme);
    }
  }, []);

  // Set up interval to check time changes when in auto mode
  useEffect(() => {
    if (theme !== "auto") return;

    const interval = setInterval(() => {
      const timeBasedTheme = getTimeBasedTheme();
      if (timeBasedTheme !== actualTheme) {
        setActualTheme(timeBasedTheme);
        const root = document.documentElement;
        if (timeBasedTheme === "dark") {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [theme, actualTheme]);

  return (
    <ThemeContext.Provider value={{ theme, actualTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
