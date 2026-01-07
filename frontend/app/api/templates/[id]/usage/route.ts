import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/templates/[id]/usage
 *
 * Track template usage. This is a no-op endpoint since usage is already
 * tracked via the runs table when templates are executed.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Usage is tracked via runs table, so this is just an acknowledgment
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating template usage:", error);
    return NextResponse.json(
      { error: "Failed to update usage" },
      { status: 500 }
    );
  }
}
