# NRD Flujo de Caja

Sistema de control de flujo de caja - PWA

## Características

- Gestión de transacciones (ingresos y egresos)
- Gestión de categorías
- Resumen de flujo de caja con balance
- Filtrado por fechas
- Reportes de flujo de caja
- Envío de reportes por WhatsApp
- Impresión de reportes
- Funciona offline (PWA)

## Tecnologías

- HTML, CSS, JavaScript (Vanilla)
- Firebase Realtime Database
- Firebase Authentication
- Service Worker (PWA)

## Interfaz

### Sistema de Colores en Formularios

Los formularios y vistas de detalle utilizan un sistema de colores coordinado para indicar la acción actual:

#### Cabezales de Formularios

- **Verde** (`bg-green-600`): Formularios de **Nuevo** registro
- **Azul** (`bg-blue-600`): Formularios de **Edición** de registros existentes
- **Gris** (`bg-gray-600`): Vistas de **Detalle** (solo lectura)

#### Botones Principales

Los botones principales (Guardar) tienen el mismo color que el cabezal del formulario para mantener consistencia visual:

- **Verde** (`bg-green-600`): Botón "Guardar" en formularios de **Nuevo** registro
- **Azul** (`bg-blue-600`): Botón "Guardar" en formularios de **Edición**
- **Gris** (`bg-gray-600`): Botón "Cerrar" en vistas de **Detalle**

#### Descripciones en Formularios

Cada formulario incluye una breve descripción en el cabezal que explica el propósito de la acción actual (nuevo, edición o visualización).

Este sistema proporciona retroalimentación visual inmediata y consistente sobre el contexto de la acción que el usuario está realizando.

## Despliegue

Desplegado en GitHub Pages: https://yosbany.github.io/nrd-flujo-caja/

