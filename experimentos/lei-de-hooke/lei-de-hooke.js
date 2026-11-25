// Lei de Hooke: molas penduradas, porta-pesos com discos de 50 g e régua deslizante.
// Montagens: três molas avulsas, 1 e 2 em série, 1 e 2 em paralelo.

import * as THREE from 'three';
import { criarCena, criarArraste } from '../motor/cena.js';
import { MAT } from '../motor/materiais.js';
import * as P from '../motor/pecas.js';
import { CONST, rk4, PassoFixo, derivMola, kSerie, kParalelo, ajusteLinear } from '../motor/fisica.js';
import { fmt, naResolucao } from '../motor/medida.js';
import { abas, escolha, chave, tabelaMedidas, grafico, baixar, aviso, barraDaCena } from '../motor/painel.js';
import { rotulo } from '../motor/rotulos.js';

/* ───────────────────────── Dados da bancada ───────────────────────── */

const TOPO = 0.79;
const Z_P = 0.4;                   // plano da montagem
const BARRA_Y = TOPO + 0.95;
const GANCHO_Y = BARRA_Y - 0.012;  // onde a mola de cima se prende
const X_REGUA = 0.045;             // borda graduada da régua
const COMP_REGUA = 0.7;
const M_DISCO = 0.05, M_PORTA = 0.02, M_TRAVESSA = 0.015;
const N_DISCOS = 10;
const ESP_DISCO = 0.0054;

// As molas 1 e 2 vêm do mesmo lote, mas não saem idênticas da fábrica.
const MOLAS = {
  1: { k: 19.6, massa: 0.008, raioFio: 0.0007, cor: 0x9aa3ab },
  2: { k: 20.5, massa: 0.008, raioFio: 0.0007, cor: 0xa9a294 },
  3: { k: 38.4, massa: 0.012, raioFio: 0.0009, cor: 0x5f6d78 },
};
const MONTAGENS = {
  m1: { nome: 'Mola 1', curto: 'mola 1', molas: [1] },
  m2: { nome: 'Mola 2', curto: 'mola 2', molas: [2] },
  m3: { nome: 'Mola 3', curto: 'mola 3', molas: [3] },
  serie: { nome: '1 e 2 em série', curto: 'série', molas: [1, 2] },
  paralelo: { nome: '1 e 2 em paralelo', curto: 'paralelo', molas: [1, 2] },
};

/* ───────────────────────── Estado ───────────────────────── */

const est = {
  montagem: 'm1',
  discos: 0,
  x: 0, v: 0,              // alongamento equivalente da associação e sua velocidade
  zeroRegua: GANCHO_Y - 0.05, // altura da marca do zero da régua (desalinhada no início)
  t: 0, vel: 1, pausado: false, modelo: false,
};

function kEq() {
  const [a, b] = MONTAGENS[est.montagem].molas.map((i) => MOLAS[i].k);
  if (est.montagem === 'serie') return kSerie(a, b);
  if (est.montagem === 'paralelo') return kParalelo(a, b);
  return a;
}
function carga() {
  return M_PORTA + est.discos * M_DISCO + (est.montagem === 'paralelo' ? M_TRAVESSA : 0);
}
function massaMolas() {
  return MONTAGENS[est.montagem].molas.reduce((s, i) => s + MOLAS[i].massa, 0);
}
let deriv;
function atualizarDinamica() {
  const mEf = carga() + massaMolas() / 3;
  // amortecimento: a oscilação some em alguns segundos, como numa mola real com ar
  deriv = derivMola({ k: kEq(), mEf, carga: carga() + massaMolas() / 2, c: 1.5 * mEf });
}
function equilibrio() { return ((carga() + massaMolas() / 2) * CONST.g) / kEq(); }

/* ───────────────────────── Cena ───────────────────────── */

const elCena = document.getElementById('cena');
const cena = criarCena(elCena, {
  alvo: new THREE.Vector3(0, 1.3, 0.3),
  camera: new THREE.Vector3(0.85, 1.55, 1.75),
  vistas: {
    frente: { pos: new THREE.Vector3(0, 1.35, 1.6), alvo: new THREE.Vector3(0, 1.3, Z_P) },
    regua: { pos: new THREE.Vector3(0.12, 1.4, Z_P + 0.32), alvo: new THREE.Vector3(0.05, 1.35, Z_P) },
    massas: { pos: new THREE.Vector3(-0.15, 1.15, 0.85), alvo: new THREE.Vector3(-0.2, TOPO + 0.03, 0.25) },
  },
});
const { scene } = cena;
scene.add(P.bancada({ alt: TOPO }));

const suporte = P.suporteUniversal({ altura: 1.0, base: [0.2, 0.3] });
suporte.position.set(0, TOPO, 0.12);
scene.add(suporte);
const zHaste = suporte.position.z + suporte.userData.hasteZ;
const mufa = P.mufa();
mufa.position.set(0, BARRA_Y, zHaste);
const barra = P.barra(Z_P + 0.03 - zHaste);
barra.position.set(0, BARRA_Y, zHaste);
scene.add(mufa, barra);
// cruzeta na ponta da barra, para pendurar duas molas lado a lado
const cruzeta = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.008, 0.012), MAT.aco(0x8d9399, 0.35));
cruzeta.position.set(0, BARRA_Y - 0.004, Z_P);
cruzeta.castShadow = true;
scene.add(cruzeta);

// Régua vertical num pé próprio, à direita da mola
const pe = new THREE.Group();
pe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.014, 28), MAT.ferroPintado(0x2b3036)));
pe.children[0].position.y = 0.007;
const hasteRegua = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.92, 14), MAT.acoEscovado());
hasteRegua.position.y = 0.46; // termina logo abaixo da barra do suporte
pe.add(hasteRegua);
pe.position.set(X_REGUA + 0.04, TOPO, Z_P - 0.018);
pe.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
scene.add(pe);
const regua = new THREE.Group();
const face = P.escala({ comprimento: COMP_REGUA, largura: 0.032, fundo: '#f6f1e3' });
const fundoRegua = new THREE.Mesh(new THREE.BoxGeometry(0.032, COMP_REGUA + 0.02, 0.004), MAT.madeira());
fundoRegua.position.set(0.016, -COMP_REGUA / 2, -0.0022);
const presilha = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02), MAT.plastico(0x1d1f22));
presilha.position.set(0.04, 0.0, -0.008);
regua.add(face, fundoRegua, presilha);
regua.traverse((o) => { if (o.isMesh) o.castShadow = true; });
regua.position.set(X_REGUA, 0, Z_P - 0.006);
scene.add(regua);

// Molas (criadas conforme a montagem), travessa, porta-pesos, ponteiro, discos
let molas = [];
const travessa = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.01), MAT.aco(0x8d9399, 0.35));
travessa.castShadow = true;
scene.add(travessa);
const porta = P.portaPesos();
porta.position.z = Z_P;
scene.add(porta);
const ponteiro = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.0012, 0.003), MAT.plastico(0xc41a12, 0.4));
ponteiro.position.set(0.026 + 0.002, -0.016, -0.003);
porta.add(ponteiro);

const discos = [];
for (let i = 0; i < N_DISCOS; i++) {
  const d = P.discoMassa();
  d.name = 'disco';
  d.rotation.y = (i * 0.7) % (Math.PI * 2);
  discos.push(d);
  scene.add(d);
}
const PILHA = new THREE.Vector3(-0.26, TOPO, 0.28);

function montarMolas() {
  molas.forEach((m) => scene.remove(m));
  const mont = MONTAGENS[est.montagem];
  molas = mont.molas.map((i) => {
    const m = P.mola({ raioFio: MOLAS[i].raioFio, cor: MOLAS[i].cor });
    m.position.z = Z_P;
    scene.add(m);
    return m;
  });
  travessa.visible = est.montagem === 'paralelo';
}

/** Posiciona molas, travessa, porta-pesos e discos para o alongamento x. Devolve a altura do ponteiro. */
function posicionar() {
  const k = kEq();
  const F = k * est.x; // força na associação
  const mont = MONTAGENS[est.montagem];
  let yBase;
  if (est.montagem === 'paralelo') {
    molas.forEach((m, j) => {
      const L = m.userData.fechada + est.x;
      m.position.set(j === 0 ? -0.025 : 0.025, GANCHO_Y, Z_P);
      m.userData.definir(L);
    });
    const yT = GANCHO_Y - molas[0].userData.fechada - est.x;
    travessa.position.set(0, yT - 0.002, Z_P);
    yBase = yT - 0.005;
  } else {
    let y = GANCHO_Y;
    molas.forEach((m, j) => {
      const ki = MOLAS[mont.molas[j]].k;
      const L = m.userData.fechada + F / ki;
      m.position.set(0, y, Z_P);
      m.userData.definir(L);
      y -= L - 0.004; // os ganchos se encaixam um pouco
    });
    yBase = y;
  }
  porta.position.set(0, yBase, Z_P);
  for (let i = 0; i < N_DISCOS; i++) {
    const d = discos[i];
    if (i < est.discos) d.position.set(0, yBase - porta.userData.prato + i * ESP_DISCO, Z_P);
    else d.position.set(PILHA.x, PILHA.y + (N_DISCOS - 1 - i) * ESP_DISCO, PILHA.z);
  }
  return yBase + ponteiro.position.y;
}
let yPonteiro = 0;

/* ───────────────────────── Física ───────────────────────── */

const passo = new PassoFixo(1 / 1000);
function passoFisica(h) {
  const [x, v] = rk4(deriv, est.t, [est.x, est.v], h);
  est.x = Math.max(0, x); est.v = x < 0 ? 0 : v;
  est.t += h;
}
function oscilando() {
  // amplitude estimada pela energia em torno do equilíbrio
  const mEf = carga() + massaMolas() / 3;
  const dx = est.x - equilibrio();
  const A = Math.sqrt(dx * dx + (mEf * est.v * est.v) / kEq());
  return A > 0.0005; // meia divisão da régua
}

/* ───────────────────────── Interação ───────────────────────── */

const avisar = aviso(elCena);
barraDaCena(cena, est, avisar);

function por() {
  if (est.discos >= N_DISCOS) { avisar('Os dez discos já estão no porta-pesos.'); return; }
  est.discos++;
  atualizarDinamica();
  atualizarUI();
}
function tirar() {
  if (est.discos <= 0) { avisar('Não há disco no porta-pesos.'); return; }
  est.discos--;
  atualizarDinamica();
  atualizarUI();
}

function ehDe(o, alvo) { for (let p = o; p; p = p.parent) if (p === alvo) return true; return false; }
criarArraste(cena, {
  alvos: () => [porta, ...discos],
  aoClicar(hit) {
    const i = discos.indexOf(hit.object);
    if (i >= 0 && i >= est.discos) por();
    else if (i >= 0 || ehDe(hit.object, porta)) tirar();
  },
});

/* ───────────────────────── Painel ───────────────────────── */

abas(document.getElementById('painel'));

const ctlMontagem = escolha({
  rotulo: 'Montagem',
  opcoes: Object.entries(MONTAGENS).map(([v, m]) => ({ valor: v, rotulo: m.nome })),
  valor: est.montagem,
  aoMudar(v) {
    if (v === est.montagem) return;
    est.montagem = v;
    est.discos = 0;
    montarMolas();
    atualizarDinamica();
    est.x = equilibrio(); est.v = 0;
    atualizarUI();
    desenharGrafico();
    avisar('Montagem trocada: alinhe de novo o zero da régua.');
  },
});
document.getElementById('ctl-montagem').append(ctlMontagem.el);

document.getElementById('bt-por').addEventListener('click', por);
document.getElementById('bt-tirar').addEventListener('click', tirar);
document.getElementById('bt-zero').addEventListener('click', () => {
  if (oscilando()) { avisar('Espere a mola parar antes de alinhar o zero.'); return; }
  est.zeroRegua = naResolucao(yPonteiro, 0.0005);
  regua.position.y = est.zeroRegua;
  avisar('O zero da régua está na altura do ponteiro.');
});

const ctlModelo = chave({
  rotulo: 'Mostrar o modelo (força elástica e reta teórica)', valor: false,
  aoMudar(v) { est.modelo = v; document.getElementById('lei-modelo').hidden = !v; desenharGrafico(); },
});
const ctlQualidade = chave({
  rotulo: 'Gráficos em alta qualidade (sombras)', valor: cena.qualidade === 'alta',
  aoMudar(v) { cena.definirQualidade(v ? 'alta' : 'baixa'); },
});
document.getElementById('ctl-simulacao').append(ctlModelo.el, ctlQualidade.el);

function leituraRegua() { return naResolucao(est.zeroRegua - yPonteiro, 0.001); }
function massaAcrescentada() { return est.discos * M_DISCO; }

function atualizarUI() {
  document.getElementById('lei-massa').textContent = fmt(massaAcrescentada() * 1000, 0) + ' g';
  document.getElementById('lei-discos').textContent = `${est.discos} de ${N_DISCOS}`;
  document.getElementById('lei-keq').textContent = fmt(kEq(), 1) + ' N/m';
}

// Tabela
const colunas = [
  { id: 'mont', titulo: 'Molas', tituloCsv: 'montagem', texto: true },
  { id: 'm', titulo: 'm (kg)', tituloCsv: 'm (kg)', casas: 3, editavel: true },
  { id: 'F', titulo: 'F = m · g (N)', tituloCsv: 'F (N)', casas: 3, calc: (l) => l.m * CONST.g },
  { id: 'x', titulo: 'x (m)', tituloCsv: 'x (m)', casas: 3, editavel: true },
];
const tabela = tabelaMedidas({ colunas, chaveSalvar: 'exp-hooke-medidas', aoMudar: () => desenharGrafico() });
document.getElementById('tabela').append(tabela.el);
const graf = grafico({ eixoX: 'x (m)', eixoY: 'F (N)' });
document.getElementById('grafico').append(graf.el);

function desenharGrafico() {
  const curto = MONTAGENS[est.montagem].curto;
  const dados = tabela.dados();
  const daqui = dados.filter((d) => d.mont === curto);
  const aj = graf.desenhar({
    pontos: daqui.map((d) => [d.x, d.F]),
    ajuste: true,
    teorica: est.modelo ? (x) => kEq() * x : null,
  });
  document.getElementById('titulo-grafico').textContent = `F em função de x, ${MONTAGENS[est.montagem].nome.toLowerCase()}`;
  const el = document.getElementById('ajuste');
  if (!aj || new Set(daqui.map((d) => d.x.toFixed(3))).size < 2) {
    el.textContent = 'Registre ao menos dois pontos desta montagem para ver a reta.';
  } else {
    el.innerHTML = `Reta ajustada: F = <b>${fmt(aj.a, 1)}</b> · x ${aj.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(aj.b), 3)}</b>` +
      `<br>Constante elástica: k = <b>${fmt(aj.a, 1)} N/m</b> · R² = ${fmt(aj.r2, 4)}`;
  }
  // resumo de todas as montagens medidas
  const linhas = Object.values(MONTAGENS).map((m) => {
    const ds = dados.filter((d) => d.mont === m.curto);
    if (ds.length < 2) return null;
    const a = ajusteLinear(ds.map((d) => d.x), ds.map((d) => d.F));
    return a ? `<dt>${m.nome}</dt><dd>${fmt(a.a, 1)} N/m</dd>` : null;
  }).filter(Boolean);
  const res = document.getElementById('resumo-k');
  res.innerHTML = linhas.join('');
  res.hidden = linhas.length === 0;
  document.getElementById('resumo-vazio').hidden = linhas.length > 0;
}
desenharGrafico();
document.getElementById('painel').addEventListener('aba', (e) => { if (e.detail === 'medidas') requestAnimationFrame(desenharGrafico); });

document.getElementById('bt-registrar').addEventListener('click', () => {
  if (oscilando()) { avisar('Espere a mola parar de oscilar para ler a régua.'); return; }
  const x = leituraRegua();
  tabela.adicionar({ mont: MONTAGENS[est.montagem].curto, m: massaAcrescentada(), x });
  avisar(`Registrado: ${fmt(massaAcrescentada() * 1000, 0)} g, x = ${fmt(x, 3)} m.`);
});
document.getElementById('bt-csv').addEventListener('click', () => baixar('lei-de-hooke.csv', tabela.csv()));
document.getElementById('bt-limpar').addEventListener('click', () => {
  if (confirm('Apagar todas as medidas da tabela?')) tabela.limpar();
});

/* ───────────────────────── Rótulos do modelo ───────────────────────── */

const rotF = rotulo('', 'modelo');
scene.add(rotF);
const seta = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.1, 0xd9480f, 0.02, 0.012);
scene.add(seta);

/* ───────────────────────── Laço ───────────────────────── */

const elLeitura = document.getElementById('lei-regua');
const elEstado = document.getElementById('lei-estado');
let quadro = 0;
cena.aoQuadro((dt) => {
  passo.avancar(dt * (est.pausado ? 0 : est.vel), passoFisica);
  yPonteiro = posicionar();
  // a vista "Régua" acompanha a altura do ponteiro, que muda com a montagem e a carga
  cena.vistas.regua.alvo.y = yPonteiro;
  cena.vistas.regua.pos.y = yPonteiro + 0.04;
  if (quadro++ % 5 === 0) {
    const osc = oscilando();
    elLeitura.textContent = fmt(leituraRegua(), 3) + ' m';
    elEstado.textContent = osc ? 'oscilando' : 'em repouso';
    elEstado.classList.toggle('alerta', osc);
  }
  seta.visible = rotF.visible = est.modelo;
  if (est.modelo) {
    const F = kEq() * est.x;
    seta.position.set(-0.04, porta.position.y, Z_P);
    seta.setLength(Math.max(0.02, F * 0.03), 0.02, 0.012);
    rotF.position.set(-0.06, porta.position.y + F * 0.03 + 0.01, Z_P);
    rotF.userData.html(`F<sub>el</sub> = ${fmt(F, 2)} N`);
  }
});

/* ───────────────────────── Início ───────────────────────── */

montarMolas();
atualizarDinamica();
est.x = equilibrio();
yPonteiro = posicionar();
regua.position.y = est.zeroRegua;
atualizarUI();
