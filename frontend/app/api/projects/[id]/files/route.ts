import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Use existing azureDbClient method
    // Note: We're not passing userId here, so permission checking will be minimal
    // For shared projects, this should still work since the files are associated with the project
    const projectFiles = await azureDbClient.getProjectFiles(projectId);

    return NextResponse.json(projectFiles);

  } catch (error) {
    console.error('Error fetching project files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project files' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const { fileIds, userId } = await request.json();

    if (!fileIds || !Array.isArray(fileIds) || !userId) {
      return NextResponse.json(
        { error: 'fileIds array and userId are required' },
        { status: 400 }
      );
    }

    // Use existing azureDbClient method
    await azureDbClient.addFilesToProject(projectId, fileIds, userId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error adding files to project:', error);
    return NextResponse.json(
      { error: 'Failed to add files to project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const { fileIds } = await request.json();

    if (!fileIds || !Array.isArray(fileIds)) {
      return NextResponse.json(
        { error: 'fileIds array is required' },
        { status: 400 }
      );
    }

    // Use existing azureDbClient method
    await azureDbClient.removeFilesFromProject(projectId, fileIds);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error removing files from project:', error);
    return NextResponse.json(
      { error: 'Failed to remove files from project' },
      { status: 500 }
    );
  }
}