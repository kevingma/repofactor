import { NextRequest, NextResponse } from "next/server";
import { ESLint } from "eslint";
import { createLintIssueInNeo4j } from "@repo/ui/lib/neo4jConnection";
import sonarjs from "eslint-plugin-sonarjs";

/**
 * Expected payload:
 * {
 *   "files": ["/absolute/path/to/file1.ts", "/absolute/path/to/file2.js", ...]
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

    // Initialize a programmatic ESLint instance with dynamic parser overrides
    const eslint = new ESLint({
      useEslintrc: false,
      overrideConfig: {
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
        },
        overrides: [
          // TypeScript overrides
          {
            files: ["**/*.ts", "**/*.tsx"],
            parser: "@typescript-eslint/parser",
            parserOptions: {
              ecmaVersion: "latest",
              sourceType: "module",
            },
            extends: [
              "plugin:@typescript-eslint/recommended",
              "plugin:sonarjs/recommended",
            ],
            plugins: ["@typescript-eslint", "sonarjs"],
          },
          // JavaScript overrides
          {
            files: ["**/*.js", "**/*.jsx"],
            parser: "espree",
            parserOptions: {
              ecmaVersion: "latest",
              sourceType: "module",
            },
            extends: ["plugin:sonarjs/recommended"],
            plugins: ["sonarjs"],
          },
        ],
      },
    });

    // Lint the user-selected files
    const lintResults = await eslint.lintFiles(files);

    // For each file's lint result, store each reported issue in Neo4j
    for (const fileResult of lintResults) {
      const { filePath, messages } = fileResult;

      for (const msg of messages) {
        // You could filter out "warning"-level issues if desired
        await createLintIssueInNeo4j({
          filePath,
          ruleId: msg.ruleId ?? "unknown-rule",
          severity: msg.severity, // 1 = warning, 2 = error
          message: msg.message,
          line: msg.line,
          column: msg.column,
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
