import { NextRequest, NextResponse } from "next/server";
import {
  createAstNodeInNeo4j,
  createAstRelationshipInNeo4j,
} from "@repo/ui/lib/neo4jConnection";

// Add CORS support by handling OPTIONS preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };
  try {
    const body = await request.json();
    console.log("Received AST save payload:", body);

    if (body.type === "node") {
      const { filePath, entityName, entityType } = body;
      console.log(
        `[DEBUG] Creating node in Neo4j: filePath=${filePath}, entityName=${entityName}, entityType=${entityType}`,
      );
      await createAstNodeInNeo4j(filePath, entityName, entityType);
      return NextResponse.json({ success: true, message: "Node created" }, { headers: corsHeaders });
    } else if (body.type === "relationship") {
      const { callerName, calleeName, relationshipType } = body;
      console.log(
        `[DEBUG] Creating relationship in Neo4j: caller=${callerName}, callee=${calleeName}, rel=${relationshipType}`,
      );
      await createAstRelationshipInNeo4j(callerName, calleeName, relationshipType);
      return NextResponse.json({ success: true, message: "Relationship created" }, { headers: corsHeaders });
    }

    return NextResponse.json({ success: false, error: "Invalid request type" }, { headers: corsHeaders });
  } catch (error) {
    console.error("[ERROR in /api/ast-save]", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500, headers: corsHeaders },
    );
  }
}
