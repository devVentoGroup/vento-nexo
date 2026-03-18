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
- botones de accion ajustados a estilo menos agresivo (paleta y densidad visual mas sobria);
- unidad `un` se normaliza a texto `Unidades` en vistas operativas.
