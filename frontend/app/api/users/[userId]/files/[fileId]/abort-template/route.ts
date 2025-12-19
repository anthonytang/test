import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@studio/api/server";
import { callApimOnBehalfOfUser } from "@studio/api/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string; fileId: string } }
) {
  try {
    const { userId, fileId } = params;
    const backendUrl = getBackendUrl();
    const isLocal = backendUrl.startsWith("http://localhost");

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isLocal) {
      // ------------------------
      // LOCAL MODE – direct backend
      // ------------------------
      const backendResponse = await fetch(
        `${backendUrl}/users/${userId}/files/${fileId}/abort-template`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
        }
      );

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        return NextResponse.json(
          {
            error:
              errorText || "Failed to abort template generation",
          },
          { status: backendResponse.status }
        );
      }

      const result = await backendResponse.json();
      return NextResponse.json(result);
    }

    // ------------------------
    // CLOUD / APIM MODE
    // ------------------------
    const fakeReq = {
      headers: Object.fromEntries(request.headers.entries()),
    };

    const result = await callApimOnBehalfOfUser(
      fakeReq,
      `/studio/users/${userId}/files/${fileId}/abort-template`,
      {
        method: "POST",
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in abort-template route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
