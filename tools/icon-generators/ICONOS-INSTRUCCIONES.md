
# Cómo crear los iconos para la PWA

Los iconos son necesarios para que la app sea instalable. Tienes varias opciones:

## Opción 1: Usar el generador HTML (Recomendado)
1. Abre el archivo `tools/icon-generators/generate-png-icons.html` en tu navegador
2. Haz clic en los botones para descargar `icon-192.png` e `icon-512.png`
3. Mueve los archivos descargados a la raíz del proyecto (junto a los SVG)

**Nota:** Los iconos SVG (`icon-192.svg` e `icon-512.svg`) ya están creados en la raíz del proyecto y listos para usar.

## Opción 2: Instalar dependencias y usar este script
```bash
cd tools/icon-generators
npm install canvas
node create-icons.js
```
Luego mueve los archivos generados a la raíz del proyecto.

## Opción 3: Usar una herramienta online
- Visita https://realfavicongenerator.net/
- Sube una imagen de 512x512px
- Descarga los iconos generados
- Renombra icon-192.png e icon-512.png y colócalos en la raíz

## Opción 4: Crear manualmente
Crea dos imágenes PNG:
- icon-192.png (192x192 píxeles)
- icon-512.png (512x512 píxeles)
Con fondo rojo degradado (#dc2626 a #b91c1c), símbolo de dólar ($) y texto blanco "FLUJO"
