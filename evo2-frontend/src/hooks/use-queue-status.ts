import { useEffect, useState, useRef } from "react";
import { getNcbiQueueStatus, getUcscQueueStatus, type QueuedRequest, type NcbiQueueMeta, type UcscQueueMeta } from "../utils/genome-api";

interface QueueStatus {
    queueLength: number;
    isProcessing: boolean;
    lastRequestTime: number;
    relevantQueueLength: number;
    queue?: QueuedRequest<unknown>[];
    processingRequest?: QueuedRequest<unknown>;
}

interface UseQueueStatusOptions {
    ncbiMeta?: NcbiQueueMeta;
    ucscMeta?: UcscQueueMeta;
    checkInterval?: number;
}

export function useQueueStatus({ 
    ncbiMeta, 
    ucscMeta, 
    checkInterval = 1000 
}: UseQueueStatusOptions = {}) {
    const [ncbiQueueStatus, setNcbiQueueStatus] = useState<QueueStatus | null>(null);
    const [ucscQueueStatus, setUcscQueueStatus] = useState<Omit<QueueStatus, 'queue' | 'processingRequest'> | null>(null);
    
    // Use refs to store the latest meta objects to avoid dependency issues
    const ncbiMetaRef = useRef(ncbiMeta);
    const ucscMetaRef = useRef(ucscMeta);
    
    // Update refs when meta objects change
    ncbiMetaRef.current = ncbiMeta;
    ucscMetaRef.current = ucscMeta;

    useEffect(() => {
        const checkQueueStatus = () => {
            setNcbiQueueStatus(getNcbiQueueStatus(ncbiMetaRef.current));
            setUcscQueueStatus(getUcscQueueStatus(ucscMetaRef.current ?? undefined));
        };

        checkQueueStatus();
        const interval = setInterval(checkQueueStatus, checkInterval);
        
        return () => clearInterval(interval);
    }, [checkInterval]); // Only depend on checkInterval

    const isCurrentRegionQueuedOrProcessing = (() => {
        if (!ncbiQueueStatus || !ncbiMetaRef.current) return false;
        
        const { chrom, genomeId, start, end } = ncbiMetaRef.current;
        if (!chrom || !genomeId || start === undefined || end === undefined) return false;
        
        const queue = ncbiQueueStatus.queue ?? [];
        const processingRequest = ncbiQueueStatus.processingRequest;
        
        const matches = (req: QueuedRequest<unknown>) =>
            req?.meta?.chrom === chrom &&
            req?.meta?.genomeId === genomeId &&
            req?.meta?.start === start &&
            req?.meta?.end === end;
            
        return (
            queue.some(matches) || (processingRequest && matches(processingRequest))
        );
    })();

    return {
        ncbiQueueStatus,
        ucscQueueStatus,
        isCurrentRegionQueuedOrProcessing
    };
} 