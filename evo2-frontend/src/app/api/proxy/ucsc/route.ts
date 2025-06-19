import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

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

        // Validate endpoint to prevent SSRF attacks - more flexible validation
        const isValidEndpoint = 
            endpoint.includes('list/ucscGenomes') ||
            endpoint.includes('list/chromosomes') ||
            endpoint.includes('getData/sequence') ||
            endpoint.includes('ucscGenomes') ||
            endpoint.includes('chromosomes') ||
            endpoint.includes('sequence');
        
        if (!isValidEndpoint) {
            return NextResponse.json(
                { error: 'Invalid endpoint' },
                { status: 400 }
            );
        }

        // Construct the UCSC URL
        let ucscUrl: string;
        if (endpoint.startsWith('list/') || endpoint.startsWith('getData/')) {
            // Direct endpoint format
            ucscUrl = `https://api.genome.ucsc.edu/${endpoint}`;
        } else {
            // Handle other formats by adding the base path
            ucscUrl = `https://api.genome.ucsc.edu/${endpoint}`;
        }
        
        // Forward the request to UCSC API
        const response = await fetch(ucscUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Evo2-Variant-Analysis/1.0',
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`UCSC API error: ${response.status} ${response.statusText}`, errorText);
            
            return NextResponse.json(
                { 
                    error: `UCSC API Error: ${response.status} ${response.statusText}`,
                    details: errorText
                },
                { status: response.status }
            );
        }

        const data = await response.json() as unknown;
        
        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            },
        });
    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 