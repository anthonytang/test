import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function POST(request: NextRequest) {
  try {
    const fieldData = await request.json();

    if (!fieldData.template_id || !fieldData.name) {
      return NextResponse.json(
        { error: 'template_id and name are required' },
        { status: 400 }
      );
    }

    const newField = await azureDbClient.createField(fieldData);
    return NextResponse.json(newField);
    
  } catch (error) {
    console.error('Error creating field:', error);
    return NextResponse.json(
      { error: 'Failed to create section' },
      { status: 500 }
    );
  }
}