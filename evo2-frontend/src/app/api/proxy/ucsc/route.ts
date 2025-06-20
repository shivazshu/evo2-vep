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

        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Evo2-Variant-Analysis/1.0',
                    'Accept': 'application/json',
                },
                // Set a reasonable timeout
                signal: AbortSignal.timeout(15000), // 15 seconds
            });

            if (!response.ok) {
                // If UCSC returned an error, forward it as a structured JSON response
                const errorText = await response.text();
                return NextResponse.json(
                    { error: `UCSC API Error: ${response.status} ${response.statusText}`, details: errorText },
                    { status: response.status }
                );
            }

            const data = await response.json() as unknown;
            
            // Success, return response with cache header
            return NextResponse.json(data, {
                headers: {
                    // Cache for 1 hour, allow serving stale for 1 day
                    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
                },
            });
        } catch (error) {
            // This catches network errors, timeouts, etc., when trying to reach UCSC
            console.error(`[UCSC PROXY] Fetch error:`, error);
            return NextResponse.json(
                { error: 'Bad Gateway: The UCSC API is not reachable.' },
                { status: 502 }
            );
        }
    } catch (e) {
        // This is a final catch-all for any unexpected errors in the proxy logic itself.
        console.error(`[UCSC PROXY] Internal error:`, e);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
} 