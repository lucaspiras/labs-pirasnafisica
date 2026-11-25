// Lançamento horizontal: rampa em calha na borda da bancada, fotoporta na saída,
// papel no chão que guarda as marcas, prumo, trena e um alvo para a previsão.

import * as THREE from 'three';
import { criarCena, criarArraste } from '../motor/cena.js';
import { MAT } from '../motor/materiais.js';
import * as P from '../motor/pecas.js';
import { CONST, rk4, PassoFixo, Portao, derivVoo, alcanceHorizontal } from '../motor/fisica.js';
import { fmt, naResolucao, gauss, lerNumero } from '../motor/medida.js';
import { abas, deslizante, escolha, chave, tabelaMedidas, grafico, baixar, aviso, barraDaCena } from '../motor/painel.js';
import { rotulo } from '../motor/rotulos.js';

/* ───────────────────────── Geometria ───────────────────────── */

const TOPO = 0.79;
const Z_R = 0.1;                    // plano da rampa e do voo
const X_SAIDA = 0.805;              // a calha passa 5 mm da borda da bancada
const Y_SAIDA = TOPO + 0.03;        // fundo da calha na saída = altura H do lançamento
const LR = 0.42, HR = 0.28;         // extensão horizontal e altura da curva da rampa
const X0 = X_SAIDA - LR;
const R = 0.0125;                   // raio externo dos três corpos (25 mm de diâmetro)
const L_CIL = 0.025;                // comprimento dos cilindros: cabem na calha de 32 mm
const R_FURO = 0.008;               // raio do furo do cilindro furado
const RHO_ACO = 7850;
// β = I/(m·r²). Rolando sem deslizar, ω = v/r e a energia cinética é ½·m·v²·(1 + β).
// Cilindro com furo: I = ½·m·(r² + rᵢ²), logo β = (1 + rᵢ²/r²)/2.
const CORPOS = {
  esfera: {
    nome: 'esfera maciça', curto: 'esfera', o: 'a esfera', beta: 2 / 5,
    massa: RHO_ACO * (4 / 3) * Math.PI * R ** 3, area: Math.PI * R * R, cd: 0.47, furo: 0,
  },
  cilindro: {
    nome: 'cilindro maciço', curto: 'cilindro', o: 'o cilindro', beta: 1 / 2,
    massa: RHO_ACO * Math.PI * R * R * L_CIL, area: 2 * R * L_CIL, cd: 1.0, furo: 0,
  },
  furado: {
    nome: 'cilindro com furo', curto: 'cil. furado', o: 'o cilindro', beta: (1 + (R_FURO / R) ** 2) / 2,
    massa: RHO_ACO * Math.PI * (R * R - R_FURO * R_FURO) * L_CIL, area: 2 * R * L_CIL, cd: 1.0, furo: R_FURO,
  },
};
const X_PORTA = X_SAIDA - 0.02;
const PAPEL = { x0: X_SAIDA + 0.2, comp: 0.7, larg: 0.3 };
const MU_ROL = 0.003;               // resistência ao rolamento na calha
const H_MIN = 0.03, H_MAX = 0.26;

// fundo da calha: y = Y_SAIDA + HR·(1 − u)², u = (x − X0)/LR; horizontal na saída
const yCalha = (x) => Y_SAIDA + HR * (1 - (x - X0) / LR) ** 2;
const dyCalha = (x) => (-2 * HR * (1 - (x - X0) / LR)) / LR;

/** Centro da esfera apoiada no fundo da calha, no ponto de contato x. */
function centroNaCalha(x, alvo) {
  const d = dyCalha(x), n = Math.hypot(d, 1);
  return alvo.set(x + (-d / n) * R, yCalha(x) + (1 / n) * R, Z_R);
}

// Tabela do comprimento de arco percorrido pelo CENTRO da esfera, em função do ponto
// de contato x. É o centro que obedece à energia: numa calha côncava ele anda mais
// devagar que o ponto de contato (na saída desta rampa, cerca de 4 % mais devagar).
const N = 600;
const tab = { x: new Float64Array(N + 1), s: new Float64Array(N + 1) };
{
  const a = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
  let px = 0, py = 0;
  for (let i = 0; i <= N; i++) {
    const x = X0 + (LR * i) / N;
    tab.x[i] = x;
    centroNaCalha(x, a);
    if (i > 0) tab.s[i] = tab.s[i - 1] + Math.hypot(a.x - px, a.y - py);
    px = a.x; py = a.y;
  }
}
const S_TOTAL = tab.s[N];
function xDeS(s) {
  if (s <= 0) return X0;
  if (s >= S_TOTAL) return X_SAIDA;
  let lo = 0, hi = N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab.s[m] < s) lo = m; else hi = m; }
  const f = (s - tab.s[lo]) / (tab.s[hi] - tab.s[lo]);
  return tab.x[lo] + f * (tab.x[hi] - tab.x[lo]);
}
function sDeX(x) {
  const i = Math.max(0, Math.min(N - 1, Math.floor(((x - X0) / LR) * N)));
  const f = (x - tab.x[i]) / (tab.x[i + 1] - tab.x[i]);
  return tab.s[i] + f * (tab.s[i + 1] - tab.s[i]);
}

/* ───────────────────────── Estado ───────────────────────── */

const est = {
  corpo: 'esfera',
  h: 0.15,
  fase: 'rampa',           // 'rampa' (presa ou rolando), 'voo', 'chao'
  presa: true,
  s: 0, v: 0,              // na rampa
  y: [0, 0, 0, 0],         // no voo e no chão: x, y, vx, vy
  zVoo: Z_R,
  t: 0, vel: 1, pausado: false, modelo: false,
  alvo: null,
};
const corpo = () => CORPOS[est.corpo];
const sDeAltura = (h) => sDeX(X0 + LR * (1 - Math.sqrt(h / HR)));

// fotoporta da saída: mede quanto tempo a esfera bloqueia o feixe
// Um portão por "parede" do corpo: no cilindro furado o feixe passa pelo furo e é cortado
// duas vezes; nos maciços as duas metades se encostam e o resultado é um bloqueio só.
const portoes = [new Portao(X_PORTA), new Portao(X_PORTA)];
const foto = { entrada: null, dt: null };
// último lançamento
const ultimo = { h: null, dt: null, D: null };
const marcas = [];

/* ───────────────────────── Cena ───────────────────────── */

const elCena = document.getElementById('cena');
const cena = criarCena(elCena, {
  alvo: new THREE.Vector3(1.0, 0.5, Z_R),
  camera: new THREE.Vector3(2.0, 1.3, 1.75),
  vistas: {
    lado: { pos: new THREE.Vector3(1.1, 0.6, 2.4), alvo: new THREE.Vector3(1.1, 0.5, Z_R) },
    rampa: { pos: new THREE.Vector3(0.62, 1.12, 0.78), alvo: new THREE.Vector3(0.6, 0.93, Z_R) },
    fotoporta: { pos: new THREE.Vector3(0.9, 0.95, 0.42), alvo: new THREE.Vector3(X_PORTA, Y_SAIDA + 0.01, Z_R) },
    papel: { pos: new THREE.Vector3(1.4, 1.35, 0.75), alvo: new THREE.Vector3(1.38, 0, Z_R) },
  },
  limitesAlvo: { min: new THREE.Vector3(-2, 0.0, -1.5), max: new THREE.Vector3(2.4, 2.2, 2) },
});
const { scene } = cena;
scene.add(P.bancada({ alt: TOPO }));

// Calha: fundo e duas paredes, como fitas que seguem a curva
function fita(a, b) {
  const pos = [];
  const idx = [];
  for (let i = 0; i < a.length; i++) { pos.push(...a[i], ...b[i]); }
  for (let i = 0; i < a.length - 1; i++) {
    const k = 2 * i;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const calha = new THREE.Group();
const matCalha = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide });
{
  const fundoA = [], fundoB = [], parE1 = [], parE2 = [], parD1 = [], parD2 = [];
  for (let i = 0; i <= 120; i++) {
    const x = X0 + (LR * i) / 120, y = yCalha(x);
    fundoA.push([x, y, Z_R - 0.016]); fundoB.push([x, y, Z_R + 0.016]);
    parE1.push([x, y, Z_R - 0.016]); parE2.push([x, y + 0.016, Z_R - 0.016]);
    parD1.push([x, y, Z_R + 0.016]); parD2.push([x, y + 0.016, Z_R + 0.016]);
  }
  for (const [a, b] of [[fundoA, fundoB], [parE1, parE2], [parD1, parD2]]) {
    const m = new THREE.Mesh(fita(a, b), matCalha);
    m.castShadow = true; m.receiveShadow = true;
    calha.add(m);
  }
  // pés da calha
  for (const x of [X0 + 0.01, X0 + 0.12, X0 + 0.25, X_SAIDA - 0.05]) {
    const alt = yCalha(x) - TOPO - 0.002;
    const pe = new THREE.Mesh(new THREE.BoxGeometry(0.012, alt, 0.05), MAT.ferroPintado(0x2b3036));
    pe.position.set(x, TOPO + alt / 2, Z_R);
    pe.castShadow = true;
    calha.add(pe);
  }
  const base = new THREE.Mesh(new THREE.BoxGeometry(LR + 0.03, 0.008, 0.09), MAT.ferroPintado(0x2b3036));
  base.position.set(X0 + LR / 2, TOPO + 0.004, Z_R);
  base.receiveShadow = true;
  calha.add(base);
}
scene.add(calha);

// Régua de alturas atrás da rampa, com o zero na altura da saída
const reguaH = P.escala({ comprimento: 0.3, largura: 0.024, fundo: '#f6f1e3', sobe: true });
reguaH.position.set(X0 - 0.03, Y_SAIDA, Z_R - 0.03);
scene.add(reguaH);
const pinoSoltura = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.004), MAT.plastico(0xc41a12));
scene.add(pinoSoltura);

// O corpo que rola: esfera, cilindro maciço ou cilindro com furo, todos de aço.
// Os cilindros rolam com o eixo atravessado na calha (ao longo de Z).
let esfera = null;
function montarCorpo() {
  if (esfera) {
    scene.remove(esfera);
    esfera.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  const c = corpo();
  if (est.corpo === 'esfera') {
    esfera = new THREE.Mesh(new THREE.SphereGeometry(R, 36, 24), MAT.aco(0xd0d4d8, 0.15));
  } else {
    const forma = new THREE.Shape();
    forma.absarc(0, 0, R, 0, Math.PI * 2, false);
    if (c.furo) {
      const furo = new THREE.Path();
      furo.absarc(0, 0, c.furo, 0, Math.PI * 2, true);
      forma.holes.push(furo);
    }
    const geo = new THREE.ExtrudeGeometry(forma, { depth: L_CIL, bevelEnabled: false, curveSegments: 48 });
    geo.translate(0, 0, -L_CIL / 2);
    esfera = new THREE.Group();
    esfera.add(new THREE.Mesh(geo, MAT.aco(0xc4c9ce, 0.3)));
    // risco escuro na face, para enxergar o giro
    const risco = new THREE.Mesh(new THREE.BoxGeometry(R - c.furo - 0.002, 0.0012, 0.0004), MAT.plastico(0x1d1f22));
    risco.position.set((R + c.furo) / 2, 0, L_CIL / 2 + 0.0003);
    esfera.add(risco);
  }
  esfera.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(esfera);
}
montarCorpo();

// Fotoporta em pórtico sobre a saída
const porta = P.fotoporta({ alturaBracos: 0.08 });
porta.rotation.x = Math.PI; // pórtico: base em cima, feixe ao longo de Z atravessando a calha
porta.position.set(X_PORTA, Y_SAIDA + R, Z_R);
scene.add(porta);
const contador = P.caixaInstrumento({
  larg: 0.18, alt: 0.07, prof: 0.14, cor: 0xd9dcd6, nome: 'FOTOPORTA',
  botoes: [{ id: 'zera', rotulo: 'ZERA', cor: 0xb3261e }],
});
contador.position.set(0.3, TOPO, -0.15);
contador.rotation.y = 0.15;
scene.add(contador);
const cabo = P.cabo(0x1b1d20, 0.0018);
scene.add(cabo);
contador.updateMatrixWorld(true);
cabo.userData.passarPor([
  new THREE.Vector3(X_PORTA, Y_SAIDA + R + 0.06, Z_R - 0.06),
  new THREE.Vector3(X_PORTA - 0.05, TOPO + 0.012, Z_R - 0.12),
  new THREE.Vector3(0.45, TOPO + 0.012, -0.12),
  contador.localToWorld(new THREE.Vector3(0, 0.03, -0.07)),
]);

// Prumo: fio da saída ao chão, com o peso pontudo
const prumo = new THREE.Group();
const fioPrumo = P.fio(0.0005);
fioPrumo.scale.y = Y_SAIDA - 0.03;
prumo.add(fioPrumo);
const peso = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.024, 16), MAT.latao());
peso.rotation.x = Math.PI;
peso.position.y = -(Y_SAIDA - 0.03) - 0.012;
prumo.add(peso);
prumo.position.set(X_SAIDA, Y_SAIDA, Z_R - 0.03);
scene.add(prumo);

// Papel no chão (com as marcas) e trena ao lado
const cvPapel = document.createElement('canvas');
cvPapel.width = 1400; cvPapel.height = 600;
const ctxPapel = cvPapel.getContext('2d');
const texPapel = new THREE.CanvasTexture(cvPapel);
texPapel.colorSpace = THREE.SRGBColorSpace;
texPapel.anisotropy = 8;
function desenharPapel() {
  ctxPapel.fillStyle = '#fbfaf6';
  ctxPapel.fillRect(0, 0, cvPapel.width, cvPapel.height);
  ctxPapel.strokeStyle = 'rgba(0,0,0,0.06)';
  ctxPapel.lineWidth = 2;
  ctxPapel.strokeRect(2, 2, cvPapel.width - 4, cvPapel.height - 4);
  for (const m of marcas) {
    const px = ((m.x - PAPEL.x0) / PAPEL.comp) * cvPapel.width;
    const pz = ((m.z - (Z_R - PAPEL.larg / 2)) / PAPEL.larg) * cvPapel.height;
    if (m.risco) {
      // o cilindro cai deitado e marca uma linha do comprimento dele, atravessada à trajetória
      const meio = (L_CIL / 2 / PAPEL.larg) * cvPapel.height;
      ctxPapel.save();
      ctxPapel.shadowColor = 'rgba(20,22,40,0.7)';
      ctxPapel.shadowBlur = 4;
      ctxPapel.fillStyle = 'rgba(20,22,40,0.85)';
      ctxPapel.fillRect(px - 2.5, pz - meio, 5, 2 * meio);
      ctxPapel.restore();
      continue;
    }
    const g = ctxPapel.createRadialGradient(px, pz, 0, px, pz, 9);
    g.addColorStop(0, 'rgba(20,22,40,0.95)');
    g.addColorStop(0.6, 'rgba(20,22,40,0.6)');
    g.addColorStop(1, 'rgba(20,22,40,0)');
    ctxPapel.fillStyle = g;
    ctxPapel.beginPath(); ctxPapel.arc(px, pz, 9, 0, Math.PI * 2); ctxPapel.fill();
  }
  texPapel.needsUpdate = true;
}
desenharPapel();
const papel = new THREE.Mesh(new THREE.PlaneGeometry(PAPEL.comp, PAPEL.larg), new THREE.MeshStandardMaterial({ map: texPapel, roughness: 0.9 }));
papel.rotation.x = -Math.PI / 2;
papel.position.set(PAPEL.x0 + PAPEL.comp / 2, 0.0015, Z_R);
papel.receiveShadow = true;
scene.add(papel);
const fitas = [PAPEL.x0 + 0.02, PAPEL.x0 + PAPEL.comp - 0.02].map((x) => {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.018), new THREE.MeshStandardMaterial({ color: 0xe8dcb0, roughness: 0.7, transparent: true, opacity: 0.8 }));
  f.rotation.x = -Math.PI / 2;
  f.position.set(x, 0.002, Z_R - PAPEL.larg / 2);
  scene.add(f);
  return f;
});
const trena = P.escala({ comprimento: 1.0, largura: 0.022, horizontal: true, fundo: '#f2c919' });
trena.rotation.x = -Math.PI / 2;
trena.position.set(X_SAIDA, 0.002, Z_R + PAPEL.larg / 2 + 0.004);
scene.add(trena);

// Alvo da previsão
const alvo = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 40), new THREE.MeshBasicMaterial({ color: 0xd9480f }));
alvo.rotation.x = -Math.PI / 2;
alvo.visible = false;
const cruz = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.0015), new THREE.MeshBasicMaterial({ color: 0xd9480f }));
cruz.position.z = 0.0001;
alvo.add(cruz);
scene.add(alvo);

// Trajetória teórica (modelo)
const trajMat = new THREE.LineDashedMaterial({ color: 0xd9480f, dashSize: 0.02, gapSize: 0.012 });
const traj = new THREE.Line(new THREE.BufferGeometry(), trajMat);
scene.add(traj);
const rotV = rotulo('', 'modelo');
scene.add(rotV);

/* ───────────────────────── Física ───────────────────────── */

const passo = new PassoFixo(1 / 4000);
let voo;
function atualizarVoo() {
  // o cilindro voa de lado: mais área exposta e coeficiente de arrasto maior que o da esfera
  const c = corpo();
  voo = derivVoo({ massa: c.massa, k: 0.5 * CONST.rhoAr * c.cd * c.area });
}
atualizarVoo();
const centro = new THREE.Vector3();

function derivRampa(t, [s, v]) {
  const x = xDeS(s), d = dyCalha(x), n = Math.hypot(1, d);
  const sen = -d / n, cos = 1 / n;
  // rolando sem deslizar: a = g·sen φ / (1 + β), menos a resistência ao rolamento
  return [v, (CONST.g * (sen - MU_ROL * cos)) / (1 + corpo().beta)];
}

function xCentro() {
  if (est.fase === 'rampa') return centroNaCalha(xDeS(est.s), centro).x;
  return est.y[0];
}

function passoFisica(h) {
  const t0 = est.t;
  const xa = xCentro();
  if (est.fase === 'rampa' && !est.presa) {
    const [s, v] = rk4(derivRampa, est.t, [est.s, est.v], h);
    est.s = s; est.v = v;
    if (est.s >= S_TOTAL) {
      // sai da calha na horizontal; pequena irregularidade de lançamento a lançamento
      const vx = est.v * (1 + gauss(0, 0.003));
      est.fase = 'voo';
      est.y = [X_SAIDA, Y_SAIDA + R, vx, 0];
      est.zVoo = Z_R + gauss(0, 0.0015);
    }
  } else if (est.fase === 'voo') {
    const y0 = est.y;
    const y1 = rk4(voo, est.t, y0, h);
    if (y1[1] <= R) {
      const f = (y0[1] - R) / (y0[1] - y1[1]);
      const xPouso = y0[0] + f * (y1[0] - y0[0]);
      pousou(xPouso);
      est.y = [xPouso, R, 0.62 * y1[2], 0.32 * Math.abs(y1[3])];
      est.fase = 'chao';
    } else est.y = y1;
  } else if (est.fase === 'chao') {
    // quica baixo e rola até parar
    let [x, y, vx, vy] = est.y;
    vy -= CONST.g * h;
    y += vy * h;
    if (y <= R) { y = R; vy = Math.abs(vy) > 0.25 ? 0.3 * Math.abs(vy) : 0; }
    if (y <= R + 1e-6) vx = Math.max(0, vx - 0.5 * h);
    x += vx * h;
    est.y = [x, y, vx, vy];
  }
  est.t += h;
  const xb = xCentro();
  const ri = corpo().furo;
  [[R, ri], [-ri, -R]].forEach(([a, b], k) => {
    const ev = portoes[k].passo(t0, h, [xa + a, xa + b], [xb + a, xb + b]);
    if (!ev || est.presa) return;
    if (ev.tipo === 'entra') { if (foto.entrada === null) foto.entrada = ev.t; }
    else if (foto.entrada !== null) {
      // o contador mede do início do primeiro bloqueio ao fim do último
      foto.dt = naResolucao(ev.t - foto.entrada + gauss(0, 0.00002), 0.0001);
      ultimo.dt = foto.dt;
    }
  });
}

function pousou(xPouso) {
  const D = xPouso - X_SAIDA;
  ultimo.D = naResolucao(D, 0.001);
  const noPapel = xPouso > PAPEL.x0 && xPouso < PAPEL.x0 + PAPEL.comp;
  if (noPapel) {
    marcas.push({ x: xPouso, z: est.zVoo, risco: est.corpo !== 'esfera' });
    desenharPapel();
  }
  if (est.alvo !== null) {
    const erro = (xPouso - (X_SAIDA + est.alvo)) * 1000;
    const quem = corpo().o.replace(/^./, (l) => l.toUpperCase());
    avisar(noPapel ? `${quem} caiu ${fmt(Math.abs(erro), 0)} mm ${erro >= 0 ? 'depois' : 'antes'} do alvo.` : `${quem} caiu fora do papel.`);
  } else if (!noPapel) avisar(`${corpo().o.replace(/^./, (l) => l.toUpperCase())} caiu fora do papel.`);
  atualizarLeituras();
}

/* ───────────────────────── Interação ───────────────────────── */

const avisar = aviso(elCena);
barraDaCena(cena, est, avisar);

function porNaRampa() {
  est.fase = 'rampa';
  est.presa = true;
  est.s = sDeAltura(est.h);
  est.v = 0;
  portoes.forEach((p) => p.mover(X_PORTA, null));
  foto.entrada = null;
  atualizarUI();
}
function soltar() {
  if (est.fase !== 'rampa') { porNaRampa(); return; }
  if (!est.presa) return;
  est.presa = false;
  foto.dt = null;
  ultimo.h = naResolucao(est.h, 0.001);
  ultimo.dt = null;
  ultimo.D = null;
  ultimo.registrado = false;
  atualizarUI();
  atualizarLeituras();
}
const btSoltar = document.getElementById('bt-soltar');
btSoltar.addEventListener('click', soltar);

criarArraste(cena, {
  alvos: () => [esfera, ...Object.values(contador.userData.botoes)],
  aoClicar(hit) {
    if (hit.object.name === 'zera') { foto.dt = null; return; }
    soltar();
  },
});

/* ───────────────────────── Painel ───────────────────────── */

abas(document.getElementById('painel'));

const ctlAltura = deslizante({
  rotulo: 'Altura de soltura h', min: H_MIN, max: H_MAX, passo: 0.005, valor: est.h, formatar: (v) => fmt(v, 3) + ' m',
  aoMudar(v) { est.h = v; if (!(est.fase === 'rampa' && !est.presa)) porNaRampa(); atualizarLeituras(); },
});
const ctlCorpo = escolha({
  rotulo: 'Corpo que rola (aço, 25 mm de diâmetro)',
  opcoes: Object.entries(CORPOS).map(([v, c]) => ({ valor: v, rotulo: c.nome })),
  valor: est.corpo,
  aoMudar(v) {
    if (est.fase === 'rampa' && !est.presa) { ctlCorpo.definir(est.corpo); avisar(`Espere ${corpo().o} cair.`); return; }
    est.corpo = v;
    montarCorpo();
    atualizarVoo();
    porNaRampa();
    atualizarLeituras();
    desenharGraficos();
  },
});
document.getElementById('ctl-montagem').append(ctlCorpo.el, ctlAltura.el);

document.getElementById('bt-alvo').addEventListener('click', () => {
  const D = lerNumero(document.getElementById('d-prev').value);
  if (!Number.isFinite(D) || D <= 0) { avisar('Digite a distância prevista, em metros.'); return; }
  est.alvo = D;
  alvo.position.set(X_SAIDA + D, 0.003, Z_R);
  alvo.visible = true;
  avisar(`Alvo colocado a ${fmt(D, 3)} m do prumo.`);
});
document.getElementById('bt-tirar-alvo').addEventListener('click', () => { est.alvo = null; alvo.visible = false; });
document.getElementById('bt-papel').addEventListener('click', () => { marcas.length = 0; desenharPapel(); avisar('Papel trocado.'); });

const ctlModelo = chave({
  rotulo: 'Mostrar o modelo (trajetória prevista e velocidade)', valor: false,
  aoMudar(v) { est.modelo = v; document.getElementById('lei-modelo').hidden = !v; desenharGraficos(); },
});
const ctlQualidade = chave({
  rotulo: 'Gráficos em alta qualidade (sombras)', valor: cena.qualidade === 'alta',
  aoMudar(v) { cena.definirQualidade(v ? 'alta' : 'baixa'); },
});
document.getElementById('ctl-simulacao').append(ctlModelo.el, ctlQualidade.el);

const H_LIDO = naResolucao(Y_SAIDA, 0.001);
const DIAM = naResolucao(2 * R * 1000, 0.05) / 1000;
const tQueda = Math.sqrt((2 * H_LIDO) / CONST.g);

function vSaidaModelo(h) {
  // energia do centro: m·g·Δy = ½·m·v²·(1 + β), já que ½·I·ω² = ½·β·m·v², menos o trabalho da
  // resistência ao rolamento, proporcional ao trecho horizontal percorrido na calha.
  // Na soltura a calha é inclinada, e o centro fica r·(1 − cos φ) mais baixo que h + r.
  const x0 = X0 + LR * (1 - Math.sqrt(h / HR));
  const cos0 = 1 / Math.hypot(1, dyCalha(x0));
  const queda = h - R * (1 - cos0);
  const trecho = LR * Math.sqrt(h / HR);
  return Math.sqrt(((2 * CONST.g) / (1 + corpo().beta)) * (queda - MU_ROL * trecho));
}

function atualizarLeituras() {
  document.getElementById('lei-h').textContent = fmt(naResolucao(est.h, 0.001), 3) + ' m';
  document.getElementById('lei-H').textContent = fmt(H_LIDO, 3) + ' m';
  const c = corpo();
  document.getElementById('lei-diam').textContent = fmt(DIAM * 1000, 2) + ' mm' +
    (c.furo ? ` (furo de ${fmt(naResolucao(2 * c.furo * 1000, 0.05), 2)} mm)` : '');
  document.getElementById('lei-massa').textContent = fmt(naResolucao(c.massa * 1000, 0.1), 1) + ' g';
  document.getElementById('lei-dt').textContent = ultimo.dt === null ? '—' : fmt(ultimo.dt, 4) + ' s';
  document.getElementById('lei-D').textContent = ultimo.D === null ? '—' : fmt(ultimo.D, 3) + ' m';
  const v = vSaidaModelo(est.h);
  document.getElementById('lei-vmodelo').textContent = fmt(v, 3) + ' m/s';
  document.getElementById('lei-Dmodelo').textContent = fmt(alcanceHorizontal(v, H_LIDO), 3) + ' m';
  atualizarTrajetoria(v);
}

function atualizarTrajetoria(v) {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = (tQueda * i) / 40;
    pts.push(new THREE.Vector3(X_SAIDA + v * t, Y_SAIDA + R - 0.5 * CONST.g * t * t, Z_R));
  }
  traj.geometry.dispose();
  traj.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  traj.computeLineDistances();
}

function atualizarUI() {
  const o = corpo().o;
  btSoltar.textContent = est.fase === 'rampa' && est.presa ? `Soltar ${o}` : `Pôr ${o} na rampa`;
  ctlAltura.desabilitar(est.fase === 'rampa' && !est.presa);
}

// Tabela
const colunas = [
  { id: 'corpo', titulo: 'Corpo', tituloCsv: 'corpo', texto: true },
  { id: 'h', titulo: 'h (m)', tituloCsv: 'h (m)', casas: 3, editavel: true },
  { id: 'dt', titulo: 't<sub>b</sub> (s)', tituloCsv: 'tb (s)', casas: 4, editavel: true },
  { id: 'v', titulo: 'v (m/s)', tituloCsv: 'v = diametro/tb (m/s)', casas: 3, calc: (l) => DIAM / l.dt },
  { id: 'D', titulo: 'd (m)', tituloCsv: 'd medido (m)', casas: 3, editavel: true },
  { id: 'Dp', titulo: 'd previsto (m)', tituloCsv: 'd previsto (m)', casas: 3, calc: (l) => (DIAM / l.dt) * tQueda },
];
const tabela = tabelaMedidas({ colunas, chaveSalvar: 'exp-lancamento-medidas', aoMudar: () => desenharGraficos() });
document.getElementById('tabela').append(tabela.el);

const grafD = grafico({ eixoX: 'v (m/s)', eixoY: 'd (m)' });
const grafV = grafico({ eixoX: 'h (m)', eixoY: 'v² (m²/s²)' });
document.getElementById('grafico-d').append(grafD.el);
document.getElementById('grafico-v').append(grafV.el);

function desenharGraficos() {
  const dados = tabela.dados().filter((d) => Number.isFinite(d.v));
  const aj = grafD.desenhar({
    pontos: dados.map((d) => [d.v, d.D]),
    ajuste: true,
    teorica: est.modelo ? (x) => x * tQueda : null,
  });
  const el = document.getElementById('ajuste-d');
  if (!aj || dados.length < 2) el.textContent = 'Registre ao menos dois lançamentos de alturas diferentes para ver a reta.';
  else {
    el.innerHTML = `Reta ajustada: d = <b>${fmt(aj.a, 4)}</b> · v ${aj.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(aj.b), 4)}</b>` +
      `<br>A inclinação é o tempo de queda: <b>${fmt(aj.a, 3)} s</b>. Com H = ${fmt(H_LIDO, 3)} m, √(2H/g) = ${fmt(tQueda, 3)} s · R² = ${fmt(aj.r2, 4)}`;
  }
  // v² em função de h: cada corpo tem a sua reta, então só entram os pontos do corpo atual
  const c = corpo();
  const doCorpo = dados.filter((d) => (d.corpo || 'esfera') === c.curto);
  const incl = (2 * CONST.g) / (1 + c.beta);
  document.getElementById('titulo-grafico-v').textContent = `v² em função de h, ${c.nome}`;
  const ajV = grafV.desenhar({
    pontos: doCorpo.map((d) => [d.h, d.v * d.v]),
    ajuste: true,
    teorica: est.modelo ? (x) => incl * x : null,
  });
  const elV = document.getElementById('ajuste-v');
  if (!ajV || doCorpo.length < 2) elV.textContent = `Este gráfico aparece com dois lançamentos ou mais do corpo atual (${c.nome}).`;
  else {
    elV.innerHTML = `Reta ajustada: v² = <b>${fmt(ajV.a, 2)}</b> · h ${ajV.b < 0 ? '−' : '+'} <b>${fmt(Math.abs(ajV.b), 3)}</b>` +
      `<br>Se o corpo deslizasse sem atrito, a inclinação seria 2g = ${fmt(2 * CONST.g, 1)} m/s²; ` +
      `rolando, 2g / (1 + β) = ${fmt(incl, 1)} m/s², com β = ${fmt(c.beta, 3)} (${c.nome}).`;
  }
}
desenharGraficos();
document.getElementById('painel').addEventListener('aba', (e) => { if (e.detail === 'medidas') requestAnimationFrame(desenharGraficos); });

document.getElementById('bt-registrar').addEventListener('click', () => {
  if (ultimo.h === null || ultimo.dt === null) { avisar(`Solte ${corpo().o} primeiro.`); return; }
  if (ultimo.D === null) { avisar(`Espere ${corpo().o} cair.`); return; }
  if (ultimo.registrado) { avisar('Este lançamento já está na tabela.'); return; }
  tabela.adicionar({ corpo: corpo().curto, h: ultimo.h, dt: ultimo.dt, D: ultimo.D });
  ultimo.registrado = true;
  avisar('Lançamento registrado.');
});
document.getElementById('bt-csv').addEventListener('click', () => baixar('lancamento-horizontal.csv', tabela.csv()));
document.getElementById('bt-limpar').addEventListener('click', () => {
  if (confirm('Apagar todas as medidas da tabela?')) tabela.limpar();
});

/* ───────────────────────── Laço ───────────────────────── */

let quadro = 0;
cena.aoQuadro((dt) => {
  passo.avancar(dt * (est.pausado ? 0 : est.vel), passoFisica);
  if (est.fase === 'rampa') esfera.position.copy(centroNaCalha(xDeS(est.s), centro));
  else esfera.position.set(est.y[0], est.y[1], est.zVoo);
  // o corpo rola: gira em torno de Z conforme anda
  esfera.rotation.z = -(esfera.position.x / R);

  const xs = X0 + LR * (1 - Math.sqrt(est.h / HR));
  pinoSoltura.position.set(X0 - 0.03 + 0.012, Y_SAIDA + est.h, Z_R - 0.026);
  pinoSoltura.visible = xs > X0;

  contador.userData.visor.escrever(foto.dt === null ? '0,0000' : fmt(foto.dt, 4), 'BLOQUEIO  t (s)');
  porta.userData.acender(portoes[0].bloqueado || portoes[1].bloqueado);
  if (quadro++ % 6 === 0) {
    document.getElementById('lei-dt').textContent = ultimo.dt === null ? '—' : fmt(ultimo.dt, 4) + ' s';
  }

  traj.visible = rotV.visible = est.modelo;
  porta.userData.feixe.visible = est.modelo;
  if (est.modelo) {
    rotV.position.set(X_SAIDA + 0.04, Y_SAIDA + 0.08, Z_R);
    rotV.userData.html(`v<sub>saída</sub> = ${fmt(vSaidaModelo(est.h), 2)} m/s`);
  }
});

/* ───────────────────────── Início ───────────────────────── */

porNaRampa();
atualizarLeituras();
