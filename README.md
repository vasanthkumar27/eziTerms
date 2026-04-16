# EziTerms

AI-powered Terms & Conditions analyzer. Chat with an AI that reads the fine print, flags hidden risks, and answers your questions in plain English.

## Structure

```
├── backend/          FastAPI + SQLite
├── frontend/         React + Vite (chat interface + landing page)
└── extension/        Chrome extension (on-the-fly T&C detection)
```

## Quick start

### Backend

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `localhost:8000`. Opens at http://localhost:5173.

### Extension

```bash
cd extension
npm install
npm run build:local
```

Then load `extension/dist` as an unpacked extension in Chrome.

## Environment

### `backend/.env`

| Variable | Purpose |
|----------|---------|
| `SECRET_KEY` | JWT signing key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `DATABASE_URL` | Default: `sqlite:///./eziterms.db` |
| `BEDROCK_MODEL_ID` | AWS Bedrock LLM model |
| `AWS_DEFAULT_REGION` | AWS region |

### `frontend/.env`

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Backend URL (blank = proxied by Vite dev server) |

### `extension/.env`

| Variable | Purpose |
|----------|---------|
| `VITE_USE_AWS` | `false` for local, `true` for production API |
| `VITE_WEBSITE_BASE_URL` | Frontend URL for token sync |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analyze-terms` | POST | Analyze T&C text |
| `/api/upload-terms` | POST | Upload and analyze document |
| `/api/chatbot` | POST | Ask questions about terms |
| `/api/classify-page` | POST | Detect if text is T&C |
| `/api/masking-preview` | POST | Preview PII masking |
| `/api/history` | GET | Past analyses |
| `/api/signup` | POST | Create account |
| `/api/login` | POST | Email/password login |
| `/api/google-login` | POST | Google OAuth login |
| `/api/token/refresh` | POST | Refresh JWT |
| `/api/logout` | POST | Invalidate session |
| `/api/me` | GET | Current user |
