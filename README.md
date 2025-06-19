# Evo2 Variant Analysis

A web app for predicting DNA mutation pathogenicity using the Evo2 deep learning model. Analyze single nucleotide variants (SNVs) and compare with ClinVar classifications.

## Features

- 🧬 Evo2 model for variant effect prediction
- 🩺 SNV pathogenicity prediction (pathogenic/benign)
- ⚖️ ClinVar classification comparison
- 🌍 Genome assembly browsing and gene search
- 💻 FastAPI backend with GPU acceleration
- 📱 Next.js frontend with modern UI

## Evo2 Model
- [Paper](https://www.biorxiv.org/content/10.1101/2025.02.18.638918v1)
- [GitHub](https://github.com/ArcInstitute/evo2)

## Quickstart

### Backend
```bash
git clone --recurse-submodules https://github.com/shivazshu/evo2-vep.git
cd evo2-backend
pip install -r requirements.txt
modal setup
modal run main.py
# or deploy: modal deploy main.py
```

### Frontend
```bash
cd evo2-frontend
npm install
npm run dev
```
Set `NEXT_PUBLIC_ANALYZE_VARIANT_BASE_URL` in `.env.local` to your backend endpoint.

## Tech Stack
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Backend**: FastAPI, Modal, GPU-accelerated inference

---

