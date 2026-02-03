# Roadmap Nexo – Checklist de implementación

Documento vivo: se van marcando los ítems hechos a medida que se implementan.

**Leyenda:** `[ ]` Pendiente · `[x]` Hecho

---

## Fase 1: Stock y visibilidad por LOC

- [x] **1.1** Stock: mostrar columna o desglose por LOC (qué hay en cada ubicación).
- [x] **1.2** Stock: filtro opcional por LOC (ver solo un LOC o una zona).
- [x] **1.3** Stock: alerta o indicador “Sin ubicación” para productos con stock pero sin LOC asignado (según NEXO-GUIA).
- [ ] **1.4** (Opcional) Vista o export “Stock por LOC” (tabla producto × LOC con cantidades).

---

## Fase 2: Remisiones y LOC

- [x] **2.1** Al preparar remisión: mostrar stock disponible por LOC para cada ítem (solo lectura).
- [ ] **2.2** (Opcional) Al marcar “En tránsito”: permitir indicar LOC de origen por ítem (descuento desde ese LOC).
- [x] **2.3** Validación al preparar: cantidad preparada ≤ stock disponible (por sede o por LOC si se implementa 2.2).

---

## Fase 3: Conteos y ajustes

- [x] **3.1** Conteos: flujo “Crear conteo” por zona/LOC (pantalla o mejora en `/inventory/count-initial`).
- [x] **3.2** Conteos: listado de conteos abiertos y cerrar conteo.
- [x] **3.3** Conteos: al cerrar, calcular diferencias y proponer ajustes.
- [x] **3.4** Ajustes: CTA “Aprobar ajustes” desde conteo (solo roles permitidos).
- [x] **3.5** Documentar en código/UX el flujo completo de conteos según NEXO-GUIA.

---

## Fase 4: Entradas y recepción

- [ ] **4.1** Entradas: recepción parcial ya implementada; verificar estados (pendiente / parcial / recibido) y mensajes.
- [ ] **4.2** Entradas: nota de incidencia por línea (faltante, calidad, daño) si está en spec.
- [ ] **4.3** Entradas: lote/vencimiento por ítem (campos opcionales) si aplica al modelo de datos.

---

## Fase 5: Traslados y ubicaciones

- [x] **5.1** Traslados: validar que cantidad ≤ stock disponible en LOC origen.
- [x] **5.2** Ubicaciones: flujo “Crear LOC” una a una (además de plantilla) si no existe.
- [x] **5.3** Ubicaciones: listado por sede con búsqueda/filtro por zona o código.

---

## Fase 6: Movimientos y auditoría

- [ ] **6.1** Movimientos: filtro por tipo (entrada, salida, traslado, ajuste) y por producto.
- [ ] **6.2** Movimientos: exportar (CSV/Excel) si está en scope.
- [ ] **6.3** (Opcional) Movimientos: mostrar LOC en movimientos de traslado/entrada cuando aplique.

---

## Fase 7: Panel y navegación por rol

- [ ] **7.1** Panel: CTAs claros por permiso (“Solicitar remisión”, “Preparar remisión”, “Recibir remisión”, “Crear entrada”, “Ver stock”).
- [ ] **7.2** Menú lateral: ocultar ítems sin permiso (ya depende de permisos; verificar que todos los permisos estén mapeados).
- [ ] **7.3** Sin acceso: mensaje claro en `/no-access` con rol y permiso faltante.

---

## Fase 8: Impresión y scanner

- [ ] **8.1** Impresión LOC: etiqueta 50×70 mm con **dos códigos** (ver especificación abajo).
  - **DataMatrix:** contenido = código del LOC (ej. `LOC-CP-BODEGA-MAIN`). Uso: traslados, conteos, handhelds.
  - **QR:** contenido = URL retiro con ese LOC (ej. `https://<dominio>/inventory/withdraw?loc=LOC-CP-BODEGA-MAIN`). Uso: escanear con cel → abre formulario de retiro con LOC ya elegido.
  - **Layout 50×70 mm:** texto legible arriba (nombre + código LOC); DataMatrix y QR en zona central/inferior (DataMatrix ~15–20 mm, QR ~18–20 mm).
- [ ] **8.2** Impresión: cola + preview y prueba de alineación; soporte Zebra por Bluetooth cuando esté configurado.
- [ ] **8.3** Presets SKU/PROD: Code128 u otro según uso (LOC ya definido en 8.1).
- [ ] **8.4** Scanner: flujo mínimo (lectura y redirección) documentado o mejorado si es atajo principal.

---

## Fase 9: Integración ORIGO (órdenes de compra)

- [ ] **9.1** Diseño: modelo de datos OC en ORIGO y cómo se vincula a Nexo (referencia en entradas).
- [ ] **9.2** Entradas: campo o selector “Orden de compra” (referencia a OC de ORIGO).
- [ ] **9.3** Entradas: cargar ítems desde OC seleccionada (producto, cantidad esperada) en lugar de solo tipeo manual.
- [ ] **9.4** (Opcional) Vista “Recepciones pendientes por OC” para bodeguero.
- [ ] **9.5** Actualizar stock y movimientos al recibir contra OC (mismo flujo que entrada actual + vínculo OC).

---

## Fase 10: Documentación y cierre

- [ ] **10.1** NEXO-GUIA.md: revisar y actualizar si cambian pantallas, permisos o flujos.
- [ ] **10.2** ROADMAP-NEXO.md: mantener este checklist actualizado (marcar ítems hechos).
- [ ] **10.3** README o docs de desarrollo: cómo levantar Nexo, permisos en BD, roles de prueba.

---

## Resumen de progreso

| Fase | Hechos | Total |
|------|--------|-------|
| 1. Stock y LOC | 3 | 4 |
| 2. Remisiones y LOC | 2 | 3 |
| 3. Conteos y ajustes | 5 | 5 |
| 4. Entradas | 0 | 3 |
| 5. Traslados y ubicaciones | 3 | 3 |
| 6. Movimientos | 0 | 3 |
| 7. Panel y roles | 0 | 3 |
| 8. Impresión y scanner | 0 | 4 |
| 9. ORIGO | 0 | 5 |
| 10. Documentación | 0 | 3 |
| **Total** | **17** | **36** |

*Última actualización: Fase 5 completa (5.2 Crear LOC, 5.3 filtros sede/zona/código).*

---

## Especificación: etiqueta LOC 50×70 mm (para implementar en Fase 8)

**Formato de etiqueta:** 50 mm ancho × 70 mm alto (Zebra, impresión por Bluetooth cuando esté configurado).

**Contenido de la etiqueta:**

| Elemento | Contenido | Qué se ve al escanear |
|----------|-----------|------------------------|
| **Texto legible (arriba)** | Nombre corto (ej. BODEGA) y código (ej. `LOC-CP-BODEGA-MAIN`). | — |
| **DataMatrix** | Solo el código del LOC (ej. `LOC-CP-BODEGA-MAIN`). | El dispositivo recibe ese texto (handheld, app traslados/conteos). |
| **QR** | URL completa de retiro con ese LOC (ej. `https://<dominio-nexo>/inventory/withdraw?loc=LOC-CP-BODEGA-MAIN`). | El cel abre el navegador en esa URL → formulario de retiro con LOC ya elegido. |

**Layout sugerido 50×70 mm:**
- **Arriba (≈15–20 mm):** texto grande: nombre del LOC (ej. BODEGA) y debajo el código (ej. `LOC-CP-BODEGA-MAIN`).
- **Centro/abajo:** DataMatrix y QR uno al lado del otro (o DataMatrix arriba, QR abajo).
  - DataMatrix: tamaño ~15×15 mm o 18×18 mm (código corto, lectura con handheld).
  - QR: tamaño ~18×18 mm o 20×20 mm (lectura cómoda con cel).

**URL del QR:** construir con base URL de Nexo + `/inventory/withdraw?loc=` + código del LOC (ej. `LOC-CP-BODEGA-MAIN`). Alternativa: `?loc_id=<uuid>` si se prefiere UUID.

---

## Resumen de lo ya implementado (fuera del roadmap anterior)

- **Retiros (consumo desde LOC):** `/inventory/withdraw`. Formulario: LOC (prellenado por `?loc_id=` o `?loc=`), ítems (producto, cantidad, nota). Movimiento tipo `consumption`, descuento en LOC y sede. Permiso: `inventory.withdraw`. QR por zona puede apuntar a esta URL con el LOC en query.
- **Preparar remisiones (bodega/tablet):** `/inventory/remissions/prepare` lista solicitudes pendientes/preparando del centro; cada fila tiene botón "Preparar" al detalle. En detalle: instrucciones claras (marcar cantidades → Guardar ítems → En viaje). Enlace "Preparar remisiones" en menú y en página Remisiones cuando la sede es bodega.
- **Ubicaciones (LOC):** entrada en menú "Ubicaciones" (solo gerentes/propietarios). Plantilla "Espacios físicos" (Bodega, Cuarto frío, Congelación, Neveras 2/3 puertas, Secos 1.º piso, Secos preparados). Zonas disponibles en formulario Crear LOC para todas las sedes.
