// Error handling and fallback management utilities

interface Genome {
    id: string;
    name: string;
    active: boolean;
    sourceName: string;
}

interface Chromosome {
    name: string;
    size: number;
}

interface Gene {
    gene_id: string;
    gene_name: string;
    chrom: string;
    start: number;
    end: number;
}

interface GeneDetails {
    gene_id: string;
    gene_name: string;
    genomicinfo: Array<{
        chrstart: number;
        chrstop: number;
        strand?: string;
    }>;
}

interface Variant {
    id: string;
    type: string;
    position: number;
    reference: string;
    alternative: string;
}

export interface FallbackData {
    genomes?: Record<string, Genome[]>;
    chromosomes?: Chromosome[];
    genes?: Gene[];
    geneDetails?: GeneDetails;
    sequence?: string;
    variants?: Variant[];
}

export class APIError extends Error {
    constructor(
        message: string,
        public statusCode: number,
        public apiType: 'NCBI' | 'UCSC' | 'Evo2',
        public retryable = true
    ) {
        super(message);
        this.name = 'APIError';
    }
}

export class RateLimitError extends APIError {
    constructor(apiType: 'NCBI' | 'UCSC') {
        super(
            `Rate limit exceeded for ${apiType} API. Please try again in a few seconds.`,
            429,
            apiType,
            true
        );
        this.name = 'RateLimitError';
    }
}

export class NetworkError extends APIError {
    constructor(apiType: 'NCBI' | 'UCSC') {
        super(
            `Network error while accessing ${apiType} API. Please check your internet connection.`,
            0,
            apiType,
            true
        );
        this.name = 'NetworkError';
    }
}

// Fallback data for when APIs are unavailable
const FALLBACK_DATA: FallbackData = {
    genomes: {
        "Human": [
            { id: "hg38", name: "Human (GRCh38/hg38)", active: true, sourceName: "UCSC" },
            { id: "hg19", name: "Human (GRCh37/hg19)", active: true, sourceName: "UCSC" }
        ]
    },
    chromosomes: [
        { name: "chr1", size: 248956422 },
        { name: "chr2", size: 242193529 },
        { name: "chr3", size: 198295559 },
        { name: "chr4", size: 190214555 },
        { name: "chr5", size: 181538259 },
        { name: "chr6", size: 170805979 },
        { name: "chr7", size: 159345973 },
        { name: "chr8", size: 145138636 },
        { name: "chr9", size: 138394717 },
        { name: "chr10", size: 133797422 },
        { name: "chr11", size: 135086622 },
        { name: "chr12", size: 133275309 },
        { name: "chr13", size: 114364328 },
        { name: "chr14", size: 107043718 },
        { name: "chr15", size: 101991189 },
        { name: "chr16", size: 90338345 },
        { name: "chr17", size: 83257441 },
        { name: "chr18", size: 80373285 },
        { name: "chr19", size: 58617616 },
        { name: "chr20", size: 64444167 },
        { name: "chr21", size: 46709983 },
        { name: "chr22", size: 50818468 },
        { name: "chrX", size: 156040895 },
        { name: "chrY", size: 57227415 }
    ]
};

export function getFallbackData(type: keyof FallbackData): unknown {
    return FALLBACK_DATA[type] ?? null;
}

export function isRetryableError(error: unknown): boolean {
    if (error instanceof APIError) {
        return error.retryable;
    }
    
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('network') || 
               message.includes('timeout') || 
               message.includes('rate limit') ||
               message.includes('429') ||
               message.includes('503') ||
               message.includes('502');
    }
    
    return false;
}

export function getUserFriendlyMessage(error: unknown): string {
    if (error instanceof APIError) {
        return error.message;
    }
    
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        // Modal/Inference specific messaging
        if (message.includes('modal')) {
            return 'Live Evo2 inference is temporarily unavailable. Please try again in a moment. Cached and known-variant data remain available.';
        }
        
        if (message.includes('cors')) {
            return 'Unable to access external data due to browser security restrictions. Please try refreshing the page.';
        }
        
        if (message.includes('rate limit') || message.includes('429')) {
            return 'Too many requests. Please wait a moment and try again.';
        }
        
        if (message.includes('network') || message.includes('fetch')) {
            return 'Network connection issue. Please check your internet connection and try again.';
        }
        
        if (message.includes('timeout')) {
            return 'Request timed out. Please try again.';
        }
        
        if (message.includes('404')) {
            return 'The requested data was not found.';
        }
        
        if (message.includes('500') || message.includes('502') || message.includes('503')) {
            return 'Server error. Please try again later.';
        }
        
        return 'An unexpected error occurred. Please try again.';
    }
    
    return 'An unknown error occurred. Please try again.';
}

export function shouldUseFallback(error: unknown): boolean {
    if (error instanceof APIError) {
        return error.statusCode >= 500 || error.statusCode === 0; // Server errors or network issues
    }
    
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('network') || 
               message.includes('cors') || 
               message.includes('fetch') ||
               message.includes('timeout');
    }
    
    return false;
}

// Error logging utility
export function logError(error: unknown, context: string): void {
    const timestamp = new Date().toISOString();
    const errorInfo = {
        timestamp,
        context,
        error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
        } : error
    };
    
    console.error('API Error:', errorInfo);
    
    // In production, you might want to send this to an error tracking service
    // like Sentry, LogRocket, or your own logging service
}

// Performance monitoring utility
export function measureAPIPerformance<T>(
    operation: () => Promise<T>,
    operationName: string
): Promise<T> {
    const startTime = performance.now();
    
    return operation().finally(() => {
        const duration = performance.now() - startTime;
        
        // Log slow operations for performance monitoring
        if (duration > 5000) { // 5 seconds threshold
            // Log slow operations for debugging
        }
    });
} 