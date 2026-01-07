import { NextRequest, NextResponse } from "next/server";
import { azureDbClient } from "@studio/api/server";

export async function POST(request: NextRequest) {
  try {
    const resultData = await request.json();

    if (!resultData.run_id || !resultData.section_id) {
      return NextResponse.json(
        { error: "run_id and section_id are required" },
        { status: 400 }
      );
    }

    const resultId = await azureDbClient.saveResult({
      run_id: resultData.run_id,
      section_id: resultData.section_id,
      value: resultData.value,
      metadata: resultData.metadata,
      status: resultData.status,
    });

    return NextResponse.json({ success: true, resultId });
  } catch (error) {
    console.error("Error saving result:", error);
    return NextResponse.json(
      {
        error: "Failed to save result",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
