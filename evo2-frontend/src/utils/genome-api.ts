import { env } from "../env";
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

// Public Interfaces
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
}

// Internal Interfaces for API Responses
interface NCBIGeneResponse {
    0: number; // Total count
    1: unknown[]; // Unused
    2: {
        chromosomes?: string[];
        Symbol?: string[];
        map_location?: string[];
        type_of_gene?: string[];
        GeneID?: string[];
        Aliases?: string[][];
        Description?: string[][];
    } | undefined;
    3: Array<Array<string | undefined> | undefined>;
}

interface UCSCGenome {
    organism: string;
    description?: string;
    sourceName?: string;
}

interface UCSCGenomesApiResponse {
    ucscGenomes: Record<string, UCSCGenome | undefined>;
    organism?: string;
    active?: boolean;
}

interface UCSCChromosomesApiResponse {
    genome: string;
    chromosomes: Record<string, number>;
}

interface NCBIGeneDetailsResponse {
    result: Record<string, {
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
    }>;
}

interface UCSCSequenceResponse {
    dna?: string;
    error?: string;
}

interface ClinvarSearchResponse {
    esearchresult: {
        idlist: string[];
    };
}

interface ClinvarSummaryResponse {
    result: {
        uids: string[];
        [id: string]: {
            title: string;
            obj_type: string;
            germline_classification: {
                description: string;
            };
            gene_sort: string;
            location_sort: string;
        } | string[];
    };
}

// Cache and Rate Limiting Interfaces
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

interface RateLimitInfo {
    lastRequest: number;
    requestCount: number;
    resetTime: number;
}

// Cache and Rate Limiting Configuration
const CACHE_CONFIG = {
    GENOMES_TTL: 24 * 60 * 60 * 1000, // 24 hours
    CHROMOSOMES_TTL: 24 * 60 * 60 * 1000, // 24 hours
    GENE_SEARCH_TTL: 60 * 60 * 1000, // 1 hour
    GENE_DETAILS_TTL: 12 * 60 * 60 * 1000, // 12 hours
    GENE_SEQUENCE_TTL: 6 * 60 * 60 * 1000, // 6 hours
    CLINVAR_TTL: 30 * 60 * 1000, // 30 minutes
} as const;

const RATE_LIMIT_CONFIG = {
    RETRY_ATTEMPTS: 3,
    BASE_DELAY: 1500, // 1.5 seconds
} as const;

// Memory cache for faster access
const memoryCache = new Map<string, CacheEntry<unknown>>();
const rateLimitMap = new Map<string, RateLimitInfo>();

// Request queue for NCBI API calls
export interface NcbiQueueMeta {
    geneId?: string;
    chrom?: string;
    genomeId?: string;
    start?: number;
    end?: number;
}
export interface QueuedRequest<T> {
    id: string;
    operation: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
    meta?: NcbiQueueMeta;
}

const ncbiRequestQueue: QueuedRequest<unknown>[] = [];
let isProcessingNcbiQueue = false;
let lastNcbiRequestTime = 0;
const NCBI_MIN_DELAY = 4000; // 4 seconds between NCBI requests

// Process NCBI request queue
let _currentProcessingNcbiRequest: QueuedRequest<unknown> | undefined = undefined;
async function processNcbiQueue(): Promise<void> {
    if (isProcessingNcbiQueue || ncbiRequestQueue.length === 0) {
        return;
    }

    isProcessingNcbiQueue = true;

    while (ncbiRequestQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastRequest = now - lastNcbiRequestTime;
        
        // Wait if we need to respect the minimum delay
        if (timeSinceLastRequest < NCBI_MIN_DELAY) {
            const waitTime = NCBI_MIN_DELAY - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const request = ncbiRequestQueue.shift();
        if (!request) continue;

        // Track the currently processing request globally for status
        _currentProcessingNcbiRequest = request;
        (globalThis as Record<string, unknown>)._currentProcessingNcbiRequest = request;

        try {
            lastNcbiRequestTime = Date.now();
            const result = await request.operation();
            request.resolve(result);
        } catch (error) {
            request.reject(error as Error);
        } finally {
            _currentProcessingNcbiRequest = undefined;
            (globalThis as Record<string, unknown>)._currentProcessingNcbiRequest = undefined;
        }
    }

    isProcessingNcbiQueue = false;
}

// Add request to NCBI queue
function queueNcbiRequest<T>(operation: () => Promise<T>, meta?: NcbiQueueMeta): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const requestId = `ncbi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const queuedRequest: QueuedRequest<T> = {
            id: requestId,
            operation,
            resolve,
            reject,
            timestamp: Date.now(),
            meta
        };
        ncbiRequestQueue.push(queuedRequest as QueuedRequest<unknown>);
        void processNcbiQueue();
    });
}

// Request queue for UCSC API calls
export interface UcscQueueMeta {
    chrom?: string;
    genomeId?: string;
}
interface QueuedUcscRequest<T> {
    id: string;
    operation: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
    meta?: UcscQueueMeta;
}

const ucscRequestQueue: QueuedUcscRequest<unknown>[] = [];
let isProcessingUcscQueue = false;
let lastUcscRequestTime = 0;
const UCSC_MIN_DELAY = 4000; // 4 seconds between UCSC requests

async function processUcscQueue(): Promise<void> {
    if (isProcessingUcscQueue || ucscRequestQueue.length === 0) {
        return;
    }
    isProcessingUcscQueue = true;
    while (ucscRequestQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastRequest = now - lastUcscRequestTime;
        if (timeSinceLastRequest < UCSC_MIN_DELAY) {
            const waitTime = UCSC_MIN_DELAY - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        const request = ucscRequestQueue.shift();
        if (!request) continue;
        try {
            lastUcscRequestTime = Date.now();
            const result = await request.operation();
            request.resolve(result);
        } catch (error) {
            request.reject(error as Error);
        }
    }
    isProcessingUcscQueue = false;
}

function queueUcscRequest<T>(operation: () => Promise<T>, meta?: UcscQueueMeta): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const requestId = `ucsc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const queuedRequest: QueuedUcscRequest<T> = {
            id: requestId,
            operation,
            resolve,
            reject,
            timestamp: Date.now(),
            meta
        };
        ucscRequestQueue.push(queuedRequest as QueuedUcscRequest<unknown>);
        void processUcscQueue();
    });
}

// Utility Functions
function generateCacheKey(prefix: string, ...params: (string | number)[]): string {
    return `${prefix}:${params.join(':')}`;
}

function isCacheValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
}

function getFromCache<T>(key: string): T | null {
    // Check memory cache first
    const memoryEntry = memoryCache.get(key);
    if (memoryEntry && isCacheValid(memoryEntry)) {
        return memoryEntry.data as T;
    }

    // Check localStorage
    if (typeof window !== 'undefined') {
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored) as CacheEntry<T>;
                if (isCacheValid(parsed)) {
                    // Update memory cache
                    memoryCache.set(key, parsed);
                    return parsed.data;
                } else {
                    localStorage.removeItem(key);
                }
            }
        } catch (error) {
            console.warn('Failed to read from localStorage:', error);
        }
    }

    return null;
}

function setCache<T>(key: string, data: T, ttl: number): void {
    const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
    };

    // Update memory cache
    memoryCache.set(key, entry);

    // Update localStorage
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(key, JSON.stringify(entry));
        } catch (error) {
            console.warn('Failed to write to localStorage:', error);
        }
    }
}

async function checkRateLimit(apiType: 'NCBI' | 'UCSC'): Promise<boolean> {
    const now = Date.now();
    const rateLimit = rateLimitMap.get(apiType);
    
    if (!rateLimit) {
        rateLimitMap.set(apiType, {
            lastRequest: now,
            requestCount: 1,
            resetTime: now + (apiType === 'NCBI' ? 4000 : 2000)
        });
        return true;
    }

    const config = apiType === 'NCBI' ? 1 : 2;
    const minDelayBetweenRequests = apiType === 'NCBI' ? 4000 : 2000;
    const resetInterval = apiType === 'NCBI' ? 4000 : 2000;

    // Reset counter if window has passed
    if (now >= rateLimit.resetTime) {
        rateLimit.requestCount = 0;
        rateLimit.resetTime = now + resetInterval;
    }

    // Check minimum delay between requests
    if (rateLimit.lastRequest && (now - rateLimit.lastRequest) < minDelayBetweenRequests) {
        await new Promise(resolve => setTimeout(resolve, minDelayBetweenRequests - (now - rateLimit.lastRequest)));
        return false;
    }

    if (rateLimit.requestCount >= config) {
        await new Promise(resolve => setTimeout(resolve, resetInterval - (now - rateLimit.resetTime)));
        return false;
    }

    rateLimit.requestCount++;
    rateLimit.lastRequest = now;
    return true;
}

async function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxAttempts: number = RATE_LIMIT_CONFIG.RETRY_ATTEMPTS
): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            
            // If it's a rate limit error, wait much longer
            if (error instanceof RateLimitError || (error instanceof APIError && error.statusCode === 429)) {
                const rateLimitDelay = RATE_LIMIT_CONFIG.BASE_DELAY * Math.pow(3, attempt - 1) + Math.random() * 4000;
                await delay(rateLimitDelay);
                continue;
            }
            
            // If it's the last attempt, throw the error
            if (attempt === maxAttempts) {
                throw lastError;
            }
            
            // Exponential backoff with jitter for other errors
            const backoffDelay = RATE_LIMIT_CONFIG.BASE_DELAY * Math.pow(2, attempt - 1) + Math.random() * 1000;
            await delay(backoffDelay);
        }
    }
    
    throw lastError!;
}

async function makeAPIRequest<T>(
    url: string,
    service: 'NCBI' | 'UCSC',
    options: RequestInit = {}
): Promise<T> {
    const proxyUrl = service === 'NCBI' ? '/api/proxy/ncbi' : '/api/proxy/ucsc';
    const fullProxyUrl = `${proxyUrl}?endpoint=${encodeURIComponent(url)}`;
    let lastError: Error | null = null;

    for (let i = 0; i < RATE_LIMIT_CONFIG.RETRY_ATTEMPTS; i++) {
        try {
            const response = await fetch(fullProxyUrl, {
                ...options,
                headers: {
                    ...options.headers,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                const status = response.status;

                // For 429 (rate limit) or 5xx server errors, we should retry
                if (status === 429 || status >= 500) {
                    throw new APIError(`${service} API returned status ${status}`, status, service, true);
                }
                
                // For other errors (e.g., 400), don't retry
                throw new APIError(`${service} API Error: ${status} - ${errorText}`, status, service, false);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                return await response.json() as T;
            }
            
            // Handle non-JSON responses (like for GenBank text)
            return await response.text() as unknown as T;

        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // If the error is not retryable, break the loop
            if (error instanceof APIError && !error.retryable) {
                break;
            }
            
            // Exponential backoff with jitter
            const delay = RATE_LIMIT_CONFIG.BASE_DELAY * Math.pow(2, i) + Math.random() * 1000;
            console.warn(`Attempt ${i + 1} for ${url} failed. Retrying in ${delay.toFixed(0)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw new Error(`Failed to fetch from ${service} after ${RATE_LIMIT_CONFIG.RETRY_ATTEMPTS} attempts: ${lastError?.message ?? 'Unknown error'}`);
}

// Enhanced API Functions with Caching, Error Handling, and Fallbacks

export async function getAvailableGenomes(): Promise<{ genomes: Record<string, GenomeAssemblyFromSearch[]> }> {
    return measureAPIPerformance(async () => {
        const cacheKey = generateCacheKey('genomes');
        const cached = getFromCache<{ genomes: Record<string, GenomeAssemblyFromSearch[]> }>(cacheKey);

        if (cached) {
            return cached;
    }

        try {
            const apiURL = "https://api.genome.ucsc.edu/list/ucscGenomes";
            const genomeData = await makeAPIRequest<UCSCGenomesApiResponse>(apiURL, 'UCSC');

    if (!genomeData.ucscGenomes) {
                throw new APIError("UCSC API error: missing UCSC Genomes", 500, 'UCSC', false);
    }

    const genomes = genomeData.ucscGenomes;
    const structuredGenomes: Record<string, GenomeAssemblyFromSearch[]> = {};

    for (const genomeId in genomes) {
        const genomeInfo = genomes[genomeId];
                if (!genomeInfo) {
            continue;
        }

        const organism = genomeInfo.organism ?? "Other";
        structuredGenomes[organism] ??= [];

        structuredGenomes[organism].push({
            id: genomeId,
            name: genomeInfo.description ?? genomeId,
            active: genomeData.active ?? false,
            sourceName: genomeInfo.sourceName ?? genomeId
        });
    }

            const result = { genomes: structuredGenomes };
            setCache(cacheKey, result, CACHE_CONFIG.GENOMES_TTL);
            return result;
        } catch (error) {
            return getFallbackData('genomes') as { genomes: Record<string, GenomeAssemblyFromSearch[]> };
        }
    }, 'getAvailableGenomes');
}

export async function getGenomeChromosomes(genomeId: string): Promise<{ chromosomes: ChromosomeFromSearch[] }> {
    return measureAPIPerformance(async () => {
        const cacheKey = generateCacheKey('chromosomes', genomeId);
        const cached = getFromCache<{ chromosomes: ChromosomeFromSearch[] }>(cacheKey);

        if (cached) {
            return cached;
    }

        try {
            const apiURL = `https://api.genome.ucsc.edu/list/chromosomes?genome=${genomeId}`;
            const chromosomeData = await makeAPIRequest<UCSCChromosomesApiResponse>(apiURL, 'UCSC');

    if (!chromosomeData.chromosomes) {
                throw new APIError("UCSC API error: missing chromosomes", 500, 'UCSC', false);
    }

    const chromosomes: ChromosomeFromSearch[] = [];

    for (const chromId in chromosomeData.chromosomes) {
        if (chromId.includes("_") || chromId.includes("Un") || chromId.includes("random")) {
            continue;
        }
        const size = chromosomeData.chromosomes[chromId];
                if (!size || isNaN(size)) {
            continue;
        }
        chromosomes.push({
            name: chromId,
            size
        });
    }

    chromosomes.sort((a, b) => {
        const anum = a.name.replace("chr", "");
        const bnum = b.name.replace("chr", "");
        const isNumA = /^\d+$/.test(anum);
        const isNumB = /^\d+$/.test(bnum);

        if (isNumA && isNumB) return Number(anum) - Number(bnum);
        if (isNumA) return -1;
        if (isNumB) return 1;
        return anum.localeCompare(bnum);
    });

            const result = { chromosomes };
            setCache(cacheKey, result, CACHE_CONFIG.CHROMOSOMES_TTL);
            return result;
        } catch (error) {
            return getFallbackData('chromosomes') as { chromosomes: ChromosomeFromSearch[] };
        }
    }, 'getGenomeChromosomes');
}

export async function searchGenes(
    query: string,
    genome: string
): Promise<{ query: string; genome: string; results: GeneFromSearch[] }> {
    const cacheKey = generateCacheKey('gene_search', query, genome);
    const cached = getFromCache<{ query: string; genome: string; results: GeneFromSearch[] }>(cacheKey);
    
    if (cached) {
        return cached;
    }

    try {
        const url = "https://clinicaltables.nlm.nih.gov/api/ncbi_genes/v3/search";
        const params = new URLSearchParams({
            terms: query,
            df: "chromosomes,Symbol,map_location,type_of_gene,Aliases,Description",
            ef: "chromosomes,Symbol,map_location,type_of_gene,GenomicInfo,GeneID,Aliases,Description",
            maxList: "25"
        });

        const data = await makeAPIRequest<NCBIGeneResponse>(`${url}?${params}`, 'NCBI');

        const results: GeneFromSearch[] = [];

        if (data[0] > 0 && data[2] && data[3]) {
            const fieldMap = data[2];
            const geneIds: string[] = fieldMap.GeneID ?? [];
            const aliases: string[][] = fieldMap.Aliases ?? [];
            const descriptions: string[][] = fieldMap.Description ?? [];

            for (let i = 0; i < Math.min(25, data[0]) && i < data[3].length; i++) {
                const display = data[3][i];
                if (!display || !Array.isArray(display)) {
                    continue;
                }

                try {
                    let chrom = typeof display[2] === 'string' ? display[2] : '';
                    
                    // Handle chromosome format
                    if (chrom) {
                        // Remove any 'chr' prefix to standardize
                        chrom = chrom.replace(/^chr/i, '');
                        // Extract the main chromosome number/letter
                        const match = /^([0-9XYMTxy]+)/.exec(chrom);
                        if (match?.[1]) {
                            chrom = `chr${match[1].toUpperCase()}`;
                        }
                    }

                    // Validate essential fields
                    const symbol = typeof display[1] === 'string' ? display[1].trim() : '';
                    const name = typeof display[3] === 'string' ? display[3].trim() : '';
                    const geneId = i < geneIds.length ? (geneIds[i] ?? '').trim() : '';
                    
                    // Get aliases and description if available
                    const geneAliases = i < aliases.length ? aliases[i] ?? [] : [];
                    const description = i < descriptions.length ? descriptions[i]?.[0] ?? '' : '';

                    // Skip genes with missing essential data
                    if (!symbol || !geneId) {
                        continue;
                    }

                    const gene: GeneFromSearch = {
                        symbol,
                        name: name ?? symbol, // Use symbol as name if name is empty
                        chrom: chrom || 'Unknown',
                        description: description ?? name ?? symbol,
                        gene_id: geneId
                    };
                    results.push(gene);
                } catch (error) {
                    // Skip this gene and continue with others
                    continue;
                }
            }

            // Sort results to prioritize exact matches
            results.sort((a, b) => {
                const aIsExact = a.symbol.toLowerCase() === query.toLowerCase();
                const bIsExact = b.symbol.toLowerCase() === query.toLowerCase();
                
                if (aIsExact && !bIsExact) return -1;
                if (!aIsExact && bIsExact) return 1;
                
                return 0;
            });
        }

        const result = { query, genome, results };
        setCache(cacheKey, result, CACHE_CONFIG.GENE_SEARCH_TTL);
        return result;
    } catch (error) {
        console.error('Failed to search genes:', error);
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
    const cacheKey = generateCacheKey('gene_details', geneId);
    const cached = getFromCache<{
        geneDetails: GeneDetailsFromSearch | null;
        geneBounds: GeneBounds | null;
        initialRange: { start: number; end: number } | null;
    }>(cacheKey);
    
    if (cached) {
        return cached;
    }

    try {
        // First get the summary for basic info
        const summaryURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`;
        const summaryData = await makeAPIRequest<NCBIGeneDetailsResponse>(summaryURL, 'NCBI');
        const detail = summaryData.result?.[geneId];

        // Then get the GenBank format for accurate strand information
        const genbankURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=gene&id=${geneId}&rettype=gb&retmode=text`;
        let strand: string | undefined = undefined;
        
        try {
            const genbankText = await makeAPIRequest<string>(genbankURL, 'NCBI');
        
        // Look for complement in the annotation line
        const annotationMatch = /Annotation:.*?\((.*?)\)/.exec(genbankText);
        if (annotationMatch?.[1]) {
            const coordinates = annotationMatch[1];
            
            // Check if coordinates contain complement
            if (coordinates.includes('complement')) {
                strand = "-";
            } else {
                // If no complement, it's on the forward strand
                strand = "+";
            }
        }
        } catch (error) {
        }

        if (detail?.genomicinfo && detail.genomicinfo.length > 0) {
            const info = detail.genomicinfo[0];
            if (!info) {
                const result = { geneDetails: null, geneBounds: null, initialRange: null };
                setCache(cacheKey, result, CACHE_CONFIG.GENE_DETAILS_TTL);
                return result;
            }

            // Update the strand information from GenBank format
            info.strand = strand;

            const minPos = Math.min(info.chrstart, info.chrstop);
            const maxPos = Math.max(info.chrstart, info.chrstop);
            const bounds: GeneBounds = { min: minPos, max: maxPos };

            const geneSize = maxPos - minPos;
            const seqStart = minPos;
            const seqEnd = geneSize > 10000 ? seqStart + 9999 : maxPos;
            const range = { start: seqStart, end: seqEnd };

            const result = {
                geneDetails: detail,
                geneBounds: bounds,
                initialRange: range
            };
            setCache(cacheKey, result, CACHE_CONFIG.GENE_DETAILS_TTL);
            return result;
        }

        const result = { geneDetails: null, geneBounds: null, initialRange: null };
        setCache(cacheKey, result, CACHE_CONFIG.GENE_DETAILS_TTL);
        return result;
    } catch (error) {
        console.error('Error fetching gene details:', error);
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
    const cacheKey = generateCacheKey('gene_sequence', chrom, start, end, genomeId);
    const cached = getFromCache<{
        sequence: string;
        actualRange: { start: number; end: number };
        error?: string;
    }>(cacheKey);
    
    if (cached) {
        return cached;
    }

    try {
        // Normalize chromosome format for UCSC
        let chromosome = chrom;
        
        // If it doesn't start with 'chr', add it
        if (!chromosome.toLowerCase().startsWith('chr')) {
            chromosome = `chr${chromosome}`;
        }
        
        // Remove any version numbers or patches (e.g., chr1.1 -> chr1)
        const chromParts = chromosome.split('.');
        chromosome = chromParts[0] ?? chromosome;
        
        // Handle special cases and alternate names
        const chromosomeMap: Record<string, string> = {
            'chrMT': 'chrM',  // Mitochondrial DNA
            'chrMt': 'chrM'
        };
        
        chromosome = chromosomeMap[chromosome] ?? chromosome;

        // More permissive pattern that allows for:
        // - Standard chromosomes (1-22, X, Y, M)
        // - Unplaced contigs (Un)
        // - Alternative haplotypes (_alt)
        // - Random chromosomes (_random)
        // - Patches (_fix)
        const chrPattern = /^chr([0-9]+|X|Y|M|Un|[0-9]+_alt|[0-9]+_random|[0-9]+_fix)$/i;
        
        if (!chrPattern.exec(chromosome)) {
            const result = {
                sequence: "",
                actualRange: { start, end },
                error: `Invalid chromosome format: ${chromosome}. This might be an unrecognized chromosome or contig.`
            };
            setCache(cacheKey, result, CACHE_CONFIG.GENE_SEQUENCE_TTL);
            return result;
        }
        
        const apiStart = start - 1; // UCSC uses 0-based coordinates
        const apiEnd = end;

        const apiURL = `https://api.genome.ucsc.edu/getData/sequence?genome=${genomeId};chrom=${chromosome};start=${apiStart};end=${apiEnd}`;
        const data = await makeAPIRequest<UCSCSequenceResponse>(apiURL, 'UCSC');
        const actualRange = { start, end };

        if (data.error || !data.dna) {
            const result = {
                sequence: "",
                actualRange,
                error: data.error ?? "No DNA sequence returned. This might be due to invalid coordinates or unsupported chromosome in the selected genome assembly."
            };
            setCache(cacheKey, result, CACHE_CONFIG.GENE_SEQUENCE_TTL);
            return result;
        }

        const sequence = data.dna.toUpperCase();
        const result = { sequence, actualRange };
        setCache(cacheKey, result, CACHE_CONFIG.GENE_SEQUENCE_TTL);
        return result;
    } catch (error) {
        console.error("Failed to fetch DNA sequence:", error);
        const result = {
            sequence: "",
            actualRange: { start, end },
            error: "Failed to fetch DNA sequence. This might be due to network issues or invalid coordinates."
        };
        setCache(cacheKey, result, CACHE_CONFIG.GENE_SEQUENCE_TTL);
        return result;
    }
}

export async function fetchClinvarVariants(
    chrom: string,
    geneBound: GeneBounds,
    genomeId: string
): Promise<ClinvarVariants[]> {
    const cacheKey = generateCacheKey('clinvar_variants', chrom, geneBound.min, geneBound.max, genomeId);
    const cached = getFromCache<ClinvarVariants[]>(cacheKey);
    
    if (cached) {
        return cached;
    }

    try {
    const chromFormatted = chrom.replace(/^chr/i, "");
    const minBound = Math.min(geneBound.min, geneBound.max);
    const maxBound = Math.max(geneBound.min, geneBound.max);
    const positionField = genomeId === "hg19" ? "chrpos37" : "chrpos38";
    const searchTerm = `${chromFormatted}[chromosome] AND ${minBound}:${maxBound}[${positionField}]`;

    const searchURL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
    const searchParams = new URLSearchParams({
        db: "clinvar",
        term: searchTerm,
        retmode: "json",
        retmax: "20"
    });

        const searchData = await makeAPIRequest<ClinvarSearchResponse>(
            `${searchURL}?${searchParams.toString()}`,
            'NCBI'
        );

    if (!searchData.esearchresult?.idlist || searchData.esearchresult.idlist.length === 0) {
            const result: ClinvarVariants[] = [];
            setCache(cacheKey, result, CACHE_CONFIG.CLINVAR_TTL);
            return result;
    }

    const variantIds = searchData.esearchresult.idlist;
    const summaryURL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
    const summaryParams = new URLSearchParams({
        db: "clinvar",
        id: variantIds.join(","),
        retmode: "json"
    });

        const summaryData = await makeAPIRequest<ClinvarSummaryResponse>(
            `${summaryURL}?${summaryParams.toString()}`,
            'NCBI'
        );

    const variants: ClinvarVariants[] = [];

    if (summaryData.result?.uids) {
        for (const id of summaryData.result.uids) {
            const variant = summaryData.result[id];
            if (typeof variant === "object" && variant !== null && !Array.isArray(variant)) {
                variants.push({
                    clinvar_id: id,
                    title: variant.title || "Unknown",
                    variation_type: (variant.obj_type || "Unknown")
                        .split(" ")
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(" "),
                    classification: variant.germline_classification?.description || "Unknown",
                    gene_sort: variant.gene_sort || "",
                    chromosome: chromFormatted,
                    location: variant.location_sort ? parseInt(variant.location_sort, 10).toLocaleString() : "Unknown"
                });
            }
        }
    }

        setCache(cacheKey, variants, CACHE_CONFIG.CLINVAR_TTL);
    return variants;
    } catch (error) {
        console.error('Failed to fetch ClinVar variants:', error);
        throw error;
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
} : {
    position: number;
    alternative: string;
    genomeId: string;
    chromosome: string;
}) : Promise<AnalysisResult> {
    const queryParams = new URLSearchParams({
        variant_pos: position.toString(), 
        alternative: alternative,
        genome: genomeId,
        chromosome: chromosome,
    });

    const url = `${env.NEXT_PUBLIC_ANALYZE_VARIANT_BASE_URL}?${queryParams.toString()}`;

    try {
    const response = await fetch(url, {
        method: "POST", 
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", errorText);
        throw new Error(`Failed to analyze variant: ${errorText}`);
    }

        return await response.json() as AnalysisResult;
    } catch (error) {
        console.error('Failed to analyze variant:', error);
        throw error;
    }
}

// Cache management utilities
export function clearCache(): void {
    // Clear memory cache
    memoryCache.clear();
    
    // Clear localStorage cache
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('evo2_cache:')) {
                localStorage.removeItem(key);
            }
        });
    } catch (error) {
    }
    
    // Clear rate limit cache
    rateLimitMap.clear();
}

export function clearRateLimitCache(): void {
    rateLimitMap.clear();
}

export function getNcbiQueueStatus(filter?: NcbiQueueMeta): {
    queueLength: number;
    isProcessing: boolean;
    lastRequestTime: number;
    relevantQueueLength: number;
    queue: QueuedRequest<unknown>[];
    processingRequest?: QueuedRequest<unknown>;
} {
    let relevantQueueLength = 0;
    let filteredQueue: QueuedRequest<unknown>[] = [];
    if (filter) {
        filteredQueue = ncbiRequestQueue.filter(q => {
            return (!filter.geneId || q.meta?.geneId === filter.geneId) &&
                   (!filter.chrom || q.meta?.chrom === filter.chrom) &&
                   (!filter.genomeId || q.meta?.genomeId === filter.genomeId) &&
                   (filter.start === undefined || q.meta?.start === filter.start) &&
                   (filter.end === undefined || q.meta?.end === filter.end);
        });
        relevantQueueLength = filteredQueue.length;
    } else {
        filteredQueue = ncbiRequestQueue;
        relevantQueueLength = ncbiRequestQueue.length;
    }
    const processingRequest = (globalThis as Record<string, unknown>)._currentProcessingNcbiRequest as QueuedRequest<unknown> | undefined;
    return {
        queueLength: ncbiRequestQueue.length,
        isProcessing: isProcessingNcbiQueue,
        lastRequestTime: lastNcbiRequestTime,
        relevantQueueLength,
        queue: filteredQueue,
        processingRequest
    };
}

export function getUcscQueueStatus(filter?: UcscQueueMeta): { queueLength: number; isProcessing: boolean; lastRequestTime: number; relevantQueueLength: number } {
    let relevantQueueLength = 0;
    if (filter) {
        relevantQueueLength = ucscRequestQueue.filter(q => {
            return (!filter.chrom || q.meta?.chrom === filter.chrom) &&
                   (!filter.genomeId || q.meta?.genomeId === filter.genomeId);
        }).length;
    } else {
        relevantQueueLength = ucscRequestQueue.length;
    }
    return {
        queueLength: ucscRequestQueue.length,
        isProcessing: isProcessingUcscQueue,
        lastRequestTime: lastUcscRequestTime,
        relevantQueueLength
    };
}

export function getCacheStats(): { memorySize: number; localStorageSize: number } {
    const memorySize = memoryCache.size;
    let localStorageSize = 0;
    
    if (typeof window !== 'undefined') {
        try {
            const keys = Object.keys(localStorage);
            localStorageSize = keys.filter(key => 
                key.startsWith('genomes:') || key.startsWith('chromosomes:') || 
                key.startsWith('gene_search:') || key.startsWith('gene_details:') || 
                key.startsWith('gene_sequence:') || key.startsWith('clinvar_variants:')
            ).length;
        } catch (error) {
        }
    }
    
    return { memorySize, localStorageSize };
}

export const dynamic = "force-dynamic";