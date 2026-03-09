# Guia de configuracion inicial v1

Guia corta para dejar `NEXO` listo con el modelo operativo `Centro + Saudo`.

## Modelo de operacion

### Centro
- Tiene `LOCs`.
- Recibe stock manual.
- Hace conteos, ajustes, retiros y traslados.
- Prepara remisiones para `Saudo`.

### Saudo
- No usa `LOCs`.
- Opera stock solo por sede.
- Solicita remisiones al `Centro`.
- Recibe remisiones.

## Orden de configuracion

1. Verifica la sede `Centro`.
2. Verifica la sede `Saudo`.
3. Crea la ruta `Saudo -> Centro`.
4. Crea los `LOCs` del `Centro`.
5. Crea productos operativos.
6. Activa productos para `Centro` y `Saudo`.
7. Carga stock inicial en `Centro`.
8. Haz un conteo de ajuste si hace falta.
9. Ejecuta una remision de prueba end-to-end.

## Productos minimos para v1

Un producto queda listo para operar cuando tiene:
- Nombre.
- Tipo.
- Unidad base.
- Perfil de inventario activo.
- Disponibilidad por sede.
- Categoria minima, solo si la validacion actual la exige.

No bloquean v1:
- Foto.
- Receta.
- Produccion.
- Orden de compra.
- Configuracion avanzada de proveedor.

## LOCs iniciales sugeridos para Centro

- `Bodega`
- `Cuarto frio`
- `Congelacion`
- `Secos`

## Stock inicial

Carga el stock inicial desde `Entradas manuales v1`:
- Sede: `Centro`
- Un `LOC` por item
- Cantidad real recibida

Luego valida en:
- `/inventory/stock`
- `/inventory/movements`

## Flujo diario v1

1. `Saudo` solicita remision.
2. `Centro` prepara.
3. `Saudo` recibe.
4. Si hay diferencias, ajusta por conteo o movimiento segun el caso.

## Documentos de apoyo

- `docs/OPERACION-V1-NEXO.md`
- `docs/PLANTILLA-PRODUCTOS-V1.csv`
- `/inventory/settings/checklist`
