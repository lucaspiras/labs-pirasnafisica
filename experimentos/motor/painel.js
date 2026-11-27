// Painel lateral dos experimentos: abas, controles, tabela de medidas e gráfico.
// Só DOM e canvas 2D; nada de Three.js aqui.

import { fmt, lerNumero } from './medida.js';
import { ajusteLinear } from './fisica.js';

const h = (tag, attrs = {}, ...filhos) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f != null) el.append(f);
  return el;
};
export { h };

/** Liga os botões `[data-aba]` às seções `[data-painel]` dentro de `raiz`. */
export function abas(raiz) {
  const botoes = raiz.querySelectorAll('[data-aba]');
  const paineis = raiz.querySelectorAll('[data-painel]');
  function mostrar(nome) {
    botoes.forEach((b) => b.setAttribute('aria-selected', b.dataset.aba === nome ? 'true' : 'false'));
    paineis.forEach((p) => { p.hidden = p.dataset.painel !== nome; });
    raiz.dispatchEvent(new CustomEvent('aba', { detail: nome }));
  }
  botoes.forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.aba)));
  mostrar(botoes[0].dataset.aba);
  return mostrar;
}

/** Controle deslizante com rótulo e valor formatado. */
export function deslizante({ rotulo, min, max, passo, valor, formatar = (v) => v, aoMudar }) {
  const saida = h('output', { class: 'ctl-valor' }, formatar(valor));
  const input = h('input', { type: 'range', min, max, step: passo, value: valor });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    saida.textContent = formatar(v);
    aoMudar && aoMudar(v);
  });
  const el = h('label', { class: 'ctl' }, h('span', { class: 'ctl-rotulo', html: rotulo }), saida, input);
  return {
    el,
    get valor() { return Number(input.value); },
    definir(v) { input.value = v; saida.textContent = formatar(Number(input.value)); },
    desabilitar(sim) { input.disabled = sim; el.classList.toggle('desabilitado', sim); },
  };
}

/** Grupo de botões de escolha única (ex.: massas). */
export function escolha({ rotulo, opcoes, valor, aoMudar }) {
  const grupo = h('div', { class: 'ctl-escolha', role: 'radiogroup' });
  const bts = opcoes.map((o) => {
    const b = h('button', { type: 'button', class: 'chip', role: 'radio', html: o.rotulo });
    b.addEventListener('click', () => { if (!b.disabled) { marcar(o.valor); aoMudar && aoMudar(o.valor); } });
    grupo.append(b);
    return [o.valor, b];
  });
  function marcar(v) { bts.forEach(([val, b]) => b.setAttribute('aria-checked', val === v ? 'true' : 'false')); }
  marcar(valor);
  const el = h('div', { class: 'ctl' }, h('span', { class: 'ctl-rotulo', html: rotulo }), grupo);
  return { el, definir: marcar, desabilitar(sim) { bts.forEach(([, b]) => { b.disabled = sim; }); el.classList.toggle('desabilitado', sim); } };
}

/** Chave liga/desliga. */
export function chave({ rotulo, valor = false, aoMudar }) {
  const input = h('input', { type: 'checkbox' });
  input.checked = valor;
  input.addEventListener('change', () => aoMudar && aoMudar(input.checked));
  const el = h('label', { class: 'ctl-chave' }, input, h('span', { html: rotulo }));
  return { el, get valor() { return input.checked; }, definir(v) { input.checked = v; } };
}

/**
 * Tabela de medidas. `colunas`: [{id, titulo (HTML), casas, editavel, calc(linha)}].
 * As linhas guardam números; colunas com `calc` são derivadas. Salva no
 * localStorage com a chave dada, para que um recarregar não apague o trabalho.
 */
export function tabelaMedidas({ colunas, chaveSalvar, aoMudar }) {
  let linhas = [];
  try { linhas = JSON.parse(localStorage.getItem(chaveSalvar) || '[]'); } catch (e) {}

  const corpo = h('tbody');
  const tabela = h('table', { class: 'tab-medidas' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), ...colunas.map((c) => h('th', { html: c.titulo })), h('th'))),
    corpo);
  const vazio = h('p', { class: 'tab-vazio' }, 'Nenhuma medida ainda.');

  function valor(linha, c) { return c.calc ? c.calc(linha) : linha[c.id]; }
  function casas(linha, c) { return typeof c.casas === 'function' ? c.casas(linha) : c.casas; }

  function salvar() {
    try { localStorage.setItem(chaveSalvar, JSON.stringify(linhas)); } catch (e) {}
    aoMudar && aoMudar(api.dados());
  }

  function desenhar() {
    corpo.replaceChildren();
    linhas.forEach((l, i) => {
      const tr = h('tr', {}, h('td', { class: 'num' }, String(i + 1)));
      for (const c of colunas) {
        const v = valor(l, c);
        if (c.texto) {
          tr.append(h('td', { class: 'txt' }, String(v ?? '')));
        } else if (c.editavel) {
          const inp = h('input', { class: 'tab-entrada', inputmode: 'decimal', value: Number.isFinite(v) ? fmt(v, casas(l, c)).replace('−', '-') : '' });
          inp.addEventListener('change', () => {
            const n = lerNumero(inp.value);
            l[c.id] = n;
            salvar(); desenhar();
          });
          tr.append(h('td', {}, inp));
        } else {
          tr.append(h('td', { class: 'num' }, fmt(v, casas(l, c))));
        }
      }
      tr.append(h('td', {}, h('button', {
        type: 'button', class: 'tab-apagar', title: 'Apagar esta linha', 'aria-label': 'Apagar linha ' + (i + 1),
        onclick: () => { linhas.splice(i, 1); salvar(); desenhar(); },
      }, '×')));
      corpo.append(tr);
    });
    vazio.hidden = linhas.length > 0;
  }

  const api = {
    el: h('div', { class: 'tab-envoltorio' }, tabela, vazio),
    adicionar(linha) { linhas.push(linha); salvar(); desenhar(); },
    limpar() { linhas = []; salvar(); desenhar(); },
    dados() { return linhas.map((l) => Object.fromEntries(colunas.map((c) => [c.id, valor(l, c)]))); },
    get linhas() { return linhas; },
    /** CSV com ponto e vírgula e vírgula decimal, que o Excel em português abre direto. */
    csv() {
      const cab = colunas.map((c) => c.tituloCsv || c.id).join(';');
      const corpoCsv = linhas.map((l) => colunas.map((c) => {
        const v = valor(l, c);
        return c.texto ? String(v ?? '') : fmt(v, casas(l, c)).replace('−', '-');
      }).join(';'));
      return [cab, ...corpoCsv].join('\r\n');
    },
  };
  desenhar();
  return api;
}

/** Faz o navegador baixar um texto como arquivo. */
export function baixar(nome, texto, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + texto], { type: tipo });
  const a = h('a', { href: URL.createObjectURL(blob), download: nome });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/**
 * Gráfico de dispersão com reta ajustada, em canvas 2D.
 * desenhar({pontos:[[x,y]], ajuste:bool, teorica:(x)=>y | null})
 */
export function grafico({ eixoX, eixoY }) {
  const canvas = h('canvas', { class: 'grafico', role: 'img', 'aria-label': `Gráfico de ${eixoY} em função de ${eixoX}` });
  let ultimo = { pontos: [] };

  function cores() {
    const s = getComputedStyle(document.documentElement);
    const v = (n, d) => (s.getPropertyValue(n).trim() || d);
    return { texto: v('--text2', '#444'), grade: v('--border2', '#ddd'), eixo: v('--text3', '#888'), ponto: v('--accent', '#0d9488'), reta: v('--laranja', '#d9480f'), teorica: v('--text3', '#888') };
  }

  function desenhar(d = ultimo) {
    ultimo = d;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 320, H = canvas.clientHeight || 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const c = cores();
    const m = { e: 46, d: 12, t: 12, b: 34 };
    const pts = d.pontos.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    let xmax = Math.max(0.1, ...pts.map((p) => p[0])) * 1.1;
    let ymax = Math.max(0.1, ...pts.map((p) => p[1])) * 1.1;
    const tx = (x) => m.e + (x / xmax) * (W - m.e - m.d);
    const ty = (y) => H - m.b - (y / ymax) * (H - m.t - m.b);
    // grade
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillStyle = c.texto; ctx.strokeStyle = c.grade; ctx.lineWidth = 1;
    const passo = (max) => { const p = Math.pow(10, Math.floor(Math.log10(max / 4))); const r = max / 4 / p; return p * (r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1); };
    const px = passo(xmax), py = passo(ymax);
    const casas = (p) => Math.max(0, -Math.floor(Math.log10(p) + 1e-9));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = 0; x <= xmax + 1e-9; x += px) {
      ctx.beginPath(); ctx.moveTo(tx(x), ty(0)); ctx.lineTo(tx(x), m.t); ctx.stroke();
      ctx.fillText(fmt(x, casas(px)), tx(x), H - m.b + 4);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = 0; y <= ymax + 1e-9; y += py) {
      ctx.beginPath(); ctx.moveTo(m.e, ty(y)); ctx.lineTo(W - m.d, ty(y)); ctx.stroke();
      ctx.fillText(fmt(y, casas(py)), m.e - 5, ty(y));
    }
    ctx.strokeStyle = c.eixo; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(m.e, m.t); ctx.lineTo(m.e, ty(0)); ctx.lineTo(W - m.d, ty(0)); ctx.stroke();
    ctx.fillStyle = c.texto; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(eixoX, (m.e + W - m.d) / 2, H - 1);
    ctx.save(); ctx.translate(11, (m.t + H - m.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(eixoY, 0, 0); ctx.restore();
    // curva teórica
    if (d.teorica) {
      ctx.strokeStyle = c.teorica; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const x = (xmax * i) / 60; const y = d.teorica(x); i ? ctx.lineTo(tx(x), ty(y)) : ctx.moveTo(tx(x), ty(y)); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    // reta ajustada
    let aj = null;
    if (d.ajuste && pts.length >= 2) {
      aj = ajusteLinear(pts.map((p) => p[0]), pts.map((p) => p[1]));
      if (aj) {
        ctx.strokeStyle = c.reta; ctx.lineWidth = 1.8;
        ctx.save(); ctx.beginPath(); ctx.rect(m.e, m.t, W - m.e - m.d, H - m.t - m.b); ctx.clip();
        ctx.beginPath(); ctx.moveTo(tx(0), ty(aj.b)); ctx.lineTo(tx(xmax), ty(aj.a * xmax + aj.b)); ctx.stroke();
        ctx.restore();
      }
    }
    // pontos
    ctx.fillStyle = c.ponto;
    for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(tx(x), ty(y), 4, 0, Math.PI * 2); ctx.fill(); }
    return aj;
  }
  new ResizeObserver(() => desenhar()).observe(canvas);
  new MutationObserver(() => desenhar()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return { el: canvas, desenhar };
}

/**
 * Liga os botões comuns da cena: vistas (`[data-vista]`), pausa (#bt-pausa) e
 * câmera lenta (#bt-velocidade). `est` precisa ter `pausado` e `vel`.
 * `velocidades` é o ciclo do botão de câmera lenta.
 */
export function barraDaCena(cena, est, avisar, velocidades = [1, 0.5, 0.25]) {
  document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => cena.irPara(b.dataset.vista)));
  const btPausa = document.getElementById('bt-pausa');
  btPausa.addEventListener('click', () => {
    est.pausado = !est.pausado;
    btPausa.setAttribute('aria-pressed', String(est.pausado));
    btPausa.textContent = est.pausado ? '▶ Continuar' : '⏸ Pausar';
  });
  const btVel = document.getElementById('bt-velocidade');
  const nomes = { 1: '1×', 0.5: '½×', 0.25: '¼×' };
  btVel.addEventListener('click', () => {
    est.vel = velocidades[(velocidades.indexOf(est.vel) + 1) % velocidades.length];
    btVel.textContent = nomes[est.vel] || `1/${Math.round(1 / est.vel)}×`;
    if (est.vel !== 1) avisar('Câmera lenta: os instrumentos seguem o tempo da simulação.');
  });
}

/** Aviso curto que some sozinho, no canto da cena. */
export function aviso(container) {
  const el = h('div', { class: 'exp-aviso', role: 'status', 'aria-live': 'polite' });
  container.append(el);
  let timer;
  return (texto, ms = 2600) => {
    el.innerHTML = texto;
    el.classList.add('visivel');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('visivel'), ms);
  };
}
