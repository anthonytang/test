import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';
import { validateAuth } from '@studio/api/server';

// Force dynamic rendering for this route since it uses request headers
export const dynamic = 'force-dynamic';

// Search users by email (for sharing)
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { isValid } = await validateAuth(authHeader);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email || email.length < 3) {
      return NextResponse.json({
        success: false,
        error: 'Email must be at least 3 characters long'
      });
    }

    // Search for users with emails that contain the search term
    const users = await azureDbClient.query(
      `SELECT azure_id, email, display_name, profile_picture_url, is_active
       FROM user_profiles
       WHERE LOWER(email) LIKE LOWER($1) AND is_active = true
       ORDER BY email
       LIMIT 10`,
      [`%${email}%`]
    ) as Array<{
      azure_id: string;
      email: string;
      display_name: string;
      profile_picture_url: string;
      is_active: boolean;
    }>;

    return NextResponse.json({
      success: true,
      users: users.map((user) => ({
        id: user.azure_id,
        email: user.email,
        name: user.display_name,
        avatar_url: user.profile_picture_url,
        is_active: user.is_active
      }))
    });
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json(
      { error: 'Failed to search users' },
      { status: 500 }
    );
  }
}