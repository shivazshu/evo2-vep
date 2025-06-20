"use client"

import { analyzeVariantWithAPI, type ClinvarVariants, type GeneFromSearch, clearCache, clearRateLimitCache } from "../utils/genome-api"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { BarChart2, ExternalLink, RefreshCw, Shield, Zap } from "lucide-react";
import { getClassificationColorClasses } from "../utils/coloring-utils";
import { useState, useCallback } from "react";
import { useQueueStatus } from "../hooks/use-queue-status";

export default function KnownVaraints({
    refreshVariants,
    showComparison,
    updateClivarVariant,
    clinvarVariants,
    isLoadingClinvar,
    clinvarError,
    genomeId,
    gene,
    geneBounds,
} : {
    refreshVariants: () => void;
    showComparison: (variant: ClinvarVariants) => void,
    updateClivarVariant: (id: string, variant: ClinvarVariants) => void;
    clinvarVariants: ClinvarVariants[];
    isLoadingClinvar: boolean;
    clinvarError: string | null;
    genomeId: string;
    gene: GeneFromSearch;
    geneBounds: { min: number; max: number } | null;
}) {
    const [isRefreshLoading, setIsRefreshLoading] = useState(false);

    // Use custom hook for queue status
    const { ncbiQueueStatus, isCurrentRegionQueuedOrProcessing } = useQueueStatus({
        ncbiMeta: geneBounds 
            ? { 
                chrom: gene.chrom, 
                genomeId, 
                start: Math.min(geneBounds.min, geneBounds.max), 
                end: Math.max(geneBounds.min, geneBounds.max) 
              }
            : { chrom: gene.chrom, genomeId }
    });

    const handleRefreshClick = useCallback(async () => {
        setIsRefreshLoading(true);
        try {
            refreshVariants();
        } finally {
            setTimeout(() => setIsRefreshLoading(false), 1000);
        }
    }, [refreshVariants]);

    const analyzeVariant = async (variant: ClinvarVariants) => {
        let variantDetails = null;
        const position = variant.location
            ? parseInt(variant.location.replaceAll(",", ""))
            : null;

        const refAltMatch = /(\w)>(\w)/.exec(variant.title);

        if (refAltMatch && refAltMatch.length === 3) {
            variantDetails = {
                position,
                reference: refAltMatch[1],
                alternative: refAltMatch[2],
            };
        }

        if (
            !variantDetails?.position ||
            !variantDetails.reference ||
            !variantDetails.alternative
        ) {
            return;
        }

        updateClivarVariant(variant.clinvar_id, {
            ...variant,
            isAnalyzing: true,
        });

        try {
            const data = await analyzeVariantWithAPI({
                position: variantDetails.position,
                alternative: variantDetails.alternative,
                genomeId: genomeId,
                chromosome: gene.chrom,
            });

            const updatedVariant: ClinvarVariants = {
                ...variant,
                isAnalyzing: false,
                evo2Result: data,
            };

            updateClivarVariant(variant.clinvar_id, updatedVariant);

            showComparison(updatedVariant);
        } catch (error) {
            updateClivarVariant(variant.clinvar_id, {
                ...variant,
                isAnalyzing: false,
                evo2Error: error instanceof Error ? error.message : "Analysis failed",
            });
        }
    };

    return (
        <Card className="gap-0 border-none bg-white py-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2">
                <CardTitle className="text-sm font-normal text-[var(--color-foreground)]/70">
                    Known Variants in Gene from ClinVar
                </CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshClick}
                    disabled={isLoadingClinvar || isRefreshLoading}
                    className="h-7 cursor-pointer text-xs text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/70"
                >
                    <RefreshCw className={`mr-1 h-3 w-3 ${isRefreshLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </CardHeader>

            <CardContent className="pb-4">
                {clinvarError && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 p-3 text-xs text-[var(--color-destructive)]">
                    <span className="mt-0.5 text-lg">⚠️</span>
                    <div>
                        <div className="font-medium">Error loading variants:</div>
                        <div className="mt-1">{clinvarError}</div>
                        {clinvarError.includes("429") || clinvarError.includes("rate limit") ? (
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-xs text-[var(--color-foreground)]/70">
                                    Rate limit reached. Please wait or clear your cache.
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        clearRateLimitCache();
                                        clearCache();
                                        window.location.reload();
                                    }}
                                    className="h-6 text-xs"
                                >
                                    Clear Cache & Reload
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>
                )}
        
                {/* Queue Status Indicator and Loading */}
                {isCurrentRegionQueuedOrProcessing && (
                    <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-primary)] bg-[var(--color-primary)]/10 p-3 text-xs text-[var(--color-primary)]">
                        <span className="mt-0.5 text-lg">⏳</span>
                        <div>
                            <div className="font-medium">NCBI Request Queue:</div>
                            <div className="mt-1">
                                {ncbiQueueStatus?.isProcessing ? (
                                    <span>Processing request... ({ncbiQueueStatus?.relevantQueueLength} in queue)</span>
                                ) : (
                                    <span>Waiting to process... ({ncbiQueueStatus?.relevantQueueLength} in queue)</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {isLoadingClinvar && !isCurrentRegionQueuedOrProcessing && (
                    <div className="mb-4 flex items-center justify-center py-8">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]">
                        </div>
                    </div>
                )}

                {!isLoadingClinvar && !isCurrentRegionQueuedOrProcessing && clinvarVariants.length > 0 && (
                    <div className="rounded-md border border-[var(--color-border)]">
                        <div className="w-full">
                            {/* Fixed Header */}
                            <div className="bg-[var(--color-muted)] border-b border-[var(--color-border)]">
                                <div className="grid grid-cols-[40%_20%_20%_20%] px-4 py-2">
                                    <div className="text-xs font-medium text-[var(--color-foreground)] text-start">Variant</div>
                                    <div className="text-xs font-medium text-[var(--color-foreground)] text-start">Type</div>
                                    <div className="text-xs font-medium text-[var(--color-foreground)] text-start">Clinical Significance</div>
                                    <div className="text-xs font-medium text-[var(--color-foreground)] text-start">Actions</div>
                                </div>
                            </div>
                            
                            {/* Scrollable Body */}
                            <div className="h-96 overflow-y-auto overflow-x-hidden">
                                <div className="w-full">
                                    {clinvarVariants.map((variant) => (
                                        <div
                                            key={variant.clinvar_id}
                                            className="grid grid-cols-[40%_20%_20%_20%] px-4 py-2 border-b border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]/50"
                                        >
                                            <div className="py-2 h-full flex flex-col justify-center">
                                                <div className="text-xs font-medium text-[var(--color-foreground)] break-words">
                                                    {variant.title}
                                                </div>
                                                <div className="mt-1 grid grid-cols-[140px_1fr] items-center">
                                                    <div className="text-xs text-[var(--color-foreground)]/70">
                                                        Location: {variant.location}
                                                    </div>
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="h-6 cursor-pointer px-0 text-xs text-[var(--color-link)] hover:text-[var(--color-link)]/80 justify-start"
                                                        onClick={() =>
                                                            window.open(
                                                                `https://www.ncbi.nlm.nih.gov/clinvar/variation/${variant.clinvar_id}`,
                                                                "_blank",
                                                            )
                                                        }
                                                    >
                                                        View in ClinVar
                                                        <ExternalLink className="ml-1 inline-block h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="py-2 text-xs flex items-center justify-start">
                                                <div className="break-words">
                                                    {variant.variation_type}
                                                </div>
                                            </div>
                                            <div className="py-2 text-xs flex flex-col items-start h-full justify-center">
                                                <div
                                                    className={`rounded-md px-2 py-1 text-center font-normal ${getClassificationColorClasses(variant.classification)}`}
                                                >
                                                    {variant.classification || "Unknown"}
                                                </div>
                                                {variant.evo2Result && (
                                                    <div className="mt-2 flex justify-start">
                                                        <div
                                                            className={`flex items-center gap-1 rounded-md px-2 py-1 text-center ${getClassificationColorClasses(variant.evo2Result.prediction)}`}
                                                        >
                                                            <Shield className="h-3 w-3" />
                                                            <span>Evo2: {variant.evo2Result.prediction}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="py-2 text-xs flex items-center justify-start">
                                                <div className="flex flex-col items-center gap-1">
                                                    {variant.variation_type
                                                        .toLowerCase()
                                                        .includes("single nucleotide") ? (
                                                        !variant.evo2Result ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 cursor-pointer border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80"
                                                                disabled={variant.isAnalyzing}
                                                                onClick={() => analyzeVariant(variant)}
                                                            >
                                                                {variant.isAnalyzing ? (
                                                                    <>
                                                                        <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-foreground)]"></span>
                                                                        Analyzing...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Zap className="mr-1 inline-block h-3 w-3" />
                                                                        Analyze with Evo2
                                                                    </>
                                                                )}
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-7 cursor-pointer border-green-200 bg-green-50 px-3 text-xs text-green-700 hover:bg-green-100"
                                                                onClick={() => showComparison(variant)}
                                                            >
                                                                <BarChart2 className="mr-1 inline-block h-3 w-3" />
                                                                Compare Results
                                                            </Button>
                                                        )
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {!isLoadingClinvar && !isCurrentRegionQueuedOrProcessing && clinvarVariants.length === 0 && !clinvarError && (
                    <div className="mb-4 flex items-center justify-center py-8 text-sm text-[var(--color-foreground)]/60">
                        No known variants found for this gene.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}