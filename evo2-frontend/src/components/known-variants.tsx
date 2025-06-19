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

    const analyzeVariant =  async (variant: ClinvarVariants) => {
        let variantDetails = null;
        const position = variant.location ? parseInt(variant.location.replaceAll(",", "")) : null; 

        const refAltMatch = /(\w)>(\w)/.exec(variant.title);
        
        if (refAltMatch && refAltMatch.length == 3) {
            variantDetails = {
                position,
                reference: refAltMatch[1],
                alternative: refAltMatch[2],
            }
        }

        if (!variantDetails?.position ||
            !variantDetails.alternative ||
            !variantDetails.reference
        ) {
            return;
        }

        updateClivarVariant(variant.clinvar_id, {
            ...variant,
            isAnalyzing: true,
        })

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
            }

            updateClivarVariant(variant.clinvar_id, updatedVariant);
            showComparison(updatedVariant )

        } catch (error) {
            updateClivarVariant(variant.clinvar_id, {
                ...variant,
                isAnalyzing: false,
                evo2Error: error instanceof Error ? error.message : "Analysis failed."
            });
        }

    };

    return (
        <Card className="gap-0 border-none py-0 bg-white shadow-sm">
            <CardHeader className="pt-4 pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-normal text-[var(--color-foreground)]/70">
                        Known Variants
                    </CardTitle>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRefreshClick}
                        disabled={isRefreshLoading || isLoadingClinvar}
                        className="h-7 text-xs"
                    >
                        {isRefreshLoading || isLoadingClinvar ? (
                            <>
                                <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                                Loading...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="mr-1 h-3 w-3" />
                                Refresh
                            </>
                        )}
                    </Button>
                </div>
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

                {!isLoadingClinvar && !isCurrentRegionQueuedOrProcessing && clinvarVariants.length === 0 && !clinvarError && (
                    <div className="mb-4 flex items-center justify-center py-8 text-sm text-[var(--color-foreground)]/60">
                        No known variants found for this gene.
                    </div>
                )}

                {clinvarVariants.length > 0 && (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-xs">Variant</TableHead>
                                    <TableHead className="text-xs">Type</TableHead>
                                    <TableHead className="text-xs">Classification</TableHead>
                                    <TableHead className="text-xs">Pathogenicity Prediction</TableHead>
                                    <TableHead className="text-xs">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {clinvarVariants.map((variant) => (
                                    <TableRow key={variant.clinvar_id}>
                                        <TableCell className="text-xs">
                                            <div className="flex flex-col">
                                                <span className="font-medium">{variant.title}</span>
                                                <span className="text-[var(--color-foreground)]/60">
                                                    {variant.location}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {variant.variation_type}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getClassificationColorClasses(variant.classification)}`}>
                                                <Shield className="h-3 w-3" />
                                                {variant.classification}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {variant.evo2Result ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getClassificationColorClasses(variant.evo2Result.prediction)}`}>
                                                        <Zap className="h-3 w-3" />
                                                        {variant.evo2Result.prediction}
                                                    </span>
                                                    <span className="text-[var(--color-foreground)]/60 text-xs">
                                                        Score: {variant.evo2Result.delta_score.toFixed(3)}
                                                    </span>
                                                </div>
                                            ) : variant.isAnalyzing ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]"></div>
                                                    <span className="text-xs">Analyzing...</span>
                                                </div>
                                            ) : variant.evo2Error ? (
                                                <span className="text-xs text-[var(--color-destructive)]">
                                                    Analysis failed
                                                </span>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => analyzeVariant(variant)}
                                                    className="h-6 text-xs"
                                                >
                                                    <Zap className="mr-1 h-3 w-3" />
                                                    Analyze
                                                </Button>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            <div className="flex items-center gap-2">
                                                {variant.evo2Result && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => showComparison(variant)}
                                                        className="h-6 text-xs"
                                                    >
                                                        <BarChart2 className="mr-1 h-3 w-3" />
                                                        Compare
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => window.open(`https://www.ncbi.nlm.nih.gov/clinvar/variation/${variant.clinvar_id}/`, '_blank')}
                                                    className="h-6 text-xs"
                                                >
                                                    <ExternalLink className="mr-1 h-3 w-3" />
                                                    ClinVar
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}