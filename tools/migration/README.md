# Herramienta de Migración de Cierres (Python)

Esta herramienta permite migrar datos del sistema de cierres al sistema de flujo de caja usando Python.

## Instalación

1. Instala las dependencias:
```bash
pip install -r requirements.txt
```

2. No necesitas configurar credenciales de servicio. El script te pedirá tu email y contraseña de Firebase cuando lo ejecutes.

## Uso

```bash
cd tools/migration
python migrate-closures.py <archivo-cierres.json>
```

Ejemplo:
```bash
python migrate-closures.py nrd-cierres-prod-default-rtdb-closures-export.json
```

El script te pedirá:
- Email: Tu email de Firebase
- Contraseña: Tu contraseña de Firebase

## Configuración

Edita `migration-mapping.json` (en la misma carpeta `migration`) para definir el mapeo de cuentas y categorías antes de ejecutar la migración.

## Ventajas sobre la versión JavaScript

- ✅ Más rápida (no depende del navegador, cache optimizado)
- ✅ Mejor manejo de errores
- ✅ Progreso en tiempo real en la consola
- ✅ No requiere interfaz web
- ✅ Puede ejecutarse en servidor/CI/CD
- ✅ No hace consultas repetidas a Firebase (cache una sola vez)

## Mapeo de Campos

### Transacciones

| Campo Original (JSON) | Campo Destino (Firebase) | Lógica |
|----------------------|-------------------------|--------|
| `concept` + `amount` | `type` | `"(+)"` o amount > 0 → `"income"`, sino `"expense"` |
| `description` o `concept` | `description` | Usa `description` si existe, sino el `concept` limpio |
| `amount` | `amount` | Valor absoluto |
| `concept` (mapeado) | `categoryId` + `categoryName` | Usa el mapeo de categorías |
| `accountId` (mapeado) | `accountId` + `accountName` | Usa el mapeo de cuentas |
| `timestamp` | `date` | Convertido a inicio del día local |
| `description` | `notes` | Si existe, sino `null` |
| `timestamp` | `createdAt` | Timestamp original |

## Notas

- Las transferencias (transacciones con `transferId`) se omiten automáticamente
- Las categorías marcadas con `"skip": true` en el mapeo se omiten
- Si una cuenta o categoría ya existe (por nombre), se reutiliza su ID
- La migración carga todas las categorías y cuentas en cache antes de procesar transacciones (muy rápido)

