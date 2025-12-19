import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    let templates;
    if (userId) {
      templates = await azureDbClient.getTemplatesForUser(userId);
    } else {
      templates = await azureDbClient.getTemplates();
    }
    
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, metadata, owner_id } = body;
    
    if (!name || !owner_id) {
      return NextResponse.json(
        { error: 'Name and owner_id are required' },
        { status: 400 }
      );
    }
    
    const template = await azureDbClient.createTemplate({
      name,
      metadata: metadata || { description: '' },
      owner_id
    });
    
    return NextResponse.json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json(
      { error: 'Failed to create template' },
      { status: 500 }
    );
  }
}