# Evo2 Frontend

A Next.js frontend for genomic variant analysis using the Evo2 deep learning model. Search genes, view DNA sequences, and analyze genetic variants with pathogenicity predictions.

## Features

- 🧬 Gene search and DNA sequence visualization
- 🔬 Variant analysis with Evo2 pathogenicity predictions
- 🩺 ClinVar integration for known variants
- ⚡ Multi-layer caching and rate limiting
- 🎨 Modern UI with Tailwind CSS and Radix UI

## Deployment

### Netlify Deployment
This frontend is designed to be deployed on **Netlify**:

1. **Build Settings**:
   - Build Command: `npm run build`
   - Publish Directory: `out`
   - Node Version: 18+

2. **Environment Variables**:
   ```env
   NEXT_PUBLIC_API_BASE_URL=https://your-render-api.onrender.com
   NEXT_PUBLIC_MODAL_ENDPOINT=/api/proxy/modal
   NEXT_PUBLIC_API_TIMEOUT=30000
   NEXT_PUBLIC_REDIS_CACHE_ENABLED=true
   ```

3. **Deploy**:
   - Connect your GitHub repository to Netlify
   - Set build settings and environment variables
   - Deploy automatically on git push

### Local Development

#### Prerequisites
- Node.js 18+
- npm

#### Setup
```bash
npm install
cp env.local.example .env.local
# Edit .env.local with your API endpoints
```

#### Development Server
```bash
npm run dev
```

#### Production Build
```bash
npm run build
npm start
```

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI**: Radix UI primitives
- **State**: Custom React hooks

## Project Structure

```
src/
├── app/                 # Next.js pages and API routes
├── components/          # React components
│   ├── ui/             # Reusable UI components
│   └── ...             # Feature components
├── hooks/              # Custom React hooks
├── utils/              # Utilities and API helpers
└── styles/             # Global styles
```

## Usage

1. **Gene Search**: Select genome assembly and search for genes
2. **Sequence View**: Click nucleotides to select positions
3. **Variant Analysis**: Enter alternative nucleotides for Evo2 predictions
4. **Known Variants**: Browse ClinVar variants for comparison

## API Integration

The frontend integrates with multiple backend services:

- **Render API Backend**: Redis-cached genome data (UCSC, NCBI)
  - Genome assemblies and sequences
  - Gene information and ClinVar data
  - Multi-layer caching for performance
- **Modal Inference Backend**: GPU-accelerated Evo2 predictions
  - Variant pathogenicity analysis
  - H100 GPU processing
  - Serverless scaling

## Architecture

```
Frontend (Netlify) 
    ↓
Render API Backend (Redis Cache)
    ↓
External APIs (UCSC, NCBI)

Frontend (Netlify)
    ↓  
Modal Backend (GPU Inference)
    ↓
Evo2 Model (H100 GPU)
```

## Development

```bash
npm run lint          # Lint code
npm run typecheck     # Type checking
npm run format:write  # Format code
npm run preview       # Test production build locally
```

## Environment Configuration

### Production (Netlify)
```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-api.onrender.com
NEXT_PUBLIC_MODAL_ENDPOINT=/api/proxy/modal
NEXT_PUBLIC_API_TIMEOUT=30000
NEXT_PUBLIC_REDIS_CACHE_ENABLED=true
NEXT_PUBLIC_DEBUG_MODE=false
```

### Development (Local)
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_MODAL_ENDPOINT=/api/proxy/modal
NEXT_PUBLIC_API_TIMEOUT=30000
NEXT_PUBLIC_REDIS_CACHE_ENABLED=true
NEXT_PUBLIC_DEBUG_MODE=true
```

## Deployment Notes

- **Static Export**: Configured for Netlify deployment with `next.config.js`
- **Image Optimization**: Disabled for static export compatibility
- **TypeScript**: Build errors ignored for deployment flexibility
- **Netlify Plugin**: `@netlify/plugin-nextjs` included for optimal performance

## License

MIT License