import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const endpoint = searchParams.get('endpoint');
        console.log('NCBI proxy: received request for', endpoint);
        
        if (!endpoint) {
            console.error('NCBI proxy: missing endpoint parameter');
            return NextResponse.json(
                { error: 'Missing endpoint parameter' },
                { status: 400 }
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
            console.error('NCBI proxy: invalid endpoint URL format', error);
            return NextResponse.json({ error: 'Invalid endpoint URL format' }, { status: 400 });
        }

        if (!allowedHosts.includes(urlObject.hostname)) {
            console.error('NCBI proxy: invalid host in endpoint', urlObject.hostname);
            return NextResponse.json({ error: 'Invalid host in endpoint' }, { status: 400 });
        }
        
        // Forward the request to NCBI API with retries and backoff
        let lastError: unknown;
        for (let i = 0; i < 3; i++) {
            try {
                console.log('NCBI proxy: fetching', endpoint);
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
                    console.warn('NCBI proxy: rate limit hit, retrying after', waitTime, 'ms');
                    await new Promise(res => setTimeout(res, waitTime));
                    lastError = new Error('Rate limit hit');
                    continue; // Retry after waiting
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    // Don't retry on client errors, but do on server errors
                    if (response.status >= 400 && response.status < 500) {
                        console.error('NCBI proxy: client error', response.status, errorText);
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
                
                console.log('NCBI proxy: success, returning data');
                // Success, return response with cache header
                return NextResponse.json(data, {
                    headers: {
                        'Cache-Control': 'no-store', // Disable CDN caching
                    },
                });

            } catch (error) {
                lastError = error;
                console.error('NCBI proxy: fetch error', error);
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