# Casos De Ejecucion Detallados NEXO Entradas 2026-04-21

> Estado actual: `secundario / contingencia`.
> No es el bloque prioritario de validacion operativa hoy.
> Primero ejecutar `Remisiones NEXO` y despues `ORIGO`.

Usa estos archivos antes de empezar:
- Seed: [seed_test_nexo_entries_remissions.sql](C:/Users/User/devVentoGroup/vento-nexo/supabase/seed_test_nexo_entries_remissions.sql:1)
- Cleanup: [cleanup_test_nexo_entries_remissions.sql](C:/Users/User/devVentoGroup/vento-nexo/supabase/cleanup_test_nexo_entries_remissions.sql:1)

## Lo que hace hoy la pantalla de Entradas
- esta pantalla en NEXO es `Entrada de emergencia`
- pide obligatoriamente:
  - `Proveedor`
  - `Fecha de recepcion`
  - `Motivo de emergencia`
- los productos no aparecen hasta completar ese contexto
- la `LOC` no se elige arriba: se elige dentro de cada línea del producto

## Seed de esta ronda
Cuando corras el seed, deben existir estas referencias:
- Proveedor: `TEST NEXO OPS Proveedor`
- Producto: `TEST NEXO OPS Entrada secos (TEST-NEXO-OPS-ENT-001)`
- Producto: `TEST NEXO OPS Entrada frio (TEST-NEXO-OPS-ENT-002)`

## Precondiciones
- Rol: `bodeguero`
- Sede: `Centro de Produccion`
- Ya corriste el seed una sola vez

## NEXO-ENT-001 Abrir la pantalla correcta
1. Cambia a rol `bodeguero`
2. Cambia a sede `Centro de Produccion`
3. Vuelve al home y recarga
4. Entra a `Entradas`

Resultado esperado:
- el título debe decir `Entrada de emergencia`
- debe verse el bloque `Contexto`
- no debes ver todavía la captura de productos activa si no has llenado el contexto

## NEXO-ENT-002 Completar contexto obligatorio
1. En `Proveedor`, selecciona `TEST NEXO OPS Proveedor`
2. En `Fecha de recepcion`, pon la fecha de hoy
3. En `Motivo de emergencia`, escribe `TEST NEXO OPS emergencia secos`

Resultado esperado:
- el bloque `Productos` se habilita
- aparecen las líneas de captura
- ya puedes escoger producto y LOC

## NEXO-ENT-003 Crear entrada a Secos
1. Dentro del bloque `Productos`, en la línea 1, en `Producto`, selecciona `TEST NEXO OPS Entrada secos (TEST-NEXO-OPS-ENT-001)`
2. En `Cantidad recibida`, escribe `6`
3. En `Unidad`, deja `un` o la unidad que venga por defecto del producto
4. En `LOC`, selecciona `Secos`
5. Abre `Detalles opcionales`
6. En `Cantidad declarada`, escribe `6`
7. En `Notas`, escribe `TEST NEXO OPS entrada secos`
8. Pulsa `Guardar entrada`

Resultado esperado:
- aparece mensaje de éxito
- la entrada se crea
- el producto queda disponible en el LOC `Secos`

## NEXO-ENT-004 Verificar contenido en el LOC
1. Escanea el QR de `Secos`
2. Toca `Ver contenido`
3. Busca `TEST NEXO OPS Entrada secos`

Resultado esperado:
- debe aparecer `TEST NEXO OPS Entrada secos`
- la cantidad visible debe ser `6`

## NEXO-ENT-005 Crear entrada a Cuarto frio
1. Vuelve a `Entradas`
2. En `Proveedor`, selecciona `TEST NEXO OPS Proveedor`
3. En `Fecha de recepcion`, pon la fecha de hoy
4. En `Motivo de emergencia`, escribe `TEST NEXO OPS emergencia frio`
5. En la línea 1, elige `TEST NEXO OPS Entrada frio (TEST-NEXO-OPS-ENT-002)`
6. En `Cantidad recibida`, escribe `4`
7. En `Unidad`, deja `un` o la unidad visible por defecto
8. En `LOC`, selecciona `Cuarto frio`
9. En `Detalles opcionales`, pon:
   - `Cantidad declarada`: `4`
   - `Notas`: `TEST NEXO OPS entrada frio`
10. Pulsa `Guardar entrada`

Resultado esperado:
- mensaje de éxito
- el producto aparece en `Cuarto frio`

## NEXO-ENT-006 Validar trazabilidad en Movimientos
1. Entra a `Movimientos`
2. Filtra por producto `TEST NEXO OPS Entrada secos (TEST-NEXO-OPS-ENT-001)`
3. Ubica la entrada recién creada

Resultado esperado:
- el tipo debe verse como `Entrada`
- debe verse `Saldo inicial`
- debe verse `Movimiento`
- debe verse `Saldo final`
- debe verse `Hecho por`
- el detalle debe permitir reconocer que viene de una entrada

## NEXO-ENT-007 Validar bloqueo por contexto incompleto
1. Entra a `Entradas`
2. No completes `Proveedor`, `Fecha de recepcion` o `Motivo de emergencia`

Resultado esperado:
- el bloque de productos no debe quedar operativo
- debe salir el mensaje de que primero completes el contexto

## NEXO-ENT-008 Validar error por LOC faltante
1. Completa el contexto
2. Selecciona `TEST NEXO OPS Entrada secos`
3. Escribe `Cantidad recibida = 2`
4. No selecciones `LOC`
5. Pulsa `Guardar entrada`

Resultado esperado:
- no debe guardar
- debe mostrar error `Selecciona una LOC para cada item.`

## NEXO-ENT-009 Validar error por motivo faltante
1. Entra a `Entradas`
2. Selecciona `TEST NEXO OPS Proveedor`
3. Pon fecha
4. Deja vacío `Motivo de emergencia`
5. Intenta guardar cualquier línea

Resultado esperado:
- no debe guardar
- debe mostrar error por motivo de emergencia faltante

## NEXO-ENT-010 Validar bloqueo por rol
1. Cambia a rol `cocinero`
2. Mantén sede `Centro de Produccion`
3. Vuelve al home y recarga
4. Verifica menú
5. Intenta abrir `/inventory/entries`

Resultado esperado:
- `Entradas` no debe verse en menú
- la URL debe bloquear o redirigir

## Cierre de Entradas
Si todo salió bien:
- `TEST NEXO OPS Entrada secos` debe existir en `Secos`
- `TEST NEXO OPS Entrada frio` debe existir en `Cuarto frio`
- `Movimientos` debe mostrar quién hizo la entrada
