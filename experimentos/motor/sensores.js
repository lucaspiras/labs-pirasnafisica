// Cronômetro de vários sensores: dispara na largada (eletroímã ou trava) e anota o
// instante em que a borda do corpo entra no feixe de cada fotoporta. Puro, sem Three.js.

import { Portao } from './fisica.js';
import { naResolucao, gauss } from './medida.js';

export class Contador {
  /** @param {number[]} posicoes  posição de cada feixe, na coordenada do movimento */
  constructor(posicoes, { resolucao = 0.0001, ruido = 0.00003 } = {}) {
    this.portoes = posicoes.map((p) => new Portao(p));
    this.resolucao = resolucao;
    this.ruido = ruido;
    this.t = posicoes.map(() => null);
    this.t0 = null;
    this.canal = 0;
  }
  get n() { return this.portoes.length; }
  /** Dispara a contagem no instante t (da simulação) e limpa as leituras. */
  largar(t) { this.t0 = t; this.t = this.t.map(() => null); }
  zerar() { this.t0 = null; this.t = this.t.map(() => null); }
  mover(i, p, bordas) { this.portoes[i].mover(p, bordas); }
  /** Bordas do corpo [a, b] antes e depois do passo. */
  passo(t0, h, antes, depois) {
    this.portoes.forEach((p, i) => {
      const ev = p.passo(t0, h, antes, depois);
      if (ev && ev.tipo === 'entra' && this.t0 !== null && this.t[i] === null) {
        this.t[i] = naResolucao(ev.t - this.t0 + gauss(0, this.ruido), this.resolucao);
      }
    });
  }
  bloqueado(i) { return this.portoes[i].bloqueado; }
  completo() { return this.t.every((v) => v !== null); }
  proximoCanal() { this.canal = (this.canal + 1) % this.n; return this.canal; }
}
