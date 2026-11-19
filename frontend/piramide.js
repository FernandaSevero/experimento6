// ============================================================
// SERVOS DE QUEÓPS
// Jogo arcade egípcio em canvas 2D.
// - Horizonte livre (sem outras pirâmides ainda construídas)
// - 10 servos em volta (5 de cada lado)
// - Pirâmide pronta: branca com topo dourado + 5s de celebração
// - Vitória: faraó em perfil + pão + cerveja como pagamento
// ============================================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// ---------- paleta ----------
const COR = {
  ceuTopo:  "#0a1410",
  ceuMeio:  "#1d3a2a",
  ceuBaixo: "#7a5c14",
  areia:    "#c9a84a",
  areiaEsc: "#8a6f2a",
  ouro:     "#D4AF37",
  ouroClr:  "#f0d060",
  verde:    "#50C878",
  verdeClr: "#7fe0a0",
  verdeEsc: "#2e7d4f",
  vermelho: "#dc2626",
  branco:   "#ffffff",
  pedra:    "#f5f0e0",
  pedraEsc: "#c9c0a8",
  pele:     "#5a3a22",
  peleEsc:  "#3a1f10",
  cabelo:   "#1a0f08",
  saia:     "#f5f0e0",
  cerveja:  "#b8862a",
  pao:      "#d4a04a",
};

// ---------- geometria da pirâmide ----------
const L = 100;
const ALT = Math.sqrt(L * L - (L / 2) * (L / 2));
const CHAO = H - 60;

const FILEIRAS = [
  { tipos: ["c", "b", "c", "b", "c", "b", "c"], xs: [0.5, 1, 1.5, 2, 2.5, 3, 3.5] },
  { tipos: ["c", "b", "c", "b", "c"],           xs: [1, 1.5, 2, 2.5, 3] },
  { tipos: ["c", "b", "c"],                     xs: [1.5, 2, 2.5] },
  { tipos: ["c"],                               xs: [2] },
];

const LARGURA_BASE = 4 * L;
const X0 = (W - LARGURA_BASE) / 2;

const slots = [];
FILEIRAS.forEach((f, r) => {
  const yBase = CHAO - r * ALT;
  f.tipos.forEach((t, i) => {
    slots.push({
      fileira: r,
      tipo: t,
      angulo: t === "c" ? 0 : 180,
      cx: X0 + f.xs[i] * L,
      cy: t === "c" ? yBase - ALT / 3 : yBase - (2 * ALT) / 3,
      cheio: false,
      isTopo: false,
    });
  });
});

// marca o último slot como topo (ápice — fileira 3)
const idxTopo = slots.findIndex(s => s.fileira === 3);
if (idxTopo >= 0) slots[idxTopo].isTopo = true;

function fileiraLiberada(r) {
  return r === 0 || slots.filter(s => s.fileira === r - 1).every(s => s.cheio);
}

// ---------- estado ----------
const VEL_Y = 4.5;
const TOL_ANG = 25;
const META_PONTOS = slots.length * 10;
const TEMPO_CELEBRACAO_MS = 5000; // 5 segundos admirando a pirâmide pronta

let estado = "inicio";  // inicio | jogando | celebrando | vitoria | derrota
let vidas = 3;
let pontos = 0;
let frameCount = 0;
let shake = 0;
let fimCelebracaoMs = 0;
let peca = novaPeca();
let particulas = [];
let servoAnim = 0;

function novaPeca() {
  return { x: X0 + 2 * L, y: 65, angulo: 0, caindo: false };
}

function reiniciar() {
  slots.forEach(s => (s.cheio = false));
  vidas = 3;
  pontos = 0;
  frameCount = 0;
  shake = 0;
  fimCelebracaoMs = 0;
  peca = novaPeca();
  particulas = [];
  servoAnim = 0;
}

// ---------- servos (5 de cada lado) ----------
const servos = [];
(function criarServos() {
  const baseY = CHAO + 12;
  for (let i = 0; i < 5; i++) {
    servos.push({
      x: X0 - 32 - i * 32,
      y: baseY - (i % 2) * 6,
      lado: "esq",
      fase: i * 0.7,
    });
  }
  for (let i = 0; i < 5; i++) {
    servos.push({
      x: X0 + LARGURA_BASE + 32 + i * 32,
      y: baseY - (i % 2) * 6,
      lado: "dir",
      fase: i * 0.7 + 0.3,
    });
  }
})();

// ---------- ponte com o backend (MUX) ----------
let btnMUX_prev = 0;
window.atualizarJogoComMUX = function (S, valor) {
  if (estado === "inicio") {
    if (S === 1 && !peca.caindo) peca.angulo = (valor / 1023) * 360;
    return;
  }
  if (estado !== "jogando") return;

  if (S === 1) {
    if (!peca.caindo) peca.angulo = (valor / 1023) * 360;
  } else if (S === 0) {
    if (valor === 1 && btnMUX_prev === 0) {
      soltar();
    }
    btnMUX_prev = valor;
  }
};

function soltar() {
  if (estado === "jogando" && !peca.caindo) {
    peca.caindo = true;
  }
}

canvas.addEventListener("click", () => {
  if (estado === "inicio") {
    estado = "jogando";
    reiniciar();
  } else if (estado === "jogando") {
    soltar();
  }
});

document.addEventListener("keydown", (e) => {
  if (estado === "inicio" && (e.code === "Space" || e.code === "Enter")) {
    e.preventDefault();
    estado = "jogando";
    reiniciar();
    return;
  }
  if (estado === "jogando") {
    if (e.key === "ArrowLeft") peca.angulo = (peca.angulo - 10 + 360) % 360;
    if (e.key === "ArrowRight") peca.angulo = (peca.angulo + 10) % 360;
    if (e.code === "Space") {
      e.preventDefault();
      soltar();
    }
  }
});

// ---------- partículas ----------
function criarExplosao(x, y, corPrincipal) {
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3.5;
    particulas.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 1,
      vida: 1,
      cor: i % 2 === 0 ? corPrincipal : COR.ouroClr,
    });
  }
}

function atualizarParticulas() {
  for (let i = particulas.length - 1; i >= 0; i--) {
    const p = particulas[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.vida -= 0.025;
    if (p.vida <= 0) particulas.splice(i, 1);
  }
}

function desenharParticulas() {
  for (const p of particulas) {
    ctx.fillStyle = p.cor;
    ctx.globalAlpha = Math.max(0, p.vida);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------- encaixe ----------
function diferencaAngular(a, b) {
  const d = (((a - b) % 360) + 360) % 360;
  return Math.min(d, 360 - d);
}

function iniciarCelebracao() {
  estado = "celebrando";
  fimCelebracaoMs = performance.now() + TEMPO_CELEBRACAO_MS;
}

function errar() {
  vidas--;
  shake = 10;
  criarExplosao(peca.x, peca.y, COR.vermelho);
  if (vidas <= 0) {
    estado = "derrota";
  }
  peca = novaPeca();
}

// ---------- atualização ----------
function atualizar() {
  frameCount++;
  servoAnim = (servoAnim + 0.06) % (Math.PI * 2);
  if (shake > 0) shake -= 0.4;
  atualizarParticulas();

  // Durante os 5 segundos de pirâmide pronta, solta brilhos festivos
  if (estado === "celebrando") {
    if (frameCount % 25 === 0) {
      const topo = slots[idxTopo];
      criarExplosao(
        topo.cx + (Math.random() - 0.5) * 140,
        topo.cy + (Math.random() - 0.5) * 80,
        COR.ouroClr
      );
    }
    if (performance.now() >= fimCelebracaoMs) {
      estado = "vitoria";
    }
    return;
  }

  if (estado !== "jogando") return;
  if (!peca.caindo) return;

  const proximaVaga = slots.find(s => !s.cheio && fileiraLiberada(s.fileira));
  if (!proximaVaga) {
    iniciarCelebracao();
    return;
  }

  const anguloCerto = diferencaAngular(peca.angulo, proximaVaga.angulo) <= TOL_ANG;
  if (anguloCerto) {
    peca.x += (proximaVaga.cx - peca.x) * 0.2;
    if (Math.abs(peca.x - proximaVaga.cx) < 1) peca.x = proximaVaga.cx;
  }

  const yAnt = peca.y;
  peca.y += VEL_Y;

  if (yAnt < proximaVaga.cy && peca.y >= proximaVaga.cy) {
    if (anguloCerto) {
      proximaVaga.cheio = true;
      pontos += 10;
      shake = 4;
      criarExplosao(
        proximaVaga.cx,
        proximaVaga.cy,
        proximaVaga.isTopo ? COR.ouroClr : COR.pedra
      );
      if (slots.every(v => v.cheio)) {
        iniciarCelebracao();
      } else {
        peca = novaPeca();
      }
    } else {
      errar();
    }
  }

  if (peca.y > CHAO && estado === "jogando") errar();
}

// ============================================================
// CENÁRIO (sem outras pirâmides no horizonte)
// ============================================================
function desenharCeu() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COR.ceuTopo);
  g.addColorStop(0.55, COR.ceuMeio);
  g.addColorStop(0.85, COR.ceuBaixo);
  g.addColorStop(1, COR.areia);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 60; i++) {
    const x = (i * 137) % W;
    const y = (i * 71) % (H * 0.45);
    const a = 0.3 + 0.6 * Math.abs(Math.sin(frameCount * 0.02 + i));
    ctx.fillStyle = `rgba(240,208,96,${a * 0.7})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  const sunX = W * 0.78;
  const sunY = H * 0.55;
  const sunR = 46;
  const sg = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, sunR);
  sg.addColorStop(0, "rgba(240,208,96,0.9)");
  sg.addColorStop(1, "rgba(240,208,96,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COR.ouroClr;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
  ctx.fill();
}

function desenharChao() {
  const g = ctx.createLinearGradient(0, H - 70, 0, H);
  g.addColorStop(0, "#c9a84a");
  g.addColorStop(1, "#8a6f2a");
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 70, W, 70);
  for (let i = 0; i < 120; i++) {
    const x = (i * 89) % W;
    const y = H - 70 + ((i * 37) % 70);
    ctx.fillStyle = "rgba(80,50,10,0.18)";
    ctx.fillRect(x, y, 2, 2);
  }
}

// ============================================================
// TRIÂNGULOS E PIRÂMIDE
// ============================================================
function caminhoTriangulo(cx, cy, ang) {
  ctx.translate(cx, cy);
  ctx.rotate((ang * Math.PI) / 180);
  ctx.beginPath();
  ctx.moveTo(0, (-2 * ALT) / 3);
  ctx.lineTo(L / 2, ALT / 3);
  ctx.lineTo(-L / 2, ALT / 3);
  ctx.closePath();
}

function desenharTriangulo(cx, cy, ang, preenchimento, borda, tracejado, dica) {
  ctx.save();
  caminhoTriangulo(cx, cy, ang);
  if (preenchimento) {
    ctx.fillStyle = preenchimento;
    ctx.fill();
  }
  if (borda) {
    ctx.strokeStyle = borda;
    ctx.lineWidth = 2;
    ctx.setLineDash(tracejado ? [5, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (dica) {
    ctx.fillStyle = "white";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▲", 0, ALT / 12);
  }
  ctx.restore();
}

function desenharPiramide() {
  const proximaVaga = slots.find(s => !s.cheio && fileiraLiberada(s.fileira));
  slots.forEach(s => {
    if (s.cheio) {
      // Todos brancos, exceto o último triângulo (topo) que fica dourado
      const cor = s.isTopo ? COR.ouro : COR.pedra;
      const borda = s.isTopo ? COR.ouroClr : "#b8ae96";
      desenharTriangulo(s.cx, s.cy, s.angulo, cor, borda, false, false);
      if (s.isTopo) {
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(frameCount * 0.1);
        ctx.fillStyle = "#fff3b0";
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      const lib = fileiraLiberada(s.fileira);
      const ehProxima = proximaVaga === s;
      const corBorda = ehProxima
        ? "rgba(80,200,120,0.9)"
        : lib
          ? "rgba(80,200,120,0.35)"
          : "rgba(255,255,255,0.14)";
      desenharTriangulo(s.cx, s.cy, s.angulo, null, corBorda, true, false);
    }
  });
}

// ============================================================
// SERVOS (estilo vencedor de Propriedade de Kemet)
// ============================================================
function desenharServo(x, y, lado, modo) {
  ctx.save();

  // sombra no chão
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 18, 15, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // pernas ajoelhadas/sentadas (pele marrom escura)
  ctx.strokeStyle = COR.pele;
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 8);
  ctx.lineTo(x - 10, y + 16);
  ctx.lineTo(x - 2, y + 17);
  ctx.moveTo(x + 5, y + 8);
  ctx.lineTo(x + 10, y + 16);
  ctx.lineTo(x + 2, y + 17);
  ctx.stroke();

  // saia branca (kilt egípcio) com detalhe dourado
  ctx.fillStyle = COR.saia;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + 2);
  ctx.lineTo(x + 8, y + 2);
  ctx.lineTo(x + 11, y + 12);
  ctx.lineTo(x - 11, y + 12);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = COR.ouro;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 9, y + 7);
  ctx.lineTo(x + 9, y + 7);
  ctx.stroke();

  // tronco (pele marrom escura)
  const inclina = modo === "triste" ? 3 : 0;
  ctx.fillStyle = COR.pele;
  ctx.beginPath();
  ctx.moveTo(x - 7, y + 3);
  ctx.lineTo(x + 7, y + 3);
  ctx.lineTo(x + 9 + inclina, y - 11);
  ctx.lineTo(x - 9 + inclina, y - 11);
  ctx.closePath();
  ctx.fill();

  // colar dourado (usekh)
  ctx.fillStyle = COR.ouro;
  ctx.beginPath();
  ctx.moveTo(x - 8 + inclina, y - 9);
  ctx.lineTo(x + 8 + inclina, y - 9);
  ctx.lineTo(x + 5 + inclina, y - 3);
  ctx.lineTo(x - 5 + inclina, y - 3);
  ctx.closePath();
  ctx.fill();

  // cabeça acompanha o triângulo
  const alvoX = peca ? peca.x : W / 2;
  const alvoY = peca ? peca.y : H / 2;
  const dx = alvoX - x;
  const dy = alvoY - (y - 19);
  const dist = Math.hypot(dx, dy) || 1;
  const olharX = modo === "triste" ? 0 : (dx / dist) * 2.2;
  const olharY = modo === "triste" ? 3 : (dy / dist) * 1.5;

  const cabX = x + inclina + olharX * 0.6;
  const cabY = y - 19 + (modo === "triste" ? 4 : 0);

  // cabeça
  ctx.fillStyle = COR.pele;
  ctx.beginPath();
  ctx.arc(cabX, cabY, 7.5, 0, Math.PI * 2);
  ctx.fill();

  // cabelo curto preto (sem capacete)
  ctx.fillStyle = COR.cabelo;
  ctx.beginPath();
  ctx.arc(cabX, cabY - 1.5, 7.6, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cabX - 7.5, cabY - 1.5, 2.5, 6);
  ctx.fillRect(cabX + 5, cabY - 1.5, 2.5, 6);

  // olhos acompanhando a peça
  if (modo !== "triste") {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cabX - 2.5 + olharX * 0.5, cabY + olharY * 0.4, 1.3, 0, Math.PI * 2);
    ctx.arc(cabX + 2.5 + olharX * 0.5, cabY + olharY * 0.4, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(cabX - 2.5 + olharX * 0.8, cabY + olharY * 0.6, 0.7, 0, Math.PI * 2);
    ctx.arc(cabX + 2.5 + olharX * 0.8, cabY + olharY * 0.6, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  // braços
  ctx.strokeStyle = COR.pele;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";

  if (modo === "festa") {
    const aceno = Math.sin(frameCount * 0.15 + x) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 8);
    ctx.lineTo(x - 14, y - 24 + aceno);
    ctx.moveTo(x + 7, y - 8);
    ctx.lineTo(x + 14, y - 24 - aceno);
    ctx.stroke();
  } else if (modo === "triste") {
    ctx.beginPath();
    ctx.moveTo(x - 6 + inclina, y - 7);
    ctx.lineTo(cabX - 3, cabY + 2);
    ctx.moveTo(x + 6 + inclina, y - 7);
    ctx.lineTo(x + 9, y + 6);
    ctx.stroke();
  } else {
    const dirInterna = lado === "esq" ? 1 : -1;
    const erguido = peca && peca.caindo ? -14 : -4;
    ctx.beginPath();
    ctx.moveTo(x - dirInterna * 7, y - 8);
    ctx.lineTo(x - dirInterna * 11, y + 3);
    ctx.moveTo(x + dirInterna * 7, y - 8);
    ctx.lineTo(x + dirInterna * 15, y - 8 + erguido);
    ctx.stroke();
  }

  ctx.restore();
}

function desenharServos(modo = "jogo") {
  servos.forEach((s, i) => {
    const pular = modo === "festa" ? Math.abs(Math.sin(frameCount * 0.12 + i)) * -6 : 0;
    const balanco = modo === "jogo" && peca.caindo ? Math.sin(servoAnim + i) * 1.2 : 0;
    desenharServo(s.x, s.y + pular + balanco, s.lado, modo);
  });
}

// ============================================================
// PEÇA CAINDO
// ============================================================
function desenharPecaCaindo() {
  if (!peca.caindo) {
    ctx.strokeStyle = "rgba(80,200,120,0.35)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(peca.x, peca.y + ALT / 2);
    ctx.lineTo(peca.x, CHAO);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const vagaAtual = slots.find(s => !s.cheio && fileiraLiberada(s.fileira));
  let corPeca = "#ff4d4d";
  if (vagaAtual && diferencaAngular(peca.angulo, vagaAtual.angulo) <= TOL_ANG) {
    corPeca = "#22dd44";
  }
  desenharTriangulo(peca.x, peca.y, peca.angulo, corPeca, "white", false, true);

  if (vagaAtual && !peca.caindo) {
    ctx.fillStyle = COR.ouroClr;
    ctx.font = 'bold 17px "Cinzel", Georgia, serif';
    ctx.textAlign = "center";
    ctx.fillText(
      vagaAtual.tipo === "c" ? "▲ PRÓXIMO BLOCO: PONTA PARA CIMA" : "▼ PRÓXIMO BLOCO: PONTA PARA BAIXO",
      W / 2, 36
    );
    ctx.textAlign = "left";
  }
}

// ============================================================
// HUD
// ============================================================
function desenharHUD() {
  ctx.strokeStyle = COR.ouro;
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, 210, 74);
  ctx.strokeRect(W - 224, 14, 210, 74);

  ctx.fillStyle = COR.ouroClr;
  ctx.font = 'bold 15px "Cinzel", Georgia, serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("BLOCOS", 24, 22);
  ctx.fillText(`${pontos / 10} / ${slots.length}`, 24, 44);

  ctx.textAlign = "right";
  ctx.fillText("VIDAS", W - 24, 22);
  ctx.fillText(`ÂNGULO: ${Math.round(peca.angulo)}°`, W - 24, 44);
  ctx.textAlign = "left";

  ctx.fillStyle = COR.verdeEsc;
  ctx.fillRect(24, 68, 190, 6);
  ctx.fillStyle = COR.verde;
  ctx.fillRect(24, 68, 190 * (pontos / META_PONTOS), 6);

  for (let i = 0; i < 3; i++) {
    const hx = W - 34 - i * 24;
    const hy = 68;
    ctx.fillStyle = i < vidas ? COR.vermelho : "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(hx - 4, hy, 4, 0, Math.PI * 2);
    ctx.arc(hx + 4, hy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx - 8, hy + 1.5);
    ctx.lineTo(hx, hy + 10);
    ctx.lineTo(hx + 8, hy + 1.5);
    ctx.closePath();
    ctx.fill();
  }
}

// ============================================================
// TELA DE INÍCIO
// ============================================================
function desenharTelaInicio() {
  ctx.fillStyle = "rgba(10,20,16,0.78)";
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 40; i++) {
    const x = (i * 191) % W;
    const y = (i * 83) % H;
    const a = 0.2 + 0.5 * Math.abs(Math.sin(frameCount * 0.015 + i));
    ctx.fillStyle = `rgba(240,208,96,${a})`;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = COR.ouroClr;
  ctx.font = '900 54px "Cinzel", Georgia, serif';
  ctx.shadowColor = "rgba(212,175,55,0.6)";
  ctx.shadowBlur = 20;
  ctx.fillText("SERVOS DE QUEÓPS", W / 2, H / 2 - 85);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COR.verdeClr;
  ctx.font = '700 21px "Cinzel", Georgia, serif';
  ctx.fillText("Construa a Grande Pirâmide antes que Quéops morra", W / 2, H / 2 - 25);

  ctx.fillStyle = COR.branco;
  ctx.font = '500 17px Georgia, serif';
  ctx.fillText("Potenciômetro (S = 1) gira o bloco · Botão (S = 0) solta o bloco.", W / 2, H / 2 + 28);
  ctx.fillText("Complete todos os blocos brancos e o ápice dourado. 3 erros = desabamento.", W / 2, H / 2 + 56);

  const blink = Math.sin(frameCount * 0.08) > 0 ? 1 : 0.35;
  ctx.globalAlpha = blink;
  ctx.fillStyle = COR.ouro;
  ctx.font = '700 20px "Cinzel", Georgia, serif';
  ctx.fillText("CLIQUE OU APERTE ESPAÇO PARA COMEÇAR", W / 2, H / 2 + 130);
  ctx.globalAlpha = 1;
}

// ============================================================
// FARAÓ EM PERFIL (100% Canvas)
// ============================================================
function desenharFarao(cx, cy, escala = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(escala, escala);

  // 1. Coroa Branca interna (Hedjet)
  ctx.fillStyle = "#f7f5ee";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-26, -34);
  ctx.quadraticCurveTo(-8, -72, 22, -96);
  ctx.bezierCurveTo(32, -104, 46, -98, 44, -84);
  ctx.quadraticCurveTo(40, -64, 34, -46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 2. Espiral vermelha frontal da coroa (Khabet)
  ctx.fillStyle = "#e01b1b";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-24, -34);
  ctx.quadraticCurveTo(-36, -54, -42, -72);
  ctx.bezierCurveTo(-46, -84, -32, -90, -28, -80);
  ctx.arc(-34, -78, 4, 0, Math.PI * 1.5, true);
  ctx.quadraticCurveTo(-30, -56, -19, -34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3. Rosto e pescoço em perfil (virado para a esquerda)
  ctx.fillStyle = "#d9a773";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-36, -16);
  ctx.lineTo(-42, -4);
  ctx.lineTo(-50, 10);
  ctx.quadraticCurveTo(-51, 14, -45, 15);
  ctx.lineTo(-42, 16);
  ctx.lineTo(-46, 20);
  ctx.lineTo(-42, 23);
  ctx.lineTo(-45, 26);
  ctx.quadraticCurveTo(-44, 34, -35, 35);
  ctx.quadraticCurveTo(-22, 36, -18, 44);
  ctx.quadraticCurveTo(-16, 56, -24, 66);
  ctx.lineTo(24, 66);
  ctx.quadraticCurveTo(18, 46, 22, 32);
  ctx.lineTo(14, -10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 4. Barba postiça curva no queixo
  ctx.fillStyle = "#cfa06c";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-40, 34);
  ctx.lineTo(-56, 62);
  ctx.quadraticCurveTo(-54, 66, -48, 64);
  ctx.lineTo(-33, 35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 5. Olho egípcio e sobrancelha
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-41, -7);
  ctx.quadraticCurveTo(-32, -11, -21, -6);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(-40, -1);
  ctx.quadraticCurveTo(-32, -5, -24, -1);
  ctx.quadraticCurveTo(-32, 3, -40, -1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2b1a0e";
  ctx.beginPath();
  ctx.arc(-34, -1, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-24, -1);
  ctx.lineTo(-18, -2);
  ctx.stroke();

  // 6. Coroa Vermelha externa (Deshret)
  ctx.fillStyle = "#e01b1b";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-36, -16);
  ctx.lineTo(-38, -36);
  ctx.quadraticCurveTo(8, -24, 34, -46);
  ctx.lineTo(58, -94);
  ctx.quadraticCurveTo(64, -96, 64, -86);
  ctx.lineTo(44, 12);
  ctx.quadraticCurveTo(32, 30, 14, 36);
  ctx.lineTo(8, 22);
  ctx.quadraticCurveTo(6, 4, -4, 4);
  ctx.quadraticCurveTo(-12, 4, -14, -10);
  ctx.quadraticCurveTo(-24, -14, -36, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 7. Orelha detalhada
  ctx.fillStyle = "#d9a773";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(-4, 12, 6, 10, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-4, 12, 3, 0.4, Math.PI * 1.4);
  ctx.stroke();

  // 8. Cobra Ureu dourada na testa
  ctx.fillStyle = "#e8c86b";
  ctx.strokeStyle = "#1a1410";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-36, -16);
  ctx.quadraticCurveTo(-48, -16, -48, -28);
  ctx.quadraticCurveTo(-48, -37, -42, -39);
  ctx.quadraticCurveTo(-37, -39, -39, -32);
  ctx.quadraticCurveTo(-42, -25, -34, -22);
  ctx.quadraticCurveTo(-27, -19, -29, -13);
  ctx.quadraticCurveTo(-33, -12, -36, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#1a1410";
  ctx.beginPath();
  ctx.arc(-44, -35, 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ============================================================
// PÃO E CERVEJA (PAGAMENTO DOS SERVOS)
// ============================================================
function desenharPao(x, y, escala = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(escala, escala);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 16, 42, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COR.pao;
  ctx.beginPath();
  ctx.ellipse(0, 0, 42, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#8a5a18";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "#7a4e14";
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 12, -13);
    ctx.lineTo(i * 12, 13);
    ctx.stroke();
  }
  for (let j = -1; j <= 1; j += 2) {
    ctx.beginPath();
    ctx.moveTo(-34, j * 6);
    ctx.lineTo(34, j * 6);
    ctx.stroke();
  }

  ctx.restore();
}

function desenharCerveja(x, y, escala = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(escala, escala);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 34, 24, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#b07a3a";
  ctx.strokeStyle = "#5a3a10";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-16, 30);
  ctx.quadraticCurveTo(-26, -6, -14, -26);
  ctx.lineTo(14, -26);
  ctx.quadraticCurveTo(26, -6, 16, 30);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#8a5a20";
  ctx.beginPath();
  ctx.ellipse(0, -26, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = COR.cerveja;
  ctx.beginPath();
  ctx.ellipse(0, -27, 12, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff8e0";
  ctx.beginPath();
  ctx.arc(-6, -30, 4.5, 0, Math.PI * 2);
  ctx.arc(0, -32, 5.5, 0, Math.PI * 2);
  ctx.arc(7, -30, 4.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#5a3a10";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-17, -4);
  ctx.lineTo(17, -4);
  ctx.moveTo(-18, 6);
  ctx.lineTo(18, 6);
  ctx.stroke();

  ctx.restore();
}

// ============================================================
// TELA DE VITÓRIA
// ============================================================
function desenharTelaVitoria() {
  ctx.fillStyle = "rgba(10,20,16,0.88)";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;

  const sg = ctx.createRadialGradient(cx + 220, cy - 20, 10, cx + 220, cy - 20, 210);
  sg.addColorStop(0, "rgba(240,208,96,0.65)");
  sg.addColorStop(1, "rgba(240,208,96,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx + 220, cy - 20, 210, 0, Math.PI * 2);
  ctx.fill();

  desenharFarao(cx + 220, cy + 15, 1.45);

  ctx.fillStyle = COR.ouroClr;
  ctx.font = '700 16px "Cinzel", Georgia, serif';
  ctx.textAlign = "center";
  ctx.fillText("PAGAMENTO REAL", cx - 230, cy - 55);

  desenharPao(cx - 260, cy + 15, 1.05);
  desenharCerveja(cx - 185, cy + 10, 1.05);

  desenharServos("festa");

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = COR.ouroClr;
  ctx.font = '900 40px "Cinzel", Georgia, serif';
  ctx.shadowColor = "rgba(212,175,55,0.8)";
  ctx.shadowBlur = 22;
  ctx.fillText("PARABÉNS!", cx, cy - 185);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COR.branco;
  ctx.font = '700 22px "Cinzel", Georgia, serif';
  ctx.fillText("Terminou antes de Quéops morrer.", cx, cy - 140);

  ctx.fillStyle = COR.verdeClr;
  ctx.font = '500 17px Georgia, serif';
  ctx.fillText("Os servos receberam pão e cerveja pela obra concluída!", cx, cy + 125);

  ctx.fillStyle = "#8fa89a";
  ctx.font = '500 15px Georgia, serif';
  ctx.fillText("Recarregue a página para jogar de novo.", cx, cy + 155);
}

// ============================================================
// TELA DE DERROTA
// ============================================================
function desenharPiramideQuebrada(cx, baseY) {
  ctx.save();
  desenharTriangulo(cx - 120, baseY - 26, -14, COR.pedraEsc, "#7a705c", false, false);
  desenharTriangulo(cx - 35, baseY - 28, 8, COR.pedra, "#7a705c", false, false);
  desenharTriangulo(cx + 55, baseY - 25, -22, COR.pedraEsc, "#7a705c", false, false);
  desenharTriangulo(cx + 135, baseY - 22, 32, COR.pedra, "#7a705c", false, false);

  desenharTriangulo(cx - 75, baseY - 78, 145, COR.pedraEsc, "#7a705c", false, false);
  desenharTriangulo(cx + 25, baseY - 72, -162, COR.pedra, "#7a705c", false, false);

  // ápice dourado caído no chão
  desenharTriangulo(cx + 185, baseY - 18, 118, COR.ouro, COR.ouroClr, false, false);

  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 150, baseY);
  ctx.lineTo(cx - 135, baseY + 14);
  ctx.lineTo(cx - 145, baseY + 26);
  ctx.moveTo(cx + 80, baseY);
  ctx.lineTo(cx + 95, baseY + 16);
  ctx.stroke();

  ctx.restore();
}

function desenharTelaDerrota() {
  ctx.fillStyle = "rgba(10,20,16,0.9)";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;

  const sg = ctx.createRadialGradient(cx, cy - 30, 10, cx, cy - 30, 230);
  sg.addColorStop(0, "rgba(220,38,38,0.32)");
  sg.addColorStop(1, "rgba(220,38,38,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy - 30, 230, 0, Math.PI * 2);
  ctx.fill();

  desenharPiramideQuebrada(cx, CHAO);
  desenharServos("triste");

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#ff8888";
  ctx.font = '900 34px "Cinzel", Georgia, serif';
  ctx.shadowColor = "rgba(220,38,38,0.7)";
  ctx.shadowBlur = 22;
  ctx.fillText("A PIRÂMIDE DESABOU...", cx, cy - 175);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COR.ouroClr;
  ctx.font = '700 22px "Cinzel", Georgia, serif';
  ctx.fillText("Quéops não pagará os servos.", cx, cy - 130);

  ctx.fillStyle = "#8fa89a";
  ctx.font = '500 15px Georgia, serif';
  ctx.fillText("Recarregue a página para tentar de novo.", cx, cy + 165);
}

// ============================================================
// LOOP PRINCIPAL
// ============================================================
function desenhar() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  desenharCeu();
  desenharChao();

  if (estado === "inicio" || estado === "jogando" || estado === "celebrando") {
    desenharPiramide();
    desenharServos(estado === "celebrando" ? "festa" : "jogo");
    if (estado === "jogando") {
      desenharPecaCaindo();
      desenharHUD();
    } else if (estado === "celebrando") {
      ctx.fillStyle = COR.ouroClr;
      ctx.font = '900 26px "Cinzel", Georgia, serif';
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(212,175,55,0.7)";
      ctx.shadowBlur = 14;
      ctx.fillText("A PIRÂMIDE DE QUEÓPS ESTÁ PRONTA!", W / 2, 46);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
    }
  }

  desenharParticulas();
  ctx.restore();

  if (estado === "inicio")  desenharTelaInicio();
  if (estado === "vitoria") desenharTelaVitoria();
  if (estado === "derrota") desenharTelaDerrota();
}

function loopJogo() {
  atualizar();
  desenhar();
  requestAnimationFrame(loopJogo);
}
loopJogo();