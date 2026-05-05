#!/usr/bin/env python3
"""
Actualiza los parámetros de versión en index.html para cache busting
"""

import re
import os
from pathlib import Path
from datetime import datetime

def update_version():
    # Generate timestamp version
    version = int(datetime.now().timestamp() * 1000)
    
    # Get the project root (parent of tools directory)
    script_dir = Path(__file__).parent.parent.parent
    html_path = script_dir / 'index.html'
    
    if not html_path.exists():
        print(f"❌ Error: {html_path} no encontrado")
        return
    
    # Read index.html
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    # Remove existing version parameters
    html = re.sub(r'\?v=\d+', '', html)
    
    # Add version parameter to CSS
    html = re.sub(
        r'(<link[^>]*href=["\'])(styles\.css)(["\'][^>]*>)',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to JS files (except Firebase CDN and external libraries)
    html = re.sub(
        r'(<script[^>]*src=["\'])(firebase\.js|modal\.js|auth\.js|db\.js|tabs/categories\.js|tabs/transactions\.js|tabs/cashflow\.js|tabs/accounts\.js|app\.js)(["\'][^>]*>)',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Add version parameter to service worker
    html = re.sub(
        r'(serviceWorker\.register\(["\'])(service-worker\.js)(["\'])',
        rf'\1\2?v={version}\3',
        html
    )
    
    # Write back
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    
    import json
    version_path = script_dir / 'version.json'
    with open(version_path, 'w', encoding='utf-8') as f:
        json.dump({'v': version}, f)
    
    print(f"✅ Version updated to: {version}")
    print(f"📝 Updated index.html with cache busting parameters")

if __name__ == "__main__":
    update_version()

