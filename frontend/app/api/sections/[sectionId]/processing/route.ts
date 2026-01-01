// POST/DELETE /api/sections/[sectionId]/processing - Init/Abort section processing
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APIM_BASE_URL = process.env.APIM_BASE_URL;
const APIM_SUBSCRIPTION_KEY = process.env.APIM_SUBSCRIPTION_KEY;
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_SERVER_URL!;

const isCloudMode = !!(APIM_BASE_URL && APIM_SUBSCRIPTION_KEY);

// POST - Initialize section processing
export async function POST(
  request: NextRequest,
  { params }: { params: { sectionId: string } }
) {
  const { sectionId } = params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid or missing JSON body" },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? undefined;

  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/sections/${encodeURIComponent(sectionId)}/processing`);
    apimUrl.searchParams.set("subscription-key", APIM_SUBSCRIPTION_KEY!);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
      };
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const response = await fetch(apimUrl.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const text = await response.text().catch(() => "");

      if (!response.ok) {
        console.error("[SECTIONS/PROCESSING] APIM error:", response.status, text);
        try {
          return NextResponse.json(JSON.parse(text), { status: response.status });
        } catch {
          return NextResponse.json(
            { error: "Failed to init processing", body: text },
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
      console.error("[SECTIONS/PROCESSING] Error proxying to APIM:", err);
      return NextResponse.json(
        { error: "Error initializing processing" },
        { status: 500 }
      );
    }
  }

  // Local mode
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/sections/${encodeURIComponent(sectionId)}/processing`;

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
      body: JSON.stringify(body),
    });

    const text = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[SECTIONS/PROCESSING] Backend error:", response.status, text);
      try {
        return NextResponse.json(JSON.parse(text), { status: response.status });
      } catch {
        return NextResponse.json(
          { error: "Failed to init processing", body: text },
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
    console.error("[SECTIONS/PROCESSING] Error calling backend:", err);
    return NextResponse.json(
      { error: "Error initializing processing" },
      { status: 500 }
    );
  }
}

// DELETE - Abort section processing
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sectionId: string } }
) {
  const { sectionId } = params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid or missing JSON body (need processing_id)" },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("authorization") ?? undefined;

  if (isCloudMode) {
    const base = APIM_BASE_URL!.replace(/\/$/, "");
    const apimUrl = new URL(`${base}/studio/sections/${encodeURIComponent(sectionId)}/processing`);
    apimUrl.searchParams.set("subscription-key", APIM_SUBSCRIPTION_KEY!);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY!,
      };
      if (authHeader) {
        headers["Authorization"] = authHeader;
      }

      const response = await fetch(apimUrl.toString(), {
        method: "DELETE",
        headers,
        body: JSON.stringify(body),
      });

      const text = await response.text().catch(() => "");

      if (!response.ok) {
        console.error("[SECTIONS/PROCESSING] APIM abort error:", response.status, text);
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
      console.error("[SECTIONS/PROCESSING] Error proxying abort to APIM:", err);
      return NextResponse.json(
        { error: "Error aborting processing" },
        { status: 500 }
      );
    }
  }

  // Local mode
  const backendUrl = `${BACKEND_URL.replace(/\/$/, "")}/sections/${encodeURIComponent(sectionId)}/processing`;

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
      body: JSON.stringify(body),
    });

    const text = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[SECTIONS/PROCESSING] Backend abort error:", response.status, text);
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
    console.error("[SECTIONS/PROCESSING] Error calling backend abort:", err);
    return NextResponse.json(
      { error: "Error aborting processing" },
      { status: 500 }
    );
  }
}
