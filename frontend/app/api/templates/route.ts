import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const includeUsage = searchParams.get('includeUsage') !== 'false'; // Default to true

    let templates;
    if (userId) {
      templates = await azureDbClient.getTemplatesForUser(userId);
    } else {
      templates = await azureDbClient.getTemplates();
    }

    // Enrich templates with usage data
    if (includeUsage && templates.length > 0) {
      const templatesWithUsage = await Promise.all(
        templates.map(async (template: any) => {
          // Get the most recent run for this template to determine last_used
          const runs = await azureDbClient.query(
            `SELECT r.created_at, r.project_id, p.name as project_name
             FROM runs r
             LEFT JOIN projects p ON r.project_id = p.id
             WHERE r.template_id = $1
             ORDER BY r.created_at DESC
             LIMIT 1`,
            [template.id]
          );

          // Get total run count
          const countResult = await azureDbClient.query(
            `SELECT COUNT(*) as count FROM runs WHERE template_id = $1`,
            [template.id]
          );

          const lastRun = runs[0];
          const usageCount = parseInt(countResult[0]?.count || '0', 10);

          return {
            ...template,
            last_used: lastRun?.created_at || null,
            usage_count: usageCount,
            last_project_id: lastRun?.project_id || null,
            last_project_name: lastRun?.project_name || null,
          };
        })
      );
      return NextResponse.json(templatesWithUsage);
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