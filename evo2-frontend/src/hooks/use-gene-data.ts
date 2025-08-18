import { useState, useCallback, useEffect } from "react";
import { 
    fetchGeneDetails, 
    fetchGeneSequence as apiFetchGeneSequence,
    fetchClinvarVariants as apiFetchClinvarVariants,
    type GeneBounds, 
    type GeneDetailsFromSearch, 
    type GeneFromSearch, 
    type ClinvarVariants 
} from "../utils/redis-genome-api";
import { useErrorHandler } from "./use-error-handler";

interface UseGeneDataOptions {
    autoFetchSequence?: boolean;
    autoFetchClinvar?: boolean;
}

export function useGeneData(
    gene: GeneFromSearch | null,
    genomeId: string,
    options: UseGeneDataOptions = {}
) {
    const { autoFetchSequence = true, autoFetchClinvar = true } = options;
    
    const [geneDetails, setGeneDetails] = useState<GeneDetailsFromSearch | null>(null);
    const [geneBounds, setGeneBounds] = useState<GeneBounds | null>(null);
    const [geneSequence, setGeneSequence] = useState("");
    const [actualRange, setActualRange] = useState<{start: number, end: number} | null>(null);
    const [startPosition, setStartPosition] = useState<string>("");
    const [endPosition, setEndPosition] = useState<string>("");
    const [clinvarVariants, setClinvarVariants] = useState<ClinvarVariants[]>([]);
    
    const { error, isLoading, handleError, executeWithErrorHandling } = useErrorHandler();
    const [isLoadingSequence, setIsLoadingSequence] = useState(false);
    const [isLoadingClinvar, setIsLoadingClinvar] = useState(false);
    const [clinvarError, setClinvarError] = useState<string | null>(null);

    const fetchGeneSequence = useCallback(async (start: number, end: number) => {
        if (!gene?.chrom) return;
        
        setIsLoadingSequence(true);
        try {
            const { sequence, actualRange: fetchedRange, error: apiError } = await apiFetchGeneSequence(
                gene.chrom, 
                start, 
                end, 
                genomeId
            );

            setGeneSequence(sequence);
            setActualRange(fetchedRange);
            
            if (apiError) {
                handleError(new Error(apiError), "fetchGeneSequence");
            }
        } catch (err) {
            handleError(err, "fetchGeneSequence");
        } finally {
            setIsLoadingSequence(false);
        }
    }, [gene?.chrom, genomeId, handleError]);

    const fetchClinvarVariants = useCallback(async () => {
        if (!gene?.chrom || !geneBounds) return;

        setIsLoadingClinvar(true);
        setClinvarError(null);

        try {
            const variants = await apiFetchClinvarVariants(
                gene.chrom,
                geneBounds,
                genomeId,
            );
            setClinvarVariants(variants);
        } catch (err) {
            console.error(err);
            setClinvarError("Error in fetching ClinVar Variants.");
            setClinvarVariants([]);
        } finally {
            setIsLoadingClinvar(false);
        }
    }, [gene?.chrom, geneBounds, genomeId]);

    const updateClinvarVariant = useCallback((clinvar_id: string, updateVariant: ClinvarVariants) => {
        setClinvarVariants((currentVariants) => 
            currentVariants.map((v) => v.clinvar_id === clinvar_id ? updateVariant : v)
        );
    }, []);

    // Initialize gene data
    useEffect(() => {
        if (!gene?.gene_id) return;

        const initializeGeneData = async () => {
            const result = await executeWithErrorHandling(async () => {
                if (!gene.gene_id) {
                    throw new Error("Gene ID is missing. This gene may not exist in the database or may have been entered incorrectly.");
                }

                if (!gene.chrom || gene.chrom === '') {
                    throw new Error("Chromosome information is missing for this gene. This may indicate invalid gene data.");
                }

                if (!gene.symbol || gene.symbol.trim() === '') {
                    throw new Error("Gene symbol is missing. This may indicate invalid gene data.");
                }

                return await fetchGeneDetails(gene.gene_id);
            }, "initializeGeneData");

            if (result) {
                const { geneDetails: fetchedDetails, geneBounds: fetchedGeneBounds, initialRange: fetchedRange } = result;
                
                if (!fetchedDetails || !fetchedGeneBounds) {
                    handleError(
                        new Error(`Unable to fetch details for gene ${gene.symbol} (ID: ${gene.gene_id}). This gene may not exist in the current genome assembly or may have been entered incorrectly.`),
                        "initializeGeneData"
                    );
                    return;
                }

                setGeneDetails(fetchedDetails);
                setGeneBounds(fetchedGeneBounds);

                if (fetchedRange && autoFetchSequence) {
                    setStartPosition(String(fetchedRange.start));
                    setEndPosition(String(fetchedRange.end));
                    await fetchGeneSequence(fetchedRange.start, fetchedRange.end);
                }
            }
        };

        void initializeGeneData();
    }, [gene, genomeId, autoFetchSequence, fetchGeneSequence, executeWithErrorHandling, handleError]);

    // Auto-fetch ClinVar variants when gene bounds are available
    useEffect(() => {
        if (geneBounds && autoFetchClinvar) {
            void fetchClinvarVariants();
        }
    }, [geneBounds, autoFetchClinvar, fetchClinvarVariants]);

    const handleLoadSequence = useCallback(() => {
        const start = parseInt(startPosition);
        const end = parseInt(endPosition);

        let validationError: string | null = null;

        if (isNaN(start) || isNaN(end)) {
            validationError = "Please enter valid start and end positions.";
        } else if (start > end) {
            validationError = "Start position must be less than end position.";
        } else if (geneBounds) {
            const minBound = Math.min(geneBounds.min, geneBounds.max);
            const maxBound = Math.max(geneBounds.min, geneBounds.max);

            if (start < minBound) {
                validationError = `Start position (${start.toLocaleString()}) is below minimum bound (${minBound.toLocaleString()})`;
            } else if (end > maxBound) {
                validationError = `End position (${end.toLocaleString()}) is above maximum bound (${maxBound.toLocaleString()})`;
            }

            if (end - start > 10000) {
                validationError = "Selected range exceeds maximum view range of 10,000 bp";
            }
        }

        if (validationError) {
            handleError(new Error(validationError), "handleLoadSequence");
            return;
        }

        void fetchGeneSequence(start, end);
    }, [startPosition, endPosition, fetchGeneSequence, geneBounds, handleError]);

    return {
        // State
        geneDetails,
        geneBounds,
        geneSequence,
        actualRange,
        startPosition,
        endPosition,
        clinvarVariants,
        error,
        isLoading,
        isLoadingSequence,
        isLoadingClinvar,
        clinvarError,
        
        // Actions
        setStartPosition,
        setEndPosition,
        fetchGeneSequence,
        fetchClinvarVariants,
        updateClinvarVariant,
        handleLoadSequence,
    };
} 