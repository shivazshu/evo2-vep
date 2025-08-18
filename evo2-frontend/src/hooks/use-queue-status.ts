import { useEffect, useState, useRef } from "react";
import { getNcbiQueueStatus, getUcscQueueStatus } from "../utils/redis-genome-api";

// Define types locally to avoid import issues
interface QueuedRequest<T> {
    meta?: T;
}

interface NcbiQueueMeta {
    geneId?: string;
    chrom?: string;
    genomeId?: string;
    start?: number;
    end?: number;
}

interface UcscQueueMeta {
    chrom?: string;
    genomeId?: string;
}

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
    const ncbiMetaRef = useRef<NcbiQueueMeta | undefined>(ncbiMeta);
    const ucscMetaRef = useRef<UcscQueueMeta | undefined>(ucscMeta);
    
    // Update refs when meta objects change
    ncbiMetaRef.current = ncbiMeta;
    ucscMetaRef.current = ucscMeta;

    useEffect(() => {
        const checkQueueStatus = () => {
            setNcbiQueueStatus(getNcbiQueueStatus(ncbiMetaRef.current) as QueueStatus);
            setUcscQueueStatus(getUcscQueueStatus(ucscMetaRef.current) as Omit<QueueStatus, 'queue' | 'processingRequest'>);
        };

        checkQueueStatus();
        const interval = setInterval(checkQueueStatus, checkInterval);
        
        return () => clearInterval(interval);
    }, [checkInterval]); // Only depend on checkInterval

    const isCurrentRegionQueuedOrProcessing = (() => {
        if (!ncbiQueueStatus || !ncbiMetaRef.current) return false;
        
        const meta = ncbiMetaRef.current;
        if (!meta.chrom || !meta.genomeId || meta.start === undefined || meta.end === undefined) return false;
        
        const queue = ncbiQueueStatus.queue ?? [];
        const processingRequest = ncbiQueueStatus.processingRequest;
        
        const matches = (req: QueuedRequest<unknown>) => {
            const reqMeta = req?.meta as NcbiQueueMeta | undefined;
            return reqMeta?.chrom === meta.chrom &&
                   reqMeta?.genomeId === meta.genomeId &&
                   reqMeta?.start === meta.start &&
                   reqMeta?.end === meta.end;
        };
            
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