import { NextRequest } from "next/server";
import { getBackendUrl } from "@studio/api/server";
import { streamFromApimOnBehalfOfUser } from "@studio/api/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string; fileId: string } }
) {
  try {
    const { userId, fileId } = params;
    const body = await request.json();

    const backendUrl = getBackendUrl();
    const isLocal = backendUrl.startsWith("http://localhost");

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (isLocal) {
      // ------------------------
      // LOCAL MODE – direct backend with streaming
      // ------------------------
      const backendResponse = await fetch(
        `${backendUrl}/users/${userId}/files/${fileId}/generate-template`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!backendResponse.ok) {
        const errorText = await backendResponse.text();
        return new Response(
          JSON.stringify({
            error: errorText || "Failed to generate template",
          }),
          {
            status: backendResponse.status,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const reader = backendResponse.body?.getReader();
      if (!reader) {
        return new Response("No stream from backend", { status: 500 });
      }

      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (err) {
            console.error("Streaming error (local):", err);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ------------------------
    // CLOUD / APIM MODE – streaming via APIM
    // ------------------------
    const fakeReq = {
      headers: Object.fromEntries(request.headers.entries()),
    };

    const apimRes = await streamFromApimOnBehalfOfUser(
      fakeReq,
      `/studio/users/${userId}/files/${fileId}/generate-template`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!apimRes.ok) {
      const text = await apimRes.text();
      return new Response(text || "APIM error", { status: apimRes.status });
    }

    const apimBody = apimRes.body;
    if (!apimBody) {
      return new Response("No stream from APIM", { status: 500 });
    }

    return new Response(apimBody as any, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("[generate-template] Error:", err);
    return new Response("Internal server error", { status: 500 });
  }
}
