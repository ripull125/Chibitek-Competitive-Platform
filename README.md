# Chibitek Competitive Platform

An AI-powered web app that collects competitor content from multiple social media platforms, analyzes it using LLMs, and delivers insights to help businesses identify trends, monitor competitors, and improve marketing strategy.

Form: Cloud-hosted web application

Frontend: React (Vite) + Mantine UI

Backend: Node.js + Express

Database & Authentication: Supabase

Hosting: Firebase Hosting

Data Collection: ScrapeCreators APIs and platform-specific integrations for X, LinkedIn, Instagram, YouTube, Reddit, and TikTok

Visualization: Recharts for engagement metrics, keyword trends, and platform comparisons

LLM: OpenAI, Cerebras

## Configuration

This project uses Supabase, Firebase Hosting, Google Cloud Run, the OpenAI API, and ScrapeCreators.

API keys and tokens are not included in the repository for security reasons. Before running the project, create a `.env` file using the provided `.env.example` template and replace the placeholder values with your own credentials.

Required environment variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
SCRAPECREATORS_API_KEY=
PORT=
```

## Main Features

* Competitor Lookup across multiple social media platforms
* Username, URL, and keyword search support
* AI-generated competitive insights and summaries
* Dashboard analytics and trend visualization
* Saved Posts system tied to user accounts
* Multi-user authentication through Supabase
* Exportable reports and competitor research

## Environment Variables

Frontend:

* VITE_SUPABASE_URL
* VITE_SUPABASE_ANON_KEY
* VITE_API_URL

Backend:

* SUPABASE_URL
* SUPABASE_SERVICE_ROLE_KEY
* OPENAI_API_KEY
* SCRAPECREATORS_API_KEY
* FIREBASE_PROJECT_ID
* PORT

## Deployment

### Frontend Deployment

Build the React application:

```bash
npm run build
```

Deploy to Firebase Hosting:

```bash
firebase deploy
```

### Backend Deployment (Google Cloud Run)

Build container:

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/chibitek-api
```

Deploy container:

```bash
gcloud run deploy chibitek-api \
  --image gcr.io/PROJECT_ID/chibitek-api \
  --platform managed \
  --allow-unauthenticated \
  --region us-central1
```

Update the frontend environment variable:

```env
VITE_API_URL=https://YOUR-CLOUD-RUN-URL
```

Redeploy Firebase Hosting after updating the API URL.

## Token Usage

Cerebras and Github tokens are used when generating: 

* Competitive summaries
* Marketing insights
* Trend analysis
* Dashboard recommendations

ScrapeCreators credits are consumed whenever social media content is collected from supported platforms.

Token and credit usage depends on:

* Number of searches
* Number of platforms searched
* Size of AI-generated responses

## Architecture

User → React Frontend → Express Backend → Supabase Database

User → React Frontend → Express Backend → OpenAI GPT-5 Mini

User → React Frontend → Express Backend → ScrapeCreators APIs

## Future Improvements

* Email reports
* Additional platform integrations
* More advanced dashboard filtering
* Historical trend tracking
* Improved AI insight generation
