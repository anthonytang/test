import { NextRequest, NextResponse } from "next/server";
import { azureDbClient } from "@studio/api/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: { sectionId: string } }
) {
  try {
    const updates = await request.json();
    const { sectionId } = params;

    await azureDbClient.updateSection(sectionId, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating section:", error);
    return NextResponse.json(
      { error: "Failed to update section" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { sectionId: string } }
) {
  try {
    const { sectionId } = params;

    await azureDbClient.deleteSection(sectionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting section:", error);
    return NextResponse.json(
      { error: "Failed to delete section" },
      { status: 500 }
    );
  }
}
