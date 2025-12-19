import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';
import { validateAuth } from '@studio/api/server';

// Create or update user profile after authentication
export async function POST(request: NextRequest) {
  try {
    // Validate the auth token
    const authHeader = request.headers.get('authorization');
    const { userId, isValid } = await validateAuth(authHeader);

    if (!isValid || !userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { 
      email, 
      displayName, 
      givenName, 
      surname, 
      jobTitle, 
      department, 
      companyName, 
      profilePictureUrl 
    } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Upsert the user profile
    await azureDbClient.upsertUserProfile({
      azureId: userId,
      email,
      displayName,
      givenName,
      surname,
      jobTitle,
      department,
      companyName,
      profilePictureUrl
    });

    return NextResponse.json({
      success: true,
      message: 'User profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { error: 'Failed to update user profile' },
      { status: 500 }
    );
  }
}

// Get user profile
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { userId, isValid } = await validateAuth(authHeader);

    if (!isValid || !userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const profile = await azureDbClient.getUserProfile(userId);
    
    if (!profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}
