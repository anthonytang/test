import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const updates = await request.json();
    const { id } = params;

    await azureDbClient.updateRun(id, updates);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error updating run:', error);
    return NextResponse.json(
      { error: 'Failed to update run' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    await azureDbClient.deleteRun(id);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting run:', error);
    return NextResponse.json(
      { error: 'Failed to delete run' },
      { status: 500 }
    );
  }
}