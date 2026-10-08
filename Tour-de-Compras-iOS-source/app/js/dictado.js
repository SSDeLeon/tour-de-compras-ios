/**
 * dictado.js — Lectura de los campos a partir de un dictado.
 *
 * Archivo COMPARTIDO entre la app y el servidor: el servidor lo importa desde
 * `servidor/src/dictado.js`. No tiene dependencias ni toca el navegador, a
 * propósito.
 *
 * Lo usa el teléfono sobre lo que el comprador escribe a mano, y el servidor
 * sobre lo que devuelve la transcripción del audio.
 *
 * RN-19: devuelve SOLO lo que reconoce con seguridad. Lo que no se entendió
 * queda vacío; nunca se estima ni se inventa.
 */

/** Números dichos en palabras, que es como se dictan los decimales. */
const PALABRAS = {
  cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, veinte: 20, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90, cien: 100, ciento: 100
};

/**
 * "cero coma cero ocho" → "0.08"
 * "cuarenta y dos" → "42"
 *
 * Solo convierte lo que reconoce. El resto queda como está.
 */
export function numerosEnPalabras(texto) {
  let t = ' ' + String(texto || '').toLowerCase() + ' ';

  // decimales dictados: "cero coma cero ocho"
  t = t.replace(
    /\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\s+coma\s+((?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)(?:\s+(?:cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve))*)\b/g,
    (m, entero, decimales) => {
      const d = decimales.split(/\s+/).map((p) => PALABRAS[p]).join('');
      return ` ${PALABRAS[entero]}.${d} `;
    }
  );

  // centenas: "quinientos", "trescientos"
  t = t.replace(/\bquinientos\b/g, ' 500 ');
  t = t.replace(/\b(dos|tres|cuatro|seis|siete|ocho|nueve)cientos\b/g,
    (m, u) => ` ${PALABRAS[u] * 100} `);

  // decenas compuestas: "cuarenta y dos"
  t = t.replace(
    /\b(veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
    (m, d, u) => ` ${PALABRAS[d] + PALABRAS[u]} `
  );

  // sueltas
  t = t.replace(
    /\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento)\b/g,
    (m) => ` ${PALABRAS[m]} `
  );

  // "dos mil"
  t = t.replace(/\b(\d+)\s+mil\b/g, (m, n) => ` ${Number(n) * 1000} `);
  t = t.replace(/\bmil\b/g, ' 1000 ');

  return t.replace(/\s+/g, ' ').trim();
}

/**
 * Las unidades que se dictan, y el campo al que van.
 * El orden importa: se asignan de izquierda a derecha.
 */
const UNIDADES = [
  { campo: 'fob',       patron: /\b(?:fob|d[oó]lares|dolares|dolar|usd|u\$s|precio)\b/g },
  { campo: 'cbm',       patron: /\b(?:cbm|c[uú]bicos|c[uú]bico|m3|cubo)\b/g },
  { campo: 'moq',       patron: /\b(?:moq|m[ií]nimo|m[ií]nima)\b/g },
  { campo: 'plazoDias', patron: /\bd[ií]as?\b/g }
];

/** Distancia máxima, en caracteres, entre un número y su unidad. */
const DISTANCIA_MAX = 18;

/**
 * Extrae los campos del texto dictado.
 *
 * El problema real: en un dictado de corrido el número a veces va antes de
 * la unidad —"42 fob"— y a veces después —"cbm 0,22"—, y los pares se
 * mezclan: "cbm 0,22 fob 95". Buscar con una expresión por campo falla ahí.
 *
 * Por eso esto ubica todos los números y todas las unidades con su posición,
 * y le asigna a cada unidad el número libre más cercano. Un número ya
 * asignado no se reutiliza.
 */
export function leerDictadoTexto(texto) {
  const t = numerosEnPalabras(texto)
    .replace(/(\d),(\d)/g, '$1.$2')   // coma decimal
    .replace(/,/g, ' ');              // el resto de las comas separan

  const out = {};

  // Todos los números, con su posición.
  const numeros = [];
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) {
    numeros.push({ valor: Number(m[0]), desde: m.index, hasta: m.index + m[0].length, usado: false });
  }

  // La condición de pago se resuelve primero: consume dos números juntos
  // ("30/70", "30 70") y hay que sacarlos de la bolsa antes de repartir.
  const pago = t.match(/\b(\d{1,2})\s*[/\- ]\s*(\d{1,3})\b/);
  if (pago && Number(pago[1]) + Number(pago[2]) === 100) {
    out.pago = `${pago[1]}/${pago[2]}`;
    const desde = pago.index;
    const hasta = desde + pago[0].length;
    numeros.forEach((n) => { if (n.desde >= desde && n.hasta <= hasta) n.usado = true; });
  }

  // Todas las unidades, con su posición.
  const unidades = [];
  for (const u of UNIDADES) {
    for (const m of t.matchAll(u.patron)) {
      unidades.push({ campo: u.campo, desde: m.index, hasta: m.index + m[0].length });
    }
  }
  unidades.sort((a, b) => a.desde - b.desde);

  for (const u of unidades) {
    if (out[u.campo] !== undefined) continue;   // ya resuelta

    let elegido = null;
    let mejor = Infinity;

    for (const n of numeros) {
      if (n.usado) continue;
      // distancia de borde a borde, en cualquiera de los dos sentidos
      const d = n.hasta <= u.desde ? u.desde - n.hasta
              : n.desde >= u.hasta ? n.desde - u.hasta
              : 0;
      if (d <= DISTANCIA_MAX && d < mejor) { mejor = d; elegido = n; }
    }

    if (elegido) {
      elegido.usado = true;
      out[u.campo] = u.campo === 'moq' || u.campo === 'plazoDias'
        ? Math.round(elegido.valor)
        : elegido.valor;
    }
  }

  return out;
}
