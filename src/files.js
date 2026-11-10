// Nombres de archivo para guardar y exportar (sin DOM).
// Quita caracteres no validos y la extension si el usuario la tecleo; devuelve '' si no queda nada.
export function cleanFileBase(input, ext) {
  let s = String(input ?? '').replace(/[\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  const re = new RegExp('\.' + ext.replace(/[^a-z0-9]/gi, '') + '$', 'i');
  s = s.replace(re, '').replace(/^\.+/, '').replace(/[. ]+$/, '').trim();
  return s.slice(0, 120);
}
