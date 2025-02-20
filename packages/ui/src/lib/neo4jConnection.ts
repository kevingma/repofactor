import neo4j from 'neo4j-driver';

// Use environment variables when available, fallback to local active DBMS credentials
const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";  // Updated to our active DBMS
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "PY6A2POR4p*bgkF&92Fh";  // New password provided

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

export async function createAstNodeInNeo4j(filePath: string, entityName: string, entityType: string) {
  // Open session explicitly on the 'neo4j' database
  const session = driver.session({ database: "neo4j" });
  try {
    const query = `
      CREATE (n:AstNode { filePath: $filePath, name: $entityName, type: $entityType })
      RETURN n
    `;
    const result = await session.run(query, { filePath, entityName, entityType });
    return result.records;
  } catch (error) {
    console.error("Error in createAstNodeInNeo4j:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function createAstRelationshipInNeo4j(callerName: string, calleeName: string, relationshipType: string) {
  // Open session explicitly on the 'neo4j' database
  const session = driver.session({ database: "neo4j" });
  try {
    // Note: relationshipType is interpolated directly; ensure it is a safe value
    const query = `
      MERGE (caller:AstNode { name: $callerName })
      MERGE (callee:AstNode { name: $calleeName })
      MERGE (caller)-[r:${relationshipType}]->(callee)
      RETURN r
    `;
    const result = await session.run(query, { callerName, calleeName });
    return result.records;
  } catch (error) {
    console.error("Error in createAstRelationshipInNeo4j:", error);
    throw error;
  } finally {
    await session.close();
  }
}

/**
 * Create a 'LintIssue' node in Neo4j and link it to an existing or
 * newly created AstNode for the file path.
 */
export async function createLintIssueInNeo4j(params: {
  filePath: string;
  ruleId: string;
  severity: number;
  message: string;
  line: number;
  column: number;
}) {
  const { filePath, ruleId, severity, message, line, column } = params;
  const session = driver.session({ database: "neo4j" });

  try {
    // Ensure there's an AstNode for this file if it does not exist
    // Then create a new LintIssue node and connect it
    const query = `
      MERGE (file:AstNode { filePath: $filePath })
      CREATE (issue:LintIssue {
        ruleId: $ruleId,
        severity: $severity,
        message: $message,
        line: $line,
        column: $column
      })
      CREATE (file)-[:HAS_LINT_ISSUE]->(issue)
      RETURN issue
    `;

    const result = await session.run(query, {
      filePath,
      ruleId,
      severity,
      message,
      line,
      column,
    });

    return result.records;
  } catch (error) {
    console.error("Error in createLintIssueInNeo4j:", error);
    throw error;
  } finally {
    await session.close();
  }
}

export async function closeNeo4jConnection() {
  console.log("[DEBUG] Closing Neo4j connection");
  if (driver) {
    await driver.close();
  }
}
