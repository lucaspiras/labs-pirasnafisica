// Física do laboratório: integradores e modelos, em funções puras.
// Este arquivo não importa o Three.js, para que possa ser testado com `node --test`.

/** Constantes usadas em todos os experimentos. */
export const CONST = {
  g: 9.79,          // m/s², valor típico no sul do Brasil
  rhoAr: 1.2,       // kg/m³
  cdEsfera: 0.47,   // coeficiente de arrasto de uma esfera lisa
};

/**
 * Um passo de Runge-Kutta de 4ª ordem.
 * @param {(t:number, y:number[]) => number[]} deriv  derivada do estado
 * @param {number} t   instante atual
 * @param {number[]} y estado atual
 * @param {number} h   passo
 * @returns {number[]} estado em t + h
 */
export function rk4(deriv, t, y, h) {
  const n = y.length;
  const k1 = deriv(t, y);
  const y2 = new Array(n);
  for (let i = 0; i < n; i++) y2[i] = y[i] + 0.5 * h * k1[i];
  const k2 = deriv(t + 0.5 * h, y2);
  const y3 = new Array(n);
  for (let i = 0; i < n; i++) y3[i] = y[i] + 0.5 * h * k2[i];
  const k3 = deriv(t + 0.5 * h, y3);
  const y4 = new Array(n);
  for (let i = 0; i < n; i++) y4[i] = y[i] + h * k3[i];
  const k4 = deriv(t + h, y4);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  return out;
}

/**
 * Relógio de passo fixo. O desenho roda no ritmo da tela; a física, sempre com o
 * mesmo passo, para que o resultado não dependa do computador do aluno.
 */
export class PassoFixo {
  constructor(h = 1 / 1000, maxPassosPorQuadro = 400) {
    this.h = h;
    this.max = maxPassosPorQuadro;
    this.acumulado = 0;
  }
  /** Avança `dtReal` segundos de simulação chamando `passo(h)` quantas vezes couber. */
  avancar(dtReal, passo) {
    this.acumulado += dtReal;
    let n = 0;
    while (this.acumulado >= this.h && n < this.max) {
      passo(this.h);
      this.acumulado -= this.h;
      n++;
    }
    if (n === this.max) this.acumulado = 0; // aba em segundo plano: descarta o atraso
    return n;
  }
}

/** Média aritmético-geométrica, usada no período exato do pêndulo. */
export function mag(a, b) {
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15 * a; i++) {
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = an;
  }
  return (a + b) / 2;
}

/** Massa (kg) e densidade (kg/m³) → raio (m) de uma esfera maciça. */
export function raioEsfera(massa, rho) {
  return Math.cbrt((3 * massa) / (4 * Math.PI * rho));
}

/* ───────────────────────── Pêndulo ───────────────────────── */

/**
 * Parâmetros derivados de um pêndulo de esfera maciça presa a um fio sem massa.
 * L é a distância do ponto de suspensão ao centro da esfera.
 */
export function parametrosPendulo({ L, massa, raio, g = CONST.g, arrasto = true }) {
  const I = massa * L * L + 0.4 * massa * raio * raio; // eixo no ponto de suspensão
  const k = arrasto ? 0.5 * CONST.rhoAr * CONST.cdEsfera * Math.PI * raio * raio : 0;
  return { L, massa, raio, g, I, k };
}

/**
 * Derivada do estado [θ, ω] do pêndulo físico (esfera + fio), sem aproximação de
 * ângulo pequeno, com arrasto do ar quadrático na velocidade.
 */
export function derivPendulo(p) {
  return (t, [th, w]) => {
    const v = p.L * w;
    const torqueAr = -p.L * p.k * v * Math.abs(v);
    const alfa = (-p.massa * p.g * p.L * Math.sin(th) + torqueAr) / p.I;
    return [w, alfa];
  };
}

/** Período para oscilações pequenas, já com o momento de inércia da esfera. */
export function periodoPequeno(p) {
  return 2 * Math.PI * Math.sqrt(p.I / (p.massa * p.g * p.L));
}

/** Período exato (sem arrasto) para a amplitude th0, em radianos. */
export function periodoExato(p, th0) {
  return periodoPequeno(p) / mag(1, Math.cos(th0 / 2));
}

/**
 * Amplitude atual (rad) a partir do estado [θ, ω], pela energia mecânica:
 * ½·I·ω² − m·g·L·cos θ = −m·g·L·cos θa. Vale em qualquer instante, sem esperar o
 * ponto de retorno; com arrasto, dá a amplitude que o pêndulo tem agora.
 */
export function amplitudePendulo(p, th, w) {
  const c = Math.cos(th) - (p.I * w * w) / (2 * p.massa * p.g * p.L);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** Período do pêndulo simples ideal: 2π·√(L/g). */
export function periodoIdeal(L, g = CONST.g) {
  return 2 * Math.PI * Math.sqrt(L / g);
}

/* ───────────────────────── Fotoporta genérica ───────────────────────── */

/**
 * Fotoporta num eixo: o feixe fica na posição `p`, e o corpo ocupa o intervalo entre
 * duas bordas (`a` e `b`, em qualquer ordem). A cada passo da física, `passo` recebe as
 * bordas antes e depois e devolve o evento ('entra' ou 'sai') com o instante interpolado
 * dentro do passo, ou null. Serve a carrinho, planador, esfera em queda e massa da Atwood.
 */
export class Portao {
  constructor(p) {
    this.p = p;
    this.bloqueado = false;
  }
  passo(t0, h, [a0, b0], [a1, b1]) {
    const p = this.p;
    const dentro = (a, b) => Math.min(a, b) <= p && p <= Math.max(a, b);
    const agora = dentro(a1, b1);
    if (agora === this.bloqueado) return null;
    this.bloqueado = agora;
    const fracao = (x0, x1) => ((x0 - p) * (x1 - p) <= 0 && x0 !== x1 ? (p - x0) / (x1 - x0) : null);
    const f = fracao(a0, a1) ?? fracao(b0, b1) ?? 1;
    return { tipo: agora ? 'entra' : 'sai', t: t0 + Math.max(0, Math.min(1, f)) * h };
  }
  /** Reposiciona o feixe sem disparar evento. */
  mover(p, bordas) {
    this.p = p;
    this.bloqueado = bordas ? Math.min(...bordas) <= p && p <= Math.max(...bordas) : false;
  }
}

/* ───────────────────────── Plano inclinado ───────────────────────── */

/**
 * Carrinho descendo uma rampa. `massaRot` é a massa equivalente das rodas girando
 * (I/r² somado das quatro), `mu` o coeficiente de resistência ao rolamento e `k` o
 * fator de arrasto do ar (F = k·v²). Devolve a derivada de [s, v], com s ao longo da rampa.
 */
export function parametrosCarrinho({ theta, massa, massaRot = 0, mu = 0, k = 0, g = CONST.g }) {
  const mEf = massa + massaRot;
  const motor = massa * g * (Math.sin(theta) - mu * Math.cos(theta));
  return { theta, massa, mEf, motor, k, g };
}

/** Aceleração do carrinho partindo do repouso, sem o ar. */
export function aceleracaoCarrinho(p) {
  return Math.max(0, p.motor / p.mEf);
}

export function derivCarrinho(p) {
  return (t, [s, v]) => {
    if (v <= 0 && p.motor <= 0) return [0, 0]; // atrito segura o carrinho
    return [v, (p.motor - p.k * v * Math.abs(v)) / p.mEf];
  };
}

/* ───────────────────────── Queda e Atwood ───────────────────────── */

/** Queda vertical com arrasto quadrático. Estado [d, v], d medido para baixo. */
export function derivQueda({ massa, k = 0, g = CONST.g }) {
  return (t, [d, v]) => [v, g - (k / massa) * v * Math.abs(v)];
}

/** Arrasto de uma esfera: k em F = k·v². */
export function arrastoEsfera(raio) {
  return 0.5 * CONST.rhoAr * CONST.cdEsfera * Math.PI * raio * raio;
}

/**
 * Máquina de Atwood: m2 desce, m1 sobe. `mPolia` é a massa equivalente da roldana
 * (I/r²) e `atrito` a força de atrito no eixo, levada à borda da roldana (N).
 */
export function aceleracaoAtwood({ m1, m2, mPolia = 0, atrito = 0, g = CONST.g }) {
  const motor = (m2 - m1) * g;
  if (motor <= atrito) return 0;
  return (motor - atrito) / (m1 + m2 + mPolia);
}

/* ───────────────────────── Mola ───────────────────────── */

export const kSerie = (k1, k2) => (k1 * k2) / (k1 + k2);
export const kParalelo = (k1, k2) => k1 + k2;

/**
 * Corpo pendurado numa mola, com amortecimento viscoso. Estado [x, v], x é o
 * alongamento da mola a partir do comprimento natural, para baixo.
 * mEf inclui um terço da massa da mola.
 */
export function derivMola({ k, mEf, carga, c = 0, g = CONST.g }) {
  return (t, [x, v]) => [v, (carga * g - k * x - c * v) / mEf];
}

/* ───────────────────────── Lançamento horizontal ───────────────────────── */

/** β = I/(m·r²) dos corpos que rolam. O cilindro com furo tem raios ri (furo) e r. */
export const BETA = {
  esfera: 2 / 5,
  cilindro: 1 / 2,
  cilindroFurado: (ri, r) => (1 + (ri / r) ** 2) / 2,
};

/**
 * Velocidade de saída de um corpo que rola sem deslizar desde a altura h:
 * m·g·h = ½·m·v² + ½·I·ω², com I = β·m·r² e ω = v/r. Fica v² = 2·g·h / (1 + β);
 * para a esfera maciça (β = 2/5), v² = (10/7)·g·h.
 * `perda` desconta a fração da energia que vai para o atrito de rolamento.
 */
export function velocidadeRolando(h, { beta = BETA.esfera, perda = 0, g = CONST.g } = {}) {
  return Math.sqrt(((2 * g * h) / (1 + beta)) * (1 - perda));
}

/** Alcance horizontal sem o ar, a partir da altura H com velocidade horizontal v. */
export function alcanceHorizontal(v, H, g = CONST.g) {
  return v * Math.sqrt((2 * H) / g);
}

/** Voo com arrasto quadrático. Estado [x, y, vx, vy]. */
export function derivVoo({ massa, k = 0, g = CONST.g }) {
  return (t, [x, y, vx, vy]) => {
    const v = Math.hypot(vx, vy);
    const f = (k / massa) * v;
    return [vx, vy, -f * vx, -g - f * vy];
  };
}

/* ───────────────────────── Colisões ───────────────────────── */

/**
 * Velocidades depois de uma colisão frontal com coeficiente de restituição e
 * (1 para elástica, 0 para perfeitamente inelástica).
 */
export function colisao(m1, v1, m2, v2, e) {
  const p = m1 * v1 + m2 * v2;
  const M = m1 + m2;
  return [
    (p - m2 * e * (v1 - v2)) / M,
    (p + m1 * e * (v1 - v2)) / M,
  ];
}

/* ───────────────────────── Ajuste ───────────────────────── */

/** Regressão linear por mínimos quadrados: y = a·x + b. */
export function ajusteLinear(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-15) return null;
  const a = (n * sxy - sx * sy) / den;
  const b = (sy - a * sx) / n;
  let ssr = 0, sst = 0;
  const my = sy / n;
  for (let i = 0; i < n; i++) {
    ssr += (ys[i] - (a * xs[i] + b)) ** 2;
    sst += (ys[i] - my) ** 2;
  }
  const r2 = sst > 0 ? 1 - ssr / sst : 1;
  // incerteza-padrão da inclinação
  const sa = n > 2 ? Math.sqrt(ssr / (n - 2) / (sxx - (sx * sx) / n)) : NaN;
  return { a, b, r2, sa };
}
