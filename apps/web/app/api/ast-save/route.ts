import { NextRequest, NextResponse } from "next/server";
import {
  createAstNodeInNeo4j,
  createAstRelationshipInNeo4j,
} from "@repo/ui/lib/neo4jConnection";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Received AST save payload:", body);

    if (body.type === "node") {
      const { filePath, entityName, entityType } = body;
      console.log(
        `[DEBUG] Creating node in Neo4j: filePath=${filePath}, entityName=${entityName}, entityType=${entityType}`,
      );
      await createAstNodeInNeo4j(filePath, entityName, entityType);
      return NextResponse.json({ success: true, message: "Node created" });
    } else if (body.type === "relationship") {
      const { callerName, calleeName, relationshipType } = body;
      console.log(
        `[DEBUG] Creating relationship in Neo4j: caller=${callerName}, callee=${calleeName}, rel=${relationshipType}`,
      );
      await createAstRelationshipInNeo4j(
        callerName,
        calleeName,
        relationshipType,
      );
      return NextResponse.json({
        success: true,
        message: "Relationship created",
      });
    }

    return NextResponse.json({
      success: false,
      error: "Invalid request type",
    });
  } catch (error) {
    console.error("[ERROR in /api/ast-save]", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
