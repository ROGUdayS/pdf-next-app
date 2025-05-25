"use client";

import React from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon, Clock } from "lucide-react";

export function ThemeToggle() {
  const { theme, actualTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === "auto") {
      setTheme("light");
    } else if (theme === "light") {
      setTheme("dark");
    } else {
      setTheme("auto");
    }
  };

  const getIcon = () => {
    if (theme === "auto") {
      return <Clock className="h-5 w-5" />;
    } else if (theme === "light") {
      return <Sun className="h-5 w-5" />;
    } else {
      return <Moon className="h-5 w-5" />;
    }
  };

  const getTooltip = () => {
    if (theme === "auto") {
      return `Auto (currently ${actualTheme})`;
    } else if (theme === "light") {
      return "Light mode";
    } else {
      return "Dark mode";
    }
  };

  return (
    <button
      onClick={toggleTheme}
      className="relative inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-colors"
      title={getTooltip()}
      aria-label={`Switch to ${
        theme === "auto" ? "light" : theme === "light" ? "dark" : "auto"
      } mode`}
    >
      {getIcon()}
      {theme === "auto" && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
      )}
    </button>
  );
}

export default ThemeToggle;
