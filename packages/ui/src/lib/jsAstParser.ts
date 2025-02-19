import parser from "@babel/parser";
import traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { createAstNodeInNeo4j, createAstRelationshipInNeo4j } from "./neo4jConnection.js";

/**
 * Parse JS/TS source code using Babel, then create nodes and relationships in Neo4j.
 *
 * @param code - The file contents as a string.
 * @param filePath - The path of this file, used for referencing the graph relationship.
 */
export async function parseJsOrTsFile(code: string, filePath: string) {
  // 1. Parse code with Babel parser using TS + JSX plugins
  const ast = parser.parse(code, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  /**
   * We'll store the name of the current "enclosing" function/class.
   * For instance, if we are inside a function named "doSomething",
   * we treat that as the "callerName" for any function calls we find.
   */
  let currentEnclosingName: string | null = null;

  // 2. Traverse the AST to find top-level declarations (functions, classes, calls)
  const traverseFn = traverse as unknown as (ast: t.Node, opts: any) => void;
  traverseFn(ast, {
    // Called whenever we enter a node
    enter(path: NodePath<t.Node>) {
      /**
       * Function Declarations
       * e.g. function greet() { ... }
       */
      if (t.isFunctionDeclaration(path.node)) {
        const node = path.node;
        if (node.id && node.id.name) {
          const funcName = node.id.name;
          // Insert or MERGE a node in Neo4j representing this function
          createAstNodeInNeo4j(filePath, funcName, "FunctionDeclaration").catch(
            (err) => console.error("Neo4j insert error (function):", err),
          );
          // Update enclosing name
          currentEnclosingName = funcName;
        }
      }

      /**
       * Class Declarations
       * e.g. class MyClass { ... }
       */
      if (t.isClassDeclaration(path.node)) {
        const node = path.node;
        if (node.id && node.id.name) {
          const className = node.id.name;
          createAstNodeInNeo4j(filePath, className, "ClassDeclaration").catch(
            (err) => console.error("Neo4j insert error (class):", err),
          );
          // Update enclosing name
          currentEnclosingName = className;
        }
      }

      /**
       * Arrow Functions or Function Expressions can also have names if they're assigned:
       * e.g. const doThing = function() { ... }
       * or   const doThing = () => { ... }
       */
      if (
        t.isVariableDeclarator(path.node) &&
        (t.isArrowFunctionExpression(path.node.init) ||
          t.isFunctionExpression(path.node.init)) &&
        t.isIdentifier(path.node.id)
      ) {
        const funcName = path.node.id.name;
        createAstNodeInNeo4j(filePath, funcName, "FunctionExpression").catch(
          (err) => console.error("Neo4j insert error (arrow func):", err),
        );
        currentEnclosingName = funcName;
      }

      /**
       * Detect direct function calls:
       * e.g. greet(), doSomethingElse(123)
       *
       * Node shape = CallExpression(callee=Identifier | MemberExpression, arguments=...)
       */
      if (t.isCallExpression(path.node)) {
        // If the caller is known (currentEnclosingName),
        // attempt to detect the callee's name:
        if (currentEnclosingName) {
          const callee = path.node.callee;
          let calleeName = "";

          // For simple calls: e.g. greet()
          if (t.isIdentifier(callee)) {
            calleeName = callee.name;
          }
          // For member calls: e.g. console.log -> callee.object=console, callee.property=log
          else if (t.isMemberExpression(callee)) {
            // This is naive: e.g. "object.property"
            const objectPart = t.isIdentifier(callee.object) ? callee.object.name : "unknownObj";
            const propertyPart = t.isIdentifier(callee.property) ? callee.property.name : "unknownProp";
            calleeName = `${objectPart}.${propertyPart}`;
          } else {
            calleeName = "anonymous_call";
          }

          // If we found a valid calleeName, we can create the relationship
          if (calleeName) {
            // Insert or MERGE the callee node if you want:
            createAstNodeInNeo4j(filePath, calleeName, "FunctionReference").catch(
              (err) => console.error("Neo4j insert error (call):", err),
            );

            // Create relationship (caller)-[:CALLS]->(callee)
            createAstRelationshipInNeo4j(currentEnclosingName, calleeName, "CALLS").catch((err) =>
              console.error("Neo4j relationship error:", err),
            );
          }
        }
      }
    },

    // Called whenever we exit a node
    exit(path: NodePath<t.Node>) {
      // If we exit a function or class declaration block, reset the currentEnclosingName
      if (
        t.isFunctionDeclaration(path.node) ||
        t.isClassDeclaration(path.node) ||
        (t.isVariableDeclarator(path.node) &&
          (t.isArrowFunctionExpression(path.node.init) ||
            t.isFunctionExpression(path.node.init)))
      ) {
        // Once out of this node, we revert to the parent's context if needed
        // For simplicity, just set to null here. 
        currentEnclosingName = null;
      }
    },
  });
}