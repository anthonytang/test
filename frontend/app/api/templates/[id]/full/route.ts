import { NextRequest, NextResponse } from "next/server";
import { azureDbClient } from "@studio/api/server";

/**
 * GET /api/templates/[id]/full
 *
 * Optimized endpoint that returns template, sections, runs, and results in a single request.
 * This eliminates the waterfall of multiple API calls and significantly improves load times.
 *
 * Query params:
 * - projectId (required): Project ID to filter runs and results
 * - runId (optional): Specific run to load results for. If not provided, loads most recent run.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const projectId = searchParams.get("projectId");

    // Get template with sections first (always needed)
    const templateWithSections = await azureDbClient.getTemplateWithSections(id);

    if (!templateWithSections) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // If no projectId, return just template and sections (for preview mode)
    if (!projectId) {
      return NextResponse.json({
        template: {
          id: templateWithSections.id,
          name: templateWithSections.name,
          owner_id: templateWithSections.owner_id,
          created_at: templateWithSections.created_at,
          metadata: templateWithSections.metadata,
        },
        sections: templateWithSections.sections,
        runs: [],
        results: [],
        currentRunId: null,
      });
    }

    // With projectId, also fetch runs
    const runs = await azureDbClient.getRunsForTemplate(id, projectId);

    // Determine which run to load results for
    let targetRunId = runId;
    if (!targetRunId && runs.length > 0) {
      // Default to the most recent run (first in array, already sorted DESC)
      targetRunId = runs[0].id;
    }

    // Load results for the target run (if one exists)
    let results = null;
    if (targetRunId) {
      results = await azureDbClient.getResultsForRun(targetRunId);
    }

    // Return everything in a single response
    return NextResponse.json({
      template: {
        id: templateWithSections.id,
        name: templateWithSections.name,
        owner_id: templateWithSections.owner_id,
        created_at: templateWithSections.created_at,
        metadata: templateWithSections.metadata,
      },
      sections: templateWithSections.sections,
      runs,
      results: results || [],
      currentRunId: targetRunId,
    });
  } catch (error) {
    console.error("Error fetching full template data:", error);
    return NextResponse.json(
      { error: "Failed to fetch template data" },
      { status: 500 }
    );
  }
}
