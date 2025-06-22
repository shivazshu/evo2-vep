import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        // Get the request body
        const body: unknown = await request.json();
        
        // Use the server-side environment variable for the Modal endpoint
        const modalEndpoint = process.env.MODAL_ANALYZE_VARIANT_BASE_URL;
        
        if (!modalEndpoint) {
            return NextResponse.json(
                { error: 'Modal endpoint not configured' },
                { status: 500 }
            );
        }

        // Convert body to query parameters
        const params = new URLSearchParams();
        if (typeof body === 'object' && body !== null) {
            Object.entries(body).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, String(value));
                }
            });
        }

        const urlWithParams = `${modalEndpoint}?${params.toString()}`;
        
        // Forward the request to Modal API with retries and backoff
        let lastError: unknown;
        for (let i = 0; i < 3; i++) {
            try {
                const response = await fetch(urlWithParams, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Evo2-Variant-Analysis/1.0',
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
                    console.error(`Modal API Error: ${response.status} ${response.statusText}`, errorText);
                    // Don't retry on client errors, but do on server errors
                    if (response.status >= 400 && response.status < 500) {
                        return NextResponse.json(
                            { error: `Modal API Client Error: ${response.status} ${response.statusText}`, details: errorText },
                            { status: response.status }
                        );
                    }
                    throw new Error(`Modal API Server Error: ${response.status} ${response.statusText} - ${errorText}`);
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
                        'Cache-Control': 'no-store', // Disable CDN caching for analysis results
                    },
                });

            } catch (error) {
                lastError = error;
                console.error(`Modal API request failed (attempt ${i + 1}):`, error);
                await new Promise(res => setTimeout(res, (i + 1) * 1000)); // Exponential backoff
            }
        }
        
        // If all retries fail
        return NextResponse.json(
            { error: 'Internal server error after multiple retries', details: lastError instanceof Error ? lastError.message : String(lastError) },
            { status: 500 }
        );
    } catch (error) {
        console.error('Modal proxy error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 