# Validacion Reversible Con Inventario Dummy - Centro - 2026-04-21

## Objetivo
Este paquete crea un inventario minimo, reversible y claramente marcado como `TEST NEXO CP` para validar el flujo fisico y operativo de NEXO en el Centro sin contaminar el inventario real.

## Archivos
- `supabase/seed_test_nexo_cp_center.sql`
- `supabase/cleanup_test_nexo_cp_center.sql`

## Que crea
Sede objetivo: `CENTRO_PROD`

LOCs usados:
- `LOC-CP-BOD-MAIN` | Bodega principal
- `LOC-CP-SECOS1-MAIN` | Secos
- `LOC-CP-FRIO-MAIN` | Cuarto frio
- `LOC-CP-CONG-MAIN` | Congelados
- `LOC-CP-N2P-MAIN` | Nevera produccion
- `LOC-CP-N3P-MAIN` | Nevera despacho

Productos dummy:
- `TEST-NEXO-CP-001` | TEST NEXO CP Bodega principal | 10 un en Bodega principal
- `TEST-NEXO-CP-002` | TEST NEXO CP Secos | 10 un en Secos
- `TEST-NEXO-CP-003` | TEST NEXO CP Cuarto frio | 8 un en Cuarto frio
- `TEST-NEXO-CP-004` | TEST NEXO CP Congelados | 6 un en Congelados
- `TEST-NEXO-CP-005` | TEST NEXO CP Nevera produccion | 4 un en Nevera produccion
- `TEST-NEXO-CP-006` | TEST NEXO CP Nevera despacho | 3 un en Nevera despacho
- `TEST-NEXO-CP-007` | TEST NEXO CP Multi LOC | 5 un en Bodega principal y 7 un en Secos

## Que pruebas cubre bien
- QR de LOC y apertura de landing.
- `Ver contenido` de cada LOC con stock visible.
- `Retirar de aqui` con producto real en ese LOC.
- retiro valido con descuento de stock.
- retiro invalido por cantidad mayor al disponible.
- regreso al landing del LOC despues del retiro.
- movimientos de inventario asociados a productos dummy.
- validacion de nombres visibles de LOC.
- validacion de que un mismo producto pueda existir en mas de un LOC.

## Que NO cubre completo
- compras reales en ORIGO.
- recepciones reales con proveedor real.
- lotes reales de FOGO.
- consumo real de produccion.
- conteo inicial real.
- go-live real de inventario.

## Como usarlo
1. Abrir el SQL Editor o correr el script manualmente desde `vento-shell`.
2. Ejecutar `supabase/seed_test_nexo_cp_center.sql`.
3. Entrar a NEXO y validar estos bloques en este orden:
   - QR -> landing del LOC
   - ver contenido
   - retirar de aqui
   - movimientos
   - remision basica si aplica a tu ruta actual
4. Cuando termines la sesion, ejecutar `supabase/cleanup_test_nexo_cp_center.sql`.

## Casos recomendados inmediatos
1. Escanear `Bodega principal` y confirmar que se ven `TEST-NEXO-CP-001` y `TEST-NEXO-CP-007`.
2. Retirar 2 unidades de `TEST-NEXO-CP-001` desde `Bodega principal`.
3. Intentar retirar 99 unidades del mismo producto y confirmar bloqueo.
4. Escanear `Secos` y confirmar que se ven `TEST-NEXO-CP-002` y `TEST-NEXO-CP-007`.
5. Escanear `Nevera produccion` y confirmar que se ve `TEST-NEXO-CP-005`.
6. Revisar `Movimientos` y confirmar trazabilidad de los retiros dummy.

## Criterio de limpieza
Al terminar, no dejes estos productos en el sistema. Ejecuta siempre el cleanup el mismo dia de la prueba o antes de comenzar una nueva ronda.

