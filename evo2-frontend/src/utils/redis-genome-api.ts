import { 
    APIError, 
    RateLimitError, 
    NetworkError, 
    getFallbackData, 
    isRetryableError, 
    getUserFriendlyMessage, 
    shouldUseFallback, 
    logError, 
    measureAPIPerformance 
} from "./error-handling";

// Public Interfaces (same as original)
export interface GenomeAssemblyFromSearch {
    id: string;
    name: string;
    active: boolean;
    sourceName: string;
}

export interface ChromosomeFromSearch {
    name: string;
    size: number;
}

export interface GeneFromSearch {
    symbol: string;
    name: string;
    chrom: string;
    description: string;
    gene_id?: string;
}

export interface GeneDetailsFromSearch {
    genomicinfo?: {
        chrstart: number;
        chrstop: number;
        strand?: string;
    }[];
    summary?: string;
    organism?: {
        scientificname: string;
        commonname: string;
    };
}

export interface GeneBounds {
    min: number;
    max: number;
}

export interface ClinvarVariants {
    clinvar_id: string;
    title: string;
    variation_type: string;
    classification: string;
    gene_sort: string;
    chromosome: string;
    location: string;
    evo2Result?: {
        prediction: string;
        delta_score: number;
        classification_confidence: number;
        isNegativeStrand?: boolean;
        originalSequence?: string;
        reverseComplementedSequence?: string;
    };
    isAnalyzing?: boolean;
    evo2Error?: string;
} 

export interface AnalysisResult {
    position: number;
    reference: string;
    alternative: string;
    delta_score: number;
    prediction: string;
    classification_confidence: number;
    strand?: string;
}

// Queue status types (simplified for backend)
export interface QueuedRequest<T> {
    meta?: T;
}

export interface NcbiQueueMeta {
    geneId?: string;
    chrom?: string;
    genomeId?: string;
    start?: number;
    end?: number;
}

export interface UcscQueueMeta {
    chrom?: string;
    genomeId?: string;
}

// Configuration
const API_CONFIG = {
    BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://evo2-vep.onrender.com',
    MODAL_ENDPOINT: (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://evo2-vep.onrender.com') + '/proxy/modal',
    TIMEOUT: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT ?? '30000'),
    RETRY_ATTEMPTS: parseInt(process.env.NEXT_PUBLIC_API_RETRY_ATTEMPTS ?? '3'),
    BASE_DELAY: 1500,
} as const;

// Debug logging for production
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    console.log('API Config:', {
        BASE_URL: API_CONFIG.BASE_URL,
        MODAL_ENDPOINT: API_CONFIG.MODAL_ENDPOINT,
        ENV_VAR: process.env.NEXT_PUBLIC_API_BASE_URL
    });
}

// Feature flags
const FEATURES = {
    REDIS_CACHE_ENABLED: process.env.NEXT_PUBLIC_REDIS_CACHE_ENABLED !== 'false',
    DEBUG_MODE: process.env.NEXT_PUBLIC_DEBUG_MODE === 'true',
} as const;

// Utility Functions
async function makeAPIRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    let lastError: Error | null = null;

    for (let i = 0; i < API_CONFIG.RETRY_ATTEMPTS; i++) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
                signal: AbortSignal.timeout(API_CONFIG.TIMEOUT),
            });

            if (!response.ok) {
                const errorText = await response.text();
                const status = response.status;

                if (status === 429 || status >= 500) {
                    throw new APIError(`API returned status ${status}`, status, 'Evo2', true);
                }
                
                throw new APIError(`API Error: ${status} - ${errorText}`, status, 'Evo2', false);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                return await response.json() as T;
            }
            
            return await response.text() as unknown as T;

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            if (error instanceof APIError && !error.retryable) {
                break;
            }
            
            if (i < API_CONFIG.RETRY_ATTEMPTS - 1) {
                const delay = API_CONFIG.BASE_DELAY * Math.pow(2, i) + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`Failed to fetch from ${endpoint} after ${API_CONFIG.RETRY_ATTEMPTS} attempts: ${lastError?.message ?? 'Unknown error'}`);
}

// Enhanced API Functions with Redis Backend

export async function getAvailableGenomes(): Promise<{ genomes: Record<string, GenomeAssemblyFromSearch[]> }> {
    return measureAPIPerformance(async () => {
        try {
            return await makeAPIRequest<{ genomes: Record<string, GenomeAssemblyFromSearch[]> }>('/genomes');
        } catch (error) {
            return getFallbackData('genomes') as { genomes: Record<string, GenomeAssemblyFromSearch[]> };
        }
    }, 'getAvailableGenomes');
}

export async function getGenomeChromosomes(genomeId: string): Promise<{ chromosomes: ChromosomeFromSearch[] }> {
    return measureAPIPerformance(async () => {
        try {
            return await makeAPIRequest<{ chromosomes: ChromosomeFromSearch[] }>(`/genomes/${genomeId}/chromosomes`);
        } catch (error) {
            return getFallbackData('chromosomes') as { chromosomes: ChromosomeFromSearch[] };
        }
    }, 'getGenomeChromosomes');
}

export async function searchGenes(
    query: string,
    genome: string
): Promise<{ query: string; genome: string; results: GeneFromSearch[] }> {
    try {
        const params = new URLSearchParams({ query, genome });
        return await makeAPIRequest<{ query: string; genome: string; results: GeneFromSearch[] }>(`/genes/search?${params}`);
    } catch (error) {
        throw error;
    }
}

export async function fetchGeneDetails(
    geneId: string
): Promise<{
    geneDetails: GeneDetailsFromSearch | null;
    geneBounds: GeneBounds | null;
    initialRange: { start: number; end: number } | null;
}> {
    try {
        return await makeAPIRequest<{
            geneDetails: GeneDetailsFromSearch | null;
            geneBounds: GeneBounds | null;
            initialRange: { start: number; end: number } | null;
        }>(`/genes/${geneId}/details`);
    } catch (error) {
        throw error;
    }
}

export async function fetchGeneSequence(
    chrom: string,
    start: number,
    end: number,
    genomeId: string
): Promise<{
    sequence: string;
    actualRange: { start: number; end: number };
    error?: string;
}> {
    try {
        const params = new URLSearchParams({
            chrom: chrom.toString(),
            start: start.toString(),
            end: end.toString(),
            genome_id: genomeId
        });
        
        return await makeAPIRequest<{
            sequence: string;
            actualRange: { start: number; end: number };
            error?: string;
        }>(`/genes/sequence?${params}`);
    } catch (error) {
        return {
            sequence: "",
            actualRange: { start, end },
            error: "Failed to fetch DNA sequence. This might be due to network issues or invalid coordinates."
        };
    }
}

export async function fetchClinvarVariants(
    chrom: string,
    geneBound: GeneBounds,
    genomeId: string
): Promise<ClinvarVariants[]> {
    try {
        const params = new URLSearchParams({
            chrom: chrom.toString(),
            start: geneBound.min.toString(),
            end: geneBound.max.toString(),
            genome_id: genomeId
        });
        
        const result = await makeAPIRequest<ClinvarVariants[]>(`/clinvar/variants?${params}`);
        return result || [];
    } catch (error) {
        // Return empty array on error to prevent UI crashes
        return [];
    }
}

export function reverseComplement(sequence: string): string {
    const complement: Record<string, string> = {
        'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C',
        'a': 't', 't': 'a', 'c': 'g', 'g': 'c'
    };
    return sequence.split('').reverse().map(base => complement[base] ?? base).join('');
}

export async function analyzeVariantWithAPI({
    position,
    alternative,
    genomeId,
    chromosome,
    strand = "+",
} : {
    position: number;
    alternative: string;
    genomeId: string;
    chromosome: string;
    strand?: string;
}) : Promise<AnalysisResult> {
    // Use the backend Modal proxy endpoint
    const proxyUrl = API_CONFIG.MODAL_ENDPOINT;
    
    const requestBody = {
        variant_pos: position,
        alternative: alternative,
        genome: genomeId,
        chromosome: chromosome,
        strand: strand,
    };

    try {
        const response = await fetch(proxyUrl, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            // Surface Modal-specific failures for more helpful UX
            if (errorText.toLowerCase().includes('modal')) {
                throw new Error(`Modal inference error: ${errorText}`);
            }
            throw new Error(`Failed to analyze variant: ${errorText}`);
        }

        return await response.json() as AnalysisResult;
    } catch (error) {
        throw error;
    }
}

// Cache management utilities (now calls backend)
export async function clearCache(): Promise<void> {
    try {
        // Clear all caches
        if (FEATURES.REDIS_CACHE_ENABLED) {
            // Redis cache clearing is handled by the backend
            await makeAPIRequest('/cache/clear', { method: 'POST' });
        }
        
        // Clear in-memory caches (if they exist)
        // Note: These caches are not currently implemented in this file
        // They would be cleared by the backend when Redis is implemented
        
    } catch (error) {
        console.error('Failed to clear cache:', error);
    }
}

export async function clearRateLimitCache(): Promise<void> {
    try {
        // Rate limit cache is handled by the backend
        await makeAPIRequest('/rate-limit/clear', { method: 'POST' });
        
    } catch (error) {
        console.error('Failed to clear rate limit cache:', error);
    }
}

export async function getCacheStats(): Promise<{ totalRequests: number; cacheHits: number; cacheMisses: number }> {
    try {
        return await makeAPIRequest<{ totalRequests: number; cacheHits: number; cacheMisses: number }>('/cache/stats');
    } catch (error) {
        // Return default stats if cache stats are unavailable
        return { totalRequests: 0, cacheHits: 0, cacheMisses: 0 };
    }
}

export function getNcbiQueueStatus(filter?: NcbiQueueMeta): {
    queueLength: number;
    isProcessing: boolean;
    lastRequestTime: number;
    relevantQueueLength: number;
    queue: QueuedRequest<unknown>[];
    processingRequest?: QueuedRequest<unknown>;
} {
    // Simplified since backend handles most queuing
    return {
        queueLength: 0,
        isProcessing: false,
        lastRequestTime: 0,
        relevantQueueLength: 0,
        queue: [],
        processingRequest: undefined
    };
}

export function getUcscQueueStatus(filter?: UcscQueueMeta): {
    queueLength: number;
    isProcessing: boolean;
    lastRequestTime: number;
    relevantQueueLength: number;
} {
    // Simplified since backend handles most queuing
    return {
        queueLength: 0,
        isProcessing: false,
        lastRequestTime: 0,
        relevantQueueLength: 0
    };
}

export const dynamic = "force-dynamic";
