// Plano inclinado de Galileu: trilho inclinável, carrinho preso por eletroímã,
// quatro fotoportas e um cronômetro digital de quatro canais.

import * as THREE from 'three';
import { criarCena, criarArraste } from '../motor/cena.js';
import { MAT } from '../motor/materiais.js';
import * as P from '../motor/pecas.js';
import { rk4, PassoFixo, parametrosCarrinho, aceleracaoCarrinho, derivCarrinho, CONST } from '../motor/fisica.js';
import { fmt, naResolucao } from '../motor/medida.js';
import { Contador } from '../motor/sensores.js';
import { abas, deslizante, escolha, chave, tabelaMedidas, grafico, baixar, aviso, barraDaCena } from '../motor/painel.js';
import { rotulo } from '../motor/rotulos.js';

/* ───────────────────────── Geometria ───────────────────────── */

const TOPO = 0.79;
const COMP = 1.2;                 // comprimento do trilho
const Z_T = 0.12;                 // eixo do trilho sobre a bancada
const X_ARTIC = 0.6;              // articulação, na ponta de baixo
const Y_ARTIC = TOPO + 0.03;      // superfície do trilho na articulação
const S_LARGADA = 0.1;            // borda da bandeira presa ao eletroímã (leitura da escala)
const S_FIM = 1.12;               // a frente do carrinho encosta no batente
const BANDEIRA = 0.05;
const ALT_FEIXE = 0.065;          // altura do feixe acima da superfície do trilho
const M_CARRINHO = 0.25, M_BLOCO = 0.1;

/* ───────────────────────── Estado ───────────────────────── */

const est = {
  graus: 4,
  blocos: 0,
  s: S_LARGADA,          // posição da borda dianteira da bandeira, na escala do trilho
  v: 0,
  preso: true,
  t: 0,
  vel: 1,
  pausado: false,
  modelo: false,
  sensores: [0.3, 0.5, 0.7, 0.9],
};

function parametros() {
  return parametrosCarrinho({
    theta: est.graus * Math.PI / 180,
    massa: M_CARRINHO + est.blocos * M_BLOCO,
    massaRot: 0.012,   // quatro rodas de 6 g: 4 · (½·m·r²)/r²
    mu: 0.0015,        // resistência ao rolamento
    k: 0.0017,         // ½·ρ·Cd·A do carrinho
  });
}
let par = parametros();
let deriv = derivCarrinho(par);
const contador = new Contador(est.sensores);

/* ───────────────────────── Cena ───────────────────────── */

const elCena = document.getElementById('cena');
const cena = criarCena(elCena, {
  alvo: new THREE.Vector3(0, 0.95, 0.1),
  camera: new THREE.Vector3(0.75, 1.45, 1.95),
  vistas: {
    frente: { pos: new THREE.Vector3(0, 1.0, 1.75), alvo: new THREE.Vector3(0, 0.95, Z_T) },
    cima: { pos: new THREE.Vector3(0, 3.0, 0.5), alvo: new THREE.Vector3(0, 0.8, 0.1) },
    largada: { pos: new THREE.Vector3(-0.35, 1.2, 0.6), alvo: new THREE.Vector3(-0.55, 1.05, Z_T) },
    escala: { pos: new THREE.Vector3(0.05, 0.98, 0.62), alvo: new THREE.Vector3(0.05, 0.92, Z_T) },
    cronometro: { pos: new THREE.Vector3(0.38, 1.1, 0.25), alvo: new THREE.Vector3(0.38, TOPO + 0.04, -0.22) },
  },
});
const { scene } = cena;
scene.add(P.bancada({ alt: TOPO }));

// Trilho inclinável: o grupo gira em torno da articulação; dentro dele, x = s − COMP.
const incl = new THREE.Group();
incl.position.set(X_ARTIC, Y_ARTIC, Z_T);
scene.add(incl);
const trilho = P.trilho({ comp: COMP });
trilho.position.x = -COMP;
incl.add(trilho);
const sx = (s) => s - COMP;   // posição local ao longo do trilho

// articulação na ponta de baixo
const artic = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.1), MAT.ferroPintado(0x2b3036));
artic.position.set(X_ARTIC - 0.01, TOPO + 0.006, Z_T);
const pino = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.11, 12), MAT.aco());
pino.rotation.x = Math.PI / 2;
pino.position.set(X_ARTIC, Y_ARTIC - 0.018, Z_T);
scene.add(artic, pino);

// Suporte que segura a ponta de cima
const suporte = P.suporteUniversal({ altura: 0.62, base: [0.18, 0.26] });
scene.add(suporte);
const mufa = P.mufa();
const barra = P.barra(0.46);
scene.add(mufa, barra);

// Eletroímã na ponta de cima, com a face voltada para baixo do trilho (+X local)
const ima = P.eletroima();
ima.rotation.z = Math.PI / 2;
ima.position.set(sx(S_LARGADA - 0.08), 0.026, 0); // encosta na traseira do carrinho
incl.add(ima);

// Carrinho
const carro = P.carrinho();
incl.add(carro);

// Fotoportas em pórtico sobre o trilho
const portas = est.sensores.map(() => {
  const f = P.fotoporta({ vao: 0.12, alturaBracos: 0.143, abaixoDoFeixe: 0.06 });
  f.rotation.x = Math.PI;
  f.position.y = ALT_FEIXE;
  incl.add(f);
  return f;
});

// Cronômetro de quatro canais
const crono = P.caixaInstrumento({
  larg: 0.22, alt: 0.08, prof: 0.15, cor: 0xd9dcd6, nome: 'CRONÔMETRO', visorLarg: 0.12, visorAlt: 0.036,
  botoes: [{ id: 'canal', rotulo: 'CANAL', cor: 0x30343a }, { id: 'zera', rotulo: 'ZERA', cor: 0xb3261e }],
});
crono.position.set(0.38, TOPO, -0.22);
crono.rotation.y = -0.12;
scene.add(crono);
const cabos = portas.map(() => { const c = P.cabo(0x1b1d20, 0.0018); scene.add(c); return c; });
const caboIma = P.cabo(0x8b1a12, 0.0018);
scene.add(caboIma);

const tmp = new THREE.Vector3();
function ligarCabos() {
  incl.updateMatrixWorld(true);
  crono.updateMatrixWorld(true);
  portas.forEach((f, i) => {
    const a = f.localToWorld(tmp.set(0, -0.06, 0.06)).clone(); // lado de trás (o pórtico está virado)
    const b = crono.localToWorld(new THREE.Vector3(-0.07 + i * 0.03, 0.04, -0.075));
    cabos[i].userData.ligar(a, b, 0.06, TOPO);
  });
  const a = ima.localToWorld(tmp.set(0, 0.054, 0)).clone();
  const b = crono.localToWorld(new THREE.Vector3(0.09, 0.04, -0.075));
  caboIma.userData.ligar(a, b, 0.1, TOPO);
}

// Rótulos do modelo
const rotA = rotulo('', 'modelo');
scene.add(rotA);
const setaMat = new THREE.MeshBasicMaterial({ color: 0xd9480f });
const seta = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.12, 0xd9480f, 0.03, 0.018);
seta.line.material = new THREE.LineBasicMaterial({ color: 0xd9480f });
seta.cone.material = setaMat;
incl.add(seta);

function montar() {
  const th = est.graus * Math.PI / 180;
  incl.rotation.z = -th;
  // suporte: a barra passa por baixo do trilho perto da ponta de cima
  const sBarra = 0.12;
  const xs = X_ARTIC - (COMP - sBarra) * Math.cos(th);
  const ySup = Y_ARTIC + (COMP - sBarra) * Math.sin(th) - 0.018 - 0.0055;
  suporte.position.set(xs, TOPO, Z_T - 0.28);
  const zHaste = suporte.position.z + suporte.userData.hasteZ;
  mufa.position.set(xs, ySup, zHaste);
  barra.position.set(xs, ySup, zHaste);
  portas.forEach((f, i) => { f.position.x = sx(est.sensores[i]); });
  posicionarCarro();
  ligarCabos();
}

function posicionarCarro() {
  // a origem do carrinho fica sob o centro; a bandeira termina em userData.frente
  carro.position.set(sx(est.s) - carro.userData.frente, 0, 0);
}

/* ───────────────────────── Física ───────────────────────── */

const passo = new PassoFixo(1 / 2000);
const bordas = () => [est.s, est.s - BANDEIRA];

function passoFisica(h) {
  const t0 = est.t;
  const antes = bordas();
  if (!est.preso) {
    const [s, v] = rk4(deriv, est.t, [est.s, est.v], h);
    est.s = s; est.v = v;
    if (est.s >= S_FIM) { est.s = S_FIM; est.v = -0.12 * Math.abs(est.v); }
    if (est.s < S_LARGADA) { est.s = S_LARGADA; est.v = 0; }
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
  if (aceleracaoCarrinho(par) === 0) avisar('Com esta inclinação o atrito segura o carrinho.');
  atualizarUI();
}
function voltar() {
  est.preso = true;
  est.s = S_LARGADA;
  est.v = 0;
  contador.portoes.forEach((p, i) => p.mover(est.sensores[i], bordas()));
  posicionarCarro();
  atualizarUI();
}

const btSoltar = document.getElementById('bt-soltar');
btSoltar.addEventListener('click', () => (est.preso ? soltar() : voltar()));

function ehDe(o, alvo) { for (let p = o; p; p = p.parent) if (p === alvo) return true; return false; }
function nome(o) { for (let p = o; p; p = p.parent) if (p.name) return p.name; return ''; }

// Arrastar as fotoportas ao longo do trilho
const planoTrilho = new THREE.Plane();
const ponto = new THREE.Vector3();
let arrastando = -1;
criarArraste(cena, {
  alvos: () => [...portas, carro, ...Object.values(crono.userData.botoes)],
  aoIniciar(hit) { arrastando = portas.findIndex((f) => ehDe(hit.object, f)); },
  aoMover(hit, ray) {
    if (arrastando < 0) return;
    incl.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(incl.matrixWorld);
    planoTrilho.setFromNormalAndCoplanarPoint(n, incl.getWorldPosition(new THREE.Vector3()));
    if (!ray.ray.intersectPlane(planoTrilho, ponto)) return;
    incl.worldToLocal(ponto);
    definirSensor(arrastando, ponto.x + COMP);
  },
  aoSoltar() { arrastando = -1; },
  aoClicar(hit) {
    const n = nome(hit.object);
    if (n === 'canal') contador.proximoCanal();
    else if (n === 'zera') { contador.zerar(); avisar('Cronômetro zerado.'); }
    else if (ehDe(hit.object, carro)) est.preso ? soltar() : voltar();
    else if (arrastando >= 0) avisar('Arraste a fotoporta ao longo do trilho.');
    arrastando = -1;
  },
});

/* ───────────────────────── Painel ───────────────────────── */

abas(document.getElementById('painel'));

const ctlAngulo = deslizante({
  rotulo: 'Inclinação do trilho', min: 2, max: 15, passo: 0.5, valor: est.graus, formatar: (v) => fmt(v, 1) + '°',
  aoMudar(v) { est.graus = v; mudouMontagem(); },
});
const ctlCarga = escolha({
  rotulo: 'Carga sobre o carrinho',
  opcoes: [0, 1, 2].map((n) => ({ valor: n, rotulo: n === 0 ? 'nenhuma' : `${n} bloco${n > 1 ? 's' : ''}` })),
  valor: 0,
  aoMudar(n) { est.blocos = n; carro.userData.definirCarga(n); mudouMontagem(); },
});
document.getElementById('ctl-montagem').append(ctlAngulo.el, ctlCarga.el);

const ctlSensores = est.sensores.map((s, i) => deslizante({
  rotulo: `Fotoporta ${i + 1}`, min: 0.15, max: 1.1, passo: 0.005, valor: s, formatar: (v) => fmt(v, 3) + ' m',
  aoMudar(v) { definirSensor(i, v, true); },
}));
document.getElementById('ctl-sensores').append(...ctlSensores.map((c) => c.el));

function definirSensor(i, s, doControle = false) {
  s = Math.max(0.15, Math.min(1.1, s));
  est.sensores[i] = s;
  contador.mover(i, s, bordas());
  portas[i].position.x = sx(s);
  if (!doControle) ctlSensores[i].definir(Math.round(s / 0.005) * 0.005);
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

function mudouMontagem() {
  par = parametros();
  deriv = derivCarrinho(par);
  if (!est.preso) voltar();
  montar();
  atualizarLeituras();
  desenharGraficos();
}

function leituraAngulo() { return naResolucao(est.graus, 0.5); }
function leituraSensor(i) { return naResolucao(est.sensores[i], 0.001); }

function atualizarLeituras() {
  document.getElementById('lei-angulo').textContent = fmt(leituraAngulo(), 1) + '°';
  document.getElementById('lei-massa').textContent = fmt((M_CARRINHO + est.blocos * M_BLOCO) * 1000, 0) + ' g';
  document.getElementById('lei-largada').textContent = fmt(S_LARGADA, 3) + ' m';
  est.sensores.forEach((s, i) => {
    document.getElementById('lei-d' + (i + 1)).textContent = fmt(leituraSensor(i) - S_LARGADA, 3) + ' m';
  });
  const aIdeal = CONST.g * Math.sin(est.graus * Math.PI / 180);
  document.getElementById('lei-aideal').textContent = fmt(aIdeal, 3) + ' m/s²';
  document.getElementById('lei-acarro').textContent = fmt(aceleracaoCarrinho(par), 3) + ' m/s²';
}

function atualizarUI() {
  btSoltar.textContent = est.preso ? 'Soltar o carrinho' : 'Voltar ao eletroímã';
}

// Tabela
const colunas = [
  { id: 'th', titulo: 'θ (°)', tituloCsv: 'theta (graus)', casas: 1, editavel: true },
  { id: 'd', titulo: 'd (m)', tituloCsv: 'd (m)', casas: 3, editavel: true },
  { id: 't', titulo: 't (s)', tituloCsv: 't (s)', casas: 4, editavel: true },
  { id: 't2', titulo: 't² (s²)', tituloCsv: 't2 (s2)', casas: 4, calc: (l) => l.t * l.t },
  { id: 'a', titulo: 'a = 2d/t² (m/s²)', tituloCsv: 'a (m/s2)', casas: 3, calc: (l) => (2 * l.d) / (l.t * l.t) },
];
const tabela = tabelaMedidas({ colunas, chaveSalvar: 'exp-plano-medidas', aoMudar: () => desenharGraficos() });
document.getElementById('tabela').append(tabela.el);

const grafD = grafico({ eixoX: 't² (s²)', eixoY: 'd (m)' });
const grafA = grafico({ eixoX: 'sen θ', eixoY: 'a (m/s²)' });
document.getElementById('grafico-d').append(grafD.el);
document.getElementById('grafico-a').append(grafA.el);

function desenharGraficos() {
  const dados = tabela.dados();
  const thAtual = leituraAngulo();
  const doAngulo = dados.filter((d) => Math.abs(d.th - thAtual) < 0.01);
  const aModelo = aceleracaoCarrinho(par);
  const aj = grafD.desenhar({
    pontos: doAngulo.map((d) => [d.t2, d.d]),
    ajuste: true,
    teorica: est.modelo ? (x) => (aModelo / 2) * x : null,
  });
  const elD = document.getElementById('ajuste-d');
  document.getElementById('titulo-grafico-d').textContent = `d em função de t², para θ = ${fmt(thAtual, 1)}°`;
  if (!aj || doAngulo.length < 2) {
    elD.textContent = 'Registre ao menos dois pontos com a inclinação atual para ver a reta.';
  } else {
    elD.innerHTML = `Reta ajustada: d = <b>${fmt(aj.a, 4)}</b> · t² ${aj.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(aj.b), 4)}</b>` +
      `<br>a = 2 · inclinação = <b>${fmt(2 * aj.a, 3)} m/s²</b> · R² = ${fmt(aj.r2, 4)}`;
  }

  // a em função de sen θ, com todos os pontos
  const pts = dados.map((d) => [Math.sin(d.th * Math.PI / 180), d.a]);
  const ajA = grafA.desenhar({
    pontos: pts,
    ajuste: true,
    teorica: est.modelo ? (x) => CONST.g * x : null,
  });
  const elA = document.getElementById('ajuste-a');
  const angulos = new Set(dados.map((d) => d.th.toFixed(1))).size;
  if (!ajA || angulos < 2) {
    elA.textContent = 'Meça com pelo menos duas inclinações diferentes para ver esta reta.';
  } else {
    elA.innerHTML = `Reta ajustada: a = <b>${fmt(ajA.a, 2)}</b> · sen θ ${ajA.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(ajA.b), 3)}</b>` +
      `<br>A inclinação da reta é a estimativa de g: <b>${fmt(ajA.a, 2)} m/s²</b> · R² = ${fmt(ajA.r2, 4)}`;
  }
}
desenharGraficos();
document.getElementById('painel').addEventListener('aba', (e) => { if (e.detail === 'medidas') requestAnimationFrame(desenharGraficos); });

document.getElementById('bt-registrar').addEventListener('click', () => {
  const n = contador.t.filter((v) => v !== null).length;
  if (n === 0) { avisar('O cronômetro ainda não registrou nenhuma passagem.'); return; }
  if (contador.registrado === contador.t0) { avisar('Estes tempos já estão na tabela. Solte o carrinho de novo.'); return; }
  contador.registrado = contador.t0;
  const th = leituraAngulo();
  contador.t.forEach((t, i) => {
    if (t !== null) tabela.adicionar({ th, d: leituraSensor(i) - S_LARGADA, t });
  });
  avisar(`Registrados ${n} tempo${n > 1 ? 's' : ''}.`);
});
document.getElementById('bt-csv').addEventListener('click', () => baixar('plano-inclinado.csv', tabela.csv()));
document.getElementById('bt-limpar').addEventListener('click', () => {
  if (confirm('Apagar todas as medidas da tabela?')) tabela.limpar();
});
document.getElementById('bt-zerar').addEventListener('click', () => contador.zerar());

/* ───────────────────────── Laço ───────────────────────── */

const elT = [1, 2, 3, 4].map((i) => document.getElementById('lei-t' + i));
let quadro = 0;
const eixoX = new THREE.Vector3(1, 0, 0);

cena.aoQuadro((dt) => {
  passo.avancar(dt * (est.pausado ? 0 : est.vel), passoFisica);
  posicionarCarro();
  const r = carro.userData.raioRoda;
  carro.userData.rodas.forEach((w) => { w.rotation.y = -(est.s / r); });

  // instrumentos
  const c = contador.canal;
  const tc = contador.t[c];
  crono.userData.visor.escrever(tc === null ? (contador.t0 === null ? '0,0000' : '- - - -') : fmt(tc, 4), `SENSOR ${c + 1}   t (s)`);
  portas.forEach((f, i) => f.userData.acender(contador.bloqueado(i)));
  if (quadro++ % 4 === 0) {
    contador.t.forEach((t, i) => { elT[i].textContent = t === null ? '—' : fmt(t, 4) + ' s'; });
  }

  // modelo
  seta.visible = rotA.visible = est.modelo;
  portas.forEach((f) => { f.userData.feixe.visible = est.modelo; });
  if (est.modelo) {
    const a = aceleracaoCarrinho(par);
    const x = sx(est.s) - carro.userData.frente;
    seta.position.set(x, carro.userData.topoBandeira + 0.03, 0);
    seta.setDirection(eixoX);
    seta.setLength(Math.max(0.04, a * 0.12), 0.025, 0.016);
    carro.updateMatrixWorld();
    rotA.position.copy(carro.localToWorld(new THREE.Vector3(0, carro.userData.topoBandeira + 0.07, 0)));
    rotA.userData.html(`a = ${fmt(a, 3)} m/s²`);
  }
});

/* ───────────────────────── Início ───────────────────────── */

montar();
atualizarLeituras();
atualizarUI();
