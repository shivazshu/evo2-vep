import { type NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiting (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const NCBI_RATE_LIMIT = 3; // requests per second
const RATE_LIMIT_WINDOW = 1000; // 1 second

function checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const limit = rateLimitMap.get(clientId);
    
    if (!limit || now > limit.resetTime) {
        rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return true;
    }
    
    if (limit.count >= NCBI_RATE_LIMIT) {
        return false;
    }
    
    limit.count++;
    return true;
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const endpoint = searchParams.get('endpoint');
        const clientId = request.headers.get('x-forwarded-for') ?? 
                        request.headers.get('x-real-ip') ?? 
                        'unknown';
        
        if (!endpoint) {
            return NextResponse.json(
                { error: 'Missing endpoint parameter' },
                { status: 400 }
            );
        }

        // Check rate limit
        if (!checkRateLimit(clientId)) {
            return NextResponse.json(
                { error: 'Rate limit exceeded. Please try again later.' },
                { status: 429 }
            );
        }

        // Validate endpoint to prevent SSRF attacks - more flexible validation
        const isValidEndpoint = 
            endpoint.includes('eutils/esearch.fcgi') ||
            endpoint.includes('eutils/esummary.fcgi') ||
            endpoint.includes('eutils/efetch.fcgi') ||
            endpoint.includes('ncbi_genes/v3/search') ||
            endpoint.includes('clinicaltables.nlm.nih.gov/api/ncbi_genes/v3/search');
        
        if (!isValidEndpoint) {
            return NextResponse.json(
                { error: 'Invalid endpoint' },
                { status: 400 }
            );
        }

        // Construct the full URL
        let ncbiUrl: string;
        if (endpoint.startsWith('clinicaltables')) {
            ncbiUrl = `https://${endpoint}`;
        } else if (endpoint.includes('ncbi_genes/v3/search')) {
            // Handle the ncbi_genes endpoint
            ncbiUrl = `https://clinicaltables.nlm.nih.gov/api/${endpoint}`;
        } else {
            ncbiUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/${endpoint}`;
        }
        
        // Forward the request to NCBI API
        const response = await fetch(ncbiUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Evo2-Variant-Analysis/1.0',
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`NCBI API error: ${response.status} ${response.statusText}`, errorText);
            
            return NextResponse.json(
                { 
                    error: `NCBI API Error: ${response.status} ${response.statusText}`,
                    details: errorText
                },
                { status: response.status }
            );
        }

        // Handle different response types
        const contentType = response.headers.get('content-type');
        let data: unknown;
        
        if (contentType?.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, max-age=1800', // Cache for 30 minutes
            },
        });
    } catch (error) {
        console.error('NCBI proxy error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 