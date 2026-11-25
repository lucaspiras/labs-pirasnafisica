// Peças de laboratório modeladas em código. Unidades em metros; cada peça é um
// THREE.Group com a origem num ponto natural de apoio (descrito em cada função).

import * as THREE from 'three';
import { MAT, texturaCanvas } from './materiais.js';

function sombra(obj, projeta = true, recebe = true) {
  obj.traverse((o) => {
    if (o.isMesh) { o.castShadow = projeta; o.receiveShadow = recebe; }
  });
  return obj;
}

function malha(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/* ───────────────────────── Mobiliário ───────────────────────── */

/**
 * Bancada de laboratório. Origem no chão, no centro; o tampo fica em `alt`.
 * `userData.topo` guarda a altura da superfície de trabalho.
 */
export function bancada({ larg = 1.6, prof = 0.8, alt = 0.79, esp = 0.04 } = {}) {
  const g = new THREE.Group();
  const tampo = malha(new THREE.BoxGeometry(larg, esp, prof), MAT.madeira([1, 1]), 0, alt - esp / 2, 0);
  g.add(tampo);
  const estrutura = MAT.ferroPintado(0x5d6670);
  const t = 0.04, hPerna = alt - esp;
  const dx = larg / 2 - 0.08, dz = prof / 2 - 0.06;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(malha(new THREE.BoxGeometry(t, hPerna, t), estrutura, sx * dx, hPerna / 2, sz * dz));
    g.add(malha(new THREE.CylinderGeometry(0.022, 0.024, 0.012, 16), MAT.borracha(), sx * dx, 0.006, sz * dz));
  }
  // travessas
  for (const sz of [-1, 1]) {
    g.add(malha(new THREE.BoxGeometry(2 * dx, 0.03, 0.025), estrutura, 0, hPerna - 0.05, sz * dz));
    g.add(malha(new THREE.BoxGeometry(2 * dx, 0.025, 0.025), estrutura, 0, 0.16, sz * dz));
  }
  for (const sx of [-1, 1]) {
    g.add(malha(new THREE.BoxGeometry(0.025, 0.03, 2 * dz), estrutura, sx * dx, hPerna - 0.05, 0));
  }
  g.userData.topo = alt;
  return sombra(g);
}

/* ───────────────────────── Suportes ───────────────────────── */

/**
 * Suporte universal: base de ferro e haste vertical. Origem no centro da face de
 * baixo da base. A haste fica deslocada para trás da base, como nos suportes reais.
 * `userData.hasteX/hasteZ` dão a posição da haste.
 */
export function suporteUniversal({ altura = 1.0, base = [0.32, 0.2] } = {}) {
  const g = new THREE.Group();
  const [bx, bz] = base;
  const corpo = malha(new THREE.BoxGeometry(bx, 0.022, bz), MAT.ferroPintado(0x2b3036), 0, 0.011, 0);
  const friso = malha(new THREE.BoxGeometry(bx - 0.02, 0.006, bz - 0.02), MAT.ferroPintado(0x353b42), 0, 0.025, 0);
  g.add(corpo, friso);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(malha(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 10), MAT.borracha(), sx * (bx / 2 - 0.02), -0.002, sz * (bz / 2 - 0.02)));
  }
  const hz = -bz / 2 + 0.045;
  const haste = malha(new THREE.CylinderGeometry(0.0065, 0.0065, altura, 20), MAT.acoEscovado(), 0, altura / 2 + 0.02, hz);
  const ponta = malha(new THREE.SphereGeometry(0.0066, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.acoEscovado(), 0, altura + 0.02, hz);
  const rosca = malha(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 16), MAT.aco(0x9aa0a6), 0, 0.034, hz);
  g.add(haste, ponta, rosca);
  g.userData.hasteX = 0;
  g.userData.hasteZ = hz;
  g.userData.altura = altura + 0.02;
  return sombra(g);
}

/** Mufa (conector em cruz) com parafusos borboleta. Origem no centro do bloco. */
export function mufa() {
  const g = new THREE.Group();
  const m = MAT.aco(0x8d9399, 0.4);
  g.add(malha(new THREE.BoxGeometry(0.032, 0.034, 0.032), m));
  for (const [x, z, ry] of [[0.024, 0, 0], [0, 0.024, Math.PI / 2]]) {
    const p = malha(new THREE.CylinderGeometry(0.003, 0.003, 0.018, 8), m, x, 0, z);
    p.rotation.z = Math.PI / 2; p.rotation.y = ry;
    const asa = malha(new THREE.BoxGeometry(0.004, 0.022, 0.006), MAT.plastico(0x1d1f22), x * 1.45, 0, z * 1.45);
    asa.rotation.y = ry;
    g.add(p, asa);
  }
  return sombra(g);
}

/** Barra cilíndrica ao longo de +Z, começando na origem. */
export function barra(comprimento, raio = 0.0055) {
  const b = malha(new THREE.CylinderGeometry(raio, raio, comprimento, 18), MAT.acoEscovado());
  b.rotation.x = Math.PI / 2;
  b.position.z = comprimento / 2;
  const g = new THREE.Group();
  g.add(b);
  return sombra(g);
}

/* ───────────────────────── Corpos ───────────────────────── */

/** Esfera maciça com gancho no topo. Origem no centro da esfera. */
export function esferaComGancho(raio, material = MAT.latao()) {
  const g = new THREE.Group();
  const esf = malha(new THREE.SphereGeometry(raio, 40, 28), material);
  esf.name = 'esfera';
  const olhal = malha(new THREE.TorusGeometry(raio * 0.18 + 0.0012, 0.0009, 8, 20), MAT.aco(), 0, raio + raio * 0.16, 0);
  g.add(esf, olhal);
  return sombra(g);
}

/** Fio de comprimento 1 ao longo de −Y a partir da origem; ajusta-se com scale.y. */
export function fio(raio = 0.0008, material = MAT.fio()) {
  const geo = new THREE.CylinderGeometry(raio, raio, 1, 6, 1, true);
  geo.translate(0, -0.5, 0);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  return m;
}

/* ───────────────────────── Instrumentos ───────────────────────── */

/**
 * Transferidor de acrílico, semicírculo voltado para baixo (0° na vertical).
 * Origem no centro; o plano do transferidor é o plano XY.
 */
export function transferidor(raio = 0.12) {
  const N = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const C = N / 2, R = N / 2 - 4;
  ctx.fillStyle = 'rgba(235,245,250,0.30)';
  ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1d2a3a'; ctx.fillStyle = '#1d2a3a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(C, C, R - 1, 0, Math.PI); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let a = -90; a <= 90; a++) {
    const rad = (a * Math.PI) / 180;
    const sx = Math.sin(rad), sy = Math.cos(rad);
    const len = a % 10 === 0 ? 46 : a % 5 === 0 ? 30 : 18;
    ctx.lineWidth = a % 10 === 0 ? 3 : 1.6;
    ctx.beginPath();
    ctx.moveTo(C + sx * R, C + sy * R);
    ctx.lineTo(C + sx * (R - len), C + sy * (R - len));
    ctx.stroke();
    if (a % 10 === 0) {
      ctx.font = '600 30px "IBM Plex Mono", monospace';
      ctx.fillText(String(Math.abs(a)), C + sx * (R - 76), C + sy * (R - 76));
    }
  }
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(C, C); ctx.lineTo(C, C + R - 50); ctx.stroke();
  ctx.beginPath(); ctx.arc(C, C, 8, 0, Math.PI * 2); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, roughness: 0.15, metalness: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  const geo = new THREE.CircleGeometry(raio, 96, Math.PI, Math.PI);
  return new THREE.Mesh(geo, mat);
}

/**
 * Trena metálica pendurada, com o zero no topo. Origem no zero; a fita desce em −Y.
 * A face graduada aponta para +Z.
 */
export function trena(comprimento = 1.6, largura = 0.019) {
  const W = 128, H = 4096;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c919';
  ctx.fillRect(0, 0, W, H);
  const pxPorMm = H / (comprimento * 1000);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let mm = 0; mm <= comprimento * 1000; mm++) {
    const y = mm * pxPorMm;
    let len = 14, lw = 1;
    if (mm % 10 === 0) { len = 40; lw = 2; } else if (mm % 5 === 0) { len = 24; lw = 1.3; }
    ctx.fillStyle = '#111';
    ctx.fillRect(0, y - lw / 2, len, lw);
    if (mm % 10 === 0 && mm > 0) {
      const cm = mm / 10;
      const dezena = cm % 10 === 0;
      ctx.fillStyle = dezena ? '#c41a12' : '#111';
      ctx.font = `${dezena ? 700 : 600} ${dezena ? 22 : 17}px "IBM Plex Sans", Arial, sans-serif`;
      ctx.fillText(String(cm), W - 6, y);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(largura, comprimento),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.1 }),
  );
  face.position.set(0, -comprimento / 2, 0.0004);
  const costas = malha(new THREE.BoxGeometry(largura, comprimento, 0.0006), MAT.aco(0xd9dcdf, 0.4), 0, -comprimento / 2, 0);
  // gancho de ponta
  const ponta = malha(new THREE.BoxGeometry(largura * 1.05, 0.004, 0.006), MAT.aco(0x8b9095), 0, 0.002, 0.003);
  g.add(costas, face, ponta);
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  return g;
}

/**
 * Visor de cristal líquido desenhado em canvas. Devolve a malha e uma função
 * `escrever(linhaPrincipal, linhaPequena)` que só redesenha quando o texto muda.
 */
export function visor({ larg = 0.08, alt = 0.03, px = 512, cor = '#b8d6a0', tinta = '#16200f' } = {}) {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round((px * alt) / larg);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), mat);
  let ultimo = '';
  function escrever(principal, pequena = '') {
    const chave = principal + '|' + pequena;
    if (chave === ultimo) return;
    ultimo = chave;
    const W = c.width, H = c.height;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, cor); grad.addColorStop(1, shade(cor, -0.12));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = tinta;
    ctx.textBaseline = 'middle';
    if (pequena) {
      ctx.textAlign = 'left';
      ctx.font = `500 ${Math.round(H * 0.2)}px "IBM Plex Mono", monospace`;
      ctx.globalAlpha = 0.75;
      ctx.fillText(pequena, W * 0.05, H * 0.2);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'right';
    ctx.font = `600 ${Math.round(H * (pequena ? 0.5 : 0.62))}px "IBM Plex Mono", monospace`;
    ctx.fillText(principal, W * 0.95, pequena ? H * 0.62 : H * 0.53);
    tex.needsUpdate = true;
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { const u = ultimo.split('|'); ultimo = ''; escrever(u[0], u[1]); });
  }
  return { malha: m, escrever };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + f))));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Etiqueta impressa (texto escuro sobre fundo claro ou o contrário), plana. */
export function etiqueta(texto, { larg = 0.06, alt = 0.012, fundo = '#1f2327', tinta = '#e8e8e8', peso = 600 } = {}) {
  const px = 512;
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round((px * alt) / larg);
  const ctx = c.getContext('2d');
  const desenhar = () => {
    ctx.fillStyle = fundo; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = tinta; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${peso} ${Math.round(c.height * 0.62)}px "IBM Plex Sans", Arial, sans-serif`;
    ctx.fillText(texto, c.width / 2, c.height / 2 + 1);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  desenhar();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(desenhar);
  return new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
}

/** Botão redondo de painel. Origem na base; cresce em +Z (frente do painel). */
function botaoPainel(raio, cor) {
  const b = malha(new THREE.CylinderGeometry(raio, raio * 1.05, 0.006, 20), MAT.plastico(cor, 0.35));
  b.rotation.x = Math.PI / 2;
  b.position.z = 0.003;
  return b;
}

/**
 * Caixa de instrumento de mesa com painel frontal inclinado, visor e botões.
 * Origem no centro da base. O visor e os botões ficam em `userData`.
 */
export function caixaInstrumento({
  larg = 0.2, alt = 0.075, prof = 0.15, cor = 0xd9dcd6, nome = '', visorLarg = 0.12, visorAlt = 0.035,
  botoes = [], corVisor,
} = {}) {
  const g = new THREE.Group();
  const corpoMat = MAT.plastico(cor, 0.55);
  // corpo em cunha: perfil trapezoidal extrudado
  const perfil = new THREE.Shape();
  perfil.moveTo(-prof / 2, 0);
  perfil.lineTo(prof / 2, 0);
  perfil.lineTo(prof / 2, alt * 0.55);
  perfil.lineTo(prof / 2 - 0.035, alt);
  perfil.lineTo(-prof / 2, alt);
  perfil.lineTo(-prof / 2, 0);
  const geo = new THREE.ExtrudeGeometry(perfil, { depth: larg, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
  geo.translate(0, 0, -larg / 2);
  const corpo = new THREE.Mesh(geo, corpoMat);
  corpo.rotation.y = -Math.PI / 2; // frente (x+) do perfil passa a apontar para +Z
  g.add(corpo);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(malha(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 10), MAT.borracha(), sx * (larg / 2 - 0.015), -0.002, sz * (prof / 2 - 0.015)));
  }
  // painel frontal inclinado: a face entre (prof/2, 0.55 alt) e (prof/2 − 0.035, alt)
  const dy = alt * 0.45, dz = 0.035;
  const inclinacao = Math.atan2(dz, dy);
  const painel = new THREE.Group();
  painel.position.set(0, alt * 0.55 + dy / 2, prof / 2 - dz / 2);
  painel.rotation.x = -inclinacao;
  // moldura do visor
  const moldura = malha(new THREE.BoxGeometry(visorLarg + 0.008, visorAlt + 0.008, 0.002), MAT.plastico(0x15171a), -larg * 0.12, 0, 0.0032);
  const v = visor({ larg: visorLarg, alt: visorAlt, cor: corVisor });
  v.malha.position.set(-larg * 0.12, 0, 0.0044);
  painel.add(moldura, v.malha);
  // frente vertical: nome e botões
  const frente = new THREE.Group();
  frente.position.set(0, alt * 0.275, prof / 2 + 0.003);
  if (nome) {
    const et = etiqueta(nome, { larg: 0.07, alt: 0.012, fundo: '#' + cor.toString(16).padStart(6, '0'), tinta: '#2a2d31' });
    et.position.set(-larg * 0.28, 0, 0);
    frente.add(et);
  }
  const malhasBotoes = {};
  botoes.forEach((b, i) => {
    const bt = botaoPainel(0.0075, b.cor || 0x30343a);
    bt.position.x = larg * 0.08 + i * 0.026;
    bt.name = b.id;
    malhasBotoes[b.id] = bt;
    frente.add(bt);
    if (b.rotulo) {
      const et = etiqueta(b.rotulo, { larg: 0.024, alt: 0.006, fundo: '#' + cor.toString(16).padStart(6, '0'), tinta: '#3a3d41', peso: 500 });
      et.position.set(bt.position.x, 0.0135, 0);
      frente.add(et);
    }
  });
  g.add(painel, frente);
  g.userData.visor = v;
  g.userData.botoes = malhasBotoes;
  return sombra(g);
}

/**
 * Fotoporta em U, com emissor e receptor. Origem no centro do feixe; o feixe corre
 * ao longo de Z, e o objeto que passa cruza o plano X = 0.
 * `userData.led` acende quando o feixe está interrompido.
 */
export function fotoporta({ vao = 0.11, alturaBracos = 0.11, abaixoDoFeixe = 0.06 } = {}) {
  const g = new THREE.Group();
  const corpo = MAT.plastico(0x1f2429, 0.45);
  const base = malha(new THREE.BoxGeometry(0.025, 0.018, vao + 0.03), corpo, 0, -abaixoDoFeixe, 0);
  g.add(base);
  for (const sz of [-1, 1]) {
    const braco = malha(new THREE.BoxGeometry(0.025, alturaBracos, 0.015), corpo, 0, -abaixoDoFeixe + alturaBracos / 2, sz * (vao / 2 + 0.0075));
    const lente = malha(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 12), MAT.plastico(0x3c0d0d, 0.2), 0, 0, sz * (vao / 2 - 0.0005));
    lente.rotation.x = Math.PI / 2;
    g.add(braco, lente);
  }
  const ledMatOn = MAT.emissivo(0xff3020, 2.5);
  const ledMatOff = MAT.plastico(0x4a1410, 0.3);
  const led = malha(new THREE.SphereGeometry(0.0028, 10, 8), ledMatOff, 0.0128, -abaixoDoFeixe + alturaBracos - 0.012, vao / 2 + 0.0075);
  g.add(led);
  // feixe infravermelho, desenhado bem tênue (na vida real ele é invisível)
  const feixe = malha(new THREE.CylinderGeometry(0.0006, 0.0006, vao, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.35, depthWrite: false }));
  feixe.rotation.x = Math.PI / 2;
  feixe.visible = false;
  g.add(feixe);
  g.userData.acender = (on) => { led.material = on ? ledMatOn : ledMatOff; };
  g.userData.feixe = feixe;
  sombra(g);
  feixe.castShadow = false;
  return g;
}

/**
 * Pedestal de chão com tripé e haste telescópica. Origem no chão; o topo vai até
 * `altura` e é ajustável com definirAltura().
 */
export function pedestal(altura = 1.0) {
  const g = new THREE.Group();
  const pe = MAT.ferroPintado(0x2b3036);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    const perna = malha(new THREE.BoxGeometry(0.16, 0.012, 0.02), pe, Math.cos(a) * 0.08, 0.012, Math.sin(a) * 0.08);
    perna.rotation.y = -a;
    g.add(perna);
    g.add(malha(new THREE.CylinderGeometry(0.01, 0.01, 0.006, 10), MAT.borracha(), Math.cos(a) * 0.155, 0.003, Math.sin(a) * 0.155));
  }
  g.add(malha(new THREE.CylinderGeometry(0.02, 0.024, 0.04, 16), pe, 0, 0.03, 0));
  const tubo = malha(new THREE.CylinderGeometry(0.009, 0.009, 1, 16), MAT.acoEscovado());
  const interno = malha(new THREE.CylinderGeometry(0.0065, 0.0065, 1, 16), MAT.acoEscovado(0xd4d7da));
  const trava = malha(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 16), MAT.plastico(0x1d1f22));
  g.add(tubo, interno, trava);
  function definirAltura(h) {
    const h1 = Math.max(0.1, Math.min(h * 0.55, 0.75));
    tubo.scale.y = h1; tubo.position.y = 0.05 + h1 / 2;
    trava.position.y = 0.05 + h1;
    const h2 = Math.max(0.01, h - 0.05 - h1);
    interno.scale.y = h2 + 0.05; interno.position.y = 0.05 + h1 + (h2 - 0.05) / 2;
  }
  definirAltura(altura);
  g.userData.definirAltura = definirAltura;
  return sombra(g);
}

/* ───────────────────────── Escalas ───────────────────────── */

/**
 * Escala milimetrada impressa (régua, trilho graduado). Devolve uma malha plana com a
 * face em +Z e a origem na marca do zero, sobre a borda das marcas.
 * Vertical: o zero fica em cima e a escala desce em −Y; as marcas saem da borda
 * esquerda e a régua se estende em +X. Horizontal: o zero fica à esquerda, a escala
 * corre em +X, as marcas descem da borda de cima e a régua se estende em −Y.
 * `inicio` é o valor (m) da primeira marca, para escalas que não começam no zero.
 * `sobe` (só vertical): o zero fica embaixo, na origem, e a escala cresce em +Y.
 */
export function escala({
  comprimento, largura = 0.02, horizontal = false, inicio = 0, sobe = false,
  fundo = '#f4efe2', tinta = '#151515', destaque = '#c41a12',
} = {}) {
  const mm = Math.round(comprimento * 1000);
  const pxMm = Math.min(3, 4096 / mm);
  const L = Math.round(mm * pxMm), W = 128;
  const c = document.createElement('canvas');
  c.width = horizontal ? L : W;
  c.height = horizontal ? W : L;
  const ctx = c.getContext('2d');
  const desenhar = () => {
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, c.width, c.height);
    const mm0 = Math.round(inicio * 1000);
    for (let i = 0; i <= mm; i++) {
      const v = mm0 + i;
      const pos = !horizontal && sobe ? L - i * pxMm : i * pxMm;
      let len = 22, lw = 1;
      if (v % 10 === 0) { len = 58; lw = 2.2; } else if (v % 5 === 0) { len = 36; lw = 1.4; }
      ctx.fillStyle = tinta;
      if (horizontal) ctx.fillRect(pos - lw / 2, 0, lw, len);
      else ctx.fillRect(0, pos - lw / 2, len, lw);
      if (v % 10 === 0) {
        const cm = v / 10;
        const dezena = cm % 10 === 0;
        ctx.fillStyle = dezena ? destaque : tinta;
        ctx.font = `${dezena ? 700 : 600} ${dezena ? 30 : 24}px "IBM Plex Sans", Arial, sans-serif`;
        if (horizontal) {
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(String(cm), Math.min(Math.max(pos, 14), L - 14), W - 8);
        } else {
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(String(cm), W - 8, Math.min(Math.max(pos, 12), L - 12));
        }
      }
    }
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  desenhar();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(desenhar);
  const geo = horizontal ? new THREE.PlaneGeometry(comprimento, largura) : new THREE.PlaneGeometry(largura, comprimento);
  if (horizontal) geo.translate(comprimento / 2, -largura / 2, 0);
  else geo.translate(largura / 2, sobe ? comprimento / 2 : -comprimento / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

/* ───────────────────────── Plano inclinado ───────────────────────── */

/**
 * Trilho de alumínio com guias laterais e escala na face da frente. Origem no início
 * do trilho, no centro da superfície de rolamento; o trilho corre em +X.
 */
export function trilho({ comp = 1.2, larg = 0.09 } = {}) {
  const g = new THREE.Group();
  const al = MAT.acoEscovado(0xcfd3d6);
  g.add(malha(new THREE.BoxGeometry(comp, 0.018, larg), al, comp / 2, -0.009, 0));
  for (const sz of [-1, 1]) {
    g.add(malha(new THREE.BoxGeometry(comp, 0.012, 0.004), al, comp / 2, 0.006, sz * (larg / 2 - 0.002)));
  }
  const esc = escala({ comprimento: comp, largura: 0.016, horizontal: true, fundo: '#e9ecee' });
  esc.position.set(0, -0.001, larg / 2 + 0.0005);
  g.add(esc);
  // batente de borracha no fim
  g.add(malha(new THREE.BoxGeometry(0.02, 0.03, larg - 0.01), MAT.borracha(0x2a2a2a), comp + 0.01, 0.012, 0));
  return sombra(g);
}

/**
 * Carrinho de quatro rodas com bandeira para a fotoporta. Origem no centro do
 * carrinho, sobre a superfície de rolamento. Anda em +X. `userData.frente` é a
 * posição da borda dianteira da bandeira, medida a partir da origem.
 * `userData.definirCarga(n)` mostra n blocos de massa adicional.
 */
export function carrinho({ comp = 0.16, larg = 0.07, corBandeira = 0x16181b } = {}) {
  const g = new THREE.Group();
  const r = 0.012;
  const corpo = malha(new THREE.BoxGeometry(comp, 0.026, larg), MAT.plastico(0x2f6fb0, 0.35), 0, r + 0.013, 0);
  g.add(corpo);
  const rodas = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const roda = malha(new THREE.CylinderGeometry(r, r, 0.008, 20), MAT.borracha(0x1b1b1b), sx * (comp / 2 - 0.025), r, sz * (larg / 2 - 0.006));
    roda.rotation.x = Math.PI / 2;
    const cubo = malha(new THREE.CylinderGeometry(0.004, 0.004, 0.0085, 10), MAT.aco(), 0, 0, 0);
    roda.add(cubo);
    rodas.push(roda);
    g.add(roda);
  }
  // bandeira: placa fina vertical, alinhada com o eixo do trilho
  const alturaBand = 0.05, larguraBand = 0.05;
  const xBand = -comp / 2 + 0.03;
  const band = malha(new THREE.BoxGeometry(larguraBand, alturaBand, 0.0015), MAT.plastico(corBandeira, 0.6),
    xBand + larguraBand / 2, r + 0.026 + alturaBand / 2, 0);
  g.add(band);
  // blocos de carga
  const blocos = [];
  for (let i = 0; i < 2; i++) {
    const b = malha(new THREE.BoxGeometry(0.035, 0.018, 0.05), MAT.aco(0x8f969c, 0.45), 0.02 + i * 0.04, r + 0.026 + 0.009, 0);
    b.visible = false;
    blocos.push(b);
    g.add(b);
  }
  g.userData.frente = xBand + larguraBand;
  g.userData.topoBandeira = r + 0.026 + alturaBand;
  g.userData.alturaCorpo = r + 0.026;
  g.userData.rodas = rodas;
  g.userData.raioRoda = r;
  g.userData.definirCarga = (n) => blocos.forEach((b, i) => { b.visible = i < n; });
  return sombra(g);
}

/** Eletroímã de retenção: carcaça vermelha e face polar. Origem no centro da face polar, que aponta em −Y. */
export function eletroima() {
  const g = new THREE.Group();
  g.add(malha(new THREE.CylinderGeometry(0.016, 0.016, 0.034, 24), MAT.plastico(0xa3241c, 0.4), 0, 0.017, 0));
  g.add(malha(new THREE.CylinderGeometry(0.0075, 0.0075, 0.003, 20), MAT.aco(0x6d737a, 0.3), 0, -0.0005, 0));
  g.add(malha(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 12), MAT.aco(), 0, 0.044, 0));
  return sombra(g);
}

/* ───────────────────────── Trilho de ar ───────────────────────── */

function texturaFuros() {
  return texturaCanvas('furos', 256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#c9cdd1'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b2f33';
    for (let i = 0; i < 4; i++) {
      for (const y of [h * 0.3, h * 0.7]) {
        ctx.beginPath(); ctx.arc((i + 0.5) * (w / 4) + (y > h / 2 ? w / 8 : 0) - w / 16, y, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
}

/**
 * Trilho de ar: perfil em V invertido furado, sobre pés. Origem no início do trilho,
 * na aresta de cima; corre em +X. `userData.meia` é a meia largura da face inclinada.
 */
export function trilhoDeAr({ comp = 2.0, lado = 0.05 } = {}) {
  const g = new THREE.Group();
  const furos = texturaFuros().clone();
  furos.needsUpdate = true;
  furos.repeat.set(comp / 0.05, 1);
  const face = new THREE.MeshStandardMaterial({ map: furos, color: 0xffffff, roughness: 0.35, metalness: 0.7 });
  for (const sz of [-1, 1]) {
    const p = malha(new THREE.PlaneGeometry(comp, lado), face, comp / 2, -lado * Math.SQRT1_2 / 2, sz * lado * Math.SQRT1_2 / 2);
    p.rotation.x = sz > 0 ? -Math.PI / 4 : -3 * Math.PI / 4; // normal para cima e para fora
    g.add(p);
  }
  const h = lado * Math.SQRT1_2;
  const al = MAT.acoEscovado(0xc4c9cd);
  g.add(malha(new THREE.BoxGeometry(comp, 0.03, 2 * h), al, comp / 2, -h - 0.015, 0));
  // tampas e para-choques elásticos nas pontas
  for (const x of [-0.01, comp + 0.01]) {
    g.add(malha(new THREE.BoxGeometry(0.02, h + 0.05, 2 * h + 0.01), MAT.plastico(0x2a2e33), x, -h / 2 - 0.01, 0));
    const elastico = malha(new THREE.BoxGeometry(0.002, 0.004, 2 * h - 0.01), MAT.borracha(0x8b2a1a), x + (x < 0 ? 0.03 : -0.03), 0.02, 0);
    g.add(elastico);
    for (const sz of [-1, 1]) g.add(malha(new THREE.CylinderGeometry(0.002, 0.002, 0.045, 8), MAT.aco(), x + (x < 0 ? 0.03 : -0.03), 0.0, sz * (h - 0.005)));
  }
  // pés com parafuso de nível
  for (const x of [0.15, comp - 0.15]) {
    g.add(malha(new THREE.BoxGeometry(0.05, 0.06, 0.16), MAT.ferroPintado(0x2b3036), x, -h - 0.06, 0));
  }
  // escala na lateral da base
  const esc = escala({ comprimento: comp, largura: 0.016, horizontal: true, fundo: '#e9ecee' });
  esc.position.set(0, -h - 0.0015, h + 0.0005);
  g.add(esc);
  g.userData.meia = h;
  g.userData.alturaBase = h + 0.09; // da aresta até o tampo da bancada
  return sombra(g);
}

/**
 * Planador do trilho de ar: sela em V invertido com bandeira e para-choque.
 * Origem no centro, na aresta do trilho. `userData.definirParaChoque('elastico'|'inelastico')`
 * troca a ponta; `userData.definirCarga(n)` mostra n pares de massas laterais.
 */
export function planador({ comp = 0.2, cor = 0x2f6fb0, bandeira = 0.05, frente = 1 } = {}) {
  const g = new THREE.Group();
  const lado = 0.055, esp = 0.004;
  const mat = MAT.plastico(cor, 0.35);
  const hg = lado * Math.SQRT1_2, folga = (esp / 2 + 0.001) * Math.SQRT1_2;
  for (const sz of [-1, 1]) {
    const p = malha(new THREE.BoxGeometry(comp, esp, lado), mat, 0, -hg / 2 + folga, sz * (hg / 2 + folga));
    p.rotation.x = sz * Math.PI / 4;
    g.add(p);
  }
  g.add(malha(new THREE.BoxGeometry(comp, 0.006, 0.012), mat, 0, 0.004, 0));
  const band = malha(new THREE.BoxGeometry(bandeira, 0.045, 0.0015), MAT.plastico(0x16181b, 0.6), 0, 0.03, 0);
  g.add(band);
  // para-choques: lâmina elástica ou almofada de velcro, nas duas pontas
  const elasticos = [], velcros = [];
  for (const sx of [-1, 1]) {
    const lam = malha(new THREE.TorusGeometry(0.014, 0.0008, 6, 20, Math.PI), MAT.aco(0xb9bec4, 0.3), sx * (comp / 2), 0.006, 0);
    lam.rotation.z = -sx * Math.PI / 2; // meio arco voltado para fora (gira primeiro em Z)
    lam.rotation.x = Math.PI / 2;       // depois deita no plano horizontal
    const vel = malha(new THREE.BoxGeometry(0.008, 0.022, 0.03), MAT.borracha(0x3b3f45), sx * (comp / 2 + 0.004), 0.008, 0);
    elasticos.push(lam); velcros.push(vel);
    g.add(lam, vel);
  }
  // massas laterais em pinos
  const massas = [];
  for (let i = 0; i < 2; i++) for (const sz of [-1, 1]) {
    // disco deitado sobre a placa inclinada, com o eixo na normal da placa
    const m = malha(new THREE.CylinderGeometry(0.012, 0.012, 0.009, 18), MAT.latao(), -0.05 + i * 0.1, -0.014, sz * 0.027);
    m.rotation.x = sz * Math.PI / 4;
    m.userData.par = i;
    m.visible = false;
    massas.push(m);
    g.add(m);
  }
  g.userData.definirParaChoque = (tipo) => {
    elasticos.forEach((e) => { e.visible = tipo === 'elastico'; });
    velcros.forEach((v) => { v.visible = tipo !== 'elastico'; });
  };
  g.userData.definirCarga = (n) => massas.forEach((m) => { m.visible = m.userData.par < n; });
  g.userData.definirParaChoque('elastico');
  g.userData.meioComp = comp / 2;
  g.userData.meiaBandeira = bandeira / 2;
  return sombra(g);
}

/* ───────────────────────── Molas e massas ───────────────────────── */

class Helice extends THREE.Curve {
  constructor(raio, comprimento, espiras, y0) {
    super();
    this.raio = raio; this.comprimento = comprimento; this.espiras = espiras; this.y0 = y0;
  }
  getPoint(u, alvo = new THREE.Vector3()) {
    const a = u * this.espiras * Math.PI * 2;
    return alvo.set(this.raio * Math.cos(a), this.y0 - u * this.comprimento, this.raio * Math.sin(a));
  }
}

/**
 * Mola helicoidal de tração com ganchos. Origem na ponta do gancho de cima; a mola
 * pende em −Y. `userData.definir(comprimentoTotal)` redesenha a hélice (o total vai da
 * ponta de um gancho à ponta do outro). `userData.ganchos` é o que os dois ganchos somam.
 */
export function mola({ raio = 0.009, raioFio = 0.0007, espiras = 26, cor = 0x9aa3ab } = {}) {
  const g = new THREE.Group();
  const mat = MAT.aco(cor, 0.3);
  const gancho = raio * 1.5;
  const corpo = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  corpo.castShadow = true;
  const gSup = malha(new THREE.TorusGeometry(raio * 0.7, raioFio, 6, 18), mat, 0, -raio * 0.7, 0);
  const gInf = malha(new THREE.TorusGeometry(raio * 0.7, raioFio, 6, 18), mat, 0, 0, 0);
  g.add(corpo, gSup, gInf);
  let atual = -1;
  function definir(total) {
    const L = Math.max(espiras * 2 * raioFio, total - 2 * gancho);
    if (Math.abs(L - atual) < 0.0003) return;
    atual = L;
    corpo.geometry.dispose();
    corpo.geometry = new THREE.TubeGeometry(new Helice(raio, L, espiras, -gancho), espiras * 14, raioFio, 5, false);
    gInf.position.y = -gancho - L - raio * 0.8;
  }
  g.userData.definir = definir;
  g.userData.ganchos = 2 * gancho;
  g.userData.fechada = espiras * 2 * raioFio + 2 * gancho;
  definir(g.userData.fechada);
  return g;
}

/**
 * Porta-pesos: gancho, haste e prato onde os discos se empilham. Origem na ponta do
 * gancho; pende em −Y. `userData.prato` é a distância da origem até a face de cima do prato.
 */
export function portaPesos() {
  const g = new THREE.Group();
  const aco = MAT.aco(0xa9afb5, 0.35);
  g.add(malha(new THREE.TorusGeometry(0.006, 0.001, 6, 16), aco, 0, -0.006, 0));
  g.add(malha(new THREE.CylinderGeometry(0.0022, 0.0022, 0.085, 10), aco, 0, -0.0545, 0));
  g.add(malha(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 28), MAT.ferroPintado(0x3a4048), 0, -0.099, 0));
  g.userData.prato = 0.097;
  return sombra(g);
}

/** Disco de massa aferida com fenda, de 50 g. Origem no centro da face de baixo. */
export function discoMassa({ espessura = 0.0042 } = {}) {
  const forma = new THREE.Shape();
  forma.absarc(0, 0, 0.022, 0.12, Math.PI * 2 - 0.12, false);
  forma.lineTo(0.0025, -0.0026);
  forma.lineTo(0.0025, 0.0026);
  forma.closePath();
  const geo = new THREE.ExtrudeGeometry(forma, { depth: espessura, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 1, curveSegments: 32 });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, MAT.latao());
  m.castShadow = m.receiveShadow = true;
  return m;
}

/**
 * Roldana de alumínio com canal, eixo e garfo. Origem no centro da roda; a roda gira
 * em torno de Z. `userData.roda` é a parte que gira.
 */
export function roldana(raio = 0.05) {
  const g = new THREE.Group();
  const perfil = [
    [0.006, -0.006], [raio, -0.006], [raio, -0.0035], [raio - 0.004, -0.001],
    [raio - 0.004, 0.001], [raio, 0.0035], [raio, 0.006], [0.006, 0.006],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(perfil, 48);
  geo.rotateX(Math.PI / 2);
  const roda = new THREE.Group();
  // alumínio anodizado fosco; dupla face porque o perfil do torno vira algumas faces do avesso
  const al = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.45, metalness: 0.55, side: THREE.DoubleSide });
  roda.add(new THREE.Mesh(geo, al));
  // raio pintado, para enxergar a rotação
  roda.add(malha(new THREE.BoxGeometry(raio * 0.8, 0.004, 0.0004), MAT.plastico(0xb3261e), raio * 0.45, 0, 0.0063));
  g.add(roda);
  const eixo = malha(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 10), MAT.aco());
  eixo.rotation.x = Math.PI / 2;
  g.add(eixo);
  for (const sz of [-1, 1]) {
    g.add(malha(new THREE.BoxGeometry(0.012, 0.03, 0.003), MAT.aco(0x8d9399, 0.4), 0, 0.012, sz * 0.012));
  }
  g.add(malha(new THREE.BoxGeometry(0.012, 0.006, 0.027), MAT.aco(0x8d9399, 0.4), 0, 0.03, 0));
  g.userData.roda = roda;
  return sombra(g);
}

/** Cabo flexível entre dois pontos, com barriga para baixo. */
export function cabo(cor = 0x202326, raio = 0.0022) {
  const mat = MAT.plastico(cor, 0.5);
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  m.castShadow = true;
  m.userData.ligar = (a, b, barriga = 0.15, chao = null) => {
    const pts = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const p = new THREE.Vector3().lerpVectors(a, b, s);
      p.y -= barriga * 4 * s * (1 - s);
      if (chao !== null && p.y < chao + raio) p.y = chao + raio;
      pts.push(p);
    }
    m.userData.passarPor(pts);
  };
  /** Cabo que passa por uma lista de pontos (curva suave entre eles). */
  m.userData.passarPor = (pts) => {
    const curva = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    m.geometry.dispose();
    m.geometry = new THREE.TubeGeometry(curva, 96, raio, 8, false);
  };
  return m;
}
