// Queda livre e máquina de Atwood: coluna graduada, quatro fotoportas, eletroímã de
// largada, cronômetro de quatro canais e, no modo Atwood, roldana com duas massas.

import * as THREE from 'three';
import { criarCena, criarArraste } from '../motor/cena.js';
import { MAT } from '../motor/materiais.js';
import * as P from '../motor/pecas.js';
import { CONST, rk4, PassoFixo, derivQueda, arrastoEsfera, aceleracaoAtwood } from '../motor/fisica.js';
import { fmt, naResolucao } from '../motor/medida.js';
import { Contador } from '../motor/sensores.js';
import { abas, deslizante, escolha, chave, tabelaMedidas, grafico, baixar, aviso, barraDaCena } from '../motor/painel.js';
import { rotulo } from '../motor/rotulos.js';

/* ───────────────────────── Geometria ───────────────────────── */

const TOPO = 0.79;
const Z_F = 0.2;                  // plano vertical da queda
const Y0 = TOPO + 0.95;           // borda de baixo do corpo na largada = zero da escala
const X_COL = 0.1;                // coluna graduada, à direita da trajetória
const ESPUMA = 0.05;              // altura da caixa de espuma
const D_MAX = Y0 - (TOPO + ESPUMA);
const R_ESF = 0.008;              // esfera de aço de 16 mm
const M_ESF = 7850 * (4 / 3) * Math.PI * R_ESF ** 3;
const R_POLIA = 0.05;
const Y_POLIA = Y0 + 0.17;
const M_PORTA = 0.02, M_DISCO = 0.05, ESP_DISCO = 0.0054;
const M_POLIA_EQ = 0.015;         // I/R² de uma roldana de alumínio de 30 g
const ATRITO_EIXO = 0.002;        // N, levado à borda da roldana

/* ───────────────────────── Estado ───────────────────────── */

const est = {
  modo: 'queda',
  d: 0, v: 0,
  preso: true,
  t: 0, vel: 1, pausado: false, modelo: false,
  sensores: [0.15, 0.35, 0.55, 0.75],
  discos: 3,                      // por lado, na Atwood
  sobre: 0.01,                    // sobrecarga em m2 (kg)
};

const m1 = () => M_PORTA + est.discos * M_DISCO;
const m2 = () => m1() + est.sobre;
const alturaMassa = () => 0.101; // do fundo do prato à ponta do gancho

let deriv;
function atualizarDinamica() {
  if (est.modo === 'queda') {
    deriv = derivQueda({ massa: M_ESF, k: arrastoEsfera(R_ESF) });
  } else {
    const M = m1() + m2() + M_POLIA_EQ;
    const motor = (m2() - m1()) * CONST.g;
    deriv = (t, [d, v]) => (motor <= ATRITO_EIXO && v <= 0 ? [0, 0] : [v, (motor - ATRITO_EIXO) / M]);
  }
}
const contador = new Contador(est.sensores);

/* ───────────────────────── Cena ───────────────────────── */

const elCena = document.getElementById('cena');
const cena = criarCena(elCena, {
  alvo: new THREE.Vector3(0, 1.32, Z_F),
  camera: new THREE.Vector3(1.05, 1.62, 2.3),
  vistas: {
    frente: { pos: new THREE.Vector3(0, 1.35, 1.85), alvo: new THREE.Vector3(0, 1.32, Z_F) },
    largada: { pos: new THREE.Vector3(0.12, Y0 + 0.08, Z_F + 0.42), alvo: new THREE.Vector3(0, Y0 + 0.03, Z_F) },
    escala: { pos: new THREE.Vector3(0.2, 1.3, Z_F + 0.55), alvo: new THREE.Vector3(X_COL, 1.3, Z_F) },
    cronometro: { pos: new THREE.Vector3(0.45, 1.1, 0.32), alvo: new THREE.Vector3(0.45, TOPO + 0.04, -0.12) },
  },
  limitesAlvo: { min: new THREE.Vector3(-2, 0.1, -1.5), max: new THREE.Vector3(2, 2.3, 2) },
});
const { scene } = cena;
scene.add(P.bancada({ alt: TOPO }));

// Coluna graduada com base pesada
const col = new THREE.Group();
const alturaCol = Y_POLIA + 0.06 - TOPO;
col.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, alturaCol, 0.03), MAT.acoEscovado(0xc9cdd1)));
col.children[0].position.y = alturaCol / 2;
const baseCol = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.2), MAT.ferroPintado(0x2b3036));
baseCol.position.set(-0.02, 0.0125, -0.02);
col.add(baseCol);
col.position.set(X_COL, TOPO, Z_F);
col.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(col);
const esc = P.escala({ comprimento: 0.95, largura: 0.026, fundo: '#eef0f1' });
esc.position.set(X_COL - 0.013, Y0, Z_F + 0.0155);
scene.add(esc);

// Braço do topo, da coluna até a trajetória
const braco = new THREE.Mesh(new THREE.BoxGeometry(X_COL + R_POLIA * 2 + 0.03, 0.016, 0.016), MAT.aco(0x8d9399, 0.35));
braco.position.set((X_COL - R_POLIA * 2) / 2 - 0.005, Y_POLIA + 0.045, Z_F);
braco.castShadow = true;
scene.add(braco);

// Eletroímã: segura a esfera por cima (queda) ou a massa m2 por trás (Atwood)
const ima = P.eletroima();
scene.add(ima);
const hasteIma = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 10), MAT.aco());
scene.add(hasteIma);

// Caixa de espuma
const caixa = new THREE.Group();
caixa.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, ESPUMA, 0.16), MAT.plastico(0x2c3a4a, 0.6)));
caixa.children[0].position.y = ESPUMA / 2;
const espuma = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.004, 0.15), MAT.borracha(0x4a4f57));
espuma.position.y = ESPUMA - 0.001;
caixa.add(espuma);
caixa.position.set(0, TOPO, Z_F);
caixa.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(caixa);

// Esfera
const esfera = new THREE.Mesh(new THREE.SphereGeometry(R_ESF, 32, 20), MAT.aco(0xd0d4d8, 0.18));
esfera.castShadow = true;
scene.add(esfera);

// Atwood: roldana, massas e fio
const atwood = new THREE.Group();
scene.add(atwood);
const polia = P.roldana(R_POLIA);
polia.position.set(-R_POLIA, Y_POLIA, Z_F);
atwood.add(polia);
const ladoM1 = P.portaPesos(), ladoM2 = P.portaPesos();
atwood.add(ladoM1, ladoM2);
const discosM1 = [], discosM2 = [];
for (let i = 0; i < 5; i++) {
  const a = P.discoMassa(), b = P.discoMassa();
  a.rotation.y = i * 1.3; b.rotation.y = i * 1.3 + 0.5;
  ladoM1.add(a); ladoM2.add(b);
  discosM1.push(a); discosM2.push(b);
}
const sobrecarga = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 24), MAT.aco(0x6f7a84, 0.3));
sobrecarga.castShadow = true;
ladoM2.add(sobrecarga);
const fioM1 = P.fio(0.0006), fioM2 = P.fio(0.0006);
atwood.add(fioM1, fioM2);
const rr = R_POLIA - 0.003;
const arcoFio = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0006, 4, 32, Math.PI), MAT.fio());
arcoFio.position.copy(polia.position);
atwood.add(arcoFio);

function montarMassas() {
  [[discosM1, ladoM1], [discosM2, ladoM2]].forEach(([ds, lado]) => {
    ds.forEach((d, i) => {
      d.visible = i < est.discos;
      d.position.set(0, -lado.userData.prato + i * ESP_DISCO, 0);
    });
  });
  // a sobrecarga é um disco fino de aço, mais estreito, sobre a pilha de m2
  const esp = est.sobre / (7850 * Math.PI * 0.016 ** 2);
  sobrecarga.scale.y = esp;
  sobrecarga.position.y = -ladoM2.userData.prato + est.discos * ESP_DISCO + esp / 2;
  sobrecarga.visible = est.sobre > 0;
}

// Fotoportas presas à coluna: giradas para que o corpo passe na vertical
const portas = est.sensores.map(() => {
  const f = P.fotoporta();
  f.rotation.z = Math.PI / 2;       // base para +X, junto à coluna
  const garra = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, 0.04), MAT.plastico(0x1d1f22));
  garra.position.set(0, -0.079, 0);
  f.add(garra);
  f.position.set(0, 0, Z_F);
  scene.add(f);
  return f;
});

// Cronômetro
const crono = P.caixaInstrumento({
  larg: 0.22, alt: 0.08, prof: 0.15, cor: 0xd9dcd6, nome: 'CRONÔMETRO', visorLarg: 0.12, visorAlt: 0.036,
  botoes: [{ id: 'canal', rotulo: 'CANAL', cor: 0x30343a }, { id: 'zera', rotulo: 'ZERA', cor: 0xb3261e }],
});
crono.position.set(0.45, TOPO, -0.12);
crono.rotation.y = -0.3;
scene.add(crono);
const cabos = portas.map(() => { const c = P.cabo(0x1b1d20, 0.0018); scene.add(c); return c; });
const caboIma = P.cabo(0x8b1a12, 0.0018);
scene.add(caboIma);

function ligarCabos() {
  crono.updateMatrixWorld(true);
  portas.forEach((f, i) => {
    const a = new THREE.Vector3(X_COL + 0.016, f.position.y, Z_F - 0.01);
    const b = crono.localToWorld(new THREE.Vector3(-0.07 + i * 0.03, 0.04, -0.075));
    cabos[i].userData.passarPor([a, new THREE.Vector3(X_COL + 0.03, f.position.y - 0.03, Z_F - 0.03),
      new THREE.Vector3(X_COL + 0.04, TOPO + 0.03, Z_F - 0.12 - i * 0.01), b]);
  });
  ima.updateMatrixWorld(true);
  const a = ima.localToWorld(new THREE.Vector3(0, 0.054, 0));
  const b = crono.localToWorld(new THREE.Vector3(0.09, 0.04, -0.075));
  caboIma.userData.passarPor([a, new THREE.Vector3(X_COL - 0.02, Y_POLIA + 0.06, Z_F - 0.02),
    new THREE.Vector3(X_COL + 0.02, Y_POLIA, Z_F - 0.03), new THREE.Vector3(X_COL + 0.03, TOPO + 0.4, Z_F - 0.04),
    new THREE.Vector3(X_COL + 0.05, TOPO + 0.02, Z_F - 0.15), b]);
}

function montar() {
  const queda = est.modo === 'queda';
  esfera.visible = queda;
  atwood.visible = !queda;
  if (queda) {
    // eletroímã acima da esfera, pendurado no braço
    ima.rotation.set(0, 0, 0);
    ima.position.set(0, Y0 + 2 * R_ESF, Z_F);
    hasteIma.position.set(0, (Y0 + 2 * R_ESF + Y_POLIA + 0.045) / 2 + 0.02, Z_F);
    hasteIma.scale.y = Y_POLIA + 0.045 - (Y0 + 2 * R_ESF) - 0.04;
  } else {
    // eletroímã atrás da pilha de m2, com a face para a frente
    ima.rotation.set(-Math.PI / 2, 0, 0);
    const yIma = Y0 + 0.012;
    ima.position.set(0, yIma, Z_F - 0.024);
    hasteIma.position.set(0, (yIma + Y_POLIA + 0.045) / 2, Z_F - 0.041);
    hasteIma.scale.y = Y_POLIA + 0.045 - yIma;
    montarMassas();
  }
  portas.forEach((f, i) => { f.position.y = Y0 - est.sensores[i]; });
  posicionar();
  ligarCabos();
}

function posicionar() {
  if (est.modo === 'queda') {
    esfera.position.set(0, Y0 - est.d + R_ESF, Z_F);
    return;
  }
  // m2 desce d; m1 sobe d
  const topoM2 = Y0 - est.d + alturaMassa();
  const baseM1 = TOPO + 0.08 + est.d;
  const topoM1 = baseM1 + alturaMassa();
  ladoM2.position.set(0, topoM2, Z_F);
  ladoM1.position.set(-2 * R_POLIA, topoM1, Z_F);
  fioM2.position.set(-R_POLIA + rr, Y_POLIA, Z_F);
  fioM2.scale.y = Math.max(0.001, Y_POLIA - topoM2);
  fioM1.position.set(-R_POLIA - rr, Y_POLIA, Z_F);
  fioM1.scale.y = Math.max(0.001, Y_POLIA - topoM1);
  polia.userData.roda.rotation.z = -est.d / R_POLIA;
}

/* ───────────────────────── Física ───────────────────────── */

const passo = new PassoFixo(1 / 4000);
function bordas() {
  return est.modo === 'queda' ? [est.d, est.d - 2 * R_ESF] : [est.d, est.d - alturaMassa()];
}
function passoFisica(h) {
  const t0 = est.t;
  const antes = bordas();
  if (!est.preso && est.d < D_MAX) {
    const [d, v] = rk4(deriv, est.t, [est.d, est.v], h);
    est.d = d; est.v = v;
    if (est.d >= D_MAX) { est.d = D_MAX; est.v = 0; }
  }
  est.t += h;
  contador.passo(t0, h, antes, bordas());
}

/* ───────────────────────── Interação ───────────────────────── */

const avisar = aviso(elCena);
barraDaCena(cena, est, avisar);

function soltar() {
  if (!est.preso) return;
  est.preso = false;
  est.v = 0;
  contador.largar(est.t);
  if (est.modo === 'atwood' && est.sobre * CONST.g <= ATRITO_EIXO) avisar('O atrito da roldana segura as massas.');
  atualizarUI();
}
function voltar() {
  est.preso = true;
  est.d = 0; est.v = 0;
  contador.portoes.forEach((p, i) => p.mover(est.sensores[i], bordas()));
  posicionar();
  atualizarUI();
}
const btSoltar = document.getElementById('bt-soltar');
btSoltar.addEventListener('click', () => (est.preso ? soltar() : voltar()));

function ehDe(o, alvo) { for (let p = o; p; p = p.parent) if (p === alvo) return true; return false; }
function nome(o) { for (let p = o; p; p = p.parent) if (p.name) return p.name; return ''; }
const plano = new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z_F);
const ponto = new THREE.Vector3();
let arrastando = -1;
criarArraste(cena, {
  alvos: () => [...portas, esfera, ladoM2, ima, ...Object.values(crono.userData.botoes)],
  aoIniciar(hit) { arrastando = portas.findIndex((f) => ehDe(hit.object, f)); },
  aoMover(hit, ray) {
    if (arrastando < 0 || !ray.ray.intersectPlane(plano, ponto)) return;
    definirSensor(arrastando, Y0 - ponto.y);
  },
  aoSoltar() { arrastando = -1; },
  aoClicar(hit) {
    const n = nome(hit.object);
    if (n === 'canal') contador.proximoCanal();
    else if (n === 'zera') { contador.zerar(); avisar('Cronômetro zerado.'); }
    else if (arrastando >= 0) avisar('Arraste a fotoporta ao longo da coluna.');
    else est.preso ? soltar() : voltar();
    arrastando = -1;
  },
});

/* ───────────────────────── Painel ───────────────────────── */

abas(document.getElementById('painel'));

const ctlModo = escolha({
  rotulo: 'Experimento',
  opcoes: [{ valor: 'queda', rotulo: 'Queda livre' }, { valor: 'atwood', rotulo: 'Máquina de Atwood' }],
  valor: est.modo,
  aoMudar(v) {
    est.modo = v;
    document.getElementById('sec-atwood').hidden = v !== 'atwood';
    mudouMontagem();
  },
});
document.getElementById('ctl-modo').append(ctlModo.el);

const ctlDiscos = escolha({
  rotulo: 'Massa de cada lado (porta-pesos e discos)',
  opcoes: [1, 3, 5].map((n) => ({ valor: n, rotulo: `${fmt((M_PORTA + n * M_DISCO) * 1000, 0)} g` })),
  valor: est.discos,
  aoMudar(n) { est.discos = n; mudouMontagem(); },
});
const ctlSobre = escolha({
  rotulo: 'Sobrecarga em m<sub>2</sub>',
  opcoes: [0.005, 0.01, 0.02, 0.03, 0.05].map((m) => ({ valor: m, rotulo: `${fmt(m * 1000, 0)} g` })),
  valor: est.sobre,
  aoMudar(m) { est.sobre = m; mudouMontagem(); },
});
document.getElementById('ctl-atwood').append(ctlDiscos.el, ctlSobre.el);

const ctlSensores = est.sensores.map((s, i) => deslizante({
  rotulo: `Fotoporta ${i + 1}`, min: 0.05, max: 0.85, passo: 0.005, valor: s, formatar: (v) => fmt(v, 3) + ' m',
  aoMudar(v) { definirSensor(i, v, true); },
}));
document.getElementById('ctl-sensores').append(...ctlSensores.map((c) => c.el));

function definirSensor(i, d, doControle = false) {
  d = Math.max(0.05, Math.min(0.85, d));
  est.sensores[i] = d;
  contador.mover(i, d, bordas());
  portas[i].position.y = Y0 - d;
  if (!doControle) ctlSensores[i].definir(Math.round(d / 0.005) * 0.005);
  ligarCabos();
  atualizarLeituras();
}

const ctlModelo = chave({
  rotulo: 'Mostrar o modelo (vetor aceleração e curvas teóricas)', valor: false,
  aoMudar(v) { est.modelo = v; document.getElementById('lei-modelo').hidden = !v; desenharGraficos(); },
});
const ctlQualidade = chave({
  rotulo: 'Gráficos em alta qualidade (sombras)', valor: cena.qualidade === 'alta',
  aoMudar(v) { cena.definirQualidade(v ? 'alta' : 'baixa'); },
});
document.getElementById('ctl-simulacao').append(ctlModelo.el, ctlQualidade.el);

function aModelo() {
  return est.modo === 'queda' ? CONST.g : aceleracaoAtwood({ m1: m1(), m2: m2(), mPolia: M_POLIA_EQ, atrito: ATRITO_EIXO });
}

function mudouMontagem() {
  atualizarDinamica();
  voltar();
  montar();
  atualizarLeituras();
  desenharGraficos();
}

const leituraSensor = (i) => naResolucao(est.sensores[i], 0.001);

function atualizarLeituras() {
  est.sensores.forEach((s, i) => { document.getElementById('lei-d' + (i + 1)).textContent = fmt(leituraSensor(i), 3) + ' m'; });
  const q = est.modo === 'queda';
  document.getElementById('lei-corpo').innerHTML = q
    ? `esfera de aço, ${fmt(2 * R_ESF * 1000, 2)} mm`
    : `m<sub>1</sub> = ${fmt(m1() * 1000, 0)} g · m<sub>2</sub> = ${fmt(m2() * 1000, 0)} g`;
  document.getElementById('lei-amodelo').textContent = fmt(aModelo(), 3) + ' m/s²';
  document.getElementById('lei-aideal').textContent = q ? fmt(CONST.g, 3) + ' m/s²'
    : fmt(((m2() - m1()) / (m1() + m2())) * CONST.g, 3) + ' m/s²';
}

function atualizarUI() {
  const corpo = est.modo === 'queda' ? 'a esfera' : 'as massas';
  btSoltar.textContent = est.preso ? `Soltar ${corpo}` : 'Voltar à largada';
}

// Tabela
const colunas = [
  { id: 'modo', titulo: 'Exp.', tituloCsv: 'experimento', texto: true },
  { id: 'm1', titulo: 'm<sub>1</sub> (kg)', tituloCsv: 'm1 (kg)', casas: 3 },
  { id: 'm2', titulo: 'm<sub>2</sub> (kg)', tituloCsv: 'm2 (kg)', casas: 3 },
  { id: 'd', titulo: 'd (m)', tituloCsv: 'd (m)', casas: 3, editavel: true },
  { id: 't', titulo: 't (s)', tituloCsv: 't (s)', casas: 4, editavel: true },
  { id: 't2', titulo: 't² (s²)', tituloCsv: 't2 (s2)', casas: 4, calc: (l) => l.t * l.t },
  { id: 'a', titulo: 'a (m/s²)', tituloCsv: 'a = 2d/t2 (m/s2)', casas: 3, calc: (l) => (2 * l.d) / (l.t * l.t) },
];
const tabela = tabelaMedidas({ colunas, chaveSalvar: 'exp-queda-atwood-medidas', aoMudar: () => desenharGraficos() });
document.getElementById('tabela').append(tabela.el);

const grafQ = grafico({ eixoX: 't² (s²)', eixoY: 'd (m)' });
const grafA = grafico({ eixoX: '(m₂ − m₁) / (m₁ + m₂)', eixoY: 'a (m/s²)' });
document.getElementById('grafico').append(grafQ.el, grafA.el);

function desenharGraficos() {
  const q = est.modo === 'queda';
  grafQ.el.hidden = !q;
  grafA.el.hidden = q;
  const dados = tabela.dados();
  const el = document.getElementById('ajuste');
  const titulo = document.getElementById('titulo-grafico');
  if (q) {
    titulo.innerHTML = 'Queda livre: d em função de t²';
    const pts = dados.filter((d) => d.modo === 'queda').map((d) => [d.t2, d.d]);
    const aj = grafQ.desenhar({ pontos: pts, ajuste: true, teorica: est.modelo ? (x) => (CONST.g / 2) * x : null });
    if (!aj || pts.length < 2) { el.textContent = 'Registre ao menos dois pontos de queda livre para ver a reta.'; return; }
    el.innerHTML = `Reta ajustada: d = <b>${fmt(aj.a, 3)}</b> · t² ${aj.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(aj.b), 4)}</b>` +
      `<br>g = 2 · inclinação = <b>${fmt(2 * aj.a, 2)} m/s²</b> · R² = ${fmt(aj.r2, 4)}`;
  } else {
    titulo.innerHTML = 'Atwood: a em função de (m<sub>2</sub> − m<sub>1</sub>) / (m<sub>1</sub> + m<sub>2</sub>)';
    const pts = dados.filter((d) => d.modo === 'Atwood').map((d) => [(d.m2 - d.m1) / (d.m1 + d.m2), d.a]);
    const aj = grafA.desenhar({ pontos: pts, ajuste: true, teorica: est.modelo ? (x) => CONST.g * x : null });
    const razoes = new Set(pts.map((p) => p[0].toFixed(4))).size;
    if (!aj || razoes < 2) { el.textContent = 'Meça com pelo menos duas combinações de massas para ver a reta.'; return; }
    el.innerHTML = `Reta ajustada: a = <b>${fmt(aj.a, 2)}</b> · (m<sub>2</sub> − m<sub>1</sub>)/(m<sub>1</sub> + m<sub>2</sub>) ${aj.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(aj.b), 3)}</b>` +
      `<br>A inclinação estima g: <b>${fmt(aj.a, 2)} m/s²</b> · R² = ${fmt(aj.r2, 4)}`;
  }
}
desenharGraficos();
document.getElementById('painel').addEventListener('aba', (e) => { if (e.detail === 'medidas') requestAnimationFrame(desenharGraficos); });

document.getElementById('bt-registrar').addEventListener('click', () => {
  const n = contador.t.filter((v) => v !== null).length;
  if (n === 0) { avisar('O cronômetro ainda não registrou nenhuma passagem.'); return; }
  if (contador.registrado === contador.t0) { avisar('Estes tempos já estão na tabela. Faça outra largada.'); return; }
  contador.registrado = contador.t0;
  const q = est.modo === 'queda';
  contador.t.forEach((t, i) => {
    if (t === null) return;
    tabela.adicionar(q
      ? { modo: 'queda', m1: NaN, m2: NaN, d: leituraSensor(i), t }
      : { modo: 'Atwood', m1: m1(), m2: m2(), d: leituraSensor(i), t });
  });
  avisar(`Registrados ${n} tempo${n > 1 ? 's' : ''}.`);
});
document.getElementById('bt-csv').addEventListener('click', () => baixar('queda-livre-atwood.csv', tabela.csv()));
document.getElementById('bt-limpar').addEventListener('click', () => {
  if (confirm('Apagar todas as medidas da tabela?')) tabela.limpar();
});
document.getElementById('bt-zerar').addEventListener('click', () => contador.zerar());

/* ───────────────────────── Laço ───────────────────────── */

const rotA = rotulo('', 'modelo');
scene.add(rotA);
const seta = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 0.1, 0xd9480f, 0.02, 0.012);
scene.add(seta);
const elT = [1, 2, 3, 4].map((i) => document.getElementById('lei-t' + i));
let quadro = 0;

cena.aoQuadro((dt) => {
  passo.avancar(dt * (est.pausado ? 0 : est.vel), passoFisica);
  posicionar();
  const c = contador.canal;
  const tc = contador.t[c];
  crono.userData.visor.escrever(tc === null ? (contador.t0 === null ? '0,0000' : '- - - -') : fmt(tc, 4), `SENSOR ${c + 1}   t (s)`);
  portas.forEach((f, i) => f.userData.acender(contador.bloqueado(i)));
  if (quadro++ % 4 === 0) contador.t.forEach((t, i) => { elT[i].textContent = t === null ? '—' : fmt(t, 4) + ' s'; });

  seta.visible = rotA.visible = est.modelo;
  portas.forEach((f) => { f.userData.feixe.visible = est.modelo; });
  if (est.modelo) {
    const a = aModelo();
    const y = est.modo === 'queda' ? Y0 - est.d + R_ESF : Y0 - est.d + 0.05;
    seta.position.set(-0.05, y, Z_F);
    seta.setLength(Math.max(0.03, a * 0.015), 0.02, 0.012);
    rotA.position.set(-0.07, y + 0.03, Z_F);
    rotA.userData.html(`a = ${fmt(a, 2)} m/s²`);
  }
});

/* ───────────────────────── Início ───────────────────────── */

atualizarDinamica();
montar();
atualizarLeituras();
atualizarUI();
