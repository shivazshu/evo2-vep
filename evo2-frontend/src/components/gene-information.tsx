import type { GeneBounds, GeneDetailsFromSearch, GeneFromSearch } from "../utils/genome-api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ExternalLink } from "lucide-react";

export function GeneInformation({
    gene, 
    geneDetails, 
    geneBounds} : {
        gene:GeneFromSearch, 
        geneDetails : GeneDetailsFromSearch | null, 
        geneBounds: GeneBounds | null,
    }) {
        if (!geneDetails) return <div className="text-center text-[var(--color-muted-foreground)]">No gene details available.</div>;

        const summary = geneDetails.summary?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') ?? "No summary available.";

        return <Card className="gap-0 border-none bg-[var(--color-card)] py-0 shadow-sm">
            <CardHeader className="pt-4 pb-2">
                <CardTitle className="text-sm font-normal text-[var(--color-foreground)]/70">Gene Information</CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 ">
                        <div className="flex">
                            <span className="w-28 min-28 text-xs text-[var(--color-foreground)]">Symbol:</span>
                            <span className="text-xs">{gene.symbol}</span>
                        </div>
                        <div className="flex">
                            <span className="w-28 min-28 text-xs text-[var(--color-foreground)]">Name:</span>
                            <span className="text-xs">{gene.name}</span>
                        </div>

                        {gene.description && gene.description !== gene.name && (
                            <div className="flex">
                                <span className="w-28 min-28 text-xs text-[var(--color-foreground)]">Description:</span>
                                <span className="text-xs">{gene.description}</span>
                            </div>  
                        )} 

                        <div className="flex">
                            <span className="w-28 min-28 text-xs text-[var(--color-foreground)]">Chromosome:</span>
                            <span className="text-xs">{gene.chrom}</span>
                        </div>

                        {geneBounds && (
                            <div className="grid grid-cols-[112px_1fr]">
                                <span className="text-xs text-[var(--color-foreground)]">Position:</span>
                                <span className="text-xs">
                                    {Math.min(geneBounds.min, geneBounds.max).toLocaleString()} -{" "}
                                    {Math.max(geneBounds.min, geneBounds.max).toLocaleString()}  (
                                    {Math.abs(geneBounds.max - geneBounds.min + 1).toLocaleString ()} bp)
                                    {geneDetails?.genomicinfo?.[0]?.strand === "-" && " (reverse strand)"}
                                </span>
                            </div>  
                        )} 
                    </div>
                    <div className="space-y-2">
                        {gene.gene_id && (
                            <div className="flex">
                                <span className="w-28 min-28 text-xs text-[var(--color-foreground)] ">
                                    Gene ID:
                                </span>
                                <span className="text-xs">
                                    <a 
                                    href={`https://www.ncbi.nlm.nih.gov/gene/${gene.gene_id}`}
                                    target="_blank"
                                    className="text-[var(--color-link)] flex items-center hover:underline "
                                    >
                                        {gene.gene_id}
                                        <ExternalLink className="ml-1 inline-block h-3 w-3"/>
                                    </a>
                                </span>
                            </div>
                        )}

                        {geneDetails?.organism && (
                            <div className="flex ">
                                <span className="w-28 text-xs text-[var(--color-foreground)]">Organism</span>
                                <span className="text-xs">{geneDetails.organism.scientificname} {geneDetails.organism.commonname && ` (${geneDetails.organism.commonname})`}</span>
                            </div>
                        )}

                        {geneDetails?.summary && (
                            <div className="mt-4 ">
                                <h3 className="mb-2 text-xs font-medium text-[var(--color-foreground)]">Summary:</h3>
                                <p className="text-xs leading-relaxed text-[var(--color-foreground)]">
                                    {summary}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    }