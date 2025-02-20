import { parse } from "@babel/parser";
import traverse, { type NodePath } from "@babel/traverse";
import * as t from "@babel/types";

/**
 * Gathers AST node/relationship info and
 * also sends them to /api/ast-save for insertion into Neo4j.
 */
export interface ParserResult {
  filePath: string;
  nodes: Array<{
    type:
      | "FunctionDeclaration"
      | "ClassDeclaration"
      | "FunctionExpression"
      | "FunctionReference"
      | "AnonymousFunction";
    name: string;
  }>;
  relationships: Array<{
    caller: string;
    callee: string;
    relationshipType: string;
  }>;
}

/**
 * Generate a name for any function node (declaration, expression, or arrow).
 * If it's an anonymous arrow/function expression, we derive a unique name.
 */
function getFunctionName(path: NodePath<t.Function>): string {
  // e.g. function functionName() {}
  if (t.isFunctionDeclaration(path.node) && path.node.id) {
    return path.node.id.name;
  }

  // e.g. const foo = function() {} or const foo = () => {}
  if (
    (t.isArrowFunctionExpression(path.node) ||
      t.isFunctionExpression(path.node)) &&
    t.isVariableDeclarator(path.parent) &&
    t.isIdentifier(path.parent.id)
  ) {
    return path.parent.id.name;
  }

  // If there's no direct identifier for the function (like callbacks), generate a placeholder name
  return `anonymous_${path.node.start ?? 0}`;
}

export async function parseJsOrTsFile(
  code: string,
  filePath: string,
): Promise<ParserResult> {
  const discoveredNodes: Array<{
    type:
      | "FunctionDeclaration"
      | "ClassDeclaration"
      | "FunctionExpression"
      | "AnonymousFunction"
      | "FunctionReference";
    name: string;
  }> = [];

  const discoveredRelationships: Array<{
    caller: string;
    callee: string;
    relationshipType: string;
  }> = [];

  // A stack to track the "current" function or class context
  const functionStack: string[] = [];

  // Parse the code with Babel
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  /**
   * Helper to record a new node in Neo4j via /api/ast-save
   */
  function recordNodeInNeo4j(
    entityName: string,
    entityType: string,
    filePath: string,
  ): void {
    discoveredNodes.push({ type: entityType as any, name: entityName });

    fetch("http://localhost:3000/api/ast-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "node",
        filePath,
        entityName,
        entityType,
      }),
    }).catch((err) => console.error("Error saving node:", err));
  }

  /**
   * Helper to record a new relationship in Neo4j via /api/ast-save
   */
  function recordRelationshipInNeo4j(
    callerName: string,
    calleeName: string,
    relationshipType: string,
  ): void {
    discoveredRelationships.push({
      caller: callerName,
      callee: calleeName,
      relationshipType,
    });

    fetch("http://localhost:3000/api/ast-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "relationship",
        callerName,
        calleeName,
        relationshipType,
      }),
    }).catch((err) => console.error("Error saving relationship:", err));
  }

  traverse(ast, {
    // Push a "GLOBAL" context so top-level calls are captured as well
    Program: {
      enter() {
        functionStack.push("GLOBAL");
      },
      exit() {
        functionStack.pop();
      },
    },

    // ========== Function Declarations =============
    FunctionDeclaration: {
      enter(path) {
        const funcName = getFunctionName(path);
        functionStack.push(funcName);

        recordNodeInNeo4j(funcName, "FunctionDeclaration", filePath);
      },
      exit() {
        functionStack.pop();
      },
    },

    // ========== Class Declarations ===============
    ClassDeclaration: {
      enter(path) {
        if (path.node.id && path.node.id.name) {
          const className = path.node.id.name;
          functionStack.push(className);

          recordNodeInNeo4j(className, "ClassDeclaration", filePath);
        } else {
          // No named class? Generate a placeholder
          const placeholder = `anonymousClass_${path.node.start ?? 0}`;
          functionStack.push(placeholder);
          recordNodeInNeo4j(placeholder, "ClassDeclaration", filePath);
        }
      },
      exit() {
        functionStack.pop();
      },
    },

    // ========== Function/Arrow Expressions ========
    FunctionExpression: {
      enter(path) {
        const funcName = getFunctionName(path);
        functionStack.push(funcName);

        // If we recognized it as a variable-based name, label it "FunctionExpression"
        // Otherwise it's truly anonymous
        const nodeType = funcName.startsWith("anonymous_")
          ? "AnonymousFunction"
          : "FunctionExpression";
        recordNodeInNeo4j(funcName, nodeType, filePath);
      },
      exit() {
        functionStack.pop();
      },
    },
    ArrowFunctionExpression: {
      enter(path) {
        const funcName = getFunctionName(path as NodePath<t.Function>);
        functionStack.push(funcName);

        const nodeType = funcName.startsWith("anonymous_")
          ? "AnonymousFunction"
          : "FunctionExpression";
        recordNodeInNeo4j(funcName, nodeType, filePath);
      },
      exit() {
        functionStack.pop();
      },
    },

    // ========== Call Expressions ==================
    CallExpression(path) {
      // If there's at least one function/class on the stack,
      // the topmost element in the stack is our "caller"
      if (functionStack.length > 0) {
        const callerName = functionStack[functionStack.length - 1];
        const callee = path.node.callee;
        let calleeName = "anonymous_call";

        if (t.isIdentifier(callee)) {
          calleeName = callee.name;
        } else if (t.isMemberExpression(callee)) {
          // e.g. router.get, chalk.bgRed, etc.
          const objectPart = t.isIdentifier(callee.object)
            ? callee.object.name
            : "unknownObj";
          const propertyPart = t.isIdentifier(callee.property)
            ? callee.property.name
            : "unknownProp";
          calleeName = `${objectPart}.${propertyPart}`;
        }

        // Record the reference node
        recordNodeInNeo4j(calleeName, "FunctionReference", filePath);

        // Record the relationship
        recordRelationshipInNeo4j(callerName, calleeName, "CALLS");
      }
    },
  });

  return {
    filePath,
    nodes: discoveredNodes,
    relationships: discoveredRelationships,
  };
}
