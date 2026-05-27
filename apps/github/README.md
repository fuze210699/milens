# Milens GitHub App

Automated code intelligence for your repositories.

## Features
- `/milens analyze` — Analyze repo and generate skill files + AGENTS.md
- PR Auto-review — Risk assessment on every pull request
- Push analysis — Auto-index on push (Pro tier)

## Deployment
1. Create a GitHub App from `app-manifest.json`
2. Deploy to Cloudflare Workers / Vercel / Railway
3. Set webhook URL and secret

## Local Development
```bash
npm install
npm run dev
```
