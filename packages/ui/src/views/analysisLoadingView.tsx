import React, { useState, useEffect } from "react";
import { ParserResult } from "@repo/ui/lib/jsAstParser";

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
  parserResults?: ParserResult[];
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

export function AnalysisLoadingView({ fsTree, parserResults }: AnalysisLoadingViewProps) {
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

      {/* Display parser results in a scrollable box */}
      {parserResults && parserResults.length > 0 && (
        <div className="mt-4 border-t pt-4 w-full max-w-xl">
          <h2 className="text-2xl font-semibold mb-2">Parser Results</h2>
          <div className="border border-muted rounded-md bg-background w-full p-4 mt-2 overflow-y-auto h-64 text-sm">
            {parserResults.map((res, idx) => (
              <div key={idx} className="mb-4">
                <p className="font-medium">File: {res.filePath}</p>
                <ul className="list-disc ml-5">
                  {res.nodes.map((n, i) => (
                    <li key={i}>
                      Found {n.type} named <strong>{n.name}</strong>
                    </li>
                  ))}
                </ul>
                {res.relationships.length > 0 && (
                  <>
                    <p className="mt-2 font-medium">Relationships:</p>
                    <ul className="list-disc ml-5">
                      {res.relationships.map((r, j) => (
                        <li key={j}>
                          {r.caller} {r.relationshipType} {r.callee}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}