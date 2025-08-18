import requests
import logging
import asyncio
import time
from typing import Dict, Any, Optional
from urllib.parse import urlparse
from cache_manager import (
    get_cached_data, 
    set_cached_data, 
    generate_cache_key
)
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

class ProxyAPIs:
    """Proxy API endpoints for external services with Redis caching - matches Next.js implementation exactly"""
    
    @staticmethod
    async def proxy_ncbi_endpoint(endpoint: str) -> Any:
        """Proxy NCBI API requests with Redis caching - matches Next.js implementation"""
        try:
            # Validate endpoint to prevent SSRF attacks
            allowed_hosts = [
                'eutils.ncbi.nlm.nih.gov',
                'clinicaltables.nlm.nih.gov'
            ]
            
            url_object = urlparse(endpoint)
            if url_object.hostname not in allowed_hosts:
                raise ValueError("Invalid host in endpoint")
            
            # Try to get from cache first
            cache_key = generate_cache_key('ncbi_proxy', endpoint)
            cached_data = get_cached_data(cache_key)
            if cached_data:
                logger.info(f"Cache hit for NCBI proxy: {endpoint}")
                return cached_data
            
            # Forward the request to NCBI API with retries and backoff (exactly like Next.js)
            last_error = None
            for i in range(3):
                try:
                    response = requests.get(endpoint, timeout=30, headers={
                        'User-Agent': 'Evo2-Variant-Analysis/1.0',
                        'Accept': 'application/json',
                    })
                    
                    if response.status_code == 429:
                        retry_after = response.headers.get('Retry-After')
                        wait_time = int(retry_after) * 1000 if retry_after else (i + 1) * 2000
                        await asyncio.sleep(wait_time / 1000)
                        last_error = Exception('Rate limit hit')
                        continue
                    
                    if not response.ok:
                        error_text = response.text
                        # Don't retry on client errors, but do on server errors (exactly like Next.js)
                        if response.status_code >= 400 and response.status_code < 500:
                            error_response = {
                                'error': f'NCBI API Client Error: {response.status_code} {response.reason}',
                                'details': error_text
                            }
                            return error_response, response.status_code
                        raise Exception(f'NCBI API Server Error: {response.status_code} {response.reason} - {error_text}')
                    
                    # Handle different response types (exactly like Next.js)
                    content_type = response.headers.get('content-type', '')
                    if 'application/json' in content_type:
                        data = response.json()
                    else:
                        data = response.text
                    
                    # Cache the result (short TTL for NCBI data)
                    set_cached_data(cache_key, data, 300)  # 5 minutes
                    logger.info(f"Cached NCBI proxy response: {endpoint}")
                    
                    return data
                    
                except Exception as e:
                    last_error = e
                    await asyncio.sleep((i + 1) * 1)  # Exponential backoff
            
            # If all retries fail (exactly like Next.js)
            error_response = {
                'error': 'Internal server error after multiple retries',
                'details': str(last_error) if last_error else 'Unknown error'
            }
            return error_response, 500
            
        except Exception as e:
            logger.error(f"Error in NCBI proxy: {e}")
            return {'error': 'Internal server error'}, 500
    
    @staticmethod
    async def proxy_ucsc_endpoint(endpoint: str) -> Any:
        """Proxy UCSC API requests with Redis caching - matches Next.js implementation"""
        try:
            # Validate endpoint to prevent SSRF attacks
            allowed_host = 'api.genome.ucsc.edu'
            url_object = urlparse(endpoint)
            
            if url_object.hostname != allowed_host:
                raise ValueError("Invalid host in endpoint")
            
            # Try to get from cache first
            cache_key = generate_cache_key('ucsc_proxy', endpoint)
            cached_data = get_cached_data(cache_key)
            if cached_data:
                logger.info(f"Cache hit for UCSC proxy: {endpoint}")
                return cached_data
            
            # Forward the request to UCSC API (exactly like Next.js)
            try:
                response = requests.get(endpoint, timeout=15, headers={
                    'User-Agent': 'Evo2-Variant-Analysis/1.0',
                    'Accept': 'application/json',
                })
                
                if not response.ok:
                    # If UCSC returned an error, forward it as a structured JSON response (exactly like Next.js)
                    error_text = response.text
                    error_response = {
                        'error': f'UCSC API Error: {response.status_code} {response.reason}',
                        'details': error_text
                    }
                    return error_response, response.status_code
                
                data = response.json()
                
                # Cache the result (longer TTL for UCSC data)
                set_cached_data(cache_key, data, 3600)  # 1 hour
                logger.info(f"Cached UCSC proxy response: {endpoint}")
                
                return data
                
            except Exception as error:
                # This catches network errors, timeouts, etc., when trying to reach UCSC (exactly like Next.js)
                logger.error(f"[UCSC PROXY] Fetch error: {error}")
                error_response = {
                    'error': 'Bad Gateway: The UCSC API is not reachable.'
                }
                return error_response, 502
                
        except Exception as e:
            # This is a final catch-all for any unexpected errors in the proxy logic itself (exactly like Next.js)
            logger.error(f"[UCSC PROXY] Internal error: {e}")
            return {'error': 'Internal Server Error'}, 500
    
    @staticmethod
    async def proxy_modal_endpoint(request_body: Dict[str, Any]) -> Any:
        """Proxy Modal API requests for variant analysis - matches Next.js implementation exactly"""
        try:
            # Get Modal endpoint from environment
            modal_endpoint = os.getenv('MODAL_ANALYZE_VARIANT_BASE_URL')
            
            if not modal_endpoint:
                return {'error': 'Modal endpoint not configured'}, 500
            
            # Extract meaningful parameters for cache key
            variant_pos = request_body.get('variant_pos')
            alternative = request_body.get('alternative')
            genome = request_body.get('genome')
            chromosome = request_body.get('chromosome')
            strand = request_body.get('strand', '+')  # Extract strand information
            
            # Generate meaningful cache key including strand
            cache_key = generate_cache_key('variant_analysis', chromosome, variant_pos, alternative, genome, strand)
            
            # Try to get from cache first
            cached_data = get_cached_data(cache_key)
            if cached_data:
                logger.info(f"Cache hit for variant analysis: {chromosome}:{variant_pos}:{alternative}:{genome}:{strand}")
                return cached_data
            
            # Convert body to query parameters for the actual API call
            params = []
            if isinstance(request_body, dict):
                for key, value in request_body.items():
                    if value is not None:
                        params.append(f"{key}={value}")
            
            url_with_params = f"{modal_endpoint}?{'&'.join(params)}"
            
            # Forward the request to Modal API with retries and backoff (exactly like Next.js)
            last_error = None
            for i in range(3):
                try:
                    response = requests.post(url_with_params, timeout=30, headers={
                        'User-Agent': 'Evo2-Variant-Analysis/1.0',
                    })
                    
                    if response.status_code == 429:
                        retry_after = response.headers.get('Retry-After')
                        wait_time = int(retry_after) * 1000 if retry_after else (i + 1) * 2000
                        await asyncio.sleep(wait_time / 1000)
                        last_error = Exception('Rate limit hit')
                        continue
                    
                    if not response.ok:
                        error_text = response.text
                        logger.error(f"Modal API Error: {response.status_code} {response.reason} {error_text}")
                        # Don't retry on client errors, but do on server errors (exactly like Next.js)
                        if response.status_code >= 400 and response.status_code < 500:
                            error_response = {
                                'error': f'Modal API Client Error: {response.status_code} {response.reason}',
                                'details': error_text
                            }
                            return error_response, response.status_code
                        raise Exception(f'Modal API Server Error: {response.status_code} {response.reason} - {error_text}')
                    
                    # Handle different response types (exactly like Next.js)
                    content_type = response.headers.get('content-type', '')
                    if 'application/json' in content_type:
                        data = response.json()
                    else:
                        data = response.text
                    
                    # Cache the result (short TTL for analysis results)
                    set_cached_data(cache_key, data, 1800)  # 30 minutes
                    logger.info(f"Cached variant analysis result: {chromosome}:{variant_pos}:{alternative}:{genome}:{strand}")
                    
                    return data
                    
                except Exception as error:
                    last_error = error
                    logger.error(f"Modal API request failed (attempt {i + 1}): {error}")
                    await asyncio.sleep((i + 1) * 1)  # Exponential backoff
            
            # If all retries fail (exactly like Next.js)
            error_response = {
                'error': 'Internal server error after multiple retries',
                'details': str(last_error) if last_error else 'Unknown error'
            }
            return error_response, 500
            
        except Exception as error:
            logger.error(f'Modal proxy error: {error}')
            return {'error': 'Internal server error'}, 500

# Global instance
proxy_apis = ProxyAPIs()
