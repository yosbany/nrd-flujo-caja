const fs = require('fs');
const { createCanvas } = require('canvas');

function createIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Red gradient background
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#dc2626');
  gradient.addColorStop(1, '#b91c1c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  // White money symbol
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${size * 0.33}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', size / 2, size / 2 - size * 0.15);
  
  // White text
  ctx.font = `bold ${size * 0.12}px Arial`;
  ctx.fillText('FLUJO', size / 2, size / 2 + size * 0.15);
  
  // Draw arrows for cash flow
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  const arrowSize = size * 0.15;
  const arrowY = size / 2 + size * 0.05;
  
  // Left arrow
  ctx.beginPath();
  ctx.moveTo(size * 0.25, arrowY);
  ctx.lineTo(size * 0.25 + arrowSize * 0.3, arrowY - arrowSize * 0.2);
  ctx.lineTo(size * 0.25 + arrowSize * 0.3, arrowY - arrowSize * 0.1);
  ctx.lineTo(size * 0.25 + arrowSize * 0.6, arrowY - arrowSize * 0.1);
  ctx.lineTo(size * 0.25 + arrowSize * 0.6, arrowY + arrowSize * 0.1);
  ctx.lineTo(size * 0.25 + arrowSize * 0.3, arrowY + arrowSize * 0.1);
  ctx.lineTo(size * 0.25 + arrowSize * 0.3, arrowY + arrowSize * 0.2);
  ctx.closePath();
  ctx.fill();
  
  // Right arrow
  ctx.beginPath();
  ctx.moveTo(size * 0.75, arrowY);
  ctx.lineTo(size * 0.75 - arrowSize * 0.3, arrowY - arrowSize * 0.2);
  ctx.lineTo(size * 0.75 - arrowSize * 0.3, arrowY - arrowSize * 0.1);
  ctx.lineTo(size * 0.75 - arrowSize * 0.6, arrowY - arrowSize * 0.1);
  ctx.lineTo(size * 0.75 - arrowSize * 0.6, arrowY + arrowSize * 0.1);
  ctx.lineTo(size * 0.75 - arrowSize * 0.3, arrowY + arrowSize * 0.1);
  ctx.lineTo(size * 0.75 - arrowSize * 0.3, arrowY + arrowSize * 0.2);
  ctx.closePath();
  ctx.fill();
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
  console.log(`Created ${filename}`);
}

// Check if canvas is available
try {
  const canvas = require('canvas');
  createIcon(192, 'icon-192.png');
  createIcon(512, 'icon-512.png');
  console.log('Icons created successfully!');
} catch (e) {
  console.log('Canvas module not available. Creating simple SVG icons instead...');
  // Create SVG icons as fallback
  const svg192 = `<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#dc2626;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#b91c1c;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="192" height="192" fill="url(#grad)" rx="24"/>
    <text x="96" y="70" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle">$</text>
    <path d="M 50 120 L 70 110 L 70 115 L 85 115 L 85 110 L 105 120 L 85 130 L 85 125 L 70 125 L 70 130 Z" fill="#ffffff" opacity="0.9"/>
    <path d="M 142 120 L 122 110 L 122 115 L 107 115 L 107 110 L 87 120 L 107 130 L 107 125 L 122 125 L 122 130 Z" fill="#ffffff" opacity="0.9"/>
    <text x="96" y="155" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">FLUJO</text>
  </svg>`;
  const svg512 = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#dc2626;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#b91c1c;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="512" height="512" fill="url(#grad)" rx="64"/>
    <text x="256" y="200" font-family="Arial, sans-serif" font-size="180" font-weight="bold" fill="#ffffff" text-anchor="middle">$</text>
    <path d="M 120 320 L 180 290 L 180 300 L 220 300 L 220 290 L 280 320 L 220 350 L 220 340 L 180 340 L 180 350 Z" fill="#ffffff" opacity="0.9"/>
    <path d="M 392 320 L 332 290 L 332 300 L 292 300 L 292 290 L 232 320 L 292 350 L 292 340 L 332 340 L 332 350 Z" fill="#ffffff" opacity="0.9"/>
    <text x="256" y="420" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#ffffff" text-anchor="middle">FLUJO</text>
  </svg>`;
  fs.writeFileSync('icon-192.svg', svg192);
  fs.writeFileSync('icon-512.svg', svg512);
  console.log('SVG icons created. Note: You may need to convert them to PNG manually.');
}
