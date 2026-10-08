/**
 * model.js — Entidades y cálculos del negocio.
 *
 * Reglas que vienen de la bitácora del proyecto:
 *  - La feria es una entidad propia. Cada producto queda ligado a la feria
 *    donde se identificó, y eso arma el histórico año a año.
 *  - El contenedor se arma POR PROVEEDOR.
 *  - Todo se carga en el stand: FOB, CBM, MOQ, plazo, condiciones, OEM.
 *  - El producto se identifica con el código del proveedor. El SKU propio y
 *    el código de barra se cargan después, ya confirmada la orden (etapa 4).
 *  - Estados de la orden: abierta → cerrada → conformada → confirmada.
 *    Cerrada no es comprada.
 */

import * as db from './db.js';

/* ---------- contenedores ---------- */

/**
 * Capacidad nominal en m³. La capacidad útil real siempre es menor porque
 * la carga no se acomoda perfecta; por eso cada orden guarda su propia
 * capacidad útil, editable por el comprador.
 */
export const CONTENEDORES = {
  "20GP":  { nombre: "20' estándar",   nominal: 33, util: 30 },
  "40GP":  { nombre: "40' estándar",   nominal: 67, util: 60 },
  "40HQ":  { nombre: "40' high cube",  nominal: 76, util: 68 }
};

export const ESTADOS_ORDEN = ['abierta', 'cerrada', 'conformada', 'confirmada'];

/* ---------- origen de compra ---------- */

/**
 * RN-01: toda compra tiene un origen. La feria es uno de ellos, el más
 * exigente, pero no el único: también se compra visitando la fábrica, a
 * distancia por mail o WeChat, y reponiendo a un proveedor conocido.
 *
 * El almacén se llama 'ferias' y el campo `feriaId` por historia del
 * proyecto. Es el origen. No renombrar sin migrar los datos.
 */
export const TIPOS_ORIGEN = {
  feria:      { nombre: 'Feria o exposición', pideUbicacion: true },
  visita:     { nombre: 'Visita a fábrica',   pideUbicacion: false },
  remoto:     { nombre: 'A distancia',        pideUbicacion: false },
  reposicion: { nombre: 'Reposición',         pideUbicacion: false }
};

export function crearFeria({ nombre, ciudad, desde, hasta, moneda = 'USD', tipo = 'feria' }) {
  return db.put('ferias', {
    id: db.nuevoId('fer'),
    nombre,
    tipo: TIPOS_ORIGEN[tipo] ? tipo : 'feria',
    ciudad: ciudad || '',
    desde: desde || '',
    hasta: hasta || '',
    moneda,
    anio: desde ? Number(String(desde).slice(0, 4)) : new Date().getFullYear(),
    creadaEn: Date.now()
  });
}

export function listarFerias() {
  return db.all('ferias').then((f) => f.sort((a, b) => b.creadaEn - a.creadaEn));
}

/** ¿Este origen pide hall y número de stand? Solo las ferias (RN-01). */
export function pideUbicacion(origen) {
  const t = TIPOS_ORIGEN[(origen && origen.tipo) || 'feria'];
  return !!(t && t.pideUbicacion);
}

export function nombreTipo(origen) {
  const t = TIPOS_ORIGEN[(origen && origen.tipo) || 'feria'];
  return t ? t.nombre : 'Feria o exposición';
}

/* ---------- proveedor ---------- */

/**
 * RN-21: en el stand no se tipea nada obligatorio.
 *
 * Un proveedor se puede crear con la sola foto de la tarjeta. Si no tiene
 * nombre todavía, se le pone uno provisional con la ubicación —que es como
 * el comprador lo va a reconocer igual— y queda marcado para completar.
 *
 * El nombre real llega después: de la lectura de la tarjeta, o a mano al
 * volver al hotel. Lo que no puede pasar es que el comprador se quede
 * tipeando mientras el vendedor espera.
 */
export function nombreProvisional({ hall, stand, orden }) {
  const ubic = [hall, stand].filter(Boolean).join(' ');
  return ubic ? `Sin identificar · ${ubic}` : `Sin identificar · ${orden || 1}`;
}

export function crearProveedor({
  feriaId, empresa, contacto, mail, telefono,
  hall, stand, oem = false, rubro = '', tarjetaMediaId = null, notas = ''
}) {
  const sinNombre = !String(empresa || '').trim();

  return db.put('proveedores', {
    id: db.nuevoId('prv'),
    feriaId,
    empresa: empresa || '',
    pendienteDatos: sinNombre,   // RN-21: se completa después, no en el stand
    contacto: contacto || '',
    mail: mail || '',
    telefono: telefono || '',
    hall: hall || '',
    stand: stand || '',
    oem: !!oem,
    rubro,
    tarjetaMediaId,
    notas,
    creadoEn: Date.now()
  });
}

export function proveedoresDeFeria(feriaId) {
  return db.byIndex('proveedores', 'feriaId', feriaId)
    .then((p) => p.sort((a, b) => b.creadoEn - a.creadoEn));
}

/** Cómo mostrar al proveedor mientras no tenga nombre real (RN-21). */
export function nombreProveedor(p) {
  if (!p) return '';
  if (String(p.empresa || '').trim()) return p.empresa;
  return nombreProvisional({ hall: p.hall, stand: p.stand });
}

/** Proveedores de la feria a los que les falta completar datos (RN-21). */
export function pendientesDeCompletar(feriaId) {
  return proveedoresDeFeria(feriaId)
    .then((ps) => ps.filter((p) => p.pendienteDatos || !p.mail));
}

/* ---------- producto ---------- */

export function crearProducto({
  feriaId, proveedorId, descripcion, codigoProveedor,
  fob, cbm, moq, cantidad, plazoDias, pago, color, oem = false,
  rubro = '', fotoMediaId = null, audioMediaId = null, dictado = '', notas = ''
}) {
  return db.put('productos', {
    id: db.nuevoId('prd'),
    feriaId,
    proveedorId,
    descripcion: descripcion || '',
    codigoProveedor: codigoProveedor || '',
    fob: num(fob),
    cbm: num(cbm),
    moq: num(moq),
    cantidad: num(cantidad),
    plazoDias: num(plazoDias),
    pago: pago || '',
    color: color || '',
    oem: !!oem,
    rubro,
    fotoMediaId,
    audioMediaId,
    dictado,          // texto dictado en crudo; el servidor lo transcribe
    notas,
    skuPropio: '',    // se completa después de confirmada la orden
    codigoBarra: '',  // idem
    creadoEn: Date.now()
  });
}

export function productosDeProveedor(proveedorId) {
  return db.byIndex('productos', 'proveedorId', proveedorId)
    .then((p) => p.sort((a, b) => a.creadoEn - b.creadoEn));
}

export function productosDeFeria(feriaId) {
  return db.byIndex('productos', 'feriaId', feriaId);
}

/* ---------- orden de compra (= proforma) ---------- */

export function ordenDeProveedor(proveedorId) {
  return db.byIndex('ordenes', 'proveedorId', proveedorId).then((o) => o[0] || null);
}

export function asegurarOrden(feriaId, proveedorId, rubro = '') {
  return ordenDeProveedor(proveedorId).then((existente) => {
    if (existente) return existente;
    return db.put('ordenes', {
      id: db.nuevoId('ord'),
      numero: '',              // lo asigna el servidor al sincronizar
      feriaId,
      proveedorId,
      rubro,
      estado: 'abierta',
      tipoContenedor: '40HQ',
      capacidadUtil: CONTENEDORES['40HQ'].util,
      pago: '',
      etdNegociado: '',        // se guardan los dos ETD: el negociado…
      etdReal: '',             // …y el real que confirma el proveedor
      eta: '',
      margenAtrasoDias: 10,
      penalidad: '',           // a definir; queda escrita en la proforma
      compradorId: compradorActual(),
      cerradaEn: null,
      creadaEn: Date.now()
    });
  });
}

/**
 * Cerrar la orden. Cerrada no es comprada: la compra se confirma después,
 * con la aprobación del presupuesto o al regreso del viaje.
 * Una vez cerrada, solo la puede modificar el comprador que la armó.
 */
export function cerrarOrden(orden) {
  const actualizada = Object.assign({}, orden, {
    estado: 'cerrada',
    cerradaEn: Date.now()
  });
  return db.put('ordenes', actualizada)
    .then(() => db.encolar('orden.cerrada', { ordenId: actualizada.id }))
    .then(() => actualizada);
}

export function puedeEditar(orden) {
  if (!orden) return false;
  if (orden.estado === 'abierta') return true;
  return orden.compradorId === compradorActual();
}

/* ---------- cálculos ---------- */

export function totalesDeProductos(productos) {
  let usd = 0, cbm = 0, unidades = 0;
  productos.forEach((p) => {
    const cant = p.cantidad || 0;
    usd += (p.fob || 0) * cant;
    cbm += (p.cbm || 0) * cant;
    unidades += cant;
  });
  return {
    usd: redondear(usd, 2),
    cbm: redondear(cbm, 3),
    unidades,
    items: productos.length
  };
}

export function llenadoContenedor(cbm, capacidadUtil) {
  const cap = capacidadUtil || CONTENEDORES['40HQ'].util;
  const contenedores = cap > 0 ? Math.ceil(cbm / cap) : 0;
  const enElUltimo = contenedores > 0 ? cbm - cap * (contenedores - 1) : 0;
  const porcentaje = cap > 0 ? Math.min(100, (enElUltimo / cap) * 100) : 0;
  return {
    contenedores,
    capacidad: cap,
    enElUltimo: redondear(enElUltimo, 2),
    falta: redondear(Math.max(0, cap - enElUltimo), 2),
    porcentaje: redondear(porcentaje, 1)
  };
}

/** Lo comprado en la feria, sumando las órdenes de todos los proveedores. */
export function resumenFeria(feriaId) {
  return Promise.all([
    productosDeFeria(feriaId),
    db.byIndex('ordenes', 'feriaId', feriaId)
  ]).then(([productos, ordenes]) => {
    const t = totalesDeProductos(productos);
    return {
      usd: t.usd,
      cbm: t.cbm,
      items: t.items,
      ordenes: ordenes.length,
      cerradas: ordenes.filter((o) => o.estado !== 'abierta').length
    };
  });
}

/* ---------- comprador ---------- */

/**
 * Identidad local del comprador. Dos compradores pueden trabajar en la misma
 * feria compartiendo la base de productos y proveedores, pero cada orden es
 * de quien la armó: nadie más la modifica.
 * Al haber servidor, esto lo reemplaza el usuario autenticado.
 */
export function compradorActual() {
  try {
    let id = localStorage.getItem('tc_comprador_id');
    if (!id) {
      id = db.nuevoId('usr');
      localStorage.setItem('tc_comprador_id', id);
    }
    return id;
  } catch (e) {
    return 'usr_local';
  }
}

export function nombreComprador(nuevo) {
  try {
    if (typeof nuevo === 'string') localStorage.setItem('tc_comprador_nombre', nuevo);
    return localStorage.getItem('tc_comprador_nombre') || '';
  } catch (e) {
    return '';
  }
}

/* ---------- helpers ---------- */

export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function redondear(n, dec) {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}

export function usd(n) {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(n || 0);
}

export function miles(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);
}

export function decimales(n, d) {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: d, maximumFractionDigits: d
  }).format(n || 0);
}

/* ---------- catálogo del proveedor ---------- */

/**
 * RN-20: un catálogo propone productos, no los crea.
 *
 * Las páginas pueden venir de un PDF o de fotos sacadas en el stand. Lo
 * segundo es lo más común: muchos proveedores solo tienen el catálogo
 * impreso y te lo muestran ahí mismo.
 *
 * En el stand se fotografía y listo. La lectura la hace el servidor al
 * sincronizar (RN-18), y el comprador después elige qué le interesa.
 */
export function crearCatalogo({ feriaId, proveedorId, nombre = '' }) {
  return db.put('catalogos', {
    id: db.nuevoId('cat'),
    feriaId,
    proveedorId,
    nombre,
    paginas: [],        // ids de media, en el orden en que se fotografiaron
    archivos: [],       // cotizaciones o catálogos adjuntos (RN-24)
    origen: 'fotos',    // fotos | pdf | link
    enviado: false,
    creadoEn: Date.now()
  });
}

export function agregarPagina(catalogo, mediaId) {
  const actualizado = Object.assign({}, catalogo, {
    paginas: catalogo.paginas.concat([mediaId])
  });
  return db.put('catalogos', actualizado);
}

export function quitarUltimaPagina(catalogo) {
  const paginas = catalogo.paginas.slice(0, -1);
  return db.put('catalogos', Object.assign({}, catalogo, { paginas }));
}

export function catalogosDeProveedor(proveedorId) {
  return db.byIndex('catalogos', 'proveedorId', proveedorId)
    .then((c) => c.sort((a, b) => b.creadoEn - a.creadoEn));
}

/** Deja el catálogo listo para que el servidor lo lea al sincronizar. */
export function cerrarCatalogo(catalogo) {
  const archivos = catalogo.archivos || [];
  if (!catalogo.paginas.length && !archivos.length) return Promise.resolve(catalogo);

  const listo = Object.assign({}, catalogo, { enviado: true });
  return db.put('catalogos', listo)
    .then(() => db.encolar('catalogo.nuevo', {
      catalogoId: listo.id,
      proveedorId: listo.proveedorId,
      paginas: listo.paginas,
      archivos: listo.archivos || []
    }))
    .then(() => listo);
}

/**
 * RN-24: adjuntar una cotización o un catálogo en archivo.
 *
 * Un Excel o un CSV se leen exacto, celda por celda: los números que traen
 * NO son borrador. Un PDF hay que interpretarlo, así que lo que salga de
 * ahí sí se confirma (RN-19).
 */
const EXACTOS = ['.xlsx', '.xls', '.csv', '.tsv'];

export function esExacto(nombre) {
  const n = String(nombre || '').toLowerCase();
  return EXACTOS.some((ext) => n.endsWith(ext));
}

export function adjuntarArchivo(catalogo, file) {
  const id = db.nuevoId('arch');

  return db.putMedia(id, file, { tipo: 'documento', nombre: file.name })
    .then(() => {
      const archivos = (catalogo.archivos || []).concat([{
        mediaId: id,
        nombre: file.name,
        exacto: esExacto(file.name),       // decide cómo lo lee el servidor
        bytes: file.size
      }]);
      return db.put('catalogos', Object.assign({}, catalogo, { archivos }));
    });
}

/** Cómo se describe un documento en la lista: páginas y archivos. */
export function resumenDocumento(c) {
  const partes = [];
  if (c.paginas.length) {
    partes.push(`${c.paginas.length} página${c.paginas.length === 1 ? '' : 's'}`);
  }
  const archivos = c.archivos || [];
  if (archivos.length) {
    partes.push(`${archivos.length} archivo${archivos.length === 1 ? '' : 's'}`);
  }
  return partes.join(' · ') || 'vacío';
}
