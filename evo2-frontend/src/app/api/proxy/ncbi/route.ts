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

        // Validate endpoint to prevent SSRF attacks
        const allowedHosts = [
            'eutils.ncbi.nlm.nih.gov',
            'clinicaltables.nlm.nih.gov'
        ];
        
        let urlObject;
        try {
            urlObject = new URL(endpoint);
        } catch (error) {
            return NextResponse.json({ error: 'Invalid endpoint URL format' }, { status: 400 });
        }

        if (!allowedHosts.includes(urlObject.hostname)) {
            return NextResponse.json({ error: 'Invalid host in endpoint' }, { status: 400 });
        }
        
        // Forward the request to NCBI API with retries and backoff
        let lastError: unknown;
        for (let i = 0; i < 3; i++) {
            try {
                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Evo2-Variant-Analysis/1.0',
                        'Accept': 'application/json',
                    },
                });

                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : (i + 1) * 2000;
                    await new Promise(res => setTimeout(res, waitTime));
                    lastError = new Error('Rate limit hit');
                    continue; // Retry after waiting
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    // Don't retry on client errors, but do on server errors
                    if (response.status >= 400 && response.status < 500) {
                        return NextResponse.json(
                            { error: `NCBI API Client Error: ${response.status} ${response.statusText}`, details: errorText },
                            { status: response.status }
                        );
                    }
                    throw new Error(`NCBI API Server Error: ${response.status} ${response.statusText} - ${errorText}`);
                }

                // Handle different response types
                const contentType = response.headers.get('content-type');
                let data: unknown;
                
                if (contentType?.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }
                
                // Success, return response with cache header
                return NextResponse.json(data, {
                    headers: {
                        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600', // 30m TTL, 60m stale
                    },
                });

            } catch (error) {
                lastError = error;
                await new Promise(res => setTimeout(res, (i + 1) * 1000)); // Exponential backoff
            }
        }
        
        // If all retries fail
        console.error('NCBI proxy error after retries:', lastError);
        return NextResponse.json(
            { error: 'Internal server error after multiple retries', details: lastError instanceof Error ? lastError.message : String(lastError) },
            { status: 500 }
        );
    } catch (error) {
        console.error('NCBI proxy error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 