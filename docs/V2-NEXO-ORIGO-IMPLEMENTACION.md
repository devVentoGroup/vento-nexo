# V2 NEXO + ORIGO · Implementación Operativa

Fecha de corte: 2026-03-21

## Objetivo
Cerrar V2 como flujo único y definitivo para insumos/productos, compra, recepción y trazabilidad, sin dependencia de V1.

## Estado actual (resumen)
- Hecho: ficha técnica de catálogo (solo lectura) en NEXO.
- Hecho: trazabilidad ORIGO visible en ficha técnica (últimas órdenes y recepciones por producto).
- Hecho: validación TypeScript en NEXO sin errores (`npx tsc --noEmit`).
- Parcial: formularios V2 conviven con referencias/copy de continuidad V1.
- Pendiente crítico: lotes y vencimiento guardan flags, pero no están operativos de punta a punta.

## Plan de cierre V2 por repositorio

## 1) vento-shell (base de datos, fuente única)
1. Migración para trazabilidad completa de lotes/vencimiento:
   - `inventory_entry_items.lot_number text null`
   - `inventory_entry_items.expiry_date date null`
   - Opcional de consulta rápida: índices por `(product_id, lot_number)` y `(product_id, expiry_date)`.
2. Funciones/vistas para auditoría operativa:
   - Vista de historial de entradas por producto/sede/lote.
   - Vista de faltantes para compra sugerida por proveedor (si no existe consolidada).
3. Scripts de calidad de datos:
   - Detección de productos sin proveedor primario.
   - Detección de duplicados nominales.
   - Detección de insumos sin unidad base coherente.

## 2) vento-origo (compra + recepción)
1. Órdenes de compra:
   - Mantener filtro de proveedor + selector “Todos los proveedores”.
   - Buscador en selección de insumos (ya activo, verificar UX final).
2. Recepciones/remisiones:
   - Si producto tiene `lot_tracking = true`, pedir lote.
   - Si producto tiene `expiry_tracking = true`, pedir fecha de vencimiento.
   - Persistir lote/vencimiento en `inventory_entry_items`.
3. PDF para proveedores externos:
   - Mantener enlace público con token firmado y expiración.
   - Definir política de expiración y reemisión desde la orden.

## 3) vento-nexo (catálogo + fichas + operación)
1. Formularios definitivos V2:
   - Mensajes de error por campo (no banner global bloqueante).
   - Persistencia de datos digitados ante error.
   - Ocultar opciones que no aplican por flujo (evitar ruido en tipo de inventario).
2. Ficha técnica:
   - Ya incluye identidad, unidades, costo/abastecimiento, stock por sede, trazabilidad ORIGO.
   - Siguiente mejora: sección de “unidad operativa en uso” en resumen superior con regla explícita.
3. Limpieza de V1:
   - Retirar textos, rutas y toggles de continuidad V1 en pantallas de operación.

## 4) vento-viso (personas/documentos)
1. Corregir badge `Docs OK` para que dependa de evidencia real (no valor derivado incompleto).
2. Tabla de trabajadores:
   - Mostrar contador real de documentos válidos.
   - Estado derivado con reglas visibles (ej. `0/3`, `2/3`, `3/3`).

## Criterios de “V2 listo”
1. Crear/editar insumo o producto sin pérdida de datos por error.
2. Todo producto de inventario con unidad base + proveedor primario (cuando aplique).
3. Orden de compra filtrable por proveedor y selección de insumos coherente.
4. Recepción impacta inventario y deja trazabilidad consultable por ficha técnica.
5. Lotes/vencimiento funcionan operativamente donde están activados.
6. Sin rutas/pantallas activas dependientes de V1 para operación diaria.

## Secuencia recomendada de ejecución
1. `vento-shell`: migración lotes/vencimiento + vistas de auditoría.
2. `vento-origo`: captura y persistencia de lote/vencimiento en recepción.
3. `vento-nexo`: pulido final formularios V2 y limpieza total de copy/rutas V1.
4. `vento-viso`: ajuste de estado documental real.

