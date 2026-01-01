import { NextRequest, NextResponse } from "next/server";
import { azureDbClient } from "@studio/api/server";

export async function POST(request: NextRequest) {
  try {
    const sectionData = await request.json();

    if (!sectionData.template_id || !sectionData.name) {
      return NextResponse.json(
        { error: "template_id and name are required" },
        { status: 400 }
      );
    }

    const newSection = await azureDbClient.createSection(sectionData);
    return NextResponse.json(newSection);
  } catch (error) {
    console.error("Error creating section:", error);
    return NextResponse.json(
      { error: "Failed to create section" },
      { status: 500 }
    );
  }
}
