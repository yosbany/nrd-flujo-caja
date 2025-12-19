# Generador de Iconos - NRD Flujo de Caja

Esta carpeta contiene todas las herramientas necesarias para generar los iconos de la aplicación PWA.

## 📁 Archivos incluidos

- **generate-png-icons.html** - Generador HTML mejorado con interfaz visual (Recomendado)
- **generate-icons.html** - Generador HTML básico
- **create-icons.html** - Generador HTML alternativo
- **create-icons.js** - Script Node.js para generar iconos (requiere `canvas`)
- **create-png-icons.js** - Script Node.js alternativo
- **ICONOS-INSTRUCCIONES.md** - Instrucciones detalladas

## 🚀 Uso rápido

### Opción 1: Generador HTML (Más fácil)
1. Abre `generate-png-icons.html` en tu navegador
2. Haz clic en "Descargar Todos"
3. Mueve los archivos `icon-192.png` e `icon-512.png` a la raíz del proyecto

### Opción 2: Script Node.js
```bash
npm install canvas
node create-icons.js
```

## 📝 Notas

- Los iconos SVG (`icon-192.svg` e `icon-512.svg`) ya están creados en la raíz del proyecto
- Los iconos PNG son necesarios para algunas plataformas
- Los iconos generados deben colocarse en la raíz del proyecto junto a los SVG

