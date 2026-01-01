import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Use existing azureDbClient method
    const fileIds = await azureDbClient.getProjectFileIds(projectId);

    return NextResponse.json(fileIds);

  } catch (error) {
    console.error('Error fetching project file IDs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project file IDs' },
      { status: 500 }
    );
  }
}