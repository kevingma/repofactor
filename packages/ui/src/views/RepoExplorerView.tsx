import React, { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile, DirEntry } from "@tauri-apps/plugin-fs";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { cn } from "@repo/ui/lib/utils";

interface FsEntry {
  path: string;
  name: string;
  children?: FsEntry[];
  isFile: boolean;
  isChecked: boolean;
}

/**
 * Recursively transform tauri readDir result into a tree of FsEntry objects.
 */
async function buildFsTree(entries: DirEntry[]): Promise<FsEntry[]> {
  const fsEntries: FsEntry[] = [];

  for (const entry of entries) {
    const fsEntry: FsEntry = {
      path: (entry as any).path || "",
      name: entry.name || "",
      isFile: !((entry as any).children),
      isChecked: true, // default to checked
    };

    // If entry has children, then process them recursively
    if ((entry as any).children) {
      fsEntry.children = await buildFsTree((entry as any).children);
    }

    fsEntries.push(fsEntry);
  }

  return fsEntries;
}

export function RepoExplorerView() {
  const [repoPath, setRepoPath] = useState("");
  const [fsTree, setFsTree] = useState<FsEntry[]>([]);
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [error, setError] = useState("");

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
        const dirEntries = await readDir(selectedPath);
        const tree = await buildFsTree(dirEntries);
        setFsTree(tree);
      }
    } catch (err) {
      console.error(err);
      setError(String(err));
    }
  }, []);

  const toggleChecked = (entry: FsEntry, pathToToggle: string): FsEntry => {
    // If this is the entry we want to toggle, flip isChecked
    if (entry.path === pathToToggle) {
      const updated = { ...entry, isChecked: !entry.isChecked };
      // If we uncheck a folder, recursively uncheck children
      if (!updated.isChecked && updated.children) {
        updated.children = updated.children.map((child) =>
          toggleChecked(child, child.path)
        );
      }
      return updated;
    }

    // Otherwise, if it has children, recurse
    if (entry.children) {
      return {
        ...entry,
        children: entry.children.map((child) => toggleChecked(child, pathToToggle)),
      };
    }

    return entry;
  };

  const handleCheckboxChange = (pathToToggle: string) => {
    setFsTree((prev) =>
      prev.map((entry) => toggleChecked(entry, pathToToggle))
    );
  };

  const handleFileClick = useCallback(
    async (entry: FsEntry) => {
      if (!entry.isFile) return;

      try {
        const content = await readTextFile(entry.path);
        setSelectedFileContent(content);
      } catch (err) {
        console.error(err);
        setError(String(err));
      }
    },
    []
  );

  /**
   * Recursively render the file tree structure with checkboxes.
   */
  const renderFsTree = (entries: FsEntry[]) => {
    return entries.map((entry) => {
      const hasChildren = entry.children && entry.children.length > 0;
      return (
        <div key={entry.path} className="pl-2">
          <div className="flex items-center">
            <Checkbox
              checked={entry.isChecked}
              onCheckedChange={() => handleCheckboxChange(entry.path)}
              id={entry.path}
            />
            <span
              onClick={() => handleFileClick(entry)}
              className={cn(
                "ml-2 cursor-pointer",
                entry.isFile ? "font-normal" : "font-semibold"
              )}
            >
              {entry.name}
            </span>
          </div>
          {hasChildren && entry.isChecked && (
            <div className="ml-4 border-l border-l-muted pl-2 mt-1">
              {renderFsTree(entry.children!)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 border-r border-r-muted p-4 flex flex-col gap-2">
        <Button variant="default" onClick={handleSelectRepository}>
          Select Repository
        </Button>
        {repoPath && (
          <Card>
            <CardHeader>
              <CardTitle>Repo Tree</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[60vh] overflow-y-auto">
              {fsTree.length > 0 ? (
                renderFsTree(fsTree)
              ) : (
                <p className="text-sm text-muted-foreground">
                  No files found or folder is empty.
                </p>
              )}
            </CardContent>
          </Card>
        )}
        {error && (
          <p className="text-sm text-red-500 mt-2">
            <strong>Error:</strong> {error}
          </p>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 p-4 overflow-y-auto">
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
    </div>
  );
}