import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function POST(request: NextRequest) {
  try {
    const runData = await request.json();
    
    if (!runData.id || !runData.template_id || !runData.project_id) {
      return NextResponse.json(
        { error: 'id, template_id, and project_id are required' },
        { status: 400 }
      );
    }

    const newRun = await azureDbClient.createRun(runData);
    return NextResponse.json(newRun);
    
  } catch (error) {
    console.error('Error creating run:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create run', details: errorMessage },
      { status: 500 }
    );
  }
}