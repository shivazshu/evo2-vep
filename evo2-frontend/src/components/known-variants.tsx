"use client"

import { analyzeVariantWithAPI, type ClinvarVariants, type GeneFromSearch } from "~/utils/genome-api"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { BarChart2, ExternalLink, RefreshCw, Search, Shield, Zap } from "lucide-react";
import { getClassificationColorClasses } from "~/utils/coloring-utils";

export default function KnownVaraints({
    refreshVariants,
    showComparison,
    updateClivarVariant,
    clinvarVariants,
    isLoadingClinvar,
    clinvarError,
    genomeId,
    gene,
} : {
    refreshVariants: () => void;
    showComparison: (variant: ClinvarVariants) => void,
    updateClivarVariant: (id: string, variant: ClinvarVariants) => void;
    clinvarVariants: ClinvarVariants[];
    isLoadingClinvar: boolean;
    clinvarError: string | null;
    genomeId: string;
    gene: GeneFromSearch;
}) {

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
        <Card className="gap-0 border-none bg-white py-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2">
            <CardTitle className="text-sm font-normal text-[var(--color-foreground)]/70">
                Known Variants in Gene from ClinVar
            </CardTitle>
            <Button
                variant="ghost"
                size="sm"
                onClick={refreshVariants}
                disabled={isLoadingClinvar}
                className="h-7 cursor-pointer text-xs text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/70"
            >
                <RefreshCw className="mr-1 h-3 w-3" />
                Refresh
            </Button>
        </CardHeader>
        <CardContent className="pb-4">
            {clinvarError && (
            <div className="mb-4 rounded-md bg-[var(--color-destructive)]/10 p-3 text-xs text-[var(--color-destructive)]">
                {clinvarError}
            </div>
            )}
    
            {isLoadingClinvar ? (
            <div className="flex justify-center py-6">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]"></div>
            </div>
            ) : clinvarVariants.length > 0 ? (
            <div className="h-96 max-h-96 overflow-y-scroll rounded-md border border-[var(--color-border)] bg-white">
                <Table>
                <TableHeader className="sticky top-0 z-10">
                    <TableRow className="bg-[var(--color-muted)]/80 hover:bg-[var(--color-muted)]/30">
                    <TableHead className="py-2 text-xs font-medium text-[var(--color-foreground)]">
                        Variant
                    </TableHead>
                    <TableHead className="py-2 text-xs font-medium text-[var(--color-foreground)]">
                        Type
                    </TableHead>
                    <TableHead className="py-2 text-xs font-medium text-[var(--color-foreground)]">
                        Clinical Significance
                    </TableHead>
                    <TableHead className="py-2 text-xs font-medium text-[var(--color-foreground)]">
                        Actions
                    </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {clinvarVariants.map((variant) => (
                    <TableRow
                        key={variant.clinvar_id}
                        className="border-b border-[var(--color-border)]"
                    >
                        <TableCell className="py-2">
                        <div className="text-xs font-medium text-[var(--color-foreground)]">
                            {variant.title}
                        </div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-[var(--color-foreground)]">
                            <p>Location: {variant.location}</p>
                            <Button
                            variant="link"
                            size="sm"
                            className="h-6 cursor-pointer px-0 text-xs text-[var(--color-link)] hover:text-[var(--color-link)]/80"
                            onClick={() =>
                                window.open(
                                `https://www.ncbi.nlm.nih.gov/clinvar/variation/${variant.clinvar_id}`,
                                "_blank",
                                )
                            }
                            >
                            View in ClinVar
                            <ExternalLink className="ml-1 inline-block h-2 w-2" />
                            </Button>
                        </div>
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                        {variant.variation_type}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                        <div
                            className={`w-fit rounded-md px-2 py-1 text-center font-normal ${getClassificationColorClasses(variant.classification)}`}
                        >
                            {variant.classification || "Unknown"}
                        </div>
                        {variant.evo2Result && (
                            <div className="mt-2">
                            <div
                                className={`flex w-fit items-center gap-1 rounded-md px-2 py-1 text-center ${getClassificationColorClasses(variant.evo2Result.prediction)}`}
                            >
                                <Shield className="h-3 w-3" />
                                <span>Evo2: {variant.evo2Result.prediction}</span>
                            </div>
                            </div>
                        )}
                        </TableCell>
                        <TableCell className="py-2 text-xs">
                        <div className="flex items-center justify-start h-full">
                            {variant.variation_type
                            .toLowerCase()
                            .includes("single nucleotide") ? (
                            !variant.evo2Result ? (
                                <Button
                                variant="outline"
                                size="sm"
                                className="h-7 w-44 min-w-[11rem] cursor-pointer border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-xs text-[var(--color-foreground)] hover:bg-[var(--color-border)]/10"
                                disabled={variant.isAnalyzing}
                                onClick={() => analyzeVariant(variant)}
                                >
                                {variant.isAnalyzing ? (
                                    <>
                                    <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]"></span>
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
                                className="h-7 w-44 min-w-[11rem] cursor-pointer border-green-200 bg-green-50 px-3 text-xs text-green-700 hover:bg-green-100"
                                onClick={() => showComparison(variant)}
                                >
                                <BarChart2 className="mr-1 inline-block h-3 w-3" />
                                Compare Results
                                </Button>
                            )
                            ) : null}
                        </div>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </div>
            ) : (
            <div className="flex h-48 flex-col items-center justify-center text-center text-[var(--color-muted-foreground)]">
                <Search className="mb-4 h-10 w-10 text-[var(--color-muted-foreground)]" />
                <p className="text-sm leading-relaxed">
                No ClinVar variants found for this gene.
                </p>
            </div>
            )}
        </CardContent>
        </Card>
    );
}