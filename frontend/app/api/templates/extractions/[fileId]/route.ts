// DELETE /api/templates/extractions/[fileId] - Abort template extraction
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APIM_BASE_URL = process.env.APIM_BASE_URL;
const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL!;

const isCloudMode = !!(APIM_BASE_URL && APIM_SUBSCRIPTION_KEY);

export async function DELETE(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  const authHeader = request.headers.get("authorization") ?? undefined;

  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/templates/extractions/${encodeURIComponent(fileId)}`);
    apimUrl.searchParams.set("subscription-key", APIM_SUBSCRIPTION_KEY!);

    try {
      const headers: Record<string, string> = {
        "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
      };
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const response = await fetch(apimUrl.toString(), {
        method: "DELETE",
        headers,
      });

      const text = await response.text().catch(() => "");

      if (!response.ok) {
        console.error("[TEMPLATES/EXTRACTIONS] APIM error:", response.status, text);
        try {
          return NextResponse.json(JSON.parse(text), { status: response.status });
        } catch {
          return NextResponse.json(
            { error: "Failed to abort extraction", body: text },
            { status: response.status }
          );
        }
      }

      try {
        return NextResponse.json(JSON.parse(text), { status: response.status });
      } catch {
        return new NextResponse(text, {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("[TEMPLATES/EXTRACTIONS] Error proxying to APIM:", err);
      return NextResponse.json(
        { error: "Error aborting extraction" },
        { status: 500 }
      );
    }
  }

  // Local mode
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/templates/extractions/${encodeURIComponent(fileId)}`;

  try {
    const headers: Record<string, string> = {};
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const response = await fetch(backendUrl, {
      method: "DELETE",
      headers,
    });

    const text = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[TEMPLATES/EXTRACTIONS] Backend error:", response.status, text);
      try {
        return NextResponse.json(JSON.parse(text), { status: response.status });
      } catch {
        return NextResponse.json(
          { error: "Failed to abort extraction", body: text },
          { status: response.status }
        );
      }
    }

    try {
      return NextResponse.json(JSON.parse(text), { status: response.status });
    } catch {
      return new NextResponse(text, {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("[TEMPLATES/EXTRACTIONS] Error calling backend:", err);
    return NextResponse.json(
      { error: "Error aborting extraction" },
      { status: 500 }
    );
  }
}
