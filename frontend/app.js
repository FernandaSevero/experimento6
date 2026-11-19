const VREF = 5.0;
const MAX_CODE = 1023;
const ALPHA = 0.25;
const WINDOW_SEC = 20;
const MAX_POINTS = 1200;
const CHART_FPS = 10;
const TIMELINE_MAX = 30;

const $ = id => document.getElementById(id);

function setText(id, txt) {
  const el = $(id);
  if (el) el.textContent = txt;
}
function setCls(id, cls, on) {
  const el = $(id);
  if (el) el.classList.toggle(cls, on);
}

let S = 0;
let smoothed = null;
let btnPrev = 0;
let btnCount = 0;
let lastT = null;

const rawBuf = [];
const smoothBuf = [];
const timeline = [];
const teleBuf = [];

const chartEl = document.getElementById("chart");
if (!chartEl) { console.error("[app] #chart nao existe no DOM"); }
const chart = new Chart(chartEl.getContext("2d"), {
  type: "line",
  data: {
    datasets: [
      { label: "bruto", data: [], borderColor: "#D4AF37", borderWidth: 1,
        pointRadius: 0, fill: false, tension: 0 },
      { label: "suavizado (a=0,25)", data: [], borderColor: "#50C878", borderWidth: 2,
        pointRadius: 0, fill: true, backgroundColor: "rgba(80,200,120,.15)", tension: 0.3 },
    ],
  },
  options: {
    animation: false,
    parsing: false,
    interaction: { intersect: false, mode: "index" },
    scales: {
      x: {
        type: "linear",
        min: 0, max: WINDOW_SEC,
        title: { display: true, text: "tempo (s, janela deslizante)", color: "#7fe0a0" },
        ticks: { color: "#7fe0a0" },
        grid: { color: "rgba(80,200,120,.10)" },
      },
      y: {
        min: 0, max: VREF,
        title: { display: true, text: "tensao (V)", color: "#7fe0a0" },
        ticks: { color: "#7fe0a0" },
        grid: { color: "rgba(80,200,120,.10)" },
      },
    },
    plugins: { legend: { labels: { color: "#d8e8de" } } },
  },
});

const bitsEl = document.getElementById("adc-bits");
const BITS = Array.from({ length: 10 }, () => {
  const d = document.createElement("div");
  d.className = "bit";
  d.textContent = "0";
  if (bitsEl) bitsEl.appendChild(d);
  return d;
});

setCls("panel-grafico", "hidden", false);
setCls("panel-telemetria", "hidden", false);
const tg = $("tab-grafico");    if (tg) tg.style.display = "none";
const tt = $("tab-telemetria"); if (tt) tt.style.display = "none";

async function setS(val) {
  S = val;
  setCls("s0", "active", val === 0);
  setCls("s1", "active", val === 1);
  setCls("view-botao", "hidden", val !== 0);
  setCls("view-pot", "hidden", val !== 1);
  setText("chart-mode", val === 0 ? "canal = botao (0/1)" : "canal = potenciometro (0..1023)");

  const sw = $("mux-switch");
  if (sw) sw.setAttribute("y2", val === 0 ? "115" : "45");
  setCls("mux-in-A", "active", val === 1);
  setCls("mux-in-B", "active", val === 0);

  smoothed = null;
  rawBuf.length = 0;
  smoothBuf.length = 0;
  chart.data.datasets[0].data = [];
  chart.data.datasets[1].data = [];
  chart.update("none");

  try {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ S: val }),
    });
  } catch (e) { /* ignora */ }
}

document.addEventListener("DOMContentLoaded", () => {
  const s0 = $("s0"); if (s0) s0.onclick = () => setS(0);
  const s1 = $("s1"); if (s1) s1.onclick = () => setS(1);
});

const pad10 = n => n.toString(2).padStart(10, "0");
const hex3 = n => "0x" + n.toString(16).toUpperCase().padStart(3, "0");
const fmtT = s => new Date(s * 1000).toLocaleTimeString();
const nowLocal = () => performance.now() / 1000;

let lastChartDraw = 0;
function drawChart() {
  const t = nowLocal();
  if (t - lastChartDraw < 1 / CHART_FPS) return;
  lastChartDraw = t;

  const cut = t - WINDOW_SEC;
  while (rawBuf.length && rawBuf[0].tLocal < cut) rawBuf.shift();
  while (smoothBuf.length && smoothBuf[0].tLocal < cut) smoothBuf.shift();

  chart.options.scales.x.min = t - WINDOW_SEC;
  chart.options.scales.x.max = t;
  chart.options.scales.x.ticks.callback = v => (v - t).toFixed(0) + "s";

  chart.data.datasets[0].data = rawBuf.map(p => ({ x: p.tLocal, y: p.v }));
  chart.data.datasets[1].data = smoothBuf.map(p => ({ x: p.tLocal, y: p.v }));
  chart.update("none");
}

(function loopChart() {
  drawChart();
  requestAnimationFrame(loopChart);
})();

let lastSmoothPush = 0;
function pushSmooth(v, tLocal) {
  const t = nowLocal();
  if (t - lastSmoothPush < 0.5) return;
  lastSmoothPush = t;
  smoothBuf.push({ tLocal, v });
  if (smoothBuf.length > MAX_POINTS) smoothBuf.splice(0, smoothBuf.length - MAX_POINTS);
}

function handle(s) {
  setText("conn", s.connected ? "Conectado" : "Sem serial");
  const connEl = $("conn");
  if (connEl) connEl.className = "badge " + (s.connected ? "on" : "off");
  setText("port", s.port || "-");
  setText("rate", (s.rate_hz ?? 0).toFixed(1));
  setText("rxc", s.rx_count ?? 0);
  setText("lost", s.lost_count ?? 0);
  setText("ts", s.t_host ? fmtT(s.t_host) : "-");

  const adc = s.adc | 0;
  const pct = (adc / MAX_CODE) * 100;
  const fill = $("adc-fill"); if (fill) fill.style.width = pct + "%";
  const mark = $("adc-marker"); if (mark) mark.style.left = pct + "%";
  setText("adc-dec", adc);
  setText("adc-hex", hex3(adc));
  setText("adc-v", (adc * VREF / MAX_CODE).toFixed(3) + " V");

  const bin = pad10(adc);
  for (let i = 0; i < BITS.length; i++) {
    BITS[i].textContent = bin[i];
    BITS[i].classList.toggle("on", bin[i] === "1");
  }

  setText("btn-state", s.botao ? "PRESSIONADO" : "SOLTO");
  setText("btn-raw", s.botao ? "LOW / LOW" : "HIGH / HIGH");

  setText("raw-line", s.raw_line || "-");
  setText("link-status", s.connected ? "OK" : "offline");
  setText("link-err", s.last_error || "-");

  setText("mux-adc", adc);
  setText("mux-btn", s.botao);
  setText("mux-out-val", s.value);
  setText("mux-out-chan", s.channel === "pot" ? "canal POT (A0)" : "canal BTN (D2)");

  if (s.botao === 1 && btnPrev === 0) {
    btnCount++;
    timeline.push(s.t_host || nowLocal());
    while (timeline.length > TIMELINE_MAX) timeline.shift();
    renderTimeline();
  }
  btnPrev = s.botao;
  setText("btn-count", btnCount);
  setText("btn-level", s.botao);

  const ind = $("btn-ind");
  if (ind) {
    ind.textContent = s.botao ? "PRESSIONADO" : "SOLTO";
    ind.className = "indicator " + (s.botao ? "on" : "off");
  }

  const code = s.value | 0;
  const volts = code * VREF / MAX_CODE;
  smoothed = smoothed === null ? code : ALPHA * code + (1 - ALPHA) * smoothed;
  const smoothVolts = smoothed * VREF / MAX_CODE;

  const tLocal = nowLocal();
  rawBuf.push({ tLocal, v: volts });
  if (rawBuf.length > MAX_POINTS) rawBuf.splice(0, rawBuf.length - MAX_POINTS);
  pushSmooth(smoothVolts, tLocal);

  if (S === 1) {
    setText("pot-dec", adc);
    setText("pot-v", (adc * VREF / MAX_CODE).toFixed(3) + " V");
  }

  const dt = lastT != null && s.t_host ? Math.round((s.t_host - lastT) * 1000) : null;
  lastT = s.t_host;
  teleBuf.unshift({ t_host: s.t_host, adc, botao: s.botao, t_ms: s.t_ms, dt, S: s.S, canal: s.channel, valor: s.value });
  while (teleBuf.length > 20) teleBuf.pop();
  renderTelemetry();

  if (window.atualizarJogoComMUX) window.atualizarJogoComMUX(S, s.value);
}

function renderTimeline() {
  const el = $("btn-timeline"); if (!el) return;
  const now = nowLocal();
  el.innerHTML = "";
  timeline.forEach(t => {
    const age = Math.min(1, (now - t) / 30);
    const d = document.createElement("div");
    d.className = "tick";
    d.style.opacity = String(1 - age);
    el.appendChild(d);
  });
}

function renderTelemetry() {
  const tb = $("tele-body"); if (!tb) return;
  tb.innerHTML = "";
  teleBuf.forEach((r, i) => {
    const tr = document.createElement("tr");
    tr.className = i === 0 ? "current" : "";
    tr.innerHTML = '<td class="px-2 py-0.5">' + (r.t_host ? fmtT(r.t_host) : "-") + '</td>' +
      '<td class="px-2 py-0.5 text-right font-mono">' + r.adc + '</td>' +
      '<td class="px-2 py-0.5 text-right font-mono">' + r.botao + '</td>' +
      '<td class="px-2 py-0.5 text-right font-mono">' + r.t_ms + '</td>' +
      '<td class="px-2 py-0.5 text-right font-mono">' + (r.dt ?? "-") + '</td>' +
      '<td class="px-2 py-0.5 text-right font-mono">' + r.S + '</td>' +
      '<td class="px-2 py-0.5">' + r.canal + '</td>' +
      '<td class="px-2 py-0.5 text-right font-mono">' + r.valor + '</td>';
    tb.appendChild(tr);
  });
}

let ws = null;
function connect() {
  try { if (ws) ws.close(); } catch (_) {}
  ws = new WebSocket("ws://" + location.host + "/ws");
  ws.onopen = () => {
    setText("conn", "Conectado");
    const el = $("conn"); if (el) el.className = "badge on";
  };
  ws.onclose = () => {
    setText("conn", "Desconectado");
    const el = $("conn"); if (el) el.className = "badge off";
    setTimeout(connect, 1500);
  };
  ws.onerror = () => { try { ws.close(); } catch (_) {} };
  ws.onmessage = ev => {
    try { handle(JSON.parse(ev.data)); } catch (e) { /* pacote ruim */ }
  };
}

window.addEventListener("DOMContentLoaded", () => {
  fetch("/api/config")
    .then(r => r.json())
    .then(cfg => { setS(cfg.S); connect(); })
    .catch(() => { setS(0); connect(); });
});
