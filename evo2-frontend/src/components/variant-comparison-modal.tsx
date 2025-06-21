import type { ClinvarVariants } from "../utils/genome-api";
import { Button } from "./ui/button";
import { Check, ExternalLink, Shield, X } from "lucide-react";
import { getClassificationColorClasses, getNucleotideColorClass } from "../utils/coloring-utils";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";

export function VariantComparisonModal({
    comparisonVariant,
    onClose,
} : {
    comparisonVariant: ClinvarVariants | null,
    onClose: () => void;
}) {
    if (!comparisonVariant?.evo2Result) return null;

    const evo2Result = comparisonVariant.evo2Result;
    const classification = comparisonVariant.classification;
    const isPathogenic = evo2Result.prediction.toLowerCase().includes("pathogenic");
    const isMatch = classification.toLowerCase() === evo2Result.prediction.toLowerCase();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-background)]/50 p-4 backdrop-blur-sm">
            <Card className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-medium text-[var(--color-foreground)]/80">Variant Analysis Comparison</CardTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-7 w-7 cursor-pointer text-[var(--color-foreground)]/70 hover:bg-[var(--color-muted)]/70"
                        > 
                            <X  className="h-5 w-5"/>
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
                        <h3 className="mb-3 text-sm font-medium text-[var(--color-foreground)]">
                            Variant Information
                        </h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <div className="flex">
                                    <span className="w-28 text-xs text-[var(--color-foreground)]/70">Position:</span>
                                    <span className="text-xs">{comparisonVariant.location}</span>
                                </div>
                                <div className="flex">
                                    <span className="w-28 text-xs text-[var(--color-foreground)]/70">Type:</span>
                                    <span className="text-xs">{comparisonVariant.variation_type}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex">
                                    <span className="w-28 text-xs text-[var(--color-foreground)]/70">Variant:</span>
                                    <span className="text-xs">
                                        {(() => {
                                            const match = /(\w)>(\w)/.exec(comparisonVariant.title); 

                                            if (match && match.length == 3) {
                                                const [_, ref, alt] = match;
                                                return (
                                                    <>
                                                        <span className={getNucleotideColorClass(ref!)}>{ref}</span>
                                                        <span>&gt;</span>
                                                        <span className={getNucleotideColorClass(alt!)}>{alt}</span>
                                                    </>
                                                ); 
                                            } 
                                            return comparisonVariant.title; 
                                        })()}
                                    </span>
                                </div>
                                <div className="items-center flex">
                                    <span className="w-28 text-xs text-[var(--color-foreground)]/70">ClinVar ID:</span>
                                    <a
                                        href={`https://www.ncbi.nlm.nih.gov/clinvar/variation/${comparisonVariant.clinvar_id}`}
                                        className="text-xs text-[var(--color-link)] hover:underline"
                                        target="_blank"
                                    >
                                        {comparisonVariant.clinvar_id}
                                        <ExternalLink className="ml-1 mb-0.5 inline-block h-3 w-3" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <h4 className="mb-3 font-medium text-sm text-[var(--color-foreground)]/80">
                            Analysis Comparison 
                        </h4>
                        <div className="grid gap-2 md:grid-cols-2">
                            {/* ClinVar Assessment */}
                            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-4">
                                <h5 className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--color-foreground)]"> 
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-foreground)]/10">
                                        <span className="w-3 h-3 rounded-full bg-[var(--color-foreground)]"></span>
                                    </span>
                                    ClinVar Assessment
                                </h5>
                                <div className={`w-fit rounded-md px-2 py-1 text-xs font-normal ${getClassificationColorClasses(classification)}`}>
                                    {classification || "Unknown significance"}
                                </div>
                            </div>
                            {/* Evo2 Prediction */}
                            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/50 p-4 space-y-3">
                                <h5 className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--color-foreground)]">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand-primary)]/10">
                                        <span className="w-3 h-3 rounded-full bg-[var(--color-brand-primary)]"></span>
                                    </span>
                                    Evo2 Prediction
                                </h5>
                                <div className={`flex w-fit items-center gap-1 rounded-md px-2 py-1 font-normal text-xs ${getClassificationColorClasses(evo2Result.prediction)}`}>
                                    <Shield className="h-3 w-3" />
                                    <span>{evo2Result.prediction}</span>
                                </div>
                                
                                <div>
                                    <div className="mb-1 text-xs text-[var(--color-foreground)]/70">Delta Likelihood Score:</div>
                                    <div className="text-sm font-semibold">{evo2Result.delta_score.toFixed(6)}</div>
                                    <div className="text-xs text-[var(--color-foreground)]/60">
                                        {evo2Result.delta_score < 0
                                            ? "Negative score indicates loss of function." 
                                            : "Positive score indicates gain/neutral function."
                                        }
                                    </div>
                                </div>
                                
                                <div>
                                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-foreground)]/70">
                                        <span>Confidence:</span>
                                        <span>{Math.round(evo2Result.classification_confidence * 100)}%</span>
                                    </div>
                                    <div className="mt-1 h-2 w-full rounded-full bg-[var(--color-muted)]">
                                        <div
                                            className={`h-2 rounded-full ${isPathogenic ? 'bg-[var(--color-pathogenic)]' : 'bg-[var(--color-benign)]'}`}
                                            style={{ width: `${Math.min(100, evo2Result.classification_confidence * 100)}%` }}
                                        ></div>
                                    </div>
                                </div>
                            </div>

                            {/* Assessment Check */}
                            <div className="md:col-span-2 rounded-md bg-[var(--color-muted)]/20 text-xs p-3 leading-relaxed">
                                <div className="flex items-center gap-2">
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${isMatch ? "bg-[var(--color-success)]/20" : "bg-[var(--color-warning)]/20"}`}>
                                        {isMatch ? (
                                            <Check className="h-3 w-3 text-[var(--color-success)]" />
                                        ) : (
                                            <span className="h-3 w-3 flex items-center justify-center font-bold text-[var(--color-caution)]">!</span>
                                        )}
                                    </span>
                                    <span className="font-medium text-[var(--color-foreground)]">
                                        {isMatch
                                            ? "Evo2 prediction agrees with ClinVar classification."
                                            : "Evo2 prediction differs from ClinVar classification."
                                        }
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
                <div className="border-t border-[var(--color-border)]" />
                <CardFooter className="flex justify-end">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="cursor-pointer border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/70"
                    >
                        Close
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}