/**
 * Banco Santander - Parser para estados de cuenta Excel
 * Formato: Saldo final 100.899,85 (europeo: punto=miles, coma=decimal)
 */

const logger = window.logger || console;

/**
 * Parsea número en formato europeo (100.899,85) o número directo de Excel
 * @param {string|number} str - Cadena "100.899,85" o número 100899.85
 * @returns {number|null}
 */
function parseEuropeanNumber(str) {
  if (str === undefined || str === null) return null;
  
  // Si ya es un número, puede que Excel lo haya parseado correctamente o incorrectamente
  // Si es muy pequeño comparado con lo esperado, puede que haya perdido la coma decimal
  if (typeof str === 'number') {
    // Si el número es menor a 1000 y el string original tenía punto y coma,
    // probablemente Excel lo interpretó mal
    const strValue = String(str);
    // Si el número tiene muchos decimales (más de 2), puede que Excel haya interpretado mal
    if (strValue.includes('.')) {
      const parts = strValue.split('.');
      // Si tiene más de 2 dígitos después del punto, puede ser que el punto sea separador de miles
      if (parts.length === 2 && parts[1].length > 2) {
        // Probablemente es formato europeo mal interpretado: 100.89985 debería ser 100899.85
        // Pero sin más contexto, retornamos el número tal cual
        logger.debug('Number may be incorrectly parsed European format', { original: str, strValue });
      }
    }
    return isNaN(str) ? null : str;
  }
  
  if (typeof str !== 'string') str = String(str);
  
  // Log para debugging
  const originalStr = str;
  
  const cleaned = str.replace(/\s/g, '').replace(/[^\d.,\-]/g, '');
  if (!cleaned) return null;
  
  // Formato europeo: 100.899,85 → punto=miles, coma=decimal
  // Detectar si tiene punto Y coma: formato europeo
  // Si solo tiene punto: puede ser formato americano o europeo sin decimales
  // Si solo tiene coma: puede ser formato europeo sin miles o decimal en formato europeo
  
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  
  let normalized;
  if (hasDot && hasComma) {
    // Puede ser formato europeo (100.899,85) o americano (100,899.85)
    // Detectar por posición: si la coma está antes del punto, es americano
    const dotPos = cleaned.indexOf('.');
    const commaPos = cleaned.indexOf(',');
    
    if (commaPos < dotPos) {
      // Formato americano: 100,899.85 → coma=miles, punto=decimal
      normalized = cleaned.replace(/,/g, '');
    } else {
      // Formato europeo: 100.899,85 → punto=miles, coma=decimal
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }
  } else if (hasComma && !hasDot) {
    // Solo coma: puede ser decimal europeo sin miles (899,85) o miles sin decimal (100,899)
    // Si la coma está cerca del final (últimos 3 caracteres), es decimal
    const commaPos = cleaned.lastIndexOf(',');
    const afterComma = cleaned.substring(commaPos + 1);
    if (afterComma.length <= 2) {
      // Es decimal: 899,85 → 899.85
      normalized = cleaned.replace(',', '.');
    } else {
      // Probablemente es miles sin decimal: 100,899 → 100899
      normalized = cleaned.replace(',', '');
    }
  } else if (hasDot && !hasComma) {
    // Solo punto: puede ser formato americano (100899.85) o europeo sin decimal (100.899)
    // Si el punto está cerca del final (últimos 3 caracteres), es decimal americano
    const dotPos = cleaned.lastIndexOf('.');
    const afterDot = cleaned.substring(dotPos + 1);
    if (afterDot.length <= 2) {
      // Es decimal americano: 100899.85 → mantener
      normalized = cleaned;
    } else {
      // Probablemente es miles europeo sin decimal: 100.899 → 100899
      normalized = cleaned.replace(/\./g, '');
    }
  } else {
    // Sin punto ni coma: número entero
    normalized = cleaned;
  }
  
  const num = parseFloat(normalized);
  if (isNaN(num)) {
    logger.debug('Failed to parse European number', { original: originalStr, cleaned, normalized });
    return null;
  }
  
  logger.debug('Parsed European number', { original: originalStr, cleaned, normalized, result: num });
  return num;
}

/**
 * Extrae todos los números de una fila
 */
function extractNumbersFromRow(row) {
  const nums = [];
  if (!Array.isArray(row)) return nums;
  for (let j = 0; j < row.length; j++) {
    const cell = row[j];
    const num = parseEuropeanNumber(cell);
    if (num !== null && Math.abs(num) > 0) {
      nums.push(num);
    }
  }
  return nums;
}

/**
 * Busca "Saldo final" y extrae el número correcto (el mayor, típicamente el balance real)
 * Evita capturar números pequeños como 101 que podrían ser de otra columna
 */
function findSaldoFinalInRow(row, nextRow = null) {
  if (!Array.isArray(row)) return null;
  for (let j = 0; j < row.length; j++) {
    const cell = String(row[j] || '').trim();
    if (/saldo\s*final/i.test(cell)) {
      const nums = [...extractNumbersFromRow(row), ...extractNumbersFromRow(nextRow)];
      if (nums.length === 0) return null;
      // Saldo final es el número con mayor magnitud (evita tomar 101 en vez de 100.899,85)
      return nums.reduce((a, b) => Math.abs(a) >= Math.abs(b) ? a : b);
    }
  }
  return null;
}

/** Índices de filas: fila 14 = headers, 15 = saldo inicial, 16+ = movimientos, última = saldo final */
const ROW_HEADERS = 13;   // fila 14 (0-indexed)
const ROW_SALDO_INICIAL = 14; // fila 15
const ROW_FIRST_MOVEMENT = 15; // fila 16

/**
 * Encuentra el índice de la columna "saldo" o "saldo+" en los headers
 */
function findSaldoColumnIndex(headersRow) {
  if (!Array.isArray(headersRow)) return -1;
  for (let j = 0; j < headersRow.length; j++) {
    const cell = String(headersRow[j] || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (/saldo\s*\+?/.test(cell)) return j;
  }
  return -1;
}

/**
 * Parsea el estado de cuenta de Santander desde datos Excel
 * Estructura: fila 14=headers, 15=saldo inicial, 16+=movimientos, última=saldo final
 * Saldo inicial y final: solo importa la columna saldo/saldo+
 */
export function parseSantanderStatement(data, generateHashFn) {
  if (!data || data.length === 0) return null;

  let statementDate = null;
  let balance = null;

  const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;

  // 1. Obtener columna saldo desde headers (fila 14); fallback columna J (índice 9)
  const headersRow = data[ROW_HEADERS];
  let saldoColIndex = findSaldoColumnIndex(headersRow);
  if (saldoColIndex < 0) saldoColIndex = 9; // Col J = saldo

  // 2. Saldo inicial = fila 15, columna saldo
  let initialBalance = null;
  if (saldoColIndex >= 0 && data.length > ROW_SALDO_INICIAL) {
    const saldoInicialRow = data[ROW_SALDO_INICIAL];
    if (Array.isArray(saldoInicialRow) && saldoInicialRow[saldoColIndex] !== undefined) {
      const rawInicial = saldoInicialRow[saldoColIndex];
      initialBalance = parseEuropeanNumber(rawInicial);
      if (initialBalance !== null) {
        logger.debug('Santander: Saldo inicial desde fila 15', { rawInicial, initialBalance });
      }
    }
  }

  // 3. Saldo final = última fila, columna saldo (J)
  if (saldoColIndex >= 0) {
    const lastRow = data[data.length - 1];
    if (Array.isArray(lastRow) && lastRow[saldoColIndex] !== undefined) {
      const rawValue = lastRow[saldoColIndex];
      logger.debug('Santander: Raw saldo value from Excel', { 
        rawValue, 
        type: typeof rawValue,
        columnIndex: saldoColIndex,
        lastRowSample: lastRow.slice(Math.max(0, saldoColIndex - 2), saldoColIndex + 3)
      });
      const saldoFinal = parseEuropeanNumber(rawValue);
      logger.info('Santander: Saldo final parseado', { 
        rawValue, 
        parsedValue: saldoFinal,
        expectedValue: 100899.85 // Valor esperado para 100.899,85
      });
      if (saldoFinal !== null) {
        balance = saldoFinal;
        logger.debug('Santander: Saldo final desde columna saldo+', { balance });
      }
    }
  }

  // 3. Fallback: buscar "Saldo final" por texto
  if (balance === null) {
    const lastRow = data[data.length - 1];
    const prevRow = data.length > 1 ? data[data.length - 2] : null;
    const saldoFinal = findSaldoFinalInRow(lastRow, prevRow);
    if (saldoFinal !== null) {
      balance = saldoFinal;
    }
  }

  // 4. Buscar fecha del estado
  for (let i = 0; i < Math.min(data.length, 50); i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;
    const rowText = row.join(' ').toLowerCase();
    if (rowText.includes('fecha') && (rowText.includes('estado') || rowText.includes('periodo'))) {
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '');
        const dateMatch = cell.match(datePattern);
        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          const fullYear = year.length === 2 ? (parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year)) : parseInt(year);
          statementDate = new Date(fullYear, parseInt(month) - 1, parseInt(day));
          if (!isNaN(statementDate.getTime())) break;
        }
      }
      if (statementDate) break;
    }
  }

  // 5. Si no hay fecha, usar la última fecha de transacción
  if (!statementDate) {
    for (let i = data.length - 1; i >= Math.max(0, data.length - 100); i--) {
      const row = data[i];
      if (!Array.isArray(row)) continue;
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '');
        const dateMatch = cell.match(datePattern);
        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          const fullYear = year.length === 2 ? (parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year)) : parseInt(year);
          const date = new Date(fullYear, parseInt(month) - 1, parseInt(day));
          if (!isNaN(date.getTime())) {
            statementDate = date;
            break;
          }
        }
      }
      if (statementDate) break;
    }
  }

  const movements = extractSantanderMovements(data, generateHashFn);

  return {
    statementDate: statementDate && !isNaN(statementDate.getTime()) ? statementDate : null,
    balance: balance,
    initialBalance: initialBalance,
    movements
  };
}

/**
 * Extrae movimientos bancarios del Excel de Santander
 * Tabla inicia fila 13 (headers), fila 14 = saldo inicial, fila 15 = vacía, fila 16+ = movimientos, última = saldo final
 * Columnas: B(1)=fecha, C(2)=ref, D(3)=tipo movimiento, E(4)=descripción, H(7)=débito, I(8)=crédito, J(9)=saldo
 */
function extractSantanderMovements(data, generateHashFn) {
  const movements = [];
  const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;

  // Incluir desde fila 16 (índice 15); algunos Excels tienen el primer movimiento ahí (no saltar esa fila)
  const startRow = Math.max(ROW_FIRST_MOVEMENT, 0); // Fila 16 = índice 15
  const endRow = Math.max(data.length - 2, startRow); // Excluir última fila (saldo final)

  logger.debug('Extracting Santander movements', {
    dataLength: data.length,
    startRow,
    endRow,
    rowsToProcess: endRow - startRow + 1
  });

  let rowsWithDates = 0;
  let rowsWithAmounts = 0;
  let rowsProcessed = 0;
  
  for (let i = startRow; i <= endRow; i++) {
    const row = data[i];
    // Aceptar 6+ columnas: algunos Excels tienen Fecha, Ref, Tipo, Descripción, Débito, Crédito (y opcional Saldo)
    if (!Array.isArray(row) || row.length < 6) continue;

    rowsProcessed++;

    // Fecha: col B (1) o A (0) según el Excel
    const dateCell = (String(row[1] || '').trim() || String(row[0] || '').trim());
    const dateMatch = dateCell.match(datePattern);
    if (!dateMatch) {
      continue;
    }

    rowsWithDates++;

    const [, day, month, year] = dateMatch;
    const fullYear = year.length === 2 ? (parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year)) : parseInt(year);
    const foundDate = new Date(fullYear, parseInt(month) - 1, parseInt(day));
    if (isNaN(foundDate.getTime())) continue;

    const movementType = String(row[3] || '').trim();
    // Descripción: la celda con más texto entre C(2), D(3), E(4) para no perder "PAGO MI AUTO" ni similares
    const descCandidates = [String(row[4] || '').trim(), String(row[3] || '').trim(), String(row[2] || '').trim()].filter(Boolean);
    const description = descCandidates.length ? descCandidates.sort((a, b) => b.length - a.length)[0] : movementType || 'Sin descripción';
    const fullDescription = movementType && description && movementType !== description
      ? `${movementType} - ${description}`
      : (description || movementType || 'Sin descripción');

    // No tratar filas de saldo como movimientos
    const descLower = fullDescription.toLowerCase();
    if (/saldo\s+inicial|saldo\s+final/i.test(descLower) && fullDescription.length < 50) continue;

    // Débito/crédito: con 9+ columnas H(7)/I(8); con 6–8 columnas E(4)/F(5)
    const debitRaw = row.length >= 9 ? row[7] : row[4];
    const creditRaw = row.length >= 9 ? row[8] : row[5];
    const debit = parseEuropeanNumber(debitRaw);
    const credit = parseEuropeanNumber(creditRaw);
    
    // Log movements with credit values to debug income detection
    if (credit !== null && Math.abs(credit) > 0.01) {
      logger.debug('Credit movement found', {
        rowIndex: i,
        creditRaw: creditRaw,
        creditParsed: credit,
        debitRaw: debitRaw,
        debitParsed: debit,
        description: fullDescription,
        willBeIncome: credit > 0
      });
    }
    
    // Log movements with debit values to debug expense detection
    if (debit !== null && Math.abs(debit) > 0.01) {
      logger.debug('Debit movement found', {
        rowIndex: i,
        debitRaw: debitRaw,
        debitParsed: debit,
        creditRaw: creditRaw,
        creditParsed: credit,
        description: fullDescription,
        willBeExpense: debit > 0
      });
    }

    let amount = 0;
    let type = 'expense';
    let creditAmount = 0;
    let debitAmount = 0;

    // Débito y crédito están en columnas separadas
    // REGLA: Solo la columna define el tipo, NO el signo del valor.
    // Valor en columna Débito → egreso | Valor en columna Crédito → ingreso
    // (El Excel puede exportar todos los números como negativos; usamos Math.abs para el monto.)
    if (debit !== null && Math.abs(debit) > 0.01) {
      type = 'expense';
      debitAmount = Math.abs(debit);
      amount = debitAmount;
    } else if (credit !== null && Math.abs(credit) > 0.01) {
      type = 'income';
      creditAmount = Math.abs(credit);
      amount = creditAmount;
    } else {
      continue;
    }
    
    // Log first few movements to verify classification
    if (i < startRow + 10) {
      logger.debug('Movement classified', {
        rowIndex: i,
        debitRaw: debitRaw,
        debitParsed: debit,
        creditRaw: creditRaw,
        creditParsed: credit,
        type: type,
        amount: amount,
        description: fullDescription.substring(0, 50)
      });
    }

    // Log movements that match "COMISION POR COSTO PRODUCTO" for debugging
    if (fullDescription.toUpperCase().includes('COMISION POR COSTO PRODUCTO')) {
      logger.info('COMISION POR COSTO PRODUCTO movement found', {
        rowIndex: i,
        description: fullDescription,
        debit: debit,
        credit: credit,
        type: type,
        amount: amount,
        rowSample: row.slice(0, 10)
      });
    }

    if (amount < 0.01) {
      // Skip rows with date but no valid amount (might be continuation rows for wrapped text)
      continue;
    }
    
    rowsWithAmounts++;

    const hash = generateHashFn ? generateHashFn(foundDate, type, creditAmount, debitAmount, fullDescription) : `bank_${i}_${Date.now()}`;

    movements.push({
      hash,
      date: foundDate.getTime(),
      amount,
      description: fullDescription,
      type,
      verified: false
    });
  }
  
  const incomeCount = movements.filter(m => m.type === 'income').length;
  const expenseCount = movements.filter(m => m.type === 'expense').length;
  
  logger.debug('Santander extraction summary', {
    rowsProcessed,
    rowsWithDates,
    rowsWithAmounts,
    movementsFound: movements.length,
    incomeCount,
    expenseCount
  });

  // Mantener orden del Excel (filas); no ordenar por fecha
  logger.debug('Santander movements extracted', {
    movementsCount: movements.length,
    willTryFallback: movements.length === 0 && data.length > 2
  });

  // Si no se encontraron movimientos con estructura fija, intentar parsear todas las filas (fallback)
  if (movements.length === 0 && data.length > 2) {
    logger.info('No movements found with fixed structure, trying fallback parser');
    const fallbackMovements = extractSantanderMovementsFallback(data, generateHashFn);
    logger.info('Fallback parser result', { movementsCount: fallbackMovements.length });
    return fallbackMovements;
  }
  return movements;
}

function extractSantanderMovementsFallback(data, generateHashFn) {
  const movements = [];
  const datePattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
  // Try searching from row 16 onwards, checking column B (index 1) for dates
  for (let i = 15; i < data.length - 1; i++) {
    const row = data[i];
    if (!Array.isArray(row) || row.length < 6) continue;
    const dateCell = (String(row[1] || '').trim() || String(row[0] || '').trim());
    const dateMatch = dateCell.match(datePattern);
    if (!dateMatch) continue;
    const [, day, month, year] = dateMatch;
    const fullYear = year.length === 2 ? (parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year)) : parseInt(year);
    const foundDate = new Date(fullYear, parseInt(month) - 1, parseInt(day));
    if (isNaN(foundDate.getTime())) continue;

    const movementType = String(row[3] || '').trim();
    const descCandidates = [String(row[4] || '').trim(), String(row[3] || '').trim(), String(row[2] || '').trim()].filter(Boolean);
    const description = descCandidates.length ? descCandidates.sort((a, b) => b.length - a.length)[0] : movementType || 'Sin descripción';
    const fullDescription = movementType && description && movementType !== description
      ? `${movementType} - ${description}`
      : (description || movementType || 'Sin descripción');

    const debitRaw = row.length >= 9 ? row[7] : row[4];
    const creditRaw = row.length >= 9 ? row[8] : row[5];
    const debit = parseEuropeanNumber(debitRaw);
    const credit = parseEuropeanNumber(creditRaw);
    let amount = 0, type = 'expense', creditAmount = 0, debitAmount = 0;
    
    // REGLA: Solo la columna define el tipo. Débito → egreso, Crédito → ingreso (ignorar signo).
    if (debit !== null && Math.abs(debit) > 0.01) {
      type = 'expense';
      debitAmount = Math.abs(debit);
      amount = debitAmount;
    } else if (credit !== null && Math.abs(credit) > 0.01) {
      type = 'income';
      creditAmount = Math.abs(credit);
      amount = creditAmount;
    }
    
    if (amount < 0.01) continue;
    const hash = generateHashFn ? generateHashFn(foundDate, type, creditAmount, debitAmount, fullDescription) : `bank_${i}_${Date.now()}`;
    movements.push({ hash, date: foundDate.getTime(), amount, description: fullDescription, type, verified: false });
  }
  // Mantener orden del Excel (filas)
  return movements;
}
