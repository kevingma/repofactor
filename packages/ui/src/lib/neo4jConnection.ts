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

export async function closeNeo4jConnection() {
  console.log("[DEBUG] Closing Neo4j connection");
  if (driver) {
    await driver.close();
  }
}
