// Generador de levas de disco con seguidor de traslacion en linea (con o sin rodillo). Sin DOM.
// El perfil que se corta es la equidistante interior (radio del rodillo) de la curva primitiva.
import { offsetPolyline } from './curves.js';

// Leyes de movimiento normalizadas s(u), u en [0,1], con s(0)=0 y s(1)=1.
export const LAWS = {
  cicloidal: { label: 'Cicloidal (aceleración suave)', f: (u) => u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) },
  armonico: { label: 'Armónico simple', f: (u) => (1 - Math.cos(Math.PI * u)) / 2 },
  parabolico: { label: 'Aceleración constante', f: (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)) },
  uniforme: { label: 'Velocidad uniforme (con golpes)', f: (u) => u },
};

// Desplazamiento del seguidor para un angulo de leva theta (grados, [0,360)).
export function displacement(p, theta) {
  const f = (LAWS[p.law] || LAWS.cicloidal).f;
  const { h, rise, dwellHigh, fall } = p;
  if (theta < rise) return h * f(theta / rise);
  if (theta < rise + dwellHigh) return h;
  if (theta < rise + dwellHigh + fall) return h * (1 - f((theta - rise - dwellHigh) / fall));
  return 0;
}

// p: { rb, rr, h, rise, dwellHigh, fall, law, ccw, n }
// Devuelve { pitch, profile, maxPressureDeg, undercut, minRadius } o { error }.
export function camProfile(p) {
  const { rb, h, rise, dwellHigh = 0, fall } = p;
  const rr = p.rr || 0, n = Math.max(36, Math.round(p.n || 360)), ccw = p.ccw !== false;
  if (!(rb > 0) || !(h > 0) || !(rise > 0) || !(fall > 0)) return { error: 'Radio base, carrera, subida y bajada deben ser positivos' };
  if (rise + dwellHigh + fall > 360 + 1e-9) return { error: 'Subida + reposo + bajada no pueden pasar de 360°' };
  const pitch = [];
  let maxPressure = 0;
  for (let k = 0; k < n; k++) {
    const th = (360 * k) / n;
    const s = displacement(p, th);
    const rho = rb + rr + s;
    // la leva gira en sentido antihorario: el seguidor "ve" el punto a angulo -theta del perfil
    const phi = ((ccw ? -th : th) * Math.PI) / 180;
    pitch.push({ x: rho * Math.cos(phi), y: rho * Math.sin(phi) });
    const e = 1e-3;
    const ds = (displacement(p, (th + e) % 360) - displacement(p, (th - e + 360) % 360)) / ((2 * e * Math.PI) / 180);
    maxPressure = Math.max(maxPressure, Math.atan(Math.abs(ds) / rho));
  }
  let profile = pitch, undercut = 0, minRadius = Infinity;
  if (rr > 0) {
    const o = offsetPolyline(pitch, -rr, true);
    profile = o.pts; undercut = o.undercut; minRadius = o.minRadius;
  }
  return { pitch, profile, maxPressureDeg: (maxPressure * 180) / Math.PI, undercut, minRadius };
}
