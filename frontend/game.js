// ============================================================
// PROPRIEDADE DE KEMET
// Jogo arcade egípcio em canvas 2D.
// - 1 pirâmide monumental branca com ápice dourado ao fundo
// - 10 abates = VITÓRIA · 10 passagens = DERROTA (encerra)
// - Tela inicial com a história (clique para começar)
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
  alien:    "#9d00ff",
  alienClr: "#d070ff",
  alienLuz: "#00ffcc",
};

const META_ABATES = 10;
const META_PERDAS = 10;

let estado = "inicio";      // inicio | jogando | vitoria | derrota
let abates = 0;
let perdidas = 0;
let angulo = 45;
let projeteis = [];
let aliens = [];
let particulas = [];
let frameCount = 0;
let shake = 0;
let papiroPisca = 0;

const arqueiroX = 120;
const arqueiroY = H - 80;
const papiroX = W / 2;
const papiroY = H - 70;

// ---------- ponte com o backend (MUX) ----------
let btnMUX_prev = 0;
window.atualizarJogoComMUX = function (S, valor) {
  if (estado === "inicio") {
    if (S === 1) angulo = (valor / 1023) * 80 + 5;
    return;
  }
  if (estado !== "jogando") return;
  if (S === 1) {
    angulo = (valor / 1023) * 80 + 5;
  } else if (S === 0) {
    if (valor === 1 && btnMUX_prev === 0) disparar();
    btnMUX_prev = valor;
  }
};

canvas.addEventListener("click", () => {
  if (estado === "inicio") {
    estado = "jogando";
    abates = 0; perdidas = 0;
    aliens = []; projeteis = []; particulas = []; frameCount = 0;
  }
});

document.addEventListener("keydown", (e) => {
  if (estado === "inicio" && (e.code === "Space" || e.code === "Enter")) {
    estado = "jogando";
    abates = 0; perdidas = 0;
    aliens = []; projeteis = []; particulas = []; frameCount = 0;
  }
});

// ---------- alien ----------
class Alien {
  constructor() {
    this.x = W + 40 + Math.random() * 120;
    this.y = 80 + Math.random() * (H * 0.45);
    this.vel = 1.2 + Math.random() * 1.2;
    this.tam = 18 + Math.random() * 10;
    this.fase = Math.random() * Math.PI * 2;
    this.passou = false;
  }
  atualizar() {
    this.x -= this.vel;
    this.fase += 0.08;
    if (!this.passou && this.x < papiroX + 30) {
      this.passou = true;
      perdidas++;
      papiroPisca = 0.5;
      shake = 8;
      if (perdidas >= META_PERDAS) estado = "derrota";
    }
  }
  desenhar() {
    const pulso = 0.7 + Math.sin(this.fase) * 0.3;
    // rastro
    const g = ctx.createLinearGradient(this.x, this.y, this.x + 40, this.y);
    g.addColorStop(0, `rgba(0,255,204,${0.35 * pulso})`);
    g.addColorStop(1, "rgba(0,255,204,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(this.x + 20, this.y, 30, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // corpo
    ctx.fillStyle = COR.alien;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.tam, this.tam * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // cúpula
    ctx.fillStyle = COR.alienClr;
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.tam * 0.15, this.tam * 0.55, Math.PI, 0);
    ctx.fill();
    // luzinhas
    for (let i = 0; i < 3; i++) {
      const lx = this.x + (i - 1) * this.tam * 0.7;
      ctx.fillStyle = `rgba(0,255,204,${0.4 + pulso * 0.6})`;
      ctx.beginPath();
      ctx.arc(lx, this.y + 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------- projétil ----------
function disparar() {
  const rad = angulo * Math.PI / 180;
  const forca = 16;
  projeteis.push({
    x: arqueiroX + 20, y: arqueiroY - 30,
    vx: Math.cos(rad) * forca, vy: -Math.sin(rad) * forca,
    rastro: [],
  });
}

function atualizarProjeteis() {
  for (let i = projeteis.length - 1; i >= 0; i--) {
    const p = projeteis[i];
    p.rastro.push({ x: p.x, y: p.y });
    if (p.rastro.length > 6) p.rastro.shift();
    p.x += p.vx; p.y += p.vy; p.vy += 0.28;
    for (let j = aliens.length - 1; j >= 0; j--) {
      const a = aliens[j];
      if (Math.hypot(p.x - a.x, p.y - a.y) < a.tam) {
        criarExplosao(a.x, a.y);
        aliens.splice(j, 1);
        projeteis.splice(i, 1);
        abates++; shake = 5;
        if (abates >= META_ABATES) estado = "vitoria";
        break;
      }
    }
    if (p.y > H || p.x > W || p.x < 0) projeteis.splice(i, 1);
  }
}

// ---------- partículas ----------
function criarExplosao(x, y) {
  for (let i = 0; i < 14; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 1 + Math.random() * 3.5;
    particulas.push({
      x, y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      vida: 1, cor: i % 2 === 0 ? COR.verdeClr : COR.ouroClr,
    });
  }
}

function atualizarParticulas() {
  for (let i = particulas.length - 1; i >= 0; i--) {
    const p = particulas[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.08;
    p.vida -= 0.02;
    if (p.vida <= 0) particulas.splice(i, 1);
  }
}

// ============================================================
// CENÁRIO
// ============================================================
function desenharCeu() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COR.ceuTopo);
  g.addColorStop(0.55, COR.ceuMeio);
  g.addColorStop(0.85, COR.ceuBaixo);
  g.addColorStop(1, COR.areia);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // estrelas
  for (let i = 0; i < 60; i++) {
    const x = (i * 137) % W;
    const y = (i * 71) % (H * 0.45);
    const a = 0.3 + 0.6 * Math.abs(Math.sin(frameCount * 0.02 + i));
    ctx.fillStyle = `rgba(240,208,96,${a * 0.7})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // sol dourado
  const sunX = W * 0.75;
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

function desenharPiramides() {
  const cx = W / 2;
  const baseY = H - 75;
  const altura = baseY - 32; // quase no limite superior do quadro
  const largura = altura * 1.55;
  const topoY = baseY - altura;

  // Fração correspondente ao último triângulo (ápice)
  const f = 0.14;
  const apiceBaseY = topoY + altura * f;
  const apiceMeiaLarg = (largura / 2) * f;

  // ---- Corpo da pirâmide (branca) ----
  // Face esquerda (iluminada)
  ctx.fillStyle = "#f5f0e0";
  ctx.beginPath();
  ctx.moveTo(cx, topoY);
  ctx.lineTo(cx - largura / 2, baseY);
  ctx.lineTo(cx, baseY);
  ctx.closePath();
  ctx.fill();

  // Face direita (sombra)
  ctx.fillStyle = "#d2cab4";
  ctx.beginPath();
  ctx.moveTo(cx, topoY);
  ctx.lineTo(cx, baseY);
  ctx.lineTo(cx + largura / 2, baseY);
  ctx.closePath();
  ctx.fill();

  // ---- Último triângulo superior (ápice dourado #D4AF37) ----
  // Face esquerda do ápice
  ctx.fillStyle = "#f0d060";
  ctx.beginPath();
  ctx.moveTo(cx, topoY);
  ctx.lineTo(cx - apiceMeiaLarg, apiceBaseY);
  ctx.lineTo(cx, apiceBaseY);
  ctx.closePath();
  ctx.fill();

  // Face direita do ápice (#D4AF37)
  ctx.fillStyle = "#D4AF37";
  ctx.beginPath();
  ctx.moveTo(cx, topoY);
  ctx.lineTo(cx, apiceBaseY);
  ctx.lineTo(cx + apiceMeiaLarg, apiceBaseY);
  ctx.closePath();
  ctx.fill();

  // Aresta central e linha divisória do ápice
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx, topoY);
  ctx.lineTo(cx, baseY);
  ctx.moveTo(cx - apiceMeiaLarg, apiceBaseY);
  ctx.lineTo(cx + apiceMeiaLarg, apiceBaseY);
  ctx.stroke();
}

function desenharChao() {
  const g = ctx.createLinearGradient(0, H - 80, 0, H);
  g.addColorStop(0, "#c9a84a");
  g.addColorStop(1, "#8a6f2a");
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 80, W, 80);
  for (let i = 0; i < 120; i++) {
    const x = (i * 89) % W;
    const y = H - 80 + ((i * 37) % 80);
    ctx.fillStyle = "rgba(80,50,10,0.18)";
    ctx.fillRect(x, y, 2, 2);
  }
}

function desenharPapiro() {
  const piscando = papiroPisca > 0 && Math.floor(frameCount / 4) % 2 === 0;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(papiroX, papiroY + 26, 30, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const cor = piscando ? COR.vermelho : "#e8d9a8";
  const borda = piscando ? "#ff8888" : COR.ouro;
  ctx.fillStyle = cor;
  ctx.fillRect(papiroX - 18, papiroY - 26, 36, 52);
  ctx.fillStyle = borda;
  ctx.fillRect(papiroX - 20, papiroY - 30, 40, 6);
  ctx.fillRect(papiroX - 20, papiroY + 24, 40, 6);

  ctx.strokeStyle = "rgba(80,50,10,0.6)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = papiroY - 16 + i * 10;
    ctx.beginPath();
    ctx.moveTo(papiroX - 12, y);
    ctx.lineTo(papiroX + 12, y);
    ctx.stroke();
  }
}

function desenharArqueiro() {
  const x = arqueiroX;
  const y = arqueiroY;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + 8, y + 34, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#3a2a10";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y + 15); ctx.lineTo(x - 6, y + 32);
  ctx.moveTo(x, y + 15); ctx.lineTo(x + 10, y + 32);
  ctx.stroke();

  ctx.fillStyle = COR.verdeEsc;
  ctx.beginPath();
  ctx.moveTo(x - 10, y + 15);
  ctx.lineTo(x + 10, y + 15);
  ctx.lineTo(x + 6, y - 18);
  ctx.lineTo(x - 6, y - 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = COR.ouro;
  ctx.beginPath();
  ctx.arc(x, y - 24, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1d3a2a";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y - 24, 6, 0, Math.PI * 2);
  ctx.stroke();

  const rad = angulo * Math.PI / 180;
  ctx.strokeStyle = COR.ouroClr;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + 16, y - 12, 22, -rad - 0.9, -rad + 0.9);
  ctx.stroke();

  const bx = x + 16 + Math.cos(-rad) * 22;
  const by = y - 12 + Math.sin(-rad) * 22;
  ctx.strokeStyle = "#e8d9a8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx + Math.cos(-rad + Math.PI / 2) * 10, by + Math.sin(-rad + Math.PI / 2) * 10);
  ctx.lineTo(bx + Math.cos(-rad - Math.PI / 2) * 10, by + Math.sin(-rad - Math.PI / 2) * 10);
  ctx.stroke();

  ctx.strokeStyle = COR.branco;
  ctx.lineWidth = 2;
  const fx = x + 16 + Math.cos(-rad) * 36;
  const fy = y - 12 + Math.sin(-rad) * 36;
  ctx.beginPath();
  ctx.moveTo(x + 16, y - 12);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  ctx.fillStyle = COR.ouroClr;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + Math.cos(-rad + 2.6) * 6, fy + Math.sin(-rad + 2.6) * 6);
  ctx.lineTo(fx + Math.cos(-rad - 2.6) * 6, fy + Math.sin(-rad - 2.6) * 6);
  ctx.closePath();
  ctx.fill();
}

function desenharProjeteis() {
  for (const p of projeteis) {
    p.rastro.forEach((r, i) => {
      const a = (i + 1) / p.rastro.length * 0.7;
      ctx.fillStyle = `rgba(240,208,96,${a})`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = COR.ouroClr;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function desenharParticulas() {
  for (const p of particulas) {
    ctx.fillStyle = p.cor;
    ctx.globalAlpha = p.vida;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============================================================
// HUD
// ============================================================
function desenharHUD() {
  ctx.strokeStyle = COR.ouro;
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, 220, 70);
  ctx.strokeRect(W - 234, 14, 220, 70);

  ctx.fillStyle = COR.ouroClr;
  ctx.font = 'bold 15px "Cinzel", Georgia, serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("ABATES", 24, 22);
  ctx.fillText(`${abates} / ${META_ABATES}`, 24, 46);

  ctx.textAlign = "right";
  ctx.fillText("PERDIDAS", W - 24, 22);
  ctx.fillText(`${perdidas} / ${META_PERDAS}`, W - 24, 46);
  ctx.textAlign = "left";

  ctx.fillStyle = COR.verdeEsc;
  ctx.fillRect(24, 66, 200, 6);
  ctx.fillStyle = COR.verde;
  ctx.fillRect(24, 66, 200 * (abates / META_ABATES), 6);

  ctx.fillStyle = "#7a1d1d";
  ctx.fillRect(W - 224, 66, 200, 6);
  ctx.fillStyle = COR.vermelho;
  ctx.fillRect(W - 224, 66, 200 * (perdidas / META_PERDAS), 6);
}

// ============================================================
// TELAS
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
  ctx.fillText("PROPRIEDADE DE KEMET", W / 2, H / 2 - 80);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COR.verdeClr;
  ctx.font = '700 22px "Cinzel", Georgia, serif';
  ctx.fillText("Proteja o Papiro", W / 2, H / 2 - 20);

  ctx.fillStyle = COR.branco;
  ctx.font = '500 17px Georgia, serif';
  ctx.fillText("Abata 10 naves para salvar o papiro.", W / 2, H / 2 + 30);
  ctx.fillText("Se 10 naves passarem, os ETs o levam.", W / 2, H / 2 + 58);

  // piscar "clique para começar"
  const blink = Math.sin(frameCount * 0.08) > 0 ? 1 : 0.35;
  ctx.globalAlpha = blink;
  ctx.fillStyle = COR.ouro;
  ctx.font = '700 20px "Cinzel", Georgia, serif';
  ctx.fillText("CLIQUE OU APERTE ESPAÇO PARA COMEÇAR", W / 2, H / 2 + 130);
  ctx.globalAlpha = 1;
}

function desenharTelaVitoria() {
  ctx.fillStyle = "rgba(212,175,55,0.25)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(10,20,16,0.85)";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;

  // sol dourado atrás
  const sg = ctx.createRadialGradient(cx, cy - 40, 10, cx, cy - 40, 200);
  sg.addColorStop(0, "rgba(240,208,96,0.8)");
  sg.addColorStop(1, "rgba(240,208,96,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy - 40, 200, 0, Math.PI * 2);
  ctx.fill();

  // egípcio segurando o papiro
  desenharEgipcioVitorioso(cx, cy + 40);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COR.ouroClr;
  ctx.font = '900 44px "Cinzel", Georgia, serif';
  ctx.shadowColor = "rgba(212,175,55,0.8)";
  ctx.shadowBlur = 22;
  ctx.fillText("VOCÊ PROTEGEU O PAPIRO", cx, cy - 130);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COR.branco;
  ctx.font = '500 18px Georgia, serif';
  ctx.fillText("Kemet está a salvo. Recarregue a página para jogar de novo.", cx, cy + 160);
}

function desenharTelaDerrota() {
  ctx.fillStyle = "rgba(10,20,16,0.88)";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;

  // halo verde frio
  const sg = ctx.createRadialGradient(cx, cy - 40, 10, cx, cy - 40, 200);
  sg.addColorStop(0, "rgba(80,200,120,0.4)");
  sg.addColorStop(1, "rgba(80,200,120,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(cx, cy - 40, 200, 0, Math.PI * 2);
  ctx.fill();

  // ET segurando o papiro
  desenharETVitorioso(cx, cy + 40);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ff8888";
  ctx.font = '900 44px "Cinzel", Georgia, serif';
  ctx.shadowColor = "rgba(220,38,38,0.7)";
  ctx.shadowBlur = 22;
  ctx.fillText("VOCÊ PERDEU O PAPIRO", cx, cy - 130);
  ctx.shadowBlur = 0;

  ctx.fillStyle = COR.branco;
  ctx.font = '500 18px Georgia, serif';
  ctx.fillText("Os ETs levaram a Propriedade de Kemet. Recarregue para tentar de novo.", cx, cy + 160);
}

function desenharEgipcioVitorioso(cx, cy) {
  // pernas (pele marrom escura)
  ctx.strokeStyle = "#5a3a22";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy + 38);
  ctx.lineTo(cx - 12, cy + 72);
  ctx.moveTo(cx + 9, cy + 38);
  ctx.lineTo(cx + 12, cy + 72);
  ctx.stroke();
  ctx.lineCap = "butt";

  // saia branca (kilt egípcio)
  ctx.fillStyle = "#f5f0e0";
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy + 30);
  ctx.lineTo(cx + 18, cy + 30);
  ctx.lineTo(cx + 22, cy + 55);
  ctx.lineTo(cx - 22, cy + 55);
  ctx.closePath();
  ctx.fill();
  // detalhe dourado da saia
  ctx.strokeStyle = COR.ouro;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy + 40);
  ctx.lineTo(cx + 20, cy + 40);
  ctx.stroke();

  // tronco (pele marrom escura, peito nu)
  ctx.fillStyle = "#5a3a22";
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy + 32);
  ctx.lineTo(cx + 16, cy + 32);
  ctx.lineTo(cx + 20, cy - 12);
  ctx.lineTo(cx - 20, cy - 12);
  ctx.closePath();
  ctx.fill();

  // colar/uso dourado (menat) no peito
  ctx.fillStyle = COR.ouro;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy - 10);
  ctx.lineTo(cx + 18, cy - 10);
  ctx.lineTo(cx + 12, cy + 4);
  ctx.lineTo(cx - 12, cy + 4);
  ctx.closePath();
  ctx.fill();

  // cabeça (pele marrom escura)
  ctx.fillStyle = "#5a3a22";
  ctx.beginPath();
  ctx.arc(cx, cy - 28, 16, 0, Math.PI * 2);
  ctx.fill();

  // cabelo curto (bem escuro), sem capacete
  ctx.fillStyle = "#1a0f08";
  ctx.beginPath();
  ctx.arc(cx, cy - 30, 16, Math.PI, 0);
  ctx.fill();
  // laterais do cabelo
  ctx.fillRect(cx - 16, cy - 30, 4, 12);
  ctx.fillRect(cx + 12, cy - 30, 4, 12);

  // olhos brancos
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx - 5, cy - 28, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, cy - 28, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // pupilas
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(cx - 5, cy - 28, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 5, cy - 28, 1, 0, Math.PI * 2);
  ctx.fill();

  // braços erguidos (pele marrom escura)
  ctx.strokeStyle = "#5a3a22";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy + 5);
  ctx.lineTo(cx - 32, cy - 45);
  ctx.moveTo(cx + 16, cy + 5);
  ctx.lineTo(cx + 32, cy - 45);
  ctx.stroke();
  ctx.lineCap = "butt";

  // papiro erguido
  desenharPapiroEm(cx, cy - 62);
}

function desenharETVitorioso(cx, cy) {
  // corpo
  ctx.fillStyle = "#4a5a52";
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy + 70);
  ctx.lineTo(cx + 26, cy + 70);
  ctx.lineTo(cx + 18, cy + 5);
  ctx.lineTo(cx - 18, cy + 5);
  ctx.closePath();
  ctx.fill();
  // cabeça grande
  ctx.fillStyle = "#6a7a72";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 20, 22, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  // olhos pretos grandes
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy - 22, 6, 9, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 8, cy - 22, 6, 9, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // braços segurando o papiro
  ctx.strokeStyle = "#6a7a72";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy + 20);
  ctx.lineTo(cx - 34, cy + 50);
  ctx.moveTo(cx + 18, cy + 20);
  ctx.lineTo(cx + 34, cy + 50);
  ctx.stroke();
  desenharPapiroEm(cx, cy + 55);
}

function desenharPapiroEm(cx, cy) {
  ctx.fillStyle = "#e8d9a8";
  ctx.fillRect(cx - 16, cy - 22, 32, 44);
  ctx.fillStyle = COR.ouro;
  ctx.fillRect(cx - 18, cy - 26, 36, 5);
  ctx.fillRect(cx - 18, cy + 21, 36, 5);
  ctx.strokeStyle = "rgba(80,50,10,0.6)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const y = cy - 12 + i * 10;
    ctx.beginPath();
    ctx.moveTo(cx - 10, y);
    ctx.lineTo(cx + 10, y);
    ctx.stroke();
  }
}

// ============================================================
// LOOP
// ============================================================
function atualizar() {
  frameCount++;
  if (papiroPisca > 0) papiroPisca -= 0.03;
  if (shake > 0) shake -= 0.3;

  if (estado === "jogando") {
    if (frameCount % 75 === 0 && aliens.length < 6) {
      aliens.push(new Alien());
    }
    aliens.forEach(a => a.atualizar());
    aliens = aliens.filter(a => a.x > -80);
    atualizarProjeteis();
  }
  atualizarParticulas();
}

function desenhar() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  desenharCeu();
  desenharPiramides();
  desenharChao();
  desenharPapiro();

  if (estado !== "inicio" && estado !== "vitoria" && estado !== "derrota") {
    aliens.forEach(a => a.desenhar());
    desenharProjeteis();
    desenharArqueiro();
  }
  desenharParticulas();

  if (estado === "jogando") {
    desenharHUD();
  }

  ctx.restore();

  if (estado === "inicio")  desenharTelaInicio();
  if (estado === "vitoria") desenharTelaVitoria();
  if (estado === "derrota") desenharTelaDerrota();
}

function loop() {
  atualizar();
  desenhar();
  requestAnimationFrame(loop);
}
loop();