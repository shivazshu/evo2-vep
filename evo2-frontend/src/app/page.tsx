"use client"

import { Search, BookOpen, ChevronDown} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import GeneViewer from "../components/gene-viewer";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  getAvailableGenomes,
  getGenomeChromosomes,
  searchGenes,
  type GenomeAssemblyFromSearch,
  type ChromosomeFromSearch,
  type GeneFromSearch,
} from "../utils/redis-genome-api";

type Mode = "browse" | "search";

export default function HomePage() {
  const [genomes, setGenomes] = useState<GenomeAssemblyFromSearch[]>([]);
  const [selectedGenome, setSelectedGenome] = useState<string>("hg38");
  const [chromosomes, setChromosomes] = useState<ChromosomeFromSearch[]>([]);
  const [selectedChromosome, setSelectedChromosome] = useState<string>("chr1");
  const [selectedGene, setSelectedGene] = useState<GeneFromSearch | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeneFromSearch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("search");
  const [showDocsDropdown, setShowDocsDropdown] = useState(false);
  const [isLocalEnvironment, setIsLocalEnvironment] = useState(false);
  const [isEnvironmentDetected, setIsEnvironmentDetected] = useState(false);
  const docsDropdownRef = useRef<HTMLDivElement>(null);

  // Environment detection - done in useEffect to avoid hydration mismatch
  useEffect(() => {
    setIsLocalEnvironment(
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('localhost')
    );
    setIsEnvironmentDetected(true);
  }, []);

  const getSwaggerUrl = (showAdmin = false) => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://evo2-vep.onrender.com';
    
    if (showAdmin) {
      // Show full documentation including admin endpoints
      return `${apiBaseUrl}/docs`;
    } else {
      // Show filtered docs without admin endpoints
      return `${apiBaseUrl}/docs?hide_admin=true`;
    }
  };

  const handleSwaggerRedirect = (showAdmin = false) => {
    const swaggerUrl = getSwaggerUrl(showAdmin);
    window.open(swaggerUrl, '_blank', 'noopener,noreferrer');
    setShowDocsDropdown(false);
  };

  // Removed getDefaultDocsMode - now handled directly in the UI logic

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (docsDropdownRef.current && !docsDropdownRef.current.contains(event.target as Node)) {
        setShowDocsDropdown(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDocsDropdown(false);
      }
    };

    if (showDocsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showDocsDropdown]);

  useEffect(() => {
    const fetchGenomes = async () => {
      try {
        setIsLoading(true);
        const data = await getAvailableGenomes();
        if (data.genomes?.Human) {
          setGenomes(data.genomes.Human);
        } else {
          setGenomes([]);
        }
      } catch (err) {
        setError("Failed to load genome data");
        setGenomes([]);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchGenomes();
  }, []);

  useEffect(() => {
    const fetchChromosomes = async () => {
      try {
        setIsLoading(true);
        const data = await getGenomeChromosomes(selectedGenome);
        if (data.chromosomes) {
          setChromosomes(data.chromosomes);
          if (data.chromosomes.length > 0) {
            setSelectedChromosome(data.chromosomes[0]!.name);
          }
        } else {
          setChromosomes([]);
        }
      } catch (err) {
        setError("Failed to load chromosome data");
        setChromosomes([]);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchChromosomes();
  }, [selectedGenome]);

  const performGeneSearch = async (
    query: string,
    genome: string,
    filterFn?: (gene: GeneFromSearch) => boolean,
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await searchGenes(query, genome);
      const results = filterFn ? data.results.filter(filterFn) : data.results;

      setSearchResults(results);
      
      // Provide feedback if no results found
      if (results.length === 0) {
        if (mode === "search") {
          setError(`No genes found matching "${query}". Please check the spelling or try a different search term.`);
        } else {
          setError(`No genes found on ${selectedChromosome}. This chromosome may not have any genes in the current database.`);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to search genes: ${errorMessage}. Please check your internet connection and try again.`);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedChromosome || mode !== "browse") return;
    void performGeneSearch(
      selectedChromosome,
      selectedGenome,
      (gene: GeneFromSearch) => gene.chrom === selectedChromosome,
    );
  }, [selectedChromosome, selectedGenome, mode]);

  const handleGenomeChange = (value: string) => {
    setSelectedGenome(value);
    setSearchResults([]);
    setSelectedGene(null);
  };

  const switchMode = (newMode: Mode) => {
    if (newMode === mode) return;

    setSearchResults([]);
    setSelectedGene(null);
    setError(null);

    if (newMode === "browse" && selectedChromosome) {
      void performGeneSearch(
        selectedChromosome,
        selectedGenome,
        (gene: GeneFromSearch) => gene.chrom === selectedChromosome,
      );
    }

    setMode(newMode);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    void performGeneSearch(searchQuery, selectedGenome);
  };

  const loadBRCA1Example = () => {
    setMode("search");
    setSearchQuery("BRCA1");
    void performGeneSearch("BRCA1", selectedGenome);
  };

  return (
    <div className="min-h-screen bg-[var(--color-muted)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <h1 className="text-xl font-light tracking-wide text-[var(--color-foreground)]">
                  <span className="font-normal">EVO</span>
                  <span className="text-[var(--color-brand-primary)]">2</span>
                </h1>
                <div className="absolute -bottom-1 left-0 h-[2px] w-12 bg-[var(--color-brand-primary)]"></div>
              </div>
              <span className="text-sm font-light text-[var(--color-muted-foreground)]">
                Variant Analysis
              </span>
            </div>
            
            {/* API Documentation */}
            {!isEnvironmentDetected ? (
              /* Loading state to prevent hydration mismatch */
              <Button
                variant="ghost"
                className="h-9 px-3 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] flex items-center gap-2"
                disabled
                title="Loading..."
              >
                <BookOpen className="h-4 w-4" />
                <span className="text-sm">Docs</span>
              </Button>
            ) : isLocalEnvironment ? (
              /* Development: Show dropdown with options */
              <div className="relative" ref={docsDropdownRef}>
                <div className="flex">
                  <Button
                    variant="ghost"
                    className="h-9 px-3 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] flex items-center gap-2 rounded-r-none"
                    onClick={() => handleSwaggerRedirect(true)} // Default to full API in development
                    title="API Documentation"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span className="text-sm">Docs</span>
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9 w-8 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] rounded-l-none border-l border-[var(--color-border)]"
                    onClick={() => setShowDocsDropdown(!showDocsDropdown)}
                    title="Documentation Options"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                
                {showDocsDropdown && (
                  <div className="absolute right-0 top-full mt-1 w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg z-50">
                    <div className="px-3 py-2 border-b border-[var(--color-border)]">
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        Environment: <span className="font-medium text-[var(--color-foreground)]">Development</span>
                      </div>
                    </div>
                    <div className="py-1">
                      <button
                        className="w-full px-4 py-2 text-left text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)] flex items-start gap-3"
                        onClick={() => handleSwaggerRedirect(false)}
                      >
                        <BookOpen className="h-4 w-4 mt-0.5 text-[var(--color-brand-primary)]" />
                        <div>
                          <div className="font-medium">Public API</div>
                          <div className="text-xs text-[var(--color-muted-foreground)]">
                            User-facing endpoints only
                          </div>
                        </div>
                      </button>
                      <button
                        className="w-full px-4 py-2 text-left text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)] flex items-start gap-3"
                        onClick={() => handleSwaggerRedirect(true)}
                      >
                        <BookOpen className="h-4 w-4 mt-0.5 text-[var(--color-warning)]" />
                        <div>
                          <div className="font-medium">Full API</div>
                          <div className="text-xs text-[var(--color-muted-foreground)]">
                            Including admin & monitoring
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Production/Netlify: Simple button that goes directly to public docs */
              <Button
                variant="ghost"
                className="h-9 px-3 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] flex items-center gap-2"
                onClick={() => handleSwaggerRedirect(false)} // Always public API in production
                title="API Documentation"
              >
                <BookOpen className="h-4 w-4" />
                <span className="text-sm">API Docs</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        {selectedGene ? (
          <GeneViewer
            gene={selectedGene}
            genomeId={selectedGenome}
            onClose={() => setSelectedGene(null)}
          />
        ) : (
          <>
            <Card className="mb-6 gap-0 border-none bg-[var(--color-card)] py-0 shadow-sm">
              <CardHeader className="pt-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-normal text-[var(--color-muted-foreground)]">
                    Genome Assembly
                  </CardTitle>
                  <div className="text-xs text-[var(--color-muted-foreground)]">
                    Organism: <span className="font-medium">Human</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <Select
                  value={selectedGenome}
                  onValueChange={handleGenomeChange}
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-9 w-full border-[var(--color-border)]">
                    <SelectValue placeholder="Select genome assembly" />
                  </SelectTrigger>
                  <SelectContent>
                    {(genomes || []).map((genome) => (
                      <SelectItem key={genome.id} value={genome.id}>
                        {genome.id} - {genome.name}
                        {genome.active ? " (active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedGenome && (
                  <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                    {
                      genomes.find((genome) => genome.id === selectedGenome)
                        ?.sourceName
                    }
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="mt-6 gap-0 border-none bg-[var(--color-card)] py-0 shadow-sm">
              <CardHeader className="pt-4 pb-2">
                <CardTitle className="text-sm font-normal text-[var(--color-muted-foreground)]">
                  Browse
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <Tabs
                  value={mode}
                  onValueChange={(value) => switchMode(value as Mode)}
                >
                  <TabsList className="mb-4 bg-[var(--color-muted)]">
                    <TabsTrigger
                      className="data-[state=active]:bg-[var(--color-card)] data-[state=active]:text-[var(--color-foreground)]"
                      value="search"
                    >
                      Search Genes
                    </TabsTrigger>
                    <TabsTrigger
                      className="data-[state=active]:bg-[var(--color-card)] data-[state=active]:text-[var(--color-foreground)]"
                      value="browse"
                    >
                      Browse Chromosomes
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="search" className="mt-0">
                    <div className="space-y-4">
                      <form
                        onSubmit={handleSearch}
                        className="flex flex-col gap-3 sm:flex-row"
                      >
                        <div className="relative flex-1">
                          <Input
                            type="text"
                            placeholder="Enter gene symbol or name"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 border-[var(--color-border)] pr-10"
                          />
                          <Button
                            type="submit"
                            className="absolute top-0 right-0 h-full cursor-pointer rounded-l-none bg-[var(--color-foreground)] text-[var(--color-card)] hover:bg-[var(--color-foreground)]/90"
                            size="icon"
                            disabled={isLoading || !searchQuery.trim()}
                          >
                            <Search className="h-4 w-4" />
                            <span className="sr-only">Search</span>
                          </Button>
                        </div>
                      </form>
                      <Button
                        variant="link"
                        className="h-auto cursor-pointer p-0 text-[var(--color-brand-primary)] hover:text-[var(--color-brand-primary)]/80"
                        onClick={loadBRCA1Example}
                      >
                        Try BRCA1 example
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="browse" className="mt-0">
                    <div className="max-h-[150px] overflow-y-auto pr-1">
                      <div className="flex flex-wrap gap-2">
                        {(chromosomes || []).map((chrom) => (
                          <Button
                            key={chrom.name}
                            variant="outline"
                            size="sm"
                            className={`h-8 cursor-pointer border-[var(--color-border)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] ${selectedChromosome === chrom.name ? "text-[var(--color-foreground)] bg-[var(--color-muted)]" : ""}`}
                            onClick={() => setSelectedChromosome(chrom.name)}
                          >
                            {chrom.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                {isLoading && (
                  <div className="flex justify-center py-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-brand-primary)]"></div>
                  </div>
                )}

                {error && (
                  <div className="mt-4 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning)]/10 text-xs text-[var(--color-warning)] p-3">
                    {error}
                  </div>
                )}

                {searchResults.length > 0 && !isLoading && (
                  <div className="mt-6">
                    <div className="mb-2">
                      <h4 className="text-xs font-normal text-[var(--color-muted-foreground)]">
                        {mode === "search" ? (
                          <>
                            Search Results:{" "}
                            <span className="font-medium text-[var(--color-foreground)]">
                              {searchResults.length} genes
                            </span>
                          </>
                        ) : (
                          <>
                            Genes on {selectedChromosome}:{" "}
                            <span className="font-medium text-[var(--color-foreground)]">
                              {searchResults.length} found
                            </span>
                          </>
                        )}
                      </h4>
                    </div>

                    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-[var(--color-muted)] hover:bg-[var(--color-muted)]/50">
                              <TableHead className="whitespace-nowrap text-xs font-normal text-[var(--color-muted-foreground)]">
                                Symbol
                              </TableHead>
                              <TableHead className="whitespace-nowrap text-xs font-normal text-[var(--color-muted-foreground)]">
                                Name
                              </TableHead>
                              <TableHead className="whitespace-nowrap text-xs font-normal text-[var(--color-muted-foreground)]">
                                Location
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(searchResults || []).map((gene, index) => (
                              <TableRow
                                key={`${gene.symbol}-${index}`}
                                className="cursor-pointer border-b border-[var(--color-border)] hover:bg-[var(--color-muted)]/50"
                                onClick={() => setSelectedGene(gene)}
                              >
                                <TableCell className="whitespace-nowrap py-2 font-medium text-[var(--color-foreground)]">
                                  {gene.symbol}
                                </TableCell>
                                <TableCell className="whitespace-nowrap py-2 font-medium text-[var(--color-foreground)]">
                                  {gene.name}
                                </TableCell>
                                <TableCell className="whitespace-nowrap py-2 font-medium text-[var(--color-foreground)]">
                                  {gene.chrom}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                )}

                {!isLoading && !error && searchResults.length === 0 && (
                  <div className="flex h-48 flex-col items-center justify-center text-center text-[var(--color-muted-foreground)]">
                    <Search className="mb-4 h-10 w-10 text-[var(--color-muted-foreground)]" />
                    <p className="text-sm leading-relaxed">
                      {mode === "search"
                        ? "Enter a gene or symbol and click search"
                        : selectedChromosome
                          ? "No genes found on this chromosome"
                          : "Select a chromosome to view genes"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
