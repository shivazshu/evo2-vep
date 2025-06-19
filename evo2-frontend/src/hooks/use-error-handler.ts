import { useState, useCallback } from "react";
import { getUserFriendlyMessage, shouldUseFallback, getFallbackData } from "~/utils/error-handling";

interface UseErrorHandlerOptions {
    fallbackDataKey?: keyof ReturnType<typeof getFallbackData>;
    showFallbackMessage?: boolean;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [fallbackData, setFallbackData] = useState<unknown>(null);

    const handleError = useCallback((err: unknown, context?: string) => {
        const errorMessage = getUserFriendlyMessage(err);
        setError(errorMessage);
        
        if (shouldUseFallback(err) && options.fallbackDataKey) {
            const fallback = getFallbackData(options.fallbackDataKey);
            if (fallback) {
                setFallbackData(fallback);
                if (options.showFallbackMessage) {
                    setError(`${errorMessage} Using cached data.`);
                }
            }
        }
        
        console.error(`Error in ${context ?? 'unknown context'}:`, err);
    }, [options.fallbackDataKey, options.showFallbackMessage]);

    const clearError = useCallback(() => {
        setError(null);
        setFallbackData(null);
    }, []);

    const executeWithErrorHandling = useCallback(async <T>(
        operation: () => Promise<T>,
        context?: string
    ): Promise<T | null> => {
        setIsLoading(true);
        setError(null);
        
        try {
            const result = await operation();
            return result;
        } catch (err) {
            handleError(err, context);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [handleError]);

    return {
        error,
        isLoading,
        fallbackData,
        setError,
        setIsLoading,
        handleError,
        clearError,
        executeWithErrorHandling
    };
} 