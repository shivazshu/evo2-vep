import { useMemo, useCallback, useRef } from "react";

/**
 * Custom hook to memoize expensive calculations with proper dependency tracking
 */
export function useMemoizedValue<T>(
    factory: () => T,
    dependencies: React.DependencyList
): T {
    return useMemo(factory, dependencies);
}

/**
 * Custom hook to create stable callback references
 */
export function useStableCallback<T extends (...args: unknown[]) => unknown>(
    callback: T
): T {
    return useCallback(callback, []);
}

/**
 * Custom hook to debounce function calls
 */
export function useDebounce<T extends (...args: unknown[]) => unknown>(
    callback: T,
    delay: number
): T {
    const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

    return useCallback(
        ((...args: Parameters<T>) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => callback(...args), delay);
        }) as T,
        [callback, delay]
    );
}

/**
 * Custom hook to throttle function calls
 */
export function useThrottle<T extends (...args: unknown[]) => unknown>(
    callback: T,
    delay: number
): T {
    const lastCallRef = useRef(0);
    const lastCallTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

    return useCallback(
        ((...args: Parameters<T>) => {
            const now = Date.now();
            
            if (now - lastCallRef.current >= delay) {
                callback(...args);
                lastCallRef.current = now;
            } else {
                if (lastCallTimerRef.current) {
                    clearTimeout(lastCallTimerRef.current);
                }
                lastCallTimerRef.current = setTimeout(() => {
                    callback(...args);
                    lastCallRef.current = Date.now();
                }, delay - (now - lastCallRef.current));
            }
        }) as T,
        [callback, delay]
    );
}

/**
 * Utility to check if two arrays have the same elements
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
}

/**
 * Utility to check if two objects have the same values
 */
export function objectsEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => a[key] === b[key]);
}

/**
 * Custom hook to memoize objects with deep comparison
 */
export function useMemoizedObject<T extends Record<string, unknown>>(obj: T): T {
    const prevObjRef = useRef<T | undefined>(undefined);
    
    return useMemo(() => {
        if (prevObjRef.current && objectsEqual(prevObjRef.current, obj)) {
            return prevObjRef.current;
        }
        prevObjRef.current = obj;
        return obj;
    }, [obj]);
}

/**
 * Custom hook to memoize arrays with deep comparison
 */
export function useMemoizedArray<T>(arr: T[]): T[] {
    const prevArrRef = useRef<T[] | undefined>(undefined);
    
    return useMemo(() => {
        if (prevArrRef.current && arraysEqual(prevArrRef.current, arr)) {
            return prevArrRef.current;
        }
        prevArrRef.current = arr;
        return arr;
    }, [arr]);
} 