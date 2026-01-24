# Deployment guide

This repository contains a React/Vite client in `client/` and a Node server in `server/`.

This file describes how to deploy the client to Firebase Hosting and the server to Cloud Run.

Important: I cannot run cloud commands on your behalf (they require your accounts and credentials). The repository now includes the configuration and CI workflows to perform automated deploys once you add the required secrets.

## Client — Firebase Hosting

1. Ensure your production env variables are available at build-time:

   - Create `client/.env.production` locally with these values (or provide them via CI):

     ```text
     VITE_SUPABASE_URL=https://your-project.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```

   - Do NOT commit `.env.production` if it contains secrets. Use GitHub Actions secrets instead.

2. Initialize Firebase (one-time):

   ```fish
   cd client
   npm install -g firebase-tools
   firebase login
   firebase init hosting
   # set public directory to 'dist'
   # configure as SPA (rewrite all urls to index.html)
   ```

3. Deploy locally:

   ```fish
   cd client
   npm ci
   npm run build
   firebase deploy --only hosting
   ```

4. CI: A GitHub Actions workflow has been added at `.github/workflows/firebase-hosting.yml`. Set these GitHub repository secrets:

   - `FIREBASE_TOKEN` — obtain with `firebase login:ci` (one-time) and save to GitHub secrets.
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — values used at build-time.

## Server — Cloud Run (optional)

1. A `server/Dockerfile` is included.

2. Use the provided GitHub Actions workflow `.github/workflows/cloud-run-deploy.yml`. It requires these GitHub secrets:

   - `GCP_SA_KEY` — JSON service account key with permissions to Cloud Build & Cloud Run.
   - `GCP_PROJECT_ID` — your Google Cloud project id.
   - `SUPABASE_URL`, `SUPABASE_KEY` — server-side secrets. Use Secret Manager and avoid putting service_role keys in the client.

3. To deploy manually with gcloud:

   ```fish
   gcloud auth login
   gcloud config set project YOUR_GCP_PROJECT_ID
   cd server
   gcloud builds submit --tag gcr.io/YOUR_GCP_PROJECT_ID/chibitek-server
   gcloud run deploy chibitek-server --image gcr.io/YOUR_GCP_PROJECT_ID/chibitek-server --region us-central1 --platform managed --allow-unauthenticated --set-env-vars SUPABASE_URL=...,SUPABASE_KEY=...
   ```

## Supabase OAuth redirect settings

When you deploy, add your production URL(s) to Supabase Auth settings:

- Site URL: `https://<your-hosting-domain>`
- Redirect URLs: `https://<your-hosting-domain>/login` (and any other URLs you need)

Also update the Google OAuth client redirect URIs in Google Cloud Console if you're using Google provider through Supabase.

## Next steps I can do for you

- Wire a custom domain in `client/firebase.json` and show DNS steps.
- Add a small script that calls Supabase to verify session after deploy.
- Configure Secret Manager and a small helper to read secrets in Cloud Run.
