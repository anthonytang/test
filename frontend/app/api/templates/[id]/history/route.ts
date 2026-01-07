import { NextRequest, NextResponse } from "next/server";
import { azureDbClient } from "@studio/api/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: templateId } = params;
    const history = await azureDbClient.getTemplateHistory(templateId);
    return NextResponse.json(history);
  } catch (error) {
    console.error("Error fetching template history:", error);
    return NextResponse.json(
      { error: "Failed to fetch template history" },
      { status: 500 }
    );
  }
}
