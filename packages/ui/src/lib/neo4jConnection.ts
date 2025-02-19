import neo4j, { Driver, Session } from "neo4j-driver";

let driver: Driver;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    const NEO4J_URI = "bolt://localhost:7687";
    const NEO4J_USER = "neo4j";
    const NEO4J_PASSWORD = "PY6A2POR4p*bgkF&92Fh";
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  }
  return driver;
}

export async function createAstNodeInNeo4j(
  filePath: string,
  entityName: string,
  entityType: string,
) {
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
  } finally {
    await session.close();
  }
}

/**
 * Creates a relationship between two AST entities in Neo4j.
 * For example, (caller)-[:CALLS]->(callee).
 */
export async function createAstRelationshipInNeo4j(
  callerName: string,
  calleeName: string,
  relationshipType: string,
) {
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
  } finally {
    await session.close();
  }
}

export async function closeNeo4jConnection() {
  if (driver) {
    await driver.close();
  }
}
