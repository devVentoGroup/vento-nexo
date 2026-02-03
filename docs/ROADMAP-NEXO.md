# Roadmap Nexo – Checklist de implementación

Documento vivo: se van marcando los ítems hechos a medida que se implementan.

**Leyenda:** `[ ]` Pendiente · `[x]` Hecho

---

## Fase 1: Stock y visibilidad por LOC

- [x] **1.1** Stock: mostrar columna o desglose por LOC (qué hay en cada ubicación).
- [x] **1.2** Stock: filtro opcional por LOC (ver solo un LOC o una zona).
- [x] **1.3** Stock: alerta o indicador “Sin ubicación” para productos con stock pero sin LOC asignado (según INVENTARIO-PERFECTO).
- [ ] **1.4** (Opcional) Vista o export “Stock por LOC” (tabla producto × LOC con cantidades).

---

## Fase 2: Remisiones y LOC

- [ ] **2.1** Al preparar remisión: mostrar stock disponible por LOC para cada ítem (solo lectura).
- [ ] **2.2** (Opcional) Al marcar “En tránsito”: permitir indicar LOC de origen por ítem (descuento desde ese LOC).
- [ ] **2.3** Validación al preparar: cantidad preparada ≤ stock disponible (por sede o por LOC si se implementa 2.2).

---

## Fase 3: Conteos y ajustes

- [ ] **3.1** Conteos: flujo “Crear conteo” por zona/LOC (pantalla o mejora en `/inventory/count-initial`).
- [ ] **3.2** Conteos: listado de conteos abiertos y cerrar conteo.
- [ ] **3.3** Conteos: al cerrar, calcular diferencias y proponer ajustes.
- [ ] **3.4** Ajustes: CTA “Aprobar ajustes” desde conteo (solo roles permitidos).
- [ ] **3.5** Documentar en código/UX el flujo completo de conteos según INVENTARIO-PERFECTO.

---

## Fase 4: Entradas y recepción

- [ ] **4.1** Entradas: recepción parcial ya implementada; verificar estados (pendiente / parcial / recibido) y mensajes.
- [ ] **4.2** Entradas: nota de incidencia por línea (faltante, calidad, daño) si está en spec.
- [ ] **4.3** Entradas: lote/vencimiento por ítem (campos opcionales) si aplica al modelo de datos.

---

## Fase 5: Traslados y ubicaciones

- [ ] **5.1** Traslados: validar que cantidad ≤ stock disponible en LOC origen.
- [ ] **5.2** Ubicaciones: flujo “Crear LOC” una a una (además de plantilla) si no existe.
- [ ] **5.3** Ubicaciones: listado por sede con búsqueda/filtro por zona o código.

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

- [ ] **8.1** Impresión: presets LOC / SKU / PROD alineados con uso real (LOC DataMatrix, SKU Code128).
- [ ] **8.2** Impresión: cola + preview y prueba de alineación si no está.
- [ ] **8.3** Scanner: flujo mínimo (lectura y redirección) documentado o mejorado si es atajo principal.

---

## Fase 9: Integración ORIGO (órdenes de compra)

- [ ] **9.1** Diseño: modelo de datos OC en ORIGO y cómo se vincula a Nexo (referencia en entradas).
- [ ] **9.2** Entradas: campo o selector “Orden de compra” (referencia a OC de ORIGO).
- [ ] **9.3** Entradas: cargar ítems desde OC seleccionada (producto, cantidad esperada) en lugar de solo tipeo manual.
- [ ] **9.4** (Opcional) Vista “Recepciones pendientes por OC” para bodeguero.
- [ ] **9.5** Actualizar stock y movimientos al recibir contra OC (mismo flujo que entrada actual + vínculo OC).

---

## Fase 10: Documentación y cierre

- [ ] **10.1** FLUJO-NEXO-POR-ROL.md: revisar y actualizar si cambian pantallas o permisos.
- [ ] **10.2** INVENTARIO-PERFECTO.md: marcar o resumir qué pasos del checklist ya están hechos.
- [ ] **10.3** README o docs de desarrollo: cómo levantar Nexo, permisos necesarios en BD, roles de prueba.

---

## Resumen de progreso

| Fase | Hechos | Total |
|------|--------|-------|
| 1. Stock y LOC | 3 | 4 |
| 2. Remisiones y LOC | 0 | 3 |
| 3. Conteos y ajustes | 0 | 5 |
| 4. Entradas | 0 | 3 |
| 5. Traslados y ubicaciones | 0 | 3 |
| 6. Movimientos | 0 | 3 |
| 7. Panel y roles | 0 | 3 |
| 8. Impresión y scanner | 0 | 3 |
| 9. ORIGO | 0 | 5 |
| 10. Documentación | 0 | 3 |
| **Total** | **3** | **35** |

*Última actualización: Fase 1 (1.1, 1.2, 1.3) implementada – Stock con columna Ubicaciones (LOC), filtros LOC/Zona y alerta "Sin ubicación".*
