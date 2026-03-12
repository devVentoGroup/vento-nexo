# Nexo: Remisiones V1 para Bolleria/Vitrina Bajo Pedido

## Objetivo
Definir como operar hoy (V1) productos de bolleria/vitrina que se solicitan para el dia siguiente aunque el stock actual este en `0`, y dejar una ruta clara para una implementacion ideal futura.

## Hallazgos del estado actual (V1)

1. El modelo de remisiones ya existe en `restock_requests` y `restock_request_items`.
2. El flujo por etapas ya tiene cantidades separadas (`prepared_quantity`, `shipped_quantity`, `received_quantity`, `shortage_quantity`) y metadatos de estado.
3. La aplicacion de inventario de remision se hace por RPC:
   - `public.apply_restock_shipment(p_request_id uuid)` descuenta en sede origen con `transfer_out`.
   - `public.apply_restock_receipt(p_request_id uuid)` suma en sede destino con `transfer_in`.
4. Existe stock por LOC (`inventory_stock_by_location`) y helper `upsert_inventory_stock_by_location`.
5. En lineas de remision existe `source_location_id` para indicar LOC origen.
6. El catalogo por sede para operar remisiones no depende de stock sino de activacion en `product_site_settings`.

## Brechas reales de V1 para este caso

1. `apply_restock_shipment/receipt` impactan `inventory_stock_by_site`, pero no aplican delta por LOC; `source_location_id` queda informativo.
2. No hay control de idempotencia en los RPC de envio/recepcion (si se ejecutan dos veces, duplican movimientos).
3. No hay politica explicita por producto para "stock estricto" vs "bajo pedido".
4. No existe reserva de inventario para remision (solo cantidades declaradas por etapa).

## Solucion operativa inmediata (sin redisenar todo)

### 1) Politica funcional para bolleria/vitrina

1. Permitir solicitud de remision aunque el stock de sede actual sea `0`.
2. Tratar estos productos como "bajo pedido" y no como "salida inmediata de inventario disponible".
3. Mantener bloqueo estricto solo para productos que si requieren disponibilidad inmediata.

### 2) Configuracion minima recomendada

1. Mantener activos esos productos en `product_site_settings` para la sede solicitante.
2. Definir `default_area_kind` para enrutar solicitud (ej. panaderia/reposteria).
3. Usar `audience` para separar operacion:
   - `SAUDO` para catalogo operativo Saudo.
   - `INTERNAL` si el item es solo para flujo interno de produccion/remision.

### 3) Flujo V1 recomendado para remision dia siguiente

1. **Solicitud (hoy)**:
   - Crear `restock_request` con fecha esperada del dia siguiente.
   - Cargar cantidades en `restock_request_items.quantity` aunque haya stock 0.
2. **Preparacion (origen)**:
   - Registrar `prepared_quantity` y luego `shipped_quantity`.
   - Ejecutar `apply_restock_shipment` para generar salida de sede origen.
3. **Recepcion (destino)**:
   - Registrar `received_quantity`.
   - Ejecutar `apply_restock_receipt`.

### 4) Uso de LOC de preparacion (recomendado desde ya)

1. Crear un LOC real de preparacion, por ejemplo `LOC-<SEDE>-PREP`.
2. Usar `source_location_id` en cada item de remision para marcar de donde sale fisicamente.
3. Si hay traslado interno previo (produccion a despacho), usar `inventory_transfers` entre LOCs.
4. Aceptar que en V1 la trazabilidad fina por LOC sera parcial hasta extender RPCs.

## Como resolver tu caso hoy en la operacion

1. Para bolleria/vitrina en Saudo: permitir siempre la solicitud de remision (aunque stock 0).
2. Planificar corte diario (ej. 6:00 p.m.) para consolidar lo del dia siguiente.
3. Preparar en origen y despachar contra esa solicitud; no bloquear por stock local de la sede solicitante.
4. Usar LOC de preparacion para ordenar el alistamiento fisico y evitar "LOC simbolico" sin trazabilidad.

## Implementacion ideal futura (Nexo V2)

### 1) Politica de abastecimiento por producto/sede

Agregar en `product_site_settings` una politica explicita:

- `fulfillment_policy`: `stock_strict | allow_backorder | make_to_order`
- `lead_time_hours`: horas de anticipacion requeridas
- `cutoff_time`: hora limite diaria de solicitud

Reglas:

1. `stock_strict`: no permite solicitar/vender por encima de disponible.
2. `allow_backorder`: permite solicitud con faltante y marca pendiente.
3. `make_to_order`: no valida stock origen para crear solicitud; exige fecha objetivo.

### 2) Workflow transaccional de remisiones

Pasar de updates libres a transiciones atomicas por RPC:

1. `request -> preparing -> in_transit -> received`
   `closed` queda solo como compatibilidad de registros heredados y no como paso operativo visible de v1.
2. Idempotencia por evento (`event_id`) para evitar doble aplicacion.
3. Validaciones por estado para bloquear saltos invalidos.

### 3) Inventario por LOC end-to-end

Extender RPCs de remision para afectar:

1. `inventory_stock_by_location` (from/to LOC).
2. `inventory_stock_by_site` (agregado).
3. `inventory_movements` con `from_location_id` y `to_location_id` (o campos equivalentes).

### 4) Reserva y faltantes

Crear capa de reserva por item de remision:

1. `reserved_qty`, `backordered_qty`, `fulfilled_qty`.
2. Picking y packing con evidencia por LOC/lote.
3. Recepcion parcial y cierre automatico de faltantes.

### 5) UX operativa recomendada

1. En solicitud: mostrar "Disponible / Bajo pedido" por producto.
2. En preparacion: cola priorizada por `needed_for_date` y `cutoff_time`.
3. En recepcion: captura rapida de recibido vs faltante.
4. En control: tablero de excepciones (pendientes, parciales, vencidos).

## Plan incremental sugerido

1. **Ahora (1-2 semanas)**:
   - Habilitar politicamente "solicitud con stock 0" para bolleria/vitrina.
   - Estandarizar LOC de preparacion por sede.
   - Operar con flujo V1 actual y disciplina de etapas.
2. **Siguiente (2-4 semanas)**:
   - Agregar `fulfillment_policy`, `lead_time_hours`, `cutoff_time`.
   - Ajustar UI para diferenciar `stock_strict` vs `make_to_order`.
3. **V2 (4-8 semanas)**:
   - RPCs de transicion idempotentes.
   - Impacto real por LOC en shipment/receipt.
   - Reserva/faltantes y cierre operativo completo.

## Referencias tecnicas (migraciones)

- `supabase/migrations/20260118193000_remissions_production.sql`
- `supabase/migrations/20260118195000_nexo_rls_permissions.sql`
- `supabase/migrations/20260130120000_nexo_remissions_permissions.sql`
- `supabase/migrations/20260202100000_nexo_stock_by_location.sql`
- `supabase/migrations/20260213000005_remissions_loc_source.sql`
- `supabase/migrations/20260120120000_product_site_settings.sql`
- `supabase/migrations/20260218000002_product_site_settings_internal_usage.sql`
- `supabase/migrations/20260131134000_nexo_inventory_transfers.sql`
