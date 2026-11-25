// Pêndulo simples: montagem 3D, física, cronômetro, fotoporta, tabela e gráfico.

import * as THREE from 'three';
import { criarCena, criarArraste } from '../motor/cena.js';
import { MAT } from '../motor/materiais.js';
import * as P from '../motor/pecas.js';
import {
  CONST, rk4, PassoFixo, raioEsfera, parametrosPendulo, derivPendulo,
  periodoPequeno, periodoExato, amplitudePendulo,
} from '../motor/fisica.js';
import { fmt, fmtCronometro, naResolucao, gauss } from '../motor/medida.js';
import { abas, deslizante, escolha, chave, tabelaMedidas, grafico, baixar, aviso } from '../motor/painel.js';
import { rotulo } from '../motor/rotulos.js';

/* ───────────────────────── Geometria da montagem ───────────────────────── */

const TOPO = 0.79;                 // altura do tampo da bancada
const Z_PLANO = 0.62;              // plano de oscilação (à frente da bancada)
const BARRA_Y = 1.74;              // altura da barra horizontal
const PIVO = new THREE.Vector3(0, BARRA_Y - 0.0065, Z_PLANO);
const RHO_LATAO = 8500;            // kg/m³
const ANG_MAX = 80;                // graus

const MASSAS = [0.05, 0.1, 0.2];   // kg

/* ───────────────────────── Estado ───────────────────────── */

const est = {
  fio: 0.85,            // m, comprimento do fio
  massa: 0.1,           // kg
  raio: raioEsfera(0.1, RHO_LATAO),
  th: 0, w: 0,          // rad, rad/s
  th0: 10 * Math.PI / 180,
  segurando: true,
  t: 0,                 // tempo simulado
  vel: 1,
  pausado: false,
  modelo: false,
  thMaxRecente: 0,
};
let par = parametros();

function parametros() {
  return parametrosPendulo({ L: est.fio + est.raio, massa: est.massa, raio: est.raio });
}

const cron = { rodando: false, inicio: 0, acumulado: 0 };
const foto = { bloqueado: false, eventos: [], ultimo: null, dPrev: Infinity };

/* ───────────────────────── Cena ───────────────────────── */

const elCena = document.getElementById('cena');
const cena = criarCena(elCena, {
  alvo: new THREE.Vector3(0, 1.05, 0.45),
  camera: new THREE.Vector3(1.75, 1.55, 2.55),
  vistas: {
    frente: { pos: new THREE.Vector3(0, 1.2, 2.95), alvo: new THREE.Vector3(0, 1.08, Z_PLANO) },
    lado: { pos: new THREE.Vector3(2.9, 1.25, Z_PLANO), alvo: new THREE.Vector3(0, 1.08, Z_PLANO) },
    cima: { pos: new THREE.Vector3(0, 3.9, 0.72), alvo: new THREE.Vector3(0, 0.8, 0.6) },
    transferidor: { pos: new THREE.Vector3(0.02, PIVO.y - 0.07, Z_PLANO + 0.42), alvo: new THREE.Vector3(0, PIVO.y - 0.07, Z_PLANO) },
    instrumentos: { pos: new THREE.Vector3(0.05, 1.42, 1.3), alvo: new THREE.Vector3(0, TOPO + 0.03, 0.15) },
  },
});
const { scene } = cena;

// Bancada e suporte
const mesa = P.bancada({ alt: TOPO });
scene.add(mesa);

const suporte = P.suporteUniversal({ altura: 1.02, base: [0.2, 0.32] });
suporte.position.set(0, TOPO, 0.2);
scene.add(suporte);
const hasteZ = suporte.position.z + suporte.userData.hasteZ;

const mufa = P.mufa();
mufa.position.set(0, BARRA_Y, hasteZ);
scene.add(mufa);

const barra = P.barra(Z_PLANO + 0.05 - hasteZ);
barra.position.set(0, BARRA_Y, hasteZ);
scene.add(barra);

// presilha do fio, presa sob a barra
const presilha = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.01, 0.016), MAT.aco(0x8d9399, 0.35));
presilha.position.set(0, BARRA_Y - 0.004, Z_PLANO);
presilha.castShadow = true;
scene.add(presilha);

// Transferidor e trena
const transf = P.transferidor(0.12);
transf.position.set(0, PIVO.y, Z_PLANO - 0.022);
scene.add(transf);

const fita = P.trena(1.6);
fita.position.set(-0.04, PIVO.y, Z_PLANO - 0.045);
scene.add(fita);
const ganchoTrena = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.006, 0.03), MAT.plastico(0x1d1f22));
ganchoTrena.position.set(-0.026, BARRA_Y - 0.008, Z_PLANO - 0.035);
scene.add(ganchoTrena);

// Pêndulo: grupo no ponto de suspensão, girado em torno de Z
const pendulo = new THREE.Group();
pendulo.position.copy(PIVO);
scene.add(pendulo);
const fioMalha = P.fio(0.0011);
pendulo.add(fioMalha);
let esfera = null;
function montarEsfera() {
  if (esfera) pendulo.remove(esfera);
  esfera = P.esferaComGancho(est.raio);
  pendulo.add(esfera);
  posicionarEsfera();
}
function posicionarEsfera() {
  const L = est.fio + est.raio;
  esfera.position.set(0, -L, 0);
  fioMalha.scale.y = est.fio - est.raio * 0.15; // o fio termina no olhal
}

// Fotoporta no pedestal, com o feixe na altura do centro da esfera em repouso
const porta = P.fotoporta();
const ped = P.pedestal(1);
scene.add(porta, ped);
ped.position.set(0, 0, Z_PLANO);
porta.position.set(0, 0, Z_PLANO);

// Instrumentos de mesa
const contador = P.caixaInstrumento({
  larg: 0.2, alt: 0.075, prof: 0.15, cor: 0xd9dcd6, nome: 'FOTOPORTA',
  botoes: [{ id: 'foto-zerar', rotulo: 'ZERA', cor: 0xb3261e }],
});
contador.position.set(-0.42, TOPO, 0.16);
contador.rotation.y = 0.18;
scene.add(contador);

const relogio = P.caixaInstrumento({
  larg: 0.15, alt: 0.06, prof: 0.11, cor: 0xe6c547, nome: 'CRONÔMETRO', visorLarg: 0.09, visorAlt: 0.028,
  corVisor: '#c9d9b0',
  botoes: [{ id: 'cron-liga', rotulo: 'LIGA/PARA', cor: 0x1e8e3e }, { id: 'cron-zera', rotulo: 'ZERA', cor: 0xb3261e }],
});
relogio.position.set(0.42, TOPO, 0.2);
relogio.rotation.y = -0.2;
scene.add(relogio);

const caboFoto = P.cabo(0x1b1d20, 0.0022);
scene.add(caboFoto);

function posicionarFotoporta() {
  const yFeixe = PIVO.y - (est.fio + est.raio);
  porta.position.y = yFeixe;
  ped.userData.definirAltura(yFeixe - 0.06 - 0.009);
  // cabo: sai da base da fotoporta, sobe pela frente da bancada e chega ao contador
  contador.updateMatrixWorld();
  const chegada = new THREE.Vector3(0, 0.03, -0.075).applyMatrix4(contador.matrixWorld);
  const saida = new THREE.Vector3(0, yFeixe - 0.06, Z_PLANO - 0.07);
  const meio = Math.max(0.05, Math.min(yFeixe - 0.2, TOPO - 0.25));
  caboFoto.userData.passarPor([
    saida,
    new THREE.Vector3(-0.08, Math.max(0.03, meio), Z_PLANO - 0.12),
    new THREE.Vector3(-0.2, TOPO - 0.12, 0.43),
    new THREE.Vector3(-0.22, TOPO + 0.012, 0.34),
    new THREE.Vector3(-0.27, TOPO + 0.012, 0.03),
    chegada,
  ]);
}

// Rótulos do modelo (desligados por padrão)
const rotAngulo = rotulo('', 'modelo');
const rotL = rotulo('', 'modelo');
scene.add(rotAngulo, rotL);
const arcoMat = new THREE.LineDashedMaterial({ color: 0xd9480f, dashSize: 0.012, gapSize: 0.008 });
const arco = new THREE.Line(new THREE.BufferGeometry(), arcoMat);
scene.add(arco);

function atualizarArco() {
  const L = est.fio + est.raio;
  const amp = Math.max(est.thMaxRecente, Math.abs(est.th));
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const a = -amp + (2 * amp * i) / 48;
    pts.push(new THREE.Vector3(PIVO.x + L * Math.sin(a), PIVO.y - L * Math.cos(a), Z_PLANO));
  }
  arco.geometry.dispose();
  arco.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  arco.computeLineDistances();
}

/* ───────────────────────── Física ───────────────────────── */

const passo = new PassoFixo(1 / 2000);
let deriv = derivPendulo(par);

function passoFisica(h) {
  const tAntes = est.t;
  if (!est.segurando) {
    const [th, w] = rk4(deriv, est.t, [est.th, est.w], h);
    est.th = th; est.w = w;
  }
  est.t += h;
  // fotoporta: o feixe é interrompido quando a esfera cobre a linha do feixe
  const L = par.L;
  const x = L * Math.sin(est.th);
  const y = L * (1 - Math.cos(est.th));
  const d = Math.hypot(x, y);
  const bloq = d < est.raio;
  if (bloq && !foto.bloqueado) {
    const f = Number.isFinite(foto.dPrev) && foto.dPrev !== d ? (foto.dPrev - est.raio) / (foto.dPrev - d) : 1;
    registrarBloqueio(tAntes + Math.max(0, Math.min(1, f)) * h);
  }
  foto.bloqueado = bloq;
  foto.dPrev = d;
}

// Modo pêndulo do contador: mede do 1º ao 3º bloqueio, que é um período completo.
function registrarBloqueio(t) {
  if (est.segurando) return;
  foto.eventos.push(t);
  if (foto.eventos.length >= 3) {
    const T = foto.eventos[2] - foto.eventos[0];
    foto.ultimo = naResolucao(T + gauss(0, 0.00004), 0.0001);
    foto.eventos = foto.eventos.slice(2);
  }
}

function zerarFotoporta() {
  foto.eventos = [];
  foto.ultimo = null;
}

function tempoCron() {
  return cron.acumulado + (cron.rodando ? est.t - cron.inicio : 0);
}
function alternarCron() {
  if (cron.rodando) { cron.acumulado += est.t - cron.inicio; cron.rodando = false; }
  else { cron.inicio = est.t; cron.rodando = true; }
  atualizarBotoesCron();
}
function zerarCron() {
  cron.rodando = false; cron.acumulado = 0;
  atualizarBotoesCron();
}

/* ───────────────────────── Interação na cena ───────────────────────── */

const avisar = aviso(elCena);
const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z_PLANO);
const ponto = new THREE.Vector3();

function anguloDoRaio(ray) {
  if (!ray.ray.intersectPlane(plano, ponto)) return null;
  let a = Math.atan2(ponto.x - PIVO.x, PIVO.y - ponto.y);
  const lim = (ANG_MAX * Math.PI) / 180;
  return Math.max(-lim, Math.min(lim, a));
}

criarArraste(cena, {
  alvos: () => [esfera, ...Object.values(relogio.userData.botoes), ...Object.values(contador.userData.botoes), relogio],
  aoIniciar(hit) {
    if (ehEsfera(hit.object)) segurar();
  },
  aoMover(hit, ray) {
    if (!ehEsfera(hit.object)) return;
    const a = anguloDoRaio(ray);
    if (a !== null) { est.th = a; est.th0 = a; ctlAngulo.definir(Math.round(Math.abs(a) * 180 / Math.PI)); }
  },
  aoSoltar(hit) {
    if (ehEsfera(hit.object)) soltar();
  },
  aoClicar(hit) {
    const nome = acharNome(hit.object);
    if (nome === 'cron-liga' || nome === 'relogio') alternarCron();
    else if (nome === 'cron-zera') zerarCron();
    else if (nome === 'foto-zerar') { zerarFotoporta(); avisar('Contador da fotoporta zerado.'); }
    else if (ehEsfera(hit.object)) avisar('Arraste a esfera para o lado e solte.');
  },
});
relogio.name = 'relogio';

function ehEsfera(o) {
  for (let p = o; p; p = p.parent) if (p === esfera) return true;
  return false;
}
function acharNome(o) {
  for (let p = o; p; p = p.parent) if (p.name) return p.name;
  return '';
}

function segurar() {
  est.segurando = true;
  est.w = 0;
  est.thMaxRecente = 0;
  zerarFotoporta();
  atualizarEstadoUI();
}
function soltar() {
  if (Math.abs(est.th) < 0.002) { avisar('Afaste a esfera da vertical antes de soltar.'); return; }
  est.segurando = false;
  est.w = 0;
  est.th0 = est.th;
  est.thMaxRecente = Math.abs(est.th);
  zerarFotoporta();
  foto.dPrev = Infinity;
  atualizarEstadoUI();
}

/* ───────────────────────── Painel ───────────────────────── */

abas(document.getElementById('painel'));

const fmtM = (v) => fmt(v, 3) + ' m';

const ctlFio = deslizante({
  rotulo: 'Comprimento do fio', min: 0.2, max: 1.4, passo: 0.005, valor: est.fio, formatar: fmtM,
  aoMudar(v) { est.fio = v; mudouMontagem(); },
});
const ctlMassa = escolha({
  rotulo: 'Massa da esfera (latão)',
  opcoes: MASSAS.map((m) => ({ valor: m, rotulo: `${Math.round(m * 1000)} g` })),
  valor: est.massa,
  aoMudar(m) { est.massa = m; est.raio = raioEsfera(m, RHO_LATAO); montarEsfera(); mudouMontagem(); },
});
const ctlAngulo = deslizante({
  rotulo: 'Ângulo ao soltar', min: 0, max: ANG_MAX, passo: 1, valor: 10, formatar: (v) => `${v}°`,
  aoMudar(v) {
    if (!est.segurando) segurar();
    const sinal = est.th < 0 ? -1 : 1;
    est.th = sinal * v * Math.PI / 180;
    est.th0 = est.th;
  },
});
document.getElementById('ctl-montagem').append(ctlFio.el, ctlMassa.el, ctlAngulo.el);

const velocidades = [1, 0.5, 0.25];
const ctlModelo = chave({
  rotulo: 'Mostrar o modelo (ângulo, L e curva teórica)', valor: false,
  aoMudar(v) { est.modelo = v; document.getElementById('lei-modelo').hidden = !v; desenharGrafico(); },
});
const ctlQualidade = chave({
  rotulo: 'Gráficos em alta qualidade (sombras)', valor: cena.qualidade === 'alta',
  aoMudar(v) { cena.definirQualidade(v ? 'alta' : 'baixa'); },
});
document.getElementById('ctl-simulacao').append(ctlModelo.el, ctlQualidade.el);

function mudouMontagem() {
  par = parametros();
  deriv = derivPendulo(par);
  posicionarEsfera();
  posicionarFotoporta();
  zerarFotoporta();
  atualizarLeituras();
}

function leituraL() {
  const fio = naResolucao(est.fio, 0.001);
  const diam = naResolucao(2 * est.raio * 1000, 0.05); // mm
  return { fio, diam, L: fio + diam / 2000 };
}

function atualizarLeituras() {
  const { fio, diam, L } = leituraL();
  document.getElementById('lei-fio').textContent = fmt(fio, 3) + ' m';
  document.getElementById('lei-diametro').textContent = fmt(diam, 2) + ' mm';
  document.getElementById('lei-L').textContent = fmt(L, 4) + ' m';
  document.getElementById('lei-T0').textContent = fmt(periodoPequeno(par), 4) + ' s';
}

const btSoltar = document.getElementById('bt-soltar');
btSoltar.addEventListener('click', () => (est.segurando ? soltar() : segurar()));

function atualizarEstadoUI() {
  btSoltar.textContent = est.segurando ? 'Soltar' : 'Segurar';
  ctlFio.desabilitar(!est.segurando);
  ctlMassa.desabilitar(!est.segurando);
}

// Tempo da simulação
const btPausa = document.getElementById('bt-pausa');
btPausa.addEventListener('click', () => {
  est.pausado = !est.pausado;
  btPausa.setAttribute('aria-pressed', String(est.pausado));
  btPausa.textContent = est.pausado ? '▶ Continuar' : '⏸ Pausar';
});
const btVel = document.getElementById('bt-velocidade');
btVel.addEventListener('click', () => {
  est.vel = velocidades[(velocidades.indexOf(est.vel) + 1) % velocidades.length];
  btVel.textContent = est.vel === 1 ? '1×' : est.vel === 0.5 ? '½×' : '¼×';
  if (est.vel !== 1) avisar('Câmera lenta: o cronômetro e a fotoporta seguem o tempo da simulação.');
});

document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => cena.irPara(b.dataset.vista)));

// Cronômetro
const btCron = document.getElementById('bt-cron');
const btCron2 = document.getElementById('bt-cron2');
btCron.addEventListener('click', alternarCron);
btCron2.addEventListener('click', alternarCron);
document.getElementById('bt-cron-zerar').addEventListener('click', zerarCron);
function atualizarBotoesCron() {
  btCron.textContent = cron.rodando ? '⏱ Parar cronômetro' : '⏱ Iniciar cronômetro';
  btCron.setAttribute('aria-pressed', String(cron.rodando));
  btCron2.textContent = cron.rodando ? 'Parar' : 'Iniciar';
}
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat) return;
  const alvo = e.target;
  if (alvo.closest && alvo.closest('input, textarea, select, button, [contenteditable]')) return;
  e.preventDefault();
  alternarCron();
});

// Tabela e gráfico
const colunas = [
  { id: 'origem', titulo: 'Instr.', tituloCsv: 'instrumento', texto: true },
  { id: 'L', titulo: 'L (m)', tituloCsv: 'L (m)', casas: 4, editavel: true },
  { id: 'n', titulo: 'n', tituloCsv: 'n', casas: 0, editavel: true },
  { id: 't', titulo: 't (s)', tituloCsv: 't (s)', casas: (l) => l.casasT ?? 2, editavel: true },
  { id: 'T', titulo: 'T (s)', tituloCsv: 'T (s)', casas: 4, calc: (l) => l.t / l.n },
  { id: 'T2', titulo: 'T² (s²)', tituloCsv: 'T2 (s2)', casas: 4, calc: (l) => (l.t / l.n) ** 2 },
];
const tabela = tabelaMedidas({ colunas, chaveSalvar: 'exp-pendulo-medidas', aoMudar: () => desenharGrafico() });
document.getElementById('tabela').append(tabela.el);

const graf = grafico({ eixoX: 'L (m)', eixoY: 'T² (s²)' });
document.getElementById('grafico').append(graf.el);

function desenharGrafico() {
  const pts = tabela.dados().map((d) => [d.L, d.T2]);
  const aj = graf.desenhar({
    pontos: pts,
    ajuste: true,
    teorica: est.modelo ? (x) => (4 * Math.PI * Math.PI * x) / CONST.g : null,
  });
  const el = document.getElementById('ajuste');
  const distintos = new Set(pts.map((p) => p[0].toFixed(3))).size;
  if (!aj || distintos < 2) {
    el.textContent = 'Registre ao menos dois comprimentos diferentes para ver a reta.';
    return;
  }
  const g = (4 * Math.PI * Math.PI) / aj.a;
  const sg = Number.isFinite(aj.sa) ? (g * aj.sa) / aj.a : NaN;
  el.innerHTML =
    `Reta ajustada: T² = <b>${fmt(aj.a, 3)}</b> · L ${aj.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(aj.b), 3)}</b>` +
    `<br>g = 4π² / a = <b>${fmt(g, 2)} m/s²</b>` +
    (Number.isFinite(sg) ? ` (± ${fmt(sg, sg < 0.01 ? 3 : 2)} m/s²)` : '') +
    ` · R² = ${fmt(aj.r2, 4)}`;
}
desenharGrafico();
document.getElementById('painel').addEventListener('aba', (e) => { if (e.detail === 'medidas') requestAnimationFrame(() => desenharGrafico()); });

document.getElementById('bt-reg-cron').addEventListener('click', () => {
  const t = Math.floor(tempoCron() * 100) / 100;
  const n = Math.max(1, parseInt(document.getElementById('n-osc').value, 10) || 1);
  if (t <= 0) { avisar('O cronômetro está zerado.'); return; }
  if (cron.rodando) { avisar('Pare o cronômetro antes de registrar.'); return; }
  tabela.adicionar({ origem: 'cron.', L: leituraL().L, n, t, casasT: 2 });
  avisar(`Registrado: ${n} oscilações em ${fmt(t, 2)} s.`);
});
document.getElementById('bt-reg-foto').addEventListener('click', () => {
  if (foto.ultimo == null) { avisar('A fotoporta ainda não mediu um período completo.'); return; }
  tabela.adicionar({ origem: 'fotop.', L: leituraL().L, n: 1, t: foto.ultimo, casasT: 4 });
  avisar(`Registrado: T = ${fmt(foto.ultimo, 4)} s.`);
});
document.getElementById('bt-foto-zerar').addEventListener('click', zerarFotoporta);
document.getElementById('bt-csv').addEventListener('click', () => baixar('pendulo-simples.csv', tabela.csv()));
document.getElementById('bt-limpar').addEventListener('click', () => {
  if (confirm('Apagar todas as medidas da tabela?')) tabela.limpar();
});

/* ───────────────────────── Laço ───────────────────────── */

const elCron = document.getElementById('lei-cron');
const elFoto = document.getElementById('lei-foto');
const elAng = document.getElementById('lei-angulo');
const elTamp = document.getElementById('lei-Tamp');
let quadroN = 0;

cena.aoQuadro((dt) => {
  const ritmo = est.pausado ? 0 : est.vel;
  passo.avancar(dt * ritmo, passoFisica);
  if (!est.segurando) est.thMaxRecente = amplitudePendulo(par, est.th, est.w);

  pendulo.rotation.z = est.th;

  // instrumentos
  const tc = tempoCron();
  relogio.userData.visor.escrever(fmtCronometro(tc), cron.rodando ? '▶' : '');
  elCron.textContent = fmtCronometro(tc);
  const textoFoto = foto.ultimo == null ? '----' : fmt(foto.ultimo, 4);
  contador.userData.visor.escrever(textoFoto, 'PÊNDULO   T (s)');
  elFoto.textContent = foto.ultimo == null ? '—' : fmt(foto.ultimo, 4) + ' s';
  porta.userData.acender(foto.bloqueado);

  // leituras e modelo, a cada poucos quadros
  if (quadroN++ % 6 === 0) {
    const graus = Math.abs(est.segurando ? est.th : est.th0) * 180 / Math.PI;
    elAng.textContent = fmt(Math.round(graus), 0) + '°';
    if (est.modelo) elTamp.textContent = fmt(periodoExato(par, Math.max(est.thMaxRecente, Math.abs(est.th))), 4) + ' s';
  }
  arco.visible = rotAngulo.visible = rotL.visible = est.modelo;
  porta.userData.feixe.visible = est.modelo;
  if (est.modelo) {
    const L = par.L;
    rotAngulo.position.set(PIVO.x + (L + 0.05) * Math.sin(est.th), PIVO.y - (L + 0.05) * Math.cos(est.th), Z_PLANO);
    rotAngulo.userData.html(`θ = ${fmt(est.th * 180 / Math.PI, 1)}°`);
    rotL.position.set(PIVO.x + 0.5 * L * Math.sin(est.th) + 0.06, PIVO.y - 0.5 * L * Math.cos(est.th), Z_PLANO);
    rotL.userData.html(`L = ${fmt(L, 3)} m`);
    if (quadroN % 10 === 0) atualizarArco();
  }
});

/* ───────────────────────── Início ───────────────────────── */

montarEsfera();
est.th = est.th0;
mudouMontagem();
atualizarEstadoUI();
atualizarBotoesCron();
