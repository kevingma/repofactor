import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

// New helper functions that delegate AST persistence to the backend API.
async function saveAstNode(filePath: string, entityName: string, entityType: string) {
  try {
    await fetch("http://localhost:3000/api/ast-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "node", filePath, entityName, entityType }),
    });
  } catch (err) {
    console.error("Error saving AST node:", err);
  }
}

async function saveAstRelationship(
  callerName: string,
  calleeName: string,
  relationshipType: string,
) {
  try {
    await fetch("http://localhost:3000/api/ast-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "relationship", callerName, calleeName, relationshipType }),
    });
  } catch (err) {
    console.error("Error saving AST relationship:", err);
  }
}

export async function parseJsOrTsFile(code: string, filePath: string) {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  let currentEnclosingName: string | null = null;

  const traverseFn = traverse as unknown as (ast: t.Node, opts: any) => void;
  traverseFn(ast, {
    enter(path: NodePath<t.Node>) {
      // Function Declaration
      if (t.isFunctionDeclaration(path.node)) {
        const node = path.node;
        if (node.id && node.id.name) {
          const funcName = node.id.name;
          saveAstNode(filePath, funcName, "FunctionDeclaration");
          currentEnclosingName = funcName;
        }
      }
      // Class Declaration
      if (t.isClassDeclaration(path.node)) {
        const node = path.node;
        if (node.id && node.id.name) {
          const className = node.id.name;
          saveAstNode(filePath, className, "ClassDeclaration");
          currentEnclosingName = className;
        }
      }
      // Function Expression (Arrow or Regular)
      if (
        t.isVariableDeclarator(path.node) &&
        (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init)) &&
        t.isIdentifier(path.node.id)
      ) {
        const funcName = path.node.id.name;
        saveAstNode(filePath, funcName, "FunctionExpression");
        currentEnclosingName = funcName;
      }
      // Call Expression – record relationship if inside a function/class context
      if (t.isCallExpression(path.node)) {
        if (currentEnclosingName) {
          const callee = path.node.callee;
          let calleeName = "";
          if (t.isIdentifier(callee)) {
            calleeName = callee.name;
          } else if (t.isMemberExpression(callee)) {
            const objectPart = t.isIdentifier(callee.object) ? callee.object.name : "unknownObj";
            const propertyPart = t.isIdentifier(callee.property) ? callee.property.name : "unknownProp";
            calleeName = `${objectPart}.${propertyPart}`;
          } else {
            calleeName = "anonymous_call";
          }
          if (calleeName) {
            saveAstNode(filePath, calleeName, "FunctionReference");
            saveAstRelationship(currentEnclosingName, calleeName, "CALLS");
          }
        }
      }
    },
    exit(path: NodePath<t.Node>) {
      if (
        t.isFunctionDeclaration(path.node) ||
        t.isClassDeclaration(path.node) ||
        (t.isVariableDeclarator(path.node) &&
          (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init)))
      ) {
        currentEnclosingName = null;
      }
    },
  });
}