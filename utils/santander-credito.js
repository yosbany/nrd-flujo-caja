/**
 * Santander Crédito - Parser para movimientos Excel (CreditCardsMovementsDetail.xls)
 * Encabezado de tabla: Fecha, Tarjeta, Detalle, Importe $, Importe U$S (se busca la fila que contenga "Fecha").
 * "Período Consultado" (ej. Enero 2026) se usa como fecha del estado.
 */

const logger = window.logger || console;

/** Buscar la fila que contiene el encabezado de la tabla de movimientos (Fecha, Importe, etc.) */
function findHeaderRow(data) {
  const maxScan = Math.min(data.length, 50);
  for (let r = 0; r < maxScan; r++) {
    const row = data[r];
    if (!Array.isArray(row)) continue;
    const colFecha = findColumnIndex(row, 'Fecha');
    const colImporte = findColumnIndex(row, 'Importe $', 'Importe');
    if (colFecha >= 0 && colImporte >= 0) return r;
  }
  return -1;
}

/** Buscar "Período Consultado" y parsear valor tipo "Enero 2026" -> fecha (último día del mes) */
function findPeriodoConsultado(data) {
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const maxScan = Math.min(data.length, 30);
  for (let r = 0; r < maxScan; r++) {
    const row = data[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim().toLowerCase();
      if (!cell.includes('periodo') || !cell.includes('consultado')) continue;
      const valueCell = (row[c + 1] != null) ? String(row[c + 1] || '').trim() : '';
      const nextRow = data[r + 1];
      const valueFromNextRow = (nextRow && Array.isArray(nextRow) && nextRow[c] != null) ? String(nextRow[c] || '').trim() : '';
      const periodStr = valueCell || valueFromNextRow || '';
      if (!periodStr) continue;
      const parts = periodStr.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      let month = -1;
      let year = null;
      for (const p of parts) {
        const mi = monthNames.findIndex(m => p.startsWith(m) || m.startsWith(p));
        if (mi >= 0) { month = mi; break; }
      }
      for (const p of parts) {
        const y = parseInt(p, 10);
            if (y >= 2000 && y <= 2100) { year = y; break; }
            if (y >= 0 && y <= 99) { year = y < 50 ? 2000 + y : 1900 + y; break; }
          }
      if (month >= 0 && year) {
        const lastDay = new Date(year, month + 1, 0).getDate();
        const d = new Date(year, month, lastDay);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  return null;
}

function parseEuropeanNumber(str) {
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

/** Parsea monto que puede venir con paréntesis = negativo, ej. ($4.017,82) o -104,77 */
function parseAmountWithParentheses(raw) {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  const isNegativeByParentheses = str.includes('(') && str.includes(')');
  const num = parseEuropeanNumber(raw);
  if (num === null) return null;
  if (isNegativeByParentheses) return -Math.abs(num);
  return num;
}

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
 * Parsea el archivo de movimientos de Santander Crédito.
 * Se busca la fila que contenga Fecha e Importe (encabezado de la tabla).
 * "Período Consultado" (ej. Enero 2026) se usa como fecha del estado.
 * Importe $ en pesos; negativo = egreso (compras), positivo = ingreso (pagos/abonos).
 */
export function parseSantanderCreditoStatement(data, generateHashFn) {
  if (!data || data.length < 2) return null;

  const headerRowIndex = findHeaderRow(data);
  if (headerRowIndex < 0) {
    logger.warn('Santander Crédito: no se encontró fila de encabezado con Fecha e Importe', { rowsScanned: Math.min(data.length, 50) });
    return null;
  }

  const headersRow = data[headerRowIndex];
  const firstMovementRow = headerRowIndex + 1;

  const colFecha = findColumnIndex(headersRow, 'Fecha');
  const colTarjeta = findColumnIndex(headersRow, 'Tarjeta');
  const colDetalle = findColumnIndex(headersRow, 'Detalle');
  const colImportePesos = findColumnIndex(headersRow, 'Importe $', 'Importe');
  const colImporteUsd = findColumnIndex(headersRow, 'Importe U$S', 'Importe U$S');
  const colSaldoAnterior = findColumnIndex(headersRow, 'Saldo anterior', 'Saldo Anterior');

  if (colFecha < 0) {
    logger.warn('Santander Crédito: columna Fecha no encontrada', { headers: headersRow });
    return null;
  }
  if (colImportePesos < 0 && colImporteUsd < 0) {
    logger.warn('Santander Crédito: columna Importe no encontrada', { headers: headersRow });
    return null;
  }

  let statementDate = findPeriodoConsultado(data);
  const movements = [];
  let lastDate = null;

  for (let i = firstMovementRow; i < data.length; i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;

    const date = parseDateCell(row[colFecha]);
    if (!date) continue;

    // Si hay saldo en Importe U$S, el valor en pesos real está en Saldo anterior; si no, en Importe $
    const importeUsd = colImporteUsd >= 0 ? parseAmountWithParentheses(row[colImporteUsd]) : null;
    const hasUsd = importeUsd !== null && Math.abs(importeUsd) >= 0.001;
    const rawAmount = (hasUsd && colSaldoAnterior >= 0)
      ? row[colSaldoAnterior]
      : (colImportePesos >= 0 ? row[colImportePesos] : row[colImporteUsd]);
    const amountNum = parseAmountWithParentheses(rawAmount);
    if (amountNum === null || Math.abs(amountNum) < 0.001) continue;

    lastDate = date;
    // En cuentas a crédito: + = egreso (compras), - = ingreso (pagos/abonos)
    const type = amountNum > 0 ? 'expense' : 'income';
    const amount = Math.abs(amountNum);
    const creditAmount = type === 'income' ? amount : 0;
    const debitAmount = type === 'expense' ? amount : 0;

    const tarjeta = (colTarjeta >= 0 && row[colTarjeta] !== undefined) ? String(row[colTarjeta] || '').trim() : '';
    const detalle = (colDetalle >= 0 && row[colDetalle] !== undefined) ? String(row[colDetalle] || '').trim() : '';
    const parts = [tarjeta, detalle].filter(Boolean);
    const description = parts.length ? parts.join(' - ') : 'Sin descripción';

    const hash = generateHashFn
      ? generateHashFn(date, type, creditAmount, debitAmount, description)
      : `santander_credito_${i}_${Date.now()}`;

    movements.push({
      hash,
      date: date.getTime(),
      amount,
      description,
      type,
      verified: false
    });
  }

  if (!statementDate && lastDate && !isNaN(lastDate.getTime())) statementDate = lastDate;

  logger.debug('Santander Crédito: movimientos extraídos', {
    totalRows: data.length,
    movementsCount: movements.length,
    headerRowIndex,
    colFecha,
    colImportePesos,
    colImporteUsd,
    colSaldoAnterior,
    statementDate: statementDate ? statementDate.toISOString().slice(0, 10) : null
  });

  return {
    statementDate: statementDate || null,
    balance: null,
    initialBalance: null,
    movements
  };
}
