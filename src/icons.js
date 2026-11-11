// Iconos: genericos de Lucide (ISC) incluidos en el build y simbolos de CAD propios,
// todos con el mismo estilo (24x24, trazo 2, extremos redondeados).
import undo from 'lucide-static/icons/undo-2.svg?raw';
import redo from 'lucide-static/icons/redo-2.svg?raw';
import trash from 'lucide-static/icons/trash-2.svg?raw';
import fit from 'lucide-static/icons/maximize.svg?raw';
import grid from 'lucide-static/icons/grid-3x3.svg?raw';
import magnet from 'lucide-static/icons/magnet.svg?raw';
import eye from 'lucide-static/icons/eye.svg?raw';
import hand from 'lucide-static/icons/hand.svg?raw';
import save from 'lucide-static/icons/save.svg?raw';
import folderOpen from 'lucide-static/icons/folder-open.svg?raw';
import filePlus from 'lucide-static/icons/file-plus.svg?raw';
import image from 'lucide-static/icons/image.svg?raw';
import download from 'lucide-static/icons/download.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import equal from 'lucide-static/icons/equal.svg?raw';
import pointer from 'lucide-static/icons/mouse-pointer-2.svg?raw';
import circle from 'lucide-static/icons/circle.svg?raw';
import ruler from 'lucide-static/icons/ruler.svg?raw';
import pencilRuler from 'lucide-static/icons/pencil-ruler.svg?raw';
import unlock from 'lucide-static/icons/lock-open.svg?raw';
import menu from 'lucide-static/icons/menu.svg?raw';
import listTree from 'lucide-static/icons/list-tree.svg?raw';
import help from 'lucide-static/icons/circle-help.svg?raw';
import copy from 'lucide-static/icons/copy.svg?raw';
import paste from 'lucide-static/icons/clipboard-paste.svg?raw';

const S = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const custom = {
  point: S('<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  line: S('<path d="M5 19 19 5"/><circle cx="5" cy="19" r="2" fill="currentColor"/><circle cx="19" cy="5" r="2" fill="currentColor"/>'),
  intersect: S('<path d="M4 4l16 16M4 20 20 4"/><circle cx="12" cy="12" r="3" fill="var(--btn, #fff)"/>'),
  'con-h': S('<path d="M3 12h18"/><circle cx="3.5" cy="12" r="1.5" fill="currentColor"/><circle cx="20.5" cy="12" r="1.5" fill="currentColor"/><path d="M9 6h6M9 18h6" opacity=".35"/>'),
  'con-v': S('<path d="M12 3v18"/><circle cx="12" cy="3.5" r="1.5" fill="currentColor"/><circle cx="12" cy="20.5" r="1.5" fill="currentColor"/><path d="M6 9v6M18 9v6" opacity=".35"/>'),
  'con-par': S('<path d="M4 15 14 5M10 21 20 11"/>'),
  'con-perp': S('<path d="M5 4v16h16"/><path d="M5 14h6v6"/>'),
  // coincidente: dos lineas de distinta inclinacion que se unen en un punto (V invertida)
  'con-coi': S('<path d="M3 20 11 4.5 21 16"/><circle cx="11" cy="4.5" r="2.3" fill="currentColor"/>'),
  // colineal: extremo de una linea, tramo punteado, inicio de otra linea
  'con-col': S('<path d="M1.5 12H6"/><circle cx="7.6" cy="12" r="1.7" fill="currentColor"/><path d="M11 12h.01M14 12h.01"/><circle cx="16.4" cy="12" r="1.7" fill="currentColor"/><path d="M18 12h4.5"/>'),
  'arc-c': S('<path d="M5 19V5M5 19h14" opacity=".4"/><path d="M19 19A14 14 0 0 0 5 5"/><circle cx="5" cy="19" r="1.8" fill="currentColor"/><circle cx="19" cy="19" r="1.8" fill="currentColor"/><circle cx="5" cy="5" r="1.8" fill="currentColor"/>'),
  'arc-3': S('<path d="M3 20V7M3 20h13" opacity=".3" stroke-dasharray="1 3"/><path d="M3 7A13 13 0 0 1 16 20"/><circle cx="3" cy="7" r="1.8" fill="currentColor"/><circle cx="12.2" cy="10.8" r="1.8" fill="currentColor"/><circle cx="16" cy="20" r="1.8" fill="currentColor"/>'),
  // dividir: tramos separados por puntos (_._._)
  split: S('<path d="M1.5 14H6"/><circle cx="8" cy="14" r="1.7" fill="currentColor"/><path d="M10 14h4"/><circle cx="16" cy="14" r="1.7" fill="currentColor"/><path d="M18 14h4.5"/>'),
  // recortar: una linea cruzada por otra; el tramo de un lado queda discontinuo (quitado)
  trim: S('<path d="M12 3v18"/><path d="M3 12h9"/><path d="M15 12h.01M18.5 12h.01M22 12h.01" opacity=".6"/>'),
  // extender: la linea se alarga (flecha, tramo punteado) hasta tocar la otra
  extend: S('<path d="M20 3v18"/><path d="M3 12h7"/><path d="M12.5 12h.01M15 12h.01"/><path d="M16.5 8.5 20 12l-3.5 3.5"/>'),
  // matriz lineal: el original y copias que se van atenuando
  array: S('<rect x="2.5" y="8.5" width="5" height="7" rx="1"/><rect x="9.5" y="8.5" width="5" height="7" rx="1" opacity=".65"/><rect x="16.5" y="8.5" width="5" height="7" rx="1" opacity=".35"/>'),
  // bloqueo suave: tres ramas que salen de un nodo (direcciones que "atrapan" la linea)
  'soft-lock': S('<path d="M4.5 5 12 12.5M19.5 6 12 12.5M12 12.5 6 19"/><circle cx="4.5" cy="5" r="1.9" fill="currentColor"/><circle cx="19.5" cy="6" r="1.9" fill="currentColor"/><circle cx="6" cy="19" r="1.9" fill="currentColor"/><circle cx="12" cy="12.5" r="2.3" fill="currentColor"/>'),
  // matriz circular: el original y copias girando alrededor de un centro
  'array-circ': S('<circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="4.5" r="2.2"/><circle cx="18.9" cy="15.5" r="2.2" opacity=".65"/><circle cx="5.1" cy="15.5" r="2.2" opacity=".35"/><path d="M12 12V6.7" opacity=".4" stroke-dasharray="1.5 2.5"/>'),
  // copia espejo: eje discontinuo con un triangulo y su reflejo
  mirror: S('<path d="M12 2v20" stroke-dasharray="2 3"/><path d="M9 7 3 18h6z"/><path d="M15 7l6 11h-6z" opacity=".5"/>'),
  filter: S('<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>'),
  // linea constructiva: punto (trazo corto), hueco, trazo, hueco, punto
  cline: S('<path d="M2.5 12h1.6M8 12h8M19.9 12h1.6"/>'),
  circle3: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="3" r="1.9" fill="currentColor"/><circle cx="19.8" cy="16.5" r="1.9" fill="currentColor"/><circle cx="4.2" cy="16.5" r="1.9" fill="currentColor"/>'),
  rect: S('<rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="3" cy="6" r="1.9" fill="currentColor"/><circle cx="21" cy="18" r="1.9" fill="currentColor"/>'),
  'rect-c': S('<rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="21" cy="18" r="1.9" fill="currentColor"/><path d="M12 12l9 6" opacity=".45" stroke-dasharray="1.5 2.5"/>'),
  polygon: S('<path d="M12 3l8.5 6.2-3.2 10H6.7l-3.2-10z"/><circle cx="12" cy="12.5" r="1.6" fill="currentColor"/>'),
  // elipse inclinada con su centro
  ellipse: S('<ellipse cx="12" cy="12" rx="10" ry="5.5" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'),
  // spline: una "S" girada 90 grados (onda) con puntos en los extremos y en cada seno
  spline: S('<path d="M3 16C3 9 5 6 8 6c5 0 3 12 8 12 3 0 5-6 5-10"/><circle cx="3" cy="16" r="1.6" fill="currentColor"/><circle cx="8" cy="6" r="1.6" fill="currentColor"/><circle cx="16" cy="18" r="1.6" fill="currentColor"/><circle cx="21" cy="8" r="1.6" fill="currentColor"/>'),
  // abrir/cerrar spline: triangulo de lados curvos con uno discontinuo
  'spline-closed': S('<path d="M12 4C7 9 4.5 14 4 19c5 2.6 11 2.6 16 0"/><path d="M20 19c0-5-3-11-8-15" stroke-dasharray="2.4 3.2"/><circle cx="12" cy="4" r="1.9" fill="currentColor"/><circle cx="4" cy="19" r="1.9" fill="currentColor"/><circle cx="20" cy="19" r="1.9" fill="currentColor"/>'),
  trace: S('<path d="M3 19C6 19 8 12 12 11s5-4 6-5" stroke-dasharray="1.5 3"/><circle cx="19.5" cy="5" r="2.4" fill="currentColor"/>'),
  text: S('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
  'con-mid': S('<path d="M3 12h18"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M3 8v8M21 8v8M8 9.5v5M16 9.5v5" opacity=".45"/>'),
  // concentricos: dos circunferencias con el mismo centro
  'con-conc': S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  // linea de punto medio: crece igual a ambos lados del punto inicial
  mline: S('<path d="M3 19 21 5"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M3 15v8M21 1v8" opacity=".45"/>'),
  'con-tan': S('<circle cx="12" cy="14" r="6"/><path d="M3 8h18"/>'),
  'con-onc': S('<path d="M3 19 21 5"/><circle cx="12" cy="12" r="2.8" fill="var(--btn, #fff)"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  'dim-dist': S('<path d="M3 12h18M3 8v8M21 8v8M3 12l4-2.5M3 12l4 2.5M21 12l-4-2.5M21 12l-4 2.5"/>'),
  'dim-ang': S('<path d="M4 20 20 20M4 20 17 7"/><path d="M12 20a8 8 0 0 0-2.4-5.7"/>'),
  'dim-rad': S('<circle cx="12" cy="12" r="9"/><path d="M12 12l6.4-6.4"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>'),
  'hatch': S('<path d="M4 4h16v16H4z"/><path d="M4 12 12 4M4 20 20 4M12 20l8-8" opacity=".8"/>'),
  'linetype': S('<path d="M2 12h5M10 12h4M17 12h1M21 12h1"/>'),
  'palette': S('<circle cx="8" cy="9" r="2" fill="currentColor"/><circle cx="14" cy="7" r="2" fill="currentColor"/><circle cx="17.5" cy="12" r="2" fill="currentColor"/><path d="M12 21a9 9 0 1 1 9-9c0 3-3 3-5 3-2 0-2.5 3-1.5 4.5.5.8.2 1.5-2.5 1.5z"/>'),
  svg: S('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 16l2-4 2 4"/>'),
  dxf: S('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13l8 6M8 19l8-6" opacity=".6"/>'),
  labels: S('<path d="M4 7h16M4 12h10M4 17h16"/>'),
};

const generic = { undo, redo, trash, fit, grid, magnet, eye, hand, save, 'folder-open': folderOpen, 'file-plus': filePlus, image, download, lock, equal, select: pointer, circle, ruler, 'pencil-ruler': pencilRuler, menu, unlock, 'list-tree': listTree, help, copy, paste };

function clean(raw) {
  // quita comentarios de licencia y atributos de tamano; el CSS fija el tamano
  // solo en la etiqueta <svg> raiz: los <rect> internos si necesitan su width/height
  return raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(width|height|class)="[^"]*"/g, ''))
    .trim();
}

export const ICONS = { ...Object.fromEntries(Object.entries(generic).map(([k, v]) => [k, clean(v)])), ...custom };

export function iconSvg(name) {
  return ICONS[name] || '';
}
