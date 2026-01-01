import { NextResponse } from 'next/server'

export async function POST() {
  // For Microsoft Entra ID with MSAL, sign out is handled client-side
  // This route just clears any server-side session data and redirects
  
  // Clear any server-side cookies if needed
  const response = NextResponse.redirect(new URL('/auth/signin', process.env.NEXT_PUBLIC_SITE_URL!))
  
  // Optional: Clear any auth-related cookies
  response.cookies.delete('msal.account')
  response.cookies.delete('msal.idtoken')
  response.cookies.delete('msal.accesstoken')
  
  return response
}