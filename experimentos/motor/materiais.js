// Materiais do laboratório. As texturas são desenhadas em canvas na hora, o que
// dispensa arquivos de imagem e mantém cada página leve.

import * as THREE from 'three';

const cache = new Map();

function texturaCanvas(chave, larg, alt, desenhar, repetir = [1, 1]) {
  if (cache.has(chave)) return cache.get(chave);
  const c = document.createElement('canvas');
  c.width = larg; c.height = alt;
  desenhar(c.getContext('2d'), larg, alt);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repetir[0], repetir[1]);
  t.anisotropy = 4;
  cache.set(chave, t);
  return t;
}

// Ruído simples e determinístico, para que a madeira saia igual a cada visita.
function aleatorio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function desenharMadeira(ctx, w, h) {
  const r = aleatorio(7);
  ctx.fillStyle = '#b07a48';
  ctx.fillRect(0, 0, w, h);
  // veios longos ao longo do comprimento
  for (let i = 0; i < 140; i++) {
    const y0 = r() * h;
    const amp = 2 + r() * 6;
    const fase = r() * 10;
    const claro = r() < 0.5;
    ctx.strokeStyle = claro ? `rgba(220,170,115,${0.10 + r() * 0.18})` : `rgba(95,55,25,${0.10 + r() * 0.22})`;
    ctx.lineWidth = 0.6 + r() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x / (60 + r() * 4) + fase) * amp;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // alguns nós
  for (let i = 0; i < 3; i++) {
    const cx = r() * w, cy = r() * h;
    for (let k = 10; k > 0; k--) {
      ctx.strokeStyle = `rgba(90,50,22,${0.05 + k * 0.012})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, k * 5, k * 1.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function desenharPiso(ctx, w, h) {
  // placas de vinílico de 50 cm, em leve variação de tom
  const r = aleatorio(11);
  const n = 4;
  const p = w / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = 228 + Math.floor(r() * 14);
      ctx.fillStyle = `rgb(${v},${v},${v - 4})`;
      ctx.fillRect(i * p, j * p, p, p);
      for (let k = 0; k < 60; k++) {
        ctx.fillStyle = `rgba(120,120,120,${r() * 0.08})`;
        ctx.fillRect(i * p + r() * p, j * p + r() * p, 2 + r() * 3, 2 + r() * 3);
      }
    }
  }
  ctx.strokeStyle = 'rgba(80,80,80,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * p, 0); ctx.lineTo(i * p, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * p); ctx.lineTo(w, i * p); ctx.stroke();
  }
}

function desenharEscovado(ctx, w, h) {
  const r = aleatorio(3);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) {
    const y = r() * h;
    const v = 100 + Math.floor(r() * 80);
    ctx.strokeStyle = `rgba(${v},${v},${v},0.35)`;
    ctx.lineWidth = r() * 1.4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + r() * 2 - 1); ctx.stroke();
  }
}

/** Fábricas de materiais. Cada chamada devolve um material novo (cores podem mudar). */
export const MAT = {
  madeira(repetir = [1, 1]) {
    const map = texturaCanvas('madeira' + repetir.join('x'), 1024, 256, desenharMadeira, repetir);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0 });
  },
  tampoFenolico() {
    // tampo de bancada de laboratório: laminado escuro, levemente acetinado
    return new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.45, metalness: 0.05 });
  },
  piso() {
    const map = texturaCanvas('piso', 512, 512, desenharPiso, [7, 7]);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0, color: 0xbfc4c8 });
  },
  parede() {
    return new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.95, metalness: 0 });
  },
  aco(cor = 0xb9bec4, rugosidade = 0.32) {
    return new THREE.MeshStandardMaterial({ color: cor, roughness: rugosidade, metalness: 1 });
  },
  acoEscovado(cor = 0xc4c8cc) {
    const map = texturaCanvas('escovado', 256, 256, desenharEscovado);
    return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.4, metalness: 1, roughnessMap: map });
  },
  latao() {
    return new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.22, metalness: 1 });
  },
  ferroPintado(cor = 0x23272b) {
    // base de suporte universal: ferro fundido com pintura martelada
    return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, metalness: 0.35 });
  },
  plastico(cor = 0x2a2d31, rugosidade = 0.5) {
    return new THREE.MeshStandardMaterial({ color: cor, roughness: rugosidade, metalness: 0 });
  },
  borracha(cor = 0x151515) {
    return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.9, metalness: 0 });
  },
  acrilico(cor = 0xffffff, opacidade = 0.28) {
    return new THREE.MeshStandardMaterial({
      color: cor, roughness: 0.08, metalness: 0, transparent: true, opacity: opacidade,
      depthWrite: false, side: THREE.DoubleSide,
    });
  },
  fio(cor = 0xf1ede4) {
    return new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, metalness: 0 });
  },
  emissivo(cor = 0xff2a1a, intensidade = 2) {
    return new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: intensidade, roughness: 0.4 });
  },
};

export { texturaCanvas };
