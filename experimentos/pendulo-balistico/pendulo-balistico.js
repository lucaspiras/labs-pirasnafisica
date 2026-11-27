// Pêndulo balístico: lançador de mola com três posições, fotoporta na boca do cano,
// pêndulo rígido com captador e massas adicionais, catraca que trava o pêndulo no
// ponto mais alto, transferidor e régua vertical para a altura do centro de massa.

import * as THREE from 'three';
import { criarCena, criarArraste } from '../motor/cena.js';
import { MAT } from '../motor/materiais.js';
import * as P from '../motor/pecas.js';
import { CONST, rk4, PassoFixo, Portao, corpoRigido, capturaBalistica, velocidadeBalistica } from '../motor/fisica.js';
import { fmt, naResolucao, gauss } from '../motor/medida.js';
import { abas, escolha, chave, tabelaMedidas, grafico, baixar, aviso, barraDaCena } from '../motor/painel.js';
import { rotulo } from '../motor/rotulos.js';

/* ───────────────────────── Geometria e dados ───────────────────────── */

const TOPO = 0.79;
const Z_P = 0.25;                       // plano do voo e da oscilação
const X_P = 0.12;                       // eixo do pêndulo
const R_B = 0.28;                       // do eixo ao centro da bola capturada
const Y_B = TOPO + 0.1;                 // eixo do cano
const Y_PIVO = Y_B + R_B;
const R_BOLA = 0.0127;                  // bola de 1 polegada
const CAPT = { larg: 0.06, alt: 0.05, prof: 0.04 };
const HASTE = R_B - CAPT.alt / 2;       // a haste vai do eixo ao topo do captador
const X_BOCA = X_P - CAPT.larg / 2 - 0.04;
const X_FEIXE = X_BOCA + 0.02;
const X_BOLA0 = X_BOCA - 0.016;         // bola carregada, dentro do cano
const DENTE = (0.5 * Math.PI) / 180;    // passo dos dentes da catraca
const ATRITO_EIXO = 0.002;              // N·m, eixo e lingueta da catraca somados
const ARCO_CATRACA = 0.2;

const VOL_BOLA = (4 / 3) * Math.PI * R_BOLA ** 3;
const BOLAS = {
  aco: { nome: 'aço', m: VOL_BOLA * 7850, mat: () => MAT.aco(0xd0d4d8, 0.12) },
  nailon: { nome: 'náilon', m: VOL_BOLA * 1140, mat: () => MAT.plastico(0xf1eee6, 0.35) },
};

// Lançador: mola de constante K comprimida x em cada posição; o êmbolo leva parte da energia.
const K_MOLA = 1700, M_EMBOLO = 0.04;
const POSICOES = [
  { rotulo: 'curto', x: 0.02 },
  { rotulo: 'médio', x: 0.03 },
  { rotulo: 'longo', x: 0.04 },
];

const M_HASTE = 0.035, M_CAPT = 0.14, M_EXTRA = 0.05, H_EXTRA = 0.016, R_EXTRA = 0.018;

function partesPendulo(n) {
  const p = [
    { m: M_HASTE, r: HASTE / 2, I0: (M_HASTE * HASTE * HASTE) / 12 },
    { m: M_CAPT, r: R_B, I0: (M_CAPT * (CAPT.larg ** 2 + CAPT.alt ** 2)) / 12 },
  ];
  for (let i = 0; i < n; i++) {
    p.push({ m: M_EXTRA, r: R_B + CAPT.alt / 2 + H_EXTRA * (i + 0.5), I0: (M_EXTRA * (3 * R_EXTRA ** 2 + H_EXTRA ** 2)) / 12 });
  }
  return p;
}

/* ───────────────────────── Estado ───────────────────────── */

const est = {
  bola: 'aco', extras: 0, posicao: 1,
  fase: 'pronto',          // pronto | voo | balanco | travado | descendo
  x: X_BOLA0, vb: 0,
  th: 0, w: 0, thMax: 0,
  tb: null,
  ecAntes: null, ecChoque: null,
  hminLido: null, hmaxLido: null,
  registrado: false,
  t: 0, vel: 1, pausado: false, modelo: false,
};

function derivados() {
  const b = BOLAS[est.bola];
  const partes = partesPendulo(est.extras);
  const pend = corpoRigido(partes);
  const tudo = corpoRigido([...partes, { m: b.m, r: R_B, I0: 0.4 * b.m * R_BOLA ** 2 }]);
  return { m: b.m, M: pend.M, Mt: tudo.M, rcm: tudo.rcm, I: tudo.I };
}
let pd = derivados();

const velocidadeMedia = (pos = est.posicao) => POSICOES[pos].x * Math.sqrt(K_MOLA / (pd.m + M_EMBOLO));

/* ───────────────────────── Cena ───────────────────────── */

const elCena = document.getElementById('cena');
const cena = criarCena(elCena, {
  alvo: new THREE.Vector3(X_P - 0.06, 1.0, Z_P),
  camera: new THREE.Vector3(0.75, 1.32, 1.5),
  vistas: {
    frente: { pos: new THREE.Vector3(X_P - 0.04, Y_B + 0.14, Z_P + 1.05), alvo: new THREE.Vector3(X_P - 0.04, Y_B + 0.12, Z_P) },
    cima: { pos: new THREE.Vector3(X_P - 0.05, 2.6, Z_P + 0.35), alvo: new THREE.Vector3(X_P - 0.05, TOPO, Z_P - 0.05) },
    lancador: { pos: new THREE.Vector3(X_BOCA - 0.02, Y_B + 0.1, Z_P + 0.38), alvo: new THREE.Vector3(X_BOCA - 0.02, Y_B, Z_P) },
    transferidor: { pos: new THREE.Vector3(X_P + 0.06, Y_PIVO - 0.12, Z_P + 0.5), alvo: new THREE.Vector3(X_P + 0.06, Y_PIVO - 0.12, Z_P) },
    regua: { pos: new THREE.Vector3(X_P + 0.2, TOPO + 0.17, Z_P + 0.55), alvo: new THREE.Vector3(X_P + 0.2, TOPO + 0.15, Z_P) },
  },
});
const { scene } = cena;
scene.add(P.bancada({ alt: TOPO }));

// Suporte do pêndulo
const suporte = P.suporteUniversal({ altura: 0.55, base: [0.2, 0.28] });
suporte.position.set(X_P, TOPO, 0);
scene.add(suporte);
const hasteZ = suporte.userData.hasteZ;
const mufa = P.mufa();
mufa.position.set(X_P, Y_PIVO, hasteZ);
scene.add(mufa);
const barra = P.barra(Z_P + 0.014 - hasteZ);
barra.position.set(X_P, Y_PIVO, hasteZ);
scene.add(barra);

// Transferidor atrás do pêndulo, com o centro no eixo
const transf = P.transferidor(0.16);
transf.position.set(X_P, Y_PIVO, Z_P - 0.03);
scene.add(transf);

// Catraca: arco dentado de 0° a 90°, do lado para onde o pêndulo sobe
const catraca = new THREE.Group();
catraca.position.set(X_P, Y_PIVO, Z_P - 0.013);
const arcoGeo = new THREE.TorusGeometry(ARCO_CATRACA, 0.0025, 6, 64, Math.PI / 2);
const arcoMalha = new THREE.Mesh(arcoGeo, MAT.aco(0x8d9399, 0.4));
arcoMalha.rotation.z = -Math.PI / 2;
catraca.add(arcoMalha);
const denteGeo = new THREE.BoxGeometry(0.006, 0.0016, 0.004);
const denteMat = MAT.aco(0x7a8086, 0.4);
for (let a = 0; a <= 90; a += 1.5) {
  const r = (a * Math.PI) / 180;
  const d = new THREE.Mesh(denteGeo, denteMat);
  d.position.set((ARCO_CATRACA - 0.003) * Math.sin(r), -(ARCO_CATRACA - 0.003) * Math.cos(r), 0);
  d.rotation.z = r;
  catraca.add(d);
}
catraca.traverse((o) => { if (o.isMesh) o.castShadow = true; });
scene.add(catraca);

// Régua vertical de alturas, com o zero no tampo da bancada
const X_REGUA = X_P + 0.25;
const regua = P.escala({ comprimento: 0.4, largura: 0.03, sobe: true });
regua.position.set(X_REGUA, TOPO + 0.004, Z_P - 0.05);
scene.add(regua);
const peRegua = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.05), MAT.ferroPintado(0x2b3036));
peRegua.position.set(X_REGUA + 0.015, TOPO + 0.002, Z_P - 0.06);
const costasRegua = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.004), MAT.plastico(0xd8d2c0, 0.6));
costasRegua.position.set(X_REGUA + 0.015, TOPO + 0.204, Z_P - 0.0525);
peRegua.castShadow = costasRegua.castShadow = true;
scene.add(peRegua, costasRegua);

// Lançador de mola. Origem do grupo na boca do cano, sobre o eixo.
const lancador = new THREE.Group();
lancador.name = 'lancador';
lancador.position.set(X_BOCA, Y_B, Z_P);
scene.add(lancador);
const R_CANO = 0.021, COMP_CANO = 0.24;
const matCano = MAT.plastico(0x1f3c66, 0.38);
{
  const externo = new THREE.Mesh(new THREE.CylinderGeometry(R_CANO, R_CANO, COMP_CANO, 36, 1, true), matCano);
  externo.rotation.z = Math.PI / 2;
  externo.position.x = -COMP_CANO / 2;
  const interno = new THREE.Mesh(new THREE.CylinderGeometry(R_BOLA + 0.0009, R_BOLA + 0.0009, 0.06, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.7, side: THREE.DoubleSide }));
  interno.rotation.z = Math.PI / 2;
  interno.position.x = -0.03;
  const aro = new THREE.Mesh(new THREE.RingGeometry(R_BOLA + 0.0009, R_CANO, 36), MAT.aco(0xa9afb5, 0.3));
  aro.rotation.y = Math.PI / 2;
  const fundo = new THREE.Mesh(new THREE.CircleGeometry(R_BOLA + 0.001, 24), MAT.aco(0x50555b, 0.5));
  fundo.rotation.y = Math.PI / 2;
  fundo.position.x = -0.045;
  const tampa = new THREE.Mesh(new THREE.CircleGeometry(R_CANO, 36), matCano);
  tampa.rotation.y = -Math.PI / 2;
  tampa.position.x = -COMP_CANO;
  // berço, chapa de base e parafusos
  const alturaBerco = Y_B - TOPO - 0.012;
  const berco = new THREE.Mesh(new THREE.BoxGeometry(0.09, alturaBerco, 0.032), MAT.ferroPintado(0x30363d));
  berco.position.set(-0.13, -alturaBerco / 2 - 0.004, 0);
  const chapa = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.12), MAT.ferroPintado(0x2b3036));
  chapa.position.set(-0.15, TOPO + 0.006 - Y_B, 0);
  // puxador do gatilho, atrás
  const vareta = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 10), MAT.aco());
  vareta.rotation.z = Math.PI / 2;
  vareta.position.x = -COMP_CANO - 0.015;
  const puxador = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), MAT.plastico(0xe6c547, 0.4));
  puxador.position.x = -COMP_CANO - 0.033;
  // escala das posições na lateral e o indicador da posição escolhida
  const et = P.etiqueta('CURTO  MÉDIO  LONGO', { larg: 0.085, alt: 0.01, fundo: '#1f3c66', tinta: '#e9edf2', peso: 600 });
  et.position.set(-0.17, 0.0, R_CANO + 0.0006);
  lancador.add(externo, interno, aro, fundo, tampa, berco, chapa, vareta, puxador, et);
}
const indicador = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.006), MAT.plastico(0xb3261e, 0.4));
lancador.add(indicador);
function posicionarIndicador() { indicador.position.set(-0.199 + est.posicao * 0.029, R_CANO + 0.004, 0.006); }
lancador.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

// Fotoporta na boca do cano, sobre um calço
const porta = P.fotoporta({ vao: 0.05, alturaBracos: 0.07, abaixoDoFeixe: 0.035 });
porta.position.set(X_FEIXE, Y_B, Z_P);
scene.add(porta);
const calco = new THREE.Mesh(new THREE.BoxGeometry(0.03, Y_B - 0.035 - 0.009 - TOPO, 0.09), MAT.ferroPintado(0x30363d));
calco.position.set(X_FEIXE, TOPO + (Y_B - 0.044 - TOPO) / 2, Z_P);
calco.castShadow = calco.receiveShadow = true;
scene.add(calco);

const contador = P.caixaInstrumento({
  larg: 0.2, alt: 0.075, prof: 0.15, cor: 0xd9dcd6, nome: 'FOTOPORTA',
  botoes: [{ id: 'foto-zerar', rotulo: 'ZERA', cor: 0xb3261e }],
});
contador.position.set(-0.38, TOPO, -0.08);
contador.rotation.y = 0.3;
scene.add(contador);
contador.updateMatrixWorld(true);
const caboFoto = P.cabo(0x1b1d20, 0.0022);
scene.add(caboFoto);
caboFoto.userData.passarPor([
  new THREE.Vector3(X_FEIXE, Y_B - 0.035, Z_P - 0.04),
  new THREE.Vector3(X_FEIXE - 0.04, TOPO + 0.012, Z_P - 0.1),
  new THREE.Vector3(-0.2, TOPO + 0.012, 0.0),
  contador.localToWorld(new THREE.Vector3(0, 0.03, -0.075)),
]);

// Pêndulo: grupo no eixo, girado em torno de Z
const pend = new THREE.Group();
pend.position.set(X_P, Y_PIVO, Z_P);
scene.add(pend);
const alum = MAT.acoEscovado(0xd2d6da);
{
  const cubo = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 20), MAT.aco(0x9aa0a6, 0.3));
  cubo.rotation.x = Math.PI / 2;
  const haste = new THREE.Mesh(new THREE.BoxGeometry(0.012, HASTE, 0.006), alum);
  haste.position.y = -HASTE / 2;
  const capt = new THREE.Mesh(new THREE.BoxGeometry(CAPT.larg, CAPT.alt, CAPT.prof), alum);
  capt.position.y = -R_B;
  const furo = new THREE.Mesh(new THREE.CircleGeometry(R_BOLA + 0.0012, 28), new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.9 }));
  furo.rotation.y = -Math.PI / 2;
  furo.position.set(-CAPT.larg / 2 - 0.0004, -R_B, 0);
  const lingueta = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.01), MAT.aco(0x6d737a, 0.35));
  lingueta.position.set(0.004, -ARCO_CATRACA + 0.004, -0.008);
  lingueta.rotation.z = 0.5;
  pend.add(cubo, haste, capt, furo, lingueta);
}
pend.name = 'pendulo';
const extras = [0, 1].map((i) => {
  const e = new THREE.Mesh(new THREE.CylinderGeometry(R_EXTRA, R_EXTRA, H_EXTRA - 0.0008, 28), MAT.latao());
  e.position.y = -(R_B + CAPT.alt / 2 + H_EXTRA * (i + 0.5));
  pend.add(e);
  return e;
});

// Marca do centro de massa (o símbolo de quadrantes alternados)
const marcaCM = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  for (let q = 0; q < 4; q++) {
    ctx.fillStyle = q % 2 ? '#f4f4f4' : '#111';
    ctx.beginPath(); ctx.moveTo(64, 64); ctx.arc(64, 64, 60, (q * Math.PI) / 2, ((q + 1) * Math.PI) / 2); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#111'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.CircleGeometry(0.0055, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
})();
pend.add(marcaCM);
pend.traverse((o) => { if (o.isMesh && o !== marcaCM) { o.castShadow = true; o.receiveShadow = true; } });

// Bola
let bola = null;
function montarBola() {
  const pai = bola ? bola.parent : scene;
  if (bola) { pai.remove(bola); bola.geometry.dispose(); }
  bola = new THREE.Mesh(new THREE.SphereGeometry(R_BOLA, 32, 22), BOLAS[est.bola].mat());
  bola.castShadow = true;
  bola.name = 'bola';
  scene.add(bola);
}

function ajustarPendulo() {
  extras.forEach((e, i) => { e.visible = i < est.extras; });
  const dentroDoCaptador = Math.abs(pd.rcm - R_B) < CAPT.alt / 2;
  marcaCM.position.set(0, -pd.rcm, dentroDoCaptador ? CAPT.prof / 2 + 0.0005 : 0.0035);
}

/* ───────────────────────── Física ───────────────────────── */

const passo = new PassoFixo(1 / 4000);
const portao = new Portao(X_FEIXE);
let tEntra = null;
const bordasBola = () => [est.x - R_BOLA, est.x + R_BOLA];

function derivBalanco(t, [th, w]) {
  const atrito = w > 0 ? ATRITO_EIXO : w < 0 ? -ATRITO_EIXO : 0;
  return [w, (-pd.Mt * CONST.g * pd.rcm * Math.sin(th) - atrito) / pd.I];
}

function passoFisica(h) {
  const t0 = est.t;
  if (est.fase === 'voo') {
    const antes = bordasBola();
    est.x += est.vb * h;
    const ev = portao.passo(t0, h, antes, bordasBola());
    if (ev && ev.tipo === 'entra') tEntra = ev.t;
    else if (ev && tEntra !== null) {
      est.tb = naResolucao(ev.t - tEntra + gauss(0, 0.000004), 0.00001);
      tEntra = null;
    }
    if (est.x >= X_P) capturar();
  } else if (est.fase === 'balanco') {
    const [th, w] = rk4(derivBalanco, t0, [est.th, est.w], h);
    est.th = th; est.w = w;
    if (th > est.thMax) est.thMax = th;
    if (w <= 0) travar();
  } else if (est.fase === 'descendo') {
    est.th = Math.max(0, est.th - 1.4 * h);
    if (est.th === 0) recolocar();
  }
  est.t += h;
}

function capturar() {
  est.x = X_P;
  est.w = capturaBalistica({ m: pd.m, v: est.vb, R: R_B, I: pd.I });
  est.ecAntes = 0.5 * pd.m * est.vb ** 2;
  est.ecChoque = 0.5 * pd.I * est.w ** 2;
  pend.add(bola);
  bola.position.set(0, -R_B, 0);
  est.fase = 'balanco';
  atualizarUI();
  atualizarMedidas();
}

function travar() {
  // a lingueta escorrega de volta até o último dente que passou
  est.th = Math.floor(est.thMax / DENTE + 1e-9) * DENTE;
  est.w = 0;
  est.fase = 'travado';
  const yCM = Y_PIVO - pd.rcm * Math.cos(est.th);
  est.hmaxLido = naResolucao(yCM - TOPO + gauss(0, 0.0003), 0.001);
  atualizarUI();
  atualizarMedidas();
}

function recolocar() {
  est.fase = 'pronto';
  est.th = 0; est.w = 0; est.thMax = 0;
  est.x = X_BOLA0; est.vb = 0;
  scene.add(bola);
  bola.position.set(X_BOLA0, Y_B, Z_P);
  portao.mover(X_FEIXE, bordasBola());
  tEntra = null;
  est.registrado = false;
  est.ecAntes = est.ecChoque = null;
  est.hminLido = naResolucao(Y_PIVO - pd.rcm - TOPO + gauss(0, 0.0003), 0.001);
  est.hmaxLido = null;
  atualizarUI();
  atualizarMedidas();
}

function disparar() {
  if (est.fase === 'travado') { liberar(); return; }
  if (est.fase !== 'pronto') return;
  est.vb = velocidadeMedia() * (1 + gauss(0, 0.008));
  est.tb = null;
  est.fase = 'voo';
  atualizarUI();
  atualizarMedidas();
}

function liberar() {
  if (est.fase !== 'travado') return;
  est.fase = 'descendo';
  atualizarUI();
}

/* ───────────────────────── Interação ───────────────────────── */

const avisar = aviso(elCena);
barraDaCena(cena, est, avisar);
const btDisparar = document.getElementById('bt-disparar');
btDisparar.addEventListener('click', disparar);

function nome(o) { for (let p = o; p; p = p.parent) if (p.name) return p.name; return ''; }
criarArraste(cena, {
  alvos: () => [lancador, pend, ...Object.values(contador.userData.botoes)],
  aoClicar(hit) {
    const n = nome(hit.object);
    if (n === 'foto-zerar') { est.tb = null; atualizarMedidas(); avisar('Fotoporta zerada.'); }
    else if (n === 'lancador') {
      if (est.fase === 'pronto') disparar();
      else avisar('Libere a catraca para recarregar o lançador.');
    } else if (n === 'pendulo' || n === 'bola') {
      if (est.fase === 'travado') liberar();
      else if (est.fase === 'pronto') avisar('Clique no lançador para disparar a bola.');
    }
  },
});

/* ───────────────────────── Painel ───────────────────────── */

abas(document.getElementById('painel'));

const ctlBola = escolha({
  rotulo: 'Bola',
  opcoes: Object.entries(BOLAS).map(([id, b]) => ({ valor: id, rotulo: `${b.nome}, ${fmt(b.m * 1000, 1)} g` })),
  valor: est.bola,
  aoMudar(v) { est.bola = v; montarBola(); mudouMontagem(); },
});
const ctlExtras = escolha({
  rotulo: 'Massas adicionais no pêndulo',
  opcoes: [{ valor: 0, rotulo: 'nenhuma' }, { valor: 1, rotulo: '1 × 50 g' }, { valor: 2, rotulo: '2 × 50 g' }],
  valor: est.extras,
  aoMudar(v) { est.extras = v; mudouMontagem(); },
});
const ctlPosicao = escolha({
  rotulo: 'Posição do lançador',
  opcoes: POSICOES.map((p, i) => ({ valor: i, rotulo: p.rotulo })),
  valor: est.posicao,
  aoMudar(v) { est.posicao = v; posicionarIndicador(); mudouMontagem(); },
});
document.getElementById('ctl-montagem').append(ctlBola.el, ctlExtras.el, ctlPosicao.el);

const ctlModelo = chave({
  rotulo: 'Mostrar o modelo (energias e previsões)', valor: false,
  aoMudar(v) { est.modelo = v; document.getElementById('lei-modelo').hidden = !v; desenharGraficos(); },
});
const ctlQualidade = chave({
  rotulo: 'Gráficos em alta qualidade (sombras)', valor: cena.qualidade === 'alta',
  aoMudar(v) { cena.definirQualidade(v ? 'alta' : 'baixa'); },
});
document.getElementById('ctl-simulacao').append(ctlModelo.el, ctlQualidade.el);

function mudouMontagem() {
  pd = derivados();
  ajustarPendulo();
  recolocar();
  atualizarLeituras();
}

// leituras dos instrumentos de montagem: balança de 0,1 g, paquímetro de 0,05 mm, régua de 1 mm
const lido = () => ({
  m: naResolucao(pd.m * 1000, 0.1) / 1000,
  M: naResolucao(pd.M * 1000, 0.1) / 1000,
  d: naResolucao(2 * R_BOLA * 1000, 0.05) / 1000,
  rcm: naResolucao(pd.rcm, 0.001),
});

function atualizarLeituras() {
  const l = lido();
  document.getElementById('lei-m').textContent = fmt(l.m * 1000, 1) + ' g';
  document.getElementById('lei-d').textContent = fmt(l.d * 1000, 2) + ' mm';
  document.getElementById('lei-M').textContent = fmt(l.M * 1000, 1) + ' g';
  document.getElementById('lei-rcm').textContent = fmt(l.rcm * 1000, 0) + ' mm';
  document.getElementById('lei-g').textContent = fmt(CONST.g, 2) + ' m/s²';
  document.getElementById('lei-vprev').textContent = fmt(velocidadeMedia(), 2) + ' m/s';
  document.getElementById('lei-frac-simples').textContent = fmt((100 * pd.m) / pd.Mt, 1) + ' %';
  document.getElementById('lei-frac').textContent = fmt((100 * pd.m * R_B * R_B) / pd.I, 1) + ' %';
  document.getElementById('lei-I').innerHTML = fmt(pd.I * 1e4, 1) + ' × 10<sup>−4</sup> kg·m²';
}

function atualizarUI() {
  const textos = { pronto: 'Disparar', voo: 'Disparando…', balanco: 'Subindo…', travado: 'Liberar a catraca', descendo: 'Descendo…' };
  btDisparar.textContent = textos[est.fase];
  btDisparar.disabled = est.fase === 'voo' || est.fase === 'balanco' || est.fase === 'descendo';
}

const anguloLido = () => (est.fase === 'travado' ? naResolucao((est.th * 180) / Math.PI, 0.5) : null);
const vLida = () => (est.tb ? lido().d / est.tb : null);
const hPeloAngulo = (th) => lido().rcm * (1 - Math.cos((th * Math.PI) / 180));

function atualizarMedidas() {
  const set = (id, t) => { document.getElementById(id).textContent = t; };
  set('lei-tb', est.tb ? fmt(est.tb, 5) + ' s' : '—');
  set('lei-v', est.tb ? fmt(vLida(), 3) + ' m/s' : '—');
  const th = anguloLido();
  set('lei-theta', th === null ? '—' : fmt(th, 1) + '°');
  set('lei-hmin', est.hminLido === null ? '—' : fmt(est.hminLido * 1000, 0) + ' mm');
  set('lei-hmax', est.hmaxLido === null ? '—' : fmt(est.hmaxLido * 1000, 0) + ' mm');
  set('lei-dh', est.hmaxLido === null ? '—' : fmt((est.hmaxLido - est.hminLido) * 1000, 0) + ' mm');
  set('lei-hang', th === null ? '—' : fmt(hPeloAngulo(th) * 1000, 1) + ' mm');
}

// Tabela
const g = CONST.g;
const ecDepois = (l) => (l.m + l.M) * g * l.h;
const ecAntes = (l) => 0.5 * l.m * l.v ** 2;
const colunas = [
  { id: 'bola', titulo: 'Bola', tituloCsv: 'bola', texto: true },
  { id: 'm', titulo: 'm (kg)', tituloCsv: 'm (kg)', casas: 4 },
  { id: 'M', titulo: 'M (kg)', tituloCsv: 'M (kg)', casas: 4 },
  { id: 'v', titulo: 'v (m/s)', tituloCsv: 'v fotoporta (m/s)', casas: 3, editavel: true },
  { id: 'th', titulo: 'θ (°)', tituloCsv: 'theta (graus)', casas: 1 },
  { id: 'h', titulo: 'h (m)', tituloCsv: 'h (m)', casas: 5, editavel: true },
  { id: 'v2', titulo: 'v′ (m/s)', tituloCsv: 'v depois (m/s)', casas: 3, calc: (l) => Math.sqrt(2 * g * l.h) },
  { id: 'vp', titulo: 'v<sub>pêndulo</sub> (m/s)', tituloCsv: 'v pendulo (m/s)', casas: 3, calc: (l) => velocidadeBalistica(l.m, l.M, l.h) },
  { id: 'ea', titulo: 'E<sub>c</sub> antes (J)', tituloCsv: 'Ec antes (J)', casas: 4, calc: ecAntes },
  { id: 'ed', titulo: 'E<sub>c</sub> depois (J)', tituloCsv: 'Ec depois (J)', casas: 4, calc: ecDepois },
  { id: 'perda', titulo: 'Perda (%)', tituloCsv: 'perda (%)', casas: 1, calc: (l) => 100 * (1 - ecDepois(l) / ecAntes(l)) },
];
const tabela = tabelaMedidas({ colunas, chaveSalvar: 'exp-balistico-medidas', aoMudar: () => desenharGraficos() });
document.getElementById('tabela').append(tabela.el);

const grafV = grafico({ eixoX: 'v fotoporta (m/s)', eixoY: 'v pêndulo (m/s)' });
const grafE = grafico({ eixoX: 'm / (m + M)', eixoY: 'Ec depois / Ec antes' });
document.getElementById('grafico-v').append(grafV.el);
document.getElementById('grafico-e').append(grafE.el);

function desenharGraficos() {
  const dados = tabela.dados();
  const aj = grafV.desenhar({ pontos: dados.map((d) => [d.v, d.vp]), ajuste: true, teorica: est.modelo ? (x) => x : null });
  const el = document.getElementById('ajuste-v');
  if (!aj || dados.length < 2) el.textContent = 'Registre ao menos dois disparos para ver a reta.';
  else {
    el.innerHTML = `Reta ajustada: v<sub>pêndulo</sub> = <b>${fmt(aj.a, 3)}</b> · v ${aj.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(aj.b), 3)}</b> · R² = ${fmt(aj.r2, 4)}` +
      `<br>Se o modelo do livro valesse sem ressalvas, a inclinação seria 1 e a reta passaria pela origem.`;
  }

  const pts = dados.map((d) => [d.m / (d.m + d.M), d.ed / d.ea]);
  const ajE = grafE.desenhar({ pontos: pts, ajuste: true, teorica: est.modelo ? (x) => x : null });
  const elE = document.getElementById('ajuste-e');
  const distintos = new Set(pts.map((p) => p[0].toFixed(3))).size;
  if (!ajE || distintos < 2) elE.textContent = 'Registre disparos com pelo menos duas combinações de bola e massas para ver a reta.';
  else {
    const media = dados.reduce((s, d) => s + d.perda, 0) / dados.length;
    elE.innerHTML = `Reta ajustada: inclinação <b>${fmt(ajE.a, 3)}</b>, intercepto <b>${fmt(ajE.b, 3)}</b> · R² = ${fmt(ajE.r2, 4)}` +
      `<br>Perda média de energia cinética no choque: <b>${fmt(media, 1)} %</b>.`;
  }
}
desenharGraficos();
document.getElementById('painel').addEventListener('aba', (e) => { if (e.detail === 'medidas') requestAnimationFrame(desenharGraficos); });

document.getElementById('bt-registrar').addEventListener('click', () => {
  if (est.fase !== 'travado') { avisar('Dispare e espere a catraca travar o pêndulo.'); return; }
  if (est.registrado) { avisar('Este disparo já está na tabela.'); return; }
  if (!est.tb) { avisar('A fotoporta não tem leitura deste disparo.'); return; }
  const l = lido();
  const th = anguloLido();
  est.registrado = true;
  tabela.adicionar({ bola: BOLAS[est.bola].nome, m: l.m, M: l.M, v: vLida(), th, h: hPeloAngulo(th) });
  avisar(`Registrado: v = ${fmt(vLida(), 3)} m/s, θ = ${fmt(th, 1)}°.`);
});
document.getElementById('bt-csv').addEventListener('click', () => baixar('pendulo-balistico.csv', tabela.csv()));
document.getElementById('bt-limpar').addEventListener('click', () => {
  if (confirm('Apagar todas as medidas da tabela?')) tabela.limpar();
});

/* ───────────────────────── Laço ───────────────────────── */

const rotBola = rotulo('', 'modelo');
const rotPend = rotulo('', 'modelo');
scene.add(rotBola, rotPend);

cena.aoQuadro((dt) => {
  passo.avancar(dt * (est.pausado ? 0 : est.vel), passoFisica);
  pend.rotation.z = est.th;
  if (est.fase === 'pronto' || est.fase === 'voo') bola.position.set(est.x, Y_B, Z_P);

  contador.userData.visor.escrever(est.tb ? fmt(est.tb, 5) : '0,00000', 'BLOQUEIO   t (s)');
  porta.userData.acender(portao.bloqueado);
  porta.userData.feixe.visible = est.modelo;

  const voando = est.fase === 'voo';
  rotBola.visible = est.modelo && voando;
  rotPend.visible = est.modelo && est.fase !== 'pronto' && est.fase !== 'voo';
  if (rotBola.visible) {
    rotBola.position.set(est.x, Y_B + 0.05, Z_P);
    rotBola.userData.html(`v = ${fmt(est.vb, 2)} m/s<br>E<sub>c</sub> = ${fmt(0.5 * pd.m * est.vb ** 2, 3)} J`);
  }
  if (rotPend.visible) {
    const ec = est.fase === 'balanco' ? 0.5 * pd.I * est.w ** 2 : 0;
    const epg = pd.Mt * g * pd.rcm * (1 - Math.cos(est.th));
    const r = R_B + 0.09;
    rotPend.position.set(X_P + r * Math.sin(est.th) + 0.05, Y_PIVO - r * Math.cos(est.th), Z_P);
    const choque = est.ecAntes ? `<br>perdido no choque: ${fmt(est.ecAntes - est.ecChoque, 3)} J` : '';
    rotPend.userData.html(`E<sub>c</sub> = ${fmt(ec, 3)} J<br>E<sub>pg</sub> = ${fmt(epg, 3)} J${choque}`);
  }
});

/* ───────────────────────── Início ───────────────────────── */

montarBola();
posicionarIndicador();
mudouMontagem();
