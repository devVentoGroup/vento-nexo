# SANDBOX VALIDACION V1 · CHECKLIST UNICO

Estado: `Activo`  
Fecha: `2026-03-18`

## Reglas de este checklist

- No crear cuentas nuevas.
- No crear roles nuevos.
- Usar tus usuarios actuales + selector de rol/override en Nexo.
- Cada caso es autocontenido: incluye rol, sede, datos, pasos y resultado.

## Datos base del sandbox

- Sedes:
  - `CENTRO_PROD` = `Centro de Producción`
  - `SAUDO` = `Saudo`
- Productos:
  - `SANDBOX V1 Harina normal` (`SBXV1-INS-001`)
  - `SANDBOX V1 Gaseosa normal` (`SBXV1-VTA-002`)
  - `SANDBOX V1 Croissant multi loc` (`SBXV1-VTA-001`)
  - `SANDBOX V1 Base blanca parcial` (`SBXV1-PRE-001`)
- LOCs de centro:
  - `LOC-CP-SBX-A1-01`
  - `LOC-CP-SBX-B1-01`
  - `LOC-CP-SBX-C1-01`

## Checklist paso a paso

1. **Caso 1 · Solicitud y eliminación sin trazabilidad**
- Rol/sede de inicio: `cajero` (o `barista`/`cocinero`) en `Saudo`.
- Crear remisión:
  - Origen: `Centro de Producción`
  - Destino: `Saudo`
  - Fecha esperada: `mañana`
  - Nota: `Sandbox v1 · Caso 1`
  - Ítems:
    - `SANDBOX V1 Harina normal` · `4 Unidades`
    - `SANDBOX V1 Gaseosa normal` · `3 Unidades`
- Guardar en `pending`.
- Cambiar a rol/sede: `gerente_general` (o `propietario`/`gerente` con permiso de cancelación).
- En bandeja, acción esperada visible: `Ver`, `Cancelar`, `Eliminar`.
- Ejecutar `Eliminar remisión`.
- Resultado esperado:
  - Mensaje de éxito.
  - Remisión ya no aparece en pendientes ni historial.

2. **Caso 2 · Flujo normal completo (pending → preparing → in_transit → received)**
- Rol/sede de inicio: `cajero` (o `barista`/`cocinero`) en `Saudo`.
- Crear remisión:
  - Origen: `Centro de Producción`
  - Destino: `Saudo`
  - Fecha esperada: `mañana`
  - Nota: `Sandbox v1 · Caso 2`
  - Ítem:
    - `SANDBOX V1 Harina normal` · `4 Unidades`
- Cambiar a rol/sede: `bodeguero` en `Centro de Producción`.
- Preparar y despachar la cantidad total.
- Cambiar a rol/sede: `cajero` (o `barista`/`cocinero`) en `Saudo`.
- Recibir cantidad total.
- Resultado esperado:
  - Estado final `received`.
  - Línea sin estado pendiente.

3. **Caso 3 · Multi-LOC con división automática**
- Rol/sede de inicio: `cajero` (o `barista`/`cocinero`) en `Saudo`.
- Crear remisión:
  - Origen: `Centro de Producción`
  - Destino: `Saudo`
  - Fecha esperada: `mañana`
  - Nota: `Sandbox v1 · Caso 3`
  - Ítem:
    - `SANDBOX V1 Croissant multi loc` · `5 Unidades`
- Cambiar a rol/sede: `bodeguero` en `Centro de Producción`.
- En preparación:
  - Usar `Dividir automáticamente` cuando aplique.
  - Confirmar que quedan 2 líneas operativas (4 y 1).
  - Preparar y enviar ambas líneas.
- Cambiar a rol/sede: `cajero` (o `barista`/`cocinero`) en `Saudo`.
- Recibir total.
- Resultado esperado:
  - Flujo completo sin errores de “falta línea a partir”.
  - Estado final `received`.

4. **Caso 4 · Recepción parcial**
- Rol/sede de inicio: `cajero` (o `barista`/`cocinero`) en `Saudo`.
- Crear remisión:
  - Origen: `Centro de Producción`
  - Destino: `Saudo`
  - Fecha esperada: `mañana`
  - Nota: `Sandbox v1 · Caso 4`
  - Ítem:
    - `SANDBOX V1 Base blanca parcial` · `6 Unidades`
- Cambiar a rol/sede: `bodeguero` en `Centro de Producción`.
- Preparar/despachar `6`.
- Cambiar a rol/sede: `cajero` (o `barista`/`cocinero`) en `Saudo`.
- Recibir una cantidad menor (ejemplo: `5`) y registrar faltante.
- Resultado esperado:
  - Estado `partial` (o equivalente de recepción parcial).
  - Cantidades y faltante visibles en línea.

5. **Caso 5 · Anular + reversa con trazabilidad**
- Precondición: tener una remisión en `in_transit`, `partial` o `received` (puede ser la del Caso 3 o 4).
- Rol/sede: `gerente_general` (o `propietario`/`gerente` con permiso de cancelación y alcance).
- En bandeja/historial, ejecutar `Anular + reversa`.
- Resultado esperado:
  - Estado final `cancelled`.
  - Nota con marcador de reversa (`[REVERSA_APLICADA ...]`).
  - Ajuste de inventario revertido (sitio y LOC).

6. **Caso 6 · Restricciones por rol (seguridad de acciones)**
- `bodeguero` en cualquier sede:
  - No debe ver `Cancelar`, `Eliminar`, `Anular + reversa`.
- `cajero/barista/cocinero` en satélite:
  - No debe ver `Cancelar`, `Eliminar`, `Anular + reversa`.
- `gerente/gerente_general/propietario`:
  - Sí debe ver acciones de gestión según estado y alcance.
- Resultado esperado:
  - La UI y backend respetan la matriz de permisos en BD.

## Cierre y limpieza de sandbox

Cuando termines validación, ejecutar desde `vento-shell`:

```powershell
& "C:\Users\User\devVentoGroup\vento-shell\scripts\run-nexo-v1-validation-sandbox-cleanup.ps1"
```

Eso elimina datos `SBXV1-*` y LOCs `LOC-CP-SBX-*` sin tocar catálogos reales.
