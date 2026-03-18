# Sandbox de validacion NEXO v1

Estado: `Listo para usar`
Fecha: `2026-03-17`

## Objetivo

Poder validar `NEXO v1` sin cargar inventario real.

Este sandbox crea solo datos artificiales y aislados:
- categorias `SANDBOX V1`;
- productos `SANDBOX V1`;
- `LOCs` de prueba en `Centro de produccion`;
- stock minimo en `Centro`;
- activacion en `Centro` y `Saudo`.

Todo queda preparado para correr los casos de remisiones y luego borrarlo sin tocar datos reales.

Nota:
- los productos del sandbox quedan habilitados para `Saudo` y `Centro` con `audience = BOTH`, para que siembren bien en el selector de remisiones v1.

## Que crea el seed

Sedes usadas:
- `CENTRO_PROD` = `Centro de Producción`
- `SAUDO` = `Saudo`

Categorias:
- `SANDBOX V1`
- `SANDBOX V1 Insumos`
- `SANDBOX V1 Preparaciones`
- `SANDBOX V1 Venta`

Productos:
- `SANDBOX V1 Harina normal` (`SBXV1-INS-001`)
- `SANDBOX V1 Base blanca parcial` (`SBXV1-PRE-001`)
- `SANDBOX V1 Croissant multi loc` (`SBXV1-VTA-001`)
- `SANDBOX V1 Gaseosa normal` (`SBXV1-VTA-002`)

LOCs en `Centro`:
- `LOC-CP-SBX-A1-01`
- `LOC-CP-SBX-B1-01`
- `LOC-CP-SBX-C1-01`

Stock inicial:  
- `SBXV1-INS-001`: `12 un` en `LOC-CP-SBX-A1-01`
- `SBXV1-VTA-002`: `12 un` en `LOC-CP-SBX-A1-01`
- `SBXV1-VTA-001`: `3 un` en `LOC-CP-SBX-B1-01`
- `SBXV1-VTA-001`: `4 un` en `LOC-CP-SBX-C1-01`
- `SBXV1-PRE-001`: `10 un` en `LOC-CP-SBX-C1-01`

## Casos sugeridos

### Caso A. Remision normal

Solicita desde `Saudo`:
- `SANDBOX V1 Harina normal`: `4 un`
- `SANDBOX V1 Gaseosa normal`: `3 un`

### Caso B. Remision con partir linea

Solicita desde `Saudo`:
- `SANDBOX V1 Croissant multi loc`: `5 un`

Ningun `LOC` individual cubre `5`, pero `Centro` si tiene `7` en total.

### Caso C. Recepcion parcial

Solicita desde `Saudo`:
- `SANDBOX V1 Base blanca parcial`: `6 un`

Despacha `6` desde `Centro` y recibe menos en `Saudo` para dejar la remision en `Parcial`.

## Como limpiar todo despues

No borres tablas a mano.

Cuando termines las pruebas, corre desde `vento-shell`:

```powershell
& "C:\Users\User\devVentoGroup\vento-shell\scripts\run-nexo-v1-validation-sandbox-cleanup.ps1"
```

Ese script:
1. crea una migracion de cleanup con timestamp;
2. sincroniza migraciones al resto del workspace;
3. hace `db push`;
4. deja eliminado el sandbox completo.

## Alcance del cleanup

El cleanup elimina:
- remisiones hechas con productos `SBXV1-*`;
- movimientos de inventario de esos productos;
- stock por sede y por `LOC` de esos productos;
- entradas y traslados de prueba si llegas a usarlos con esos productos;
- `LOCs` `LOC-CP-SBX-*`;
- productos `SANDBOX V1`;
- categorias `SANDBOX V1`.

No elimina:
- productos reales;
- categorias reales;
- rutas operativas reales fuera del sandbox.

## Actualizacion 2026-03-18

Correcciones aplicadas en detalle de remision (`/inventory/remissions/[id]`):
- recepcion parcial por linea ahora sincroniza estado de la remision automaticamente (`in_transit` -> `partial`) para reflejar progreso real en pantalla;
- estado visual por linea ahora se calcula por cantidades reales (solicitado/preparado/enviado/recibido/faltante), evitando chips en `Pendiente` cuando la remision ya fue recibida;
- `Eliminar remision` ahora valida eliminacion real: si no se puede borrar por trazabilidad, devuelve error claro o aplica fallback de `cancelled` con mensaje explicito;
- acciones `Cancelar/Eliminar` movidas al listado de remisiones (abiertas e historial), fuera del detalle por documento;
- botones de accion ajustados a estilo menos agresivo (paleta y densidad visual mas sobria);
- unidad `un` se normaliza a texto `Unidades` en vistas operativas.

Adicional:
- se implementó RPC transaccional `public.reverse_restock_request(uuid)` para `Anular + reversa`;
- esta RPC revierte movimientos `transfer_out/transfer_in`, ajusta stock por sede y restaura stock por `LOC` origen según `shipped_quantity`;
- deja marcador en `notes` para evitar doble reversa y marca la remisión en `cancelled` con trazabilidad.

## Matriz E2E recomendada (v1 remisiones)

Ejecutar esta validación con 3 perfiles:
- `propietario` o `gerente_general` (gestión completa);
- `bodeguero` (operación centro);
- usuario satélite operativo de rol `cocinero`, `barista` o `cajero` (solicita/recibe).

### Casos por estado y acción

1. `pending` (gestión)
- En bandeja: debe ver `Ver`, `Cancelar`, `Eliminar`.
- `Cancelar`: estado final `cancelled`.
- `Eliminar`: remisión sale del listado.

2. `preparing` (gestión)
- En bandeja: debe ver `Ver`, `Cancelar`, `Eliminar`.
- `Eliminar` debe funcionar si no hay trazabilidad de movimientos.

3. `in_transit` (gestión con alcance origen+destino)
- En bandeja: debe ver `Ver`, `Anular + reversa`.
- `Anular + reversa`: estado final `cancelled`, stock revertido.

4. `partial` (gestión con alcance origen+destino)
- En bandeja: debe ver `Ver`, `Anular + reversa`.
- `Anular + reversa`: revierte lo enviado/recibido y deja trazabilidad.

5. `received` (gestión con alcance origen+destino)
- En historial: debe ver `Ver`, `Anular + reversa`.
- `Anular + reversa`: debe cancelar y reversar inventario.

6. `cancelled` (gestión)
- En historial: debe ver `Ver`, `Eliminar`.
- Si no tiene marcador de reversa, puede aparecer `Anular + reversa`.
- Si ya tiene marcador `[REVERSA_APLICADA]`, no debe mostrar `Anular + reversa`.

7. `bodeguero` en cualquier estado
- No debe ver botones destructivos (`Cancelar`, `Eliminar`, `Anular + reversa`).

8. satélite solicitante/receptor en cualquier estado
- No debe ver botones destructivos (`Cancelar`, `Eliminar`, `Anular + reversa`).

9. intento de `cancel/delete` desde detalle (`/remissions/[id]`)
- Debe bloquearse con mensaje: acción disponible solo en bandeja.

10. intento fuera de matriz (backend)
- Debe fallar con mensaje controlado: acción no aplica para el estado actual.

### Chequeos de consistencia de datos

Después de `Anular + reversa`, validar:
- `restock_requests.status = 'cancelled'`;
- existe marcador `[REVERSA_APLICADA` en `restock_requests.notes`;
- se insertaron movimientos de reversa (`transfer_in` en origen, `transfer_out` en destino cuando aplique);
- `inventory_stock_by_site` y `inventory_stock_by_location` reflejan el ajuste esperado.

## Checklist ejecutable (paso a paso)

Formato por caso:
- `Paso`: acción concreta a ejecutar.
- `Esperado`: resultado funcional visible.
- `Evidencia`: qué capturar (UI / dato DB).

### Plantillas de creación (usar siempre estas)

Usar estas remisiones base para que todos prueben lo mismo:

1. `R-PEND-DEL` (eliminación sin trazabilidad)
- Origen: `Centro de Producción`
- Destino: `Saudo`
- Fecha esperada: `mañana`
- Notas: `Sandbox v1 · R-PEND-DEL`
- Productos:
  - `SANDBOX V1 Harina normal` · Cantidad `4` · Unidad `Unidades` · Área `(sin área)`
  - `SANDBOX V1 Gaseosa normal` · Cantidad `3` · Unidad `Unidades` · Área `(sin área)`

2. `R-MULTI-LOC` (split / tránsito / reversa)
- Origen: `Centro de Producción`
- Destino: `Saudo`
- Fecha esperada: `mañana`
- Notas: `Sandbox v1 · R-MULTI-LOC`
- Productos:
  - `SANDBOX V1 Croissant multi loc` · Cantidad `5` · Unidad `Unidades` · Área `(sin área)`

3. `R-PARTIAL` (recepción parcial / reversa)
- Origen: `Centro de Producción`
- Destino: `Saudo`
- Fecha esperada: `mañana`
- Notas: `Sandbox v1 · R-PARTIAL`
- Productos:
  - `SANDBOX V1 Base blanca parcial` · Cantidad `6` · Unidad `Unidades` · Área `(sin área)`

Reglas de digitación:
- completar siempre `origen`, `destino`, `fecha esperada` y `notas`;
- mínimo 1 producto por remisión;
- no dejar cantidad en `0`;
- usar nombres exactos del sandbox para facilitar búsqueda.

### Caso 01 · Pending (gestión)

- Paso:
  - Iniciar sesión como `gerente_general`.
  - Crear remisión usando plantilla `R-PEND-DEL`.
  - Verificar antes de guardar:
    - origen y destino correctos;
    - fecha esperada cargada;
    - notas cargadas;
    - 2 productos con cantidad > 0.
  - Guardar y dejarla en `pending`.
  - Ir a bandeja de remisiones.
- Esperado:
  - En columna `Acciones` aparecen `Ver`, `Cancelar`, `Eliminar`.
- Evidencia:
  - Captura de la fila en bandeja con esos botones visibles.

### Caso 02 · Cancelar en pending

- Paso:
  - En la misma fila `pending`, pulsar `Cancelar`.
- Esperado:
  - Estado cambia a `cancelled`.
  - La remisión pasa a historial.
- Evidencia:
  - Captura de alerta de éxito y fila en historial con estado `Cancelada`.

### Caso 03 · Eliminar en pending/preparing sin trazabilidad

- Paso:
  - Crear remisión usando plantilla `R-PEND-DEL`.
  - No iniciar preparación, no despachar, no recibir.
  - Pulsar `Eliminar` desde bandeja.
- Esperado:
  - Remisión eliminada del listado/historial.
- Evidencia:
  - Captura de mensaje “Remisión eliminada”.
  - Búsqueda en UI sin resultados para ese ID.

### Caso 04 · In transit (gestión)

- Paso:
  - Crear remisión usando plantilla `R-MULTI-LOC`.
  - Preparar y despachar hasta `in_transit`.
  - Abrir bandeja con usuario gestión que tenga alcance en ambas sedes.
- Esperado:
  - En acciones aparece `Ver` y `Anular + reversa`.
  - No aparece `Eliminar`.
- Evidencia:
  - Captura de fila en estado `En tránsito` con acciones.

### Caso 05 · Anular + reversa desde in_transit

- Paso:
  - Pulsar `Anular + reversa` en remisión `in_transit`.
- Esperado:
  - Estado final `cancelled`.
  - Mensaje de éxito de reversa aplicada.
- Evidencia:
  - Captura de éxito.
  - Captura de fila cancelada en historial.

### Caso 06 · Partial (gestión)

- Paso:
  - Crear remisión usando plantilla `R-PARTIAL`.
  - Preparar y despachar.
  - Recibir parcialmente para dejarla en `partial`.
  - Ir a bandeja.
- Esperado:
  - Acción disponible: `Anular + reversa`.
- Evidencia:
  - Captura de fila `Recepción parcial` con botón.

### Caso 07 · Received (gestión)

- Paso:
  - Crear remisión usando plantilla `R-PARTIAL` o `R-PEND-DEL`.
  - Completar flujo hasta `received`.
  - Ir a historial.
- Esperado:
  - Se permite `Anular + reversa`.
- Evidencia:
  - Captura de fila `Recibida` con botón.

### Caso 08 · Cancelled con marcador de reversa

- Paso:
  - Ejecutar `Anular + reversa` sobre una remisión.
  - Recargar historial.
- Esperado:
  - Ya no debe mostrarse de nuevo `Anular + reversa` para esa remisión.
- Evidencia:
  - Captura de fila cancelada sin botón de reversa.

### Caso 09 · Bodeguero (restricción)

- Paso:
  - Iniciar sesión como `bodeguero`.
  - Revisar bandeja e historial.
- Esperado:
  - No aparecen `Cancelar`, `Eliminar`, `Anular + reversa`.
- Evidencia:
  - Captura de filas sin acciones destructivas.

### Caso 10 · Satélite (restricción)

- Paso:
  - Iniciar sesión como usuario satélite operativo.
  - Revisar bandeja e historial.
- Esperado:
  - No aparecen acciones destructivas.
- Evidencia:
  - Captura de filas con solo `Ver` / `Recibir` según estado.

### Caso 11 · Bloqueo en detalle

- Paso:
  - Abrir `/inventory/remissions/[id]` y forzar acción destructiva desde URL/form viejo (si existe).
- Esperado:
  - Mensaje: acción disponible solo en bandeja.
- Evidencia:
  - Captura del mensaje de bloqueo.

### Caso 12 · Validación de consistencia DB tras reversa

- Paso:
  - Tomar un `request_id` reversado.
  - Validar en DB:
    - `restock_requests.status = cancelled`
    - `notes` contiene `[REVERSA_APLICADA`
    - movimientos de reversa insertados
    - stock ajustado en sitio y LOC.
- Esperado:
  - Datos coherentes con la operación de reversa.
- Evidencia:
  - capturas de consultas SQL o export corto de resultados.
