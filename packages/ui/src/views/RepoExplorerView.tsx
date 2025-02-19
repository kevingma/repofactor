import React, { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Folder, File, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { AnalysisLoadingView } from "@repo/ui/views/analysisLoadingView";

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
}

/**
 * Recursively read all subdirectories and files from the given path,
 * returning a structured array of FsEntry objects.
 */
async function readFsEntries(dirPath: string): Promise<FsEntry[]> {
  const entries = await readDir(dirPath);
  const result: FsEntry[] = [];

  for (const entry of entries) {
    // Ignore hidden files/folders (those starting with a dot)
    if (entry.name.startsWith(".")) continue;

    const fullPath = await join(dirPath, entry.name);

    // If directory, recurse into children
    let children: FsEntry[] = [];
    if (entry.isDirectory) {
      children = await readFsEntries(fullPath);
    }

    result.push({
      path: fullPath,
      name: entry.name,
      isFile: entry.isFile,
      isDirectory: entry.isDirectory ?? false,
      isChecked: true,
      isExpanded: false,
      children,
    });
  }
  return result;
}

/**
 * Recursively toggle the expanded state for the given path.
 */
function toggleExpand(entries: FsEntry[], pathToToggle: string): FsEntry[] {
  return entries.map((entry) => {
    if (entry.path === pathToToggle && entry.isDirectory) {
      // flip expanded
      return {
        ...entry,
        isExpanded: !entry.isExpanded,
      };
    }

    if (entry.children.length > 0) {
      return {
        ...entry,
        children: toggleExpand(entry.children, pathToToggle),
      };
    }

    return entry;
  });
}

/**
 * Helper function to recursively set the checked state on all descendants.
 */
function setCheckedForAll(entries: FsEntry[], checked: boolean): FsEntry[] {
  return entries.map((entry) => ({
    ...entry,
    isChecked: checked,
    children: entry.children.length > 0
      ? setCheckedForAll(entry.children, checked)
      : entry.children,
  }));
}

/**
 * Recursively toggle the "isChecked" state of a file/folder.
 * When a folder is toggled, all its children get the same state.
 */
function toggleChecked(entries: FsEntry[], pathToToggle: string): FsEntry[] {
  return entries.map((entry) => {
    if (entry.path === pathToToggle) {
      const newVal = !entry.isChecked;
      return {
        ...entry,
        isChecked: newVal,
        children: entry.isDirectory
          ? setCheckedForAll(entry.children, newVal)
          : entry.children,
      };
    }
    if (entry.children.length > 0) {
      return {
        ...entry,
        children: toggleChecked(entry.children, pathToToggle),
      };
    }
    return entry;
  });
}

export function RepoExplorerView() {
  const [repoPath, setRepoPath] = useState("");
  const [fsTree, setFsTree] = useState<FsEntry[]>([]);
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [error, setError] = useState("");
  const [analysisInProgress, setAnalysisInProgress] = useState(false);

  /**
   * Prompt user to pick a directory, then read it recursively.
   */
  const handleSelectRepository = useCallback(async () => {
    setError("");
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Select Repository",
      });
      if (typeof selectedPath === "string") {
        setRepoPath(selectedPath);
        const transformed = await readFsEntries(selectedPath);
        setFsTree(transformed);
      }
    } catch (err) {
      console.error(err);
      setError(String(err));
    }
  }, []);

  /**
   * Toggle folder expand/collapse.
   */
  const handleToggleExpand = (pathToToggle: string) => {
    setFsTree((prev) => toggleExpand(prev, pathToToggle));
  };

  /**
   * Checkbox toggle for file or folder.
   */
  const handleCheckboxChange = (pathToToggle: string) => {
    setFsTree((prev) => toggleChecked(prev, pathToToggle));
  };

  /**
   * Load file content when user clicks on a file.
   */
  const handleFileClick = useCallback(async (entry: FsEntry) => {
    if (entry.isFile) {
      try {
        const content = await readTextFile(entry.path);
        setSelectedFileContent(content);
      } catch (err) {
        console.error(err);
        setError(String(err));
      }
    }
  }, []);

  /**
   * Recursively render the file/folder tree structure.
   */
  const renderFsTree = (entries: FsEntry[], level = 0) => {
    return entries.map((entry) => {
      const indentClass = `pl-${level * 4}`;
      const hasChildren = entry.children.length > 0;

      return (
        <div
          key={entry.path}
          className={cn(indentClass, "flex flex-col py-0.5 text-xs")}
        >
          <div className="flex items-center space-x-1">
            {/* Folder expand icon or placeholder */}
            {entry.isDirectory ? (
              <div
                className="cursor-pointer w-4"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent click from affecting parent
                  handleToggleExpand(entry.path);
                }}
              >
                {entry.isExpanded ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </div>
            ) : (
              <div className="w-4" />
            )}

            {/* Folder/File icon */}
            {entry.isDirectory ? (
              <Folder className="text-muted-foreground" size={16} />
            ) : (
              <File className="text-muted-foreground" size={16} />
            )}

            {/* Checkbox */}
            <Checkbox
              checked={entry.isChecked}
              onCheckedChange={() => handleCheckboxChange(entry.path)}
              id={entry.path}
            />

            {/* Name - click to preview file */}
            <span
              onClick={() => entry.isFile && handleFileClick(entry)}
              className={cn(
                "cursor-pointer",
                entry.isFile ? "font-normal" : "font-semibold",
              )}
            >
              {entry.name}
            </span>
          </div>

          {/* Show children if folder is expanded */}
          {entry.isDirectory && entry.isExpanded && hasChildren && (
            <div className="ml-1 mt-0.5 border-l border-l-muted">
              {renderFsTree(entry.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  /**
   * Handle the "Proceed" button click
   * Set state to show the analysis loading screen.
   */
  const handleProceedClick = () => {
    setAnalysisInProgress(true);
  };

  // If user clicked "Proceed", render the analysis screen
  if (analysisInProgress) {
    return <AnalysisLoadingView fsTree={fsTree} />;
  }

  // Otherwise, render the file explorer
  return (
    <div className="h-screen flex flex-row">
      {/* Sidebar */}
      <div className="w-64 border-r border-r-muted flex flex-col">
        <div className="p-2 flex-shrink-0">
          <Button variant="default" onClick={handleSelectRepository}>
            Select Repository
          </Button>
        </div>
        <div className="overflow-y-auto p-2 flex-1">
          {repoPath && fsTree.length > 0 ? (
            renderFsTree(fsTree)
          ) : (
            <p className="text-sm text-muted-foreground">
              No folder selected or empty.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-500 mt-2">
              <strong>Error:</strong> {error}
            </p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 flex-1 overflow-y-auto">
          {selectedFileContent ? (
            <pre className="bg-secondary p-4 rounded-md whitespace-pre-wrap break-words">
              {selectedFileContent}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a file from the sidebar to view its contents.
            </p>
          )}
        </div>
        {/* Proceed button if we have something selected */}
        {fsTree.length > 0 && (
          <div className="p-4 border-t border-t-muted flex justify-center">
            <Button variant="default" onClick={handleProceedClick}>
              Proceed
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}