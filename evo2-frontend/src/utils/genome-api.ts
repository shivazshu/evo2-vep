import { env } from "~/env";

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

// Functions

export async function getAvailableGenomes(): Promise<{ genomes: Record<string, GenomeAssemblyFromSearch[]> }> {
    const apiURL = "https://api.genome.ucsc.edu/list/ucscGenomes";

    const response = await fetch(apiURL);
    if (!response.ok) {
        throw new Error(`Failed to fetch genome list from UCSC API: ${response.statusText}`);
    }

    const genomeData = await response.json() as UCSCGenomesApiResponse;

    if (!genomeData.ucscGenomes) {
        throw new Error("UCSC API error: missing UCSC Genomes");
    }

    const genomes = genomeData.ucscGenomes;
    const structuredGenomes: Record<string, GenomeAssemblyFromSearch[]> = {};

    for (const genomeId in genomes) {
        const genomeInfo = genomes[genomeId];
        if (!genomeInfo) {
            console.warn(`Skipping invalid genomeInfo for genomeId: ${genomeId}`);
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

    return { genomes: structuredGenomes };
}

export async function getGenomeChromosomes(genomeId: string): Promise<{ chromosomes: ChromosomeFromSearch[] }> {
    const apiURL = `https://api.genome.ucsc.edu/list/chromosomes?genome=${genomeId}`;

    const response = await fetch(apiURL);
    if (!response.ok) {
        throw new Error(`Failed to fetch chromosome list from UCSC API: ${response.statusText}`);
    }

    const chromosomeData = await response.json() as UCSCChromosomesApiResponse;

    if (!chromosomeData.chromosomes) {
        throw new Error("UCSC API error: missing chromosomes");
    }

    const chromosomes: ChromosomeFromSearch[] = [];

    for (const chromId in chromosomeData.chromosomes) {
        if (chromId.includes("_") || chromId.includes("Un") || chromId.includes("random")) {
            continue;
        }
        const size = chromosomeData.chromosomes[chromId];
        if (!size) {
            console.warn(`Skipping invalid size for chromosome ${chromId}`);
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

    return { chromosomes };
}

export async function searchGenes(
    query: string,
    genome: string
): Promise<{ query: string; genome: string; results: GeneFromSearch[] }> {
    const url = "https://clinicaltables.nlm.nih.gov/api/ncbi_genes/v3/search";
    const params = new URLSearchParams({
        terms: query,
        df: "chromosomes,Symbol,map_location,type_of_gene",
        ef: "chromosomes,Symbol,map_location,type_of_gene,GenomicInfo,GeneID"
    });

    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
        throw new Error(`NCBI API Error: ${response.statusText}`);
    }

    const data = await response.json() as NCBIGeneResponse;

    const results: GeneFromSearch[] = [];

    if (data[0] > 0 && data[2] && data[3]) {
        const fieldMap = data[2];
        const geneIds: string[] = fieldMap.GeneID ?? [];

        for (let i = 0; i < Math.min(10, data[0]) && i < data[3].length; i++) {
            const display = data[3][i];
            if (!display || !Array.isArray(display)) {
                continue;
            }

            try {
                let chrom = typeof display[2] === 'string' ? display[2] : '';
                const chromosomeMatch = /^\d+/.exec(chrom);
                const chromosomeNumber = chromosomeMatch?.[0] ?? '';
                chrom = chromosomeNumber ? `chr${chromosomeNumber}` : '';

                const gene: GeneFromSearch = {
                    symbol: typeof display[1] === 'string' ? display[1] : '',
                    name: typeof display[3] === 'string' ? display[3] : '',
                    chrom,
                    description: typeof display[3] === 'string' ? display[3] : '',
                    gene_id: i < geneIds.length ? (geneIds[i] ?? '') : ''
                };
                results.push(gene);
            } catch (error) {
                console.warn(`Skipping invalid gene data at index ${i}:`, error);
                continue;
            }
        }
    }

    return { query, genome, results };
}

export async function fetchGeneDetails(
    geneId: string
): Promise<{
    geneDetails: GeneDetailsFromSearch | null;
    geneBounds: GeneBounds | null;
    initialRange: { start: number; end: number } | null;
}> {
    try {
        // First get the summary for basic info
        const summaryURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=${geneId}&retmode=json`;
        const summaryResponse = await fetch(summaryURL);
        if (!summaryResponse.ok) {
            console.error(`Failed to fetch gene summary: ${summaryResponse.statusText}`);
            return { geneDetails: null, geneBounds: null, initialRange: null };
        }

        const summaryData = await summaryResponse.json() as NCBIGeneDetailsResponse;
        const detail = summaryData.result?.[geneId];

        // Then get the GenBank format for accurate strand information
        const genbankURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=gene&id=${geneId}&rettype=gb&retmode=text`;
        const genbankResponse = await fetch(genbankURL);
        if (!genbankResponse.ok) {
            console.error(`Failed to fetch GenBank format: ${genbankResponse.statusText}`);
            return { geneDetails: null, geneBounds: null, initialRange: null };
        }

        const genbankText = await genbankResponse.text();
        
        let strand: string | undefined = undefined;
        
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

        if (detail?.genomicinfo && detail.genomicinfo.length > 0) {
            const info = detail.genomicinfo[0];
            if (!info) {
                return { geneDetails: null, geneBounds: null, initialRange: null };
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

            return {
                geneDetails: detail,
                geneBounds: bounds,
                initialRange: range
            };
        }

        return { geneDetails: null, geneBounds: null, initialRange: null };
    } catch (error) {
        console.error('Error fetching gene details:', error);
        return { geneDetails: null, geneBounds: null, initialRange: null };
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
        const chromosome = chrom && chrom !== "chr" ? (chrom.startsWith("chr") ? chrom : `chr${chrom}`) : "";
        const chrPattern = /^chr([0-9]+|X|Y|M)$/;
        if (!chrPattern.exec(chromosome)) {
            return {
                sequence: "",
                actualRange: { start, end },
                error: "Invalid or missing chromosome information."
            };
        }
        const apiStart = start - 1; // UCSC uses 0-based coordinates
        const apiEnd = end;

        const apiURL = `https://api.genome.ucsc.edu/getData/sequence?genome=${genomeId};chrom=${chromosome};start=${apiStart};end=${apiEnd}`;
        const response = await fetch(apiURL);

        if (!response.ok) {
            let errorMsg = `API request failed: ${response.statusText}`;
            if (response.status === 400) {
                errorMsg = "Bad Request: Please check that the chromosome and position are valid.";
            }
            throw new Error(errorMsg);
        }

        const data = await response.json() as UCSCSequenceResponse;
        const actualRange = { start, end };

        if (data.error || !data.dna) {
            return {
                sequence: "",
                actualRange,
                error: data.error ?? "No DNA sequence returned"
            };
        }

        const sequence = data.dna.toUpperCase();
        return { sequence, actualRange };
    } catch (error) {
        console.error("Failed to fetch DNA sequence:", error);
        return { sequence: "", actualRange: { start, end }, error: "Failed to fetch sequence data" };
    }
}

export async function fetchClinvarVariants(
    chrom: string,
    geneBound: GeneBounds,
    genomeId: string
): Promise<ClinvarVariants[]> {
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

    const searchResponse = await fetch(`${searchURL}?${searchParams.toString()}`);
    if (!searchResponse.ok) {
        throw new Error(`ClinVar search failed: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json() as ClinvarSearchResponse;

    if (!searchData.esearchresult?.idlist || searchData.esearchresult.idlist.length === 0) {
        return [];
    }

    const variantIds = searchData.esearchresult.idlist;
    const summaryURL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
    const summaryParams = new URLSearchParams({
        db: "clinvar",
        id: variantIds.join(","),
        retmode: "json"
    });

    const summaryResponse = await fetch(`${summaryURL}?${summaryParams.toString()}`);
    if (!summaryResponse.ok) {
        throw new Error(`Failed to fetch variant details: ${summaryResponse.statusText}`);
    }

    const summaryData = await summaryResponse.json() as ClinvarSummaryResponse;

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

    return variants;
}

// Helper function for reverse complement
export function reverseComplement(sequence: string): string {
    const complement: Record<string, string> = {
        'A': 'T',
        'T': 'A',
        'G': 'C',
        'C': 'G'
    };
    return sequence.split('').map(base => complement[base] ?? base).reverse().join('');
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

    // Make the API request
    const response = await fetch(url, {
        method: "POST", 
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", errorText);
        throw new Error(`Failed to analyze variant: ${errorText}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await response.json();
}