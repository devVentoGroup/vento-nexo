# Inventario perfecto (MVP NEXO)

Estado: en construcción. Documento vivo para alinear flujos, pantallas y reglas del inventario.

## Contexto base
- Sedes iniciales: Centro de producción + Saudo.
- Scanner: atajo (no flujo principal).
- Entradas de insumos: sin aprobación por ahora.
- Remisiones: permiten parcial y salida parcial.
- Conteos: solo gerentes y propietarios.
- Traslados internos: solo registro (sin aprobación).
- LPN: fuera del flujo por ahora.

## Flujo maestro (sin LPN)
1) Entrada de insumos (Recepción)
- Entrada manual por factura: proveedor → ítems → cantidades → costo → unidad → lote/fecha (si aplica).
- Estado: pendiente → recibido parcial → recibido.
- Resultado: stock aumenta en Bodega (Centro de producción).

2) Ubicación (LOC)
- Después de recibir: asignar LOC a cada ítem (put-away manual sencillo).
- Si no hay LOC, queda en “Sin ubicación” con alerta.

3) Remisiones (Saudo solicita → Centro prepara → Saudo recibe)
- Solicitud: Saudo crea remisión (ítems + cantidades).
- Preparación: Centro valida stock → prepara parcial si falta.
- Recepción: Saudo confirma recibido parcial o completo.
- Estados: pendiente → preparando → en tránsito → recibida (o parcial).

4) Traslados internos (dentro de Centro)
- Mover de Bodega → Cocina/neveras internas.
- Cambia LOC y deja movimiento registrado.

5) Conteo cíclico + Ajustes
- No bloquea operación.
- Conteos por zona/LOC con diferencia → ajuste aprobado.
- Ajuste manual requiere rol alto (propietario/gerente/bodeguero).

6) Impresión etiquetas
- LOC: DataMatrix.
- SKU: Code128 (3-up).
- PROD: lotes de producción.

## Menú lateral (MVP)
1) Panel
2) Remisiones
3) Entradas
4) Traslados internos
5) Stock
6) Movimientos
7) Conteos
8) Impresión

## Pantallas y flujos (UX)

### 1) Panel
- Hero: rol + sede + acciones rápidas.
- Sección “Acciones clave” (según permisos).
- Módulos (cards con icono).

### 2) Remisiones
- Tabs: Solicitar | Preparar | Recibir | Historial.
- Solicitar:
  - Sede origen fija (Saudo).
  - Sede destino: Centro.
  - Ítems dinámicos (1 a la vez + botón “Agregar ítem”).
  - Estado: pendiente.
- Preparar:
  - Lista por solicitud.
  - Preparar parcial / completar.
  - Cambiar a “en tránsito”.
- Recibir:
  - Confirmar parcial o completo.
  - Estado final “recibida”.

### 3) Entradas
- Crear entrada:
  - Proveedor (texto), factura.
  - Productos (dinámico).
  - Cantidades.
- Recibir parcial/completo.
- Asignar LOC post-recepción.

### 4) Traslados internos
- Select LOC origen → LOC destino.
- Selección de ítems.
- Registrar movimiento.

### 5) Stock
- Tabla por producto + cantidades.
- Filtro por sede + búsqueda rápida.

### 6) Movimientos
- Ledger con filtros.
- Exportar (opcional).

### 7) Conteos
- Crear conteo (solo gerente/propietario).
- Escoger zona/LOC.
- Cerrar conteo → ajustes propuestos → aprobar.

### 8) Impresión
- Presets: LOC / SKU / PROD.
- Cola de impresión + preview ZPL.

## Roles y acciones (resumen)
- Propietario / Gerente: acceso total, conteos, ajustes, cancelar remisiones.
- Bodeguero: entradas, preparar remisiones, traslados, impresión, stock/movimientos.
- Cajero/Barista/Cocinero (Saudo): solicitar y recibir remisiones.
- Conductor: preparar/recibir remisiones (si se usa).

## Flujos por rol (pasos fisicos + app)

### 1) Cocinero Saudo (satellite)
**Fisico**
- Revisa insumos en cocina.
- Detecta faltantes y solicita remision.
- Recibe remisiones cuando llegan.

**En la app**
- Remisiones > Solicitar: crea solicitud con items y fecha.
- Remisiones > Recibir: confirma recibido parcial o completo.
- Stock: solo lectura para ver disponibilidad.

### 2) Bodeguero (Centro/Bodega)
**Fisico**
- Recibe proveedores y valida cantidades.
- Prepara remisiones de salida.
- Organiza stock en LOC (put-away).
- Mueve stock entre LOC (traslado interno).

**En la app**
- Entradas: crear entrada, items y asignar LOC (default Almacen global).
- Remisiones > Preparar: preparar parcial/completo y enviar a transito.
- Traslados internos: mover entre LOC origen/destino.
- Stock/Movimientos: control operativo y auditoria.

### 3) Conductor
**Fisico**
- Recoge remisiones preparadas.
- Entrega en Saudo.

**En la app**
- Remisiones > Preparar/Recibir (si aplica): confirmar salida o entrega.
- No edita items, solo estados.

### 4) Pastelero (Centro)
**Fisico**
- Produce y consume insumos.
- Reporta faltantes.

**En la app**
- Produccion/Lotes (si se activa).
- Stock (lectura).
- Remisiones (solicitar) solo si se habilita.

### 5) Cocinero de produccion (Centro)
**Fisico**
- Produccion diaria, requiere insumos.

**En la app**
- Produccion/Lotes (si se activa).
- Stock (lectura).
- Solicitar a bodega si se habilita.

## Pendientes por definir
- Reglas exactas de validación por estado (remisiones y entradas).
- Campos obligatorios por pantalla.
- Alertas y bloqueos (stock insuficiente, fechas de vencimiento, etc.).

## Paso 4: reglas y estados (detalle)

### A) Entradas de insumos (recepción)
**Estados**
- `pendiente`: entrada creada, aún sin recibir.
- `recibido_parcial`: se recibió parte de los ítems.
- `recibido`: se recibió todo.

**Reglas**
- Se permite crear entrada sin aprobación.
- Al recibir, si alguna línea queda incompleta → `recibido_parcial`.
- Una entrada `recibido` no se puede editar (solo ver).
- Se permite agregar nota de incidencia por línea (faltante, calidad, daño).

**Validaciones mínimas**
- proveedor (texto) requerido.
- al menos 1 ítem con cantidad > 0.
- unidad requerida si el producto no tiene unidad por defecto.

**Movimientos**
- Cada “recibir” genera movimiento de entrada a bodega (Centro).
- Si luego se asigna LOC, se genera movimiento interno LOC.

### B) LOC (ubicaciones)
**Reglas**
- LOCs se pueden usar sin bloquear la operación.
- Si un ítem queda “Sin ubicación”, se muestra alerta en Stock.
- Traslados internos actualizan LOC sin afectar el total de stock.

### C) Remisiones
**Estados**
- `pendiente`: solicitud creada por sede destino (Saudo).
- `preparando`: centro confirmó preparación (puede ser parcial).
- `en_transito`: salida registrada.
- `parcial`: recibido parcial en destino.
- `recibida`: recibido completo.
- `cancelada`: cancelada por rol permitido.

**Reglas**
- Solicitar: permitido para roles de sede satélite (cajero, barista, cocinero).
- Preparar: bodeguero/gerente (Centro).
- Recibir: cajero/bodeguero (Saudo).
- Cancelar: propietario/gerente o solicitante si está `pendiente`/`preparando`.
- Se permite preparar y enviar parcial.
- Se permite recibir parcial y mantener remisión abierta.

**Validaciones mínimas**
- sede destino requerida.
- al menos 1 ítem con cantidad solicitada > 0.
- en preparación: cantidad preparada <= solicitada.
- en recepción: cantidad recibida <= enviada.

**Movimientos**
- Al pasar a `en_transito`: decrementa stock del centro.
- Al `recibida/parcial`: incrementa stock en Saudo.

### D) Traslados internos (Centro)
**Reglas**
- Solo registro, sin aprobación.
- Se exige LOC origen y LOC destino distintos.
- Se permite parcial: si no hay suficiente stock, se mueve hasta disponible.

**Validaciones mínimas**
- LOC origen y destino requeridos.
- cantidad > 0.

### E) Conteos + ajustes
**Reglas**
- Solo gerente/propietario pueden crear/cerrar.
- Conteos no bloquean operaciones; registran diferencias.
- Ajustes deben quedar trazados con motivo.

**Validaciones mínimas**
- conteo con al menos 1 línea.
- ajustes solo por roles permitidos.

### F) Impresión
**Reglas**
- LOC imprime DataMatrix; SKU/PROD Code128.
- Cola permite pegar múltiples líneas.
- Presets bloquean el tipo de código para evitar errores.

## Paso 5: MVP por sede + priorización

### Sede: Centro de producción
**Prioridad 1 (core operativo)**
- Entradas (recepción) + asignación LOC.
- Stock (lectura y filtros).
- Remisiones: preparar → en tránsito.
- Movimientos (ledger).

**Prioridad 2 (control operativo)**
- Traslados internos.
- Impresión LOC/SKU/PROD.

**Prioridad 3 (control avanzado)**
- Conteos cíclicos + ajustes aprobados.

### Sede: Saudo (satélite)
**Prioridad 1 (core operativo)**
- Remisiones: solicitar → recibir (parcial/completo).
- Stock (lectura por sede).

**Prioridad 2 (control operativo)**
- Movimientos (solo lectura).
- Impresión (si se requiere en sede).

**Fuera de MVP por ahora**
- LPN.
- Automatizaciones avanzadas.

## Paso 6: botones/acciones clave por pantalla

### Panel
- CTA: “Solicitar remisión”, “Preparar remisión”, “Recibir remisión” (según rol).
- CTA: “Crear entrada”, “Ver stock”, “Imprimir etiquetas”.

### Remisiones
- Solicitar: “Agregar ítem”, “Enviar solicitud”.
- Preparar: “Marcar parcial”, “Enviar a tránsito”.
- Recibir: “Confirmar parcial”, “Confirmar recibido”.
- Historial: filtros por estado y fecha.

### Entradas
- “Nueva entrada”, “Recibir parcial”, “Recibir completo”.
- “Asignar LOC” (post-recepción).

### Traslados internos
- “Mover stock”.

### Stock
- “Filtrar por sede”, “Exportar”.

### Movimientos
- “Filtrar”, “Exportar”.

### Conteos
- “Crear conteo”, “Cerrar conteo”, “Aprobar ajustes”.

### Impresión
- “Cargar LOCs”, “Imprimir”, “Prueba alineación”.

## Paso 7: navegación por rol + rutas y permisos

> Nota: rutas referenciales. Ajustar si cambian en el repo.

### Propietario / Gerente general (global)
- `/` Panel (access)
- `/inventory/stock` (inventory.stock)
- `/inventory/movements` (inventory.movements)
- `/inventory/remissions` (inventory.remissions + cancel)
- `/inventory/entries` (inventory.entries)
- `/inventory/transfers` (inventory.transfers)
- `/inventory/counts` (inventory.counts)
- `/inventory/adjust` (inventory.adjustments)
- `/printing/jobs` (inventory.locations + inventory.production_batches)
- `/scanner` (access)

### Gerente (sede)
- Igual que propietario pero sin visión global de sedes.
- No “all_sites”.

### Bodeguero (sede centro)
- Panel, Stock, Movimientos.
- Entradas (crear/recibir).
- Remisiones (preparar).
- Traslados internos.
- Impresión LOC/SKU/PROD.

### Cajero (sede satélite)
- Panel.
- Remisiones (solicitar/recibir).
- Stock (lectura).

### Barista / Cocinero (sede satélite)
- Panel.
- Remisiones (solicitar).
- Stock (lectura limitada).

### Conductor (si aplica)
- Remisiones (preparar/recibir).

## Paso 8: permisos a crear/confirmar en base

Permisos sugeridos (nexo.*):
- access
- inventory.stock
- inventory.movements
- inventory.remissions
- inventory.remissions.request
- inventory.remissions.prepare
- inventory.remissions.receive
- inventory.remissions.cancel
- inventory.entries
- inventory.transfers
- inventory.counts
- inventory.adjustments
- inventory.locations
- inventory.production_batches

## Paso 8.1: mapa de pantallas → bloques UI (qué debe existir)

### Panel (`/`)
- Hero card (rol, sede, vista).
- Chips (rol/sede/vista).
- Acciones clave (cards o empty state).
- Módulos (cards con icono).

### Remisiones (`/inventory/remissions`)
- Header + explicación breve.
- Tabs: Solicitar / Preparar / Recibir / Historial.
- Solicitar:
  - Sede origen (readonly), sede destino (select).
  - Fecha esperada, notas.
  - Items dinámicos (1 visible + “Agregar ítem”).
  - CTA “Enviar solicitud”.
- Preparar:
  - Lista solicitudes con estado.
  - Drawer/Modal: preparar parcial, confirmar salida.
- Recibir:
  - Lista en tránsito/parcial.
  - Confirmar parcial o completo.
- Historial:
  - Filtros (estado, fecha, sede).

### Entradas (`/inventory/entries`)
- Header + botón “Nueva entrada”.
- Form: proveedor, factura, fecha.
- Items dinámicos (producto, cantidad, unidad, lote/vencimiento).
- Estados: pendiente / parcial / recibido.
- CTA: “Recibir parcial” / “Recibir completo”.
- Post-recepción: asignar LOC.

### Traslados internos (`/inventory/transfers`)
- Select LOC origen → LOC destino.
- Items (producto, cantidad).
- CTA “Registrar traslado”.

### Stock (`/inventory/stock`)
- Tabla: producto, unidad, cantidad, sede, LOC.
- Filtros: sede, búsqueda, categoría.
- Alertas: “Sin ubicación”.

### Movimientos (`/inventory/movements`)
- Tabla ledger con filtros por fecha/sede/tipo.
- Exportar (opcional).

### Conteos (`/inventory/counts`)
- Crear conteo (zona/LOC).
- Tabla de conteos abiertos.
- Cerrar conteo → ajustes propuestos.
- CTA “Aprobar ajustes”.

### Impresión (`/printing/jobs`)
- Selector preset (LOC/SKU/PROD).
- Cola + preview.
- Botones: detectar impresoras, imprimir, prueba alineación.

## Paso 8.2: checklist de implementación (orden sugerido)
1) Remisiones: pantalla + items dinámicos + estados parciales.
2) Entradas: formulario + recepción parcial.
3) Stock + Movimientos (tablas básicas con filtros).
4) Traslados internos.
5) Conteos (crear/cerrar/aprobar).
6) Impresión (ya existe, ajustar a LOC/SKU/PROD).

## Paso 9: datos mínimos por pantalla (campos + payloads)

> Notación sugerida: `camelCase` en frontend; adaptar a columnas reales en DB.

### A) Remisiones – Solicitud
**Campos UI**
- `fromSiteId` (readonly, sede origen)
- `toSiteId` (select)
- `expectedDate` (fecha)
- `notes` (texto)
- `items[]`:
  - `productId`
  - `qty`
  - `unit`
  - `areaId` (opcional)

**Payload sugerido**
```json
{
  "fromSiteId": "uuid",
  "toSiteId": "uuid",
  "expectedDate": "YYYY-MM-DD",
  "notes": "string",
  "items": [
    { "productId": "uuid", "qty": 10, "unit": "kg", "areaId": "uuid" }
  ]
}
```

### B) Remisiones – Preparar
**Campos UI**
- `requestId`
- `preparedItems[]`:
  - `itemId`
  - `qtyPrepared`

**Payload sugerido**
```json
{
  "requestId": "uuid",
  "preparedItems": [
    { "itemId": "uuid", "qtyPrepared": 6 }
  ],
  "status": "preparando|en_transito"
}
```

### C) Remisiones – Recibir
**Campos UI**
- `requestId`
- `receivedItems[]`:
  - `itemId`
  - `qtyReceived`

**Payload sugerido**
```json
{
  "requestId": "uuid",
  "receivedItems": [
    { "itemId": "uuid", "qtyReceived": 6 }
  ],
  "status": "parcial|recibida"
}
```

### D) Entradas – Crear/Recibir
**Campos UI**
- `supplierName`
- `invoiceNumber` (opcional)
- `receivedAt` (fecha)
- `items[]`:
  - `productId`
  - `qty`
  - `unit`
  - `batchCode` (opcional)
  - `expiresAt` (opcional)
  - `notes` (opcional)

**Payload sugerido**
```json
{
  "supplierName": "Proveedor X",
  "invoiceNumber": "FAC-123",
  "receivedAt": "YYYY-MM-DD",
  "items": [
    { "productId": "uuid", "qty": 25, "unit": "kg", "batchCode": "L-001" }
  ],
  "status": "pendiente|recibido_parcial|recibido"
}
```

### E) Traslados internos
**Campos UI**
- `fromLocId`
- `toLocId`
- `items[]`:
  - `productId`
  - `qty`
  - `unit`

**Payload sugerido**
```json
{
  "fromLocId": "uuid",
  "toLocId": "uuid",
  "items": [
    { "productId": "uuid", "qty": 5, "unit": "un" }
  ]
}
```

### F) Stock (lectura)
**Filtros**
- `siteId`
- `query` (texto)
- `categoryId` (opcional)
- `locId` (opcional)

### G) Movimientos (lectura)
**Filtros**
- `siteId`
- `dateFrom` / `dateTo`
- `type` (entrada, remision, traslado, ajuste)
- `productId` (opcional)

### H) Conteos
**Crear conteo**
- `siteId`
- `areaId` o `locId`
- `name` (opcional)

**Payload sugerido**
```json
{
  "siteId": "uuid",
  "locId": "uuid",
  "name": "Conteo cocina caliente"
}
```

**Captura de conteo**
- `countId`
- `lines[]`:
  - `productId`
  - `qtyCounted`

**Payload sugerido**
```json
{
  "countId": "uuid",
  "lines": [
    { "productId": "uuid", "qtyCounted": 12 }
  ]
}
```

### I) Impresión
**LOC**
- `code` (LOC)
- `description` (opcional)

**SKU**
- `code`
- `note` (opcional)

**PROD**
- `lotCode`
- `productName`
- `prodDate`
- `expDate`
