from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.openapi.utils import get_openapi
import logging
from typing import Optional
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
import uvicorn
from fastapi.responses import Response
import os
import time
import copy
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from cached_apis import cached_apis
from cache_manager import get_cache_stats, clear_cache_pattern, get_connection_info
from proxy_apis import proxy_apis

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app with disabled default docs
app = FastAPI(
    title="Evo2 Genome API",
    description="Redis-cached genome data API for Evo2 variant analysis",
    version="1.0.0",
    docs_url=None,  # Disable default docs
    redoc_url=None,  # Disable default redoc
    openapi_url=None  # Disable default openapi.json
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response validation

# Request Models
class GeneSearchRequest(BaseModel):
    query: str = Field(..., description="Gene symbol, name, or keyword", example="BRCA1")
    genome: str = Field(..., description="Genome assembly identifier", example="hg38")

class GeneSequenceRequest(BaseModel):
    chrom: str = Field(..., description="Chromosome identifier", example="chr17")
    start: int = Field(..., description="Start position (1-based)", example=43044294)
    end: int = Field(..., description="End position (1-based)", example=43170245)
    genome_id: str = Field(..., description="Genome assembly identifier", example="hg38")

class GeneDetailsRequest(BaseModel):
    gene_id: str = Field(..., description="Gene ID from search results", example="672")

class GenomeRequest(BaseModel):
    genome_id: str = Field(..., description="Genome assembly identifier", example="hg38")

# Response Models
class GenomeAssembly(BaseModel):
    id: str = Field(..., description="Genome assembly identifier", example="hg38")
    name: str = Field(..., description="Assembly name", example="Dec. 2013 (GRCh38/hg38)")
    active: bool = Field(..., description="Currently active", example=True)
    sourceName: str = Field(..., description="Source organization", example="Genome Reference Consortium GRCh38")

class GenomesResponse(BaseModel):
    genomes: Dict[str, List[GenomeAssembly]] = Field(
        ..., 
        description="Genome assemblies by organism",
        example={
            "Human": [
                {
                    "id": "hg38",
                    "name": "Dec. 2013 (GRCh38/hg38)",
                    "active": True,
                    "sourceName": "Genome Reference Consortium GRCh38"
                }
            ]
        }
    )

class Chromosome(BaseModel):
    name: str = Field(..., description="Chromosome identifier", example="chr1")
    size: int = Field(..., description="Length in base pairs", example=248956422)

class ChromosomesResponse(BaseModel):
    chromosomes: List[Chromosome] = Field(
        ...,
        description="Chromosomes for genome",
        example=[
            {"name": "chr1", "size": 248956422},
            {"name": "chr2", "size": 242193529}
        ]
    )

class Gene(BaseModel):
    symbol: str = Field(..., description="Gene symbol", example="BRCA1")
    name: str = Field(..., description="Gene type/name", example="protein-coding")
    chrom: str = Field(..., description="Chromosome", example="chr17")
    description: str = Field(..., description="Gene description", example="protein-coding")
    gene_id: Optional[str] = Field(None, description="Gene ID", example="672")

class GeneSearchResponse(BaseModel):
    query: str = Field(..., description="Original search query", example="BRCA1")
    genome: str = Field(..., description="Genome assembly used", example="hg38")
    results: List[Gene] = Field(
        ...,
        description="Matching genes found",
        example=[
            {
                "symbol": "BRCA1",
                "name": "protein-coding",
                "chrom": "chr17",
                "description": "protein-coding",
                "gene_id": "672"
            }
        ]
    )

class GenomicInfo(BaseModel):
    chrstart: int = Field(..., description="Gene start position", example=43044294)
    chrstop: int = Field(..., description="Gene end position", example=43170245)
    strand: Optional[str] = Field(None, description="Strand orientation (+/-)", example="-")

class Organism(BaseModel):
    scientificname: str = Field(..., description="Scientific species name", example="Homo sapiens")
    commonname: str = Field(..., description="Common species name", example="human")

class GeneDetails(BaseModel):
    genomicinfo: Optional[List[GenomicInfo]] = Field(None, description="Genomic location information")
    summary: Optional[str] = Field(None, description="Gene function summary")
    organism: Optional[Organism] = Field(None, description="Organism information")

class GeneDetailsResponse(BaseModel):
    geneDetails: Optional[GeneDetails] = Field(None, description="Detailed gene information")
    geneBounds: Optional[Dict[str, int]] = Field(None, description="Gene boundaries", example={"min": 43044294, "max": 43170245})
    initialRange: Optional[Dict[str, int]] = Field(None, description="Initial display range", example={"start": 43044294, "end": 43054293})

class GeneSequenceResponse(BaseModel):
    sequence: str = Field(..., description="DNA sequence string", example="ATCGATCGATCG...")
    actualRange: Dict[str, int] = Field(..., description="Actual sequence range returned", example={"start": 43044294, "end": 43054293})
    error: Optional[str] = Field(None, description="Error message if sequence retrieval failed")

class ClinVarVariant(BaseModel):
    clinvar_id: str = Field(..., description="ClinVar variant identifier", example="VCV000001234")
    title: str = Field(..., description="Variant title/name", example="NM_007294.4(BRCA1):c.5266dupC")
    variation_type: str = Field(..., description="Type of genetic variation", example="Duplication")
    classification: str = Field(..., description="Clinical significance", example="Pathogenic")
    gene_sort: str = Field(..., description="Associated gene", example="BRCA1")
    chromosome: str = Field(..., description="Chromosome location", example="17")
    location: str = Field(..., description="Genomic location", example="17:43045677")

class HealthResponse(BaseModel):
    status: str = Field(..., description="Service health status", example="healthy")
    service: str = Field(..., description="Service identifier", example="evo2-genome-api")

class CacheStats(BaseModel):
    message: str = Field(..., description="Status message")
    total_entries_cleared: int = Field(..., description="Total cache entries cleared")
    breakdown: Dict[str, int] = Field(..., description="Breakdown by cache type")

class AnalysisResult(BaseModel):
    position: int = Field(..., description="Variant position", example=43045677)
    reference: str = Field(..., description="Reference allele", example="G")
    alternative: str = Field(..., description="Alternative allele", example="A")
    delta_score: float = Field(..., description="EVO2 delta score", example=-0.85)
    prediction: str = Field(..., description="Pathogenicity prediction", example="Pathogenic")
    classification_confidence: float = Field(..., description="Prediction confidence", example=0.92)
    strand: Optional[str] = Field(None, description="DNA strand", example="+")

# Custom OpenAPI schema generation (disabled caching for filtering to work)
def custom_openapi():
    # Always generate fresh schema to avoid caching issues with filtering
    openapi_schema = get_openapi(
        title="Evo2 Genome API",
        version="1.0.0",
        description="Redis-cached genome data API for Evo2 variant analysis",
        routes=app.routes,
    )
    return openapi_schema

def filtered_openapi(hide_admin: bool = False):
    """Generate OpenAPI schema with optional admin endpoint filtering"""
    # Enhanced description based on filtering
    if hide_admin:
        description = """
Genomics API for genome assemblies, gene search, DNA sequences, clinical variants, and AI-powered variant analysis.

**Key Features:** Genome data, gene search, DNA sequences, ClinVar variants, EVO2 AI analysis, NCBI/UCSC proxy access.
        """
    else:
        description = """
Complete genomics API with public endpoints and administrative access for developers and system administrators.

**Public:** Genome data, gene search, DNA sequences, clinical variants, AI analysis, external APIs.  
**Admin:** Health monitoring, cache management, system administration.

*Admin endpoints for development/authorized users only.*
        """
    
    # Get fresh schema each time to avoid caching issues
    openapi_schema = get_openapi(
        title="EVO2 Variant Effect Prediction API",
        version="1.0.0",
        description=description,
        routes=app.routes
    )
    
    if hide_admin:
        # Deep copy to avoid modifying the original
        openapi_schema = copy.deepcopy(openapi_schema)
        
        # Remove admin/monitoring endpoints from the schema based on tags
        paths_to_remove = []
        
        for path_key, path_info in openapi_schema.get("paths", {}).items():
            for method, method_info in path_info.items():
                if isinstance(method_info, dict) and "tags" in method_info:
                    if "Admin" in method_info["tags"]:
                        paths_to_remove.append(path_key)
                        break
        
        # Remove the identified admin paths
        for path_key in paths_to_remove:
            if path_key in openapi_schema["paths"]:
                del openapi_schema["paths"][path_key]
        
        # Update the description to indicate filtering
        openapi_schema["info"]["description"] = description
    
    return openapi_schema

# Custom docs endpoint with filtering
@app.get("/docs", response_class=HTMLResponse, include_in_schema=False)
async def custom_swagger_ui_html(hide_admin: bool = Query(False, description="Hide admin endpoints")):
    """Custom Swagger UI with optional admin endpoint filtering"""
    from fastapi.openapi.docs import get_swagger_ui_html
    
    openapi_url = f"/openapi.json?hide_admin={hide_admin}"
    
    # Different titles based on filtering
    title_suffix = " - Public API" if hide_admin else " - Full API"
    
    # Custom HTML with CSS to hide the OpenAPI URL
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{app.title + title_suffix}</title>
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
        <style>
            /* Hide the OpenAPI URL display */
            .information-container .info .url,
            .information-container .info hgroup.main a,
            .swagger-ui .info hgroup.main a,
            .swagger-ui .info .url {{
                display: none !important;
            }}
            
            /* Optional: Clean up spacing */
            .information-container .info hgroup.main {{
                margin-bottom: 0;
            }}
        </style>
    </head>
    <body>
        <div id="swagger-ui"></div>
        <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
        <script>
            SwaggerUIBundle({{
                url: '{openapi_url}',
                dom_id: '#swagger-ui',
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIBundle.presets.standalone
                ],
                layout: "BaseLayout",
                deepLinking: true,
                showExtensions: true,
                showCommonExtensions: true,
                validatorUrl: null
            }});
        </script>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content)

# Custom OpenAPI endpoint with filtering
@app.get("/openapi.json", include_in_schema=False)
async def custom_openapi_endpoint(hide_admin: bool = Query(False, description="Hide admin endpoints")):
    """Custom OpenAPI JSON with optional admin endpoint filtering"""
    logger.info(f"OpenAPI requested with hide_admin={hide_admin}")
    schema = filtered_openapi(hide_admin)
    
    return schema

# Test endpoints removed - not needed in production

# Health check endpoint
@app.get("/health", tags=["Admin"], response_model=HealthResponse)
async def health_check():
    """Returns API service status"""
    return {"status": "healthy", "service": "evo2-genome-api"}

# Cache management endpoints
@app.get("/cache/stats", tags=["Admin"])
async def get_cache_statistics():
    """Redis performance metrics and hit/miss ratios"""
    try:
        stats = get_cache_stats()
        return stats
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get cache statistics")

@app.get("/cache/connection", tags=["Admin"])
async def get_cache_connection_info():
    """Redis connection status and details"""
    try:
        connection_info = get_connection_info()
        return connection_info
    except Exception as e:
        logger.error(f"Error getting connection info: {e}")
        raise HTTPException(status_code=500, detail="Failed to get connection information")

@app.post("/cache/clear", tags=["Admin"], response_model=CacheStats)
async def clear_cache():
    """Removes all cached data (impacts performance temporarily)"""
    try:
        # Clear different cache patterns using new key structure
        genomes_cleared = clear_cache_pattern("evo2:genomes")
        chromosomes_cleared = clear_cache_pattern("evo2:chromosomes:*")
        gene_search_cleared = clear_cache_pattern("evo2:gene_search:*")
        gene_details_cleared = clear_cache_pattern("evo2:gene_details:*")
        sequence_cleared = clear_cache_pattern("evo2:sequence:*")
        clinvar_cleared = clear_cache_pattern("evo2:clinvar:*")
        variant_analysis_cleared = clear_cache_pattern("evo2:variant_analysis:*")
        ncbi_proxy_cleared = clear_cache_pattern("evo2:ncbi_proxy:*")
        ucsc_proxy_cleared = clear_cache_pattern("evo2:ucsc_proxy:*")
        
        total_cleared = (genomes_cleared + chromosomes_cleared + 
                        gene_search_cleared + gene_details_cleared + 
                        sequence_cleared + clinvar_cleared + 
                        variant_analysis_cleared + ncbi_proxy_cleared + ucsc_proxy_cleared)
        
        return {
            "message": "Cache cleared successfully",
            "total_entries_cleared": total_cleared,
            "breakdown": {
                "genomes": genomes_cleared,
                "chromosomes": chromosomes_cleared,
                "gene_search": gene_search_cleared,
                "gene_details": gene_details_cleared,
                "sequence": sequence_cleared,
                "clinvar": clinvar_cleared,
                "variant_analysis": variant_analysis_cleared,
                "ncbi_proxy": ncbi_proxy_cleared,
                "ucsc_proxy": ucsc_proxy_cleared
            }
        }
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear cache")

@app.post("/cache/clear/pattern/{pattern}", tags=["Admin"])
async def clear_cache_by_pattern(pattern: str):
    """Selective cache clearing (genomes, genes, sequences, etc.)"""
    try:
        cleared_count = clear_cache_pattern(f"evo2:{pattern}")
        return {
            "message": f"Cache pattern cleared: {pattern}",
            "entries_cleared": cleared_count
        }
    except Exception as e:
        logger.error(f"Error clearing cache pattern {pattern}: {e}")
        raise HTTPException(status_code=500, detail="Failed to clear cache pattern")

# Genome data endpoints
@app.get("/genomes", tags=["Genomes"], response_model=GenomesResponse)
async def get_available_genomes():
    """List all genome assemblies by organism (hg38, hg19, mm10, etc.)"""
    try:
        result = await cached_apis.get_available_genomes()
        return result
    except Exception as e:
        logger.error(f"Error fetching genomes: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch genome data")

@app.get("/genomes/{genome_id}/chromosomes", tags=["Genomes"], response_model=ChromosomesResponse)
async def get_genome_chromosomes(genome_id: str):
    """List all chromosomes and sizes for a genome assembly"""
    try:
        result = await cached_apis.get_genome_chromosomes(genome_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching chromosomes for genome {genome_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch chromosome data")

@app.post("/genes/search", tags=["Genes"], response_model=GeneSearchResponse)
async def search_genes(request: GeneSearchRequest):
    """Find genes by symbol, name, or keyword"""
    try:
        result = await cached_apis.search_genes(request.query, request.genome)
        return result
    except Exception as e:
        logger.error(f"Error searching genes for query '{request.query}': {e}")
        raise HTTPException(status_code=500, detail="Failed to search genes")

@app.get("/genes/search", tags=["Genes"], response_model=GeneSearchResponse)
async def search_genes_get(
    query: str = Query(..., description="Gene search query (symbol, name, or keyword)", example="BRCA1"),
    genome: str = Query(..., description="Genome assembly identifier", example="hg38")
):
    """Find genes by symbol, name, keyword, or chromosome (case-insensitive, partial matching)"""
    try:
        result = await cached_apis.search_genes(query, genome)
        return result
    except Exception as e:
        logger.error(f"Error searching genes for query '{query}': {e}")
        raise HTTPException(status_code=500, detail="Failed to search genes")

@app.post("/genes/details", tags=["Genes"], response_model=GeneDetailsResponse)
async def get_gene_details(request: GeneDetailsRequest):
    """Detailed gene information including coordinates and function"""
    try:
        result = await cached_apis.get_gene_details(request.gene_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching gene details for {request.gene_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch gene details")

@app.get("/genes/{gene_id}/details", tags=["Genes"], response_model=GeneDetailsResponse)
async def get_gene_details_get(gene_id: str):
    """Comprehensive gene information including coordinates, function, and organism data"""
    try:
        result = await cached_apis.get_gene_details(gene_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching gene details for {gene_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch gene details")

@app.post("/genes/sequence", tags=["Genes"], response_model=GeneSequenceResponse)
async def get_gene_sequence(request: GeneSequenceRequest):
    """DNA sequence for genomic coordinates"""
    try:
        result = await cached_apis.get_gene_sequence(
            request.chrom, 
            request.start, 
            request.end, 
            request.genome_id
        )
        return result
    except Exception as e:
        logger.error(f"Error fetching gene sequence: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch gene sequence")

@app.get("/genes/sequence", tags=["Genes"], response_model=GeneSequenceResponse)
async def get_gene_sequence_get(
    chrom: str = Query(..., description="Chromosome identifier (e.g., 'chr17', '17')", example="chr17"),
    start: int = Query(..., description="Start position (1-based, inclusive)", example=43044294),
    end: int = Query(..., description="End position (1-based, inclusive)", example=43054293),
    genome_id: str = Query(..., description="Genome assembly identifier", example="hg38")
):
    """DNA sequence for genomic coordinates (1-based, inclusive)"""
    try:
        result = await cached_apis.get_gene_sequence(chrom, start, end, genome_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching gene sequence: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch gene sequence")

# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

@app.get("/clinvar/variants", tags=["Variants"], response_model=List[ClinVarVariant])
async def get_clinvar_variants(
    chrom: str = Query(..., description="Chromosome identifier (e.g., 'chr17', '17')", example="chr17"),
    start: int = Query(..., description="Region start position (1-based)", example=43044294),
    end: int = Query(..., description="Region end position (1-based)", example=43170245),
    genome_id: str = Query(..., description="Genome assembly identifier", example="hg38")
):
    """Clinical variants with pathogenicity classifications in genomic region"""
    try:
        gene_bounds = {'min': start, 'max': end}
        result = await cached_apis.get_clinvar_variants(chrom, gene_bounds, genome_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching ClinVar variants: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch ClinVar variants")

# Proxy endpoints for external APIs
@app.get("/proxy/ncbi", tags=["Proxy"])
async def proxy_ncbi_endpoint(
    endpoint: str = Query(..., description="Full NCBI API endpoint URL", example="https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id=672&retmode=json")
):
    """Access NCBI E-utilities with caching and rate limiting"""
    try:
        result = await proxy_apis.proxy_ncbi_endpoint(endpoint)
        
        # Handle the new return format (data, status_code)
        if isinstance(result, tuple) and len(result) == 2:
            data, status_code = result
            if status_code != 200:
                raise HTTPException(status_code=status_code, detail=data.get('error', 'Proxy error'))
            
            # Return with proper cache headers (matches Next.js implementation)
            return JSONResponse(
                content=data,
                headers={
                    'Cache-Control': 'no-store'  # Disable CDN caching (matches Next.js)
                }
            )
        else:
            # Return with proper cache headers (matches Next.js implementation)
            return JSONResponse(
                content=result,
                headers={
                    'Cache-Control': 'no-store'  # Disable CDN caching (matches Next.js)
                }
            )
            
    except Exception as e:
        logger.error(f"Error in NCBI proxy: {e}")
        raise HTTPException(status_code=500, detail="Failed to proxy NCBI request")

@app.get("/proxy/ucsc", tags=["Proxy"])
async def proxy_ucsc_endpoint(
    endpoint: str = Query(..., description="Full UCSC API endpoint URL", example="https://api.genome.ucsc.edu/getData/sequence?genome=hg38;chrom=chr17;start=43044294;end=43054293")
):
    """Access UCSC genome data and annotations with caching"""
    try:
        result = await proxy_apis.proxy_ucsc_endpoint(endpoint)
        
        # Handle the new return format (data, status_code)
        if isinstance(result, tuple) and len(result) == 2:
            data, status_code = result
            if status_code != 200:
                raise HTTPException(status_code=status_code, detail=data.get('error', 'Proxy error'))
            
            # Return with proper cache headers (matches Next.js implementation)
            return JSONResponse(
                content=data,
                headers={
                    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'  # Cache for 1 hour, allow serving stale for 1 day (matches Next.js)
                }
            )
        else:
            # Return with proper cache headers (matches Next.js implementation)
            return JSONResponse(
                content=result,
                headers={
                    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'  # Cache for 1 hour, allow serving stale for 1 day (matches Next.js)
                }
            )
            
    except Exception as e:
        logger.error(f"Error in UCSC proxy: {e}")
        raise HTTPException(status_code=500, detail="Failed to proxy UCSC request")

# Simple rate limiting for Modal endpoint (in-memory store)
modal_rate_limit = {}
MODAL_RATE_LIMIT_REQUESTS = 10  # requests per minute per IP
MODAL_RATE_LIMIT_WINDOW = 60  # seconds

@app.post("/proxy/modal", tags=["Analysis"], response_model=AnalysisResult)
async def proxy_modal_endpoint(request_body: dict, request: Request):
    """EVO2-driven pathogenicity prediction (rate limited: 10/min)"""
    try:
        # Rate limiting for Modal endpoint to protect GPU resources
        client_ip = request.client.host
        current_time = time.time()
        
        # Clean old entries
        modal_rate_limit[client_ip] = [
            timestamp for timestamp in modal_rate_limit.get(client_ip, [])
            if current_time - timestamp < MODAL_RATE_LIMIT_WINDOW
        ]
        
        # Check rate limit
        if len(modal_rate_limit.get(client_ip, [])) >= MODAL_RATE_LIMIT_REQUESTS:
            raise HTTPException(
                status_code=429, 
                detail=f"Rate limit exceeded. Maximum {MODAL_RATE_LIMIT_REQUESTS} requests per minute."
            )
        
        # Add current request timestamp
        if client_ip not in modal_rate_limit:
            modal_rate_limit[client_ip] = []
        modal_rate_limit[client_ip].append(current_time)
        result = await proxy_apis.proxy_modal_endpoint(request_body)
        
        # Handle the new return format (data, status_code)
        if isinstance(result, tuple) and len(result) == 2:
            data, status_code = result
            if status_code != 200:
                raise HTTPException(status_code=status_code, detail=data.get('error', 'Proxy error'))
            
            # Return with proper cache headers (matches Next.js implementation)
            return JSONResponse(
                content=data,
                headers={
                    'Cache-Control': 'no-store'  # Disable CDN caching for analysis results (matches Next.js)
                }
            )
        else:
            # Return with proper cache headers (matches Next.js implementation)
            return JSONResponse(
                content=result,
                headers={
                    'Cache-Control': 'no-store'  # Disable CDN caching for analysis results (matches Next.js)
                }
            )
            
    except Exception as e:
        logger.error(f"Error in Modal proxy: {e}")
        raise HTTPException(status_code=500, detail="Failed to proxy Modal request")

if __name__ == "__main__":
    # Run the server
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "api_server:app",
        host="0.0.0.0",
        port=port,
        reload=False,  # Disable reload in production
        log_level="info"
    )
