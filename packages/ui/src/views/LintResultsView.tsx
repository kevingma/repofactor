import React, { useState } from "react";
import { ParserResult } from "@repo/ui/lib/jsAstParser";
import type { LintResult } from "@repo/ui/views/analysisLoadingView";
import { Button } from "@repo/ui/components/button";

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

interface LintResultsViewProps {
  fsTree: FsEntry[];
  parserResults: ParserResult[];
  lintResults: LintResult[];
}

/**
 * This component displays the entire list of linted files in a sidebar
 * and shows the lint errors/warnings for the currently selected file.
 */
export function LintResultsView({
  fsTree,
  parserResults,
  lintResults,
}: LintResultsViewProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // gather unique filePaths from lintResults
  const lintedFilePaths = lintResults.map((res) => res.filePath);

  // active LintResult
  const activeLint = lintResults.find((l) => l.filePath === selectedPath);

  const handleSelectPath = (filePath: string) => {
    setSelectedPath(filePath);
  };

  return (
    <div className="h-screen flex flex-row">
      {/* Sidebar */}
      <div className="w-64 border-r border-r-muted flex flex-col">
        <div className="p-2 flex-shrink-0 border-b">
          <h2 className="text-lg font-semibold">Lint Results</h2>
          <p className="text-xs text-muted-foreground">
            {lintResults.length} file(s) linted
          </p>
        </div>
        <div className="overflow-y-auto p-2 flex-1">
          {lintedFilePaths.map((filePath, idx) => (
            <Button
              key={idx}
              variant={filePath === selectedPath ? "default" : "secondary"}
              className="w-full text-left mb-1"
              onClick={() => handleSelectPath(filePath)}
            >
              {filePath}
            </Button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col p-4 overflow-y-auto">
        {selectedPath && activeLint ? (
          <>
            <h2 className="text-xl font-semibold mb-2">
              {activeLint.filePath}
            </h2>
            <div className="mb-2">
              <strong>Errors:</strong> {activeLint.errorCount},{" "}
              <strong>Warnings:</strong> {activeLint.warningCount}
            </div>
            {activeLint.messages.length > 0 ? (
              <ul className="list-disc ml-5 space-y-1 text-sm">
                {activeLint.messages.map((msg, i) => (
                  <li key={i}>
                    <strong>
                      [{msg.severity === 2 ? "Error" : "Warning"}]
                    </strong>{" "}
                    {msg.ruleId || "unknown-rule"} at line {msg.line}, col{" "}
                    {msg.column}: {msg.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">No messages for this file.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a file on the left to view its lint messages.
          </p>
        )}
      </div>
    </div>
  );
}
