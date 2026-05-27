# Milens Pricing

> **The value proposition:** Milens saves ~70% AI token costs per session. The GitHub App automates this across your team. Pro pays for itself after 2-3 sessions per developer per month.

---

## Why Pay?

| You're a... | Problem | Milens solves it | Cost |
|---|---|---|---|
| **Solo dev** | Agent burns tokens reading 15 files blind, edits break things, no memory across sessions | Knowledge graph + blast radius + annotations. All 33 tools, forever free. | $0 |
| **Team of 5** | Private repos, each dev manually runs milens, PRs get merged without review, security gaps accumulate | GitHub App auto-runs on every PR. review_pr + security_scan posted as comments. Shared knowledge base. | $95/mo |
| **Company (50+)** | Compliance requires audit logs, SSO mandatory, air-gapped environment, custom security rules | Enterprise governance: SSO, audit trail, on-prem deployment, custom rule engine. | Contact |

---

## Plans

### Free — $0/month

**For individuals and public repos.** Prove the value before paying.

| Feature | Included |
|---|---|
| All 33 MCP tools | ✓ Forever |
| 6 sub-agent prompts | ✓ |
| 50+ security rules | ✓ |
| CLI tools (init, workflow, hooks, security, watch) | ✓ |
| AGENTS.md auto-generator | ✓ |
| `/milens analyze` on public repos | 10/month |
| PR auto-review | — |
| Private repos | — |

[Get Started](https://github.com/fuze210699/milens)

### Pro — $19/seat/month

**For professional teams.** The GitHub App automation layer.

| Feature | Included |
|---|---|
| Everything in Free | ✓ |
| **Private repos** | ✓ All |
| **PR auto-review** | ✓ Every PR opened/synced |
| **Push auto-index** | ✓ On push to main |
| `/milens analyze` | 50/seat/month (pooled) |
| Commits per run | 1,000 |
| Advanced security scanning | ✓ AgentShield-backed |
| Custom skill packs | ✓ |
| Billing portal | ✓ Self-serve |
| Priority support | ✓ Email + Slack |

**ROI example:** Team of 5, 100 PRs/month. Without Milens: each PR review takes ~30 min manual or ~15K tokens AI. With Milens: auto-comment on every PR. Saves ~$300/month in tokens alone.

[Subscribe](https://github.com/sponsors/fuze210699)

### Enterprise — Contact Sales

**For organizations.** Governance, compliance, rollout.

| Feature | Included |
|---|---|
| Everything in Pro | ✓ |
| `/milens analyze` | Unlimited |
| Commits per run | 5,000 |
| SSO/SAML | ✓ |
| Audit logging | ✓ |
| Custom security rules | ✓ |
| Policy packs | ✓ |
| On-premises deployment | ✓ |
| Dedicated support + SLAs | ✓ |
| Rollout consulting | ✓ |
| Procurement support | ✓ |

[Contact Enterprise](mailto:milens-enterprise@example.com)

---

## FAQ

### Why would I pay when the core is free?

The core MCP server (33 tools) is free forever. You pay for **automation** — the GitHub App that runs milens on every PR without manual intervention. Pro saves teams hours of manual review and thousands of AI tokens per month.

### Does Pro really pay for itself?

Yes. A single `review_pr()` call in the GitHub App replaces ~15K tokens of manual AI review work. At Sonnet pricing ($3/MTok), that's ~$0.045 per PR. With 100 PRs/month, the manual approach costs ~$135/month in tokens alone. Pro costs $95/month for 5 seats — you save $40/month **just on tokens**, plus the time savings from automated reviews.

### What's the difference between Free and Pro GitHub App?

| | Free | Pro |
|---|---|---|
| Trigger | Comment `/milens analyze` manually | Auto on every PR + push |
| Scope | Public repos only | Private + public |
| Monthly limit | 10 analyses | 50/seat (pooled) |
| PR review | — | Auto review_pr + security_scan |
| Push indexing | — | Auto on push to main |

### Can I upgrade from Free to Pro?

Yes. Install the Pro plan on the same GitHub organization. All existing data and configurations are preserved.

### Do you offer startup/academic discounts?

Yes — contact us for details.

### Is my code stored?

No. Milens clones the repo temporarily, runs analysis in-memory, and deletes the clone immediately. Only the generated AGENTS.md and skill files are committed to your PR. No source code is stored on milens servers.
