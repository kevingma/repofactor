import neo4j, { Driver, Session } from "neo4j-driver";

let driver: Driver;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    // Set your correct credentials here:
    const NEO4J_URI = "bolt://localhost:7687";
    const NEO4J_USER = "neo4j";
    const NEO4J_PASSWORD = "secret";
    console.log("[DEBUG] Connecting to Neo4j:", NEO4J_URI);
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  }
  return driver;
}

export async function createAstNodeInNeo4j(
  filePath: string,
  entityName: string,
  entityType: string,
) {
  console.log(
    `[DEBUG] createAstNodeInNeo4j: filePath=${filePath}, entityName=${entityName}, entityType=${entityType}`,
  );

  const driver = getNeo4jDriver();
  const session: Session = driver.session({ database: "neo4j" });

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MERGE (f:File {path: $filePath})
        MERGE (n:AstEntity {name: $entityName, type: $entityType})
        MERGE (f)-[:CONTAINS_ENTITY]->(n)
        `,
        { filePath, entityName, entityType },
      );
    });
    console.log("[DEBUG] Node created successfully in Neo4j.");
  } catch (err) {
    console.error("[ERROR] createAstNodeInNeo4j failed:", err);
    throw err;
  } finally {
    await session.close();
  }
}

export async function createAstRelationshipInNeo4j(
  callerName: string,
  calleeName: string,
  relationshipType: string,
) {
  console.log(
    `[DEBUG] createAstRelationshipInNeo4j: caller=${callerName}, callee=${calleeName}, relationshipType=${relationshipType}`,
  );

  const driver = getNeo4jDriver();
  const session: Session = driver.session({ database: "neo4j" });

  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `
        MERGE (caller:AstEntity {name: $callerName})
        MERGE (callee:AstEntity {name: $calleeName})
        MERGE (caller)-[r:${relationshipType}]->(callee)
        `,
        { callerName, calleeName },
      );
    });
    console.log("[DEBUG] Relationship created successfully in Neo4j.");
  } catch (err) {
    console.error("[ERROR] createAstRelationshipInNeo4j failed:", err);
    throw err;
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
