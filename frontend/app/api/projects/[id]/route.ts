import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const includePermissions = searchParams.get('includePermissions') === 'true';

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const cacheHeaders = {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60'
    };

    if (includePermissions) {
      const project = await azureDbClient.getProjectWithPermissions(params.id, userId);
      return NextResponse.json(project, { headers: cacheHeaders });
    } else {
      const project = await azureDbClient.getProject(params.id, userId);
      return NextResponse.json(project, { headers: cacheHeaders });
    }
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { userId, ...updates } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const hasPermission = await azureDbClient.checkUserProjectPermission(
      userId,
      params.id,
      'editor'
    );

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this project' },
        { status: 403 }
      );
    }

    await azureDbClient.updateProject(params.id, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    const hasPermission = await azureDbClient.checkUserProjectPermission(
      userId,
      params.id,
      'owner'
    );

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this project' },
        { status: 403 }
      );
    }

    await azureDbClient.deleteProject(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}