/**
 * Mercado Pago - Parser para movimientos Excel
 * Primera fila = títulos: Fecha de Pago, Tipo de Operación, Número de Movimiento, Operación Relacionada, Importe
 */

const logger = window.logger || console;

/**
 * Parsea número en formato europeo o americano (reutilizando lógica tipo Santander)
 */
function parseAmount(str) {
  if (str === undefined || str === null) return null;
  if (typeof str === 'number') return isNaN(str) ? null : str;
  if (typeof str !== 'string') str = String(str);
  const cleaned = str.replace(/\s/g, '').replace(/[^\d.,\-]/g, '');
  if (!cleaned) return null;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  let normalized;
  if (hasDot && hasComma) {
    const dotPos = cleaned.indexOf('.');
    const commaPos = cleaned.indexOf(',');
    if (commaPos < dotPos) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma && !hasDot) {
    const commaPos = cleaned.lastIndexOf(',');
    const afterComma = cleaned.substring(commaPos + 1);
    normalized = afterComma.length <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (hasDot && !hasComma) {
    const dotPos = cleaned.lastIndexOf('.');
    const afterDot = cleaned.substring(dotPos + 1);
    normalized = afterDot.length <= 2 ? cleaned : cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
}

/**
 * Encuentra el índice de columna por título (normalizado: sin acentos, minúsculas)
 */
function findColumnIndex(headersRow, ...names) {
  if (!Array.isArray(headersRow)) return -1;
  const normalize = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/\u0300/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  for (let j = 0; j < headersRow.length; j++) {
    const cell = normalize(headersRow[j]);
    for (const name of names) {
      if (cell === normalize(name) || cell.includes(normalize(name))) return j;
    }
  }
  return -1;
}

const DATE_PATTERN = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;

function parseDateCell(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    // Excel serial date
    const d = new Date((value - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  const str = String(value).trim();
  const m = str.match(DATE_PATTERN);
  if (!m) return null;
  const [, day, month, year] = m;
  const fullYear = year.length === 2 ? (parseInt(year, 10) < 50 ? 2000 + parseInt(year, 10) : 1900 + parseInt(year, 10)) : parseInt(year, 10);
  const d = new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Parsea el archivo de movimientos de Mercado Pago.
 * Fila 0 = encabezados: Fecha de Pago, Tipo de Operación, Número de Movimiento, Operación Relacionada, Importe
 * Fila 1+ = datos.
 * Importe: negativo = egreso, positivo = ingreso.
 */
export function parseMercadoPagoStatement(data, generateHashFn) {
  if (!data || data.length < 2) return null;

  const headersRow = data[0];
  const colFecha = findColumnIndex(headersRow, 'Fecha de Pago', 'Fecha');
  const colTipo = findColumnIndex(headersRow, 'Tipo de Operación', 'Tipo');
  const colNumero = findColumnIndex(headersRow, 'Número de Movimiento', 'Número');
  const colOperacion = findColumnIndex(headersRow, 'Operación Relacionada', 'Operación');
  const colImporte = findColumnIndex(headersRow, 'Importe');

  if (colFecha < 0 || colImporte < 0) {
    logger.warn('Mercado Pago: no se encontraron columnas Fecha de Pago o Importe', {
      headers: headersRow,
      colFecha,
      colImporte
    });
    return null;
  }

  const movements = [];
  let lastDate = null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;

    const date = parseDateCell(row[colFecha]);
    const rawAmount = row[colImporte];
    const amountNum = parseAmount(rawAmount);
    if (amountNum === null || Math.abs(amountNum) < 0.001) continue;
    if (!date) continue;

    lastDate = date;
    const type = amountNum < 0 ? 'expense' : 'income';
    const amount = Math.abs(amountNum);
    const creditAmount = type === 'income' ? amount : 0;
    const debitAmount = type === 'expense' ? amount : 0;

    const tipo = (colTipo >= 0 && row[colTipo] !== undefined) ? String(row[colTipo] || '').trim() : '';
    const operacion = (colOperacion >= 0 && row[colOperacion] !== undefined) ? String(row[colOperacion] || '').trim() : '';
    const numero = (colNumero >= 0 && row[colNumero] !== undefined) ? String(row[colNumero] || '').trim() : '';
    const parts = [tipo, operacion, numero].filter(Boolean);
    const description = parts.length ? parts.join(' - ') : 'Sin descripción';

    const hash = generateHashFn
      ? generateHashFn(date, type, creditAmount, debitAmount, description)
      : `mp_${i}_${Date.now()}`;

    movements.push({
      hash,
      date: date.getTime(),
      amount,
      description,
      type,
      verified: false
    });
  }

  logger.debug('Mercado Pago: movimientos extraídos', {
    totalRows: data.length,
    movementsCount: movements.length,
    colFecha,
    colImporte
  });

  return {
    statementDate: lastDate && !isNaN(lastDate.getTime()) ? lastDate : null,
    balance: null,
    initialBalance: null,
    movements
  };
}
