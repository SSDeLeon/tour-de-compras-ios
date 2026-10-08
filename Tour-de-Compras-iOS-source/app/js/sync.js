/**
 * sync.js — Cola de salida hacia el servidor propio.
 *
 * Nada sale del teléfono en el momento. Lo que se carga en el stand se
 * encola y viaja cuando hay red. El envío del mail al vendedor lo hace el
 * SERVIDOR, no el teléfono: en China no se puede contar con Gmail ni con
 * apps de mensajería, y el teléfono puede estar días sin conexión estable.
 *
 * El endpoint se configura en config.js. Mientras no haya servidor, la
 * exportación a archivo permite sacar todo lo cargado y llevarlo a mano.
 */

import * as db from './db.js';
import { API_BASE } from './config.js';

export function hayPendientes() {
  return db.pendientes().then((p) => p.length);
}

/** Empuja la cola al servidor. Silencioso si no hay red: se reintenta. */
export function sincronizar() {
  if (!navigator.onLine || !API_BASE) {
    return Promise.resolve({ enviados: 0, motivo: navigator.onLine ? 'sin-servidor' : 'sin-red' });
  }

  return db.pendientes().then((items) => {
    let enviados = 0;

    const siguiente = (i) => {
      if (i >= items.length) return Promise.resolve({ enviados });
      const item = items[i];

      return armarPaquete(item)
        .then((body) => fetch(`${API_BASE}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }))
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return db.quitarDeCola(item.id);
        })
        .then(() => { enviados++; return siguiente(i + 1); })
        .catch(() => ({ enviados, motivo: 'error-red' })); // corta y reintenta luego
    };

    return siguiente(0);
  });
}

function armarPaquete(item) {
  if (item.tipo !== 'orden.cerrada') {
    return Promise.resolve({ tipo: item.tipo, payload: item.payload });
  }

  const { ordenId } = item.payload;

  return db.get('ordenes', ordenId).then((orden) => {
    if (!orden) return { tipo: item.tipo, payload: item.payload };

    return Promise.all([
      db.get('proveedores', orden.proveedorId),
      db.get('ferias', orden.feriaId),
      db.byIndex('productos', 'proveedorId', orden.proveedorId)
    ]).then(([proveedor, feria, productos]) => ({
      tipo: 'orden.cerrada',
      orden,
      proveedor,
      feria,
      productos: productos.map((p) => {
        const copia = Object.assign({}, p);
        delete copia.fotoMediaId;   // las fotos suben aparte, son pesadas
        delete copia.audioMediaId;
        return copia;
      })
    }));
  });
}

/**
 * Exportación completa a archivo. Sirve como respaldo y como puente
 * mientras el servidor no esté. Las fotos y audios no entran acá: van
 * por separado cuando hay red.
 */
export function exportarJSON() {
  return Promise.all([
    db.all('ferias'),
    db.all('proveedores'),
    db.all('productos'),
    db.all('ordenes')
  ]).then(([ferias, proveedores, productos, ordenes]) => {
    const data = {
      exportadoEn: new Date().toISOString(),
      version: 1,
      ferias, proveedores, productos, ordenes
    };
    return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  });
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
