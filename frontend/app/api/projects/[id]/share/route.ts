import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';
import { ShareProjectRequest } from '@studio/core';

// Share project with a user
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { user_email, role, granted_by } = body;

    if (!user_email || !role || !granted_by) {
      return NextResponse.json(
        { error: 'user_email, role, and granted_by are required' },
        { status: 400 }
      );
    }

    const hasPermission = await azureDbClient.checkUserProjectPermission(
      granted_by,
      params.id,
      'owner'
    );

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to share this project' },
        { status: 403 }
      );
    }

    const shareRequest: ShareProjectRequest = {
      project_id: params.id,
      user_email,
      role
    };

    const result = await azureDbClient.shareProject(shareRequest, granted_by);
    
    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error sharing project:', error);
    return NextResponse.json(
      { error: 'Failed to share project' },
      { status: 500 }
    );
  }
}

// Get project members
export async function GET(
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

    // Verify the user has permission to view members (editor or owner)
    const hasPermission = await azureDbClient.checkUserProjectPermission(
      userId, 
      params.id, 
      'editor'
    );
    
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to view this project' },
        { status: 403 }
      );
    }

    const members = await azureDbClient.getProjectMembers(params.id);
    return NextResponse.json({ members, total_count: members.length });
  } catch (error) {
    console.error('Error fetching project members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project members' },
      { status: 500 }
    );
  }
}