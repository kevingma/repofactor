import React, { useState, useEffect } from "react";
import { ParserResult } from "@repo/ui/lib/jsAstParser";

/** Re-export or define lint result structures here, if needed */
export interface LintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
  column: number;
}
export interface LintResult {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: LintMessage[];
}

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
  lintResults?: LintResult[];
  onDone?: () => void; // <-- new callback
}

/** Utility to generate a file-map preview */
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

export function AnalysisLoadingView({
  fsTree,
  parserResults,
  lintResults,
  onDone,
}: AnalysisLoadingViewProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 5;
        return next > 100 ? 100 : next;
      });
    }, 400);

    return () => clearInterval(interval);
  }, []);

  // Once progress hits 100, notify parent to switch views
  useEffect(() => {
    if (progress >= 100 && onDone) {
      // small delay so user sees 100% momentarily
      const timer = setTimeout(() => {
        onDone();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [progress, onDone]);

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

      {/* Show file map preview */}
      <div className="border border-muted rounded-md bg-background w-full max-w-xl p-4 mt-4 overflow-y-auto h-64 text-sm font-mono whitespace-pre leading-5">
        {fileMap || "No files selected."}
      </div>

      {/* Parser Results */}
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

      {/* Lint Results (brief mention, full results on next page) */}
      {lintResults && lintResults.length > 0 && (
        <div className="mt-4 border-t pt-4 w-full max-w-xl">
          <h2 className="text-2xl font-semibold mb-2">Lint Summary</h2>
          <p className="text-sm">
            {lintResults.length} file(s) linted. Detailed results will appear in
            the next step.
          </p>
        </div>
      )}
    </div>
  );
}
