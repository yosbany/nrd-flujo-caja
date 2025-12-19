#!/bin/bash
#
# Script para configurar el hook de git pre-commit
# que actualiza automáticamente la versión antes de cada commit
#

HOOK_FILE=".git/hooks/pre-commit"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cat > "$HOOK_FILE" << 'EOF'
#!/bin/sh
#
# Pre-commit hook para actualizar la versión automáticamente
#

# Ejecutar el script de actualización de versión
node update-version.js

# Agregar el index.html actualizado al staging area
git add index.html

exit 0
EOF

chmod +x "$HOOK_FILE"

echo "✅ Hook de git pre-commit configurado correctamente"
echo "📝 Ahora cada vez que hagas commit, se actualizará automáticamente la versión en index.html"

