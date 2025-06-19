"use client "

import type { GeneBounds, GeneDetailsFromSearch } from "~/utils/genome-api"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { getNucleotideColorClass } from "~/utils/coloring-utils";
import { clearCache, clearRateLimitCache } from "~/utils/genome-api";
import { useQueueStatus } from "~/hooks/use-queue-status";

export function GeneSequence( {
    geneBounds,
    geneDetails,
    startPosition,
    endPosition,
    onStartPositionChange,
    onEndPositionChange,
    sequenceData,
    sequenceRange,
    isLoading,
    error,
    onSequenceLoadRequest,
    onSequenceClick,
    maxViewRange,
    genomeId,
    gene
} : {
    geneBounds: GeneBounds | null; 
    geneDetails: GeneDetailsFromSearch | null; 
    startPosition: string;
    endPosition: string;
    onStartPositionChange: (value: string) => void;
    onEndPositionChange: (value: string) => void;
    sequenceData: string;
    sequenceRange: {start: number, end: number} | null;
    isLoading: boolean;
    error: string | null;
    onSequenceLoadRequest: () => void;
    onSequenceClick:  (position: number, nucleotide: string) => void;
    maxViewRange: number;
    genomeId: string;
    gene: { chrom: string };
}) {
    const [sliderValues, setSliderValues] = useState({start: 0, end: 100});
    const [isDraggingStart, setIsDraggingStart] = useState(false);
    const [isDraggingEnd, setIsDraggingEnd] = useState(false);
    const [isDraggingRange, setIsDraggingRange] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);
    const dragStartX = useRef<{x:number, startPos: number, endPos: number} | null>(null);
    const [hoverPosition, setHoverPosition] = useState<number | null>(null);
    const [mousePosition, setMousePosition] = useState<{x: number, y: number} | null>(null);
    const [isButtonLoading, setIsButtonLoading] = useState(false);

    // Use custom hook for queue status
    const start = parseInt(startPosition);
    const end = parseInt(endPosition);
    const { ncbiQueueStatus, ucscQueueStatus, isCurrentRegionQueuedOrProcessing } = useQueueStatus({
        ncbiMeta: gene.chrom && genomeId && !isNaN(start) && !isNaN(end) 
            ? { chrom: gene.chrom, genomeId, start, end }
            : undefined,
        ucscMeta: gene.chrom && genomeId 
            ? { chrom: gene.chrom, genomeId }
            : undefined
    });

    const currentRangeSize = useMemo(() => {
        const start = parseInt(startPosition);
        const end = parseInt(endPosition);

        return isNaN(start) || isNaN(end) || end < start ? 0 : end - start + 1;
    }, [startPosition, endPosition])

    useEffect(() => {
        if (!geneBounds) return;
        
        const minBound = Math.min(geneBounds.min, geneBounds.max); 
        const maxBound = Math.max(geneBounds.min, geneBounds.max);
        const totalSize = maxBound - minBound;
        
        const startNum = parseInt(startPosition);
        const endNum = parseInt(endPosition);

        if (isNaN(startNum) || isNaN(endNum) || totalSize <= 0) {
            setSliderValues({start: 0, end: 100});
            return;
        }

        const startPercent = ((startNum - minBound) / totalSize) * 100;
        const endPercent = ((endNum - minBound) / totalSize) * 100;

        setSliderValues({
            start: Math.max(0, Math.min(startPercent, 100)),
            end: Math.max(0, Math.min(endPercent, 100)),
        });

    }, [startPosition, endPosition, geneBounds])

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingEnd && !isDraggingRange && !isDraggingStart) return;
            if (!sliderRef.current || !geneBounds) return;

            const sliderRect = sliderRef.current.getBoundingClientRect();
            const relativeX = e.clientX - sliderRect.left       
            const sliderWidth = sliderRect.width;

            let newPercent = (relativeX / sliderWidth) * 100;
            newPercent = Math.max(0, Math.min(newPercent, 100))

            const minBound = Math.min(geneBounds.min, geneBounds.max); 
            const maxBound = Math.max(geneBounds.min, geneBounds.max); 

            const geneSize = maxBound - minBound;

            const newPosition = Math.round(minBound + (geneSize * newPercent) / 100);
            const currentStartNum = parseInt(startPosition);
            const currentEndNum = parseInt(endPosition);

            if (isDraggingStart) {
                if (!isNaN(currentEndNum)) {
                    if (currentEndNum - newPosition + 1 >  maxViewRange) {
                        onStartPositionChange(String(currentEndNum - maxViewRange + 1));
                    } else if (newPosition <  currentEndNum) {
                        onStartPositionChange(String(newPosition));
                    }
                }
            } else if (isDraggingEnd) {
                if (!isNaN(currentStartNum)) {
                    if (newPosition - currentStartNum + 1 >  maxViewRange) {
                        onEndPositionChange(String(currentStartNum + maxViewRange - 1));
                    } else if (newPosition > currentStartNum) {
                        onEndPositionChange(String(newPosition));
                    }
                }
            } else if (isDraggingRange) {
                if (!dragStartX.current) return; 

                const pixelsPerBase = sliderWidth / geneSize;
                const dragDeltaPixels = relativeX - dragStartX.current.x;
                const dragDeltaBases = Math.round(dragDeltaPixels / pixelsPerBase);

                let newStart = dragStartX.current.startPos + dragDeltaBases;
                let newEnd = dragStartX.current.endPos  + dragDeltaBases;
                const rangeSize = dragStartX.current.endPos  - dragStartX.current.startPos;

                if (newStart < minBound) {
                    newStart = minBound;
                    newEnd = minBound + rangeSize;
                }

                if (newEnd  > maxBound) {
                    newStart = maxBound - rangeSize;
                    newEnd = maxBound;
                }
                onStartPositionChange(String(newStart));
                onEndPositionChange(String(newEnd));
            }

        };
    
        const handleMouseUp = () => {
            if ((isDraggingEnd || isDraggingRange || isDraggingStart) && startPosition && endPosition) {
                onSequenceLoadRequest();
            }
            
            setIsDraggingEnd(false);
            setIsDraggingRange(false);
            setIsDraggingStart(false);
            dragStartX.current = null;
    
        }

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        }
    }, [
        isDraggingStart,
        isDraggingEnd, 
        isDraggingRange, 
        geneBounds,
        startPosition, 
        endPosition, 
        onStartPositionChange, 
        onEndPositionChange, 
        maxViewRange, 
        onSequenceLoadRequest,  
    ]);

    const handleMouseDown = useCallback((e: React.MouseEvent, handle: "start" | "end")  => { 
        e.preventDefault();
        if (handle === "start") setIsDraggingStart(true);
        else setIsDraggingEnd(true);
    }, []);

    const handleRangeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();

        if (!sliderRef.current) return;

        const startNum = parseInt(startPosition);
        const endNum = parseInt(endPosition);

        if (isNaN(startNum) || isNaN(endNum)) return;

        setIsDraggingRange(true);
        const sliderRect = sliderRef.current.getBoundingClientRect();
        const relativeX = e.clientX - sliderRect.left;

        dragStartX.current = {
            x: relativeX,
            startPos: startNum,
            endPos: endNum,
        }

    }, [startPosition, endPosition])

    const formattedSequence = useMemo(() => {

        if (!sequenceData || !sequenceRange) return null;
        const start = sequenceRange.start;
        const BASES_PER_LINE = 150;
        const lines: JSX.Element[] = [];

        for (let i = 0; i < sequenceData.length; i += BASES_PER_LINE) {
            const lineStartPos = start + i;
            const chunk = sequenceData.substring(i, i + BASES_PER_LINE);
            const colorizedChars: JSX.Element[] = [];
            
            for (let j = 0; j < chunk.length; j++) {
                const nucleotide = chunk[j] ?? "";
                const nucleotidePosition = lineStartPos + j;
                const color = getNucleotideColorClass(nucleotide);
                colorizedChars.push(
                <span 
                    key={j} 
                    onClick={() => {onSequenceClick(nucleotidePosition, nucleotide )}} 
                    onMouseEnter={(e) => {
                        setHoverPosition(nucleotidePosition);
                        setMousePosition({x: e.clientX, y: e.clientY});
                    }}
                    onMouseLeave={() => {
                        setHoverPosition(null);
                        setMousePosition(null);
                    }}
                    className={`${color} group relative cursor-pointer`}
                    > 
                        {nucleotide}
                </span>)
            }


            lines.push(
                <div key={i} className="flex">
                    <div className="text-[var(--color-foreground)]/60 mr-6 w-20 select-none">
                        {lineStartPos.toLocaleString()}
                    </div>
                    <div className="flex-1 tracking-wide">
                        {colorizedChars} 
                    </div>
                </div>
            ); 
        }

        return lines
    }, [sequenceData, sequenceRange, onSequenceClick])

    const handleLoadSequenceClick = useCallback(async () => {
        setIsButtonLoading(true);
        try {
            onSequenceLoadRequest();
        } finally {
            // Keep loading state for a bit to show feedback
            setTimeout(() => setIsButtonLoading(false), 1000);
        }
    }, [onSequenceLoadRequest]);

    return  <Card className="gap-0 border-none py-0 bg-white shadow-sm">
        <CardHeader className="pt-4 pb-2">
            <CardTitle className="text-sm font-normal text-[var(--color-foreground)]/70">
                Gene Sequence
            </CardTitle>
        </CardHeader>

        <CardContent className="pb-4">
            {geneBounds && (
                <div className="mb-4 flex flex-col">
                    <div className="mb-2 flex flex-col items-center justify-between text-xs sm:flex-row">
                        <span className="flex items-center gap-1 text-[var(--color-foreground)]/70">
                            <p className="sm:hidden">From: </p>
                            <p>{Math.min(geneBounds.max, geneBounds.min).toLocaleString()}</p>
                        </span>
                        <span className="text-[var(--color-foreground)]/70">
                            Selected: {parseInt(startPosition || "0", 10).toLocaleString()} -{" "}
                            {parseInt(endPosition || "0").toLocaleString()} – ({currentRangeSize.toLocaleString()} bp) 
                        </span>
                        <span className="flex items-center gap-1 text-[var(--color-foreground)]/70">
                            <p className="sm:hidden">To: </p>
                            <p>{Math.max(geneBounds.max, geneBounds.min).toLocaleString()}</p>
                        </span>
                    </div>

                    {/* Slider Component */}
                    <div className="space-y-4">
                        <div className="relative">
                            <div 
                            ref={sliderRef}
                            className="relative h-6 w-full cursor-pointer mb-2">
                                {/* Track Background */}
                                <div className="absolute top-1/2 h-2 w-full -translate-y-1/2 rounded-full bg-[var(--color-muted)] ">   
                                    {/* Selected Range */}
                                    <div 
                                    className="absolute top-1/2 h-2 -translate-y-1/2 cursor-grab rounded-full bg-[var(--color-primary)] active:cursor-grabbing"
                                    style={{
                                        left: `${sliderValues.start}%`, 
                                        width: `${sliderValues.end - sliderValues.start}%`
                                        }}
                                    onMouseDown={handleRangeMouseDown}
                                        >
                                    </div>
                                    {/* Start handle */}
                                    <div 
                                    className="absolute top-1/2 h-6 w-6 flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-[var(--color-primary)] bg-white shadow active:cursor-grabbing"
                                    style={{
                                        left: `${sliderValues.start}%`, 
                                    }}
                                    onMouseDown={(e) => handleMouseDown(e, "start")}>
                                        <div className="h-3 w-1 rounded-full bg-[var(--color-primary)]">
                                        </div>
                                    </div>
                                    {/* End  handle */}
                                    <div 
                                    className="absolute top-1/2 h-6 w-6 flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-[var(--color-primary)] bg-white shadow active:cursor-grabbing"
                                    style={{
                                        left: `${sliderValues.end}%`, 
                                    }}
                                    onMouseDown={(e) => handleMouseDown(e, "end")}>
                                        <div className="h-3 w-1 rounded-full bg-[var(--color-primary)]">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Position Controls */}
                            <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-[var(--color-foreground)]/70">Start:</span>
                                        <Input 
                                        value={startPosition}
                                        onChange={(e) => onStartPositionChange(e.target.value)}
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        className="h-7 w-full border-[var(--color-border)] text-xs sm:w-28"
                                        />
                                    </div>
                                    <Button
                                        size="sm"
                                        disabled={isLoading || isButtonLoading}
                                        onClick={handleLoadSequenceClick}
                                        className="h-7 w-full cursor-pointer bg-[var(--color-primary)] text-xs text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary)]/90 sm:w-auto"
                                        >
                                            {isLoading || isButtonLoading ? (
                                                <>
                                                    <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                                                    Loading...
                                                </>
                                            ) : (
                                                "Load Sequence"
                                            )}
                                        </Button>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-[var(--color-foreground)]/70">End:</span>
                                            <Input 
                                                value={endPosition}
                                                onChange={(e) => onEndPositionChange(e.target.value)}
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                className="h-7 w-full border-[var(--color-border)] text-xs sm:w-28"
                                            />
                                        </div>
                                </div>
                        </div>

                    </div>
                </div>
            )}

            <div className="mb-4 flex items-center justify-between text-xs">
                <span className="text-[var(--color-foreground)]/70">
                    {geneDetails?.genomicinfo?.[0]?.strand == "+" ? (
                    "Forward Strand (5' -> 3')" ) : ( 
                    geneDetails?.genomicinfo?.[0]?.strand == "-" ) ? (
                    "Reverse Strand (3' <- 5')" ) : ( 
                    "Strand information is not available." )}
                </span>
                <span className="text-[var(--color-foreground)]/70">Maximum window range: {maxViewRange.toLocaleString()} bp</span>
            </div>

            {error && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 p-3 text-sm text-[var(--color-destructive)]">
                    <span className="mt-0.5 text-lg">⚠️</span>
                    <div>
                        <div className="font-medium">Error loading sequence:</div>
                        <div className="mt-1">{error}</div>
                        {error.includes("429") || error.includes("rate limit") ? (
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

            {/* Queue Status Indicator */}
            {isCurrentRegionQueuedOrProcessing && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-primary)] bg-[var(--color-primary)]/10 p-3 text-sm text-[var(--color-primary)]">
                    <span className="mt-0.5 text-lg">⏳</span>
                    <div>
                        <div className="font-medium">NCBI Request Queue:</div>
                        <div className="mt-1 text-xs">
                            {ncbiQueueStatus?.isProcessing ? (
                                <span>Processing request... ({ncbiQueueStatus?.relevantQueueLength} in queue)</span>
                            ) : (
                                <span>Waiting to process... ({ncbiQueueStatus?.relevantQueueLength} in queue)</span>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {ucscQueueStatus && ucscQueueStatus.relevantQueueLength > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-[var(--color-primary)] bg-[var(--color-primary)]/10 p-3 text-sm text-[var(--color-primary)]">
                    <span className="mt-0.5 text-lg">⏳</span>
                    <div>
                        <div className="font-medium">UCSC Request Queue:</div>
                        <div className="mt-1 text-xs">
                            {ucscQueueStatus.isProcessing ? (
                                <span>Processing request... ({ucscQueueStatus.relevantQueueLength} in queue)</span>
                            ) : (
                                <span>Waiting to process... ({ucscQueueStatus.relevantQueueLength} in queue)</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="w-full mb-2 rounded-md bg-[var(--color-muted)]/50 p-3">
                {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]">
                    </div>
                </div> ) : sequenceData ? (
                    <div className="h-64 overflow-x-auto overflow-y-auto"> 
                        <pre className="font-mono text-xs leading-relaxed">
                            {formattedSequence}
                        </pre>
                    </div>
                ) : <p className="text-center text-sm text-[var(--color-foreground)]/60">
                    {error ? "Error loading sequence." : "No sequence data loaded."}
                    </p>}
            </div>

            {hoverPosition != null && mousePosition != null && (
                <div 
                    className="pointer-events-none fixed z-50 rounded bg-[var(--color-primary)] px-2 py-1 text-xs text-[var(--color-primary-foreground)]"
                    style={{
                        top: mousePosition.y - 30,
                        left: mousePosition.x,
                        transform: "translateX(-50)",
                    }}
                >
                    Position: {hoverPosition.toLocaleString()}
                </div>
            ) }

            <div className="mt-3 flex items-center gap-4">
                <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-[var(--color-nucleotide-a)]"></div>
                    <span className="text-xs text-[var(--color-foreground)]/70">A</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-[var(--color-nucleotide-t)]"></div>
                    <span className="text-xs text-[var(--color-foreground)]/70">T</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-[var(--color-nucleotide-g)]"></div>
                    <span className="text-xs text-[var(--color-foreground)]/70">G</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="h-3 w-3 rounded-full bg-[var(--color-nucleotide-c)]"></div>
                    <span className="text-xs text-[var(--color-foreground)]/70">C</span>
                </div>
            </div>
        </CardContent>
    </Card>
}