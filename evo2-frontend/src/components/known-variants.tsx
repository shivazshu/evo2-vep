"use client"

import { analyzeVariantWithAPI, type ClinvarVariants, type GeneFromSearch, clearCache, clearRateLimitCache } from "../utils/redis-genome-api"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button";
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
        <Card className="gap-0 border-none bg-[var(--color-card)] py-0 shadow-sm">
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
                <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--color-warning)]">
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
                                        void clearRateLimitCache();
                                        void clearCache();
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
                    <div className="rounded-md border border-[var(--color-border)] h-96 overflow-auto">
                        <table className="w-full border-collapse">
                            <thead className="sticky top-0 bg-[var(--color-muted)] z-10">
                                <tr>
                                    <th className="p-4 text-xs font-medium text-[var(--color-foreground)] text-left w-[33.33%]">Variant</th>
                                    <th className="p-4 text-xs font-medium text-[var(--color-foreground)] text-left w-[25%]">Type</th>
                                    <th className="p-4 text-xs font-medium text-[var(--color-foreground)] text-left w-[25%]">Clinical Significance</th>
                                    <th className="p-4 text-xs font-medium text-[var(--color-foreground)] text-left w-[16.67%]">Actions</th>
                                </tr>
                            </thead>
                            
                            <tbody>
                                {clinvarVariants.map((variant) => (
                                    <tr
                                        key={variant.clinvar_id}
                                        className="border-b border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-muted)]/30"
                                    >
                                        <td className="p-4 align-middle">
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
                                        </td>
                                        <td className="p-4 align-middle">
                                            <div className="text-xs break-words">
                                                {variant.variation_type}
                                            </div>
                                        </td>
                                        <td className="p-4 align-middle text-xs">
                                            <div>
                                                <span
                                                    className={`inline-block rounded-md px-2 py-1 font-normal ${getClassificationColorClasses(variant.classification)}`}
                                                >
                                                    {variant.classification || "Unknown"}
                                                </span>
                                                {variant.evo2Result && (
                                                    <div className="mt-2">
                                                        <span
                                                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${getClassificationColorClasses(variant.evo2Result.prediction)}`}
                                                        >
                                                            <Shield className="h-3 w-3" />
                                                            <span className="hidden lg:inline">Evo2:&nbsp;</span>
                                                            <span>{variant.evo2Result.prediction}</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 align-middle">
                                            <div className="flex flex-col items-start gap-1">
                                                {variant.variation_type
                                                    .toLowerCase()
                                                    .includes("single nucleotide") ? (
                                                    !variant.evo2Result ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => analyzeVariant(variant)}
                                                            disabled={variant.isAnalyzing}
                                                            className="h-7 cursor-pointer border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/80"
                                                        >
                                                            {variant.isAnalyzing ? (
                                                                <>
                                                                    <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-foreground)]"></span>
                                                                    <span className="hidden lg:inline">Analyzing...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Zap className="lg:mr-1 inline-block h-3 w-3" />
                                                                    <span className="hidden lg:inline">Analyze with Evo2</span>
                                                                </>
                                                            )}
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 cursor-pointer border-[var(--color-success)]/50 bg-[var(--color-success)]/10 px-3 text-xs text-[var(--color-success)] hover:bg-[var(--color-success)]/20"
                                                            onClick={() => showComparison(variant)}
                                                        >
                                                            <BarChart2 className="lg:mr-1 inline-block h-3 w-3" />
                                                            <span className="hidden lg:inline">Compare Results</span>
                                                        </Button>
                                                    )
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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