import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@studio/api/server";
import { callApimOnBehalfOfUser } from "@studio/api/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { fieldId: string } }
) {
  const { fieldId } = params;

  try {
    const backendUrl = getBackendUrl();
    const isLocal = backendUrl.startsWith("http://localhost");

    if (isLocal) {
      // ------------------------
      // LOCAL MODE (direct backend)
      // ------------------------
      const response = await fetch(
        `${backendUrl}/process/field/${fieldId}/abort`,
        {
          method: "POST",
          headers: {
            Authorization: request.headers.get("Authorization") || "",
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return NextResponse.json(data, { status: response.status });
      }

      return NextResponse.json(data);
    }

    // ------------------------
    // CLOUD / APIM MODE
    // ------------------------
    const authHeader = request.headers.get("authorization") || "";
    const fakeReq = {
      headers: Object.fromEntries(request.headers.entries()),
    };

    // MUST include /studio prefix when calling APIM
    const data = await callApimOnBehalfOfUser(
      fakeReq,
      `/studio/process/field/${fieldId}/abort`,
      {
        method: "POST",
        headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
        },
      },
      
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error(
      `Error in /api/process/field/${params.fieldId}/abort:`,
      error
    );
    return NextResponse.json(
      { error: "Failed to abort field processing" },
      { status: 500 }
    );
  }
}
