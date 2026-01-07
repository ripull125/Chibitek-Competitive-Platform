# Chibitek-Competitive-Platform
An AI-powered web app that automatically collects competitor marketing content, analyzes it using NLP, and delivers insights to help Chibitek identify trends and differentiate its messaging.

Form: Cloud-hosted web app.

Firebase Hosting - got a basic URL, still have to connect to backend

Frontend: Node.js/React (Mantine) to display buttons and connect supabase to front end

Database: Supabase 

Data Scraping & Collection: Puppeteer (Node.js library) scraping BooksToScrape website

Automation: Google Cloud Scheduler to automatically call a function once every hour (for now) to scrape data

Graphing & Visualization: Recharts to display number of instances of keywords, currently unfiltered

LLM: GPT 5 Mini + API tokens
