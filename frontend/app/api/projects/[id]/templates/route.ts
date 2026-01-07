import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: projectId } = params;
    const templates = await azureDbClient.getTemplatesForProject(projectId);
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching project templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project templates' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: projectId } = params;
    const body = await request.json();
    const { templateIds, userId } = body;
    
    if (!templateIds || !Array.isArray(templateIds) || !userId) {
      return NextResponse.json(
        { error: 'templateIds array and userId are required' },
        { status: 400 }
      );
    }
    
    await azureDbClient.addTemplatesToProject(projectId, templateIds, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding templates to project:', error);
    return NextResponse.json(
      { error: 'Failed to add templates to project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: projectId } = params;
    const body = await request.json();
    const { templateIds } = body;
    
    if (!templateIds || !Array.isArray(templateIds)) {
      return NextResponse.json(
        { error: 'templateIds array is required' },
        { status: 400 }
      );
    }
    
    await azureDbClient.removeTemplatesFromProject(projectId, templateIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing templates from project:', error);
    return NextResponse.json(
      { error: 'Failed to remove templates from project' },
      { status: 500 }
    );
  }
}