import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: templateId } = params;
    const { version } = await request.json();

    if (!version) {
      return NextResponse.json({ error: 'Version number required' }, { status: 400 });
    }

    await azureDbClient.restoreTemplateVersion(templateId, version);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error restoring template version:', error);
    return NextResponse.json(
      { error: 'Failed to restore template version' },
      { status: 500 }
    );
  }
}