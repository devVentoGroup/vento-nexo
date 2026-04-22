# Casos De Ejecucion Detallados NEXO Remisiones 2026-04-21

Usa estos archivos antes de empezar:
- Seed: [seed_test_nexo_entries_remissions.sql](C:/Users/User/devVentoGroup/vento-nexo/supabase/seed_test_nexo_entries_remissions.sql:1)
- Cleanup: [cleanup_test_nexo_entries_remissions.sql](C:/Users/User/devVentoGroup/vento-nexo/supabase/cleanup_test_nexo_entries_remissions.sql:1)

## Lo que hace hoy la pantalla de Remisiones
- la vista se llama `Pedir y recibir`
- en satélite sirve para solicitar y recibir
- en Centro sirve para preparar y despachar
- la ruta de abastecimiento sale de `site_supply_routes`
- si la sede satélite no tiene ruta activa hacia Centro, no podrás crear la remisión

## Seed de esta ronda
Cuando corras el seed, deben existir estos productos con stock en Centro:
- `TEST NEXO OPS Remision bodega (TEST-NEXO-OPS-REM-001)` en `Bodega principal`
- `TEST NEXO OPS Remision nevera (TEST-NEXO-OPS-REM-002)` en `Nevera produccion`
- `TEST NEXO OPS Remision multi LOC (TEST-NEXO-OPS-REM-003)` repartido entre `Bodega principal` y `Secos`

## Precondiciones
- ya corriste el seed
- tienes una sede satélite que ya funcione en `Pedir y recibir`
- esa sede sí tiene ruta activa hacia `Centro de Produccion`

## NEXO-REM-001 Abrir la vista correcta desde satélite
1. Cambia a rol `cajero`
2. Cambia a una sede `Satelite` real que ya use remisiones
3. Vuelve al home y recarga
4. Entra a `Pedir y recibir`

Resultado esperado:
- la vista debe abrir como flujo de satélite
- si la sede tiene ruta, debe permitir crear solicitud
- si no hay ruta, debe mostrar advertencia y no se puede seguir

## NEXO-REM-002 Crear solicitud nueva
1. Dentro de `Pedir y recibir`, pulsa `Nueva solicitud`
2. Verifica que el origen por defecto sea `Centro de Produccion` o el fulfillment site correcto
3. Agrega dos líneas:
   - `TEST NEXO OPS Remision bodega (TEST-NEXO-OPS-REM-001)` cantidad `3`
   - `TEST NEXO OPS Remision nevera (TEST-NEXO-OPS-REM-002)` cantidad `2`
4. En `Notas`, escribe `TEST NEXO OPS solicitud satelite`
5. Guarda la remisión

Resultado esperado:
- la remisión se crea
- el estado queda `Pendiente`
- en el detalle debe quedar visible `Solicito`

## NEXO-REM-003 Ver remisión en Centro
1. Cambia a rol `bodeguero`
2. Cambia a sede `Centro de Produccion`
3. Vuelve al home y recarga
4. Entra a `Pedir y recibir`
5. Busca la remisión recién creada
6. Ábrela

Resultado esperado:
- la remisión debe aparecer en la cola de Centro
- en el detalle debe verse quién la solicitó
- el estado debe seguir `Pendiente`

## NEXO-REM-004 Preparar remisión
1. Dentro de la remisión, entra al modo `Preparar`
2. Para `TEST NEXO OPS Remision bodega`, asigna `Bodega principal`
3. Marca cantidad preparada `3`
4. Para `TEST NEXO OPS Remision nevera`, asigna `Nevera produccion`
5. Marca cantidad preparada `2`
6. Guarda la preparación

Resultado esperado:
- la remisión queda `Preparando` o `Lista para despacho`
- en el detalle debe verse `Preparo`

## NEXO-REM-005 Despachar o pasar a tránsito
1. Si aparece `Checklist tránsito`, ábrelo
2. Completa los campos obligatorios del checklist
3. Ejecuta la acción para enviar a tránsito

Resultado esperado:
- la remisión cambia a `En tránsito`
- en el detalle debe verse `Despacho`

## NEXO-REM-006 Recibir remisión en satélite
1. Cambia a rol `cajero`
2. Cambia a la misma sede satélite donde se solicitó
3. Vuelve al home y recarga
4. Entra a `Pedir y recibir`
5. Abre la remisión
6. Recibe:
   - `TEST NEXO OPS Remision bodega` cantidad `3`
   - `TEST NEXO OPS Remision nevera` cantidad `2`
7. Confirma recepción

Resultado esperado:
- la remisión queda `Recibida`
- en el detalle debe verse `Recibio`
- la trazabilidad completa debe mostrar:
  - `Solicito`
  - `Preparo`
  - `Despacho`
  - `Recibio`

## NEXO-REM-007 Validar trazabilidad en la lista
1. Vuelve a `Pedir y recibir`
2. Revisa la tabla de abiertas o historial

Resultado esperado:
- la columna `Trazabilidad` debe mostrar el resumen de actores
- si hay notas, deben aparecer debajo sin reemplazar la trazabilidad

## NEXO-REM-008 Validar salida de inventario en Centro
1. Cambia a rol `bodeguero`
2. Cambia a sede `Centro de Produccion`
3. Entra a `Movimientos`
4. Filtra por `TEST NEXO OPS Remision bodega (TEST-NEXO-OPS-REM-001)`

Resultado esperado:
- aparece la salida por remisión o movimiento equivalente
- debe verse `Hecho por`
- el saldo final debe reflejar el descuento

## NEXO-REM-009 Validar caso multi LOC
1. Crea una nueva remisión desde el satélite
2. Usa solo `TEST NEXO OPS Remision multi LOC (TEST-NEXO-OPS-REM-003)` cantidad `9`
3. Abre esa remisión como `bodeguero` en Centro
4. Verifica la preparación

Resultado esperado:
- debe permitir resolverla con stock repartido
- no debe quedar bloqueada solo porque un LOC no cubra todo

## NEXO-REM-010 Validar bloqueo por rol en Centro
1. Cambia a rol `panadero`
2. Cambia a sede `Centro de Produccion`
3. Vuelve al home y recarga
4. Revisa menú
5. Intenta abrir `/inventory/remissions`

Resultado esperado:
- no debe poder preparar ni despachar remisiones de Centro
- si entra por URL, debe bloquear o redirigir

## Cleanup final
Cuando termines Entradas y Remisiones:
1. corre [cleanup_test_nexo_entries_remissions.sql](C:/Users/User/devVentoGroup/vento-nexo/supabase/cleanup_test_nexo_entries_remissions.sql:1)
2. verifica que ya no queden:
   - productos `TEST NEXO OPS ...`
   - proveedor `TEST NEXO OPS Proveedor`
   - entradas de prueba
   - remisiones de prueba
