# Tour de Compras — etapa 1

Aplicación web instalable (PWA) para la captura de compras durante el recorrido
de una feria internacional. Esta es la **etapa 1: captura offline en el stand**.

Proyecto de Minibest S.A. / Mega Baby. El relato completo del proceso, las
decisiones tomadas y los pendientes están en la bitácora del proyecto; este
README cubre solo lo técnico.

---

## Qué hace hoy

- Alta de **feria** (nombre, ciudad, fechas). La feria es una entidad: cada
  producto queda ligado a la feria donde se identificó, y eso arma el
  histórico año a año.
- Alta de **proveedor** con foto de la tarjeta (tomada con la cámara o elegida
  de la galería), hall y número de stand.
- Carga de **producto** con foto, código del proveedor, FOB, CBM, MOQ,
  cantidad, plazo, condiciones de pago, color y OEM.
- **Dictado**: graba audio y lo guarda local. Además interpreta un dictado
  escrito del tipo `42 fob, 0,08 cbm, moq 500, 60 días, 30/70` y completa los
  campos.
- **Orden de compra** por proveedor, con total en USD, CBM acumulado y llenado
  del contenedor en vivo.
- **Cierre de orden**: pasa a estado `cerrada` y entra en la cola de salida.
- **Exportación** de todo lo cargado a un archivo JSON, como respaldo.

Todo funciona **sin conexión**. Los datos viven en IndexedDB, en el teléfono.

## Qué NO hace todavía

Queda para las etapas siguientes:

- Envío del mail al vendedor (lo hace el servidor, no el teléfono).
- Alertas de 96 horas para la confirmación de la proforma y de 30 días antes
  del ETD para reclamar el embarque.
- Web de oficina: órdenes, estados, SKU propio y código de barra, archivo al
  Drive, informes.
- Comparador de productos por foto.
- OCR de la tarjeta del vendedor y transcripción real del audio (ambos en el
  servidor).

---

## Correr la app

Hace falta servirla por HTTP: los módulos ES y el service worker no funcionan
abriendo el archivo directamente.

```bash
cd tour-compras-app
python3 -m http.server 8080
# abrir http://localhost:8080
```

Para probar en el teléfono hace falta **HTTPS** (la cámara, el micrófono y el
service worker lo exigen fuera de `localhost`). Cualquier hosting estático con
certificado sirve.

Una vez abierta, el navegador ofrece instalarla en la pantalla de inicio. Desde
ahí abre a pantalla completa y funciona sin conexión.

---

## Estructura

```
index.html                 shell de la app
styles.css                 estilos (tipografías del sistema, sin CDN)
manifest.webmanifest       instalación en el teléfono
sw.js                      service worker: cachea el shell para abrir offline
icono.svg
js/
  config.js                URL del servidor y valores por defecto
  db.js                    IndexedDB: ferias, proveedores, productos, órdenes, media, outbox
  model.js                 entidades, estados y cálculos (CBM, contenedor, totales)
  media.js                 cámara, grabación de audio, lectura del dictado
  sync.js                  cola de salida y exportación
  app.js                   pantallas y navegación
```

Sin build, sin dependencias, sin framework. Es deliberado: la app tiene que
poder abrirse y repararse dentro de cinco años, y no puede arrastrar nada que
dependa de un CDN.

---

## Restricciones que no se pueden negociar

Las ferias son mayormente en China. Ahí:

- **Google está bloqueado**: nada de Google Fonts, Maps, Firebase, Gmail,
  Drive ni login de Google dentro de la app. Las fuentes son del sistema y no
  hay ningún recurso externo.
- **WhatsApp y Telegram están bloqueados.** Telegram también, aunque a veces
  parezca funcionar: cuando funciona es porque el teléfono está con roaming
  internacional o eSIM y el tráfico sale por el operador de origen. No se puede
  apoyar el diseño ahí.
- **La app tiene que abrir y cargar sin red.** El service worker cachea el
  shell y los datos van a IndexedDB. La red solo hace falta para sincronizar.

El servidor propio tiene que estar en **dominio propio**, alcanzable desde
China, y es el que envía los mails a los vendedores.

---

## El servidor (etapa 2)

`js/config.js` tiene `API_BASE` vacío. Con eso la app es 100% local. Al poner
la URL del servidor, la cola empieza a viajar sola.

Un solo endpoint alcanza para arrancar:

```
POST {API_BASE}/sync
Content-Type: application/json
```

El cuerpo, para una orden cerrada:

```json
{
  "tipo": "orden.cerrada",
  "orden":      { "id": "ord_...", "estado": "cerrada", "etdNegociado": "2026-11-15", "...": "..." },
  "proveedor":  { "id": "prv_...", "empresa": "...", "mail": "...", "hall": "4.1", "stand": "C22" },
  "feria":      { "id": "fer_...", "nombre": "...", "anio": 2026 },
  "productos":  [ { "id": "prd_...", "codigoProveedor": "BC-9042", "fob": 42, "cbm": 0.08, "...": "..." } ]
}
```

Respuesta `2xx` = la app saca el ítem de la cola. Cualquier otra cosa, lo
reintenta más tarde. El servidor es responsable de:

1. Asignar el número de orden definitivo.
2. Armar la proforma y enviarla al mail del vendedor, desde casilla propia.
3. Arrancar el reloj de 96 horas para la confirmación.
4. Programar el aviso de 30 días antes del ETD.
5. Archivar la proforma en el Drive, con la estructura **rubro / proveedor / año**.

Las fotos y los audios todavía no suben: quedan en el teléfono. Conviene un
endpoint aparte (`POST /media`) que los reciba de a uno, porque son pesados y
la conexión en viaje es mala.

---

## Modelo de datos

**Feria** — `id`, `nombre`, `ciudad`, `desde`, `hasta`, `anio`, `moneda`.

**Proveedor** — `id`, `feriaId`, `empresa`, `contacto`, `mail`, `telefono`,
`hall`, `stand`, `oem`, `rubro`, `tarjetaMediaId`.

**Producto** — `id`, `feriaId`, `proveedorId`, `descripcion`,
`codigoProveedor`, `fob`, `cbm`, `moq`, `cantidad`, `plazoDias`, `pago`,
`color`, `oem`, `rubro`, `fotoMediaId`, `audioMediaId`, `dictado`,
`skuPropio`, `codigoBarra`.

> `skuPropio` y `codigoBarra` se completan **después** de confirmada la orden,
> ya en la oficina. En el stand solo se carga el código del proveedor.

**Orden** (= proforma; son el mismo documento) — `id`, `numero`, `feriaId`,
`proveedorId`, `rubro`, `estado`, `tipoContenedor`, `capacidadUtil`, `pago`,
`etdNegociado`, `etdReal`, `eta`, `margenAtrasoDias`, `penalidad`,
`compradorId`, `cerradaEn`.

> Se guardan **los dos ETD**: el negociado en la proforma y el real que
> confirma el proveedor. El seguimiento de embarques trabaja sobre esa
> diferencia, y la penalidad por atraso también.

### Estados de la orden

```
abierta → cerrada → conformada → confirmada
```

- **cerrada**: el comprador la cerró en el stand y se envió al vendedor.
- **conformada**: el proveedor devolvió la proforma conformada.
- **confirmada**: recién acá hay compra. Depende de la aprobación del
  presupuesto o del regreso del viaje.

**Cerrada no es comprada.** Es la regla que más fácil se rompe al programar.

### Permisos

Cada orden guarda el `compradorId` de quien la armó. Una vez cerrada, solo ese
usuario puede modificarla: un comprador nunca interactúa con las órdenes de
otro. Lo que sí comparten los dos compradores de una misma feria es la base de
productos y proveedores.

En esta etapa el `compradorId` es local (`localStorage`). Con servidor, lo
reemplaza el usuario autenticado.

---

## Contenedores

`model.js` define capacidad nominal y útil:

| Tipo | Nominal | Útil por defecto |
| --- | --- | --- |
| 20' estándar | 33 m³ | 30 m³ |
| 40' estándar | 67 m³ | 60 m³ |
| 40' high cube | 76 m³ | 68 m³ |

La capacidad útil es editable en cada orden: la carga real nunca acomoda al
100% y el comprador sabe mejor que la tabla cuánto entra.

---

## Pendientes conocidos

- El OCR de la tarjeta no existe: los campos del proveedor se cargan a mano.
- La lectura del dictado escrito es una ayuda, no la transcripción real.
- Las fotos se reducen a 1280 px de lado mayor. Con cientos de productos
  conviene vigilar la cuota del navegador y purgar lo ya sincronizado.
- No hay borrado de productos ni de proveedores desde la interfaz.
- No hay autenticación.
