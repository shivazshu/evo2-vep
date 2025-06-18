# Evo2 Variant Analysis

A simple web app for predicting the pathogenicity of DNA mutations (variant effect prediction) using the Evo2 deep learning model. Analyze single nucleotide variants (SNVs), compare predictions with ClinVar classifications, and explore gene/variant data interactively.

## Features

- 🧬 Evo2 model for variant effect prediction
- 🩺 Predict pathogenicity of SNVs (pathogenic/benign)
- ⚖️ Compare Evo2 predictions with ClinVar classifications
- 💯 Confidence estimation for predictions
- 🌍 Genome assembly and chromosome browsing
- 🔍 Gene search (e.g., BRCA1)
- 🌐 Reference genome sequence (UCSC API)
- 💻 Python backend (FastAPI, Modal, GPU-accelerated)
- 📱 Responsive Next.js frontend (React, Tailwind CSS, Shadcn UI)

## Evo2 Model
- [Paper](https://www.biorxiv.org/content/10.1101/2025.02.18.638918v1)
- [GitHub](https://github.com/ArcInstitute/evo2)

## Tech Stack
- Next.js, React, TypeScript, Tailwind CSS, Shadcn UI
- FastAPI, Modal (for backend)

## Quickstart

### Backend
1. Install Python 3.10
2. Clone the repo and enter backend folder:
   ```bash
   git clone --recurse-submodules <repo-url>
   cd evo2-backend
   pip install -r requirements.txt
   modal setup
   modal run main.py
   # or deploy:
   modal deploy main.py
   ```

### Frontend
1. Enter frontend folder and install dependencies:
   ```bash
   cd evo2-frontend
   npm install
   npm run dev
   ```
2. Set `NEXT_PUBLIC_ANALYZE_VARIANT_BASE_URL` in `.env.local` to your backend endpoint.

---

