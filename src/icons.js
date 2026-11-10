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
  'arc-3': S('<path d="M4 19Q12 1 20 19"/><circle cx="4" cy="19" r="1.8" fill="currentColor"/><circle cx="12" cy="10" r="1.8" fill="currentColor"/><circle cx="20" cy="19" r="1.8" fill="currentColor"/>'),
  // dividir: tramos separados por puntos (_._._)
  split: S('<path d="M1.5 14H6"/><circle cx="8" cy="14" r="1.7" fill="currentColor"/><path d="M10 14h4"/><circle cx="16" cy="14" r="1.7" fill="currentColor"/><path d="M18 14h4.5"/>'),
  text: S('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
  'con-mid': S('<path d="M3 12h18"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M3 8v8M21 8v8M8 9.5v5M16 9.5v5" opacity=".45"/>'),
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

const generic = { undo, redo, trash, fit, grid, magnet, eye, hand, save, 'folder-open': folderOpen, 'file-plus': filePlus, image, download, lock, equal, select: pointer, circle, ruler, 'pencil-ruler': pencilRuler };

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
