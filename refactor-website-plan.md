# Milens Website Refactor Plan

> Target competitor: [ecc.tools](https://ecc.tools) — scanned all 6 pages (home, skills, platforms, security, consulting, pricing).
> Milens current: 5 HTML pages (`index.html`, `pricing.html`, `security.html`, `skills.html`, `scenarios.html`), all in `docs/`.

---

## Table of Contents

1. [UI/Style Improvements](#1-uistyle-improvements)
   - [1.1 Phase 1: Quick Wins](#11-phase-1-quick-wins)
   - [1.2 Phase 2: Visual Polish](#12-phase-2-visual-polish)
   - [1.3 Phase 3: Production-Ready](#13-phase-3-production-ready)
2. [Content Improvements](#2-content-improvements)
   - [2.1 New Pages (7)](#21-new-pages-7)
   - [2.2 Existing Page Enhancements (2)](#22-existing-page-enhancements-2)
3. [Navigation Update](#3-navigation-update)
4. [Implementation Order](#4-implementation-order)
5. [File Manifest](#5-file-manifest)

---

## 1. UI/Style Improvements

### Source of Truth: ECC Tools CSS Analysis

ECC's key differentiators:
- **Typography:** Google Fonts `Exo 2` + `JetBrains Mono`, fluid `clamp()` sizing everywhere
- **Background:** Mesh gradient (3 radial overlays) + SVG noise texture + floating particles
- **Layout:** `max-width: min(94vw, 1800px)` — much wider than Milens' `1040px`
- **Cards:** `border-radius: 18-24px`, `backdrop-filter: blur()`, gradient backgrounds
- **Buttons:** `border-radius: 14px`, gradient BG, `box-shadow` glow, `translateY(-2px)` hover lift
- **Animations:** fadeIn, stagger, shimmer text, particle float, scroll bounce
- **Mobile:** Hamburger-to-X animated menu at 1280px breakpoint
- **Accessibility:** skip-to-content, focus-visible, prefers-reduced-motion
- **SEO:** JSON-LD schema, OG tags, Twitter cards, canonical URLs

---

### 1.1 Phase 1: Quick Wins (2-3h, all 5 existing pages)

Minimal CSS changes — no layout breakage.

#### 1.1.1 Fluid Typography

Replace hardcoded `px` font sizes with `clamp()` across all pages.

**Before (milens current):**
```css
.hero h1 { font-size: 2.8em; }
.section-title { font-size: 2em; }
```

**After:**
```css
.hero h1 { font-size: clamp(2rem, 4vw + 1rem, 3.5rem); }
.section-title { font-size: clamp(1.5rem, 2.5vw + 0.5rem, 2.25rem); }
```

**Files affected:** All 5 HTML files (shared CSS block in each).

**Full mapping:**

| Element | Old | New |
|---------|-----|-----|
| h1 hero | `2.8em` / `3em` | `clamp(2rem, 4vw + 1rem, 3.5rem)` |
| h2 section-title | `1.8em` / `2em` | `clamp(1.5rem, 2.5vw + 0.5rem, 2.25rem)` |
| .subtitle | `1.1em` / `1.15em` | `clamp(1rem, 1vw + 0.5rem, 1.15rem)` |
| .card h3 | `1.15em` | `clamp(1rem, 1vw + 0.25rem, 1.2rem)` |
| body text | (inherited) | `clamp(0.95rem, 0.5vw + 0.8rem, 1.05rem)` |
| small/muted | `0.78em` – `0.9em` | `clamp(0.75rem, 0.5vw + 0.6rem, 0.9rem)` |

#### 1.1.2 Wider Container

**Before:** `max-width: 1040px`
**After:** `max-width: min(90vw, 1400px)`

```css
.container { max-width: min(90vw, 1400px); }
.nav-inner { max-width: min(90vw, 1400px); }
```

#### 1.1.3 Card Hover Lift

Add subtle movement + shadow on hover for all cards.

```css
.card, .catalog-card, .pricing-card, .scenario-card, .story-card {
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.card:hover, .catalog-card:hover, .pricing-card:hover,
.scenario-card:hover, .story-card:hover {
  transform: translateY(-2px);
  border-color: var(--muted);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}
```

#### 1.1.4 Button Gradient + Shadow

Replace flat CTA buttons with gradient + glow.

**Before:**
```css
.nav-cta { background: var(--accent); }
.btn-primary { background: var(--accent); }
```

**After:**
```css
.nav-cta {
  background: linear-gradient(135deg, var(--accent), #79b8ff);
  box-shadow: 0 4px 16px rgba(88, 166, 255, 0.3);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.nav-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(88, 166, 255, 0.5); }

.btn-primary {
  background: linear-gradient(135deg, var(--accent), #79b8ff);
  box-shadow: 0 4px 16px rgba(88, 166, 255, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(88, 166, 255, 0.4); }
```

#### 1.1.5 Larger Border Radius

```css
:root { --radius: 12px; }
/* was 8px */

/* Buttons and specific elements */
.nav-cta, .btn { border-radius: 10px; }
.tab-btn { border-radius: 20px; } /* unchanged */
```

#### 1.1.6 Section Separators

Add subtle `border-top` between logical sections on `index.html`.

```css
.section { border-top: 1px solid var(--border); padding-top: 72px; }
.section:first-of-type { border-top: none; }
```

#### 1.1.7 Mobile Hamburger Menu

Replace current `hide-mobile` class approach with proper hamburger menu.

**Add to all 5 pages:**

HTML:
```html
<button class="menu-btn" id="menuBtn" aria-label="Toggle menu">
  <span class="bar"></span><span class="bar"></span><span class="bar"></span>
</button>
```

CSS (add to all pages):
```css
.menu-btn { display: none; background: none; border: none; color: var(--text);
  cursor: pointer; padding: 8px; width: 36px; height: 36px; position: relative; }
.menu-btn .bar { display: block; width: 20px; height: 2px; background: currentColor;
  border-radius: 2px; position: absolute; left: 8px; transition: transform 0.3s ease, opacity 0.2s ease; }
.menu-btn .bar:nth-child(1) { top: 10px; }
.menu-btn .bar:nth-child(2) { top: 17px; }
.menu-btn .bar:nth-child(3) { top: 24px; }
.menu-btn.open .bar:nth-child(1) { transform: translateY(7px) rotate(45deg); }
.menu-btn.open .bar:nth-child(2) { opacity: 0; }
.menu-btn.open .bar:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

@media (max-width: 768px) {
  .menu-btn { display: block; }
  .nav-links {
    position: fixed; top: 56px; left: 0; right: 0;
    background: var(--card); border-bottom: 1px solid var(--border);
    flex-direction: column; padding: 16px 24px; gap: 0;
    transform: translateY(-100%); opacity: 0; visibility: hidden;
    transition: transform 0.25s ease, opacity 0.15s ease, visibility 0.15s ease;
  }
  .nav-links.open {
    transform: translateY(0); opacity: 1; visibility: visible;
  }
  .nav-links a { width: 100%; padding: 12px 0; text-align: center; border-radius: 8px; }
  .nav-links a:hover { background: rgba(88,166,255,0.08); }
}

@media (prefers-reduced-motion: reduce) {
  .menu-btn .bar, .nav-links { transition: none; }
}
```

JS (add to all pages):
```javascript
document.getElementById('menuBtn').addEventListener('click', function() {
  this.classList.toggle('open');
  document.querySelector('.nav-links').classList.toggle('open');
});
```

---

### 1.2 Phase 2: Visual Polish (3-5h, all pages)

Substantial CSS additions — elevates visual quality significantly.

#### 1.2.1 Background Mesh Gradient

Add depth to the solid `#0d1117` background.

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(88, 166, 255, 0.08), transparent),
    radial-gradient(ellipse 60% 40% at 80% 50%, rgba(126, 231, 135, 0.04), transparent),
    radial-gradient(ellipse 50% 30% at 10% 80%, rgba(210, 153, 29, 0.04), transparent);
  pointer-events: none;
  z-index: -1;
}
```

#### 1.2.2 Hero Gradient Text

Shimmer animation on key hero words (`index.html`).

```css
.hero h1 span {  /* already has color: var(--accent) */
  background: linear-gradient(90deg, var(--accent) 0%, #7ee787 40%, var(--accent) 80%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmerText 4s ease-in-out infinite;
}

@keyframes shimmerText {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
```

#### 1.2.3 Stagger Animation

Cards fade-in sequentially on page load.

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.stagger-children > * {
  opacity: 0;
  animation: fadeInUp 0.4s ease forwards;
}
.stagger-children > *:nth-child(1) { animation-delay: 0.05s; }
.stagger-children > *:nth-child(2) { animation-delay: 0.1s; }
.stagger-children > *:nth-child(3) { animation-delay: 0.15s; }
.stagger-children > *:nth-child(4) { animation-delay: 0.2s; }
.stagger-children > *:nth-child(5) { animation-delay: 0.25s; }
.stagger-children > *:nth-child(6) { animation-delay: 0.3s; }
/* ... up to n */

@media (prefers-reduced-motion: reduce) {
  .stagger-children > * { animation: none; opacity: 1; }
}
```

Apply `class="stagger-children"` to: feature card grid, pricing grid, catalog grid, scenario grid, story section.

#### 1.2.4 Glass Cards

Add `backdrop-filter: blur()` to card backgrounds.

```css
.card, .pricing-card, .story-card {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
```

#### 1.2.5 Redesigned Footer

Replace current simple footer with branded 4-column grid.

```html
<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <span class="footer-logo"><span>◆</span> Milens</span>
        <p>Open-source AI-DOS platform. 41 MCP tools. Knowledge graphs. Zero lock-in.</p>
      </div>
      <div class="footer-col">
        <h4>Product</h4>
        <a href="index.html#features">Features</a>
        <a href="pricing.html">Pricing</a>
        <a href="security.html">Security</a>
        <a href="scenarios.html">Scenarios</a>
      </div>
      <div class="footer-col">
        <h4>Resources</h4>
        <a href="skills.html">Skills Catalog</a>
        <a href="platforms.html">Platforms</a>
        <a href="compare.html">Compare</a>
        <a href="learning.html">Learning</a>
      </div>
      <div class="footer-col">
        <h4>Connect</h4>
        <a href="https://github.com/fuze210699/milens">GitHub</a>
        <a href="https://github.com/fuze210699/milens#readme">Docs</a>
        <a href="enterprise.html">Enterprise</a>
        <a href="https://github.com/fuze210699/milens/blob/main/CONTRIBUTING.md">Contribute</a>
      </div>
    </div>
    <div class="footer-bottom">
      <p>Open Source · MIT Licensed · No vendor lock-in</p>
      <p>Built for the vibe coding era. Milens — AI-DOS.</p>
    </div>
  </div>
</footer>
```

CSS:
```css
.footer-grid { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: 2rem; margin-bottom: 2rem; }
.footer-brand .footer-logo { font-size: 1.2em; font-weight: 700; margin-bottom: 12px; display: block; }
.footer-brand p { color: var(--muted); font-size: 0.9em; line-height: 1.6; max-width: 280px; }
.footer-col h4 { color: var(--text); font-size: 0.8em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; }
.footer-col a { display: block; color: var(--muted); font-size: 0.9em; margin-bottom: 8px; }
.footer-col a:hover { color: var(--accent); }
.footer-bottom { text-align: center; padding-top: 24px; border-top: 1px solid var(--border); }
@media (max-width: 768px) { .footer-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 480px) { .footer-grid { grid-template-columns: 1fr; text-align: center; } }
```

#### 1.2.6 Pricing Page Enhancements

Add to `pricing.html`:

**a) Billing toggle animation:**
```css
.billing-toggle {
  display: inline-flex; background: var(--card); border: 1px solid var(--border);
  border-radius: 100px; padding: 4px; gap: 2px;
}
.billing-option {
  background: none; border: none; color: var(--muted); font-family: inherit;
  font-size: 0.9em; font-weight: 600; padding: 8px 20px; border-radius: 100px;
  cursor: pointer; transition: all 0.15s ease;
}
.billing-option.active { background: var(--accent); color: #fff; }
```

**b) Feature comparison table:**
```html
<div class="table-wrapper">
  <table class="comparison-table">
    <thead>
      <tr><th>Feature</th><th>Free</th><th class="featured">Pro</th><th>Enterprise</th></tr>
    </thead>
    <tbody>
      <tr><td>MCP Tools</td><td>33</td><td>41</td><td>41</td></tr>
      <!-- ... more rows -->
    </tbody>
  </table>
</div>
```

CSS:
```css
.comparison-table { width: 100%; border-collapse: collapse; }
.comparison-table th { background: var(--card); padding: 12px 16px; text-align: center; border-bottom: 1px solid var(--border); }
.comparison-table th.featured { color: var(--accent); }
.comparison-table td { padding: 10px 16px; text-align: center; border-bottom: 1px solid rgba(48,54,61,0.3); color: var(--muted); }
.comparison-table td:first-child { text-align: left; color: var(--text); font-weight: 500; }
```

#### 1.2.7 Skills Page Sticky Install Bar

Add to `skills.html`: a sticky bottom bar showing `npx milens init --profile <selected>`.

```html
<div class="install-bar" id="installBar">
  <div class="install-bar-inner">
    <span class="install-bar-label">Install:</span>
    <code class="install-bar-cmd" id="installCmd">npx milens init --profile full --interactive</code>
    <button class="install-bar-copy" onclick="copyInstall()">Copy</button>
  </div>
</div>
```

CSS:
```css
.install-bar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
  background: rgba(13,17,23,0.9); backdrop-filter: blur(12px);
  border-top: 1px solid var(--border);
  transform: translateY(100%); transition: transform 0.3s ease;
}
.install-bar.visible { transform: translateY(0); }
.install-bar-inner {
  max-width: min(90vw, 1400px); margin: 0 auto; padding: 12px 24px;
  display: flex; align-items: center; gap: 12px;
}
.install-bar-cmd {
  flex: 1; background: #0d1117; border: 1px solid var(--border);
  border-radius: 6px; padding: 8px 12px; font-family: monospace; font-size: 0.85em; color: var(--green);
}
.install-bar-copy {
  background: var(--accent); color: #fff; border: none; border-radius: 6px;
  padding: 8px 16px; font-weight: 600; cursor: pointer;
}
```

---

### 1.3 Phase 3: Production-Ready (2-3h, all pages)

#### 1.3.1 JSON-LD Structured Data

Add to `<head>` of every page:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Milens",
  "url": "https://milens.ai",
  "description": "Open-source AI-DOS platform. 41 MCP tools, knowledge graphs, blast radius analysis, and closed-loop AI development."
}
</script>
```

And page-specific BreadcrumbList.

#### 1.3.2 OG + Twitter Meta Tags

Add to every page:

```html
<meta property="og:title" content="Milens — AI-DOS: Code Intelligence Platform">
<meta property="og:description" content="41 MCP tools. 7 sub-agent workflows. 50+ security rules. The operating system for AI-driven development.">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Milens">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Milens — AI-DOS: Code Intelligence Platform">
<meta name="twitter:description" content="41 MCP tools. 7 sub-agent workflows. 50+ security rules. The operating system for AI-driven development.">
```

#### 1.3.3 Canonical URLs

```html
<link rel="canonical" href="https://milens.ai">
```

#### 1.3.4 Skip-to-Content Link

```html
<a href="#main-content" class="skip-link">Skip to content</a>
```

```css
.skip-link {
  position: absolute; top: 12px; left: 12px; z-index: 200;
  padding: 10px 16px; border-radius: 8px; background: var(--card);
  color: var(--text); font-weight: 600; text-decoration: none;
  transform: translateY(-150%); transition: transform 0.15s ease;
}
.skip-link:focus { transform: translateY(0); }
```

#### 1.3.5 Focus-Visible Styling

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

#### 1.3.6 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

#### 1.3.7 Status Dot (footer)

```css
.status-dot {
  width: 8px; height: 8px; background: var(--green); border-radius: 50%;
  display: inline-block; margin-right: 6px;
  box-shadow: 0 0 8px var(--green); animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
```

---

## 2. Content Improvements

### 2.1 New Pages (7)

---

#### 2.1.1 `platforms.html` — Cross-Harness Coverage

**Why:** Milens supports 7 AI coding harnesses but has no dedicated showcase page. ECC has `/platforms`. This is the #1 missing page.

**Hero:**
> "One Install. Seven Harnesses. Zero Lock-In."
> Subtitle: "Milens works with Claude Code, OpenCode, Codex, Cursor, GitHub Copilot, Gemini, and Zed. Same tools, same workflows — portable across every editor your team uses."

**Logo Strip (7 harnesses):**

| Harness | Support Level | Key Detail |
|---------|--------------|------------|
| Claude Code | Full | Deepest integration, all 41 tools, hooks, skills |
| OpenCode | Full | Native MCP config, AGENTS.md auto-generate |
| Codex | Full | App + CLI parity, shared skills |
| Cursor | Full | OSS config compatibility, .cursorrules support |
| GitHub Copilot | Partial | MCP tools via adapter, growing support |
| Gemini | Partial | Adapter pack available, CLI tool access |
| Zed | Partial | MCP protocol support, adapter in progress |

**Per-Platform Cards (7 cards in grid-3):**

Each card contains:
- Platform name + icon
- Support badge (Full/Partial)
- Install command (copy-ready)
- MCP config sample
- Link to adapter file

**Command Panel Example (Claude Code):**
```
$ npx milens init --profile full
✓ Knowledge graph built (1045 symbols, 1580 links)
✓ AGENTS.md generated at project root
✓ MCP config added to .claude/mcp.json
✓ 6 skill files installed to .agents/skills/
```

**Parity & Roadmap Table:**

| Feature | Claude Code | OpenCode | Codex | Cursor | Copilot | Gemini | Zed |
|---------|------------|----------|-------|--------|---------|--------|-----|
| All 41 tools | ✓ | ✓ | ✓ | ✓ | ~30 | ~25 | ~20 |
| Skills (6) | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Hooks (6) | ✓ | ✓ | — | — | — | — | — |
| Annotations | ✓ | ✓ | ✓ | — | — | — | — |
| Security scan | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| GitHub App | ✓ | — | — | — | — | — | — |

**Endcap CTA:**
> "Start with the OSS install. Add the GitHub App when your team needs repo-native automation."

---

#### 2.1.2 `compare.html` — Milens vs ECC vs Manual

**Why:** Users search "milens vs ecc" — need an official comparison page. Shows confidence.

**Hero:**
> "Why Teams Choose Milens"
> Subtitle: "An honest comparison of AI code intelligence tools. Choose what fits your team."

**3-Column Comparison Table:**

| Dimension | **Milens** | **ECC** | **No Tool (Manual)** |
|-----------|-----------|---------|---------------------|
| **Approach** | Knowledge Graph (SQLite+FTS5) | File-based instincts | grep + manual reading |
| **MCP Tools** | 41 | ~10 | 0 |
| **Blast Radius** | Yes (3-depth recursive) | No | Manual guesswork |
| **Self-Learning** | Yes (annotate→recall→evolve) | No | No |
| **Token Efficiency** | 40-60% savings (compact format) | Standard | N/A |
| **Offline** | Yes (zero network) | Yes | N/A |
| **Security Rules** | 50+ (OWASP mapped) | 102 (AgentShield) | Manual audit |
| **Skills Ecosystem** | 6 (curated) | 246 (community) | 0 |
| **Setup** | 1 command | 1 command | Days/weeks |
| **Pricing** | Free forever (core) | Free (public repos) | Free (but slow) |
| **Enterprise** | SSO, audit, on-prem | Consulting-led | N/A |
| **Best For** | Teams that want intelligence + safety | Teams that want ecosystem breadth | Solo devs who don't use AI agents |

**"Where Milens Wins" Highlights (green callouts):**

1. **Knowledge Graph > File Instincts** — Milens builds a real graph database. ECC relies on file patterns. Milens answers "who calls this function?" instantly. ECC guesses.
2. **Self-Learning** — Only Milens remembers bugs across sessions and promotes patterns to permanent rules. ECC is stateless.
3. **Token Savings** — Milens' compact format saves 40-60% tokens. For a team of 10 using AI daily, that's $1,000s/month saved.
4. **All 41 Tools in 1 Command** — No marketplace, no plugin system. `npx milens init` and you're done.

**"When ECC Might Be Better" (honest section):**

- You need 246+ community skills for niche workflows
- You want a GitHub App with a polished UI out of the box
- You prefer a consulting-led enterprise engagement model
- Your team already uses ECC's AgentShield for security scanning

**Endcap:**
> "Try Both. Milens is 1 command. ECC is 1 command. No lock-in either way."
> Two buttons: `npx milens init --profile full` | `npm i -g ecc-universal`

---

#### 2.1.3 `enterprise.html` — For Teams & Organizations

**Why:** CTOs and team leads need a dedicated page about scale, governance, and compliance.

**Hero:**
> "Milens at Scale. From 5 to 500 Developers."
> Subtitle: "Standardize how your AI agents work. Enforce conventions. Track every change. Stay compliant."

**Decision Guide (3 cards):**

| You are... | You need... | Plan |
|-----------|------------|------|
| Solo developer or small OSS project | Code intelligence for your AI agent | Free |
| 2-25 person team, private repos | Automated PR reviews, team governance | Pro ($19/seat) |
| 50+ organization, compliance needs | SSO, audit logging, on-prem, dedicated support | Enterprise |

**Feature Grid (comparison table):**

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| MCP Tools | 33 | 41 | 41 |
| Repos | 1 public | Unlimited private | Unlimited private |
| GitHub App | — | ✓ | ✓ |
| SSO/SAML | — | — | ✓ |
| Audit Logging | — | — | ✓ |
| On-Prem Deploy | — | — | ✓ |
| Dedicated Support | Community | Email | Slack + Phone |
| SLA | — | 99.5% | 99.9% |
| Custom Security Rules | — | — | ✓ |
| Team Analytics | — | ✓ | ✓ |

**Security & Compliance Cards:**

1. **SOC2 Ready** — Continuous security scanning on every commit. Audit trail via annotations. Evidence on demand via `recall`.
2. **GDPR / HIPAA** — Fully offline. Zero network calls. No telemetry. Your code never leaves your infrastructure.
3. **ITAR / Defense** — On-prem deployment. Air-gapped compatible. No external dependencies beyond initial npm install.

**Governance Cards:**

1. **AGENTS.md Standardization** — Auto-generated from your actual codebase. Every agent follows the same conventions.
2. **Evolve → Enforce** — Patterns learned by agents get promoted to permanent rules. No drift.
3. **Pre-Commit Gates** — `detect_changes()` + `review_pr()` + `find_dead_code()` — automatic on every commit.

**ROI Estimator (simple):**
> "A team of 10 developers spends ~30% of time understanding code before editing. Milens cuts that to ~10%. At $150k avg salary, that's ~$300k/year saved in engineering time. Plus 40-60% token savings on AI API costs."

**Contact Form:**
- Name, Email, Company, Team Size, Message
- "Talk to Enterprise" CTA

---

#### 2.1.4 `learning.html` — The Self-Learning Codebase

**Why:** Unique feature. No competitor has this. Needs its own page to explain the magic.

**Hero:**
> "Your Codebase Gets Smarter Every Session."
> Subtitle: "Milens is the only code intelligence tool that learns. Agents annotate discoveries. Milens remembers. Over time, patterns evolve into permanent rules."

**How It Works (3-step visual):**

| Step | Tool | What Happens |
|------|------|-------------|
| **1. Annotate** | `annotate({symbol, key, value})` | Agent discovers a bug, quirk, or pattern. Saves it to the knowledge graph with confidence score. |
| **2. Recall** | `recall({symbol})` | Next session, agent auto-retrieves all annotations. "I know `createUser()` has a bug — call `normalizeEmail()` first." |
| **3. Evolve** | `milens evolve` | High-confidence patterns (≥0.9) get promoted to permanent `.agents/skills/*.md` files. Now enforced as rules. |

**Session Journey (terminal demo):**

```
SESSION 1:
  $ annotate({symbol: "createUser", key: "bug",
      value: "Must call normalizeEmail() before createUser() or data corrupts"})
  ✓ Annotated. Confidence: 0.5

SESSION 2:
  $ recall({symbol: "createUser"})
  ⚠ Known issue: "Must call normalizeEmail() before createUser() or data corrupts"
  Agent avoids the bug. Confidence ↑ 0.7

SESSION 5:
  Confidence reaches 0.9
  $ milens evolve
  ✓ Promoted to .agents/skills/milens-bug/SKILL.md
  Now enforced for ALL future sessions.
```

**Confidence Scoring:**
- **0.3 – 0.5:** Agent noted something. Might be useful.
- **0.6 – 0.8:** Corroborated across sessions. Likely important.
- **0.9+:** Proven pattern. Auto-promote to permanent rule.

**Evolve Scheduling:**
```bash
milens evolve                        # Run now
milens evolve --schedule install     # Auto-run weekly via cron/schtasks
```

**Endcap:**
> "Not just indexed. Learned. Milens is the only code intelligence tool with memory."

---

#### 2.1.5 `github-app.html` — GitHub App Integration

**Why:** Milens has a GitHub App but no documentation page for it.

**Hero:**
> "Automated PR Reviews. Pre-Commit Safety. Directly in GitHub."
> Subtitle: "Install the Milens GitHub App and get risk scores, dead code detection, and test impact analysis on every pull request."

**3-Step Install:**

```
1. Authorize → github.com/apps/milens
2. Select repos → Choose which repositories to activate
3. Done → Milens auto-comments on every PR
```

**PR Demo Flow (visual):**

> PR #42 opened: "Refactor payment processing"
>
> Milens bot comments:
> ```
> ## PR Risk Assessment
> | Symbol | Risk | Heat | Dependents | Tested |
> |--------|------|------|------------|--------|
> | handlePayment | CRITICAL | 92 | 15 | No ⚠ |
> | checkoutRoute | HIGH | 78 | 8 | Yes ✓ |
> | formatCurrency | LOW | 10 | 0 | No |
>
> Summary: 1 CRITICAL, 1 HIGH, 1 LOW
> ⚠ Recommend: Add tests for handlePayment before merging.
> ```

**Features:**

| Feature | Description |
|---------|------------|
| `detect_changes` on push | Know exactly which symbols changed |
| `review_pr` on PR open | Risk score for every changed symbol |
| `pre_commit_check` before merge | Combined safety gate |
| Auto-annotate | Changed symbols auto-annotated for future recall |
| Test impact | Know which tests to run |

**Pricing:**
- Free for public repositories
- Pro ($19/seat) for private repositories
- Enterprise for organizations with SSO and audit requirements

**CTA:** "Install GitHub App" button.

---

#### 2.1.6 `adapters.html` — Harness Setup Guide

**Why:** 7 adapter packs exist in `adapters/` directory. Need a page showing how to use each.

**Hero:**
> "Connect Milens to Any AI Coding Agent."
> Subtitle: "Adapter packs with pre-built MCP server configs and agent instructions for Claude Code, OpenCode, Codex, Cursor, GitHub Copilot, Gemini, and Zed."

**Adapter Cards (7 cards, grid-3):**

Each card:

| Field | Example (Claude Code) |
|-------|----------------------|
| Name | Claude Code |
| Status badge | ✓ Full Support |
| Config path | `.claude/mcp.json` |
| MCP config (copyable) | `{ "mcpServers": { "milens": { "command": "npx", "args": ["milens", "serve"] } } }` |
| Instructions file | `adapters/claude-code/AGENTS.md` |
| Install command | `cp adapters/claude-code/* .claude/` |

**All 7 adapters:**

| Adapter | Config File | Support Level |
|---------|-----------|--------------|
| Claude Code | `.claude/mcp.json` | Full |
| OpenCode | `opencode.json` | Full |
| Codex | `.codex/config.json` | Full |
| Cursor | `.cursorrules` | Full |
| GitHub Copilot | `.github/copilot-instructions.md` | Partial |
| Gemini | `.gemini/config.json` | Partial |
| Zed | `.zed/settings.json` | Partial |

**Endcap:**
> "Don't see your harness? Contribute an adapter pack. Milens supports any MCP-compatible agent."

---

#### 2.1.7 `changelog.html` — Version History

**Why:** Credibility signal. Shows active development.

**Hero:**
> "What's New in Milens"
> Subtitle: "Every release, documented. Subscribe to stay updated."

**Timeline format (latest first):**

```
[v0.8.0] — May 2026
• Added compare_impact tool for regression detection
• New hook: onFileChange for live impact updates
• Security scan expanded to 50+ rules
• Dashboard: metrics tab with TER, CQI, UCR charts

[v0.7.0] — April 2026
• 7 pre-built sub-agent prompts (planner, reviewer, tester, etc.)
• Skills catalog: 6 curated skill files
• AGENTS.md auto-generator
• Selective install profiles (core/developer/security/full)

[v0.6.0] — March 2026
• GitHub App (Probot) with PR review automation
• 41 MCP tools total
• Hook system: onSessionStart, onSessionEnd, onPreCommit
• Learning & Evolution: annotate → recall → evolve pipeline

[v0.5.0] — February 2026
• Initial public release
• 33 core MCP tools
• Knowledge graph engine (SQLite + FTS5)
• 12 language support via tree-sitter WASM
```

**Subscribe:** Link to GitHub Releases RSS.

---

### 2.2 Existing Page Enhancements (2)

---

#### 2.2.1 `pricing.html` — Add Decision Guide + Comparison Table

**New section: "Which Plan Is Right For You?" (before pricing cards)**

3 decision cards:

| Card | "You are..." | Plan |
|------|-------------|------|
| Solo Developer | Working alone or on open source. You need code intelligence for your AI agent. No team features needed. | **Free** — `npx milens init` |
| Small Team (2-25) | Private repos. Need automated PR reviews, team-wide conventions, and pre-commit safety gates. | **Pro ($19/seat)** — + GitHub App |
| Organization (50+) | Compliance requirements. SSO. Audit logging. On-prem deployment. Dedicated support. | **Enterprise** — Contact us |

**New section: "Feature Comparison" (after pricing cards)**

Full comparison table (see enterprise.html section for same table structure).

**New section: "Pricing FAQ" (before existing FAQ)**

| Q | A |
|---|----|
| Can I switch plans anytime? | Yes. Upgrade/downgrade instantly. Pro-rated billing. |
| What counts as a seat? | Any developer with access to a private repo with Milens GitHub App installed. |
| Is there a free trial for Pro? | 14-day free trial. No credit card required. |
| Can I use Pro on public repos? | Yes, but Free already covers public repos fully. Pro adds private repo support. |
| Do you offer academic/nonprofit discounts? | Yes. Contact us for details. |

---

#### 2.2.2 `index.html` — Add "Why Milens" Section + Ecosystem Strip

**New section: "Why Teams Switch to Milens" (after features, before pricing)**

3 cards:

| Card | Headline | Body |
|------|---------|------|
| Knowledge Graph | **Real Intelligence, Not Guesswork** | Milens builds a SQLite knowledge graph of your entire codebase. 1045 symbols, 1580 links, all queryable in milliseconds. ECC relies on file-pattern heuristics. Milens answers "who calls this?" instantly. |
| Self-Learning | **Gets Smarter Every Session** | Agents annotate discoveries. Milens remembers. Over time, patterns evolve into permanent rules. No other tool has memory. Your codebase literally gets smarter the more you use it. |
| Token-Efficient | **60% Fewer Tokens. $1,000s Saved.** | Milens' compact format (`name [kind] file:line`) uses 40-60% fewer tokens than raw code blocks. For teams using AI daily, that's real budget impact your CFO will notice. |

**New section: "Works With Your Existing Tools" (before footer)**

Logo strip:
```
[Claude Code] [OpenCode] [Codex] [Cursor] [Copilot] [Gemini] [Zed]
```
Link to `platforms.html`.

---

## 3. Navigation Update

### Current Navigation (all pages):
```
Home | Features | Pricing | Security | Skills | GitHub
```

### Proposed Navigation:
```
Home | Platforms | Skills | Scenarios | Security | Pricing | Enterprise | GitHub
```

**Rationale:**
- `Features` merges into `Home` (it's an anchor link `#features`)
- `Platforms` added (new page)
- `Scenarios` already added
- `Enterprise` added (new page)
- `Compare` and `Learning` accessible from footer + internal links, not top nav
- `GitHub App` accessible from footer + enterprise page CTA
- `Adapters` and `Changelog` in footer only

### Footer (all pages):
```
Product: Features | Pricing | Security | Scenarios
Resources: Skills | Platforms | Compare | Learning | Changelog
Developers: GitHub | Docs | Adapters | GitHub App | Contribute
Company: Enterprise | Status | Contact
```

---

## 4. Implementation Order

### Week 1: Foundation + Priority 1 Content
1. Phase 1 UI changes (1.1.1 – 1.1.7) → all 5 existing pages
2. Create `platforms.html`
3. Create `compare.html`
4. Update navigation in all pages
5. Update footer in all pages (Phase 2.5)

### Week 2: Priority 2 Content + Visual Polish
1. Phase 2 UI changes (1.2.1 – 1.2.7) → all pages
2. Create `enterprise.html`
3. Create `learning.html`
4. Enhance `pricing.html`
5. Enhance `index.html`

### Week 3: Priority 3 + Production-Ready
1. Phase 3 changes (1.3.1 – 1.3.7) → all pages
2. Create `github-app.html`
3. Create `adapters.html`
4. Create `changelog.html`
5. Final navigation + footer consistency check

---

## 5. File Manifest

### Files to Create (7):

| # | File | Estimated Lines | Phase |
|---|------|----------------|-------|
| 1 | `docs/platforms.html` | ~500 | Week 1 |
| 2 | `docs/compare.html` | ~550 | Week 1 |
| 3 | `docs/enterprise.html` | ~600 | Week 2 |
| 4 | `docs/learning.html` | ~500 | Week 2 |
| 5 | `docs/github-app.html` | ~400 | Week 3 |
| 6 | `docs/adapters.html` | ~550 | Week 3 |
| 7 | `docs/changelog.html` | ~350 | Week 3 |

### Files to Modify (5):

| # | File | Type of Change | Phase |
|---|------|---------------|-------|
| 1 | `docs/index.html` | Phase 1 UI + Phase 2 visual + new "Why Milens" section + ecosystem strip + nav/footer update | Week 1-2 |
| 2 | `docs/pricing.html` | Phase 1 UI + Phase 2 visual + decision guide + comparison table + nav/footer update | Week 1-2 |
| 3 | `docs/security.html` | Phase 1 UI + Phase 2 visual + nav/footer update | Week 1 |
| 4 | `docs/skills.html` | Phase 1 UI + Phase 2 visual + sticky install bar + nav/footer update | Week 1-2 |
| 5 | `docs/scenarios.html` | Phase 1 UI + Phase 2 visual + nav/footer update | Week 1 |

### Total: 12 files, ~3,800 net new lines, ~1,500 lines modified.

---

*Plan generated from analysis of ecc.tools (6 pages) and milens current website (5 pages).*
