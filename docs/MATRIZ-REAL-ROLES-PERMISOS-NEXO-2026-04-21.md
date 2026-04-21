# MATRIZ REAL DE ROLES Y PERMISOS NEXO · 2026-04-21

## Fuente de verdad

Esta matriz sale de `role_permissions` + `app_permissions` en la base de datos, no de supuestos de frontend.

## Permisos reales por rol en NEXO

### propietario
- access
- inventory.adjustments
- inventory.counts
- inventory.entries
- inventory.entries_emergency
- inventory.locations
- inventory.lpns
- inventory.movements
- inventory.production_batches
- inventory.remissions
- inventory.remissions.all_sites
- inventory.remissions.cancel
- inventory.remissions.prepare
- inventory.remissions.receive
- inventory.remissions.request
- inventory.stock
- inventory.transfers
- inventory.validation
- inventory.withdraw

### gerente_general
- igual a propietario

### gerente
- access
- inventory.adjustments
- inventory.counts
- inventory.entries
- inventory.locations
- inventory.lpns
- inventory.movements
- inventory.production_batches
- inventory.remissions
- inventory.remissions.cancel
- inventory.remissions.prepare
- inventory.remissions.receive
- inventory.remissions.request
- inventory.stock
- inventory.transfers
- inventory.validation
- inventory.withdraw

### bodeguero
- access
- inventory.adjustments
- inventory.counts
- inventory.entries
- inventory.locations
- inventory.lpns
- inventory.movements
- inventory.remissions
- inventory.remissions.prepare
- inventory.stock
- inventory.transfers
- inventory.validation
- inventory.withdraw

### conductor
- access
- inventory.remissions
- inventory.remissions.receive
- inventory.remissions.transit

### cajero
- access
- inventory.remissions
- inventory.remissions.edit_own_pending
- inventory.remissions.receive
- inventory.remissions.request
- inventory.withdraw

### barista
- igual a cajero

### cocinero
- access
- inventory.production_batches
- inventory.remissions
- inventory.remissions.edit_own_pending
- inventory.remissions.receive
- inventory.remissions.request
- inventory.withdraw

### panadero
- access
- inventory.production_batches
- inventory.withdraw

### repostero
- access
- inventory.production_batches
- inventory.withdraw

### pastelero
- access
- inventory.production_batches
- inventory.withdraw

## Matriz operativa aplicada en UI

### propietario
Debe ver:
- Panel
- Entradas
- Abastecimiento interno
- Conteos
- Traslados
- Retiros
- Lotes de produccion
- Ajustes
- Stock
- Movimientos
- Checklist
- Productos
- Ubicaciones
- Validacion de LOCs
- Rutas
- Areas remision
- Sedes
- Unidades
- Categorias
- Impresion

### gerente_general
Debe ver lo mismo que propietario.

### gerente
Debe ver:
- Panel
- Entradas
- Abastecimiento interno
- Conteos
- Traslados
- Retiros
- Lotes de produccion
- Ajustes
- Stock
- Movimientos
- Checklist
- Validacion de LOCs
- Impresion

No debe ver:
- Productos
- Ubicaciones como maestro completo
- Rutas
- Areas remision
- Sedes
- Unidades
- Categorias

### bodeguero
Debe ver:
- Panel
- Entradas
- Abastecimiento interno
- Conteos
- Traslados
- Retiros
- Ajustes
- Stock
- Movimientos
- Checklist
- Validacion de LOCs
- Impresion

No debe ver:
- Productos
- Rutas
- Sedes
- Areas remision
- Unidades
- Categorias

### conductor
Debe ver:
- Panel
- Remisiones en transito

No debe ver:
- Entradas
- Conteos
- Traslados
- Retiros
- Ajustes
- Stock
- Movimientos
- Configuracion
- Impresion

### cajero y barista
Debe ver:
- Panel
- Pedir y recibir
- Retiros

No debe ver:
- Entradas
- Conteos
- Traslados
- Ajustes
- Stock global
- Movimientos
- Configuracion
- Impresion

### cocinero en satelite
Debe ver:
- Panel
- Pedir y recibir
- Retiros

No debe ver:
- Lotes de produccion
- Entradas
- Conteos
- Traslados
- Ajustes
- Stock global
- Movimientos
- Configuracion
- Impresion

### cocinero en Centro de Produccion
Debe ver:
- Panel
- Retiros
- Lotes de produccion

No debe ver:
- Pedir y recibir
- Entradas
- Conteos
- Traslados
- Ajustes
- Stock global
- Movimientos
- Configuracion
- Impresion

### panadero, repostero y pastelero
Debe ver:
- Panel
- Retiros
- Lotes de produccion

No debe ver:
- Remisiones
- Entradas
- Conteos
- Traslados
- Ajustes
- Stock global
- Movimientos
- Configuracion
- Impresion

## Desfases corregidos

- `Entradas` ya no depende solo de `inventory.entries_emergency`; ahora acepta `inventory.entries` o `inventory.entries_emergency`.
- `Checklist` ya no aparece para cualquier rol con `access`.
- `Rutas` y `Sedes` quedaron reservadas a `propietario` y `gerente_general`.
- `Impresion` ya no aparece para toda la organizacion; queda para gestion y bodega.
- Se expone `Lotes de produccion` para los roles que realmente tienen `inventory.production_batches`.

## Pendiente siguiente

- Cerrar tambien acceso directo por URL en las vistas que hoy solo escondemos por sidebar.
- Revisar si `inventory.stock` debe seguir fuera de cajero/barista/cocinero en UI aunque la base no lo otorgue hoy.
