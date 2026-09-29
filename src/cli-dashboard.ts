export function generateDashboardHtml(stats: ReturnType<import('./store/db.js').Database['getToolUsageStats']>, annotationStats?: { total: number; confidenceBands: number[]; recent: { symbol: string; key: string; confidence: number; createdAt: string }[] }, repoFilter?: string): string {
  const byToolJson = JSON.stringify(stats.byTool);
  const byDayJson = JSON.stringify(stats.byDay);
  const recentJson = JSON.stringify(stats.recentCalls);

  const savingsPercent = stats.totalTokensOut > 0
    ? Math.round((stats.totalTokensSaved / (stats.totalTokensOut + stats.totalTokensSaved)) * 100)
    : 0;

  const fmtNum = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1_000 ? (n / 1_000).toFixed(1) + 'K' : String(n);

  const confBars = annotationStats ? renderConfBars(annotationStats.confidenceBands, annotationStats.total) : '';
  const recentAnnots = annotationStats ? annotationStats.recent.map(a => `
          <li>
            <div><span class="annot-sym">${a.symbol}</span><span class="annot-key">${a.key}</span></div>
            <span class="annot-conf ${a.confidence >= 0.7 ? 'hi' : a.confidence >= 0.4 ? 'md' : 'lo'}">${(a.confidence * 100).toFixed(0)}%</span>
          </li>`).join('') : '';
  const learningStats = annotationStats ? `
    <div class="card learning-section">
      <div class="card-header">
        <div><div class="card-title">Confidence Distribution</div><div class="card-subtitle">${annotationStats.total} total annotations</div></div>
      </div>
      <div class="tool-bars">${confBars}</div>
    </div>
    <div class="card learning-section">
      <div class="card-header">
        <div><div class="card-title">Recent Annotations</div><div class="card-subtitle">Last ${annotationStats.recent.length}</div></div>
      </div>
      <ul class="annot-list">${recentAnnots}</ul>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>milens Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0a0e14; --surface: #12171e; --card: #161d27; --card-hover: #1a2332;
    --border: #1e2a3a; --border-light: #2a3a4e;
    --text: #e2e8f0; --text-secondary: #94a3b8; --text-muted: #64748b;
    --accent: #60a5fa; --accent-dim: #60a5fa22;
    --green: #34d399; --green-dim: #34d39915;
    --orange: #fbbf24; --orange-dim: #fbbf2415;
    --purple: #a78bfa; --purple-dim: #a78bfa15;
    --red: #f87171;
    --radius: 16px; --radius-sm: 10px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg); color: var(--text);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.5; min-height: 100vh;
  }

  /* ── Layout ── */
  .wrapper { max-width: 1400px; margin: 0 auto; padding: 32px 24px 80px; }

  /* ── Header ── */
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .logo { width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, var(--accent), var(--purple)); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; color: #fff; }
  .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
  .header h1 span { color: var(--text-muted); font-weight: 400; font-size: 14px; margin-left: 8px; }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,80%,100% { opacity: 1; } 40% { opacity: 0.4; } }
  .status-text { font-size: 12px; color: var(--text-muted); }
  .refresh-btn {
    background: var(--accent-dim); color: var(--accent); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 8px 16px; cursor: pointer;
    font-weight: 500; font-size: 13px; transition: all 0.2s;
  }
  .refresh-btn:hover { background: var(--accent); color: #0a0e14; }

  /* ── KPI Cards ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
  .kpi {
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 24px; position: relative; overflow: hidden; transition: border-color 0.2s;
  }
  .kpi:hover { border-color: var(--border-light); }
  .kpi-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 16px; }
  .kpi-icon.blue { background: var(--accent-dim); }
  .kpi-icon.green { background: var(--green-dim); }
  .kpi-icon.purple { background: var(--purple-dim); }
  .kpi-icon.orange { background: var(--orange-dim); }
  .kpi .value { font-size: 32px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
  .kpi .value.blue { color: var(--accent); }
  .kpi .value.green { color: var(--green); }
  .kpi .value.purple { color: var(--purple); }
  .kpi .value.orange { color: var(--orange); }
  .kpi .label { color: var(--text-muted); font-size: 13px; margin-top: 6px; font-weight: 500; }
  .kpi .sub { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
  .kpi-glow {
    position: absolute; top: -40px; right: -40px; width: 120px; height: 120px;
    border-radius: 50%; opacity: 0.06; pointer-events: none;
  }
  .kpi-glow.blue { background: var(--accent); }
  .kpi-glow.green { background: var(--green); }
  .kpi-glow.purple { background: var(--purple); }
  .kpi-glow.orange { background: var(--orange); }

  /* ── Charts ── */
  .grid-2 { display: grid; grid-template-columns: 5fr 7fr; gap: 16px; margin-bottom: 16px; }
  .grid-full { margin-bottom: 16px; }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 24px; transition: border-color 0.2s;
  }
  .card:hover { border-color: var(--border-light); }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .card-title { font-size: 14px; font-weight: 600; color: var(--text); }
  .card-subtitle { font-size: 12px; color: var(--text-muted); }

  /* ── Chart containers ── */
  .chart-container { position: relative; width: 100%; }
  .chart-container.h-280 { height: 280px; }
  .chart-container.h-300 { height: 300px; }

  /* ── Top Tools Bar ── */
  .tool-bars { display: flex; flex-direction: column; gap: 10px; }
  .tool-bar-row { display: flex; align-items: center; gap: 12px; }
  .tool-bar-name { width: 140px; font-size: 12px; font-family: 'SF Mono', 'Fira Code', monospace; color: var(--text-secondary); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tool-bar-track { flex: 1; height: 28px; background: var(--surface); border-radius: 6px; overflow: hidden; position: relative; }
  .tool-bar-fill { height: 100%; border-radius: 6px; display: flex; align-items: center; padding: 0 10px; font-size: 11px; font-weight: 600; color: #fff; min-width: fit-content; transition: width 0.6s ease; }
  .tool-bar-count { font-size: 12px; color: var(--text-muted); min-width: 36px; text-align: right; }

  /* ── Recent Table ── */
  .table-wrapper { max-height: 400px; overflow-y: auto; border-radius: var(--radius-sm); }
  .table-wrapper::-webkit-scrollbar { width: 6px; }
  .table-wrapper::-webkit-scrollbar-track { background: transparent; }
  .table-wrapper::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead { position: sticky; top: 0; z-index: 1; }
  th {
    text-align: left; color: var(--text-muted); font-weight: 500; padding: 10px 16px;
    background: var(--card); border-bottom: 1px solid var(--border); font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  td { padding: 10px 16px; border-bottom: 1px solid var(--border); }
  tr:hover td { background: var(--surface); }
  .tool-badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--accent-dim); color: var(--accent); padding: 3px 10px;
    border-radius: 6px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; font-weight: 500;
  }
  .when-text { color: var(--text-muted); }
  .duration-text { color: var(--text-secondary); font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
  .saved-text { color: var(--green); font-weight: 600; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }

  /* ── Footer ── */
  .footer { text-align: center; padding: 24px 0 0; color: var(--text-muted); font-size: 12px; }

  /* ── Tabs ── */
  .tab-nav { display: flex; gap: 4px; margin-bottom: 28px; border-bottom: 2px solid var(--border); padding-bottom: 0; }
  .tab { padding: 10px 24px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-muted); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; background: none; border-top: none; border-left: none; border-right: none; outline: none; }
  .tab:hover { color: var(--text-secondary); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* ── Learning ── */
  .suggestion-box { background: var(--accent-dim); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 20px; text-align: center; margin-bottom: 20px; }
  .suggestion-box code { background: var(--surface); padding: 2px 8px; border-radius: 4px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; color: var(--accent); }
  .learning-section { margin-bottom: 16px; }
  .annot-list { list-style: none; padding: 0; }
  .annot-list li { padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .annot-list li:last-child { border-bottom: none; }
  .annot-sym { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; color: var(--accent); }
  .annot-key { font-size: 11px; color: var(--text-muted); background: var(--surface); padding: 2px 8px; border-radius: 4px; margin-left: 8px; }
  .annot-conf { font-size: 12px; font-weight: 600; }
  .annot-conf.hi { color: var(--green); }
  .annot-conf.md { color: var(--orange); }
  .annot-conf.lo { color: var(--red); }

  /* ── Responsive ── */
  @media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } .grid-2 { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .kpi-grid { grid-template-columns: 1fr; } .wrapper { padding: 16px 12px 80px; } }
</style>
</head>
<body>
<div class="wrapper">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="logo">m</div>
      <h1>milens <span>dashboard</span></h1>
    </div>
    <div class="header-right">
      <span class="repo-badge" style="background:rgba(88,166,255,0.12);color:#58a6ff;border:1px solid rgba(88,166,255,0.25);border-radius:20px;padding:4px 12px;font-size:0.78em;font-weight:600;margin-right:12px;">${repoFilter ? repoFilter.replace(/\\\\/g, '/').split('/').pop() || repoFilter : 'All Repos'}</span>
      <div class="status-dot"></div>
      <span class="status-text">Live</span>
      <button class="refresh-btn" onclick="refreshData()">&#8635; Refresh</button>
    </div>
  </div>

  <!-- Tab Navigation -->
  <div class="tab-nav">
    <button class="tab active" data-tab="usage" onclick="switchTab('usage')">Usage Analytics</button>
    <button class="tab" data-tab="learning" onclick="switchTab('learning')">Learning</button>
  </div>

  <div id="tab-usage" class="tab-content active">

  <!-- KPIs -->
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-icon blue">&#9881;</div>
      <div class="value blue" id="kpi-calls">${fmtNum(stats.totalCalls)}</div>
      <div class="label">Tool Calls</div>
      <div class="sub" id="kpi-calls-sub">${stats.totalCalls.toLocaleString()} total invocations</div>
      <div class="kpi-glow blue"></div>
    </div>
    <div class="kpi">
      <div class="kpi-icon green">&#9889;</div>
      <div class="value green" id="kpi-saved">${fmtNum(stats.totalTokensSaved)}</div>
      <div class="label">Tokens Saved</div>
      <div class="sub" id="kpi-saved-sub">${stats.totalTokensSaved.toLocaleString()} tokens not wasted</div>
      <div class="kpi-glow green"></div>
    </div>
    <div class="kpi">
      <div class="kpi-icon purple">&#9733;</div>
      <div class="value purple" id="kpi-pct">${savingsPercent}%</div>
      <div class="label">Token Efficiency</div>
      <div class="sub">${fmtNum(stats.totalTokensOut)} returned vs ${fmtNum(stats.totalTokensSaved)} saved</div>
      <div class="kpi-glow purple"></div>
    </div>
    <div class="kpi">
      <div class="kpi-icon orange">&#9201;</div>
      <div class="value orange" id="kpi-avg">${stats.totalCalls > 0 ? Math.round(stats.totalDurationMs / stats.totalCalls) : 0}ms</div>
      <div class="label">Avg Response Time</div>
      <div class="sub">${(stats.totalDurationMs / 1000).toFixed(1)}s total processing</div>
      <div class="kpi-glow orange"></div>
    </div>
  </div>

  <!-- Charts Row -->
  <div class="grid-2">
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Top Tools</div>
          <div class="card-subtitle">By number of calls</div>
        </div>
      </div>
      <div id="toolBars" class="tool-bars"></div>
    </div>
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Daily Activity</div>
          <div class="card-subtitle">Calls &amp; tokens saved over the last 30 days</div>
        </div>
      </div>
      <div class="chart-container h-280"><canvas id="dayChart"></canvas></div>
    </div>
  </div>

  <!-- Savings Distribution -->
  <div class="grid-2" style="grid-template-columns: 7fr 5fr;">
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Recent Tool Calls</div>
          <div class="card-subtitle">Last 50 invocations</div>
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Tool</th><th>When</th><th>Duration</th><th style="text-align:right">Tokens Saved</th></tr></thead>
          <tbody id="recentBody"></tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Savings by Tool</div>
          <div class="card-subtitle">Token savings distribution</div>
        </div>
      </div>
      <div class="chart-container h-300"><canvas id="savingsChart"></canvas></div>
    </div>
  </div>

  <div class="footer">milens &middot; auto-refreshes every 30s</div>
</div><!-- /tab-usage -->

<div id="tab-learning" class="tab-content">
  <div class="suggestion-box">
    <h3 style="margin-bottom:8px;font-weight:600;">Metrics &amp; Insights</h3>
    <p style="color:var(--text-secondary);font-size:13px;">Run <code>milens metrics</code> for a full code-quality metrics report.</p>
  </div>
  ${learningStats}
</div>

</div><!-- /wrapper -->

<script>
const COLORS = ['#60a5fa','#34d399','#fbbf24','#a78bfa','#f87171','#2dd4bf','#818cf8','#fb923c','#e879f9','#38bdf8','#4ade80','#facc15','#f472b6','#22d3ee','#a3e635','#c084fc'];
const BAR_COLORS = ['#60a5fa','#34d399','#fbbf24','#a78bfa','#f87171','#2dd4bf','#818cf8','#fb923c','#e879f9','#38bdf8'];
let byTool = ${byToolJson};
let byDay = ${byDayJson};

function fmtK(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n; }

/* ── Top Tools Horizontal Bars ── */
function renderToolBars() {
  const el = document.getElementById('toolBars');
  const sorted = [...byTool].sort((a,b) => b.calls - a.calls).slice(0, 10);
  const maxCalls = sorted[0]?.calls || 1;
  el.innerHTML = sorted.map((t, i) => {
    const pct = Math.max(8, (t.calls / maxCalls) * 100);
    const col = BAR_COLORS[i % BAR_COLORS.length];
    return \`<div class="tool-bar-row">
      <span class="tool-bar-name">\${t.tool}</span>
      <div class="tool-bar-track">
        <div class="tool-bar-fill" style="width:\${pct}%;background:linear-gradient(90deg,\${col}dd,\${col}88)">\${t.calls}</div>
      </div>
      <span class="tool-bar-count">\${fmtK(t.tokensSaved)}</span>
    </div>\`;
  }).join('');
}

/* ── Daily Activity Chart ── */
let dayChartInstance = null;
function renderDayChart() {
  if (dayChartInstance) dayChartInstance.destroy();
  const ctx = document.getElementById('dayChart');
  const labels = byDay.map(d => {
    const parts = d.date.split('-');
    return parts[1] + '/' + parts[2];
  });
  dayChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Calls', data: byDay.map(d => d.calls),
          backgroundColor: '#60a5fa44', hoverBackgroundColor: '#60a5fa88',
          borderRadius: 4, borderSkipped: false, yAxisID: 'y', barPercentage: 0.7,
        },
        {
          label: 'Tokens Saved', data: byDay.map(d => d.tokensSaved),
          type: 'line', borderColor: '#34d399', pointBackgroundColor: '#34d399',
          pointRadius: 2, pointHoverRadius: 5, borderWidth: 2.5,
          yAxisID: 'y1', tension: 0.4, fill: { target: 'origin', above: '#34d39910' },
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 15 },
          grid: { display: false },
        },
        y: {
          position: 'left', ticks: { color: '#60a5fa', font: { size: 11 } },
          grid: { color: '#1e2a3a' }, title: { display: true, text: 'Calls', color: '#60a5fa', font: { size: 11 } },
        },
        y1: {
          position: 'right', ticks: { color: '#34d399', font: { size: 11 }, callback: v => fmtK(v) },
          grid: { drawOnChartArea: false }, title: { display: true, text: 'Tokens Saved', color: '#34d399', font: { size: 11 } },
        },
      },
      plugins: {
        legend: { labels: { color: '#94a3b8', boxWidth: 12, usePointStyle: true, padding: 16 } },
        tooltip: {
          backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1, titleColor: '#e2e8f0',
          bodyColor: '#94a3b8', cornerRadius: 8, padding: 12,
          callbacks: { label: ctx => ctx.dataset.label + ': ' + (ctx.datasetIndex === 1 ? fmtK(ctx.raw) : ctx.raw) },
        },
      },
    },
  });
}

/* ── Savings Doughnut ── */
function renderSavingsChart() {
  const ctx = document.getElementById('savingsChart');
  const sorted = [...byTool].sort((a,b) => b.tokensSaved - a.tokensSaved);
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  if (rest.length) top.push({ tool: 'others', tokensSaved: rest.reduce((s,t) => s + t.tokensSaved, 0), calls: 0 });
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: top.map(t => t.tool),
      datasets: [{
        data: top.map(t => t.tokensSaved),
        backgroundColor: top.map((_, i) => COLORS[i]),
        borderWidth: 0, hoverOffset: 6,
      }],
    },
    options: {
      responsive: true, cutout: '68%',
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 12 }, padding: 8, usePointStyle: true, pointStyleWidth: 10 } },
        tooltip: {
          backgroundColor: '#1e293b', borderColor: '#334155', borderWidth: 1, titleColor: '#e2e8f0',
          bodyColor: '#94a3b8', cornerRadius: 8, padding: 12,
          callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmtK(ctx.raw) + ' tokens' },
        },
      },
    },
  });
}

/* ── Recent Calls Table ── */
function renderRecent(data) {
  const tbody = document.getElementById('recentBody');
  tbody.innerHTML = data.map(r => {
    const ago = timeAgo(r.calledAt);
    return \`<tr>
      <td><span class="tool-badge">\${r.tool}</span></td>
      <td class="when-text">\${ago}</td>
      <td class="duration-text">\${r.durationMs}ms</td>
      <td class="saved-text" style="text-align:right">+\${r.tokensSaved.toLocaleString()}</td>
    </tr>\`;
  }).join('');
}

function timeAgo(iso) {
  const d = new Date(iso.includes('T') ? iso : iso + 'Z');
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

/* ── Refresh ── */
async function refreshData() {
  const btn = document.querySelector('.refresh-btn');
  btn.textContent = '⟳ Loading...';
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    byTool = data.byTool; byDay = data.byDay;
    document.getElementById('kpi-calls').textContent = fmtK(data.totalCalls);
    document.getElementById('kpi-calls-sub').textContent = data.totalCalls.toLocaleString() + ' total invocations';
    document.getElementById('kpi-saved').textContent = fmtK(data.totalTokensSaved);
    document.getElementById('kpi-saved-sub').textContent = data.totalTokensSaved.toLocaleString() + ' tokens not wasted';
    const pct = data.totalTokensOut > 0 ? Math.round((data.totalTokensSaved / (data.totalTokensOut + data.totalTokensSaved)) * 100) : 0;
    document.getElementById('kpi-pct').textContent = pct + '%';
    document.getElementById('kpi-avg').textContent = (data.totalCalls > 0 ? Math.round(data.totalDurationMs / data.totalCalls) : 0) + 'ms';
    renderToolBars(); renderDayChart(); renderRecent(data.recentCalls);
  } catch(e) { console.error('Refresh failed', e); }
  btn.innerHTML = '&#8635; Refresh';
}

/* ── Tab Switching ── */
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
}

/* ── Init ── */
renderToolBars();
renderDayChart();
renderSavingsChart();
renderRecent(${recentJson});
setInterval(refreshData, 30000);
</script>
</body>
</html>`;
}

function renderConfBars(bands: number[], total: number): string {
  const labels = ['0.0–0.4', '0.4–0.7', '0.7–0.9', '0.9–1.0'];
  const colors = ['#f87171', '#fbbf24', '#60a5fa', '#34d399'];
  return labels.map((label, i) => {
    const pct = total > 0 ? (bands[i] / total) * 100 : 0;
    return '<div class="tool-bar-row"><span class="tool-bar-name">' + label + '</span><div class="tool-bar-track"><div class="tool-bar-fill" style="width:' + Math.max(4, pct) + '%;background:' + colors[i] + 'dd">' + bands[i] + '</div></div></div>';
  }).join('');
}
