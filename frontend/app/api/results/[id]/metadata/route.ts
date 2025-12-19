import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const metadata = await request.json();

    await azureDbClient.updateResultMetadata(id, metadata);

    return NextResponse.json({ success: true }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (error) {
    console.error('Error updating result metadata:', error);
    return NextResponse.json(
      { error: 'Failed to update result metadata' },
      { status: 500 }
    );
  }
}
