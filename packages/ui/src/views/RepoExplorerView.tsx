import React, { useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { parseJsOrTsFile } from "@repo/ui/lib/jsAstParser"; // <-- NEW import
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Folder, File, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@repo/ui/lib/utils";
import { AnalysisLoadingView } from "@repo/ui/views/analysisLoadingView";

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

function detectLanguage(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".java")) return "java";
  if (
    lower.endsWith(".c") ||
    lower.endsWith(".h") ||
    lower.endsWith(".cpp") ||
    lower.endsWith(".hpp")
  )
    return "c/c++";
  if (lower.endsWith(".cs")) return "c#";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".php")) return "php";
  if (lower.endsWith(".rb")) return "ruby";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".swift")) return "swift";
  if (lower.endsWith(".kt") || lower.endsWith(".kts")) return "kotlin";
  return undefined;
}

async function readFsEntries(dirPath: string): Promise<FsEntry[]> {
  const entries = await readDir(dirPath);
  const result: FsEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue; // ignore hidden files/folders
    const fullPath = await join(dirPath, entry.name);

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
      language: entry.isFile ? detectLanguage(fullPath) : undefined,
    });
  }
  return result;
}

function toggleExpand(entries: FsEntry[], pathToToggle: string): FsEntry[] {
  return entries.map((entry) => {
    if (entry.path === pathToToggle && entry.isDirectory) {
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

function setCheckedForAll(entries: FsEntry[], checked: boolean): FsEntry[] {
  return entries.map((entry) => ({
    ...entry,
    isChecked: checked,
    children:
      entry.children.length > 0
        ? setCheckedForAll(entry.children, checked)
        : entry.children,
  }));
}

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

// NEW helper to gather all selected files from the FsEntry tree
function gatherSelectedFiles(entries: FsEntry[]): FsEntry[] {
  let files: FsEntry[] = [];
  for (const e of entries) {
    if (e.isChecked && e.isFile) {
      files.push(e);
    }
    if (e.children.length > 0) {
      files = files.concat(gatherSelectedFiles(e.children));
    }
  }
  return files;
}

export function RepoExplorerView() {
  const [repoPath, setRepoPath] = useState("");
  const [fsTree, setFsTree] = useState<FsEntry[]>([]);
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [error, setError] = useState("");
  const [analysisInProgress, setAnalysisInProgress] = useState(false);

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

  const handleToggleExpand = (pathToToggle: string) => {
    setFsTree((prev) => toggleExpand(prev, pathToToggle));
  };

  const handleCheckboxChange = (pathToToggle: string) => {
    setFsTree((prev) => toggleChecked(prev, pathToToggle));
  };

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
            {entry.isDirectory ? (
              <div
                className="cursor-pointer w-4"
                onClick={(e) => {
                  e.stopPropagation();
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
            {entry.isDirectory ? (
              <Folder className="text-muted-foreground" size={16} />
            ) : (
              <File className="text-muted-foreground" size={16} />
            )}
            <Checkbox
              checked={entry.isChecked}
              onCheckedChange={() => handleCheckboxChange(entry.path)}
              id={entry.path}
            />
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
          {entry.isDirectory && entry.isExpanded && hasChildren && (
            <div className="ml-1 mt-0.5 border-l border-l-muted">
              {renderFsTree(entry.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  // MODIFIED to run parseJsOrTsFile on all selected .js/.ts files
  const handleProceedClick = async () => {
    try {
      // Gather only the selected files
      const selectedFiles = gatherSelectedFiles(fsTree);

      // Run AST parser on each JavaScript/TypeScript file
      for (const file of selectedFiles) {
        if (
          file.language === "javascript" ||
          file.language === "typescript"
        ) {
          const content = await readTextFile(file.path);
          // call the parser which updates Neo4j
          await parseJsOrTsFile(content, file.path);
        }
      }

      // Once parsing is done, show the analysis screen
      setAnalysisInProgress(true);
    } catch (err) {
      console.error("Error parsing AST:", err);
      setError(String(err));
    }
  };

  if (analysisInProgress) {
    return <AnalysisLoadingView fsTree={fsTree} />;
  }

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