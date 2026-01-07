import { NextRequest, NextResponse } from 'next/server';
import { azureDbClient } from '@studio/api/server';
import { validateAuth } from '@studio/api/server';

// Sync a single user from Microsoft Graph to database
export async function POST(request: NextRequest) {
  try {
    // Validate the auth token
    const authHeader = request.headers.get('authorization');
    const { isValid } = await validateAuth(authHeader);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { 
      azureId,
      email, 
      displayName, 
      givenName, 
      surname, 
      jobTitle, 
      department, 
      companyName, 
      profilePictureUrl 
    } = body;

    if (!azureId || !email) {
      return NextResponse.json(
        { error: 'Azure ID and email are required' },
        { status: 400 }
      );
    }

    // Upsert the user profile
    await azureDbClient.upsertUserProfile({
      azureId,
      email,
      displayName: displayName || email.split('@')[0],
      givenName,
      surname,
      jobTitle,
      department,
      companyName,
      profilePictureUrl
    });


    return NextResponse.json({
      success: true,
      message: 'User synced successfully',
      user: {
        azureId,
        email,
        displayName
      }
    });
  } catch (error) {
    console.error('Error syncing user:', error);
    return NextResponse.json(
      { error: 'Failed to sync user' },
      { status: 500 }
    );
  }
}