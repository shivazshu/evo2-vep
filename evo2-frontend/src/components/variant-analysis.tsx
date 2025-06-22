"use client"

import { analyzeVariantWithAPI, type AnalysisResult, type ClinvarVariants, type GeneBounds, type GeneFromSearch, fetchGeneSequence, reverseComplement } from "../utils/genome-api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";
import { getClassificationColorClasses, getNucleotideColorClass } from "../utils/coloring-utils";
import { Button } from "./ui/button";
import { Zap, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { type GeneDetailsFromSearch } from "../utils/genome-api";

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

const VariantAnalysis = forwardRef<VariantAnalysisHandle, VariantAnalysisProps>(({
    gene,
    genomeId,
    chromosome,
    clinvarVariants,
    referenceSequence,
    sequencePosition,
    geneBounds,
    geneDetails,
} : VariantAnalysisProps, ref) => {
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

    useImperativeHandle(ref, () => ({
        focusAlternativeInput: () => {
            if (alternativeInputRef.current) {
                alternativeInputRef.current.focus();
            }
        }
    }));

    useEffect(() => {
        if (sequencePosition && referenceSequence) {
            setVariantPosition(String(sequencePosition));
            setVariantReference(referenceSequence);
        }
    }, [sequencePosition, referenceSequence]);
     
    const handlePositionChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newPosition = e.target.value.trim().replace(/\s+/g, '');
        setVariantPosition(newPosition);
        setVariantReference("");
        setVariantError(null);
        setSequenceAssertion(null);
        setShowAssertion(false);
        setIsHistoryOpen(false);
    };

    const handleAlternativeChange = (e: ChangeEvent<HTMLInputElement>) => {
        setVariantAlternative(e.target.value.toUpperCase());
        setVariantError(null);
    };

    const handleVariantSubmit = async (pos: string, alt: string, ref?: string) => {
        const position = parseInt(pos.replaceAll(",", ""));

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

        const matchingVariant = clinvarVariants.find(variant => {
            const variantPos = parseInt(variant.location.replaceAll(",", ""));
            return variantPos === position;
        });

        let alternativeNucleotide = alt;

        if (matchingVariant) {
            const refAltMatch = /:c\.[\d-]+(\w)>(\w)$/.exec(matchingVariant.title);
            if (refAltMatch?.[1] && refAltMatch?.[2]) {
                alternativeNucleotide = refAltMatch[2];
            }
        }

        if (!validNucleotide.test(alternativeNucleotide)) {
            setVariantError("Invalid alternative nucleotide from ClinVar record.");
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
                genomeId,
                chromosome,
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
            const currentPos = parseInt(variantPosition.trim().replace(/\s+/g, '').replaceAll(",", ""));
            return variantPos === currentPos;
        });

        if (!matchingVariant) {
            setShowAssertion(false);
            setSequenceAssertion(null);
            return;
        }

        const refAltMatch = /:c\.(-?\d+(?:[+-]\d+)?)([ATGC])>([ATGC])(?:\s*\(.*\))?$/.exec(matchingVariant.title);
        if (!refAltMatch?.[2] || !refAltMatch?.[3]) {
            setShowAssertion(false);
            setSequenceAssertion(null);
            return;
        }

        const clinvarReference = refAltMatch[2];
        const clinvarAlternative = refAltMatch[3];
        const actualPosition = parseInt(matchingVariant.location.replaceAll(",", ""));
        const expectedGenome = genomeId;
        const expectedChromosome = chromosome;
        if (!expectedGenome || !expectedChromosome) {
            console.error("Missing genome or chromosome for assertion", { expectedGenome, expectedChromosome });
            return;
        }

        // Only fetch if not already fetched for this reference and position
        if (sequenceAssertion?.clinvarReference === clinvarReference && 
            sequenceAssertion?.position === actualPosition) {
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
                const reverseComplement = (seq: string) => {
                    const complement: Record<string, string> = {
                        'A': 'T',
                        'T': 'A',
                        'G': 'C',
                        'C': 'G'
                    };
                    return seq.split('').map(base => complement[base] ?? base).join('');
                };
                const clinvarGeneMatch = /^([^(]+)\(([^)]+)\)/.exec(matchingVariant.title);
                const clinvarGeneId = clinvarGeneMatch?.[1] ?? '';
                const clinvarGeneSymbol = clinvarGeneMatch?.[2] ?? '';
                const isNegativeStrand = geneDetails?.genomicinfo?.[0]?.strand === '-';
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
                            placeholder="e.g., A, T, G, C"
                            maxLength={1}
                        />
                        {variantReference && (
                            <div className="sm:hidden mt-3 flex items-center gap-2 text-xs text-[var(--color-foreground)]/70">
                                <span>Substitution:</span>
                                <span className={`font-mono ${getNucleotideColorClass(variantReference)}`}>
                                    {variantReference}
                                </span>
                                <span>→</span>
                                <span className={`font-mono ${getNucleotideColorClass(variantAlternative)}`}>
                                    {variantAlternative ? variantAlternative : "?"}
                                </span>
                            </div>
                        )}
                    </div>
                    {variantReference && (
                        <div className="hidden sm:flex h-9 items-center gap-2 ml-2 mr-2 text-xs text-[var(--color-foreground)]/70">
                            <span>Substitution:</span>
                            <span className={`font-mono ${getNucleotideColorClass(variantReference)}`}>
                                {variantReference}
                            </span>
                            <span>→</span>
                            <span className={`font-mono ${getNucleotideColorClass(variantAlternative)}`}>
                                {variantAlternative ? variantAlternative : "?"}
                            </span>
                        </div>
                    )}
                    <Button
                        disabled={isAnalyzing || !variantPosition || !variantAlternative}
                        className="mt-4 h-9 cursor-pointer sm:mt-0 sm:self-end bg-[var(--color-foreground)] text-[var(--color-card)] hover:bg-[var(--color-foreground)]/90 text-xs"
                        onClick={() => handleVariantSubmit(variantPosition.replace(",", ""), variantAlternative)}
                    >
                        {isAnalyzing ? (
                            <><span className="h-3 w-3 mr-2  inline-block animate-spin rounded-full border-2 border-white border-t-transparent align-middle"></span>Analyzing...</>
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

                {clinvarVariants.filter(
                    (variant) => variant?.variation_type?.toLowerCase().includes("single nucleotide variant") && 
                    parseInt(variant?.location?.replaceAll(",","")) === parseInt(variantPosition.replaceAll(",","")))
                    .map((matchedVariant) => {
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
                                    onClick={() => {
                                        setVariantAlternative(alt);
                                        void handleVariantSubmit(variantPosition.replace(",", ""), alt, ref);
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
                                                    {sequenceAssertion.isNegativeStrand && (
                                                        <span className="ml-1 text-xs text-[var(--color-foreground)]/70">
                                                            (reverse complemented)*
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mb-2">
                                                    <span className="font-medium">ClinVar reference nucleotide:</span> <span className={`font-mono ${getNucleotideColorClass(sequenceAssertion.clinvarReference)} `}>{sequenceAssertion.clinvarReference}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium">Assertion:</span> {sequenceAssertion.match ? (
                                                        <span className="text-[var(--color-success)] font-semibold">MATCH</span>
                                                    ) : (
                                                        <span className="text-[var(--color-warning)] font-semibold">MISMATCH</span>
                                                    )}
                                                    {!sequenceAssertion.match && (
                                                        <span className="ml-2 text-xs text-[var(--color-foreground)]/70">
                                                            {sequenceAssertion.isNegativeStrand ?
                                                                "(Note: This gene is on the negative strand, UCSC sequence has been reverse complemented)*" :
                                                                "(Note: Reference sequence mismatch detected)"
                                                            }
                                                        </span>
                                                    )}
                                                </div>
                                                {sequenceAssertion.isNegativeStrand && (
                                                    <div className="mt-2 text-xs text-[var(--color-foreground)]/70">
                                                        * For genes on the negative strand, the UCSC sequence is reverse complemented to match the transcript orientation. 
                                                        The ClinVar reference is already in transcript orientation.
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
                    )
                })[0]}

                {analysisHistory.length > 0 && (
                    <Collapsible
                        open={isHistoryOpen}
                        onOpenChange={setIsHistoryOpen}
                        className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/20"
                    >
                        <CollapsibleTrigger asChild>
                            <div className="flex cursor-pointer items-center justify-between p-3">
                                <h4 className="text-sm font-medium text-[var(--color-foreground)]">
                                    {isHistoryOpen ? "Hide" : "Show"} Analysis History ({analysisHistory.length} most recent)
                                </h4>
                                <ChevronDown
                                    className={`h-4 w-4 transition-transform duration-200 ${
                                        isHistoryOpen ? 'rotate-180' : ''
                                    }`}
                                />
                            </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
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
                        </CollapsibleContent>
                    </Collapsible>
                )}
            </CardContent>
        </Card>
    );
});

VariantAnalysis.displayName = "VariantAnalysis";

export default VariantAnalysis;