/**
 * media.js — Cámara y dictado.
 *
 * Fotos: entran por <input type="file" capture="environment">, que en el
 * celular abre la cámara directamente. Es más confiable que getUserMedia
 * dentro de un pabellón, y no pide permisos persistentes.
 *
 * Las fotos se reducen antes de guardarse: en una feria se sacan cientos y
 * el almacenamiento del navegador no es infinito.
 *
 * Dictado: se graba el audio y se guarda local. La transcripción la hace el
 * servidor propio al sincronizar — en el stand no hay red, y no se puede
 * depender de un servicio de Google. Mientras tanto el comprador puede
 * escribir los valores, que es lo que la app calcula.
 */

import * as db from './db.js';
import { leerDictadoTexto } from './dictado.js';

/**
 * Lectura del dictado. Está en `dictado.js`, compartido con el servidor:
 * acá se usa sobre lo que el comprador escribe, allá sobre lo que devuelve
 * la transcripción del audio. Una sola implementación.
 */
export const leerDictado = leerDictadoTexto;

const MAX_LADO = 1280;
const CALIDAD = 0.78;

/** Reduce una imagen y la guarda en IndexedDB. Devuelve el id del media. */
export function guardarFoto(file, meta) {
  return reducir(file).then((blob) => {
    const id = db.nuevoId('img');
    return db.putMedia(id, blob, Object.assign({ tipo: 'foto' }, meta || {}))
      .then(() => id);
  });
}

function reducir(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;
      const escala = Math.min(1, MAX_LADO / Math.max(width, height));
      width = Math.round(width * escala);
      height = Math.round(height * escala);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob(
        (blob) => resolve(blob || file),
        'image/jpeg',
        CALIDAD
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/* ---------- audio ---------- */

export function soportaDictado() {
  return !!(navigator.mediaDevices && window.MediaRecorder);
}

export class Grabador {
  constructor() {
    this.rec = null;
    this.chunks = [];
    this.stream = null;
  }

  iniciar() {
    return navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      this.stream = stream;
      this.chunks = [];
      this.rec = new MediaRecorder(stream);
      this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
      this.rec.start();
      return true;
    });
  }

  /** Detiene la grabación y guarda el audio. Devuelve el id del media. */
  detener() {
    return new Promise((resolve, reject) => {
      if (!this.rec) return resolve(null);

      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
        if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
        const id = db.nuevoId('aud');
        db.putMedia(id, blob, { tipo: 'dictado', duracionMs: null })
          .then(() => resolve(id))
          .catch(reject);
      };

      try { this.rec.stop(); } catch (e) { resolve(null); }
    });
  }

  cancelar() {
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); } catch (e) { /* noop */ }
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.rec = null;
    this.chunks = [];
  }
}
