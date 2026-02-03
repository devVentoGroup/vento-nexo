# Guía Nexo — Visión, flujos y decisiones

Documento único de lectura: visión del inventario, flujos por rol, decisiones de diseño y referencias.  
El **checklist de implementación** está en **ROADMAP-NEXO.md**.

---

## 1. Visión y alcance

- **Nexo** es la fuente de verdad del inventario (ledger + documentos). Incluye: stock por sede y por LOC, entradas de proveedor, traslados internos, remisiones (Centro ↔ satélites), retiros (consumo desde LOC), conteos y ajustes.
- **Sedes:** Centro de producción (CP), Saudo, Vento Café; admin Vento Group.
- **Fuera de alcance (por ahora):** costeo/POs completos (ORIGO), recetas/producción integrada (FOGO). Proveedores y órdenes de compra se gestionan en ORIGO; en Nexo solo se recibe y se asigna LOC.

---

## 2. Pantallas y permisos (resumen)

| Ruta | Permiso | Descripción |
|------|---------|-------------|
| `/` | access | Panel: rol, sede, acciones según permisos |
| `/inventory/remissions` | inventory.remissions | Remisiones: solicitar / preparar / recibir |
| `/inventory/remissions/prepare` | inventory.remissions | Lista de remisiones a preparar (bodega) |
| `/inventory/remissions/[id]` | inventory.remissions | Detalle remisión (preparar, recibir) |
| `/inventory/entries` | inventory.entries | Entradas: recepción proveedor → ítems → LOC |
| `/inventory/transfers` | inventory.transfers | Traslados: LOC origen → LOC destino |
| `/inventory/withdraw` | inventory.withdraw | Retiros: consumo desde LOC (QR → `?loc=...`) |
| `/inventory/stock` | inventory.stock | Stock por sede (y desglose por LOC) |
| `/inventory/catalog` | inventory.stock + rol | Catálogo maestro (productos) |
| `/inventory/catalog/[id]` | inventory.stock | Ficha de producto |
| `/inventory/movements` | inventory.movements | Movimientos (ledger) |
| `/inventory/count-initial` | inventory.counts | Conteos (por sede / zona / LOC) |
| `/inventory/locations` | inventory.locations | Ubicaciones (LOCs) — **solo gerentes/propietarios** |
| `/inventory/printing/jobs` | — | Impresión etiquetas (LOC, SKU, PROD) |

---

## 3. Flujo por rol

### Trabajador en Saudo (satélite): pedido = solicitar remisión

1. Entra a **Remisiones** (sede Saudo).
2. **Solicitar remisión:** origen Saudo, destino Centro, ítems y cantidades → envía (estado pendiente).
3. Cuando llega el pedido: **Remisiones** → Recibir → indica cantidades recibidas (parcial o completo).

### Bodeguero (Centro de producción)

- **Preparar remisión:** Remisiones (sede Centro) → listado o **Preparar remisiones** → abre una → marca cantidades preparadas/enviadas → Guardar ítems → **En viaje**. Ve stock disponible por sede (y por LOC) para validar.
- **Recibir proveedor:** **Entradas** → Nueva entrada → proveedor, factura, ítems con **cantidad recibida** y **LOC** donde guarda cada uno → Recibir; se actualiza stock por sede y por LOC.
- **Traslados:** **Traslados** → LOC origen, LOC destino, ítems → Registrar (valida stock en origen).
- **Retiros (consumo):** Si usa celular, escanea QR del LOC → abre **Retiros** con ese LOC ya elegido → producto, cantidad, nota → Enviar.
- **Conteos:** **Conteos** → por sede, zona o LOC → contar → Cerrar conteo → (gerente) Aprobar ajustes.

### Cómo se crean los LOCs

- **Ubicaciones** (`/inventory/locations`) — solo gerentes/propietarios.
- Crear por **plantilla** “Espacios físicos” (Bodega, Cuarto frío, Congelación, Neveras 2/3 puertas, Secos 1.º piso, Secos preparados) o **uno a uno** (código, nombre, zona).

### Cómo se ingresa / retira de un LOC

| Acción | Dónde | Qué pasa |
|--------|--------|----------|
| **Ingresar a un LOC** | Entradas | Por cada ítem: producto, cantidad recibida, **LOC**. Al recibir: stock sede + LOC. |
| **Retirar (consumo)** | Retiros | LOC (p. ej. por QR), producto, cantidad → movimiento consumo; descuento LOC y sede. |
| **Mover entre LOCs** | Traslados | Origen LOC → Destino LOC; validación stock en origen. |
| **Salida hacia Saudo** | Remisiones | Preparar → En viaje; descuento stock Centro (por sede; por LOC opcional). |

---

## 4. Decisiones clave: LOC y stock

- **Stock por sede** = “¿Cuánto hay en total en esta sede?” (vista principal en Stock).
- **Stock por LOC** = “¿Dónde está repartido?” (put-away, traslados, conteos, preparación).
- No hay “LOC general”: el total de la sede **es** ese total; no duplicar con un LOC “Toda la sede”.
- **LOC por zona:** Empezar con un LOC por espacio físico (Bodega, Cuarto frío, Neveras, Secos 1.º piso, Secos preparados). La plantilla “Espacios físicos” crea esos 7 por sede.
- **Secos preparados:** Un LOC “Secos preparados” por sede; migración gradual vía traslados (Bodega → Secos preparados) y consumo/remisiones desde ahí.

---

## 5. Retiros (consumo desde LOC)

- **Qué es:** Pantalla “Retirar insumos”: LOC (fijado por URL si viene del QR), producto, cantidad, nota. Movimiento tipo consumo; descuento en LOC y sede.
- **URL con LOC:** `/inventory/withdraw?loc=LOC-CP-BODEGA-MAIN` (o `?loc_id=uuid`). El QR en la zona apunta a esa URL; el trabajador solo elige producto y cantidad.
- No es una página distinta por LOC: es la **misma página de retiro** con ese LOC ya “abierto” por query.

---

## 6. Conteos

- **Crear conteo:** `/inventory/count-initial` → ámbito: toda la sede, por zona o por LOC. Si es por zona/LOC se crea sesión abierta y líneas.
- **Sesiones abiertas:** En la misma página se listan; enlace a **Ver/Cerrar** sesión.
- **Cerrar conteo:** En la sesión, botón “Cerrar conteo” → se calculan diferencias (contado vs sistema) por línea.
- **Aprobar ajustes:** CTA “Aprobar ajustes” (roles permitidos) → movimientos tipo ajuste, actualización stock por sede (y por LOC si scope es LOC).

---

## 7. Etiqueta LOC (50×70 mm)

- **Texto arriba:** Nombre del LOC (ej. BODEGA) y código (ej. `LOC-CP-BODEGA-MAIN`).
- **DataMatrix:** contenido = código del LOC (para handhelds, traslados, conteos).
- **QR:** URL de retiro con ese LOC (ej. `https://<dominio>/inventory/withdraw?loc=LOC-CP-BODEGA-MAIN`). Al escanear con el celular abre el formulario de retiro con el LOC ya elegido.

Al imprimir la etiqueta de un LOC se imprimen **ambos** códigos; no hace falta diseñar una página por LOC, solo la misma página de retiro con el parámetro en la URL.

---

## 8. Próximos pasos (ORIGO y resto)

- **ORIGO:** Órdenes de compra a proveedores. En Nexo: poder ligar **Entradas** a una OC (referencia a ORIGO); cargar ítems desde la OC en lugar de tipeo manual; mismo flujo de recepción + actualización stock.
- **Roadmap detallado:** Ver **ROADMAP-NEXO.md** (checklist por fases; se actualiza al implementar).
