import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const endpoint = searchParams.get('endpoint');
        
        if (!endpoint) {
            return NextResponse.json(
                { error: 'Missing endpoint parameter' },
                { status: 400 }
            );
        }

        // Validate endpoint to prevent SSRF attacks
        const allowedHost = 'api.genome.ucsc.edu';
        let urlObject;
        try {
            urlObject = new URL(endpoint);
        } catch (error) {
            return NextResponse.json({ error: 'Invalid endpoint URL format' }, { status: 400 });
        }

        if (urlObject.hostname !== allowedHost) {
            return NextResponse.json({ error: 'Invalid host in endpoint' }, { status: 400 });
        }

        // Forward the request to UCSC API with retries and backoff
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
                    if (response.status >= 400 && response.status < 500) {
                        return NextResponse.json(
                            { error: `UCSC API Client Error: ${response.status} ${response.statusText}`, details: errorText },
                            { status: response.status }
                        );
                    }
                    throw new Error(`UCSC API Server Error: ${response.status} ${response.statusText} - ${errorText}`);
                }

                const data = await response.json() as unknown;
                
                // Success, return response with cache header
                return NextResponse.json(data, {
                    headers: {
                        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200', // 1h TTL, 2h stale
                    },
                });

            } catch (error) {
                lastError = error;
                await new Promise(res => setTimeout(res, (i + 1) * 1000)); // Exponential backoff
            }
        }
        
        // If all retries fail
        console.error('UCSC proxy error after retries:', lastError);
        return NextResponse.json(
            { error: 'Internal server error after multiple retries', details: lastError instanceof Error ? lastError.message : String(lastError) },
            { status: 500 }
        );

    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 