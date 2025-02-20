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
      | "ClassExpression"
      | "ClassMethod"
      | "ClassPrivateMethod"
      | "ObjectMethod"
      | "FunctionExpression"
      | "ArrowFunction"
      | "AnonymousFunction"
      | "FunctionReference";
    name: string;
  }>;
  relationships: Array<{
    caller: string;
    callee: string;
    relationshipType: string;
  }>;
}

function getFunctionName(path: NodePath<t.Function>): string {
  // e.g. function namedFunction() {}
  if (t.isFunctionDeclaration(path.node) && path.node.id) {
    return path.node.id.name;
  }

  // e.g. const foo = function() {} or const foo = () => {}
  if (
    (t.isArrowFunctionExpression(path.node) || t.isFunctionExpression(path.node)) &&
    t.isVariableDeclarator(path.parent) &&
    t.isIdentifier(path.parent.id)
  ) {
    return path.parent.id.name;
  }

  // If there's no direct identifier for the function, generate a placeholder name
  return `anonymous_${path.node.start ?? 0}`;
}

/**
 * Retrieve a class name by climbing up the parent path until
 * we find a named ClassDeclaration or ClassExpression.
 */
function getEnclosingClassName(path: NodePath): string {
  let current: NodePath | null = path.parentPath;
  while (current) {
    if (t.isClassDeclaration(current.node) && current.node.id) {
      return current.node.id.name;
    }
    if (t.isClassExpression(current.node) && t.isIdentifier(current.node.id)) {
      return current.node.id.name;
    }
    current = current.parentPath;
  }
  return "anonymousClass";
}

/**
 * Retrieve an object name if the method is defined in an object literal,
 * e.g. const obj = { foo() {} } or const obj = { foo: function() {} }
 */
function getEnclosingObjectName(path: NodePath): string {
  let current: NodePath | null = path.parentPath;
  while (current) {
    if (
      t.isVariableDeclarator(current.node) &&
      t.isIdentifier(current.node.id)
    ) {
      return current.node.id.name;
    }
    current = current.parentPath;
  }
  return "anonymousObject";
}

export async function parseJsOrTsFile(
  code: string,
  filePath: string,
): Promise<ParserResult> {
  const discoveredNodes: Array<{
    type:
      | "FunctionDeclaration"
      | "ClassDeclaration"
      | "ClassExpression"
      | "ClassMethod"
      | "ClassPrivateMethod"
      | "ObjectMethod"
      | "FunctionExpression"
      | "ArrowFunction"
      | "AnonymousFunction"
      | "FunctionReference";
    name: string;
  }> = [];

  const discoveredRelationships: Array<{
    caller: string;
    callee: string;
    relationshipType: string;
  }> = [];

  // A stack to track the "current" function/class/method in which we are nested
  const functionStack: string[] = [];

  /**
   * Helper to record a new node in Neo4j via /api/ast-save
   */
  function recordNodeInNeo4j(
    entityName: string,
    entityType: string,
    filePath: string,
  ): void {
    discoveredNodes.push({
      type: entityType as any,
      name: entityName,
    });

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

  // Parse the code with Babel
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  // Because "traverse" is typed more strictly in @babel/traverse, cast it for usage here
  const traverseFn = traverse as unknown as (node: t.Node, opts: any) => void;

  traverseFn(ast, {
    // Push a "GLOBAL" context for top-level calls
    Program: {
      enter() {
        functionStack.push("GLOBAL");
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Class Declaration ======
    ClassDeclaration: {
      enter(path: NodePath<t.ClassDeclaration>) {
        let className = `anonymousClass_${path.node.start ?? 0}`;
        if (path.node.id) {
          className = path.node.id.name;
        }
        functionStack.push(className);
        recordNodeInNeo4j(className, "ClassDeclaration", filePath);
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Class Expression ======
    ClassExpression: {
      enter(path: NodePath<t.ClassExpression>) {
        let className = `anonymousClass_${path.node.start ?? 0}`;
        if (path.node.id) {
          className = path.node.id.name;
        }
        functionStack.push(className);
        recordNodeInNeo4j(className, "ClassExpression", filePath);
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Class Method ======
    ClassMethod: {
      enter(path: NodePath<t.ClassMethod>) {
        const className = getEnclosingClassName(path);
        let methodName = "unknownMethod";
        if (t.isIdentifier(path.node.key)) {
          methodName = path.node.key.name;
        } else if (t.isStringLiteral(path.node.key) || t.isNumericLiteral(path.node.key)) {
          methodName = String(path.node.key.value);
        }
        const qualifiedName = `${className}.${methodName}`;
        functionStack.push(qualifiedName);
        recordNodeInNeo4j(qualifiedName, "ClassMethod", filePath);
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Class Private Method ======
    ClassPrivateMethod: {
      enter(path: NodePath<t.ClassPrivateMethod>) {
        const className = getEnclosingClassName(path);
        const privateKey = path.node.key.id?.name ?? "privateMethod";
        const qualifiedName = `${className}.#${privateKey}`;
        functionStack.push(qualifiedName);
        recordNodeInNeo4j(qualifiedName, "ClassPrivateMethod", filePath);
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Object Method (e.g. const obj = { method() {} }) ======
    ObjectMethod: {
      enter(path: NodePath<t.ObjectMethod>) {
        const objectName = getEnclosingObjectName(path);
        let methodName = "unknownObjMethod";
        if (t.isIdentifier(path.node.key)) {
          methodName = path.node.key.name;
        } else if (t.isStringLiteral(path.node.key) || t.isNumericLiteral(path.node.key)) {
          methodName = String(path.node.key.value);
        }
        const qualifiedName = `${objectName}.${methodName}`;
        functionStack.push(qualifiedName);
        recordNodeInNeo4j(qualifiedName, "ObjectMethod", filePath);
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Function Declarations ======
    FunctionDeclaration: {
      enter(path: NodePath<t.FunctionDeclaration>) {
        const funcName = getFunctionName(path);
        functionStack.push(funcName);
        recordNodeInNeo4j(funcName, "FunctionDeclaration", filePath);
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Normal Function Expressions ======
    FunctionExpression: {
      enter(path: NodePath<t.FunctionExpression>) {
        const baseFuncName = getFunctionName(path);
        // If parent is an ObjectProperty, we can name it objectName.key
        if (t.isObjectProperty(path.parent) && t.isIdentifier(path.parent.key)) {
          const objectName = getEnclosingObjectName(path);
          const methodName = path.parent.key.name;
          const qualifiedName = `${objectName}.${methodName}`;
          functionStack.push(qualifiedName);
          recordNodeInNeo4j(qualifiedName, "FunctionExpression", filePath);
        } else {
          // fallback
          functionStack.push(baseFuncName);
          const nodeType = baseFuncName.startsWith("anonymous_")
            ? "AnonymousFunction"
            : "FunctionExpression";
          recordNodeInNeo4j(baseFuncName, nodeType, filePath);
        }
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Arrow Function Expressions ======
    ArrowFunctionExpression: {
      enter(path: NodePath<t.ArrowFunctionExpression>) {
        const baseFuncName = getFunctionName(path as NodePath<t.Function>);
        // If parent is an ObjectProperty, we can name it objectName.key
        if (t.isObjectProperty(path.parent) && t.isIdentifier(path.parent.key)) {
          const objectName = getEnclosingObjectName(path);
          const methodName = path.parent.key.name;
          const qualifiedName = `${objectName}.${methodName}`;
          functionStack.push(qualifiedName);
          recordNodeInNeo4j(qualifiedName, "ArrowFunction", filePath);
        } else {
          // fallback
          functionStack.push(baseFuncName);
          const nodeType = baseFuncName.startsWith("anonymous_")
            ? "AnonymousFunction"
            : "ArrowFunction";
          recordNodeInNeo4j(baseFuncName, nodeType, filePath);
        }
      },
      exit() {
        functionStack.pop();
      },
    },

    // ====== Call Expressions (function calls) ======
    CallExpression(path: NodePath<t.CallExpression>) {
      if (functionStack.length > 0) {
        // The topmost function/class/method in the stack is our "caller"
        const callerName = functionStack[functionStack.length - 1]!;
        const callee = path.node.callee;
        let calleeName = "anonymous_call";

        if (t.isIdentifier(callee)) {
          // e.g. express, console, etc.
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