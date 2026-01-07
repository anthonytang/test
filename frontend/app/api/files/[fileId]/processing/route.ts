// POST /api/files/[fileId]/processing - Initialize file processing
// DELETE /api/files/[fileId]/processing - Abort file processing
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APIM_BASE_URL = process.env.APIM_BASE_URL;
const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL!;

const isCloudMode = !!(APIM_BASE_URL && APIM_SUBSCRIPTION_KEY);

export async function POST(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  const authHeader = request.headers.get("authorization") ?? undefined;

  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/files/${encodeURIComponent(fileId)}/processing`);
    apimUrl.searchParams.set("subscription-key", APIM_SUBSCRIPTION_KEY!);

    try {
      const headers: Record<string, string> = {
        "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
        "Content-Type": "application/json",
      };
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const response = await fetch(apimUrl.toString(), {
        method: "POST",
        headers,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return NextResponse.json(data, { status: response.status });
      }

      return NextResponse.json(data);
    } catch (err) {
      console.error("[FILES/PROCESSING] Error proxying init to APIM:", err);
      return NextResponse.json({ error: "Error initializing processing" }, { status: 500 });
    }
  }

  // Local mode
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/files/${encodeURIComponent(fileId)}/processing`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const response = await fetch(backendUrl, {
      method: "POST",
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[FILES/PROCESSING] Error calling backend init:", err);
    return NextResponse.json({ error: "Error initializing processing" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params;
  const authHeader = request.headers.get("authorization") ?? undefined;

  // Read request body (contains processing_id)
  let body: string | undefined;
  try {
    body = await request.text();
  } catch {
    body = undefined;
  }

  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/files/${encodeURIComponent(fileId)}/processing`);
    apimUrl.searchParams.set("subscription-key", APIM_SUBSCRIPTION_KEY!);

    try {
      const headers: Record<string, string> = {
        "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
        "Content-Type": "application/json",
      };
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const response = await fetch(apimUrl.toString(), {
        method: "DELETE",
        headers,
        body,
      });

      const text = await response.text().catch(() => "");

      if (!response.ok) {
        console.error("[FILES/PROCESSING] APIM abort error:", response.status, text);
        try {
          return NextResponse.json(JSON.parse(text), { status: response.status });
        } catch {
          return NextResponse.json(
            { error: "Failed to abort processing", body: text },
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
      console.error("[FILES/PROCESSING] Error proxying abort to APIM:", err);
      return NextResponse.json(
        { error: "Error aborting processing" },
        { status: 500 }
      );
    }
  }

  // Local mode
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/files/${encodeURIComponent(fileId)}/processing`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    const response = await fetch(backendUrl, {
      method: "DELETE",
      headers,
      body,
    });

    const text = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[FILES/PROCESSING] Backend abort error:", response.status, text);
      try {
        return NextResponse.json(JSON.parse(text), { status: response.status });
      } catch {
        return NextResponse.json(
          { error: "Failed to abort processing", body: text },
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
    console.error("[FILES/PROCESSING] Error calling backend abort:", err);
    return NextResponse.json(
      { error: "Error aborting processing" },
      { status: 500 }
    );
  }
}
