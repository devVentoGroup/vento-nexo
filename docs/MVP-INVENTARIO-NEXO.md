# MVP Inventario NEXO

Alcance mínimo para tener **control de inventario sin Excel/terceros**, según ROADMAP-GENERAL (Fase 3.1 NEXO) y ROADMAP-NEXO (Fase 2 Inventario Core + lo que impacta inventario).

---

## 1. Qué toca “inventario” en los roadmaps

### ROADMAP-GENERAL — Fase 3.1 NEXO

| Ítem | Estado en general | Notas |
|------|-------------------|-------|
| Inventario Core: Stock + Movimientos + Ajustes + Conteo inicial | 🟡 | Core del MVP |
| Remisiones internas (crear → preparar → en viaje → recibir → faltantes) | 🟡 | Documento que mueve stock CP ↔ satélites |
| Recepciones proveedor (documento) → movimientos | ⬜ | Fase 3 NEXO |
| Ingreso por producción manual (lote + caducidad) | 🟡 | production-batches, Zebra |
| Etiquetas Zebra (producción, expiracion) | 🟡 | Fase 6 NEXO |
| Entregas internas CP → cocina/panadería → movimientos | ⬜ | Fase 4 NEXO |
| Transferencias CP → satélites (recepción/disputa) | 🟡 | Incluido en Remisiones |
| LPN/LOC + Zebra + put-away/picking | 🟡 | Fase 6, “no debe bloquear el core” |

**Criterio de listo (general):** control real y auditable del inventario sin Excel/terceros.

---

### ROADMAP-NEXO — Fases que tocan inventario

**Fase 2 — Inventario Core (MVP operativo)**  
*“Puedes iniciar control desde cero sin Excel/Epsilon.”*

| Ítem | Estado NEXO | Estado real en app |
|------|-------------|--------------------|
| 2.1 Ledger (tipos de movimiento, regla de escribir movimiento) | 🟡 | Hecho: movimientos con tipos (initial_count, transfer_*, etc.) |
| 2.2 Stock por sede (vista, product_site_settings, alertas básicas) | 🟡 | Hecho: Stock con filtros; alertas (ej. negativos) parcial |
| 2.3 **Stock** | 🟢 | ✅ `/inventory/stock` |
| 2.3 **Movimientos** | 🟢 | ✅ `/inventory/movements` |
| 2.3 **Ajuste** (motivo, permisos, evidencia opcional) | ⬜ | Placeholder ✅ `/inventory/adjust` |
| 2.3 **Conteo inicial** (wizard por sede; sesión y movimientos) | ⬜→🟢 | ✅ `/inventory/count-initial` |
| 2.3 Conteos > Historial | ⬜ | No existe |

**Fase 3 — Recepción de proveedores** (Inbound)  
*Fuera de MVP inventario estricto; siguiente prioridad.*

- Recepciones > Nueva (proveedor, factura, líneas, cierra → movimientos receipt).

**Fase 4 — Entregas internas** (CP → cocina/panadería)  
*Fuera de MVP inventario estricto.*

- Entregas internas > Nueva → movimientos `issue_internal`.

**Fase 5 — Transferencias y remisiones a satélites**  
*Sí toca inventario (stock entre sedes).*

| Ítem | Estado NEXO | Estado real en app |
|------|-------------|--------------------|
| Remisiones MVP (crear → preparar → en viaje → recibir → faltantes) | 🟡 | ✅ `/inventory/remissions` + `[id]` |
| Movimientos transfer_out / transfer_in | 🟢 | Hecho vía RPC |
| Recepción en satélite, discrepancias | ⬜ | Parcial en flujo |

**Fase 6 — LPN/LOC**  
*“No debe bloquear el core”; mejora de trazabilidad.*

| Ítem | Estado NEXO | Estado real en app |
|------|-------------|--------------------|
| LOC list + create | 🟡 | ✅ `/inventory/locations` |
| LPN list + create | 🟡 | ✅ `/inventory/lpns` |
| Put-away, contenido LPN, Zebra, etc. | ⬜ | No |

**Fase 7 — Conteos cíclicos y auditoría**  
*Fuera de MVP; viene después.*

- ABC, sesiones por área/LOC/LPN, reconciliación, aprobación de ajustes.

---

## 2. Alcance MVP Inventario (recomendado)

Para **“iniciar control desde cero sin Excel”** (Fase 2 NEXO) y alineado al General:

### Incluido en el MVP

| Funcionalidad | Ruta | Notas |
|---------------|------|-------|
| **Stock** | `/inventory/stock` | Filtros, búsqueda, vista por sede |
| **Movimientos** | `/inventory/movements` | Ledger, filtros por fecha/sede/tipo/SKU |
| **Conteo inicial** | `/inventory/count-initial` | Wizard por sede → movimientos `initial_count` y stock |
| **Remisiones** | `/inventory/remissions` | Crear, preparar, en viaje, recibir; transfer_out/transfer_in |

### En el MVP pero como “placeholder” o simple

| Funcionalidad | Ruta | Acción |
|---------------|------|--------|
| **Ajustes** | `/inventory/adjust` | Hoy: “Próximamente”. MVP completo: pantalla con motivo, permisos, evidencia opcional y movimiento `adjustment`. |

### Fuera del MVP de inventario (dejar para después)

| Funcionalidad | Ruta | Motivo |
|---------------|------|--------|
| **LOC** | `/inventory/locations` | Fase 6; no necesario para “control desde cero”. |
| **LPN** | `/inventory/lpns` | Fase 6; idem. |
| **Lotes de producción** | `/inventory/production-batches` | Cruce con FOGO; no es core Fase 2. |
| **Conteos > Historial** | — | Fase 7. |
| **Recepciones proveedor** | — | Fase 3 NEXO. |
| **Entregas internas** | — | Fase 4 NEXO. |
| **Scanner / Impresión** | `/scanner`, `/printing/jobs` | Herramientas de soporte; se pueden mantener en la barra si ya se usan. |

---

## 3. Navegación MVP

Para que el menú refleje solo el MVP de inventario:

- **Inventario**
  - Stock  
  - Movimientos  
  - Conteo inicial  
  - Ajustes (opcional: mantener como “Próximamente” o ocultar hasta implementar)
- **Documentos**
  - Remisiones
- Enlaces directos (según necesidad): Scanner, Impresión.

Quitar del menú **Inventario** en el MVP: **LOC**, **LPN** (y, si se quiere strict MVP, **Ajustes** hasta que exista la pantalla real).

---

## 4. Resumen: estado por ítem

| Ítem | Hecho | Pendiente para MVP |
|------|-------|--------------------|
| Stock | ✅ | — |
| Movimientos | ✅ | — |
| Conteo inicial | ✅ | — |
| Ajustes | Placeholder | Pantalla con motivo, permisos, evidencia → movimiento `adjustment` |
| Remisiones | ✅ flujo base | Disputas/faltantes más claros, si se prioriza |
| LOC | ✅ pantalla | Ocultar del menú MVP |
| LPN | ✅ pantalla | Ocultar del menú MVP |
| Production-batches | ✅ pantalla | Ocultar del menú MVP (o mantener si ya se usa) |

---

## 5. Próximos pasos sugeridos (orden)

1. **Ajustar menú**  
   Dejar en Inventario solo: Stock, Movimientos, Conteo inicial y (opcional) Ajustes. Sacar LOC, LPN (y, si se pacta, production-batches) del menú de inventario para el MVP.

2. **Ajustes (Inventario > Ajuste)**  
   Implementar: formulario (producto, sede, cantidad delta, motivo obligatorio, evidencia opcional) → `inventory_movements` tipo `adjustment` y actualización de `inventory_stock_by_site`. Revisar RLS/permisos para `inventory.adjustments`.

3. **Recepciones (Fase 3)**  
   Cuando se priorice: Recepciones > Nueva (proveedor, factura, líneas) → al cerrar, movimientos `receipt` y stock.

4. **Entregas internas (Fase 4)**  
   Cuando se priorice: documento de entrega interna → `issue_internal`.

5. **LOC/LPN en menú**  
   Cuando se trabaje Fase 6 de forma explícita, volver a poner LOC y LPN bajo Inventario (o la sección que se defina).

---

## 6. Referencias

- `ROADMAP-GENERAL.md` (vento-shell): Fase 3.1 NEXO, criterio “control sin Excel”.
- `ROADMAP-NEXO.md`: Fase 2 (Inventario Core), Fases 3–6, prioridad recomendada.
- `NEXO.md`: esquema de pantallas (Inventario, Documentos, Conteos).
