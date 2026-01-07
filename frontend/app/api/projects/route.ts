import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const includeShared = searchParams.get('includeShared') === 'true';
    const includeTemplates = searchParams.get('includeTemplates') === 'true';

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    let projects;
    if (includeShared) {
      projects = await azureDbClient.getProjectsWithPermissions(userId);
    } else {
      projects = await azureDbClient.getProjects(userId);
    }

    // If includeTemplates is true, fetch templates for each project
    if (includeTemplates && projects.length > 0) {
      const projectsWithTemplates = await Promise.all(
        projects.map(async (project: any) => {
          const templates = await azureDbClient.getTemplatesForProject(project.id);
          const fileIds = await azureDbClient.getProjectFileIds(project.id);
          return {
            ...project,
            templates,
            template_count: templates.length,
            file_count: fileIds.length,
          };
        })
      );
      return NextResponse.json(projectsWithTemplates);
    }

    return NextResponse.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, metadata, userId } = body;
    
    if (!name || !userId || !metadata || !metadata.description) {
      return NextResponse.json(
        { error: 'Name, userId, and metadata with description are required' },
        { status: 400 }
      );
    }
    
    const project = await azureDbClient.createProject(name, metadata, userId);
    return NextResponse.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}