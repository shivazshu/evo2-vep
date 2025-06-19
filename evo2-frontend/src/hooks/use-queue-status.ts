import { useEffect, useState, useMemo } from "react";
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

    useEffect(() => {
        const checkQueueStatus = () => {
            setNcbiQueueStatus(getNcbiQueueStatus(ncbiMeta));
            setUcscQueueStatus(getUcscQueueStatus(ucscMeta ?? undefined));
        };

        checkQueueStatus();
        const interval = setInterval(checkQueueStatus, checkInterval);
        
        return () => clearInterval(interval);
    }, [ncbiMeta, ucscMeta, checkInterval]);

    const isCurrentRegionQueuedOrProcessing = useMemo(() => {
        if (!ncbiQueueStatus || !ncbiMeta) return false;
        
        const { chrom, genomeId, start, end } = ncbiMeta;
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
    }, [ncbiQueueStatus, ncbiMeta]);

    return {
        ncbiQueueStatus,
        ucscQueueStatus,
        isCurrentRegionQueuedOrProcessing
    };
} 