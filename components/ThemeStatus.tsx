"use client";

import React from "react";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeStatus() {
  const { theme, actualTheme } = useTheme();

  const getTimeBasedInfo = () => {
    const hour = new Date().getHours();
    const timeString = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const isDarkTime = hour >= 18 || hour < 6;

    return {
      time: timeString,
      isDarkTime,
      timeRange: isDarkTime ? "6 PM - 6 AM (Dark)" : "6 AM - 6 PM (Light)",
    };
  };

  const timeInfo = getTimeBasedInfo();

  return (
    <div className="fixed bottom-4 right-4 bg-card border border-border rounded-lg p-3 shadow-lg text-xs space-y-1 z-50">
      <div className="font-semibold text-card-foreground">Theme Status</div>
      <div className="text-muted-foreground">
        <div>
          Mode: <span className="font-medium text-foreground">{theme}</span>
        </div>
        <div>
          Active:{" "}
          <span className="font-medium text-foreground">{actualTheme}</span>
        </div>
        <div>
          Time:{" "}
          <span className="font-medium text-foreground">{timeInfo.time}</span>
        </div>
        {theme === "auto" && (
          <div className="text-xs mt-1 pt-1 border-t border-border">
            <div>Auto Range: {timeInfo.timeRange}</div>
          </div>
        )}
      </div>
    </div>
  );
}
