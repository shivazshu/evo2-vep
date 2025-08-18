# Evo2 Variant Analysis

A web app for predicting DNA mutation pathogenicity using the Evo2 deep learning model. Analyze single nucleotide variants (SNVs) and compare with ClinVar classifications.

## Features

- 🧬 Evo2 model for variant effect prediction
- 🩺 SNV pathogenicity prediction (pathogenic/benign)
- ⚖️ ClinVar classification comparison
- 🌍 Genome assembly browsing and gene search
- 💻 Dual backend architecture with GPU acceleration
- 📱 Next.js frontend with modern UI
- ⚡ Redis-cached genome data APIs
- 🚀 Cloud-native deployment

## Evo2 Model
- [Paper](https://www.biorxiv.org/content/10.1101/2025.02.18.638918v1)
- [GitHub](https://github.com/ArcInstitute/evo2)

## Architecture & Deployment

This project uses a modern cloud-native architecture:

- **Frontend**: Deployed on **Netlify** (Next.js)
- **Inference Backend**: Deployed on **Modal** (GPU-accelerated Evo2 model)
- **API Backend**: Deployed on **Render** (Redis-cached genome APIs)

### Deployment Setup

#### 1. Modal (Inference Backend)
```bash
git clone --recurse-submodules https://github.com/shivazshu/evo2-vep.git
cd evo2-backend
pip install -r requirements.txt
modal setup
modal deploy main.py
```

#### 2. Render (API Backend)
Deploy `api_server.py` to Render with:
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `python api_server.py`
- **Environment**: Add Redis URL and other config from `env.example`

#### 3. Netlify (Frontend)
Deploy the `evo2-frontend` directory:
- **Build Command**: `npm run build`
- **Publish Directory**: `out`
- **Environment**: Set API endpoints in Netlify environment variables

### Local Development

#### Backend Services
```bash
# Terminal 1: Start Redis-cached API server
cd evo2-backend
pip install -r requirements.txt
python api_server.py

# Terminal 2: Run Modal inference locally (optional)
modal run main.py
```

#### Frontend
```bash
cd evo2-frontend
npm install
cp env.local.example .env.local
# Edit .env.local with your API endpoints
npm run dev
```

## Tech Stack
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Inference**: Modal, FastAPI, GPU H100, Evo2 model
- **API Backend**: FastAPI, Redis caching, Render deployment
- **External APIs**: UCSC Genome Browser, NCBI E-utilities

---

