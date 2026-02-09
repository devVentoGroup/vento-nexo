# Auditoría de estándares UI — vento-nexo

Componentes estándar disponibles en `globals.css`:
- **Botones:** `ui-btn`, `ui-btn--brand`, `ui-btn--primary`, `ui-btn--ghost`, `ui-btn--danger`
- **Inputs:** `ui-input`
- **Estado:** `ui-chip`, `ui-chip--success`, `ui-chip--brand`, `ui-chip--warn`
- **Alertas:** `ui-alert`, `ui-alert--success`, `ui-alert--error`, `ui-alert--warn`, `ui-alert--neutral`
- **Paneles:** `ui-panel`, `ui-panel--halo`, `ui-panel-soft`
- **Tipografía:** `ui-h1`, `ui-h2`, `ui-h3`, `ui-body`, `ui-body-muted`, `ui-caption`, `ui-label`
- **Tablas:** `ui-table`, `ui-th`, `ui-td` (o componentes `Table`, `TableHeaderCell`, `TableCell`)
- **Empty:** `ui-empty`, `ui-empty-state`

---

## 1. Mensajes de éxito — usar `ui-alert ui-alert--success`

En lugar de `rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800`:

| Archivo | Línea |
|---------|-------|
| `app/inventory/settings/supply-routes/page.tsx` | 146 |
| `app/inventory/settings/sites/page.tsx` | 98 |
| `app/inventory/remissions/[id]/page.tsx` | 547 |
| `app/inventory/remissions/page.tsx` | 466 |
| `app/inventory/catalog/[id]/page.tsx` | 301 |
| `app/inventory/withdraw/page.tsx` | 262 |
| `app/inventory/production-batches/page.tsx` | 294 |
| `app/inventory/transfers/page.tsx` | 296 |
| `app/inventory/entries/page.tsx` | 354 |
| `app/inventory/locations/page.tsx` | 379, 385, 391 |
| `app/inventory/count-initial/session/[id]/page.tsx` | 298 |

---

## 2. Mensajes de advertencia — usar `ui-alert ui-alert--warn`

En lugar de `border-amber-200 bg-amber-50` o similar:

| Archivo | Línea |
|---------|-------|
| `app/inventory/remissions/[id]/page.tsx` | 553, 581 |
| `app/inventory/catalog/[id]/page.tsx` | 476 |
| `app/printing/jobs/page.tsx` | 471 |

---

## 3. Mensajes de error — usar `ui-alert ui-alert--error`

En lugar de `text-red-700` o `text-red-600`:

| Archivo | Línea |
|---------|-------|
| `app/inventory/remissions/[id]/page.tsx` | 515 |
| `features/inventory/catalog/product-image-upload.tsx` | 85 |

---

## 4. Inputs — usar `ui-input`

Inputs con estilos custom en vez de `ui-input`:

| Archivo | Línea | Nota |
|---------|-------|------|
| `app/inventory/adjust/page.tsx` | 78 | `h-11 rounded-xl border border-zinc-300...` |
| `app/inventory/count-initial/page.tsx` | 79, 266, 281 | Varios inputs |
| `app/inventory/production-batches/page.tsx` | 309 | Input cantidad |
| `app/inventory/remissions/[id]/page.tsx` | 694, 704, 714, 724, 734, 750 | Inputs numéricos en items |
| `features/inventory/adjust/adjust-form.tsx` | 107, 141, 171, 186 | Varios |
| `features/inventory/withdraw/withdraw-form.tsx` | 79, 138, 152, 173, 182 | Varios |
| `features/inventory/count-initial/count-initial-form.tsx` | 117 | |
| `features/inventory/lpns/lpn-create-form.tsx` | 68, 80 | |
| `app/printing/jobs/_components/ConfigPanel.tsx` | 114, 129, 153, 165, 175, 185, 199, 208, 245, 254 | Muchos inputs |

---

## 5. Botones — usar `ui-btn` y variantes

Algunos botones podrían no usar las clases estándar. Revisar:

| Archivo | Contexto |
|---------|----------|
| `app/printing/jobs/page.tsx` | Botones de acciones de trabajo |
| `app/printing/jobs/_components/PreviewPanel.tsx` | Botones de vista |
| `app/printing/jobs/_components/QueuePanel.tsx` | Botón de acción |
| `app/printing/jobs/_components/ConfigPanel.tsx` | Botones de configuración |
| `components/vento/standard/vento-chrome.tsx` | Botón cerrar sidebar (h-10 rounded-lg...) |
| `components/vento/standard/app-switcher.tsx` | Botón trigger |
| `components/vento/nav-dropdown.tsx` | Botón dropdown |
| `components/vento/standard/profile-menu.tsx` | Botones del menú |
| `features/inventory/locations/loc-create-form.tsx` | Botón submit |
| `features/inventory/locations/loc-delete-button.tsx` | Botón eliminar |
| `features/inventory/withdraw/withdraw-form.tsx` | Botones +/- |
| `features/inventory/count-initial/count-initial-form.tsx` | Botones de sesión |
| `features/inventory/catalog/product-suppliers-editor.tsx` | Botón eliminar fila |
| `features/inventory/catalog/product-site-settings-editor.tsx` | Botón eliminar fila |
| `components/vento/scan-input.tsx` | Botones de scan |

---

## 6. Paneles / cards — usar `ui-panel` o `ui-panel-soft`

Contenedores con `rounded-xl border border-zinc-200 bg-white` o similar:

| Archivo | Línea |
|---------|-------|
| `app/inventory/settings/checklist/page.tsx` | 105, 121, 141 |
| `app/inventory/settings/supply-routes/page.tsx` | 245 |
| `app/inventory/settings/sites/page.tsx` | 169 |
| `app/inventory/catalog/page.tsx` | 189 |
| `app/inventory/remissions/[id]/page.tsx` | 616, 625, 634, 664, 672 |
| `app/printing/jobs/*` | Varios en ConfigPanel, PreviewPanel, QueuePanel |
| `app/inventory/count-initial/page.tsx` | 226 |
| `features/inventory/adjust/adjust-form.tsx` | 120 |
| `features/inventory/withdraw/withdraw-form.tsx` | 96 |
| `features/inventory/locations/loc-create-form.tsx` | 154 |
| `components/vento/nav-dropdown.tsx` | 56 |

---

## 7. Tablas — usar `Table`, `TableHeaderCell`, `TableCell`

Algunas tablas usan `<table className="min-w-full text-sm">` en vez del componente estándar:

| Archivo | Línea |
|---------|-------|
| `app/inventory/catalog/page.tsx` | 258 |
| `app/inventory/transfers/page.tsx` | 308 |
| `app/inventory/entries/page.tsx` | 374 |
| `app/inventory/stock/page.tsx` | (revisar tablas) |

---

## 8. Bloque informativo (footer) — considerar `ui-panel-soft`

Varias páginas usan `rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-2)] p-4 text-sm text-[var(--ui-muted)]` para bloques informativos. Es coherente con tokens; opcional migrar a `ui-panel-soft` si se quiere unificar.

---

## Resumen por prioridad

**Alta:** Mensajes de éxito/error/warn (unificar con `ui-alert`)  
**Media:** Inputs (unificar con `ui-input`)  
**Media:** Botones en formularios de acciones (unificar con `ui-btn`)  
**Baja:** Paneles, tablas, componentes del layout (vento-chrome, app-switcher)
