// Rótulos em HTML presos a pontos da cena (CSS2DRenderer). Aceitam <sub>, de modo
// que a notação segue as regras do site (índice em <sub>, unidade com espaço).

import { CSS2DObject } from 'three/addons/CSS2DRenderer.js';

export function rotulo(html, classe = '') {
  const el = document.createElement('div');
  el.className = 'exp-rotulo ' + classe;
  el.innerHTML = html;
  const obj = new CSS2DObject(el);
  obj.userData.html = (h) => { if (el.innerHTML !== h) el.innerHTML = h; };
  return obj;
}
