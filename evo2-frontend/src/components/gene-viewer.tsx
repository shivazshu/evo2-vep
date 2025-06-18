"use client";

import { 
    fetchGeneDetails, 
    fetchGeneSequence as apiFetchGeneSequence,
    fetchClinvarVariants as apiFetchClinvarVariants,
    type GeneBounds, 
    type GeneDetailsFromSearch, 
    type GeneFromSearch, 
    type ClinvarVariants} from "~/utils/genome-api";
import { Button } from "./ui/button";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GeneInformation } from "./gene-information";
import { GeneSequence } from "./gene-sequence";
import KnownVaraints from "./known-variants";
import { VariantComparisonModal } from "./variant-comparison-modal";
import VariantAnalysis, { type VariantAnalysisHandle } from "./variant-analysis";

export default function GeneViewer({
    gene, 
    genomeId, 
    onClose} : {
        gene: GeneFromSearch; 
        genomeId: string;
        onClose: () => void;
    }) {
        const [geneSequence, setGeneSequence] = useState(""); 
        const [geneDetails, setGeneDetails] = useState<GeneDetailsFromSearch | null>(null);
        const [geneBounds, setGeneBounds] = useState<GeneBounds | null>(null);
        const [isLoading, setIsLoading] = useState(false);
        const [error, setError] = useState<string | null>(null); 
        const [startPosition, setStartPosition] = useState<string>("");
        const [endPosition, setEndPosition] = useState<string>("");
        const [isLoadingSequence, setIsLoadingSequence ] = useState(false);
        const [actualRange, setActualRange] = useState<{start : number, end : number} | null>(null)

        const [activeReferenceNucleotide, setActiveReferenceNucleotide] = useState<string | null>(null);
        const [activeSequencePosition, setActiveSequencePosition] = useState<number | null>(null);

        const [clinvarVariants, setClinvarVariants] = useState<ClinvarVariants[]>([]);
        const [isLoadingClinvar, setIsLoadingClinvar] = useState(false);
        const [clinvarError, setClinvarError] = useState<string | null>(null );

        const variantAnalysisRef = useRef<VariantAnalysisHandle>(null);


        const updateClinvarVariant = (clinvar_id: string, updateVariant: ClinvarVariants) => {
            setClinvarVariants((currentVariants) => currentVariants.map((v) => v.clinvar_id == clinvar_id ? updateVariant : v))
        }

        const [comparisonVariant, setComparisonVariant] = useState<ClinvarVariants | null>(null)
 

        
        const fetchGeneSequence = useCallback(async (start: number, end : number) => {
            try {
                setIsLoadingSequence(true);
                setError(null);
                
                const {sequence, actualRange: fetchedRange, error: apiError} = await apiFetchGeneSequence(gene.chrom, start, end, genomeId);

                setGeneSequence(sequence);
                setActualRange(fetchedRange);
                
                if (apiError) {
                    setError(apiError)
                } 
            } catch(err) {
                console.error(err);
                setError("Failed to load sequence data.")
            } finally {
                setIsLoadingSequence(false);
            }
        }, [gene.chrom, genomeId])

        useEffect(() => {
            const initializeGeneData = async () => {
                setIsLoading(true);
                setError(null);
                setGeneDetails(null); 

                if (!gene.gene_id) {
                    setError("Gene ID is missing, can't fetch details.");
                    setIsLoading(false);
                    return;
                }

                try { 
                    const {geneDetails: fetchedDetails, geneBounds: fetchedGeneBounds, initialRange: fetchedRange} = await fetchGeneDetails(gene.gene_id);
    
                    setGeneDetails(fetchedDetails);
                    setGeneBounds(fetchedGeneBounds);
    
                    if (fetchedRange) {
                        setStartPosition(String(fetchedRange.start))
                        setEndPosition(String(fetchedRange.end))
                        await fetchGeneSequence(fetchedRange.start, fetchedRange.end);
                    }
                } catch {
                    setError("Failed to load gene details. Please try again later.");
                } finally {
                    setIsLoading(false);
                }
            };
            void initializeGeneData();
        }, [gene, genomeId, fetchGeneSequence])

        const handleSequenceClick = useCallback((position: number, nucleotide: string) => {
            setActiveSequencePosition(position);
            setActiveReferenceNucleotide(nucleotide);
            window.scrollTo({top: 0, behavior: "smooth"});
            if (variantAnalysisRef.current) {
                variantAnalysisRef.current.focusAlternativeInput();
            }
        }, []);

        const handleLoadSequence = useCallback(() => {
            const start = parseInt(startPosition);
            const end = parseInt(endPosition);

            let validationError: string | null = null;

            if (isNaN(start) || isNaN(end)) {
                validationError = "Please enter valid start and end positions."
            } else if (start > end) {
                validationError = "Start position must be less than end position."
            } else if (geneBounds) {
                const minBound = Math.min(geneBounds.min, geneBounds.max);
                const maxBound = Math.max(geneBounds.min, geneBounds.max);

                if (start < minBound) {
                    validationError = `Start position (${start.toLocaleString()}) is below minimum bound (${minBound.toLocaleString()})`;
                } else if (end > maxBound) {
                    validationError = `End position (${end.toLocaleString()}) is above maximum bound (${maxBound.toLocaleString()})`;
                }

                if (end - start > 10000) {
                    validationError = "Selected range exceeds maximum view range of 10.0000 bp"
                }
            }

            if (validationError) {
                setError(validationError);
                return;
            }

            setError(null);
            void fetchGeneSequence(start, end);
        }, [startPosition, endPosition, fetchGeneSequence, geneBounds]);


    const fetchClinvarVariants = useCallback(async () => {
        if (!gene.chrom || !geneBounds) return;

        setIsLoadingClinvar(true);
        setClinvarError(null);

        try {
            const variants = await apiFetchClinvarVariants(
                gene.chrom,
                geneBounds,
                genomeId,
            );

            setClinvarVariants(variants);
            // console.log(variants);

        } catch(err) {
            console.error(err);
            setClinvarError("Error in fetching ClinVar Variants.");
            setClinvarVariants([]);
        } finally {
            setIsLoadingClinvar(false);
        }
    }, [gene.chrom, geneBounds, genomeId]);

    useEffect(() => {
        if (geneBounds) {
            void fetchClinvarVariants();
        }
    }, [geneBounds, fetchClinvarVariants]);

    const showComparison = (variant: ClinvarVariants) => {
        if (variant.evo2Result) {
            setComparisonVariant(variant);
        }
    }

    if (isLoading) {
        return (
        <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-foreground)]">

            </div>
        </div>
        )
    }


    return <div className="space-y-6">
        <Button 
        variant="ghost" 
        size="sm"  
        className="cursor-pointer text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/70"
        onClick={onClose}>
            <ArrowLeft className="mr-2 w-4 h-4"/>
            Back to results
        </Button>

        <VariantAnalysis 
        ref={variantAnalysisRef}
        gene={gene} 
        genomeId={genomeId} 
        chromosome={gene.chrom} 
        clinvarVariants={clinvarVariants} 
        referenceSequence={activeReferenceNucleotide} 
        sequencePosition={activeSequencePosition} 
        geneBounds={geneBounds}
        geneDetails={geneDetails}
         />

        <KnownVaraints 
        refreshVariants={fetchClinvarVariants} 
        showComparison={showComparison} 
        updateClivarVariant={updateClinvarVariant } 
        clinvarVariants={clinvarVariants}
        isLoadingClinvar={isLoadingClinvar} 
        clinvarError={clinvarError} 
        genomeId={genomeId} 
        gene={gene}
        />

        <GeneSequence 
        geneBounds={geneBounds} 
        geneDetails={geneDetails} 
        startPosition={startPosition} 
        endPosition={endPosition} 
        onStartPositionChange={setStartPosition}
        onEndPositionChange={setEndPosition}
        sequenceData={geneSequence}
        sequenceRange={actualRange }
        isLoading={isLoadingSequence}
        error={error}
        onSequenceLoadRequest={handleLoadSequence }
        onSequenceClick={handleSequenceClick}
        maxViewRange={10000}
        />
            
        <GeneInformation gene={gene} geneDetails={geneDetails} geneBounds={geneBounds}/>

        <VariantComparisonModal 
            comparisonVariant={comparisonVariant} 
            onClose={() => setComparisonVariant(null)}
        /> 

    </div>
}