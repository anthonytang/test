import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

// Update user permission on project
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { user_id, role, updated_by } = body;
    
    if (!user_id || !role || !updated_by) {
      return NextResponse.json(
        { error: 'user_id, role, and updated_by are required' },
        { status: 400 }
      );
    }

    // Verify the updater has permission to manage permissions
    const hasPermission = await azureDbClient.checkUserProjectPermission(
      updated_by, 
      params.id, 
      'owner'
    );
    
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to manage permissions for this project' },
        { status: 403 }
      );
    }

    const success = await azureDbClient.updateProjectPermission(
      params.id, 
      user_id, 
      role, 
      updated_by
    );
    
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Failed to update permission' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error updating project permission:', error);
    return NextResponse.json(
      { error: 'Failed to update permission' },
      { status: 500 }
    );
  }
}

// Remove user permission from project
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const removedBy = searchParams.get('removedBy');
    
    if (!userId || !removedBy) {
      return NextResponse.json(
        { error: 'userId and removedBy are required' },
        { status: 400 }
      );
    }

    // Verify the remover has permission to manage permissions
    const hasPermission = await azureDbClient.checkUserProjectPermission(
      removedBy, 
      params.id, 
      'owner'
    );
    
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'You do not have permission to manage permissions for this project' },
        { status: 403 }
      );
    }

    const success = await azureDbClient.removeProjectPermission(params.id, userId);
    
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: 'Failed to remove permission' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error removing project permission:', error);
    return NextResponse.json(
      { error: 'Failed to remove permission' },
      { status: 500 }
    );
  }
}