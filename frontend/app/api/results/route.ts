import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function POST(request: NextRequest) {
  try {
    const resultData = await request.json();

    if (!resultData.run_id || !resultData.field_id) {
      return NextResponse.json(
        { error: 'run_id and field_id are required' },
        { status: 400 }
      );
    }

    const resultId = await azureDbClient.saveResult(resultData);
    return NextResponse.json({ success: true, resultId });
    
  } catch (error) {
    console.error('Error saving result:', error);
    return NextResponse.json(
      { error: 'Failed to save result', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}