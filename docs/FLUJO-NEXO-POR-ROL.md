# Flujo mental Nexo: por rol, pantallas y operaciones

Documento para tener claro **qué hace cada trabajador**, **por qué pantallas pasa** y **qué falta** antes de ORIGO (órdenes de compra).

---

## 1. Mapa de pantallas y permisos (qué existe hoy)

| Ruta | Permiso | Descripción |
|------|---------|-------------|
| `/` | access | Panel: rol, sede, acciones según permisos |
| `/inventory/remissions` | inventory.remissions | Remisiones: solicitar / preparar / recibir / historial |
| `/inventory/remissions/[id]` | inventory.remissions | Detalle de una remisión (preparar, recibir, cancelar) |
| `/inventory/entries` | inventory.entries | Entradas: recepción de insumos (proveedor → ítems → LOC) |
| `/inventory/transfers` | inventory.transfers | Traslados internos: LOC origen → LOC destino |
| `/inventory/stock` | inventory.stock | Stock por sede (tabla producto + cantidad) |
| `/inventory/catalog` | inventory.stock + rol propietario/gerente | Catálogo maestro (productos, categorías, proveedores, sedes) |
| `/inventory/catalog/[id]` | inventory.stock | Ficha de producto (editable por propietario/gerente) |
| `/inventory/movements` | inventory.movements | Ledger de movimientos (entrada, salida, traslado, ajuste) |
| `/inventory/count-initial` | inventory.counts | Conteos (inicial / cíclico) |
| `/inventory/adjust` | inventory.adjustments | Ajustes manuales (roles altos) |
| `/inventory/locations` | inventory.locations | Ubicaciones (LOCs): crear por sede, listar |
| `/inventory/production-batches` | inventory.production_batches | Lotes de producción |
| `/printing/jobs` | inventory.locations o production_batches | Impresión etiquetas (LOC, SKU, PROD) |
| `/scanner` | access | Escáner (atajo) |

**Permisos por acción (además de los de pantalla):**
- `inventory.remissions.request` → solicitar remisión (sede satélite).
- `inventory.remissions.prepare` → preparar remisión (centro).
- `inventory.remissions.receive` → recibir remisión (destino).
- `inventory.remissions.cancel` → cancelar remisión.
- `inventory.remissions.all_sites` → ver remisiones de todas las sedes (gerente/propietario).

---

## 2. Flujo por rol (qué hace cada trabajador)

### 2.1 Trabajador en Saudo (sede satélite): “pedido” = solicitar remisión

**Rol típico:** cajero, barista, cocinero.

**Flujo mental:**
1. En Saudo detecta faltantes (cocina, bar, etc.).
2. Entra a Nexo → **Panel** → “Remisiones” (o menú lateral).
3. En **Remisiones** elige sede activa = Saudo.
4. **Solicitar remisión:**
   - Origen: Saudo (fijo).
   - Destino: Centro de producción (bodega que surte).
   - Fecha esperada, notas.
   - Agrega ítems (producto + cantidad solicitada).
   - Envía solicitud → estado **pendiente**.
5. Más tarde, cuando llega el pedido físicamente:
   - **Remisiones** → pestaña/listado “Recibir”.
   - Abre la remisión en tránsito → **Recibir**: indica cantidades recibidas (parcial o completo).
   - Estado pasa a **parcial** o **recibida**.

**Pantallas que usa:** Panel, Remisiones (solicitar + recibir). Stock en solo lectura si quiere ver disponibilidad.

---

### 2.2 Bodeguero (Centro de producción): preparar remisión y operación diaria

**Flujo mental:**

**A) Preparar remisión (lo que pide Saudo)**
1. Entra a **Remisiones** con sede = Centro.
2. Ve listado de solicitudes (pendientes / preparando).
3. Abre una remisión (**/inventory/remissions/[id]**).
4. Ve ítems solicitados y cantidades.
5. **Preparar:** indica por cada ítem cuánto prepara (puede ser menos si no hay stock).
6. Marca “En tránsito” → sale stock del Centro y la remisión queda en tránsito para que Saudo la reciba.

**B) Recibir proveedor e ingresar insumos a bodega**
1. Llega el proveedor con mercancía y factura.
2. Entra a **Entradas** (`/inventory/entries`).
3. **Nueva entrada:**
   - Proveedor (select o texto).
   - Nº factura, fecha recepción, notas.
   - Por cada ítem: producto, cantidad declarada, cantidad recibida, **LOC de destino** (dónde se guarda físicamente).
4. Al guardar/recibir:
   - Se crea la entrada (y líneas).
   - Se generan movimientos de tipo “entrada”.
   - Se actualiza stock por sede (Centro).
   - Se actualiza stock por LOC (`upsert_inventory_stock_by_location`).

**C) Poner producto en un LOC (put-away)**  
- Ya está cubierto: en la misma pantalla **Entradas** cada ítem lleva **LOC**. No hay pantalla aparte de “solo put-away”; el ingreso a bodega y la ubicación se hacen en un solo paso.

**D) Sacar producto de un LOC (para enviar a Saudo o mover dentro del centro)**  
- **Para Saudo:** al “Preparar” y marcar “En tránsito” en una remisión, el sistema descuenta del stock del Centro (hoy no se descuenta por LOC en esa pantalla; ver “Qué falta”).
- **Dentro del centro:** **Traslados internos** (origen LOC → destino LOC); ahí sí se mueve entre LOCs.

**E) Traslados internos (mover entre LOCs en el Centro)**
1. **Traslados** (`/inventory/transfers`).
2. Elige LOC origen, LOC destino (distintos).
3. Agrega ítems (producto + cantidad).
4. Registra traslado → se generan movimientos y se actualiza stock por LOC.

**Pantallas que usa:** Panel, Remisiones (preparar), Entradas, Traslados, Stock, Movimientos, Ubicaciones (LOCs), Impresión.

---

### 2.3 Cómo se crean los LOCs

1. **Ubicaciones** (`/inventory/locations`).
2. Elige sede (ej. Centro de producción).
3. Puede crear LOCs de dos formas:
   - **Crear desde plantilla:** botón que crea varias LOCs a la vez (ej. BOD-EST01…12, EMP, REC-PEND/OK/QUAR, DSP-MAIN) según código de sede (CP, SAU, VCF, etc.).
   - **Crear una a una** (si existe el flujo en la UI).
4. Las LOCs aparecen en:
   - **Entradas** (selector de LOC por ítem).
   - **Traslados** (origen y destino).

---

### 2.4 Resumen: ingresar vs retirar

| Acción | Dónde | Qué pasa |
|--------|--------|----------|
| **Ingresar producto a un LOC** | Entradas | Nueva entrada → por cada ítem eliges producto, cantidad recibida y **LOC**. Al recibir se actualiza stock por sede y por LOC. |
| **Retirar de un LOC (dentro del mismo sitio)** | Traslados | LOC origen → LOC destino; cantidades se mueven entre LOCs. |
| **Retirar del Centro para enviar a Saudo** | Remisiones | En detalle de remisión, “Preparar” y “En tránsito”; se descuenta stock del Centro (por sede; por LOC ver “Qué falta”). |

---

## 3. Recepción de proveedor: flujo completo

1. **Físico:** Proveedor llega con factura y mercancía. Bodeguero revisa y ubica en bodega (estante/LOC).
2. **En la app:**
   - **Entradas** → Nueva entrada.
   - Proveedor (maestro o texto), factura, fecha.
   - Por cada tipo de producto recibido: producto, cantidad declarada, cantidad recibida, **LOC** donde lo guardó.
   - Guardar/Recibir → entrada creada, movimientos generados, stock (sede + LOC) actualizado.
3. No hay orden de compra todavía: la entrada es “recepción directa”. ORIGO agregará la capa “orden de compra → recepción”.

---

## 4. Qué falta (para tener el flujo claro y para ORIGO)

### 4.1 Stock por LOC en pantalla
- **Hoy:** Stock (`/inventory/stock`) muestra cantidad por **sede + producto**, no por LOC.
- **Falta:** Opción de ver (y filtrar) stock por **LOC** (ej. “Cuánto hay en LOC-CP-BOD-EST03”) para que bodeguero sepa dónde hay qué y prepare remisiones / traslados con criterio.

### 4.2 Remisión: descuento por LOC (opcional)
- **Hoy:** Al preparar remisión y pasar a “En tránsito” se descuenta stock por sede.
- **Falta (opcional):** Si se quiere que el sistema “sugiera” o registre de qué LOC se sacó cada ítem, haría falta usar stock por LOC en el flujo de preparación (o al menos mostrar “disponible por LOC” al preparar).

### 4.3 Conteos y ajustes
- **Hoy:** Existe `/inventory/count-initial` (conteo inicial) y `/inventory/adjust` (ajustes).
- **Falta:** Dejar documentado y homogéneo el flujo “conteo cíclico por zona/LOC → diferencias → aprobar ajustes” según INVENTARIO-PERFECTO.md.

### 4.4 Saudo “pedido” vs ORIGO “orden de compra”
- **Saudo “pedido”:** Es la **solicitud de remisión** en Nexo (Saudo pide al Centro; no es compra a proveedor).
- **ORIGO (futuro):** Órdenes de **compra a proveedores**. Flujo típico:
  1. Crear orden de compra (OC) en ORIGO (proveedor, ítems, cantidades, condiciones).
  2. Proveedor entrega → en Nexo se recibe contra esa OC (Entradas o módulo “Recepción por OC”).
  3. Así se liga: OC (ORIGO) ↔ Entrada (Nexo) ↔ Movimientos y stock.

**Para ORIGO falta en Nexo (cuando lo integres):**
- En **Entradas** (o pantalla de recepción): poder elegir “Orden de compra” y cargar ítems desde la OC en lugar de tipear todo a mano.
- Opcional: pantalla o filtro “Recepciones pendientes por OC” para el bodeguero.

---

## 5. Checklist rápido por pregunta

| Pregunta | Respuesta |
|----------|-----------|
| ¿Dónde va el trabajador según su rol? | Panel → menú según permisos (Remisiones, Entradas, Traslados, Stock, etc.). |
| ¿Cómo se hacen los traslados? | **Traslados** → LOC origen, LOC destino, ítems y cantidades → registrar. |
| ¿Cómo se crean los LOCs? | **Ubicaciones** → elegir sede → crear por plantilla o uno a uno. |
| ¿Cómo se ingresa un producto a un LOC? | **Entradas** → nueva entrada → por ítem: producto, cantidad, **LOC**. |
| ¿Cómo se retira de un LOC? | **Traslados** (entre LOCs) o **Remisiones** (salida del Centro hacia Saudo). |
| ¿Cómo hace un “pedido” en Saudo? | **Remisiones** → Solicitar → origen Saudo, destino Centro, ítems → enviar. |
| ¿Cómo ve eso el bodeguero? | **Remisiones** (sede Centro) → listado de solicitudes → abrir una → Preparar. |
| ¿Cómo prepara la remisión? | En **Remisiones/[id]** → indica cantidades preparadas (parcial si falta stock) → “En tránsito”. |
| ¿Cómo recibe el proveedor e ingresa insumos? | **Entradas** → nueva entrada → proveedor, factura, ítems con **LOC** → recibir; stock y LOC se actualizan. |
| ¿Qué falta para ORIGO? | Poder ligar Entradas (recepción) a una **orden de compra** creada en ORIGO; opcional: vista “pendientes por OC”. |

---

## 6. Siguiente paso recomendado

1. **Cerrar gaps de visibilidad:** Stock por LOC (y filtro por LOC) en `/inventory/stock` o en una vista dedicada.
2. **Documentar en código/UX** el flujo de conteos y ajustes como en INVENTARIO-PERFECTO.md.
3. **Diseñar la integración ORIGO–Nexo:** modelo de datos (OC, líneas, estado) y en Nexo: “Recepción por OC” o ampliar Entradas con `order_id`/referencia a ORIGO.

Con este flujo mental claro, puedes seguir con ORIGO (órdenes de compra) sabiendo cómo encaja con recepciones, stock y LOCs en Nexo.
