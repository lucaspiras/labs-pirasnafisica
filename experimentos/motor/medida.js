// Instrumentos de medida: resolução finita, ruído e formatação em português.
// Puro, sem Three.js.

/** Número aleatório com distribuição normal (Box-Muller). */
export function gauss(media = 0, desvio = 1) {
  let u = 0;
  while (u === 0) u = Math.random();
  const v = Math.random();
  return media + desvio * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Arredonda para a resolução do instrumento (ex.: 0.01 para um cronômetro de centésimos). */
export function naResolucao(valor, resolucao) {
  return Math.round(valor / resolucao) * resolucao;
}

/** Leitura de um instrumento digital: valor verdadeiro + ruído, truncado na resolução. */
export function leituraDigital(valor, { resolucao, ruido = 0 }) {
  return naResolucao(valor + (ruido ? gauss(0, ruido) : 0), resolucao);
}

/** Formata com vírgula decimal e número fixo de casas: 1.2345 → "1,23". */
export function fmt(valor, casas = 2) {
  if (!Number.isFinite(valor)) return '—';
  return valor.toFixed(casas).replace('.', ',').replace('-', '−');
}

/** Lê número digitado em português ou inglês ("1,25" ou "1.25"). */
export function lerNumero(texto) {
  if (typeof texto === 'number') return texto;
  const t = String(texto).trim().replace(/\s/g, '').replace('−', '-').replace(',', '.');
  if (t === '') return NaN;
  return Number(t);
}

/** Tempo de cronômetro: 83.456 → "01:23,45" (o cronômetro trunca, não arredonda). */
export function fmtCronometro(seg) {
  const cent = Math.floor(seg * 100 + 1e-9);
  const m = Math.floor(cent / 6000);
  const s = Math.floor((cent % 6000) / 100);
  const c = cent % 100;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(c).padStart(2, '0')}`;
}
