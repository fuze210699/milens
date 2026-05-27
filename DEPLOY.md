# Milens Website Deployment

## Quick Deploy (Vercel — Recommended)

### One-time setup

1. **Push to GitHub** (if not already):
   ```bash
   git add docs/ vercel.json
   git commit -m "website: milens.ai landing page"
   git push
   ```

2. **Import to Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repo `fuze210699/milens`
   - Configure:
     - **Framework Preset:** Other
     - **Root Directory:** `./`
     - **Output Directory:** `docs`
     - **Build Command:** (leave empty — static HTML)
   - Deploy

3. **Domain (optional):**
   - Vercel gives you `milens.vercel.app` for free
   - Add custom domain `milens.ai` in Vercel dashboard → Domains
   - Set DNS: CNAME `cname.vercel-dns.com`

### File structure served

| URL | File |
|---|---|
| `/` | `docs/index.html` |
| `/pricing` | `docs/pricing.html` |
| `/security` | `docs/security.html` |
| `/skills` | `docs/skills.html` |
| `/quickstart` | `docs/quickstart.md` (rendered by GitHub) |
| `/tools` | `docs/tools.md` |
| `/adapters` | `docs/adapters.md` |
| `/pricing.md` | `docs/pricing.md` |

### Config

`vercel.json` handles:
- `cleanUrls: true` — no `.html` in URLs
- `outputDirectory: docs` — serves the docs folder
- Security headers (X-Content-Type-Options, X-Frame-Options)
- Cache (1 hour on static assets)

## Alternative Deploy Options

### GitHub Pages
```bash
# Settings → Pages → Source: Deploy from a branch → Branch: main, folder: /docs
# URL: https://fuze210699.github.io/milens
```
Note: `cleanUrls` not supported on GitHub Pages. `.html` extension required in URLs.

### Cloudflare Pages
1. Connect repo → `docs/` as output directory
2. `_redirects` file for clean URLs

### Local Preview
```bash
npx serve docs/
# → http://localhost:3000
```
