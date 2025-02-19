import React, { useState, useEffect } from "react";

/**
 * Data structure representing each file or folder.
 */
interface FsEntry {
  path: string;
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isChecked: boolean;
  isExpanded: boolean;
  children: FsEntry[];
  language?: string;
}

interface AnalysisLoadingViewProps {
  fsTree: FsEntry[];
}

/**
 * Recursively generate a string-based file map using
 * box-drawing characters (├──, └──, etc).
 */
function generateFileMapString(entries: FsEntry[], prefix = ""): string {
  return entries
    .filter((e) => e.isChecked)
    .map((entry, index, arr) => {
      const isLast = index === arr.length - 1;
      const branch = isLast ? "└── " : "├── ";

      let line = `${prefix}${branch}${entry.name}`;

      if (entry.isDirectory && entry.children.length > 0) {
        const newPrefix = prefix + (isLast ? "    " : "│   ");
        line += "\n" + generateFileMapString(entry.children, newPrefix);
      }

      return line;
    })
    .join("\n");
}

export function AnalysisLoadingView({ fsTree }: AnalysisLoadingViewProps) {
  const [progress, setProgress] = useState(0);

  // Simulate analysis progress
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 5;
        return next > 100 ? 100 : next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const fileMap = generateFileMapString(fsTree);

  return (
    <div className="h-screen flex flex-col items-center justify-center p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Analyzing Your Codebase...</h1>

      {/* Progress bar */}
      <div className="w-full max-w-xl bg-secondary rounded-full h-4">
        <div
          className="bg-primary h-4 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p>{progress}%</p>

      {/* Show a scrollable file map preview */}
      <div className="border border-muted rounded-md bg-background w-full max-w-xl p-4 mt-4 overflow-y-auto h-64 text-sm font-mono whitespace-pre leading-5">
        {fileMap || "No files selected."}
      </div>
    </div>
  );
}