import { NextRequest, NextResponse } from "next/server";
import { azureDbClient } from "@studio/api/server";
import { validateAuth } from "@studio/api/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Validate auth
    const authHeader = request.headers.get("authorization");
    const { userId, isValid } = await validateAuth(authHeader);

    if (!isValid || !userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: templateId } = params;
    const { user_email: recipientEmail } = await request.json();

    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Recipient email is required" },
        { status: 400 }
      );
    }

    // Get the template with all its fields
    const originalTemplate = await azureDbClient.getTemplateWithFields(
      templateId
    );

    if (!originalTemplate) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Verify the current user owns the template
    if (originalTemplate.owner_id !== userId) {
      return NextResponse.json(
        { error: "You do not have permission to share this template" },
        { status: 403 }
      );
    }

    // Look up the recipient by email
    const recipientUser = await azureDbClient.findUserByEmail(recipientEmail);

    if (!recipientUser) {
      return NextResponse.json(
        {
          error: `User with email ${recipientEmail} not found. They need to sign in to the platform first.`,
        },
        { status: 404 }
      );
    }

    if (!recipientUser.is_active) {
      return NextResponse.json(
        { error: `User account for ${recipientEmail} is inactive.` },
        { status: 400 }
      );
    }

    // Create a duplicate template with recipient as owner
    const newTemplate = await azureDbClient.createTemplate({
      name: originalTemplate.name,
      metadata: originalTemplate.metadata,
      owner_id: recipientUser.azure_id,
    });

    // Copy all fields to the new template
    for (const field of originalTemplate.fields) {
      await azureDbClient.createField({
        template_id: newTemplate.id,
        name: field.name,
        description: field.description,
        sort_order: field.sort_order,
        metadata: field.metadata,
      });
    }

    return NextResponse.json({
      success: true,
      template: newTemplate,
      shared_with: {
        email: recipientUser.email,
        name: recipientUser.display_name,
      },
    });
  } catch (error) {
    console.error("Error sharing template:", error);
    return NextResponse.json(
      { error: "Failed to share template" },
      { status: 500 }
    );
  }
}
