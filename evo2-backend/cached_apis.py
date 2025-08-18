import requests
import logging
import re
from typing import Dict, List, Optional, Any
from cache_manager import (
    get_cached_data, 
    set_cached_data, 
    generate_cache_key, 
    CACHE_CONFIG
)

logger = logging.getLogger(__name__)

class CachedGenomeAPIs:
    """Cached genome API endpoints using Redis"""
    
    @staticmethod
    async def get_available_genomes() -> Dict[str, List[Dict[str, Any]]]:
        """Get available genomes with Redis caching"""
        cache_key = generate_cache_key('genomes')
        
        # Try to get from cache first
        cached_data = get_cached_data(cache_key)
        if cached_data:
            logger.info("Cache hit for genomes")
            return cached_data
        
        try:
            # Fetch from UCSC API
            api_url = "https://api.genome.ucsc.edu/list/ucscGenomes"
            response = requests.get(api_url, timeout=30)
            response.raise_for_status()
            
            genome_data = response.json()
            
            if not genome_data.get('ucscGenomes'):
                raise Exception("UCSC API error: missing UCSC Genomes")
            
            # Process and structure the data
            genomes = genome_data['ucscGenomes']
            structured_genomes: Dict[str, List[Dict[str, Any]]] = {}
            
            for genome_id, genome_info in genomes.items():
                if not genome_info:
                    continue
                
                organism = genome_info.get('organism', 'Other')
                if organism not in structured_genomes:
                    structured_genomes[organism] = []
                
                structured_genomes[organism].append({
                    'id': genome_id,
                    'name': genome_info.get('description', genome_id),
                    'active': genome_data.get('active', False),
                    'sourceName': genome_info.get('sourceName', genome_id)
                })
            
            result = {'genomes': structured_genomes}
            
            # Cache the result
            set_cached_data(cache_key, result, CACHE_CONFIG['GENOMES_TTL'])
            logger.info("Cached genomes data")
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching genomes: {e}")
            raise
    
    @staticmethod
    async def get_genome_chromosomes(genome_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """Get chromosomes for a specific genome with Redis caching"""
        cache_key = generate_cache_key('chromosomes', genome_id)
        
        # Try to get from cache first
        cached_data = get_cached_data(cache_key)
        if cached_data:
            logger.info(f"Cache hit for chromosomes for genome {genome_id}")
            return cached_data
        
        try:
            # Fetch from UCSC API
            api_url = f"https://api.genome.ucsc.edu/list/chromosomes?genome={genome_id}"
            response = requests.get(api_url, timeout=30)
            response.raise_for_status()
            
            chromosome_data = response.json()
            
            if not chromosome_data.get('chromosomes'):
                raise Exception("UCSC API error: missing chromosomes")
            
            # Process chromosomes
            chromosomes = []
            for chrom_id, size in chromosome_data['chromosomes'].items():
                # Filter out special chromosomes
                if any(special in chrom_id for special in ['_', 'Un', 'random']):
                    continue
                
                if not size or not isinstance(size, (int, float)):
                    continue
                
                chromosomes.append({
                    'name': chrom_id,
                    'size': int(size)
                })
            
            # Sort chromosomes logically
            chromosomes.sort(key=lambda x: (
                # Put numeric chromosomes first
                not x['name'].replace('chr', '').isdigit(),
                # Then sort numerically
                int(x['name'].replace('chr', '')) if x['name'].replace('chr', '').isdigit() else 0,
                # Then alphabetically for non-numeric
                x['name']
            ))
            
            result = {'chromosomes': chromosomes}
            
            # Cache the result
            set_cached_data(cache_key, result, CACHE_CONFIG['CHROMOSOMES_TTL'])
            logger.info(f"Cached chromosomes data for genome {genome_id}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching chromosomes for genome {genome_id}: {e}")
            raise
    
    @staticmethod
    async def search_genes(query: str, genome: str) -> Dict[str, Any]:
        """Search genes with Redis caching"""
        cache_key = generate_cache_key('gene_search', query, genome)
        
        # Try to get from cache first
        cached_data = get_cached_data(cache_key)
        if cached_data:
            logger.info(f"Cache hit for gene search: {query}")
            return cached_data
        
        try:
            # Fetch from NCBI API
            url = "https://clinicaltables.nlm.nih.gov/api/ncbi_genes/v3/search"
            params = {
                'terms': query,
                'df': "chromosomes,Symbol,map_location,type_of_gene,Aliases,Description",
                'ef': "chromosomes,Symbol,map_location,type_of_gene,GenomicInfo,GeneID,Aliases,Description",
                'maxList': "25"
            }
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            results = []
            
            if data[0] > 0 and data[2] and data[3]:
                field_map = data[2]
                gene_ids = field_map.get('GeneID', [])
                aliases = field_map.get('Aliases', [])
                descriptions = field_map.get('Description', [])
                
                for i in range(min(25, data[0], len(data[3]))):
                    display = data[3][i]
                    if not display or not isinstance(display, list):
                        continue
                    
                    try:
                        # Extract chromosome info
                        chrom = display[2] if len(display) > 2 else ''
                        if chrom:
                            chrom = re.sub(r'^chr', '', chrom, flags=re.IGNORECASE)
                            match = re.match(r'^([0-9XYMTxy]+)', chrom)
                            if match:
                                chrom = f"chr{match.group(1).upper()}"
                        
                        # Extract other fields
                        symbol = display[1].strip() if len(display) > 1 and display[1] else ''
                        name = display[3].strip() if len(display) > 3 and display[3] else ''
                        gene_id = gene_ids[i].strip() if i < len(gene_ids) and gene_ids[i] else ''
                        
                        # Get aliases and description
                        gene_aliases = aliases[i] if i < len(aliases) else []
                        description = descriptions[i][0] if i < len(descriptions) and descriptions[i] else ''
                        
                        if not symbol or not gene_id:
                            continue
                        
                        gene = {
                            'symbol': symbol,
                            'name': name or symbol,
                            'chrom': chrom or 'Unknown',
                            'description': description or name or symbol,
                            'gene_id': gene_id
                        }
                        results.append(gene)
                        
                    except Exception as e:
                        logger.warning(f"Error processing gene result {i}: {e}")
                        continue
                
                # Sort results to prioritize exact matches
                results.sort(key=lambda x: x['symbol'].lower() != query.lower())
            
            result = {'query': query, 'genome': genome, 'results': results}
            
            # Cache the result
            set_cached_data(cache_key, result, CACHE_CONFIG['GENE_SEARCH_TTL'])
            logger.info(f"Cached gene search results for: {query}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error searching genes for query '{query}': {e}")
            raise
    
    @staticmethod
    async def get_gene_details(gene_id: str) -> Dict[str, Any]:
        """Get gene details with Redis caching"""
        cache_key = generate_cache_key('gene_details', gene_id)
        
        # Try to get from cache first
        cached_data = get_cached_data(cache_key)
        if cached_data:
            logger.info(f"Cache hit for gene details: {gene_id}")
            return cached_data
        
        try:
            # Fetch from NCBI API
            summary_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=gene&id={gene_id}&retmode=json"
            response = requests.get(summary_url, timeout=30)
            response.raise_for_status()
            
            summary_data = response.json()
            detail = summary_data.get('result', {}).get(gene_id)
            
            if not detail or not detail.get('genomicinfo'):
                result = {'geneDetails': None, 'geneBounds': None, 'initialRange': None}
                set_cached_data(cache_key, result, CACHE_CONFIG['GENE_DETAILS_TTL'])
                return result
            
            # Get strand information from GenBank format
            strand = None
            try:
                genbank_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=gene&id={gene_id}&rettype=gb&retmode=text"
                genbank_response = requests.get(genbank_url, timeout=30)
                if genbank_response.status_code == 200:
                    genbank_text = genbank_response.text
                    # Look for complement in annotation
                    import re
                    annotation_match = re.search(r'Annotation:.*?\((.*?)\)', genbank_text)
                    if annotation_match:
                        coordinates = annotation_match.group(1)
                        strand = "-" if 'complement' in coordinates else "+"
            except Exception as e:
                logger.warning(f"Could not fetch GenBank data for gene {gene_id}: {e}")
            
            # Process genomic info
            info = detail['genomicinfo'][0]
            info['strand'] = strand
            
            min_pos = min(info['chrstart'], info['chrstop'])
            max_pos = max(info['chrstart'], info['chrstop'])
            bounds = {'min': min_pos, 'max': max_pos}
            
            gene_size = max_pos - min_pos
            seq_start = min_pos
            seq_end = seq_start + 9999 if gene_size > 10000 else max_pos
            range_info = {'start': seq_start, 'end': seq_end}
            
            result = {
                'geneDetails': detail,
                'geneBounds': bounds,
                'initialRange': range_info
            }
            
            # Cache the result
            set_cached_data(cache_key, result, CACHE_CONFIG['GENE_DETAILS_TTL'])
            logger.info(f"Cached gene details for: {gene_id}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching gene details for {gene_id}: {e}")
            raise
    
    @staticmethod
    async def get_gene_sequence(chrom: str, start: int, end: int, genome_id: str) -> Dict[str, Any]:
        """Get gene sequence with Redis caching"""
        # Generate more organized cache key: chromosome -> position range -> genome
        cache_key = generate_cache_key('sequence', chrom, f"{start}-{end}", genome_id)
        
        # Try to get from cache first
        cached_data = get_cached_data(cache_key)
        if cached_data:
            logger.info(f"Cache hit for gene sequence: {chrom}:{start}-{end}:{genome_id}")
            return cached_data
        
        try:
            # Normalize chromosome format
            chromosome = chrom
            if not chromosome.lower().startswith('chr'):
                chromosome = f"chr{chromosome}"
            
            # Remove version numbers
            chromosome = chromosome.split('.')[0]
            
            # Handle special cases
            chromosome_map = {'chrMT': 'chrM', 'chrMt': 'chrM'}
            chromosome = chromosome_map.get(chromosome, chromosome)
            
            # Validate chromosome format
            import re
            chr_pattern = r'^chr([0-9]+|X|Y|M|Un|[0-9]+_alt|[0-9]+_random|[0-9]+_fix)$'
            if not re.match(chr_pattern, chromosome, re.IGNORECASE):
                result = {
                    'sequence': "",
                    'actualRange': {'start': start, 'end': end},
                    'error': f"Invalid chromosome format: {chromosome}"
                }
                set_cached_data(cache_key, result, CACHE_CONFIG['GENE_SEQUENCE_TTL'])
                return result
            
            # Fetch from UCSC API
            api_start = start - 1  # UCSC uses 0-based coordinates
            api_url = f"https://api.genome.ucsc.edu/getData/sequence?genome={genome_id};chrom={chromosome};start={api_start};end={end}"
            
            response = requests.get(api_url, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get('error') or not data.get('dna'):
                result = {
                    'sequence': "",
                    'actualRange': {'start': start, 'end': end},
                    'error': data.get('error', "No DNA sequence returned")
                }
                set_cached_data(cache_key, result, CACHE_CONFIG['GENE_SEQUENCE_TTL'])
                return result
            
            sequence = data['dna'].upper()
            result = {'sequence': sequence, 'actualRange': {'start': start, 'end': end}}
            
            # Cache the result
            set_cached_data(cache_key, result, CACHE_CONFIG['GENE_SEQUENCE_TTL'])
            logger.info(f"Cached gene sequence for: {chrom}:{start}-{end}:{genome_id}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching gene sequence for {chrom}:{start}-{end}: {e}")
            result = {
                'sequence': "",
                'actualRange': {'start': start, 'end': end},
                'error': "Failed to fetch DNA sequence"
            }
            set_cached_data(cache_key, result, CACHE_CONFIG['GENE_SEQUENCE_TTL'])
            return result
    
    @staticmethod
    async def get_clinvar_variants(chrom: str, gene_bounds: Dict[str, int], genome_id: str) -> List[Dict[str, Any]]:
        """Get ClinVar variants for a gene region with Redis caching"""
        # Generate more organized cache key: chromosome -> position range -> genome
        cache_key = generate_cache_key('clinvar', chrom, f"{gene_bounds['min']}-{gene_bounds['max']}", genome_id)
        
        # Try to get from cache first
        cached_data = get_cached_data(cache_key)
        if cached_data:
            logger.info(f"Cache hit for ClinVar variants: {chrom}:{gene_bounds['min']}-{gene_bounds['max']}:{genome_id}")
            return cached_data
        
        try:
            # Normalize chromosome format for NCBI
            chromosome = chrom
            if chromosome.lower().startswith('chr'):
                chromosome = chromosome[3:]  # Remove 'chr' prefix
            
            # Build NCBI ClinVar API URL
            start_pos = gene_bounds['min']
            end_pos = gene_bounds['max']
            
            # Try multiple search strategies for better results (matching original implementation)
            # Use the same search format as the original frontend implementation
            position_field = 'chrpos38' if genome_id == 'hg38' else 'chrpos37'
            search_strategies = [
                # Strategy 1: Exact position range (matches original implementation)
                f'{chromosome}[chromosome] AND {start_pos}:{end_pos}[{position_field}]',
                # Strategy 2: Broader range (extend by 10kb)
                f'{chromosome}[chromosome] AND {max(1, start_pos-10000)}:{end_pos+10000}[{position_field}]',
                # Strategy 3: Just chromosome (fallback)
                f'{chromosome}[chromosome]'
            ]
            
            variants = []
            
            for strategy_idx, search_term in enumerate(search_strategies):
                try:
                    logger.info(f"Trying ClinVar search strategy {strategy_idx + 1}: {search_term}")
                    
                    # Use NCBI's variation API to get ClinVar variants
                    api_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
                    params = {
                        'db': 'clinvar',
                        'term': search_term,
                        'retmode': 'json',
                        'retmax': 20,  # Match original implementation
                        'sort': 'relevance'
                    }
                    
                    response = requests.get(api_url, params=params, timeout=30)
                    response.raise_for_status()
                    
                    search_data = response.json()
                    
                    if not search_data.get('esearchresult', {}).get('idlist'):
                        logger.info(f"Strategy {strategy_idx + 1} returned no results")
                        continue
                    
                    # Get detailed variant information
                    variant_ids = search_data['esearchresult']['idlist']
                    logger.info(f"Strategy {strategy_idx + 1} found {len(variant_ids)} variant IDs")
                    
                    for variant_id in variant_ids[:20]:  # Limit to 20 variants total (matches original)
                        try:
                            # Get variant details
                            detail_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
                            detail_params = {
                                'db': 'clinvar',
                                'id': variant_id,
                                'retmode': 'json'
                            }
                            
                            detail_response = requests.get(detail_url, params=detail_params, timeout=30)
                            detail_response.raise_for_status()
                            
                            detail_data = detail_response.json()
                            variant_info = detail_data.get('result', {}).get(str(variant_id), {})
                            
                            if variant_info:
                                # Check if variant is within our target range
                                variant_pos = variant_info.get('position', 0)
                                if start_pos <= variant_pos <= end_pos or strategy_idx > 0:  # Allow broader results for fallback strategies
                                    
                                    # Extract the fields exactly as the frontend expects them
                                    obj_type = variant_info.get('obj_type', 'Unknown')
                                    variation_type = ' '.join([
                                        word.capitalize() if word else '' 
                                        for word in obj_type.split(' ')
                                    ]) if obj_type else 'Unknown'
                                    
                                    # Get germline classification description
                                    germline_classification = variant_info.get('germline_classification', {})
                                    if isinstance(germline_classification, dict):
                                        classification_raw = germline_classification.get('description', 'Unknown')
                                    else:
                                        classification_raw = 'Unknown'
                                    
                                    # Capitalize first letter of each word in classification
                                    classification = ' '.join([
                                        word.capitalize() if word else '' 
                                        for word in classification_raw.split(' ')
                                    ]) if classification_raw else 'Unknown'
                                    
                                    # Format location as a number (like the original implementation)
                                    location_sort = variant_info.get('location_sort', '')
                                    if location_sort and location_sort.isdigit():
                                        location = f"{int(location_sort):,}"  # Format with commas
                                    else:
                                        location = 'Unknown'
                                    
                                    variant = {
                                        'clinvar_id': str(variant_id),
                                        'title': variant_info.get('title', 'Unknown'),
                                        'variation_type': variation_type,
                                        'classification': classification,
                                        'gene_sort': variant_info.get('gene_sort', ''),
                                        'chromosome': chromosome,
                                        'location': location,
                                        'isAnalyzing': False
                                    }
                                    variants.append(variant)
                            
                            # Rate limiting for NCBI API
                            import time
                            time.sleep(0.1)  # 100ms delay between requests
                            
                        except Exception as e:
                            logger.warning(f"Failed to fetch variant {variant_id}: {e}")
                            continue
                    
                    # If we found variants with this strategy, stop trying others
                    if variants:
                        logger.info(f"Found {len(variants)} variants with strategy {strategy_idx + 1}")
                        break
                        
                except Exception as e:
                    logger.warning(f"Strategy {strategy_idx + 1} failed: {e}")
                    continue
            
            if not variants:
                logger.info(f"No ClinVar variants found for {chrom}:{start_pos}-{end_pos} with any strategy")
                result = []
                set_cached_data(cache_key, result, CACHE_CONFIG['CLINVAR_TTL'])
                return result
            
            # Cache the result
            set_cached_data(cache_key, variants, CACHE_CONFIG['CLINVAR_TTL'])
            logger.info(f"Cached {len(variants)} ClinVar variants for: {chrom}:{start_pos}-{end_pos}")
            
            return variants
            
        except Exception as e:
            logger.error(f"Error fetching ClinVar variants for {chrom}:{gene_bounds['min']}-{gene_bounds['max']}: {e}")
            return []

# Global instance
cached_apis = CachedGenomeAPIs()
