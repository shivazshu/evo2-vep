from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from typing import Optional
from pydantic import BaseModel
import uvicorn
from fastapi.responses import Response
import os
import time
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from cached_apis import cached_apis
from cache_manager import get_cache_stats, clear_cache_pattern, get_connection_info
from proxy_apis import proxy_apis

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Evo2 Genome API",
    description="Redis-cached genome data API for Evo2 variant analysis",
    version="1.0.0"
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
class GeneSearchRequest(BaseModel):
    query: str
    genome: str

class GeneSequenceRequest(BaseModel):
    chrom: str
    start: int
    end: int
    genome_id: str

class GeneDetailsRequest(BaseModel):
    gene_id: str

class GenomeRequest(BaseModel):
    genome_id: str

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "evo2-genome-api"}

# Cache management endpoints
@app.get("/cache/stats")
async def get_cache_statistics():
    """Get Redis cache statistics"""
    try:
        stats = get_cache_stats()
        return stats
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get cache statistics")

@app.get("/cache/connection")
async def get_cache_connection_info():
    """Get Redis connection information"""
    try:
        connection_info = get_connection_info()
        return connection_info
    except Exception as e:
        logger.error(f"Error getting connection info: {e}")
        raise HTTPException(status_code=500, detail="Failed to get connection information")

@app.post("/cache/clear")
async def clear_cache():
    """Clear all cache entries"""
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

@app.post("/cache/clear/pattern/{pattern}")
async def clear_cache_by_pattern(pattern: str):
    """Clear cache entries matching a specific pattern"""
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
@app.get("/genomes")
async def get_available_genomes():
    """Get available genome assemblies with Redis caching"""
    try:
        result = await cached_apis.get_available_genomes()
        return result
    except Exception as e:
        logger.error(f"Error fetching genomes: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch genome data")

@app.get("/genomes/{genome_id}/chromosomes")
async def get_genome_chromosomes(genome_id: str):
    """Get chromosomes for a specific genome with Redis caching"""
    try:
        result = await cached_apis.get_genome_chromosomes(genome_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching chromosomes for genome {genome_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch chromosome data")

@app.post("/genes/search")
async def search_genes(request: GeneSearchRequest):
    """Search genes with Redis caching"""
    try:
        result = await cached_apis.search_genes(request.query, request.genome)
        return result
    except Exception as e:
        logger.error(f"Error searching genes for query '{request.query}': {e}")
        raise HTTPException(status_code=500, detail="Failed to search genes")

@app.get("/genes/search")
async def search_genes_get(
    query: str = Query(..., description="Gene search query"),
    genome: str = Query(..., description="Genome assembly")
):
    """Search genes with Redis caching (GET method)"""
    try:
        result = await cached_apis.search_genes(query, genome)
        return result
    except Exception as e:
        logger.error(f"Error searching genes for query '{query}': {e}")
        raise HTTPException(status_code=500, detail="Failed to search genes")

@app.post("/genes/details")
async def get_gene_details(request: GeneDetailsRequest):
    """Get gene details with Redis caching"""
    try:
        result = await cached_apis.get_gene_details(request.gene_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching gene details for {request.gene_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch gene details")

@app.get("/genes/{gene_id}/details")
async def get_gene_details_get(gene_id: str):
    """Get gene details with Redis caching (GET method)"""
    try:
        result = await cached_apis.get_gene_details(gene_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching gene details for {gene_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch gene details")

@app.post("/genes/sequence")
async def get_gene_sequence(request: GeneSequenceRequest):
    """Get gene sequence with Redis caching"""
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

@app.get("/genes/sequence")
async def get_gene_sequence_get(
    chrom: str = Query(..., description="Chromosome"),
    start: int = Query(..., description="Start position"),
    end: int = Query(..., description="End position"),
    genome_id: str = Query(..., description="Genome assembly")
):
    """Get gene sequence with Redis caching (GET method)"""
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

@app.get("/clinvar/variants")
async def get_clinvar_variants(
    chrom: str = Query(..., description="Chromosome"),
    start: int = Query(..., description="Start position"),
    end: int = Query(..., description="End position"),
    genome_id: str = Query(..., description="Genome assembly")
):
    """Get ClinVar variants for a gene region with Redis caching"""
    try:
        gene_bounds = {'min': start, 'max': end}
        result = await cached_apis.get_clinvar_variants(chrom, gene_bounds, genome_id)
        return result
    except Exception as e:
        logger.error(f"Error fetching ClinVar variants: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch ClinVar variants")

# Proxy endpoints for external APIs
@app.get("/proxy/ncbi")
async def proxy_ncbi_endpoint(
    endpoint: str = Query(..., description="NCBI API endpoint URL")
):
    """Proxy NCBI API requests with Redis caching"""
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

@app.get("/proxy/ucsc")
async def proxy_ucsc_endpoint(
    endpoint: str = Query(..., description="UCSC API endpoint URL")
):
    """Proxy UCSC API requests with Redis caching"""
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

@app.post("/proxy/modal")
async def proxy_modal_endpoint(request_body: dict, request: Request):
    """Proxy Modal API requests for variant analysis with rate limiting"""
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
