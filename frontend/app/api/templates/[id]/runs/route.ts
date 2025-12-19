import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    // STRICT: projectId is required to prevent cross-project data leakage
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const runs = await azureDbClient.getRunsForTemplate(id, projectId);
    return NextResponse.json(runs);
  } catch (error) {
    console.error('Error fetching template runs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template runs' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { project_id, user_id } = body;
    
    if (!user_id || !project_id) {
      return NextResponse.json(
        { error: 'user_id and project_id are required' },
        { status: 400 }
      );
    }

    // Check if user has permission to run templates on this project
    const hasPermission = await azureDbClient.checkUserProjectPermission(
      user_id,
      project_id,
      'editor' // run_templates is allowed for editors and owners
    );

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to run templates on this project' },
        { status: 403 }
      );
    }
    
    const run = await azureDbClient.createRun({
      ...body,
      template_id: id,
    });
    
    return NextResponse.json(run);
  } catch (error) {
    console.error('Error creating run:', error);
    return NextResponse.json(
      { error: 'Failed to create run' },
      { status: 500 }
    );
  }
}