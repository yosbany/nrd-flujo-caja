#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Generate timestamp version
const version = Date.now();

// Read index.html
const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Remove existing version parameters
html = html.replace(/\?v=\d+/g, '');

// Add version parameter to CSS
html = html.replace(
  /(<link[^>]*href=["'])(styles\.css)(["'][^>]*>)/g,
  `$1$2?v=${version}$3`
);

// Add version parameter to JS files (except Firebase CDN)
html = html.replace(
  /(<script[^>]*src=["'])(firebase\.js|modal\.js|auth\.js|db\.js|clients\.js|products\.js|orders\.js|app\.js)(["'][^>]*>)/g,
  `$1$2?v=${version}$3`
);

// Add version parameter to service worker
html = html.replace(
  /(serviceWorker\.register\(["'])(service-worker\.js)(["'])/g,
  `$1$2?v=${version}$3`
);

// Write back
fs.writeFileSync(htmlPath, html, 'utf8');

console.log(`✅ Version updated to: ${version}`);
console.log(`📝 Updated index.html with cache busting parameters`);
