"use client"

import { analyzeVariantWithAPI, type AnalysisResult, type ClinvarVariants, type GeneBounds, type GeneFromSearch, fetchGeneSequence, reverseComplement } from "../utils/redis-genome-api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, useCallback } from "react";
import { getClassificationColorClasses, getNucleotideColorClass } from "../utils/coloring-utils";
import { Button } from "./ui/button";
import { Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { type GeneDetailsFromSearch } from "../utils/redis-genome-api";

export interface VariantAnalysisHandle {
    focusAlternativeInput: () => void; 
}

interface VariantAnalysisProps {
    gene: GeneFromSearch;
    genomeId: string;
    chromosome: string;
    clinvarVariants: Array<ClinvarVariants>;
    referenceSequence: string | null;
    sequencePosition: number | null;  
    geneBounds: GeneBounds | null;
    geneDetails: GeneDetailsFromSearch | null;
}

const VariantAnalysis = forwardRef<VariantAnalysisHandle, VariantAnalysisProps>((props, ref) => {
    const {
        gene,
        genomeId,
        chromosome,
        clinvarVariants,
        referenceSequence,
        sequencePosition,
        geneBounds,
        geneDetails,
    } = props;
    const [variantPosition, setVariantPosition] = useState<string>(geneBounds?.min?.toString() ?? "" );
    const [variantReference, setVariantReference] = useState("");
    const [variantAlternative, setVariantAlternative] = useState("");
    const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [variantError, setVariantError] = useState<string | null>(null);
    const alternativeInputRef = useRef<HTMLInputElement>(null);
    const [sequenceAssertion, setSequenceAssertion] = useState<null | {
        fetchedNucleotide: string | undefined;
        clinvarReference: string;
        match: boolean;
        error?: string;
        position: number;
        isNegativeStrand?: boolean;
    }>(null);
    const [showAssertion, setShowAssertion] = useState(false);
    
    // Add new state for manual nucleotide verification
    const [manualNucleotideVerification, setManualNucleotideVerification] = useState<null | {
        fetchedNucleotide: string | undefined;
        position: number;
        error?: string;
        isNegativeStrand?: boolean;
        isLoading?: boolean;
    }>(null);
    const [showManualVerification, setShowManualVerification] = useState(false);
    
    // Add flag to track if user is actively editing the position field
    const [isUserEditingPosition, setIsUserEditingPosition] = useState(false);

    // Add state for wildcard analysis
    const [wildcardResults, setWildcardResults] = useState<Array<{
        reference: string;
        alternative: string;
        result: AnalysisResult | null;
        isLoading: boolean;
        error?: string;
        position: number;
        referenceNucleotide: string;
    }>>([]);
    const [isWildcardAnalyzing, setIsWildcardAnalyzing] = useState(false);

    // Add state for wildcard analysis history
    const [wildcardHistory, setWildcardHistory] = useState<Array<{
        position: number;
        reference: string;
        results: Array<{
            reference: string;
            alternative: string;
            result: AnalysisResult | null;
            error?: string;
        }>;
        timestamp: number;
    }>>([]);
    const [isWildcardHistoryOpen, setIsWildcardHistoryOpen] = useState(true);

    // Add state to track detected ClinVar variant for persistence
    const [detectedClinvarVariant, setDetectedClinvarVariant] = useState<ClinvarVariants | null>(null);

    useImperativeHandle(ref, () => ({
        focusAlternativeInput: () => {
            if (alternativeInputRef.current) {
                alternativeInputRef.current.focus();
            }
        }
    }));

    const handlePositionChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newPosition = e.target.value.trim().replace(/\s+/g, '');
        setVariantPosition(newPosition);
        setVariantReference("");
        setVariantError(null);
        setSequenceAssertion(null);
        setShowAssertion(false);
        setIsHistoryOpen(false);
        // Clear manual nucleotide verification when position changes
        setManualNucleotideVerification(null);
        setShowManualVerification(false);
        setIsUserEditingPosition(true); // Set flag to true when user edits position
        
        // Clear wildcard results when position changes to prevent confusion
        setWildcardResults([]);
    };

    const handleAlternativeChange = (e: ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.toUpperCase();
        setVariantAlternative(value);
        setVariantError(null);
        
        // Don't clear wildcard results when user changes input - let them persist
        // Only clear if user enters a different character (not *)
        if (value !== '*' && wildcardResults.length > 0) {
            // Keep the results but don't trigger new analysis
        }
        
        // Remove the automatic wildcard analysis trigger
        // if (value === '*') {
        //     void handleWildcardAnalysis();
        // }
    };

    // Add function to fetch nucleotide verification for any position
    const fetchNucleotideVerification = useCallback(async (position: number) => {
        if (!genomeId || !chromosome) return;

        setManualNucleotideVerification({
            fetchedNucleotide: undefined,
            position: position,
            isNegativeStrand: geneDetails?.genomicinfo?.[0]?.strand === '-',
            isLoading: true
        });

        try {
            const { sequence, error } = await fetchGeneSequence(
                chromosome,
                position,
                position,
                genomeId
            );

            if (error) {
                setManualNucleotideVerification(prev => ({
                    ...prev!,
                    error: error,
                    isLoading: false
                }));
            } else {
                // No reverse complement needed - UCSC returns genomic sequence
                // and we want to display it in genomic coordinates for user verification
                const isNegativeStrand = geneDetails?.genomicinfo?.[0]?.strand === '-';
                
                setManualNucleotideVerification(prev => ({
                    ...prev!,
                    fetchedNucleotide: sequence, // Use raw genomic sequence
                    isNegativeStrand,
                    isLoading: false
                }));
            }
        } catch (err) {
            console.error("Error fetching nucleotide verification:", err);
            setManualNucleotideVerification(prev => ({
                ...prev!,
                error: err instanceof Error ? err.message : "Unknown error",
                isLoading: false
            }));
        }
    }, [genomeId, chromosome, geneDetails, fetchGeneSequence]);

    // Add function to handle wildcard analysis for all possible nucleotides
    const handleWildcardAnalysis = useCallback(async () => {
        const position = parseInt(variantPosition?.replaceAll(",", "") ?? "");
        
        if (isNaN(position)) {
            setVariantError("Please enter a valid position number.");
            return;
        }

        if (!genomeId || !chromosome) {
            setVariantError("Missing genome or chromosome information.");
            return;
        }

        if (geneBounds) {
            if (position < geneBounds.min || position > geneBounds.max) {
                setVariantError(
                    `Position is outside the bounds of the gene (${geneBounds.min.toLocaleString()} - ${geneBounds.max.toLocaleString()}).`
                );
                return;
            }
        }

        // Get the reference nucleotide at this position
        const referenceNucleotide = manualNucleotideVerification?.fetchedNucleotide;
        if (!referenceNucleotide) {
            setVariantError("Please wait for the reference nucleotide to load, then try again.");
            return;
        }

        setIsWildcardAnalyzing(true);
        setVariantError(null);
        
        // Clear previous wildcard results
        setWildcardResults([]);
        
        // Get all possible nucleotides except the reference
        const allNucleotides = ['A', 'T', 'G', 'C'];
        const alternativeNucleotides = allNucleotides.filter(nuc => nuc !== referenceNucleotide);
        
        // Initialize results for the 3 possible variants (excluding reference)
        const initialResults = alternativeNucleotides.map(nuc => ({
            reference: referenceNucleotide,
            alternative: nuc,
            result: null,
            isLoading: true,
            error: undefined,
            position: position,
            referenceNucleotide: referenceNucleotide
        }));
        
        setWildcardResults(initialResults);

        // Analyze each variant (reference -> alternative)
        const isNegativeStrand = geneDetails?.genomicinfo?.[0]?.strand === '-';
        
        for (let i = 0; i < alternativeNucleotides.length; i++) {
            const alternative = alternativeNucleotides[i];
            
            if (!alternative) continue; // Skip undefined alternatives
            
            try {
                const finalAlternative = isNegativeStrand
                    ? reverseComplement(alternative)
                    : alternative;

                const data = await analyzeVariantWithAPI({
                    position,
                    alternative: finalAlternative,
                    genomeId: genomeId || '',
                    chromosome: chromosome || '',
                    strand: geneDetails?.genomicinfo?.[0]?.strand ?? "+",
                });

                setWildcardResults(prev => prev.map((item, index) => 
                    index === i 
                        ? { ...item, result: data, isLoading: false }
                        : item
                ));

            } catch (err) {
                console.error(`Error analyzing ${referenceNucleotide}->${alternative}:`, err);
                setWildcardResults(prev => prev.map((item, index) => 
                    index === i 
                        ? { ...item, error: "Analysis failed", isLoading: false }
                        : item
                ));
            }
        }

        setIsWildcardAnalyzing(false);
    }, [variantPosition, geneBounds, manualNucleotideVerification, genomeId, chromosome, geneDetails, analyzeVariantWithAPI, reverseComplement]);

    // Add function to save current wildcard results to history
    const saveWildcardToHistory = useCallback(() => {
        if (wildcardResults.length === 0) return;
        
        const position = wildcardResults[0]?.position;
        const reference = wildcardResults[0]?.referenceNucleotide;
        
        if (!position || !reference) return;
        
        // Check if we already have an entry for this position and reference
        const existingEntryIndex = wildcardHistory.findIndex(entry => 
            entry.position === position && entry.reference === reference
        );
        
        if (existingEntryIndex !== -1) {
            // Update existing entry
            setWildcardHistory(prev => prev.map((entry, index) => 
                index === existingEntryIndex
                                ? {
                                    ...entry,
                        results: wildcardResults.map(item => ({
                            reference: item.reference,
                            alternative: item.alternative,
                            result: item.result,
                            error: item.error
                        })),
                        timestamp: Date.now()
                                }
                                : entry
            ));
                    } else {
            // Add new entry
            setWildcardHistory(prev => [{
                            position,
                reference,
                results: wildcardResults.map(item => ({
                    reference: item.reference,
                    alternative: item.alternative,
                    result: item.result,
                    error: item.error
                })),
                            timestamp: Date.now()
            }, ...prev].slice(0, 3));
        }
        
        // Clear current results after saving to prevent duplication
        setWildcardResults([]);
    }, [wildcardResults, wildcardHistory]);

    // Add function to clear current wildcard results
    const clearWildcardResults = useCallback(() => {
        setWildcardResults([]);
    }, []);

    useEffect(() => {
        if (sequencePosition && referenceSequence && !isUserEditingPosition) {
            setVariantPosition(String(sequencePosition));
            setVariantReference(referenceSequence);
        }
    }, [sequencePosition, referenceSequence, isUserEditingPosition]);
    
    // Add useEffect to handle initial setup when component mounts
    useEffect(() => {
        if (geneBounds?.min && !variantPosition) {
            const initialPosition = geneBounds.min.toString();
            setVariantPosition(initialPosition);
            
            // Automatically fetch nucleotide for initial position
            const position = parseInt(initialPosition);
            if (!isNaN(position) && position > 0) {
                void fetchNucleotideVerification(position);
                
                // Check if there's a matching ClinVar variant for initial position
                const matchingVariant = clinvarVariants.find(variant => {
                    const variantPos = parseInt(variant.location.replaceAll(",", ""));
                    return variantPos === position;
                });
                
                if (matchingVariant) {
                    // Extract reference and alternative from ClinVar variant
                    const refAltMatch = /:c\.([^>]+)>([ATGC])(?:\s*\(.*\))?$/.exec(matchingVariant.title);
                    if (refAltMatch?.[1] && refAltMatch?.[2]) {
                        // Try to extract reference from the first group
                        const referenceMatch = /([ATGC])$/.exec(refAltMatch[1]);
                        if (referenceMatch?.[1]) {
                            setVariantReference(referenceMatch[1]);
                        }
                        
                        // For negative strand genes, convert transcript coordinates to genomic coordinates
                        const isNegativeStrand = geneDetails?.genomicinfo?.[0]?.strand === '-';
                        const clinvarAlternative = refAltMatch[2];
                        const genomicAlternative = isNegativeStrand 
                            ? reverseComplement(clinvarAlternative)
                            : clinvarAlternative;
                        
                        // Don't auto-fill the alternative field - let user decide
                        // setVariantAlternative(genomicAlternative);
                    }
                }
            }
        }
    }, [geneBounds, clinvarVariants, fetchNucleotideVerification, variantPosition]);

    // Add useEffect to automatically fetch nucleotide and set up variant format when position is valid
    useEffect(() => {
        if (variantPosition?.trim() && !isUserEditingPosition) {
            const position = parseInt(variantPosition.trim().replace(/\s+/g, '').replaceAll(",", ""));
            if (!isNaN(position) && position > 0) {
                // Automatically fetch nucleotide for the current position
                void fetchNucleotideVerification(position);
                
                // Check if there's a matching ClinVar variant to set up the format
                const matchingVariant = clinvarVariants.find(variant => {
                    const variantPos = parseInt(variant.location.replaceAll(",", ""));
                    return variantPos === position;
                });
                
                if (matchingVariant) {
                    // Extract reference and alternative from ClinVar variant
                    const refAltMatch = /:c\.([^>]+)>([ATGC])(?:\s*\(.*\))?$/.exec(matchingVariant.title);
                    if (refAltMatch?.[1] && refAltMatch?.[2]) {
                        // Try to extract reference from the first group
                        const referenceMatch = /([ATGC])$/.exec(refAltMatch[1]);
                        if (referenceMatch?.[1]) {
                            setVariantReference(referenceMatch[1]);
                        }
                        
                        // For negative strand genes, convert transcript coordinates to genomic coordinates
                        const isNegativeStrand = geneDetails?.genomicinfo?.[0]?.strand === '-';
                        const clinvarAlternative = refAltMatch[2];
                        const genomicAlternative = isNegativeStrand 
                            ? reverseComplement(clinvarAlternative)
                            : clinvarAlternative;
                        
                        // Don't auto-fill the alternative field - let user decide
                        // setVariantAlternative(genomicAlternative);
                    }
                }
            }
        }
    }, [variantPosition, clinvarVariants, fetchNucleotideVerification, isUserEditingPosition]);

    // Add useEffect to trigger nucleotide verification when position changes
    useEffect(() => {
        if (variantPosition?.trim()) {
            const position = parseInt(variantPosition.trim().replace(/\s+/g, '').replaceAll(",", ""));
            if (!isNaN(position) && position > 0) {
                // Clear previous verification and fetch new one immediately
                setManualNucleotideVerification(null);
                setShowManualVerification(false);
                void fetchNucleotideVerification(position);
            }
        }
    }, [variantPosition, fetchNucleotideVerification]);

    const handleVariantSubmit = async (pos: string, alt: string, ref?: string) => {
        const position = parseInt(pos?.replaceAll(",", "") ?? "");

        if (isNaN(position)) {
            setVariantError("Please enter a valid position number.");
            return;
        }

        if (geneBounds) {
            if (position < geneBounds.min || position > geneBounds.max) {
                setVariantError(
                    `Position is outside the bounds of the gene (${geneBounds.min.toLocaleString()} - ${geneBounds.max.toLocaleString()}).`
                );
                return;
            }
        }

        const validNucleotide = /^[ATGC]$/;

        if (!validNucleotide.test(alt)) {
            setVariantError("Entered nucleotide must be A, T, G or C.");
            return;
        }

        // Use the fetched reference nucleotide from UCSC instead of ClinVar data
        const referenceNucleotide = manualNucleotideVerification?.fetchedNucleotide;
        if (!referenceNucleotide) {
            setVariantError("Please wait for the reference nucleotide to load, then try again.");
            return;
        }

        // Validate that the reference nucleotide is valid
        if (!validNucleotide.test(referenceNucleotide)) {
            setVariantError("Invalid reference nucleotide fetched from UCSC.");
            return;
        }

        let alternativeNucleotide = alt;

        // Only use ClinVar data if it matches the fetched reference nucleotide
        const matchingVariant = clinvarVariants.find(variant => {
            const variantPos = parseInt(variant.location.replaceAll(",", ""));
            return variantPos === position;
        });

        if (matchingVariant) {
            const refAltMatch = /:c\.[\d-]+(\w)>(\w)$/.exec(matchingVariant.title);
            if (refAltMatch?.[1] && refAltMatch?.[2]) {
                const clinvarReference = refAltMatch[1];
                const clinvarAlternative = refAltMatch[2];
                
                // Only use ClinVar alternative if the reference matches
                if (clinvarReference === referenceNucleotide) {
                    alternativeNucleotide = clinvarAlternative;
                }
            }
        }

        if (!validNucleotide.test(alternativeNucleotide)) {
            setVariantError("Invalid alternative nucleotide.");
            return;
        }
        
        const isNegativeStrand = geneDetails?.genomicinfo?.[0]?.strand === '-';
        const finalAlternative = isNegativeStrand
            ? reverseComplement(alternativeNucleotide)
            : alternativeNucleotide;

        setIsAnalyzing(true);
        setVariantError(null);

        try {
            const data = await analyzeVariantWithAPI({
                position,
                alternative: finalAlternative,
                genomeId: genomeId || '',
                chromosome: chromosome || '',
                strand: geneDetails?.genomicinfo?.[0]?.strand ?? "+",
            });

            setAnalysisHistory(prev => [data, ...prev].slice(0, 3));
            setIsHistoryOpen(true);
        } catch(err) {
            console.error(err);
            setVariantError("Failed to analyze entered variant.")
        } finally {
            setIsAnalyzing(false);
        }
    };

    useEffect(() => {
        // Only run if a known variant is detected
        const matchingVariant = clinvarVariants.find(variant => {
            const variantPos = parseInt(variant.location.replaceAll(",", ""));
            const currentPos = parseInt(variantPosition?.replaceAll(",", "") ?? "");
            
            return variantPos === currentPos;
        });

        if (!matchingVariant) {
            // Don't clear assertion state immediately - only clear if position actually changes
            if (sequenceAssertion && sequenceAssertion.position !== parseInt(variantPosition?.replaceAll(",", "") ?? "0")) {
                setShowAssertion(false);
                setSequenceAssertion(null);
            }
            return;
        }

        const refAltMatch = /:c\.([^>]+)>([ATGC])(?:\s*\(.*\))?$/.exec(matchingVariant.title);
        
        if (!refAltMatch?.[1] || !refAltMatch?.[2]) {
            // Don't clear assertion state immediately - only clear if position actually changes
            if (sequenceAssertion && sequenceAssertion.position !== parseInt(variantPosition?.replaceAll(",", "") ?? "0")) {
                setShowAssertion(false);
                setSequenceAssertion(null);
            }
            return;
        }

        // Extract reference and alternative - handle different formats
        let clinvarReference: string = refAltMatch[2] || 'N'; // Alternative is always the second group
        const clinvarAlternative = refAltMatch[2] || 'N'; // Default to same as alternative
        
        // Try to extract reference from the first group
        const referenceMatch = /([ATGC])$/.exec(refAltMatch[1] ?? '');
        if (referenceMatch?.[1]) {
            clinvarReference = referenceMatch[1];
        }

        const actualPosition = parseInt(matchingVariant.location.replaceAll(",", ""));
        const expectedGenome = genomeId;
        const expectedChromosome = chromosome;
        if (!expectedGenome || !expectedChromosome) {
            console.error("Missing genome or chromosome for assertion", { expectedGenome, expectedChromosome });
            return;
        }

        // Only clear previous assertion when position actually changes
        if (sequenceAssertion?.position !== actualPosition) {
            setSequenceAssertion(null);
            setShowAssertion(false);
        }

        // Only fetch if we have a matching variant and haven't fetched for this position yet
        if (sequenceAssertion?.position === actualPosition && sequenceAssertion?.fetchedNucleotide) {
            return;
        }

        setSequenceAssertion({
            fetchedNucleotide: undefined,
            clinvarReference: clinvarReference,
            match: false,
            position: actualPosition
        });

        void fetchGeneSequence(
            expectedChromosome,
            actualPosition,
            actualPosition,
            expectedGenome
        ).then(({ sequence, error }) => {
            if (error) {
                setSequenceAssertion(prev => ({
                    fetchedNucleotide: "",
                    clinvarReference: clinvarReference,
                    match: false,
                    error: error,
                    position: actualPosition
                }));
            } else {
                // For ClinVar assertion, we need to handle strand orientation correctly
                // ClinVar stores variants in transcript coordinates, UCSC returns genomic coordinates
                const reverseComplement = (seq: string) => {
                    const complement: Record<string, string> = {
                        'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G'
                    };
                    return seq.split('').map(base => complement[base] ?? base).join('');
                };
                
                const clinvarGeneMatch = /^([^(]+)\(([^)]+)\)/.exec(matchingVariant.title);
                const clinvarGeneId = clinvarGeneMatch?.[1] ?? '';
                const clinvarGeneSymbol = clinvarGeneMatch?.[2] ?? '';
                const isNegativeStrand = geneDetails?.genomicinfo?.[0]?.strand === '-';
                
                // For negative strand genes: reverse complement UCSC sequence to match ClinVar transcript reference
                // For positive strand genes: use UCSC sequence as-is (both are in same coordinate system)
                const finalSequence = isNegativeStrand ? reverseComplement(sequence) : sequence;
                const finalClinvarReference = clinvarReference;
                const isIntronicRecombination = gene?.name?.toLowerCase().includes('biological-region');
                
                setSequenceAssertion(prev => ({
                    fetchedNucleotide: finalSequence,
                    clinvarReference: finalClinvarReference,
                    match: finalSequence === finalClinvarReference,
                    position: actualPosition,
                    isNegativeStrand
                }));
                
                // Show the assertion when sequence is successfully fetched
                setShowAssertion(true);
            }
        }).catch(err => {
            console.error("Error fetching sequence:", err);
            setSequenceAssertion(prev => ({
                fetchedNucleotide: "",
                clinvarReference: clinvarReference,
                match: false,
                error: err instanceof Error ? err.message : "Unknown error",
                position: actualPosition
            }));
        });
    }, [clinvarVariants, variantPosition, genomeId, chromosome, geneDetails, gene, sequenceAssertion?.clinvarReference, sequenceAssertion?.position]);

    // Add useEffect to detect and store ClinVar variants for persistence
    useEffect(() => {
        if (!variantPosition) return;
        
        const currentPosition = parseInt(variantPosition.replaceAll(",", ""));
        if (isNaN(currentPosition)) return;
        
        const matchingVariant = clinvarVariants.find(variant => 
            variant?.variation_type?.toLowerCase().includes("single nucleotide variant") && 
            parseInt(variant?.location?.replaceAll(",", "")) === currentPosition
        );
        
        if (matchingVariant) {
            setDetectedClinvarVariant(matchingVariant);
        } else {
            // Only clear if position actually changed
            if (detectedClinvarVariant && parseInt(detectedClinvarVariant.location.replaceAll(",", "")) !== currentPosition) {
                setDetectedClinvarVariant(null);
            }
        }
    }, [clinvarVariants, variantPosition, detectedClinvarVariant]);

    useEffect(() => {
        // Only run if a known variant is detected
        const matchingVariant = clinvarVariants.find(variant => {
            const variantPos = parseInt(variant.location.replaceAll(",", ""));
            const currentPos = parseInt(variantPosition?.replaceAll(",", "") ?? "");
            
            return variantPos === currentPos;
        });

        if (!matchingVariant) {
            // Don't clear assertion state immediately - only clear if position actually changes
            if (sequenceAssertion && sequenceAssertion.position !== parseInt(variantPosition?.replaceAll(",", "") ?? "0")) {
                setShowAssertion(false);
                setSequenceAssertion(null);
            }
            return;
        }

        const refAltMatch = /:c\.([^>]+)>([ATGC])(?:\s*\(.*\))?$/.exec(matchingVariant.title);
        
        if (!refAltMatch?.[1] || !refAltMatch?.[2]) {
            // Don't clear assertion state immediately - only clear if position actually changes
            if (sequenceAssertion && sequenceAssertion.position !== parseInt(variantPosition?.replaceAll(",", "") ?? "0")) {
                setShowAssertion(false);
                setSequenceAssertion(null);
            }
            return;
        }

        // Extract reference and alternative - handle different formats
        let clinvarReference: string = refAltMatch[2] || 'N'; // Alternative is always the second group
        const clinvarAlternative = refAltMatch[2] || 'N'; // Default to same as alternative
        
        // Try to extract reference from the first group
        const referenceMatch = /([ATGC])$/.exec(refAltMatch[1] ?? '');
        if (referenceMatch?.[1]) {
            clinvarReference = referenceMatch[1];
        }

        const actualPosition = parseInt(matchingVariant.location.replaceAll(",", ""));
        const expectedGenome = genomeId;
        const expectedChromosome = chromosome;
        if (!expectedGenome || !expectedChromosome) {
            console.error("Missing genome or chromosome for assertion", { expectedGenome, expectedChromosome });
            return;
        }

        // Only clear previous assertion when position actually changes
        if (sequenceAssertion?.position !== actualPosition) {
            setSequenceAssertion(null);
            setShowAssertion(false);
        }

        // Only fetch if we have a matching variant and haven't fetched for this position yet
        if (sequenceAssertion?.position === actualPosition && sequenceAssertion?.fetchedNucleotide) {
            return;
        }

        setSequenceAssertion({
            fetchedNucleotide: undefined,
            clinvarReference: clinvarReference,
            match: false,
            position: actualPosition
        });

        void fetchGeneSequence(
            expectedChromosome,
            actualPosition,
            actualPosition,
            expectedGenome
        ).then(({ sequence, error }) => {
            if (error) {
                setSequenceAssertion(prev => ({
                    fetchedNucleotide: "",
                    clinvarReference: clinvarReference,
                    match: false,
                    error: error,
                    position: actualPosition
                }));
            } else {
                // For ClinVar assertion, we need to handle strand orientation correctly
                // ClinVar stores variants in transcript coordinates, UCSC returns genomic coordinates
                const reverseComplement = (seq: string) => {
                    const complement: Record<string, string> = {
                        'A': 'T', 'T': 'A', 'G': 'C', 'C': 'G'
                    };
                    return seq.split('').map(base => complement[base] ?? base).join('');
                };
                
                const clinvarGeneMatch = /^([^(]+)\(([^)]+)\)/.exec(matchingVariant.title);
                const clinvarGeneId = clinvarGeneMatch?.[1] ?? '';
                const clinvarGeneSymbol = clinvarGeneMatch?.[2] ?? '';
                const isNegativeStrand = geneDetails?.genomicinfo?.[0]?.strand === '-';
                
                // For negative strand genes: reverse complement UCSC sequence to match ClinVar transcript reference
                // For positive strand genes: use UCSC sequence as-is (both are in same coordinate system)
                const finalSequence = isNegativeStrand ? reverseComplement(sequence) : sequence;
                const finalClinvarReference = clinvarReference;
                const isIntronicRecombination = gene?.name?.toLowerCase().includes('biological-region');
                
                setSequenceAssertion(prev => ({
                    fetchedNucleotide: finalSequence,
                    clinvarReference: finalClinvarReference,
                    match: finalSequence === finalClinvarReference,
                    position: actualPosition,
                    isNegativeStrand
                }));
                
                // Show the assertion when sequence is successfully fetched
                setShowAssertion(true);
            }
        }).catch(err => {
            console.error("Error fetching sequence:", err);
            setSequenceAssertion(prev => ({
                fetchedNucleotide: "",
                clinvarReference: clinvarReference,
                match: false,
                error: err instanceof Error ? err.message : "Unknown error",
                position: actualPosition
            }));
        });
    }, [clinvarVariants, variantPosition, genomeId, chromosome, geneDetails, gene, sequenceAssertion?.clinvarReference, sequenceAssertion?.position]);

    // Add useEffect to auto-save wildcard results when analysis completes
    useEffect(() => {
        // Auto-save wildcard results when analysis completes (not analyzing and have results)
        if (!isWildcardAnalyzing && wildcardResults.length > 0 && wildcardResults.every(item => !item.isLoading)) {
            // Small delay to ensure all results are processed
            const timer = setTimeout(() => {
                saveWildcardToHistory();
            }, 500);
            
            return () => clearTimeout(timer);
        }
    }, [isWildcardAnalyzing, wildcardResults, saveWildcardToHistory]);

    return (
        <Card className="gap-0 border-none bg-[var(--color-card)] py-0 shadow-sm">
            <CardHeader className="pt-4 pb-2">
                <CardTitle className="flex items-center text-sm font-normal text-[var(--color-foreground)]/70">
                    <Zap className="mr-2 h-4 w-4" />
                    Variant Analysis
                </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
                <p className="mb-4 text-xs text-[var(--color-foreground)]/80">
                    Predict the functional impact or pathogenicity of a single nucleotide variant (SNV) using
                    <a
                        href="https://github.com/ArcInstitute/evo2"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-link)] underline cursor-pointer ml-1"
                        aria-label="Learn more about Evo2 deep learning model (opens in new tab)"
                    >
                        Evo2<span className="ml-0.5 align-baseline" style={{ fontSize: "0.85em" }}>↗</span>
                    </a>
                    , <span className="italic">deep learning model</span>.
                </p>

                <div className="flex flex-col sm:flex-row sm:items-end sm:gap-2">
                    <div className="flex-1 space-y-1 sm:flex-grow-0 sm:basis-48">
                        <label className="mb-2 text-xs font-medium text-[var(--color-foreground)]">Position</label>
                        <Input
                            type="text"
                            value={variantPosition}
                            onChange={handlePositionChange}
                            onBlur={() => setIsUserEditingPosition(false)}
                            className="h-9 w-full"
                            placeholder="Enter position"
                        />
                    </div>
                    
                    <div className="mt-4 flex-1 sm:mt-0 sm:flex-grow-0 sm:basis-48">
                        <label className="mb-2 block text-xs font-medium text-[var(--color-foreground)]">Alternative (variant)</label>
                        <Input
                            ref={alternativeInputRef}
                            type="text"
                            value={variantAlternative}
                            onChange={handleAlternativeChange}
                            className="h-9 w-full"
                            placeholder="e.g., A, T, G, C, or * for all"
                            maxLength={1}
                        />
                        {manualNucleotideVerification?.fetchedNucleotide && (() => {
                            // Check if there's a matching ClinVar variant to determine coordinate system
                            const position = parseInt(variantPosition?.replaceAll(",", "") ?? "");
                            const matchingVariant = clinvarVariants.find(variant => {
                                const variantPos = parseInt(variant.location.replaceAll(",", ""));
                                return variantPos === position;
                            });
                            
                            // If there's a matching ClinVar variant, the user input is likely in transcript coordinates
                            // For negative strand genes, we need to convert transcript to genomic
                            let displayAlternative = variantAlternative || "?";
                            let coordinateLabel = "";
                            
                            if (matchingVariant && manualNucleotideVerification.isNegativeStrand && variantAlternative) {
                                // User input is likely transcript coordinates, convert to genomic
                                displayAlternative = reverseComplement(variantAlternative);
                                coordinateLabel = "(genomic)";
                            } else if (manualNucleotideVerification.isNegativeStrand) {
                                // No matching ClinVar variant, assume user input is genomic
                                coordinateLabel = "(genomic)";
                            }
                            
                            return (
                                <div className="sm:hidden mt-3 flex items-center gap-2 text-xs text-[var(--color-foreground)]/70">
                                    <span>Substitution:</span>
                                    <span className={`font-mono ${getNucleotideColorClass(manualNucleotideVerification.fetchedNucleotide)}`}>
                                        {manualNucleotideVerification.fetchedNucleotide}
                                    </span>
                                    <span>→</span>
                                    <span className={`font-mono ${variantAlternative ? getNucleotideColorClass(displayAlternative) : 'text-[var(--color-foreground)]/50'}`}>
                                        {displayAlternative}
                                    </span>
                                    {coordinateLabel && (
                                        <span className="text-xs text-[var(--color-foreground)]/50">
                                            {coordinateLabel}
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
                        {manualNucleotideVerification?.isLoading && (
                            <div className="sm:hidden mt-3 flex items-center gap-2 text-xs text-[var(--color-foreground)]/70">
                                <span>Substitution:</span>
                                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                                <span>→</span>
                                <span className="text-[var(--color-foreground)]/50">?</span>
                            </div>
                        )}
                    </div>
                    {manualNucleotideVerification?.fetchedNucleotide && (() => {
                        // Check if there's a matching ClinVar variant to determine coordinate system
                        const position = parseInt(variantPosition?.replaceAll(",", "") ?? "");
                        const matchingVariant = clinvarVariants.find(variant => {
                            const variantPos = parseInt(variant.location.replaceAll(",", ""));
                            return variantPos === position;
                        });
                        
                        // If there's a matching ClinVar variant, the user input is likely in transcript coordinates
                        // For negative strand genes, we need to convert transcript to genomic
                        let displayAlternative = variantAlternative || "?";
                        let coordinateLabel = "";
                        
                        if (matchingVariant && manualNucleotideVerification.isNegativeStrand && variantAlternative) {
                            // User input is likely transcript coordinates, convert to genomic
                            displayAlternative = reverseComplement(variantAlternative);
                            coordinateLabel = "(genomic)";
                        } else if (manualNucleotideVerification.isNegativeStrand) {
                            // No matching ClinVar variant, assume user input is genomic
                            coordinateLabel = "(genomic)";
                        }
                        
                        return (
                            <div className="hidden sm:flex h-9 items-center gap-2 ml-2 mr-2 text-xs text-[var(--color-foreground)]/70">
                                <span>Substitution:</span>
                                <span className={`font-mono ${getNucleotideColorClass(manualNucleotideVerification.fetchedNucleotide)}`}>
                                    {manualNucleotideVerification.fetchedNucleotide}
                                </span>
                                <span>→</span>
                                <span className={`font-mono ${variantAlternative ? getNucleotideColorClass(displayAlternative) : 'text-[var(--color-foreground)]/50'}`}>
                                    {displayAlternative}
                                </span>
                                {coordinateLabel && (
                                    <span className="text-xs text-[var(--color-foreground)]/50">
                                        {coordinateLabel}
                                    </span>
                                )}
                            </div>
                        );
                    })()}
                    {manualNucleotideVerification?.isLoading && (
                        <div className="hidden sm:flex h-9 items-center gap-2 ml-2 mr-2 text-xs text-[var(--color-foreground)]/70">
                            <span>Substitution:</span>
                            <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                            <span>→</span>
                            <span className="text-[var(--color-foreground)]/50">?</span>
                        </div>
                    )}
                    
                    {/* Centered Nucleotide Display - Removed duplicate */}
                    
                    <Button
                        disabled={isAnalyzing || isWildcardAnalyzing || !variantPosition || !variantAlternative}
                        className="mt-4 h-9 cursor-pointer sm:mt-0 sm:self-end bg-[var(--color-foreground)] text-[var(--color-card)] hover:bg-[var(--color-foreground)]/90 text-xs"
                        onClick={async () => {
                            if (variantAlternative === '*') {
                                await handleWildcardAnalysis();
                            } else {
                                await handleVariantSubmit(variantPosition.replace(",", ""), variantAlternative);
                            }
                        }}
                    >
                        {isAnalyzing || isWildcardAnalyzing ? (
                            <><span className="h-3 w-3 mr-2  inline-block animate-spin rounded-full border-2 border-white border-t-transparent align-middle"></span>Analyzing...</>
                        ) : variantAlternative === '*' ? (
                            "Analyze All Variants"
                        ) : (
                            "Analyze Variant"
                        )}
                    </Button>
                </div>

                {variantError && (
                    <div className="mt-2 text-xs text-[var(--color-warning)]">
                        {variantError}
                    </div>
                )}



                {detectedClinvarVariant && (() => {
                    const matchedVariant = detectedClinvarVariant;
                    const refAltMatch = /(\w)>(\w)/.exec(matchedVariant.title);
                    
                    let ref = null;
                    let alt = null;

                    if (refAltMatch && refAltMatch.length == 3) {
                        ref = refAltMatch[1];
                        alt = refAltMatch[2]; 
                    }
                    
                    if (!ref || !alt) return null;
                    return (
                        <div 
                        key={matchedVariant.clinvar_id}
                        className="mt-4 rounded border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4"
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <h4 className="text-sm font-medium text-[var(--color-foreground)]">Known Variant Detected</h4>
                                <div className="text-xs text-[var(--color-foreground)]/80">
                                    Position: {matchedVariant.location}
                                </div>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2 ">
                                <div>
                                    <div className="mb-1 text-xs font-medium text-[var(--color-foreground)]">
                                        Variant Details:
                                    </div>
                                    <div className="text-sm">{matchedVariant.title}</div>
                                    <div className="mt-2 text-sm">
                                        {gene?.symbol} {variantPosition}{" "} 
                                        <span className="font-mono">
                                            <span className={`${getNucleotideColorClass(ref)}`}>
                                                {ref}
                                            </span>
                                            <span>
                                                {">"}
                                            </span>
                                            <span className={`${getNucleotideColorClass(alt)}`}>
                                                {alt}
                                            </span>
                                        </span>
                                    </div>
                                    <div className="mt-4 text-xs text-[var(--color-foreground)]/70">
                                        ClinVar Classification:
                                        <span 
                                        className={`ml-2 rounded-sm px-2 py-0.5 ${getClassificationColorClasses(matchedVariant.classification)}`}
                                        >
                                            {matchedVariant.classification || "Unknown"}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-end">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isAnalyzing}
                                    className="h-7 cursor-pointer bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80"
                                    onClick={async () => {
                                        setVariantAlternative(alt);
                                        await handleVariantSubmit(variantPosition.replace(",", ""), alt, ref);
                                    }}
                                    >
                                        {isAnalyzing ? (
                                            <><span className="h-3 w-3 mr-1 inline-block animate-spin rounded-full border-2 border-[var(--color-border)] border-t-transparent align-middle"></span>Analyzing...</>
                                        ) : (
                                            <>
                                            <Zap className="mr-1 inline-block h-3 w-3"/>
                                            Analyze this Variant
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                            {/* Collapsible for sequence assertion */}
                            {sequenceAssertion && (
                            <Collapsible open={showAssertion} onOpenChange={setShowAssertion}>
                                <CollapsibleTrigger asChild>
                                    <button 
                                        type="button" 
                                        className="mt-4 text-xs underline text-[var(--color-link)] cursor-pointer"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {showAssertion ? "Hide" : "Show"} Reference Nucleotide Assertion
                                    </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="mt-2 p-2 rounded bg-[var(--color-muted)] text-xs">
                                        {sequenceAssertion === null && <span>Loading reference nucleotide from UCSC...</span>}
                                        {sequenceAssertion?.error && <span className="text-[var(--color-warning)]">Error: {sequenceAssertion.error}</span>}
                                        {sequenceAssertion && !sequenceAssertion.error && sequenceAssertion.fetchedNucleotide && (
                                            <>
                                                <div className="mb-2">
                                                    <span className="font-medium">ClinVar Gene:</span> {matchedVariant?.title?.split(':')?.[0]?.split('(')?.[1]?.replace(')', '')} ({matchedVariant?.title?.split(':')?.[0]})
                                                </div>
                                                <div className="mb-2">
                                                    <span className="font-medium">UCSC Region:</span> {gene?.symbol}{" "}
                                                    {gene?.name && (
                                                        <span className="text-[var(--color-foreground)]/70">
                                                            ({gene.name})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mb-2">
                                                    <span className="font-medium">Chromosome:</span> {chromosome}
                                                </div>
                                                <div className="mb-2">
                                                    <span className="font-medium">Position:</span> {sequenceAssertion.position.toLocaleString()}
                                                </div>
                                                <div className="mb-2">
                                                    <span className="font-medium">Fetched nucleotide from UCSC:</span> <span className={`font-mono ${getNucleotideColorClass(sequenceAssertion.fetchedNucleotide)}`}>{sequenceAssertion.fetchedNucleotide}</span>
                                                    <span className="ml-1 text-xs text-[var(--color-foreground)]/70">
                                                        {sequenceAssertion.isNegativeStrand ? 
                                                            "(transcript orientation)" : 
                                                            "(genomic sequence)"
                                                        }
                                                    </span>
                                                </div>
                                                <div className="mb-2">
                                                    <span className="font-medium">ClinVar reference nucleotide:</span> <span className={`font-mono ${getNucleotideColorClass(sequenceAssertion.clinvarReference)} `}>{sequenceAssertion.clinvarReference}</span>
                                                    <span className="ml-1 text-xs text-[var(--color-foreground)]/70">
                                                        (transcript reference)
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="font-medium">Assertion:</span> {sequenceAssertion.match ? (
                                                        <span className="text-[var(--color-success)] font-semibold">MATCH</span>
                                                    ) : (
                                                        <span className="text-[var(--color-warning)] font-semibold">MISMATCH</span>
                                                    )}
                                                    {!sequenceAssertion.match && (
                                                        <span className="ml-2 text-xs text-[var(--color-foreground)]/70">
                                                            (Note: Reference sequence mismatch detected)
                                                        </span>
                                                    )}
                                                </div>
                                                {sequenceAssertion.isNegativeStrand && (
                                                    <div className="mt-2 text-xs text-[var(--color-foreground)]/70">
                                                        * For negative strand genes, ClinVar stores variants in transcript coordinates (e.g., c.1753G{'>'}T). 
                                                        The UCSC sequence is reverse complemented to match the transcript orientation for proper validation.
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {sequenceAssertion && !sequenceAssertion.error && !sequenceAssertion.fetchedNucleotide && (
                                            <span>Loading reference nucleotide from UCSC...</span>
                                        )}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                            )}
                        </div>
                    );
                })()}

                {/* Wildcard Analysis Results */}
                {(wildcardResults.length > 0 || wildcardHistory.length > 0) && (
                    <Collapsible
                        open={isWildcardHistoryOpen}
                        onOpenChange={setIsWildcardHistoryOpen}
                        className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/20 transition-all duration-200"
                    >
                        <CollapsibleTrigger asChild>
                            <div className="flex cursor-pointer items-center justify-between p-3 hover:bg-[var(--color-muted)]/30 transition-colors rounded-t-md">
                                <h4 className="text-sm font-medium text-[var(--color-foreground)]">
                                    {isWildcardHistoryOpen ? "Hide" : "Show"} Wildcard Analysis History ({wildcardHistory.length} most recent)
                                </h4>
                                {isWildcardHistoryOpen ? (
                                    <ChevronUp className="h-4 w-4 transition-transform duration-200 text-[var(--color-foreground)]/60" />
                                ) : (
                                    <ChevronDown className="h-4 w-4 transition-transform duration-200 text-[var(--color-foreground)]/60" />
                                )}
                                        </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                            <div className="max-h-96 overflow-y-auto">
                            {/* Wildcard Analysis History */}
                                {wildcardHistory.map((historyItem, index) => {
                                    // Check if this is a known ClinVar variant
                                    const knownVariant = clinvarVariants.find(variant => {
                                        const variantPos = parseInt(variant.location.replaceAll(",", ""));
                                        return variantPos === historyItem.position;
                                    });
                                    
                                    return (
                                <div
                                    key={`${historyItem.position}-${historyItem.timestamp}`}
                                    className={`border-t border-[var(--color-border)] p-4 ${
                                                index === 0
                                            ? 'border-l-4 border-l-[var(--color-brand-primary)]'
                                            : 'border-l-4 border-l-transparent'
                                    }`}
                                >
                                            <div className="mb-3 flex items-center justify-between">
                                                <div className="flex items-start gap-3">
                                                    <div>
                                        <div className="text-sm">
                                            {gene?.symbol} {historyItem.position.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                                            <span className="font-mono">
                                                <span className={`${getNucleotideColorClass(historyItem.reference)}`}>
                                                    {historyItem.reference}
                                                </span>
                                                {">"}
                                                <span className="text-[var(--color-foreground)]/50">*</span>
                                            </span>
                                        </div>
                                        <div className="text-xs text-[var(--color-foreground)]/60 mt-1">
                                            {new Date(historyItem.timestamp).toLocaleString()}
                                                        </div>
                                                    </div>
                                                    {knownVariant && (
                                                        <>
                                                            <div className="w-px h-12 bg-[var(--color-border)]/50"></div>
                                                            <div className="flex flex-col gap-1">
                                                                <div className="text-sm">
                                                                    ClinVar: {gene?.symbol} {knownVariant.location.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                                                                    {(() => {
                                                                        const refAltMatch = /(\w)>(\w)/.exec(knownVariant.title);
                                                                        if (refAltMatch && refAltMatch.length === 3) {
                                                                            const ref = refAltMatch[1];
                                                                            const alt = refAltMatch[2];
                                                                            if (ref && alt) {
                                                                                return (
                                                                                    <span className="font-mono">
                                                                                        <span className={`${getNucleotideColorClass(ref)}`}>
                                                                                            <span> </span>{ref}
                                                                                        </span>
                                                                                        {">"}
                                                                                        <span className={`${getNucleotideColorClass(alt)}`}>
                                                                                            {alt}
                                                                                        </span>
                                                                                    </span>
                                                                                );
                                                                            }
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <span className={`inline-block rounded px-2 py-1 text-xs ${getClassificationColorClasses(knownVariant.classification)}`}>
                                                                        {knownVariant.classification || "Unknown"}
                                                                    </span>
                                                                    <Button
                                                                        variant="link"
                                                                        size="default"
                                                                        className="h-3 cursor-pointer px-0 text-xs text-[var(--color-link)] hover:text-[var(--color-link)]/80"
                                                                        onClick={() =>
                                                                            window.open(
                                                                                `https://www.ncbi.nlm.nih.gov/clinvar/variation/${knownVariant.clinvar_id}`,
                                                                                "_blank",
                                                                            )
                                                                        }
                                                                    >
                                                                        <ExternalLink className="inline-block h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                <div className="flex items-center">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setWildcardHistory(prev => prev.filter((_, i) => i !== index));
                                                        }}
                                                        className="h-6 text-xs text-[var(--color-warning)] hover:text-[var(--color-warning)]"
                                                    >
                                                        Clear
                                                    </Button>
                                        </div>
                                    </div>
                                    
                                    <div className="overflow-x-auto">
                                                <table className="w-full text-xs min-w-[600px]">
                                                    <thead className="sticky top-0 bg-[var(--color-muted)]/50 backdrop-blur-sm z-10">
                                                <tr className="border-b border-[var(--color-border)]">
                                                            <th className="text-left py-2 font-medium text-[var(--color-foreground)]/70 px-2">Variant</th>
                                                            <th className="text-left py-2 font-medium text-[var(--color-foreground)]/70 px-2">Delta Likelihood Score</th>
                                                            <th className="text-left py-2 font-medium text-[var(--color-foreground)]/70 px-2">Pathogenicity Prediction</th>
                                                            <th className="text-left py-2 font-medium text-[var(--color-foreground)]/70 px-2">Confidence</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {historyItem.results.map((item, itemIndex) => (
                                                            <tr key={`${item.reference}->${item.alternative}-${itemIndex}`} className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-muted)]/20 transition-colors">
                                                                <td className="py-2 px-2">
                                                            {item.error ? (
                                                                <span className="text-[var(--color-warning)]">Error</span>
                                                            ) : (
                                                                <span className="font-mono">
                                                                    <span className={`${getNucleotideColorClass(item.reference)}`}>
                                                                        {item.reference}
                                                                    </span>
                                                                    {">"}
                                                                    <span className={`${getNucleotideColorClass(item.alternative)}`}>
                                                                        {item.alternative}
                                                                    </span>
                                                                </span>
                                                            )}
                                                        </td>
                                                                <td className="py-2 px-2 font-mono">
                                                            {item.error ? (
                                                                        <span className="text-[var(--color-foreground)]/50">-</span>
                                                            ) : (
                                                                item.result?.delta_score.toFixed(6) ?? "-"
                                                            )}
                                                        </td>
                                                                <td className="py-2 px-2">
                                                            {item.error ? (
                                                                        <span className="text-[var(--color-foreground)]/50">-</span>
                                                            ) : item.result ? (
                                                                <span className={`inline-block rounded px-2 py-1 text-xs ${getClassificationColorClasses(item.result.prediction)}`}>
                                                                    {item.result.prediction}
                                                                </span>
                                                            ) : (
                                                                <span>-</span>
                                                            )}
                                                        </td>
                                                                <td className="py-2 px-2">
                                                            {item.error ? (
                                                                        <span className="text-[var(--color-foreground)]/50">-</span>
                                                            ) : item.result ? (
                                                                <span>{Math.round(item.result.classification_confidence * 100)}%</span>
                                                            ) : (
                                                                <span>-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                    );
                                })}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                )}

                {analysisHistory.length > 0 && (
                    <Collapsible
                        open={isHistoryOpen}
                        onOpenChange={setIsHistoryOpen}
                        className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/20 transition-all duration-200"
                    >
                        <CollapsibleTrigger asChild>
                            <div className="flex cursor-pointer items-center justify-between p-3 hover:bg-[var(--color-muted)]/30 transition-colors rounded-t-md">
                                <h4 className="text-sm font-medium text-[var(--color-foreground)]">
                                    {isHistoryOpen ? "Hide" : "Show"} Analysis History ({analysisHistory.length} most recent)
                                </h4>
                                {isHistoryOpen ? (
                                    <ChevronUp className="h-4 w-4 transition-transform duration-200 text-[var(--color-foreground)]/60" />
                                ) : (
                                    <ChevronDown className="h-4 w-4 transition-transform duration-200 text-[var(--color-foreground)]/60" />
                                )}
                            </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="transition-all duration-200 ease-in-out">
                            <div className="max-h-96 overflow-y-auto">
                            {analysisHistory.map((result, index) => (
                                <div
                                    key={`${result.position}-${index}`}
                                    className={`border-t border-[var(--color-border)] p-4 ${
                                        index === 0
                                            ? 'border-l-4 border-l-[var(--color-brand-primary)]'
                                            : 'border-l-4 border-l-transparent'
                                    }`}
                                >
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <div className="mb-2">
                                                <div className="text-xs font-medium text-[var(--color-foreground)]/70">Variant</div>
                                                <div className="text-sm">
                                                    {gene?.symbol} {result.position.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                                                    <span className="font-mono">
                                                        <span className={`${getNucleotideColorClass(result.reference)}`}>
                                                            {result.reference}
                                                        </span>
                                                        {">"}
                                                        <span className={`${getNucleotideColorClass(result.alternative)}`}>
                                                            {result.alternative}
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="text-xs font-medium text-[var(--color-foreground)]/70">Delta Likelihood Score</div>
                                                <div className="font-sm">
                                                    {result?.delta_score.toFixed(6)}
                                                </div>
                                                <div className="text-xs text-[var(--color-foreground)]/60">
                                                    {result?.delta_score < 0 ? "Negative score indicates loss of function." : "Positive score indicates gain/neutral function."}
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="mb-2">
                                                <div className="text-xs font-medium text-[var(--color-foreground)]/70">Pathogenicity Prediction</div>
                                                <div 
                                                    className={`inline-block rounded-lg mt-1.5 mb-3 px-3 py-2 text-xs ${getClassificationColorClasses(result.prediction)}`}
                                                >{result.prediction}</div>
                                                <div className="text-xs font-medium text-[var(--color-foreground)]/70">Confidence</div>
                                                <div className="mt-1 h-2 w-full rounded-full bg-muted">
                                                    <div  
                                                        className={`h-2 rounded-full ${result.prediction.includes("pathogenic") ? "bg-[var(--color-pathogenic)]" : "bg-[var(--color-benign)]"}`}
                                                    style={{width: `${Math.min(100, result.classification_confidence * 100)}%`
                                                    }}>
                                                    </div>
                                                </div>
                                                <div className="mt-1 mb-2 text-right text-xs text-[var(--color-foreground)]/60">
                                                    {Math.round(result.classification_confidence * 100)}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                )}
                
            </CardContent>
        </Card>
    );
});

VariantAnalysis.displayName = "VariantAnalysis";

export default VariantAnalysis;