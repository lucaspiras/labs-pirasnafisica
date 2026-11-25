// Cena comum a todos os experimentos: renderer, luz, sombra, sala, câmera orbital,
// vistas prontas, qualidade e tema. Cada experimento só acrescenta a sua montagem.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { MAT } from './materiais.js';

const CORES_TEMA = {
  claro:  { fundo: 0xdfe3e6, parede: 0xe9e6df, piso: 0xbfc4c8, luz: 1.0 },
  escuro: { fundo: 0x1b2026, parede: 0x3a3f46, piso: 0x4a5058, luz: 0.75 },
};

function temaAtual() {
  return document.documentElement.hasAttribute('data-theme') ? 'escuro' : 'claro';
}

function qualidadeInicial() {
  try {
    const q = localStorage.getItem('exp-qualidade');
    if (q === 'alta' || q === 'baixa') return q;
  } catch (e) {}
  const fraco = (navigator.hardwareConcurrency || 4) <= 4 || matchMedia('(pointer: coarse)').matches;
  return fraco ? 'baixa' : 'alta';
}

/**
 * Cria a cena dentro de `container`.
 * @param {HTMLElement} container
 * @param {object} op
 * @param {THREE.Vector3} op.alvo           ponto para onde a câmera olha no início
 * @param {THREE.Vector3} op.camera         posição inicial da câmera
 * @param {Object<string,{pos:THREE.Vector3, alvo:THREE.Vector3}>} [op.vistas] vistas prontas extras
 * @param {{min:THREE.Vector3, max:THREE.Vector3}} [op.limitesAlvo] caixa em que o alvo pode andar
 */
export function criarCena(container, op) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const rotulos = new CSS2DRenderer();
  rotulos.domElement.className = 'exp-rotulos';
  container.appendChild(rotulos.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 60);
  camera.position.copy(op.camera);

  // Reflexos: um ambiente de sala genérico, pré-filtrado uma vez.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  // Luzes: céu/chão suave + uma luz principal que projeta sombra.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.9);
  scene.add(hemi);
  const sol = new THREE.DirectionalLight(0xfff6ea, 2.2);
  sol.position.set(2.5, 5, 3.2);
  sol.target.position.set(0, 0.8, 0.2);
  sol.castShadow = true;
  const sc = sol.shadow.camera;
  sc.left = -2.4; sc.right = 2.4; sc.top = 2.6; sc.bottom = -2.2; sc.near = 1; sc.far = 12;
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.015;
  scene.add(sol, sol.target);

  // Sala: piso e duas paredes.
  const sala = new THREE.Group();
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), MAT.piso());
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  const paredeFundo = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), MAT.parede());
  paredeFundo.position.set(0, 2, -2.6);
  paredeFundo.receiveShadow = true;
  const paredeLado = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), MAT.parede());
  paredeLado.position.set(-3.6, 2, 0);
  paredeLado.rotation.y = Math.PI / 2;
  paredeLado.receiveShadow = true;
  // rodapé
  const rodape = new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 0.02), MAT.plastico(0x5b6168));
  rodape.position.set(0, 0.05, -2.59);
  sala.add(piso, paredeFundo, paredeLado, rodape);
  scene.add(sala);

  // Câmera orbital.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(op.alvo);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.35;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI * 0.495; // não passa para baixo do piso
  controls.screenSpacePanning = true;
  controls.update();

  const limites = op.limitesAlvo || {
    min: new THREE.Vector3(-2, 0.1, -1.5),
    max: new THREE.Vector3(2, 2.2, 2),
  };
  controls.addEventListener('change', () => {
    controls.target.clamp(limites.min, limites.max);
    if (camera.position.y < 0.06) camera.position.y = 0.06;
  });

  // Vistas prontas, com transição suave.
  const vistas = {
    inicial: { pos: op.camera.clone(), alvo: op.alvo.clone() },
    ...(op.vistas || {}),
  };
  let transicao = null;
  function irPara(nome) {
    const v = vistas[nome];
    if (!v) return;
    transicao = {
      t: 0,
      p0: camera.position.clone(), a0: controls.target.clone(),
      p1: v.pos.clone(), a1: v.alvo.clone(),
    };
  }

  // Tema: cores da sala acompanham o claro/escuro do site.
  function aplicarTema() {
    const c = CORES_TEMA[temaAtual()];
    scene.background = new THREE.Color(c.fundo);
    paredeFundo.material.color.setHex(c.parede);
    paredeLado.material.color.setHex(c.parede);
    piso.material.color.setHex(c.piso);
    hemi.intensity = 0.9 * c.luz;
    sol.intensity = 2.2 * c.luz;
  }
  aplicarTema();
  new MutationObserver(aplicarTema).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme'],
  });

  // Qualidade: alta liga sombra e resolução plena; baixa poupa o celular.
  let qualidade = qualidadeInicial();
  function definirQualidade(q) {
    qualidade = q;
    try { localStorage.setItem('exp-qualidade', q); } catch (e) {}
    const alta = q === 'alta';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, alta ? 2 : 1));
    renderer.shadowMap.enabled = alta;
    sol.shadow.mapSize.set(alta ? 2048 : 512, alta ? 2048 : 512);
    if (sol.shadow.map) { sol.shadow.map.dispose(); sol.shadow.map = null; }
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    redimensionar();
  }

  function redimensionar() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    rotulos.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(redimensionar).observe(container);
  definirQualidade(qualidade);

  // Laço de desenho. Cada experimento registra funções com aoQuadro(fn(dt)).
  const tarefas = [];
  const relogio = new THREE.Clock();
  function quadro() {
    const dt = Math.min(relogio.getDelta(), 0.1);
    if (transicao) {
      transicao.t = Math.min(1, transicao.t + dt / 0.7);
      const s = transicao.t * transicao.t * (3 - 2 * transicao.t);
      camera.position.lerpVectors(transicao.p0, transicao.p1, s);
      controls.target.lerpVectors(transicao.a0, transicao.a1, s);
      if (transicao.t >= 1) transicao = null;
    }
    for (const f of tarefas) f(dt);
    controls.update();
    renderer.render(scene, camera);
    rotulos.render(scene, camera);
  }
  renderer.setAnimationLoop(quadro);

  return {
    THREE, scene, camera, renderer, controls, sol,
    aoQuadro: (f) => tarefas.push(f),
    irPara,
    vistas,
    definirQualidade,
    get qualidade() { return qualidade; },
    redimensionar,
  };
}

/**
 * Arrastar objetos com o mouse ou o dedo. `alvos` são as malhas clicáveis; ao
 * começar o arraste, a câmera orbital é desligada até soltar.
 */
export function criarArraste(cena, { alvos, aoIniciar, aoMover, aoSoltar, aoClicar }) {
  const { THREE, camera, renderer, controls } = cena;
  const ray = new THREE.Raycaster();
  const ponteiro = new THREE.Vector2();
  const el = renderer.domElement;
  let ativo = null;
  let inicio = null;

  function atualizarPonteiro(e) {
    const r = el.getBoundingClientRect();
    ponteiro.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ponteiro.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ponteiro, camera);
  }

  function acertou() {
    const hits = ray.intersectObjects(alvos(), true);
    return hits.length ? hits[0] : null;
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    atualizarPonteiro(e);
    const h = acertou();
    if (!h) return;
    ativo = h;
    inicio = { x: e.clientX, y: e.clientY, moveu: false };
    controls.enabled = false;
    el.setPointerCapture(e.pointerId);
    aoIniciar && aoIniciar(h, ray);
  });

  el.addEventListener('pointermove', (e) => {
    atualizarPonteiro(e);
    if (!ativo) {
      el.style.cursor = acertou() ? 'grab' : '';
      return;
    }
    el.style.cursor = 'grabbing';
    if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 4) inicio.moveu = true;
    if (inicio.moveu) aoMover && aoMover(ativo, ray);
  });

  function terminar(e) {
    if (!ativo) return;
    const h = ativo;
    const foiClique = !inicio.moveu;
    ativo = null;
    controls.enabled = true;
    el.style.cursor = '';
    try { el.releasePointerCapture(e.pointerId); } catch (e2) {}
    if (foiClique) aoClicar && aoClicar(h);
    else aoSoltar && aoSoltar(h);
  }
  el.addEventListener('pointerup', terminar);
  el.addEventListener('pointercancel', terminar);

  return { raycaster: ray };
}
