// app/api/process/field/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@studio/api/server";
import { callApimOnBehalfOfUser } from "@studio/api/server";

export async function POST(request: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    const isLocal = backendUrl.startsWith("http://localhost");

    const body = await request.json();

    // Normalize IDs / names
    let fieldId: string | undefined = body.fieldId ?? body.field_id;
    if (!fieldId) {
      if (isLocal) {
        fieldId = crypto.randomUUID();
      } else {
        throw new Error("fieldId is required for field processing");
      }
    }

    const fieldName: string =
      body.fieldName ?? body.field_name ?? "Unnamed field";
    const fieldDescription: string =
      body.fieldDescription ?? body.field_description ?? "";

    const fileIds: string[] | undefined = body.fileIds ?? body.file_ids;
    const projectMetadata = body.projectMetadata ?? body.project_metadata;
    const templateMetadata =
      body.templateMetadata ?? body.template_metadata ?? {};
    const outputFormat: string =
      body.outputFormat ?? body.output_format ?? "text";
    const executionMode: string =
      body.executionMode ?? body.execution_mode ?? "both";

    const payload = {
      field_id: fieldId,
      field_name: fieldName,
      field_description: fieldDescription,
      file_ids: fileIds,
      project_metadata: projectMetadata,
      template_metadata: templateMetadata,
      output_format: outputFormat,
      execution_mode: executionMode,
      dependent_field_results: body.dependent_field_results ?? [],
    };

    if (isLocal) {
      // -------- LOCAL BACKEND MODE --------
      const response = await fetch(
        `${backendUrl}/process/field/${encodeURIComponent(fieldId)}/start`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: request.headers.get("Authorization") || "",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error(
          "Local backend /process/field/{id}/start error:",
          response.status,
          data
        );
        return NextResponse.json(data, { status: response.status });
      }

      return NextResponse.json(
        {
          status: "success",
          data: {
            executionMode,
            result: data.response ?? data,
            lineMap: data.line_map || {},
            evidenceAnalysis: data.evidence_analysis || [],
          },
        },
        { status: 200 }
      );
    }

    // -------- CLOUD / APIM MODE --------
    const fakeReq = {
      headers: Object.fromEntries(request.headers.entries()) as Record<
        string,
        string
      >,
    };

    const result: any = await callApimOnBehalfOfUser(
      fakeReq,
      `/studio/process/field/${encodeURIComponent(fieldId)}/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    console.log(
      "Backend /studio/process/field/{fieldId}/start result (via APIM):",
      {
        fieldId,
        hasResponse: !!result,
      }
    );

    return NextResponse.json(
      {
        status: "success",
        data: {
          executionMode,
          result: result.response ?? result,
          lineMap: result.line_map || {},
          evidenceAnalysis: result.evidence_analysis || [],
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error starting field processing:", {
      message: error?.message,
      stack: error?.stack,
    });

    return NextResponse.json(
      {
        status: "error",
        error: {
          code: "PROCESSING_FAILED",
          message: error?.message || "Failed to start section processing",
          details: error?.toString(),
        },
      },
      { status: 500 }
    );
  }
}
