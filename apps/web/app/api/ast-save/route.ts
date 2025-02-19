import { NextResponse } from "next/server";
import {
  createAstNodeInNeo4j,
  createAstRelationshipInNeo4j,
} from "@repo/ui/lib/neo4jConnection";

export async function POST(request: Request) {
  const body = await request.json();
  try {
    if (body.type === "node") {
      const { filePath, entityName, entityType } = body;
      await createAstNodeInNeo4j(filePath, entityName, entityType);
    } else if (body.type === "relationship") {
      const { callerName, calleeName, relationshipType } = body;
      await createAstRelationshipInNeo4j(callerName, calleeName, relationshipType);
    } else {
      return NextResponse.json({ success: false, error: "Invalid type" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
