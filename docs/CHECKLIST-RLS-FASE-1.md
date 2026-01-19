# Checklist Fase 1 - RLS y Permisos (Guia detallada)

Objetivo: validar que el acceso y la visibilidad de datos en NEXO se controlan
solo por permisos y sede, y que los flujos criticos no se rompen con RLS.

Alcance:
- Permisos por app/vista desde BD (roles/apps/permissions + scopes).
- RLS en tablas criticas.
- Auditoria minima en movimientos (created_by).

## 0) Pre-requisitos (antes de probar)

1) Migraciones aplicadas:
   - 20260118193000_remissions_production.sql
   - 20260118195000_nexo_rls_permissions.sql

2) En Supabase:
   - RLS esta habilitado en las tablas:
     - inventory_movements
     - inventory_stock_by_site
     - inventory_locations
     - inventory_lpns
     - procurement_receptions
     - procurement_reception_items
     - restock_requests
     - restock_request_items

3) Define usuarios de prueba (minimo 1 por rol):
   - Deben tener employees + employee_sites activos.
   - Cada usuario debe pertenecer a una sede real (site_id).

Rellena esta tabla (copiar y completar):

Usuario | email | role_code | site_id | site_type
---|---|---|---|---
U1 | ... | propietario | <site_id> | satellite / production_center
U2 | ... | gerente_general | <site_id> | satellite / production_center
U3 | ... | bodeguero | <site_id> | production_center
U4 | ... | cajero | <site_id> | satellite
U5 | ... | barista | <site_id> | satellite
U6 | ... | cocinero | <site_id> | satellite
U7 | ... | repostero | <site_id> | production_center
U8 | ... | panadero | <site_id> | production_center
U9 | ... | pastelero | <site_id> | production_center

## 1) Mapa de permisos esperado (referencia)

Permisos base:
- nexo.access
- nexo.inventory.stock
- nexo.inventory.movements
- nexo.inventory.locations
- nexo.inventory.lpns
- nexo.inventory.production_batches
- nexo.inventory.remissions
- nexo.inventory.remissions.request
- nexo.inventory.remissions.prepare
- nexo.inventory.remissions.receive
- nexo.inventory.remissions.cancel
- nexo.inventory.remissions.all_sites

Reglas acordadas:
- Solicitar remisiones: cajero, barista, cocinero (satelite).
- Preparar remisiones: repostero, panadero, pastelero, cocinero (centro).
- Recibir remisiones: mismos que solicitan (satelite).
- Ver todas las sedes: propietario y gerente_general.
- Cancelar: propietario y gerente_general.

## 2) Checklist por usuario (paso a paso)

Para cada usuario:
1) Abre una ventana nueva (ideal: perfil separado o incognito).
2) Ingresa a https://os.ventogroup.co/login y autentica.
3) Abre https://nexo.ventogroup.co/ (debe cargar sin loop).
4) En el Home, valida que solo ves tarjetas permitidas.

### 2.1 Acceso base (nexo.access)

Caso A: usuario SIN nexo.access
1) Ir a https://nexo.ventogroup.co/
2) Resultado esperado:
   - Redirige a /no-access o muestra acceso denegado.

Caso B: usuario CON nexo.access
1) Ir a https://nexo.ventogroup.co/
2) Resultado esperado:
   - Entra al Home.
   - Muestra nombre, rol y sede.

### 2.2 Stock (inventory.stock)

Caso con permiso:
1) Ir a /inventory/stock
2) Resultado esperado:
   - Lista de stock por SKU/sede (max 300).
   - Contador de negativos visible si aplica.

Caso sin permiso:
1) Ir a /inventory/stock
2) Resultado esperado:
   - No access o tabla vacia por RLS.

### 2.3 Movimientos (inventory.movements)

Caso con permiso:
1) Ir a /inventory/movements
2) Usar filtros por sede y fecha.
3) Resultado esperado:
   - Lista de movimientos (max 200).

Caso sin permiso:
1) Ir a /inventory/movements
2) Resultado esperado:
   - No access o tabla vacia por RLS.

### 2.4 Remisiones (request/prepare/receive/cancel/all_sites)

Requisitos previos:
- Debes conocer un site_id origen (centro) y uno destino (satelite).

#### 2.4.1 Solicitar (inventory.remissions.request)
Usuario satelite con permiso:
1) Ir a /inventory/remissions
2) Crear nueva solicitud (elige destino/origen y items).
3) Resultado esperado:
   - Se crea la solicitud.
   - Estado inicial: pending.

Usuario sin permiso:
1) Ir a /inventory/remissions
2) Intentar crear solicitud.
3) Resultado esperado:
   - Error en UI o bloqueo por RLS al insertar.

#### 2.4.2 Preparar (inventory.remissions.prepare)
Usuario centro con permiso:
1) Abrir una remision pendiente.
2) Cambiar estado a preparing / en viaje.
3) Resultado esperado:
   - Estado cambia.
   - Al enviar, se ejecuta RPC apply_restock_shipment.
   - Se crean movimientos transfer_out y baja stock en origen.

Usuario sin permiso:
1) Abrir remision.
2) Intentar preparar/enviar.
3) Resultado esperado:
   - Error de permiso.

#### 2.4.3 Recibir (inventory.remissions.receive)
Usuario satelite con permiso:
1) Abrir remision en viaje.
2) Ingresar recibidos y confirmar.
3) Resultado esperado:
   - Estado cambia a received/closed.
   - Se ejecuta RPC apply_restock_receipt.
   - Se crean movimientos transfer_in y sube stock en destino.

Usuario sin permiso:
1) Abrir remision.
2) Intentar recibir.
3) Resultado esperado:
   - Error de permiso.

#### 2.4.4 Cancelar y ver todas las sedes
Usuario propietario/gerente_general:
1) Ir a /inventory/remissions
2) Debe ver remisiones de cualquier sede.
3) Abrir una y cancelar.
4) Resultado esperado:
   - Puede ver y cancelar.

Usuario NO propietario/gerente_general:
1) Ir a /inventory/remissions
2) Resultado esperado:
   - Solo ve remisiones de sus sedes.
   - No puede cancelar.

### 2.5 LOC (inventory.locations)

Usuario con permiso (centro):
1) Ir a /inventory/locations
2) Crear una LOC con codigo valido.
3) Resultado esperado:
   - Se crea y aparece en lista.

Usuario sin permiso:
1) Ir a /inventory/locations
2) Resultado esperado:
   - No access o tabla vacia por RLS.

### 2.6 LPN (inventory.lpns)

Usuario con permiso (centro):
1) Ir a /inventory/lpns
2) Crear LPN (usa sede del usuario).
3) Hacer putaway (asignar LOC a LPN).
4) Resultado esperado:
   - LPN creado y LOC asignado.

Usuario sin permiso:
1) Ir a /inventory/lpns
2) Resultado esperado:
   - No access o tabla vacia por RLS.

### 2.7 Produccion manual (inventory.production_batches)

Usuario con permiso (centro):
1) Ir a /inventory/production-batches
2) Crear lote (producto + qty + unidad).
3) Resultado esperado:
   - Lote creado.
   - Stock actualizado en inventory_stock_by_site.
   - Movimiento creado (si aplica).

Usuario sin permiso:
1) Ir a /inventory/production-batches
2) Resultado esperado:
   - No access o error en insert.

## 3) Auditoria (created_by en movimientos)

1) Despues de crear un movimiento (remision o produccion):
2) En Supabase Table Editor -> inventory_movements:
3) Filtra por movement_type o created_at reciente.
4) Resultado esperado:
   - created_by = id del usuario que ejecuto la accion.

## 4) Cierre de Fase 1 (criterio de listo)

Fase 1 se considera lista cuando:
- Usuario sin permisos no ve ni escribe inventario.
- Usuario con permisos ve solo su sede (salvo all_sites).
- Flujos remisiones y produccion funcionan con RLS activa.
- created_by se llena en movimientos.

## 5) Reporte rapido (para registrar resultados)

Copiar y completar:

- Fecha:
- Version (commit):
- Usuarios probados:
- Casos OK:
- Casos fallidos:
- Notas:

## 6) Tabla de marcado (usar durante el QA)

Legenda: OK / FAIL / N/A

Usuario | Acceso base | Stock | Movimientos | Remisiones Solicitar | Remisiones Preparar | Remisiones Recibir | Remisiones Cancelar | All Sites | LOC | LPN | Prod manual | Observaciones
---|---|---|---|---|---|---|---|---|---|---|---|---
qa.propietario@ventogroup.co | OK | OK | OK |  |  |  | N/A | OK |  |  | N/A | Home carga; remisiones sin datos; vista global activa
qa.gerente@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.cajero.vc@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.cocinero.vc@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.barista.vc@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.cajero.sa@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.cocinero.sa@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.barista.sa@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.bodeguero.cp@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.cocinero.cp@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.repostero.cp@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.panadero.cp@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
qa.pastelero.cp@ventogroup.co |  |  |  |  |  |  |  |  |  |  |  | 
