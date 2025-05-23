import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pdfUrl = searchParams.get('url');
    const authToken = searchParams.get('token');

    if (!pdfUrl) {
      return new NextResponse('PDF URL is required', { status: 400 });
    }

    if (!authToken) {
      return new NextResponse('Authentication token is required', { status: 401 });
    }

    // Forward the request with the auth token
    const response = await fetch(pdfUrl, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('PDF proxy error:', error);
    return new NextResponse(
      error instanceof Error ? error.message : 'Failed to fetch PDF', 
      { status: 500 }
    );
  }
} 