/**
 * app.js — Interfaz y navegación.
 *
 * Etapa 1: captura offline en el stand.
 *   ferias → feria activa → proveedor → productos → orden en curso.
 *
 * Toda la pantalla de captura está pensada para una mano y poco tiempo:
 * el comprador está sentado frente al vendedor y la negociación no espera.
 */

import * as db from './db.js';
import * as M from './model.js';
import * as media from './media.js';
import * as sync from './sync.js';

const app = document.getElementById('app');
const urlsTemporales = [];

const estado = {
  feriaId: recordar('tc_feria_id'),
  proveedorId: null
};

/* ================= arranque ================= */

document.addEventListener('DOMContentLoaded', () => {
  registrarServiceWorker();
  actualizarBarra();
  window.addEventListener('online', actualizarBarra);
  window.addEventListener('offline', actualizarBarra);
  setInterval(actualizarBarra, 20000);

  if (estado.feriaId) {
    db.get('ferias', estado.feriaId).then((f) => (f ? verFeria(f.id) : verFerias()));
  } else {
    verFerias();
  }
});

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Sin service worker la app sigue andando, pero no abre sin conexión.
  });
}

function actualizarBarra() {
  const online = navigator.onLine;
  const est = document.getElementById('conexion');
  est.textContent = online ? 'En línea' : 'Sin señal';
  est.className = online ? 'conn on' : 'conn off';

  sync.hayPendientes().then((n) => {
    const cola = document.getElementById('cola');
    cola.textContent = n ? `${n} en cola` : 'todo guardado';
    cola.className = n ? 'cola pend' : 'cola';
    if (n && online) sync.sincronizar().then(() => { /* silencioso */ });
  });
}

/* ================= utilidades de render ================= */

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function pintar(nodo) {
  urlsTemporales.splice(0).forEach((u) => URL.revokeObjectURL(u));
  app.innerHTML = '';
  app.appendChild(nodo);
  app.scrollTop = 0;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function recordar(clave, valor) {
  try {
    if (valor !== undefined) { localStorage.setItem(clave, valor); return valor; }
    return localStorage.getItem(clave);
  } catch (e) { return null; }
}

function pintarFoto(img, mediaId) {
  if (!mediaId) return;
  db.getMediaUrl(mediaId).then((url) => {
    if (!url) return;
    urlsTemporales.push(url);
    img.src = url;
    img.hidden = false;
  });
}

function cabecera(sobre, titulo, volver) {
  return `
    <header class="head">
      ${volver ? `<button type="button" class="volver" data-volver="${esc(volver)}" aria-label="Volver">‹</button>` : ''}
      <div>
        <div class="k">${esc(sobre)}</div>
        <h1>${esc(titulo)}</h1>
      </div>
    </header>`;
}

/* ================= pantalla: ferias ================= */

function verFerias() {
  M.listarFerias().then((ferias) => {
    const lista = ferias.length
      ? ferias.map((f) => `
          <button type="button" class="fila" data-feria="${f.id}">
            <span class="nm">${esc(f.nombre)}
              <span class="sub">${esc(M.nombreTipo(f))}${f.ciudad ? ' · ' + esc(f.ciudad) : ''}${f.anio ? ' · ' + f.anio : ''}</span>
            </span>
            <span class="chev">›</span>
          </button>`).join('')
      : `<p class="vacio">Todavía no cargaste ningún origen. Creá el primero para empezar.</p>`;

    const v = h(`
      <section class="view">
        ${cabecera('Tour de compras', 'Dónde comprás')}
        <div class="body">
          <div class="lista">${lista}</div>

          <form class="card" id="form-feria">
            <div class="sec">Nuevo origen de compra</div>
            <label class="f"><span>Tipo</span>
              <select name="tipo" id="tipo-origen">
                ${Object.keys(M.TIPOS_ORIGEN).map((k) =>
                  `<option value="${k}">${esc(M.TIPOS_ORIGEN[k].nombre)}</option>`).join('')}
              </select></label>
            <label class="f"><span>Nombre</span>
              <input name="nombre" required placeholder="Canton Fair · Fase 2"></label>
            <div id="campos-feria">
              <label class="f"><span>Ciudad</span>
                <input name="ciudad" placeholder="Guangzhou"></label>
              <div class="dos" style="margin-top:11px">
                <label class="f"><span>Desde</span><input type="date" name="desde"></label>
                <label class="f"><span>Hasta</span><input type="date" name="hasta"></label>
              </div>
            </div>
            <p class="nota">No toda compra nace en una feria: también se compra visitando la fábrica, a distancia o reponiendo a un proveedor conocido.</p>
            <button class="btn" type="submit">Crear</button>
          </form>

          <div class="card">
            <div class="sec">Comprador</div>
            <label class="f"><span>Tu nombre</span>
              <input id="nombre-comprador" value="${esc(M.nombreComprador())}" placeholder="Fabián Lucero"></label>
            <p class="nota">Cada orden queda a nombre de quien la arma. Nadie más la modifica.</p>
          </div>

          <details class="desplegable">
            <summary>Mantenimiento</summary>
            <div class="card" style="margin-top:10px">
              <p class="nota">Borra todo lo cargado en este teléfono: ferias, proveedores,
                productos, órdenes y fotos. Lo que ya se sincronizó queda en el servidor;
                lo que estaba en la cola sin enviar se pierde.</p>
              <button type="button" class="btn ghost peligro" id="borrar-todo">Borrar todo y empezar de nuevo</button>
            </div>
          </details>
        </div>
      </section>`);

    v.querySelectorAll('[data-feria]').forEach((b) => {
      b.addEventListener('click', () => verFeria(b.dataset.feria));
    });

    v.querySelector('#nombre-comprador').addEventListener('change', (e) => {
      M.nombreComprador(e.target.value.trim());
    });

    // Borrar es irreversible: se pregunta dos veces, y la segunda dice
    // exactamente cuánto se pierde.
    v.querySelector('#borrar-todo').addEventListener('click', () => {
      if (!confirm('¿Borrar todo lo cargado en este teléfono?')) return;

      Promise.all([db.all('ordenes'), db.all('productos'), db.pendientes()])
        .then(([ordenes, productos, cola]) => {
          const resumen = `${ordenes.length} orden(es), ${productos.length} producto(s)`
            + (cola.length ? ` y ${cola.length} sin sincronizar` : '');
          if (!confirm(`Se van a borrar ${resumen}.\n\nEsto no se puede deshacer.`)) return;

          db.borrarTodo().then(() => {
            estado.feriaId = null;
            estado.proveedorId = null;
            actualizarBarra();
            verFerias();
          });
        });
    });

    // Ciudad y fechas solo tienen sentido en una feria (RN-01).
    const selTipo = v.querySelector('#tipo-origen');
    const camposFeria = v.querySelector('#campos-feria');
    selTipo.addEventListener('change', () => {
      camposFeria.hidden = !M.pideUbicacion({ tipo: selTipo.value });
    });

    v.querySelector('#form-feria').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      if (!d.nombre) return;
      M.crearFeria(d).then((f) => verFeria(f.id));
    });

    pintar(v);
  });
}

/* ================= pantalla: feria activa ================= */

function verFeria(feriaId) {
  estado.feriaId = feriaId;
  recordar('tc_feria_id', feriaId);

  Promise.all([
    db.get('ferias', feriaId),
    M.proveedoresDeFeria(feriaId),
    M.resumenFeria(feriaId)
  ]).then(([feria, proveedores, res]) => {
    const filas = proveedores.length
      ? proveedores.map((p) => `
          <button type="button" class="fila" data-prov="${p.id}">
            <span class="nm">${esc(M.nombreProveedor(p))}${p.pendienteDatos ? ' <span class="falta">faltan datos</span>' : ''}
              <span class="sub">${esc([p.hall, p.stand].filter(Boolean).join(' · '))}${p.rubro ? ' · ' + esc(p.rubro) : ''}</span>
            </span>
            <span class="chev">›</span>
          </button>`).join('')
      : `<p class="vacio">Sin proveedores cargados todavía.</p>`;

    const v = h(`
      <section class="view">
        ${cabecera(M.nombreTipo(feria), feria.nombre, 'ferias')}
        <div class="body">
          <div class="tiles">
            <div class="tile"><div class="lab">Comprado</div><div class="val">${M.miles(res.usd)}<small> usd</small></div></div>
            <div class="tile"><div class="lab">CBM</div><div class="val">${M.decimales(res.cbm, 1)}</div></div>
            <div class="tile"><div class="lab">Órdenes</div><div class="val">${res.ordenes}</div></div>
          </div>

          <div class="sec">Proveedores</div>
          <div class="lista">${filas}</div>
        </div>
        <div class="foot">
          <button type="button" class="btn" id="nuevo-prov">Nuevo proveedor</button>
        </div>
      </section>`);

    v.querySelector('[data-volver]').addEventListener('click', verFerias);
    v.querySelector('#nuevo-prov').addEventListener('click', () => verProveedorNuevo(feriaId));
    v.querySelectorAll('[data-prov]').forEach((b) => {
      b.addEventListener('click', () => verProveedor(b.dataset.prov));
    });

    pintar(v);
  });
}

/* ================= pantalla: nuevo proveedor ================= */

function verProveedorNuevo(feriaId) {
  db.get('ferias', feriaId).then((origen) => pintarProveedorNuevo(feriaId, origen));
}

function pintarProveedorNuevo(feriaId, origen) {
  let tarjetaMediaId = null;
  const enFeria = M.pideUbicacion(origen);   // RN-01: hall y stand solo en feria

  const v = h(`
    <section class="view">
      ${cabecera('Paso 1 · alta', enFeria ? 'Tarjeta del vendedor' : 'Nuevo proveedor', 'feria')}
      <div class="body">
        <div class="captura">
          <img id="prev-tarjeta" alt="" hidden>
          <span class="captura-txt" id="texto-tarjeta">${enFeria ? 'Tarjeta del vendedor' : 'Foto de la tarjeta (opcional)'}</span>
        </div>
        <input type="file" accept="image/*" capture="environment" id="foto-tarjeta-camara" hidden>
        <input type="file" accept="image/*" id="foto-tarjeta-galeria" hidden>
        <div class="dos acciones-foto">
          <button type="button" class="btn" id="sacar-tarjeta">Sacar foto</button>
          <button type="button" class="btn ghost" id="buscar-tarjeta">Elegir de galería</button>
        </div>

        <form id="form-prov">
          ${enFeria ? `
          <div class="card" style="margin-bottom:12px">
            <div class="dos">
              <label class="f"><span>Hall</span><input name="hall" inputmode="text" placeholder="4.1"></label>
              <label class="f"><span>Stand</span><input name="stand" inputmode="text" placeholder="C22"></label>
            </div>
            <p class="nota">Lo único que conviene poner acá: es lo que te permite volver al stand durante la feria.</p>
          </div>` : ''}

          <button class="btn" type="submit" id="seguir">Cargar productos</button>

          <details class="desplegable">
            <summary>Datos del proveedor</summary>
            <div class="card" style="margin-top:10px">
              <label class="f"><span>Empresa</span><input name="empresa"></label>
              <label class="f"><span>Contacto</span><input name="contacto"></label>
              <label class="f"><span>Mail</span><input name="mail" type="email" inputmode="email"></label>
              <label class="f"><span>Teléfono</span><input name="telefono" inputmode="tel"></label>
              <label class="f"><span>Rubro</span><input name="rubro" list="rubros" placeholder="Andadores"></label>
              <label class="check"><input type="checkbox" name="oem"> <span>Hace OEM</span></label>
              <p class="nota">Nada de esto hace falta ahora. Se completa al volver, o lo llena la lectura de la tarjeta.</p>
            </div>
          </details>
        </form>
      </div>
    </section>`);

  v.querySelector('[data-volver]').addEventListener('click', () => verFeria(feriaId));

  const inputCamara = v.querySelector('#foto-tarjeta-camara');
  const inputGaleria = v.querySelector('#foto-tarjeta-galeria');
  const prev = v.querySelector('#prev-tarjeta');
  v.querySelector('#sacar-tarjeta').addEventListener('click', () => inputCamara.click());
  v.querySelector('#buscar-tarjeta').addEventListener('click', () => inputGaleria.click());

  const guardarTarjetaElegida = (input) => {
    const file = input.files && input.files[0];
    if (!file) return;
    media.guardarFoto(file, { de: 'tarjeta' }).then((id) => {
      tarjetaMediaId = id;
      pintarFoto(prev, id);
      v.querySelector('#texto-tarjeta').textContent = 'Tarjeta guardada';
      input.value = '';
    });
  };
  inputCamara.addEventListener('change', () => guardarTarjetaElegida(inputCamara));
  inputGaleria.addEventListener('change', () => guardarTarjetaElegida(inputGaleria));

  // RN-21: en el stand no se tipea nada obligatorio. Con la foto alcanza.
  v.querySelector('#form-prov').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = Object.fromEntries(f.entries());

    if (!tarjetaMediaId && !String(datos.empresa || '').trim()) {
      const seguir = confirm(
        'No sacaste la foto de la tarjeta ni pusiste el nombre.\n\n' +
        'Después no vas a poder identificar a este proveedor. ¿Seguís igual?'
      );
      if (!seguir) return;
    }

    M.crearProveedor({
      feriaId,
      empresa: datos.empresa,
      contacto: datos.contacto,
      mail: datos.mail,
      telefono: datos.telefono,
      hall: datos.hall,
      stand: datos.stand,
      rubro: datos.rubro,
      oem: f.get('oem') === 'on',
      tarjetaMediaId
    }).then((p) => M.asegurarOrden(feriaId, p.id, p.rubro).then(() => verProducto(p.id)));
  });

  pintar(v);
}

/* ================= pantalla: captura de producto ================= */

function verProducto(proveedorId) {
  estado.proveedorId = proveedorId;
  let fotoMediaId = null;
  let audioMediaId = null;
  const grabador = new media.Grabador();
  let grabando = false;

  Promise.all([
    db.get('proveedores', proveedorId),
    M.productosDeProveedor(proveedorId)
  ]).then(([prov, productos]) => {
    const n = productos.length + 1;

    const v = h(`
      <section class="view">
        ${cabecera(`Producto ${n} · ${M.nombreProveedor(prov)}`, 'Foto y dictado', 'proveedor')}
        <div class="body">
          <label class="captura">
            <input type="file" accept="image/*" capture="environment" id="foto-prod" hidden>
            <img id="prev-prod" alt="" hidden>
            <span class="captura-txt">Fotografiar el producto</span>
          </label>

          <div class="dictado">
            <button type="button" class="mic" id="mic" ${media.soportaDictado() ? '' : 'disabled'}>
              <span class="mic-dot"></span><span id="mic-txt">Dictar</span>
            </button>
            <textarea id="dictado" rows="2" placeholder="42 fob, 0,08 cbm, moq 500, 60 días, 30/70"></textarea>
          </div>
          <p class="nota">El audio se guarda en el teléfono y se transcribe al sincronizar. Lo que escribas acá llena los campos de abajo.</p>

          <form class="card" id="form-prod">
            <label class="f"><span>Descripción</span><input name="descripcion" placeholder="Andador plegable"></label>
            <label class="f"><span>Código del proveedor</span><input name="codigoProveedor" placeholder="BC-9042"></label>
            <div class="dos">
              <label class="f"><span>FOB unitario</span><input name="fob" inputmode="decimal" placeholder="42,00"></label>
              <label class="f"><span>CBM unitario</span><input name="cbm" inputmode="decimal" placeholder="0,080"></label>
            </div>
            <div class="dos">
              <label class="f"><span>MOQ</span><input name="moq" inputmode="numeric" placeholder="500"></label>
              <label class="f"><span>Cantidad</span><input name="cantidad" inputmode="numeric" placeholder="600"></label>
            </div>
            <div class="dos">
              <label class="f"><span>Plazo (días)</span><input name="plazoDias" inputmode="numeric" placeholder="60"></label>
              <label class="f"><span>Pago</span><input name="pago" placeholder="30/70"></label>
            </div>
            <label class="f"><span>Color / diseño</span><input name="color"></label>
            <label class="check"><input type="checkbox" name="oem"> <span>OEM</span></label>
            <button class="btn" type="submit">Confirmar producto</button>
          </form>
        </div>
        <div class="foot">
          <button type="button" class="btn ghost" id="ver-orden">Ver la orden (${productos.length})</button>
        </div>
      </section>`);

    v.querySelector('[data-volver]').addEventListener('click', () => verProveedor(proveedorId));
    v.querySelector('#ver-orden').addEventListener('click', () => verProveedor(proveedorId));

    const input = v.querySelector('#foto-prod');
    const prev = v.querySelector('#prev-prod');
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      media.guardarFoto(file, { de: 'producto' }).then((id) => {
        fotoMediaId = id;
        pintarFoto(prev, id);
        v.querySelector('.captura-txt').textContent = 'Foto guardada · tocar para repetir';
      });
    });

    // dictado
    const mic = v.querySelector('#mic');
    const micTxt = v.querySelector('#mic-txt');
    mic.addEventListener('click', () => {
      if (!grabando) {
        grabador.iniciar().then(() => {
          grabando = true;
          mic.classList.add('rec');
          micTxt.textContent = 'Grabando · tocar para parar';
        }).catch(() => {
          // Sin micrófono el dictado por voz no va, pero la carga sigue:
          // el comprador escribe los valores y la app los lee igual.
          mic.classList.add('sin-micro');
          micTxt.textContent = 'Sin acceso al micrófono · escribí abajo';
        });
      } else {
        grabador.detener().then((id) => {
          audioMediaId = id;
          grabando = false;
          mic.classList.remove('rec');
          micTxt.textContent = 'Dictado guardado';
        });
      }
    });

    // lectura del dictado escrito
    const area = v.querySelector('#dictado');
    area.addEventListener('input', () => {
      const leido = media.leerDictado(area.value);
      const form = v.querySelector('#form-prod');
      Object.keys(leido).forEach((k) => {
        const campo = form.elements[k];
        if (campo && !campo.dataset.tocado) {
          campo.value = String(leido[k]).replace('.', ',');
          campo.classList.add('auto');
        }
      });
    });

    v.querySelectorAll('#form-prod input').forEach((i) => {
      i.addEventListener('input', () => { i.dataset.tocado = '1'; i.classList.remove('auto'); });
    });

    v.querySelector('#form-prod').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const d = Object.fromEntries(f.entries());

      M.crearProducto({
        feriaId: prov.feriaId,
        proveedorId,
        descripcion: d.descripcion,
        codigoProveedor: d.codigoProveedor,
        fob: d.fob, cbm: d.cbm, moq: d.moq, cantidad: d.cantidad,
        plazoDias: d.plazoDias, pago: d.pago, color: d.color,
        oem: f.get('oem') === 'on',
        rubro: prov.rubro,
        fotoMediaId, audioMediaId,
        dictado: area.value
      }).then(() => verProveedor(proveedorId));
    });

    pintar(v);
  });
}

/* ================= pantalla: orden en curso ================= */

function verProveedor(proveedorId) {
  estado.proveedorId = proveedorId;

  Promise.all([
    db.get('proveedores', proveedorId),
    M.productosDeProveedor(proveedorId)
  ]).then(([prov, productos]) =>
    M.asegurarOrden(prov.feriaId, proveedorId, prov.rubro).then((orden) => {
      const t = M.totalesDeProductos(productos);
      const ll = M.llenadoContenedor(t.cbm, orden.capacidadUtil);
      const editable = M.puedeEditar(orden);

      const filas = productos.length
        ? productos.map((p) => `
            <div class="fila estatica">
              <span class="nm">${esc(p.codigoProveedor || '—')} · ${esc(p.descripcion || 'sin descripción')}
                <span class="sub">${M.miles(p.cantidad)} u · ${M.decimales(p.cbm, 3)} cbm · FOB ${M.usd(p.fob)}</span>
              </span>
              <span class="num">${M.miles(p.fob * p.cantidad)}</span>
            </div>`).join('')
        : `<p class="vacio">Sin productos cargados todavía.</p>`;

      const ubic = [prov.hall, prov.stand].filter(Boolean).join(' · ');

      const v = h(`
        <section class="view">
          ${cabecera(`${ubic ? esc(ubic) + ' · ' : ''}${esc(estadoTexto(orden))}`, M.nombreProveedor(prov), 'feria')}
          <div class="body">
            <div class="lista">${filas}</div>

            <div class="medidor">
              <div class="medidor-top">
                <span>Contenedor ${ll.contenedores || 1} · ${esc(M.CONTENEDORES[orden.tipoContenedor].nombre)}</span>
                <b>${M.decimales(ll.enElUltimo, 1)} / ${ll.capacidad} CBM</b>
              </div>
              <div class="llenado"><span style="width:${ll.porcentaje}%"></span></div>
              <p class="nota">${ll.falta > 0
                ? `Faltan ${M.decimales(ll.falta, 1)} CBM para cerrar el contenedor.`
                : 'Contenedor completo.'}</p>
            </div>

            <div class="tiles">
              <div class="tile"><div class="lab">Total</div><div class="val">${M.miles(t.usd)}<small> usd</small></div></div>
              <div class="tile"><div class="lab">CBM</div><div class="val">${M.decimales(t.cbm, 1)}</div></div>
              <div class="tile"><div class="lab">Cont.</div><div class="val">${ll.contenedores}</div></div>
            </div>

            <form class="card" id="form-orden">
              <div class="sec">Condiciones de la orden</div>
              <label class="f"><span>Rubro</span><input name="rubro" value="${esc(orden.rubro)}" list="rubros"></label>
              <div class="dos">
                <label class="f"><span>Contenedor</span>
                  <select name="tipoContenedor">
                    ${Object.keys(M.CONTENEDORES).map((k) => `
                      <option value="${k}" ${k === orden.tipoContenedor ? 'selected' : ''}>${esc(M.CONTENEDORES[k].nombre)}</option>`).join('')}
                  </select></label>
                <label class="f"><span>Capacidad útil</span>
                  <input name="capacidadUtil" inputmode="decimal" value="${orden.capacidadUtil}"></label>
              </div>
              <label class="f"><span>N° de proforma del proveedor</span>
                <input name="numeroProveedor" value="${esc(orden.numeroProveedor || '')}" placeholder="PI-2026-0845"></label>
              <label class="f"><span>Condiciones de pago</span><input name="pago" value="${esc(orden.pago)}" placeholder="30/70"></label>
              <div class="dos">
                <label class="f"><span>ETD negociado</span><input type="date" name="etdNegociado" value="${esc(orden.etdNegociado)}"></label>
                <label class="f"><span>ETA</span><input type="date" name="eta" value="${esc(orden.eta)}"></label>
              </div>
              <div class="dos">
                <label class="f"><span>Margen de atraso (días)</span><input name="margenAtrasoDias" inputmode="numeric" value="${orden.margenAtrasoDias}"></label>
                <label class="f"><span>Penalidad</span><input name="penalidad" value="${esc(orden.penalidad)}" placeholder="a definir"></label>
              </div>
              <button class="btn ghost" type="submit">Guardar condiciones</button>
            </form>

            ${editable ? '' : '<p class="nota aviso">Esta orden la cerró otro comprador. Solo él puede modificarla.</p>'}
          </div>
          <div class="foot foot-tres">
            <button type="button" class="btn ghost" id="catalogo" title="Fotografiar el catálogo del proveedor">Catálogo</button>
            <button type="button" class="btn ghost" id="sumar">Sumar producto</button>
            <button type="button" class="btn" id="cerrar" ${orden.estado !== 'abierta' || !editable ? 'disabled' : ''}>
              ${orden.estado === 'abierta' ? 'Cerrar orden' : 'Orden cerrada'}
            </button>
          </div>
        </section>`);

      v.querySelector('[data-volver]').addEventListener('click', () => verFeria(prov.feriaId));
      v.querySelector('#sumar').addEventListener('click', () => verProducto(proveedorId));
      v.querySelector('#catalogo').addEventListener('click', () => verCatalogo(proveedorId));

      v.querySelector('#form-orden').addEventListener('submit', (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.target).entries());
        const actualizada = Object.assign({}, orden, d, {
          capacidadUtil: M.num(d.capacidadUtil),
          margenAtrasoDias: M.num(d.margenAtrasoDias)
        });
        db.put('ordenes', actualizada).then(() => verProveedor(proveedorId));
      });

      const btnCerrar = v.querySelector('#cerrar');
      btnCerrar.addEventListener('click', () => {
        if (!productos.length) { alert('La orden no tiene productos.'); return; }
        M.cerrarOrden(orden).then(() => { actualizarBarra(); verCierre(orden.id); });
      });

      pintar(v);
    })
  );
}

function estadoTexto(orden) {
  return ({
    abierta: 'abierta',
    cerrada: 'cerrada',
    conformada: 'conformada por el proveedor',
    confirmada: 'compra confirmada'
  })[orden.estado] || orden.estado;
}

/* ================= pantalla: catálogo del proveedor ================= */

/**
 * RN-20: el catálogo propone productos, no los crea.
 *
 * Muchos proveedores solo tienen el catálogo impreso y te lo muestran en el
 * stand. Acá se fotografía página por página, rápido, sin mirar nada más.
 * La lectura la hace el servidor al sincronizar (RN-18) y después el
 * comprador elige qué le interesa.
 */
function verCatalogo(proveedorId) {
  Promise.all([
    db.get('proveedores', proveedorId),
    M.catalogosDeProveedor(proveedorId)
  ]).then(([prov, catalogos]) => {
    const abierto = catalogos.find((c) => !c.enviado);
    const inicio = abierto
      ? Promise.resolve(abierto)
      : M.crearCatalogo({ feriaId: prov.feriaId, proveedorId });

    inicio.then((cat) => pintarCatalogo(prov, cat, catalogos.filter((c) => c.enviado)));
  });
}

function pintarCatalogo(prov, cat, anteriores) {
  const n = cat.paginas.length;
  const archivos = cat.archivos || [];
  const hay = n + archivos.length;

  const listaAnteriores = anteriores.length
    ? `<div>
         <div class="sec">Catálogos ya tomados</div>
         <div class="lista" style="margin-top:7px">
           ${anteriores.map((c) => `
             <div class="fila estatica">
               <span class="nm">${M.resumenDocumento(c)}
                 <span class="sub">esperando lectura del servidor</span>
               </span>
             </div>`).join('')}
         </div>
       </div>`
    : '';

  const v = h(`
    <section class="view">
      ${cabecera(M.nombreProveedor(prov), 'Catálogo y cotizaciones', 'proveedor')}
      <div class="body">
        <label class="captura">
          <input type="file" accept="image/*" capture="environment" id="foto-pagina" multiple hidden>
          <img id="prev-pagina" alt="" hidden>
          <span class="captura-txt">${n ? 'Tocar para la página siguiente' : 'Fotografiar la primera página'}</span>
        </label>

        <div class="tiles">
          <div class="tile" style="grid-column:span 3">
            <div class="lab">Páginas tomadas</div>
            <div class="val" id="cuenta">${n}</div>
          </div>
        </div>

        <p class="nota">Sacá una foto por página, sin apurarte con el encuadre: alcanza
          con que se lean los códigos. El servidor saca una ficha por producto cuando
          haya señal, y vos elegís cuáles te interesan.</p>

        <div class="card">
          <div class="sec">Archivos del proveedor</div>
          <p class="nota">Cotización o catálogo en Excel, CSV o PDF. Un Excel se lee
            exacto, celda por celda; un PDF hay que interpretarlo y queda como borrador.</p>
          <label class="btn ghost adjuntar">
            <input type="file" accept=".xlsx,.xls,.csv,.pdf,application/pdf" id="adjunto" multiple hidden>
            Adjuntar archivo
          </label>
          <div id="lista-adjuntos">${
            (cat.archivos || []).map((a) => `
              <div class="fila estatica">
                <span class="nm">${esc(a.nombre)}
                  <span class="sub">${a.exacto ? 'se lee exacto' : 'se interpreta · queda en borrador'}</span>
                </span>
              </div>`).join('')
          }</div>
        </div>

        ${listaAnteriores}
      </div>
      <div class="foot">
        <button type="button" class="btn ghost" id="deshacer" ${n ? '' : 'disabled'}>Borrar última</button>
        <button type="button" class="btn" id="listo" ${hay ? '' : 'disabled'}>Listo (${hay})</button>
      </div>
    </section>`);

  v.querySelector('[data-volver]').addEventListener('click', () => verProveedor(prov.id));

  const input = v.querySelector('#foto-pagina');
  const prev = v.querySelector('#prev-pagina');

  input.addEventListener('change', () => {
    const archivos = Array.from(input.files || []);
    if (!archivos.length) return;

    // Varias de una: el selector del teléfono permite elegir más de una foto.
    archivos.reduce(
      (cadena, file) => cadena.then(() =>
        media.guardarFoto(file, { de: 'catalogo', catalogoId: cat.id })
          .then((id) => db.get('catalogos', cat.id).then((c) => M.agregarPagina(c, id)))
      ),
      Promise.resolve()
    ).then(() => db.get('catalogos', cat.id))
     .then((c) => pintarCatalogo(prov, c, anteriores));
  });

  if (n) pintarFoto(prev, cat.paginas[n - 1]);

  // RN-24: un Excel se lee exacto; un PDF se interpreta y queda en borrador.
  v.querySelector('#adjunto').addEventListener('change', (e) => {
    const archivos = Array.from(e.target.files || []);
    if (!archivos.length) return;

    archivos.reduce(
      (cadena, file) => cadena.then(() =>
        db.get('catalogos', cat.id).then((c) => M.adjuntarArchivo(c, file))
      ),
      Promise.resolve()
    ).then(() => db.get('catalogos', cat.id))
     .then((c) => pintarCatalogo(prov, c, anteriores));
  });

  v.querySelector('#deshacer').addEventListener('click', () => {
    if (!n) return;
    M.quitarUltimaPagina(cat)
      .then(() => db.get('catalogos', cat.id))
      .then((c) => pintarCatalogo(prov, c, anteriores));
  });

  v.querySelector('#listo').addEventListener('click', () => {
    M.cerrarCatalogo(cat).then(() => {
      actualizarBarra();
      verProveedor(prov.id);
    });
  });

  pintar(v);
}

/* ================= pantalla: orden cerrada ================= */

function verCierre(ordenId) {
  db.get('ordenes', ordenId).then((orden) =>
    Promise.all([
      db.get('proveedores', orden.proveedorId),
      M.productosDeProveedor(orden.proveedorId)
    ]).then(([prov, productos]) => {
      const t = M.totalesDeProductos(productos);
      const ll = M.llenadoContenedor(t.cbm, orden.capacidadUtil);

      const v = h(`
        <section class="view">
          ${cabecera('Orden cerrada', M.nombreProveedor(prov), 'proveedor')}
          <div class="body">
            <div class="ok">✓</div>
            <p class="centro">USD ${M.miles(t.usd)} · ${M.decimales(t.cbm, 1)} CBM · ${ll.contenedores} contenedor${ll.contenedores === 1 ? '' : 'es'}</p>

            <div class="card">
              <div class="sec">Estado</div>
              <div class="flujo">
                <span class="st hecho">Abierta</span><span class="ar">›</span>
                <span class="st ahora">Cerrada</span><span class="ar">›</span>
                <span class="st">Conformada</span><span class="ar">›</span>
                <span class="st">Confirmada</span>
              </div>
              <p class="nota">Cerrada no es comprada. La compra se confirma con la aprobación del presupuesto o al regreso.</p>
            </div>

            <div class="card">
              <div class="sec">Envío al vendedor</div>
              <p class="nota">${prov.mail
                ? `Queda en cola para ${esc(prov.mail)}. La despacha el servidor cuando reciba la orden.`
                : 'El proveedor no tiene mail cargado. Agregalo para que el servidor pueda enviar la orden.'}</p>
            </div>
          </div>
          <div class="foot">
            <button type="button" class="btn" id="volver-feria">Volver a la feria</button>
          </div>
        </section>`);

      v.querySelector('[data-volver]').addEventListener('click', () => verProveedor(prov.id));
      v.querySelector('#volver-feria').addEventListener('click', () => verFeria(prov.feriaId));
      pintar(v);
    })
  );
}

/* ================= respaldo ================= */

document.getElementById('exportar').addEventListener('click', () => {
  sync.exportarJSON().then((blob) => {
    const fecha = new Date().toISOString().slice(0, 10);
    sync.descargar(blob, `tour-compras-${fecha}.json`);
  });
});
