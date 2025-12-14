import redis
import json
import os
import ssl
from typing import Optional, Any, Union
from datetime import timedelta, datetime
import logging
import threading

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory cache as fallback when Redis is unavailable
class InMemoryCache:
    def __init__(self):
        self._cache = {}
        self._lock = threading.RLock()
    
    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._cache:
                value, expiry = self._cache[key]
                if datetime.now() < expiry:
                    return value
                else:
                    del self._cache[key]
            return None
    
    def set(self, key: str, value: Any, ttl_seconds: int) -> bool:
        with self._lock:
            expiry = datetime.now() + timedelta(seconds=ttl_seconds)
            self._cache[key] = (value, expiry)
            return True
    
    def delete(self, key: str) -> bool:
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    def clear_pattern(self, pattern: str) -> int:
        with self._lock:
            # Simple pattern matching for fallback
            keys_to_delete = [k for k in self._cache.keys() if pattern.replace('*', '') in k]
            for key in keys_to_delete:
                del self._cache[key]
            return len(keys_to_delete)
    
    def get_stats(self) -> dict:
        with self._lock:
            return {
                "connected": True,
                "type": "in_memory_fallback",
                "total_keys": len(self._cache),
                "memory_usage": "N/A"
            }

class RedisCacheManager:
    def __init__(self):
        """Initialize Redis cache manager with connection pooling and cloud support"""
        self.redis_url = None
        self.redis_client = None
        self.fallback_cache = InMemoryCache()
        self.cloud_provider = None
        self.ssl_enabled = None
        self.ssl_verify = None
        self.connection_pool_size = None
        self.connection_timeout = None
        self.socket_timeout = None
        self._initialized = False
        self._use_fallback = False
    
    def _ensure_initialized(self):
        """Ensure the cache manager is initialized with environment variables"""
        if not self._initialized:
            # Load environment variables from .env file
            from dotenv import load_dotenv
            load_dotenv()
            
            self.redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
            self.cloud_provider = os.getenv('REDIS_CLOUD_PROVIDER', 'local')
            self.ssl_enabled = os.getenv('REDIS_SSL_ENABLED', 'false').lower() == 'true'
            self.ssl_verify = os.getenv('REDIS_SSL_VERIFY', 'true').lower() == 'true'
            self.connection_pool_size = int(os.getenv('REDIS_CONNECTION_POOL_SIZE', '10'))
            self.connection_timeout = int(os.getenv('REDIS_SOCKET_TIMEOUT', '5'))
            self.socket_timeout = int(os.getenv('REDIS_SOCKET_TIMEOUT', '5'))
            self._initialized = True
            self.connect()
    
    def connect(self):
        """Establish Redis connection with cloud-specific configurations"""
        self._ensure_initialized()
        try:
            # Parse Redis URL to extract components
            if self.redis_url.startswith('redis://'):
                # Handle local Redis
                connection_kwargs = self._get_local_connection_kwargs()
            elif self.redis_url.startswith('rediss://'):
                # Handle SSL Redis (cloud)
                connection_kwargs = self._get_ssl_connection_kwargs()
            else:
                # Handle other formats
                connection_kwargs = self._get_cloud_connection_kwargs()
            
            # Create Redis client with connection pooling
            self.redis_client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                **connection_kwargs
            )
            
            # Test connection
            self.redis_client.ping()
            logger.info(f"Successfully connected to Redis Cloud: {self.cloud_provider}")
            
        except Exception as e:
            logger.error(f"Failed to connect to Redis Cloud: {e}")
            self.redis_client = None
    
    def _get_local_connection_kwargs(self):
        """Get connection kwargs for local Redis"""
        return {
            'socket_connect_timeout': self.connection_timeout,
            'socket_timeout': self.socket_timeout,
            'retry_on_timeout': True,
            'health_check_interval': 30,
            'max_connections': self.connection_pool_size
        }
    
    def _get_ssl_connection_kwargs(self):
        """Get connection kwargs for SSL Redis (cloud)"""
        ssl_context = ssl.create_default_context()
        if not self.ssl_verify:
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
        
        return {
            'socket_connect_timeout': self.connection_timeout,
            'socket_timeout': self.socket_timeout,
            'retry_on_timeout': True,
            'health_check_interval': 30,
            'max_connections': self.connection_pool_size,
            'ssl': ssl_context,
            'ssl_cert_reqs': ssl.CERT_NONE if not self.ssl_verify else ssl.CERT_REQUIRED
        }
    
    def _get_cloud_connection_kwargs(self):
        """Get connection kwargs for cloud Redis services"""
        kwargs = {
            'socket_connect_timeout': self.connection_timeout,
            'socket_timeout': self.socket_timeout,
            'retry_on_timeout': True,
            'health_check_interval': 30,
            'max_connections': self.connection_pool_size
        }
        
        # Add cloud-specific configurations
        if self.cloud_provider == 'aws_elasticache':
            # AWS ElastiCache specific settings
            kwargs.update({
                'socket_keepalive': True,
                'socket_keepalive_options': {
                    'TCP_KEEPIDLE': 300,
                    'TCP_KEEPINTVL': 75,
                    'TCP_KEEPCNT': 9
                }
            })
        elif self.cloud_provider == 'azure_cache':
            # Azure Cache for Redis specific settings
            kwargs.update({
                'ssl': True,
                'ssl_cert_reqs': ssl.CERT_NONE if not self.ssl_verify else ssl.CERT_REQUIRED
            })
        elif self.cloud_provider == 'gcp_memorystore':
            # Google Cloud Memorystore specific settings
            kwargs.update({
                'socket_keepalive': True
            })
        
        return kwargs
    
    def is_connected(self) -> bool:
        """Check if Redis is connected"""
        self._ensure_initialized()
        if not self.redis_client:
            return False
        try:
            self.redis_client.ping()
            return True
        except:
            return False
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache (Redis or fallback)"""
        if self.is_connected() and not self._use_fallback:
            try:
                value = self.redis_client.get(key)
                if value:
                    return json.loads(value)
                return None
            except Exception as e:
                logger.error(f"Error getting key {key} from Redis, using fallback: {e}")
                self._use_fallback = True
        
        # Use in-memory fallback cache
        return self.fallback_cache.get(key)
    
    def set(self, key: str, value: Any, ttl_seconds: int = 3600) -> bool:
        """Set value in cache with TTL (Redis or fallback)"""
        if self.is_connected() and not self._use_fallback:
            try:
                serialized_value = json.dumps(value, default=str)
                return self.redis_client.setex(key, ttl_seconds, serialized_value)
            except Exception as e:
                logger.error(f"Error setting key {key} in Redis, using fallback: {e}")
                self._use_fallback = True
        
        # Use in-memory fallback cache
        return self.fallback_cache.set(key, value, ttl_seconds)
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        if not self.is_connected():
            return False
        
        try:
            return bool(self.redis_client.delete(key))
        except Exception as e:
            logger.error(f"Error deleting key {key} from Redis: {e}")
            return False
    
    def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching a pattern (Redis or fallback)"""
        if self.is_connected() and not self._use_fallback:
            try:
                keys = self.redis_client.keys(pattern)
                if keys:
                    return self.redis_client.delete(*keys)
                return 0
            except Exception as e:
                logger.error(f"Error clearing pattern {pattern} from Redis, using fallback: {e}")
                self._use_fallback = True
        
        # Use fallback cache
        return self.fallback_cache.clear_pattern(pattern)
    
    def get_stats(self) -> dict:
        """Get cache statistics (Redis or fallback)"""
        if self.is_connected() and not self._use_fallback:
            try:
                info = self.redis_client.info()
                return {
                    "connected": True,
                    "type": "redis",
                    "cloud_provider": self.cloud_provider,
                    "ssl_enabled": self.ssl_enabled,
                    "used_memory_human": info.get('used_memory_human', 'N/A'),
                    "connected_clients": info.get('connected_clients', 0),
                    "total_commands_processed": info.get('total_commands_processed', 0),
                    "keyspace_hits": info.get('keyspace_hits', 0),
                    "keyspace_misses": info.get('keyspace_misses', 0),
                    "uptime_in_seconds": info.get('uptime_in_seconds', 0),
                    "redis_version": info.get('redis_version', 'N/A'),
                    "os": info.get('os', 'N/A')
                }
            except Exception as e:
                logger.error(f"Error getting Redis stats: {e}")
                self._use_fallback = True
        
        # Return fallback cache stats
        fallback_stats = self.fallback_cache.get_stats()
        fallback_stats["redis_error"] = "Redis not connected, using in-memory fallback"
        return fallback_stats
    
    def get_connection_info(self) -> dict:
        """Get Redis connection information"""
        self._ensure_initialized()
        return {
            "url": self.redis_url.replace(self._extract_password(), "***") if self._extract_password() else self.redis_url,
            "cloud_provider": self.cloud_provider,
            "ssl_enabled": self.ssl_enabled,
            "connection_pool_size": self.connection_pool_size,
            "connection_timeout": self.connection_timeout,
            "socket_timeout": self.socket_timeout
        }
    
    def _extract_password(self) -> Optional[str]:
        """Extract password from Redis URL for logging (without exposing it)"""
        try:
            if '@' in self.redis_url:
                auth_part = self.redis_url.split('@')[0]
                if ':' in auth_part and '//' in auth_part:
                    password = auth_part.split(':')[-1]
                    return password if password != '' else None
        except:
            pass
        return None

# Global cache manager instance (lazy initialization)
_cache_manager_instance = None

def _get_cache_manager():
    """Get or create the global cache manager instance"""
    global _cache_manager_instance
    if _cache_manager_instance is None:
        _cache_manager_instance = RedisCacheManager()
    return _cache_manager_instance

# Cache configuration constants
CACHE_CONFIG = {
    'GENOMES_TTL': 24 * 60 * 60,  # 24 hours
    'CHROMOSOMES_TTL': 24 * 60 * 60,  # 24 hours
    'GENE_SEARCH_TTL': 60 * 60,  # 1 hour
    'GENE_DETAILS_TTL': 12 * 60 * 60,  # 12 hours
    'GENE_SEQUENCE_TTL': 6 * 60 * 60,  # 6 hours
    'CLINVAR_TTL': 30 * 60,  # 30 minutes
}

# Redis key structure documentation
"""
Improved Redis Key Structure:

The cache keys are organized hierarchically for better readability and management:

1. Variant Analysis:
   - Key: evo2:variant_analysis:{chromosome}:{position}:{alternative}:{genome}
   - Example: evo2:variant_analysis:chr17:43119628:G:hg38
   - TTL: 30 minutes

2. Gene Sequence:
   - Key: evo2:sequence:{chromosome}:{start-end}:{genome}
   - Example: evo2:sequence:chr17:43119628-43119628:hg38
   - TTL: 6 hours

3. ClinVar Variants:
   - Key: evo2:clinvar:{chromosome}:{min-max}:{genome}
   - Example: evo2:clinvar:chr17:43119000-43120000:hg38
   - TTL: 30 minutes

4. Gene Search:
   - Key: evo2:gene_search:{query}:{genome}
   - Example: evo2:gene_search:BRCA1:hg38
   - TTL: 1 hour

5. Gene Details:
   - Key: evo2:gene_details:{gene_id}
   - Example: evo2:gene_details:672
   - TTL: 12 hours

6. Genomes:
   - Key: evo2:genomes
   - TTL: 24 hours

7. Chromosomes:
   - Key: evo2:chromosomes:{genome_id}
   - Example: evo2:chromosomes:hg38
   - TTL: 24 hours

8. NCBI Proxy:
   - Key: evo2:ncbi_proxy:{endpoint_url}
   - TTL: 5 minutes

9. UCSC Proxy:
   - Key: evo2:ucsc_proxy:{endpoint_url}
   - TTL: 1 hour

Benefits of this structure:
- More readable and meaningful keys
- Easier to manage and debug
- Better organization by data type and parameters
- Avoids using full URLs as cache keys where possible
- Hierarchical structure makes it easier to clear specific data types
"""

def generate_cache_key(prefix: str, *params: Union[str, int]) -> str:
    """Generate consistent cache key with improved structure
    
    Args:
        prefix: The type of data being cached (e.g., 'variant_analysis', 'sequence')
        *params: Parameters that uniquely identify the data
        
    Returns:
        A Redis key in the format: evo2:{prefix}:{param1}:{param2}:...
        
    Examples:
        >>> generate_cache_key('variant_analysis', 'chr17', 43119628, 'G', 'hg38')
        'evo2:variant_analysis:chr17:43119628:G:hg38'
        
        >>> generate_cache_key('sequence', 'chr17', '43119628-43119628', 'hg38')
        'evo2:sequence:chr17:43119628-43119628:hg38'
    """
    return f"evo2:{prefix}:{':'.join(str(p) for p in params)}"

def get_cached_data(key: str) -> Optional[Any]:
    """Get data from Redis cache"""
    return _get_cache_manager().get(key)

def set_cached_data(key: str, data: Any, ttl_seconds: int) -> bool:
    """Set data in Redis cache"""
    return _get_cache_manager().set(key, data, ttl_seconds)

def clear_cache_pattern(pattern: str) -> int:
    """Clear cache entries matching pattern"""
    return _get_cache_manager().clear_pattern(pattern)

def get_cache_stats() -> dict:
    """Get Redis cache statistics"""
    return _get_cache_manager().get_stats()

def get_connection_info() -> dict:
    """Get Redis connection information"""
    return _get_cache_manager().get_connection_info()
