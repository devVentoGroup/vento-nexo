# Estado actual NEXO

Fecha: 2026-05-28
Rol: inventario, logistica interna, LOCs, remisiones y control operativo.

## Implementado

- Auth/SSO con Vento Shell y guard de permisos.
- AppShell estandar y navegacion operativa por inventario.
- Catalogo maestro de productos con categorias operativas, configuracion por sede, proveedores, imagenes y presentaciones fisicas.
- Stock por sede y por LOC.
- Stock fisico por presentacion mediante `inventory_stock_by_uom_profile`; no se infieren bolsas/cajas desde stock base.
- Entradas manuales, conteo inicial, ajustes, retiros, traslados y movimientos auditables.
- Remisiones/abastecimiento interno con solicitud, preparacion, despacho, transito y recepcion.
- Preparacion por LOC, division de lineas y recepcion parcial.
- Kiosk/board por LOC, posiciones internas, retiro desde kiosk y asignacion de stock sin ubicacion.
- Settings de sedes, rutas de abastecimiento, categorias y unidades.
- Printing/Zebra: setup, jobs y designer.

## Estado real de integracion

- Origo: Nexo todavia debe cerrar la recepcion contra OC como flujo nativo. Hay base para recibir `purchase_order_id`, pero falta convertirlo en experiencia completa con diferencias y estado de OC.
- Fogo: Nexo ya no debe administrar recetas como flujo principal. Debe auditar movimientos originados por Fogo y recibir producto terminado/consumo desde los contratos de Shell.
- Pass/Pulso: Nexo no debe usar categorias comerciales; solo categorias operativas y stock.
- Shell: cualquier cambio de tabla, RPC, permiso o storage se hace desde `vento-shell`.

## Pendiente para sinergia

1. Recepcion contra orden de compra de Origo: precarga de lineas, cantidades parciales, costos, presentaciones y cierre de estado.
2. Produccion Fogo -> Nexo: consumo de insumos y entrada de terminado con trazabilidad por lote.
3. Rediseño final de remisiones por modos separados: bandeja, detalle documento, modo preparacion y modo recepcion.
4. Liquidacion interna y centros de costo sin mezclar costo inventariable con precio de transferencia.
5. Pruebas de permisos y RLS enfocadas en inventario, kiosk, remisiones y board.

## Documentos anteriores

`ROADMAP-NEXO.md`, `BACKLOG-TECNICO-V1-NEXO.md`, `MODELO-CATEGORIAS-CANONICO.md` y `EXPERIENCIA-OPERATIVA-POR-ROL-V1.md` son los unicos complementos vivos. Los sandbox, validaciones y bitacoras de abril fueron eliminados.

