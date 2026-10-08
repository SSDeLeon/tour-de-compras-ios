/**
 * db.js — Almacenamiento local (IndexedDB).
 *
 * Todo lo que se carga en el stand vive acá primero. La app tiene que
 * funcionar sin señal: en el predio de una feria en China no hay red
 * confiable y, además, Google y WhatsApp están bloqueados. Nada de lo que
 * pasa en el stand puede depender de una conexión.
 *
 * Almacenes:
 *   catalogos   — catálogos del proveedor, con sus páginas fotografiadas.
 *   ferias      — exposiciones. La feria es una entidad, no un contexto:
 *                 cada producto queda ligado a la feria donde se identificó.
 *   proveedores — empresa, contacto, ubicación y número de stand.
 *   productos   — foto, código del proveedor, FOB, CBM, MOQ, plazo.
 *   ordenes     — orden de compra (= proforma). Una por proveedor.
 *   media       — fotos y audios como Blob, referenciados por id.
 *   outbox      — cola de sincronización hacia el servidor propio.
 */

const DB_NAME = 'tour-compras';
const DB_VERSION = 2;

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;

      if (!db.objectStoreNames.contains('ferias')) {
        db.createObjectStore('ferias', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('proveedores')) {
        const s = db.createObjectStore('proveedores', { keyPath: 'id' });
        s.createIndex('feriaId', 'feriaId', { unique: false });
      }

      if (!db.objectStoreNames.contains('productos')) {
        const s = db.createObjectStore('productos', { keyPath: 'id' });
        s.createIndex('proveedorId', 'proveedorId', { unique: false });
        s.createIndex('feriaId', 'feriaId', { unique: false });
      }

      if (!db.objectStoreNames.contains('ordenes')) {
        const s = db.createObjectStore('ordenes', { keyPath: 'id' });
        s.createIndex('feriaId', 'feriaId', { unique: false });
        s.createIndex('proveedorId', 'proveedorId', { unique: false });
      }

      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }

      // RN-20: catálogos del proveedor. Las páginas pueden venir de un PDF o
      // de fotos sacadas en el stand: muchos proveedores solo tienen el
      // catálogo impreso.
      if (!db.objectStoreNames.contains('catalogos')) {
        const s = db.createObjectStore('catalogos', { keyPath: 'id' });
        s.createIndex('proveedorId', 'proveedorId', { unique: false });
      }
    };

    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function put(store, value) {
  return tx(store, 'readwrite').then((s) => wrap(s.put(value))).then(() => value);
}

export function get(store, id) {
  return tx(store, 'readonly').then((s) => wrap(s.get(id)));
}

export function all(store) {
  return tx(store, 'readonly').then((s) => wrap(s.getAll()));
}

export function byIndex(store, index, value) {
  return tx(store, 'readonly').then((s) => wrap(s.index(index).getAll(value)));
}

export function remove(store, id) {
  return tx(store, 'readwrite').then((s) => wrap(s.delete(id)));
}

/* ---------- media: fotos y audios ---------- */

export function putMedia(id, blob, meta) {
  return put('media', { id, blob, meta: meta || {}, creadoEn: Date.now() });
}

export function getMediaUrl(id) {
  if (!id) return Promise.resolve(null);
  return get('media', id).then((m) => (m && m.blob ? URL.createObjectURL(m.blob) : null));
}

/* ---------- outbox: lo que espera al servidor ---------- */

export function encolar(tipo, payload) {
  return put('outbox', { tipo, payload, creadoEn: Date.now(), intentos: 0 });
}

export function pendientes() {
  return all('outbox');
}

export function quitarDeCola(id) {
  return remove('outbox', id);
}

/* ---------- utilidades ---------- */

export function nuevoId(prefijo) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefijo}_${Date.now().toString(36)}_${rnd}`;
}

/**
 * Vacía la base local. Solo para volver a empezar una prueba.
 *
 * No toca el servidor: lo que ya se sincronizó sigue allá. Lo que estaba en
 * la cola sin enviar se pierde, y por eso la interfaz lo pregunta dos veces.
 */
export function borrarTodo() {
  const almacenes = ['ferias', 'proveedores', 'productos', 'ordenes', 'media', 'outbox', 'catalogos'];

  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(almacenes, 'readwrite');
    almacenes.forEach((a) => t.objectStore(a).clear());
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  })).then(() => {
    try {
      localStorage.removeItem('tc_feria_id');
    } catch (e) { /* noop */ }
  });
}
