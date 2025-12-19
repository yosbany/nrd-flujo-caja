// Simple script to create PNG icons using sharp if available, otherwise provide instructions
const fs = require('fs');

try {
  const sharp = require('sharp');
  
  async function createIcon(size, filename) {
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="#dc2626"/>
        <text x="${size/2}" y="${size/2 - size*0.1}" font-family="Arial" font-size="${size*0.3}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">NRD</text>
        <text x="${size/2}" y="${size/2 + size*0.1}" font-family="Arial" font-size="${size*0.15}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">PEDIDOS</text>
      </svg>
    `;
    
    await sharp(Buffer.from(svg))
      .png()
      .toFile(filename);
    
    console.log(`Created ${filename}`);
  }
  
  (async () => {
    await createIcon(192, 'icon-192.png');
    await createIcon(512, 'icon-512.png');
    console.log('Icons created successfully!');
  })();
} catch (e) {
  console.log('Sharp not available. Creating instructions file...');
  const instructions = `
# Cómo crear los iconos para la PWA

Los iconos son necesarios para que la app sea instalable. Tienes dos opciones:

## Opción 1: Usar el generador HTML (Recomendado)
1. Abre el archivo generate-icons.html en tu navegador
2. Haz clic en los botones para descargar icon-192.png e icon-512.png
3. Coloca los archivos en la raíz del proyecto

## Opción 2: Instalar dependencias y usar este script
npm install sharp
node create-png-icons.js

## Opción 3: Usar una herramienta online
- Visita https://realfavicongenerator.net/
- Sube una imagen de 512x512px
- Descarga los iconos generados
- Renombra icon-192.png e icon-512.png y colócalos en la raíz

## Opción 4: Crear manualmente
Crea dos imágenes PNG:
- icon-192.png (192x192 píxeles)
- icon-512.png (512x512 píxeles)
Con fondo rojo (#dc2626) y texto blanco "NRD PEDIDOS"
`;
  fs.writeFileSync('ICONOS-INSTRUCCIONES.md', instructions);
  console.log('Created ICONOS-INSTRUCCIONES.md with instructions');
}
