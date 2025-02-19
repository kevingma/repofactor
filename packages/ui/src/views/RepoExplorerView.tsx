import React, { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, DirEntry } from "@tauri-apps/plugin-fs";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Folder, File, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

// shadcn sidebar imports
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarInset,
} from "@repo/ui/components/sidebar";

/**
 * Data structure representing each file or folder.
 */
interface FsEntry {
  path: string;
  name: string;
  isFile: boolean;
  isChecked: boolean;
  isExpanded: boolean;
  children: FsEntry[];
}

/**
 * Convert a DirEntry (from tauri-plugin-fs) into our internal FsEntry structure,
 * recursively transforming child entries if present.
 */
function transformDirEntryToFsEntry(entry: DirEntry): FsEntry {
  return {
    path: entry.path,
    name: entry.name,
    isFile: entry.isFile,
    isChecked: true,
    isExpanded: false,
    children:
      entry.children?.map((child) => transformDirEntryToFsEntry(child)) ?? [],
  };
}

/**
 * Recursively toggle the expanded state for the given path.
 */
function toggleExpand(entries: FsEntry[], pathToToggle: string): FsEntry[] {
  return entries.map((entry) => {
    if (entry.path === pathToToggle && !entry.isFile) {
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
 * Recursively toggle the "isChecked" state of a file/folder.
 */
function toggleChecked(entries: FsEntry[], pathToToggle: string): FsEntry[] {
  return entries.map((entry) => {
    if (entry.path === pathToToggle) {
      return {
        ...entry,
        isChecked: !entry.isChecked,
        // If a folder is being unchecked, recursively uncheck its children
        children: !entry.isChecked
          ? entry.children.map((child) => ({
              ...child,
              isChecked: false,
              children: toggleChecked(child.children, child.path),
            }))
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

  /**
   * Prompt user to pick a directory, then read it once (recursively).
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
        // readDir is already recursive by default.
        const dirEntries = await readDir(selectedPath);
        const transformed = dirEntries.map(transformDirEntryToFsEntry);
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
        <div key={entry.path} className={cn(indentClass, "flex flex-col py-1")}>
          <div className="flex items-center space-x-2">
            {/* Folder expand icon or placeholder */}
            {!entry.isFile ? (
              <div
                className="cursor-pointer w-4"
                onClick={() => handleToggleExpand(entry.path)}
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
            {entry.isFile ? (
              <File className="text-muted-foreground" size={16} />
            ) : (
              <Folder className="text-muted-foreground" size={16} />
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
          {!entry.isFile && entry.isExpanded && hasChildren && (
            <div className="ml-2 mt-1 border-l border-l-muted">
              {renderFsTree(entry.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <SidebarProvider defaultOpen={true} className="h-screen">
      <Sidebar
        side="left"
        variant="sidebar"
        collapsible="none"
        className="w-64 border-r border-r-muted flex flex-col"
      >
        <SidebarHeader className="p-2 flex-shrink-0">
          <Button variant="default" onClick={handleSelectRepository}>
            Select Repository
          </Button>
        </SidebarHeader>

        <SidebarContent className="overflow-y-auto p-2">
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
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="flex-1 p-4 overflow-y-auto">
        {selectedFileContent ? (
          <pre className="bg-secondary p-4 rounded-md whitespace-pre-wrap break-words">
            {selectedFileContent}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a file from the sidebar to view its contents.
          </p>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}