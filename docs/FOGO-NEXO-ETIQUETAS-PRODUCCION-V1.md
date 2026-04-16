# FOGO + NEXO · Etiquetas de Producción V1

Fecha: 2026-04-16
Estado: Definición operativa inicial

## Objetivo

Dejar resuelto el flujo correcto para impresión de etiquetas de producción:

1. La producción se ejecuta en `FOGO`.
2. El lote real se crea en `production_batches`.
3. La Zebra imprime desde ese lote, no desde texto libre.

## Regla principal

`/inventory/production-batches` en NEXO no debe ser un formulario alterno de producción.
Debe funcionar como puente hacia `FOGO /production-batches` y como referencia operativa del flujo de impresión.

## Fuente de verdad

La fuente de verdad para la etiqueta de producción debe ser `public.production_batches`.

Campos mínimos a usar:

- `id`
- `batch_code`
- `product_id`
- `recipe_card_id`
- `site_id`
- `destination_location_id` cuando aplique
- `expires_at`
- `created_at`
- `created_by`

## Flujo operativo correcto

### 1. Planeación
- En FOGO se define qué se produce hoy por área o estación.

### 2. Ejecución
- El operario entra a la línea o al formulario de lote.
- Selecciona producto.
- Confirma cantidad.
- Define LOC destino.
- Captura vencimiento cuando aplique.
- Confirma consumo automático.

### 3. Creación del lote
- Al confirmar, FOGO crea el registro en `production_batches`.
- Ese lote ya debe quedar con `batch_code` y metadatos de trazabilidad.

### 4. Impresión
- Desde el lote recién creado se dispara la impresión.
- La impresión debe usar Zebra.
- La etiqueta debe salir prellenada.

## Qué no hacer

- No usar `/printing/jobs` como formulario manual principal para lotes de producción.
- No pedir al operario escribir producto, fechas y vencimiento a mano para la etiqueta diaria.
- No duplicar el formulario de lote entre NEXO y FOGO.

## Matriz mínima de plantillas

### A. Producto terminado
Campos:
- nombre del producto
- `batch_code`
- fecha de producción
- hora de producción
- fecha de vencimiento
- cantidad / unidad
- responsable

### B. Preparación
Campos:
- nombre de la preparación
- `batch_code`
- fecha de producción
- hora
- vencimiento
- LOC destino
- responsable

### C. Mezcla porcionada / sublote
Campos:
- producto base
- lote padre
- sublote o porción
- peso / cantidad
- fecha y hora
- vencimiento
- QR del lote o sublote

## Rol de NEXO

NEXO queda responsable de:

- inventario
- sedes
- LOCs
- remisiones
- retiros
- stock
- impresión rápida de soporte

NEXO no debe ser la superficie principal para ejecutar lotes de producción.

## Rol de FOGO

FOGO queda responsable de:

- recetas
- pasos
- ejecución de producción
- lotes reales
- metadatos base para impresión

## Papel de la Zebra

La Zebra queda instalada como equipo operativo permanente para:

1. etiquetas de LOC
2. etiquetas diarias de producción
3. reimpresiones

## Papel de la tablet del Centro

### Bodeguero
- recepción de proveedor
- preparar despachos
- revisar stock por LOC
- remisiones y retiros

### Producción
- ejecutar lotes en FOGO
- imprimir etiquetas del lote recién creado

## V1 que debe quedar lista

1. NEXO abre FOGO `/production-batches` con sede activa.
2. La pantalla de NEXO deja claro que el lote se crea en FOGO.
3. Existe matriz de etiquetas por tipo de lote.
4. Zebra queda definida para LOC + producción.

## Siguiente implementación recomendada

1. En FOGO: botón `Imprimir etiqueta` al cerrar lote.
2. En FOGO: payload estándar por lote para Zebra.
3. En impresión: preset específico para producción, no solo `PROD` genérico.
4. En historial: reimpresión por lote.
