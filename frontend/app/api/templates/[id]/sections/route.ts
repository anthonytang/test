import { NextRequest, NextResponse } from "next/server";
import { azureDbClient } from "@studio/api/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const template = await azureDbClient.getTemplateWithSections(id);

    // Disable cache to ensure fresh data
    return NextResponse.json(template, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error fetching template with sections:", error);
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }
}
