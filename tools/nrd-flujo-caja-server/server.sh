#!/bin/bash

# Script para iniciar/detener servidor HTTP local
# Uso: ./server.sh

PORT=8003

# Obtener el directorio raíz del proyecto (dos niveles arriba de tools/nrd-flujo-caja-server)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Función para verificar si el puerto está en uso
check_port() {
    lsof -ti:$PORT > /dev/null 2>&1
}

# Función para iniciar el servidor
start_server() {
    if check_port; then
        echo "⚠️  El servidor ya está corriendo en el puerto $PORT"
        echo "   Accede a: http://localhost:$PORT"
        return 1
    fi
    
    echo "🚀 Iniciando servidor HTTP en el puerto $PORT..."
    echo "   Directorio: $PROJECT_ROOT"
    
    # Cambiar al directorio raíz del proyecto
    cd "$PROJECT_ROOT"
    
    # Actualizar versión antes de iniciar el servidor
    UPDATE_VERSION_SCRIPT="$PROJECT_ROOT/tools/update-version/update-version.py"
    if [ -f "$UPDATE_VERSION_SCRIPT" ]; then
        echo "📝 Actualizando versión..."
        python3 "$UPDATE_VERSION_SCRIPT"
    else
        echo "⚠️  Script de actualización de versión no encontrado: $UPDATE_VERSION_SCRIPT"
    fi
    
    # Ejecutar el servidor
    python3 -m http.server $PORT > /dev/null 2>&1 &
    SERVER_PID=$!
    echo "✅ Servidor iniciado (PID: $SERVER_PID)"
    echo "   Accede a: http://localhost:$PORT"
    echo "   Para detener: ./tools/nrd-flujo-caja-server/server.sh"
    
    # Esperar un momento para que el servidor esté listo
    sleep 1
    
    # Abrir navegador
    echo "🌐 Abriendo navegador..."
    open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || echo "   (Abre manualmente: http://localhost:$PORT)"
}

# Función para detener el servidor
stop_server() {
    if ! check_port; then
        echo "ℹ️  El servidor no está corriendo"
        return 1
    fi
    
    # Buscar proceso por puerto
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ ! -z "$PID" ]; then
        kill $PID
        echo "🛑 Servidor detenido (PID: $PID)"
    else
        echo "ℹ️  No se encontró el proceso del servidor"
    fi
}

# Función para mostrar el estado
show_status() {
    if check_port; then
        PID=$(lsof -ti:$PORT 2>/dev/null)
        echo "✅ Servidor corriendo (PID: $PID)"
        echo "   Accede a: http://localhost:$PORT"
    else
        echo "ℹ️  Servidor no está corriendo"
    fi
}

# Lógica principal
if check_port; then
    stop_server
else
    start_server
fi

