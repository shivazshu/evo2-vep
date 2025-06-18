export function getNucleotideColorClass(nucleotide: string) : string {
    switch(nucleotide.toUpperCase()) {
        case "A":
            return "text-[var(--color-nucleotide-a)]";
        case "T":
            return "text-[var(--color-nucleotide-t)]";
        case "G":
            return "text-[var(--color-nucleotide-g)]";
        case "C":
            return "text-[var(--color-nucleotide-c)]";
        default:
            return "text-muted-foreground";
    }
}

export function getClassificationColorClasses(classification: string) : string {
    if (!classification) return "bg-[var(--color-uncertain)]/10 text-[var(--color-uncertain)]";
    const lowercaseClass = classification.toLowerCase();

    if (lowercaseClass.includes("pathogenic")) {
        return "bg-[var(--color-pathogenic)]/10 text-[var(--color-pathogenic)]";
    } else if (lowercaseClass.includes("benign")) {
        return "bg-[var(--color-benign)]/10 text-[var(--color-benign)]";
    } else {
        return "bg-[var(--color-uncertain)]/10 text-[var(--color-uncertain)]";
    }
}