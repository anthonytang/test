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

    const results = await azureDbClient.getLatestResults(id, projectId);
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching template results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch template results' },
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
    const requestData = await request.json();
    
    await azureDbClient.saveResults(id, requestData);
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error saving template results:', error);
    return NextResponse.json(
      { error: 'Failed to save template results' },
      { status: 500 }
    );
  }
}