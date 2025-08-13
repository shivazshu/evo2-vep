# Evo2 Frontend

A Next.js frontend for genomic variant analysis using the Evo2 deep learning model. Search genes, view DNA sequences, and analyze genetic variants with pathogenicity predictions.

## Features

- 🧬 Gene search and DNA sequence visualization
- 🔬 Variant analysis with Evo2 pathogenicity predictions
- 🩺 ClinVar integration for known variants
- ⚡ Multi-layer caching and rate limiting
- 🎨 Modern UI with Tailwind CSS and Radix UI

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
npm install
```

### Environment
Create `.env.local`:
```env
MODAL_ANALYZE_VARIANT_BASE_URL=your_evo2_api_url
```

### Development
```bash
npm run dev
```

### Production
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

- **UCSC Genome Browser**: Genome assemblies and sequences
- **NCBI E-utilities**: Gene information and ClinVar data
- **Evo2 Backend**: Variant analysis predictions

## Development

```bash
npm run lint          # Lint code
npm run typecheck     # Type checking
npm run format:write  # Format code
```

## License

MIT License 