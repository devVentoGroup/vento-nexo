# Roadmap Nexo – Checklist de implementación

Documento vivo: se van marcando los ítems hechos a medida que se implementan.

**Leyenda:** `[ ]` Pendiente · `[x]` Hecho

---

## Alcance

**Dentro del alcance (Nexo hoy):**

- **Fuente de verdad del inventario:** ledger por sede y por LOC (Centro), movimientos, stock por sede en satélites.
- **Centro de producción:** LOCs, entradas de proveedor (recepción parcial), traslados entre LOCs, preparar remisiones (salida desde Centro), retiros desde LOC, conteos y ajustes, impresión etiquetas (LOC/SKU/PROD).
- **Satélites (Saudo, Vento Café):** solicitar remisión, recibir remisión; stock solo por sede (sin LOCs).
- **Panel y permisos:** CTAs y menú por rol; exportaciones (CSV) solo gerentes/propietarios; mensaje claro en `/no-access`.

**Fuera del alcance (por ahora):**

- Costeo y órdenes de compra completas (ORIGO).
- Recetas y producción integrada (FOGO).
- LOCs en satélites (decisión: solo salida del LOC en Centro; en destino solo sube stock por sede).

**Opcional / backlog (mejoran alcance si se priorizan):**

- **2.2** LOC de origen por ítem al marcar “En tránsito” (descuento desde ese LOC).
- **4.2** Nota de incidencia por línea en entradas (faltante, calidad, daño) — requiere spec y campos en BD.
- **4.3** Lote/vencimiento por ítem en entradas — requiere modelo de datos.
- ~~**8.4** Scanner~~ Hecho: acciones LOC (Ver ubicación / Abrir retiro), reconocimiento LOC sin prefijo, DataMatrix en cámara.
- **Fase 9 (ORIGO):** vincular entradas a orden de compra; cargar ítems desde OC — amplía alcance cuando ORIGO esté listo.

Para **mejorar el alcance** de forma controlada: (1) cerrar el núcleo actual (31/36 hecho); (2) priorizar una sola extensión a la vez (p. ej. solo Fase 9, o solo 4.2); (3) documentar cualquier nuevo “dentro/fuera” aquí.

---

## Fase 1: Stock y visibilidad por LOC

- [x] **1.1** Stock: mostrar columna o desglose por LOC (qué hay en cada ubicación).
- [x] **1.2** Stock: filtro opcional por LOC (ver solo un LOC o una zona).
- [x] **1.3** Stock: alerta o indicador “Sin ubicación” para productos con stock pero sin LOC asignado (según NEXO-GUIA).
- [x] **1.4** (Opcional) Vista o export “Stock por LOC” (tabla producto × LOC con cantidades).

---

## Fase 2: Remisiones y LOC

**Decisión:** Traslado sede→sede = solo salida del LOC en Centro. No hay LOCs en satélites (es demasiado trabajo); en destino solo sube stock por sede.

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

- [x] **4.1** Entradas: recepción parcial ya implementada; verificar estados (pendiente / parcial / recibido) y mensajes.
- [ ] **4.2** Entradas: nota de incidencia por línea (faltante, calidad, daño) si está en spec.
- [ ] **4.3** Entradas: lote/vencimiento por ítem (campos opcionales) si aplica al modelo de datos.

---

## Fase 5: Traslados y ubicaciones

- [x] **5.1** Traslados: validar que cantidad ≤ stock disponible en LOC origen.
- [x] **5.2** Ubicaciones: flujo “Crear LOC” una a una (además de plantilla) si no existe.
- [x] **5.3** Ubicaciones: listado por sede con búsqueda/filtro por zona o código.

---

## Fase 6: Movimientos y auditoría

- [x] **6.1** Movimientos: filtro por tipo (entrada, salida, traslado, ajuste) y por producto.
- [x] **6.2** Movimientos: exportar (CSV/Excel) si está en scope. Solo gerentes y propietarios (igual que 1.4).
- [x] **6.3** (Opcional) Movimientos: mostrar LOC en movimientos de traslado/entrada cuando aplique.

---

## Fase 7: Panel y navegación por rol

- [x] **7.1** Panel: CTAs claros por permiso (“Solicitar remisión”, “Preparar remisión”, “Recibir remisión”, “Crear entrada”, “Ver stock”).
- [x] **7.2** Menú lateral: ocultar ítems sin permiso (ya depende de permisos; verificar que todos los permisos estén mapeados).
- [x] **7.3** Sin acceso: mensaje claro en `/no-access` con rol y permiso faltante.

---

## Fase 8: Impresión y scanner

- [x] **8.1** Impresión LOC: etiqueta 50×70 mm con **dos códigos** (ver especificación abajo).
  - **DataMatrix:** contenido = código del LOC (ej. `LOC-CP-BODEGA-MAIN`). Uso: traslados, conteos, handhelds.
  - **QR:** contenido = URL retiro con ese LOC (ej. `https://<dominio>/inventory/withdraw?loc=LOC-CP-BODEGA-MAIN`). Uso: escanear con cel → abre formulario de retiro con LOC ya elegido.
  - **Layout 50×70 mm:** texto legible arriba (nombre + código LOC); DataMatrix y QR en zona central/inferior (DataMatrix ~15–20 mm, QR ~18–20 mm).
- [x] **8.2** Impresión: cola + preview y prueba de alineación; soporte Zebra vía BrowserPrint (Bluetooth cuando esté configurado).
- [x] **8.3** Presets SKU/PROD: Code128 en presets 32×25 (3-up) y 50×30 (LOC ya definido en 8.1).
- [x] **8.4** (Opcional) Scanner: flujo mínimo documentado o mejorado si es atajo principal.

---

## Fase 9: Integración ORIGO (órdenes de compra)

- [ ] **9.1** Diseño: modelo de datos OC en ORIGO y cómo se vincula a Nexo (referencia en entradas).
- [ ] **9.2** Entradas: campo o selector “Orden de compra” (referencia a OC de ORIGO).
- [ ] **9.3** Entradas: cargar ítems desde OC seleccionada (producto, cantidad esperada) en lugar de solo tipeo manual.
- [ ] **9.4** (Opcional) Vista “Recepciones pendientes por OC” para bodeguero.
- [ ] **9.5** Actualizar stock y movimientos al recibir contra OC (mismo flujo que entrada actual + vínculo OC).

---

## Fase 10: Documentación y cierre

- [x] **10.1** NEXO-GUIA.md: revisar y actualizar si cambian pantallas, permisos o flujos.
- [x] **10.2** ROADMAP-NEXO.md: mantener este checklist actualizado (marcar ítems hechos).
- [x] **10.3** README o docs de desarrollo: cómo levantar Nexo, permisos en BD, roles de prueba.

---

## Resumen de progreso

| Fase | Hechos | Total |
|------|--------|-------|
| 1. Stock y LOC | 4 | 4 |
| 2. Remisiones y LOC | 2 | 3 |
| 3. Conteos y ajustes | 5 | 5 |
| 4. Entradas | 1 | 3 |
| 5. Traslados y ubicaciones | 3 | 3 |
| 6. Movimientos | 3 | 3 |
| 7. Panel y roles | 3 | 3 |
| 8. Impresión y scanner | 4 | 4 |
| 9. ORIGO | 0 | 5 |
| 10. Documentación | 3 | 3 |
| **Total** | **32** | **36** |

*Última actualización: 8.4 Scanner — acciones LOC (Ver ubicación / Abrir retiro), reconocimiento LOC- sin prefijo, DataMatrix en cámara, texto de uso.*

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
