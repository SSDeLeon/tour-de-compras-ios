/**
 * config.js — Lo único que hay que tocar para conectar la app al servidor.
 *
 * API_BASE vacío = la app funciona 100% local (todo en el teléfono) y la
 * salida es por exportación a archivo. Cuando el servidor propio esté
 * levantado, poner acá su URL y la cola empieza a viajar sola.
 *
 * Importante: dominio propio. Nada de servicios de Google, que en China
 * están bloqueados.
 */

export const API_BASE = '';

/** Capacidad útil por defecto, en m³. Editable en cada orden. */
export const CAPACIDAD_DEFECTO = 68;

/** Horas de espera para la confirmación de la proforma por el proveedor. */
export const HORAS_CONFIRMACION = 96;

/** Días antes del ETD en que se avisa para reclamar el embarque. */
export const DIAS_AVISO_EMBARQUE = 30;
