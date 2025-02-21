import { NextRequest, NextResponse } from "next/server";
import { ESLint } from "eslint";
import { createLintIssueInNeo4j } from "@repo/ui/lib/neo4jConnection";
import sonarjs from "eslint-plugin-sonarjs";

// Add OPTIONS endpoint for CORS preflight support
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

/**
 * Expected payload:
 * {
 *   "files": ["/absolute/path/to/file1.ts", "/absolute/path/to/file2.ts", ...]
 * }
 */
export async function POST(request: NextRequest) {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };
  try {
    const { files } = await request.json();

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No files provided for linting." },
        { status: 400, headers: corsHeaders },
      );
    }

    // Initialize a programmatic ESLint instance with SonarJS
    // Note: Make sure 'eslint-plugin-sonarjs' and other necessary ESLint
    // dependencies are installed in your project.
    const eslint = new ESLint({
      // "fix": false, // If you want auto-fixes, set to true
      overrideConfig: ({
        ignore: false,
        plugins: { sonarjs },
        extends: [
          "plugin:sonarjs/recommended"
        ],
        ignorePatterns: [],
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module"
        }
      } as any),
      // If you want to lint TypeScript code that requires type information,
      // set "useEslintrc: false" and specify `tsconfig` in parserOptions above.
    });

    // Lint the user-selected files
    const lintResults = await eslint.lintFiles(files);

    // For each file's lint result, store each reported issue in Neo4j
    for (const fileResult of lintResults) {
      const { filePath, messages } = fileResult;

      for (const msg of messages) {
        // Use default values (0) for line and column if they're not provided
        await createLintIssueInNeo4j({
          filePath,
          ruleId: msg.ruleId ?? "unknown-rule",
          severity: msg.severity, // 1 = warning, 2 = error
          message: msg.message,
          line: msg.line ?? 0,
          column: msg.column ?? 0,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Linting completed successfully",
        results: lintResults.map((r) => ({
          filePath: r.filePath,
          errorCount: r.errorCount,
          warningCount: r.warningCount,
          messages: r.messages,
        })),
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[ERROR in /api/lint]", error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500, headers: corsHeaders },
    );
  }
}