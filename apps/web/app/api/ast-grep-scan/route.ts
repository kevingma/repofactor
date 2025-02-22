import { NextRequest, NextResponse } from "next/server";
import { createAstGrepIssueInNeo4j } from "@repo/ui/lib/neo4jConnection";
import { spawn } from "child_process";
import path from "path";
import os from "os";

/**
 * This route will accept a POST body like:
 * {
 *   "files": ["/absolute/path/to/jsFile1.js", "/absolute/path/to/jsFile2.js", ...]
 * }
 * 
 * We'll run ast-grep with the "ast-grep-essentials" rules for JavaScript,
 * parse the JSON output, store each issue in Neo4j, and return the results.
 */

// For demonstration, assume we cloned or installed ast-grep-essentials rules under project root.
// Adjust the absolute path to your real local location of "ast-grep-essentials/rules/javascript/"
const AST_GREP_RULES_DIR = path.join(
  process.cwd(),
  "ast-grep-essentials",
  "rules",
  "javascript"
);

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  try {
    const { files } = await request.json();

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No files provided for ast-grep scan." },
        { status: 400, headers: corsHeaders },
      );
    }

    // We'll run ast-grep via child_process spawn,
    // passing in:
    //   - `scan`
    //   - `--json` for JSON output
    //   - `--rule` or `-r` pointing to the rules folder
    //   - the user selected file paths
    //
    // For large file sets, consider chunking or streaming. For brevity, we do a direct pass.

    const astGrepCmd = "ast-grep"; // or "sg" if installed that way
    const args = [
      "scan",
      "--json",
      "-r",
      AST_GREP_RULES_DIR,
      ...files,
    ];

    // If you need to skip or ignore node_modules, add: "--ignore", "node_modules"
    // or specify further in your sgconfig.yml

    const issues: any[] = await new Promise((resolve, reject) => {
      const child = spawn(astGrepCmd, args, { shell: true });
      let stdoutData = "";
      let stderrData = "";

      child.stdout.on("data", (chunk) => {
        stdoutData += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderrData += chunk;
      });
      child.on("close", (code) => {
        if (code !== 0 && !stdoutData) {
          console.error("[AST-GREP ERROR]", stderrData);
          return reject(
            new Error(`ast-grep scan failed with code ${code}: ${stderrData}`),
          );
        }
        try {
          const parsed = JSON.parse(stdoutData || "[]");
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });

    // "issues" is an array of objects like:
    // {
    //   "text": string,
    //   "range": { ... },
    //   "file": "/absolute/path/to/file.js",
    //   "replacement": "...",
    //   "language": "JavaScript",
    //   "ruleId": "express-jwt-hardcoded-secret-javascript",
    //   "message": "some message",
    //   "severity": "warning" | "error" | ...
    // }
    //
    // We store each issue in Neo4j
    for (const issue of issues) {
      // If the AST-Grep JSON doesn't contain "ruleId"/"message"/"severity" fields,
      // you can adapt them. The "id" or "ruleId" might come from "issue.diagnostics.id" etc.
      const ruleId = issue.ruleId || issue.id || "unknown";
      const message = issue.message || "No message";
      const severity = issue.severity || "warning";

      const line = issue.range?.start?.line || 0;
      const column = issue.range?.start?.column || 0;
      const filePath = issue.file;

      await createAstGrepIssueInNeo4j({
        filePath,
        ruleId,
        message,
        severity,
        line,
        column,
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "AST-Grep scan completed",
        results: issues,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[ERROR in /api/ast-grep-scan]", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500, headers: corsHeaders },
    );
  }
}