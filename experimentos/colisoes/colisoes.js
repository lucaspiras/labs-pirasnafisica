// Colisões em trilho de ar: dois planadores, para-choques de mola ou velcro, duas
// fotoportas que medem o tempo de bloqueio da bandeira, compressor e disparador.

import * as THREE from 'three';
import { criarCena, criarArraste } from '../motor/cena.js';
import * as P from '../motor/pecas.js';
import { PassoFixo, Portao, colisao } from '../motor/fisica.js';
import { fmt, naResolucao, gauss } from '../motor/medida.js';
import { abas, deslizante, escolha, chave, tabelaMedidas, grafico, baixar, aviso, barraDaCena } from '../motor/painel.js';
import { rotulo } from '../motor/rotulos.js';

/* ───────────────────────── Geometria e dados ───────────────────────── */

const TOPO = 0.79;
const COMP = 2.0;
const X_INI = -COMP / 2;         // início do trilho na cena
const Z_T = 0.1;
const BANDEIRA = 0.05;            // largura da bandeira (m)
const MEIO = 0.1;                 // meio comprimento do planador
const MOLA = 0.014, VELCRO = 0.008; // o que cada para-choque acrescenta à ponta
const LIMITE = 0.03;              // elásticos das pontas do trilho
const PORTAS = [0.7, 1.45];
const U_A0 = LIMITE + MEIO + MOLA, U_B0 = 1.1;
const M_PLANADOR = 0.2, M_PAR = 0.1;
const E_MOLA = 0.94;              // as lâminas de aço devolvem quase toda a energia
const B_AR = 0.015;               // freio viscoso do colchão de ar (1/s)
const ALT_FEIXE = 0.035;

/* ───────────────────────── Estado ───────────────────────── */

const est = {
  tipo: 'elastica',
  cargaA: 0, cargaB: 0,
  tensao: 3,
  u: [U_A0, U_B0], v: [0, 0],
  grudados: false,
  tColisao: null,
  emRepouso: true,
  t: 0, vel: 1, pausado: false, modelo: false,
};
const massa = (i) => M_PLANADOR + (i === 0 ? est.cargaA : est.cargaB) * M_PAR;
const ponta = () => MEIO + (est.tipo === 'elastica' ? MOLA : VELCRO);

// fotoportas: um portão por planador em cada porta, porque cada bandeira é um corpo
const portoes = PORTAS.map((p) => [new Portao(p), new Portao(p)]);
const entrada = PORTAS.map(() => [null, null]);
let passagens = [];          // {porta, i, tb, sentido, t}
const ultimoNaPorta = PORTAS.map(() => null);
let canal = 0;

/* ───────────────────────── Cena ───────────────────────── */

const elCena = document.getElementById('cena');
const cena = criarCena(elCena, {
  alvo: new THREE.Vector3(0, 0.92, Z_T),
  camera: new THREE.Vector3(0.55, 1.4, 1.95),
  vistas: {
    frente: { pos: new THREE.Vector3(0, 1.05, 2.3), alvo: new THREE.Vector3(0, 0.95, Z_T) },
    cima: { pos: new THREE.Vector3(0, 3.0, 0.6), alvo: new THREE.Vector3(0, 0.9, Z_T) },
    choque: { pos: new THREE.Vector3(X_INI + 1.0, 1.08, Z_T + 0.55), alvo: new THREE.Vector3(X_INI + 1.0, 0.94, Z_T) },
    fotoportas: { pos: new THREE.Vector3(0.75, 1.15, 0.6), alvo: new THREE.Vector3(0.6, TOPO + 0.04, -0.15) },
  },
});
const { scene } = cena;
scene.add(P.bancada({ larg: 2.4, alt: TOPO }));

const trilho = P.trilhoDeAr({ comp: COMP });
const Y_ARESTA = TOPO + trilho.userData.alturaBase;
trilho.position.set(X_INI, Y_ARESTA, Z_T);
scene.add(trilho);

const planadores = [P.planador({ cor: 0x2f6fb0 }), P.planador({ cor: 0xd9480f })];
planadores.forEach((p) => scene.add(p));

const portas = PORTAS.map((u) => {
  const f = P.fotoporta({ vao: 0.16, alturaBracos: 0.2, abaixoDoFeixe: 0.06 });
  f.rotation.x = Math.PI;
  f.position.set(X_INI + u, Y_ARESTA + ALT_FEIXE, Z_T);
  scene.add(f);
  return f;
});

const contador = P.caixaInstrumento({
  larg: 0.22, alt: 0.08, prof: 0.15, cor: 0xd9dcd6, nome: 'FOTOPORTAS', visorLarg: 0.12, visorAlt: 0.036,
  botoes: [{ id: 'canal', rotulo: 'CANAL', cor: 0x30343a }, { id: 'zera', rotulo: 'ZERA', cor: 0xb3261e }],
});
contador.position.set(0.6, TOPO, -0.2);
contador.rotation.y = -0.1;
scene.add(contador);
const compressor = P.caixaInstrumento({
  larg: 0.26, alt: 0.16, prof: 0.2, cor: 0x5d6670, nome: 'COMPRESSOR', visorLarg: 0.06, visorAlt: 0.02,
  botoes: [{ id: 'ar', rotulo: 'AR', cor: 0x1e8e3e }], corVisor: '#2a2f35',
});
compressor.position.set(-0.85, TOPO, -0.22);
compressor.rotation.y = 0.15;
scene.add(compressor);
compressor.userData.visor.escrever('', '');
contador.updateMatrixWorld(true);
compressor.updateMatrixWorld(true);
const mangueira = P.cabo(0x23262a, 0.01);
scene.add(mangueira);
mangueira.userData.passarPor([
  compressor.localToWorld(new THREE.Vector3(-0.08, 0.1, -0.1)),
  new THREE.Vector3(-1.1, TOPO + 0.15, -0.15),
  new THREE.Vector3(-1.13, Y_ARESTA - 0.03, Z_T - 0.02),
  new THREE.Vector3(X_INI - 0.025, Y_ARESTA - 0.03, Z_T),
]);
portas.forEach((f, i) => {
  const c = P.cabo(0x1b1d20, 0.0018);
  scene.add(c);
  c.userData.passarPor([
    new THREE.Vector3(f.position.x, f.position.y + 0.065, Z_T - 0.06),
    new THREE.Vector3(f.position.x, TOPO + 0.012, Z_T - 0.2),
    contador.localToWorld(new THREE.Vector3(-0.05 + i * 0.05, 0.04, -0.075)),
  ]);
});

/* ───────────────────────── Física ───────────────────────── */

const passo = new PassoFixo(1 / 2000);

function bordas(i) { return [est.u[i] + BANDEIRA / 2, est.u[i] - BANDEIRA / 2]; }

function passoFisica(h) {
  const t0 = est.t;
  const antes = [bordas(0), bordas(1)];
  const m = [massa(0), massa(1)];
  for (let i = 0; i < 2; i++) {
    est.v[i] *= 1 - B_AR * h;
    est.u[i] += est.v[i] * h;
  }
  if (est.grudados) {
    const vc = (m[0] * est.v[0] + m[1] * est.v[1]) / (m[0] + m[1]);
    est.v = [vc, vc];
    est.u[1] = est.u[0] + 2 * ponta();
  } else {
    const folga = est.u[1] - est.u[0] - 2 * ponta();
    if (folga <= 0 && est.v[0] > est.v[1]) {
      const e = est.tipo === 'elastica' ? E_MOLA : 0;
      const [va, vb] = colisao(m[0], est.v[0], m[1], est.v[1], e);
      est.v = [va, vb];
      // desfaz a sobreposição, na proporção inversa das massas
      est.u[0] += (folga * m[1]) / (m[0] + m[1]);
      est.u[1] -= (folga * m[0]) / (m[0] + m[1]);
      if (est.tColisao === null) est.tColisao = t0 + h;
      if (e === 0) est.grudados = true;
    }
  }
  // elásticos das pontas do trilho
  const ini = LIMITE + ponta(), fim = COMP - LIMITE - ponta();
  if (est.u[0] < ini && est.v[0] < 0) { est.u[0] = ini; est.v[0] *= -0.85; if (est.grudados) est.v[1] = est.v[0]; }
  if (est.u[1] > fim && est.v[1] > 0) { est.u[1] = fim; est.v[1] *= -0.85; if (est.grudados) est.v[0] = est.v[1]; }
  est.t += h;

  // fotoportas
  for (let p = 0; p < PORTAS.length; p++) {
    for (let i = 0; i < 2; i++) {
      const ev = portoes[p][i].passo(t0, h, antes[i], bordas(i));
      if (!ev) continue;
      if (ev.tipo === 'entra') entrada[p][i] = ev.t;
      else if (entrada[p][i] !== null) {
        const tb = naResolucao(ev.t - entrada[p][i] + gauss(0, 0.00003), 0.0001);
        const reg = { porta: p, i, tb, sentido: Math.sign(est.v[i]) || 1, t: ev.t };
        passagens.push(reg);
        ultimoNaPorta[p] = reg;
        entrada[p][i] = null;
        listarPassagens();
      }
    }
  }
}

function recolocar() {
  est.u = [U_A0, U_B0];
  est.v = [0, 0];
  est.grudados = false;
  est.tColisao = null;
  est.emRepouso = true;
  passagens = [];
  ultimoNaPorta.fill(null);
  portoes.forEach((par, p) => par.forEach((pt, i) => { pt.mover(PORTAS[p], bordas(i)); entrada[p][i] = null; }));
  listarPassagens();
  atualizarUI();
}

function disparar() {
  if (!est.emRepouso) { recolocar(); return; }
  // o elástico esticado devolve energia ½·k·x²; a velocidade varia um pouco de um disparo a outro
  const v0 = (0.12 + 0.1 * est.tensao) * Math.sqrt(0.2 / massa(0)) * (1 + gauss(0, 0.015));
  est.v[0] = v0;
  est.emRepouso = false;
  atualizarUI();
}

/* ───────────────────────── Interação ───────────────────────── */

const avisar = aviso(elCena);
barraDaCena(cena, est, avisar);
const btDisparar = document.getElementById('bt-disparar');
btDisparar.addEventListener('click', disparar);

function nome(o) { for (let p = o; p; p = p.parent) if (p.name) return p.name; return ''; }
function ehDe(o, alvo) { for (let p = o; p; p = p.parent) if (p === alvo) return true; return false; }
criarArraste(cena, {
  alvos: () => [...planadores, ...Object.values(contador.userData.botoes), ...Object.values(compressor.userData.botoes)],
  aoClicar(hit) {
    const n = nome(hit.object);
    if (n === 'canal') canal = (canal + 1) % PORTAS.length;
    else if (n === 'zera') { passagens = []; ultimoNaPorta.fill(null); listarPassagens(); avisar('Fotoportas zeradas.'); }
    else if (n === 'ar') avisar('O compressor fica ligado: sem o colchão de ar, os planadores não andam.');
    else if (ehDe(hit.object, planadores[0])) disparar();
    else if (ehDe(hit.object, planadores[1])) avisar('O planador B começa parado. Dispare o A.');
  },
});

/* ───────────────────────── Painel ───────────────────────── */

abas(document.getElementById('painel'));

const ctlTipo = escolha({
  rotulo: 'Para-choques',
  opcoes: [{ valor: 'elastica', rotulo: 'molas (colisão elástica)' }, { valor: 'inelastica', rotulo: 'velcro (inelástica)' }],
  valor: est.tipo,
  aoMudar(v) { est.tipo = v; planadores.forEach((p) => p.userData.definirParaChoque(v === 'elastica' ? 'elastico' : 'velcro')); mudouMontagem(); },
});
const opcoesCarga = [0, 1, 2].map((n) => ({ valor: n, rotulo: `${fmt((M_PLANADOR + n * M_PAR) * 1000, 0)} g` }));
const ctlA = escolha({ rotulo: 'Massa do planador A (azul)', opcoes: opcoesCarga, valor: 0, aoMudar(n) { est.cargaA = n; planadores[0].userData.definirCarga(n); mudouMontagem(); } });
const ctlB = escolha({ rotulo: 'Massa do planador B (laranja)', opcoes: opcoesCarga, valor: 0, aoMudar(n) { est.cargaB = n; planadores[1].userData.definirCarga(n); mudouMontagem(); } });
const ctlTensao = deslizante({
  rotulo: 'Tensão do disparador', min: 1, max: 5, passo: 1, valor: est.tensao, formatar: (v) => `posição ${v}`,
  aoMudar(v) { est.tensao = v; },
});
document.getElementById('ctl-montagem').append(ctlTipo.el, ctlA.el, ctlB.el, ctlTensao.el);

const ctlModelo = chave({
  rotulo: 'Mostrar o modelo (velocidades previstas)', valor: false,
  aoMudar(v) { est.modelo = v; desenharGraficos(); },
});
const ctlQualidade = chave({
  rotulo: 'Gráficos em alta qualidade (sombras)', valor: cena.qualidade === 'alta',
  aoMudar(v) { cena.definirQualidade(v ? 'alta' : 'baixa'); },
});
document.getElementById('ctl-simulacao').append(ctlModelo.el, ctlQualidade.el);

function mudouMontagem() { recolocar(); atualizarLeituras(); desenharGraficos(); }

function atualizarLeituras() {
  document.getElementById('lei-ma').textContent = fmt(massa(0) * 1000, 0) + ' g';
  document.getElementById('lei-mb').textContent = fmt(massa(1) * 1000, 0) + ' g';
  document.getElementById('lei-band').textContent = fmt(BANDEIRA * 1000, 2) + ' mm';
}
function atualizarUI() {
  btDisparar.textContent = est.emRepouso ? 'Disparar o planador A' : 'Recolocar os planadores';
}

const elPass = document.getElementById('passagens');
function listarPassagens() {
  if (!passagens.length) { elPass.innerHTML = '<p class="tab-vazio">Nenhuma passagem ainda.</p>'; return; }
  elPass.innerHTML = '<dl class="leitura">' + passagens.slice(-6).map((p) =>
    `<dt>Porta ${p.porta + 1} · ${p.i === 0 ? 'A' : 'B'} ${p.sentido > 0 ? '→' : '←'}</dt><dd>${fmt(p.tb, 4)} s</dd>`).join('') + '</dl>';
}

// Tabela
const vel = (tb, s) => (s * BANDEIRA) / tb;
const colunas = [
  { id: 'tipo', titulo: 'Tipo', tituloCsv: 'tipo', texto: true },
  { id: 'ma', titulo: 'm<sub>A</sub> (kg)', tituloCsv: 'mA (kg)', casas: 3 },
  { id: 'mb', titulo: 'm<sub>B</sub> (kg)', tituloCsv: 'mB (kg)', casas: 3 },
  { id: 'va', titulo: 'v<sub>A</sub> (m/s)', tituloCsv: 'vA antes (m/s)', casas: 3, editavel: true },
  { id: 'va2', titulo: 'v<sub>A</sub>′ (m/s)', tituloCsv: 'vA depois (m/s)', casas: 3, editavel: true },
  { id: 'vb2', titulo: 'v<sub>B</sub>′ (m/s)', tituloCsv: 'vB depois (m/s)', casas: 3, editavel: true },
  { id: 'pa', titulo: 'Q antes', tituloCsv: 'Q antes (kg m/s)', casas: 4, calc: (l) => l.ma * l.va },
  { id: 'pd', titulo: 'Q depois', tituloCsv: 'Q depois (kg m/s)', casas: 4, calc: (l) => l.ma * l.va2 + l.mb * l.vb2 },
  { id: 'ea', titulo: 'E<sub>c</sub> antes', tituloCsv: 'Ec antes (J)', casas: 4, calc: (l) => 0.5 * l.ma * l.va ** 2 },
  { id: 'ed', titulo: 'E<sub>c</sub> depois', tituloCsv: 'Ec depois (J)', casas: 4, calc: (l) => 0.5 * l.ma * l.va2 ** 2 + 0.5 * l.mb * l.vb2 ** 2 },
];
const tabela = tabelaMedidas({ colunas, chaveSalvar: 'exp-colisoes-medidas', aoMudar: () => desenharGraficos() });
document.getElementById('tabela').append(tabela.el);

const grafQ = grafico({ eixoX: 'Q antes (kg·m/s)', eixoY: 'Q depois (kg·m/s)' });
const grafE = grafico({ eixoX: 'Ec antes (J)', eixoY: 'Ec depois (J)' });
document.getElementById('grafico-q').append(grafQ.el);
document.getElementById('grafico-e').append(grafE.el);

function desenharGraficos() {
  const dados = tabela.dados();
  const aj = grafQ.desenhar({ pontos: dados.map((d) => [d.pa, d.pd]), ajuste: true, teorica: est.modelo ? (x) => x : null });
  const el = document.getElementById('ajuste-q');
  if (!aj || dados.length < 2) el.textContent = 'Registre ao menos duas colisões para ver a reta.';
  else el.innerHTML = `Reta ajustada: Q<sub>depois</sub> = <b>${fmt(aj.a, 3)}</b> · Q<sub>antes</sub> ${aj.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(aj.b), 4)}</b> · R² = ${fmt(aj.r2, 4)}`;

  const rot = est.tipo === 'elastica' ? 'elástica' : 'inelástica';
  const doTipo = dados.filter((d) => d.tipo === rot);
  document.getElementById('titulo-grafico-e').innerHTML = `E<sub>c</sub> depois em função de E<sub>c</sub> antes, colisões ${rot}s`;
  const ajE = grafE.desenhar({ pontos: doTipo.map((d) => [d.ea, d.ed]), ajuste: true, teorica: est.modelo ? (x) => x : null });
  const elE = document.getElementById('ajuste-e');
  if (!ajE || doTipo.length < 2) elE.textContent = `Registre ao menos duas colisões ${rot}s para ver a reta.`;
  else elE.innerHTML = `Reta ajustada: inclinação <b>${fmt(ajE.a, 3)}</b>. A fração da energia cinética que sobra depois do choque é, em média, ${fmt(ajE.a * 100, 0)} %.`;
}
desenharGraficos();
document.getElementById('painel').addEventListener('aba', (e) => { if (e.detail === 'medidas') requestAnimationFrame(desenharGraficos); });

document.getElementById('bt-registrar').addEventListener('click', () => {
  if (est.tColisao === null) { avisar('Ainda não houve colisão.'); return; }
  if (est.registrada === est.tColisao) { avisar('Esta colisão já está na tabela.'); return; }
  const antesA = passagens.find((p) => p.i === 0 && p.porta === 0 && p.t < est.tColisao);
  const depoisA = passagens.find((p) => p.i === 0 && p.t > est.tColisao);
  const depoisB = passagens.find((p) => p.i === 1 && p.t > est.tColisao);
  if (!antesA) { avisar('A fotoporta 1 não registrou o planador A antes do choque.'); return; }
  if (!depoisB) { avisar('Espere o planador B passar pela fotoporta 2.'); return; }
  // sem passagem de A depois do choque: só vale como zero se A estiver praticamente parado
  if (!depoisA && Math.abs(est.v[0]) > 0.03) { avisar('O planador A ainda anda. Espere ele passar por uma fotoporta.'); return; }
  est.registrada = est.tColisao;
  const va2 = depoisA ? vel(depoisA.tb, depoisA.sentido) : 0;
  tabela.adicionar({
    tipo: est.tipo === 'elastica' ? 'elástica' : 'inelástica',
    ma: massa(0), mb: massa(1),
    va: vel(antesA.tb, antesA.sentido), va2, vb2: vel(depoisB.tb, depoisB.sentido),
  });
  avisar(depoisA ? 'Colisão registrada.' : 'Colisão registrada com v<sub>A</sub>′ = 0: o planador A não passou por nenhuma fotoporta depois do choque.', 4200);
});
document.getElementById('bt-csv').addEventListener('click', () => baixar('colisoes.csv', tabela.csv()));
document.getElementById('bt-limpar').addEventListener('click', () => {
  if (confirm('Apagar todas as medidas da tabela?')) tabela.limpar();
});

/* ───────────────────────── Laço ───────────────────────── */

const rotA = rotulo('', 'modelo'), rotB = rotulo('', 'modelo');
scene.add(rotA, rotB);

cena.aoQuadro((dt) => {
  passo.avancar(dt * (est.pausado ? 0 : est.vel), passoFisica);
  planadores.forEach((p, i) => p.position.set(X_INI + est.u[i], Y_ARESTA, Z_T));

  const u = ultimoNaPorta[canal];
  contador.userData.visor.escrever(u ? fmt(u.tb, 4) : '0,0000', `PORTA ${canal + 1}   t (s)`);
  portas.forEach((f, p) => f.userData.acender(portoes[p][0].bloqueado || portoes[p][1].bloqueado));

  rotA.visible = rotB.visible = est.modelo;
  portas.forEach((f) => { f.userData.feixe.visible = est.modelo; });
  if (est.modelo) {
    [rotA, rotB].forEach((r, i) => {
      r.position.set(X_INI + est.u[i], Y_ARESTA + 0.1, Z_T);
      r.userData.html(`v<sub>${i ? 'B' : 'A'}</sub> = ${fmt(est.v[i], 3)} m/s`);
    });
  }
});

/* ───────────────────────── Início ───────────────────────── */

recolocar();
atualizarLeituras();
