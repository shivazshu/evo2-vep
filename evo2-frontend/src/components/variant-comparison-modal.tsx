import type { ClinvarVariants } from "../utils/genome-api";
import { Button } from "./ui/button";
import { Check, ExternalLink, Shield, X } from "lucide-react";
import { getClassificationColorClasses, getNucleotideColorClass } from "../utils/coloring-utils";

export function VariantComparisonModal({
    comparisonVariant,
    onClose,
} : {
    comparisonVariant: ClinvarVariants | null,
    onClose: () => void;
}) {
    if (!comparisonVariant?.evo2Result) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-3xl  overflow-y-auto rounded-lg bg-white">
                {/* Modal Header */}
                <div className="border-b border-[var(--color-border)] p-5">
                    <div className="flex items-center justify-between">
                        <h4 className="text-lg font-medium  tex-[var(--color-foreground)]">Variant Analysis Comparison</h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            className="h-7 w-7 cursor-pointer p-0 text-[var(--color-foreground)]/70 hover:bg-[var(--color-muted)]/70"
                        > 
                        <X  className="h-5 w-5"/>
                        </Button>
                    </div>

                    {/* Modal Content */}
                    <div className="p-5">
                        {comparisonVariant?.evo2Result && (
                            <div className="space-y-6">
                                <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-4">
                                <h3 className="mb-3 text-xm font-medium text-[var(--color-foreground)] ">
                                    Variant Information
                                </h3>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <div className="space-y-2">
                                        <div className="flex">
                                            <span className="w-28 text-xs text-[var(--color-foreground)]/70">
                                            Position:
                                            </span>
                                            <span className="text-xs">
                                                {comparisonVariant.location}
                                            </span>
                                        </div>
                                        <div className="flex">
                                            <span className="w-28 text-xs text-[var(--color-foreground)]/70">
                                            Type:
                                            </span>
                                            <span className="text-xs">
                                                {comparisonVariant.variation_type}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="space-y-2">
                                    <div className="flex">
                                        <span className="w-28 text-xs text-[var(--color-foreground)]/70">
                                        Variant:
                                        </span>
                                        <span className="text-xs">
                                            {(() => {
                                                const match = /(\w)>(\w)/.exec(comparisonVariant.title); 

                                                if (match && match.length == 3) {
                                                    const [_, ref, alt] = match;

                                                    return (
                                                        <>
                                                            <span className={getNucleotideColorClass(ref!)}>{ref}</span>
                                                            <span>{">"}</span>
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
                                        >{comparisonVariant.clinvar_id}
                                        </a>
                                        <ExternalLink  
                                            className="ml-1 inline-block h-3 w-3 text-[var(--color-link)] " 
                                        />
                                    </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Variant Results */}
                        <div>
                            <h4 className="mb-3 font-medium text-[var(--color-foreground)] text-sm">
                                Analysis Comparison 
                            </h4>
                            <div className="rounded-md border border-[var(--color-border)] bg-white mb-4"> 
                                <div className="grid gap-4 md:grid-cols-2">
                                    {/* ClinVar Assessment */}
                                    <div className="rounded-md bg-[var(--color-muted)]/50 p-4">
                                            <h5 className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--color-foreground)]"> 
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-foreground)]/10">
                                                <span className="w-3 h-3 rounded-full bg-[var(--color-foreground)]"></span>
                                            </span>
                                            ClinVar Assessment
                                            </h5>

                                            <div className="mt-2">
                                                <div className={`w-fit rounded-md px-2 py-1 text-xs font-normal ${getClassificationColorClasses(comparisonVariant.classification )}`}>
                                                    {comparisonVariant.classification || "Unkown significance"}
                                                 </div>
                                            </div>
                                    </div>
                                    {/* Evo2 Prediction */}
                                    <div className="rounded-md bg-[var(--color-muted)]/50 p-4">
                                            <h5 className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--color-foreground)]">
                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-foreground)]/10">
                                                <span className="w-3 h-3 rounded-full bg-[var(--color-brand-primary)]"></span>
                                            </span>
                                            Evo2 Prediction
                                            </h5>
                                            <div className="mt-2">
                                                <div className={`flex w-fit items-cenetr gap-1  rounded-md px-2 py-2 font-normal text-xs ${getClassificationColorClasses(comparisonVariant.evo2Result.prediction)}`}>
                                                    <Shield  className="w-3 h-3 "/>
                                                    <div 
                                                    className="">
                                                        {comparisonVariant.evo2Result.prediction}
                                                    </div>
                                                </div>
                                                {/* Delta Score */}
                                                <div className="mt-3">
                                                    <div className="mb-1 text-xs text-[var(--color-foreground)]/70">
                                                        Delta Likelihood Score:
                                                    </div>
                                                    <div className="text-sm font-normal">
                                                        {comparisonVariant.evo2Result.delta_score.toFixed(6)}
                                                    </div>
                                                    <div className="text-xs text-[var(--color-foreground)]/60">
                                                        {comparisonVariant.evo2Result.delta_score < 0 ? (
                                                        "Negative score indicates loss of function." 
                                                        ) : ("Positive score indicates gain/neutral function."
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Confidence bar */}
                                                <div className="mt-3">
                                                    <div className="mb-1 text-xs text-[var(--color-foreground)]/70">
                                                    Confidence:
                                                    </div>
                                                    <div className="mt-1 h-2 w-full rounded-full bg-[var(--color-muted)]/80">
                                                    <div
                                                        className={`h-2 rounded-full ${comparisonVariant.evo2Result.prediction.includes("pathogenic") ? "bg-red-600" : "bg-green-600"}`}
                                                        style={{
                                                        width: `${Math.min(100, comparisonVariant.evo2Result.classification_confidence * 100)}%`,
                                                        }}
                                                    ></div>
                                                    </div>
                                                    <div className="mt-1 text-right text-xs text-[var(--color-foreground)]/60">
                                                    {Math.round(
                                                        comparisonVariant.evo2Result
                                                        .classification_confidence * 100,
                                                    )}
                                                    %
                                                    </div>
                                                </div>
                                                </div>
                                            </div>
                                    {/* Assessment Check */}
                                    <div className="mt-4 rounded-md -bg-[var(--color-muted)]/20 text-xs p-3 leading-relaxed">
                                        <div className="flex items-center gap-2">
                                            <span 
                                            className={`flex h-5 w-5 items-center justify-center rounded-full ${comparisonVariant.classification.toLowerCase() == comparisonVariant.evo2Result.prediction.toLowerCase() ? "bg-green-200" : "bg-red-200"}`}
                                            >
                                            {comparisonVariant.classification.toLowerCase() == comparisonVariant.evo2Result.prediction.toLowerCase() ? (
                                                <Check className="h-3 w-3 text-green-600"/>
                                            ) : (
                                                <span className="h-3 w-3 flex items-center justify-center text-yellow-600">
                                                    <p>!</p>
                                                </span>
                                            )}
                                            </span>
                                            <span className="font-medium text-[var(--color-foreground)]">
                                                {comparisonVariant.classification.toLowerCase() == comparisonVariant.evo2Result.prediction.toLowerCase() ? (
                                                    "Evo2 prediction agrees with ClinVar classification."
                                                ) : (
                                                    "Evo2 prediction differs from ClinVar classification."
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            </div>
            {/* Modal Footer */}
            <div className="flex justify-end border-t border-[var(--color-border)] bg-[var(--color-muted)] p-4">
                <Button
                variant="outline"
                onClick={onClose}
                className="cursos-pointer border-[var(--color-foreground)]/10 bg-white text-[var(--color-foreground)] hover:bg-[var(--color-muted)]/70"
                >
                    Close
                </Button>
            </div>
        </div>
    </div>
    );
}