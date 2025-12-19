import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const results = await azureDbClient.getResultsForRun(id);
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error fetching run results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch run results' },
      { status: 500 }
    );
  }
}