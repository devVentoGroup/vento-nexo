# Brief para Codex: capacidades dinámicas por sede, productos y remisiones en NEXO

**Proyecto:** Vento NEXO  
**Fecha:** 2026-05-29  
**Tipo:** especificación técnica para implementación con Codex  
**Prioridad actual:** dejar productos por sede bien configurados sin reconstruir todo el flujo de remisiones ahora.

## Alcance por repositorio

- **`vento-shell` es la fuente de verdad de base de datos.** Toda migración, RLS, RPC, función SQL, backfill y verificación de schema debe crearse y correrse desde `c:\Vento-Projects\vento-shell`.
- **`vento-nexo` consume el schema.** En este repo solo van cambios de UI, helpers frontend/server, acciones de Next.js y lógica de aplicación.
- Antes de escribir SQL, Codex debe inspeccionar las migraciones existentes y el schema real. No asumir tipos, nombres de columnas, políticas RLS ni relaciones.
- Si una columna, helper o tabla equivalente ya existe, reutilizarla. No duplicar estructuras por cumplir literalmente el brief.
- No levantar servidor de desarrollo salvo pedido explícito.
- Si se modifica aspecto visual en `vento-nexo`, correr `npm run audit:i18n`.

---

## Decisión ejecutiva

No reescribir remisiones ni productos alrededor de `site_type`.

Implementar una arquitectura de **capacidades operativas por sede** y usar esas capacidades para decidir si una sede solicita remisiones, despacha remisiones, recibe remisiones, vende, produce o almacena inventario.

`site_type` puede seguir existiendo como etiqueta legacy/visual, pero no debe ser el motor de reglas de negocio.

---

## 1. Contexto consolidado

El sistema actual mezcla demasiadas reglas en conceptos rígidos como:

- `production_center`
- `satellite`
- nombres de sedes como Centro de Producción
- áreas globales de remisión
- disponibilidad por sede
- producción local
- LOC de producción local

Problema observado en UI de productos por sede:

- Saudo puede producir.
- En Saudo, el selector **LOC de producción local** no muestra opciones.
- En Vento Café, el selector sí muestra opciones como Barra y Cocina.
- Eso sugiere que el selector depende de filtros incompletos, posiblemente por `site_type`, nombre de sede, `area.kind`, `LOC.kind`, o una mezcla incorrecta entre remisión y producción local.

Problema observado en configuración de remisiones:

- La página muestra “áreas globales activas” como si aplicaran a todas las sedes.
- Si una sede no tiene reglas propias, la UI muestra las áreas globales.
- Si el usuario desmarca todas las áreas, el sistema lo interpreta como “no hay override” y vuelve al global.
- Eso es peligroso: **cero áreas seleccionadas debe poder significar cero áreas habilitadas**, no “volver al global”.

---

## 2. Objetivo de implementación

Implementar una base dinámica de capacidades operativas por sede y corregir productos/remisiones para que dejen de depender de `site_type` como motor de negocio.

### Objetivos concretos

1. Cada sede debe poder marcar si:
   - solicita remisiones,
   - despacha remisiones,
   - recibe remisiones,
   - vende,
   - produce,
   - almacena inventario,
   - es un negocio comercial.

2. Las sedes comerciales tipo “Negocios” no deben aparecer en flujos operativos salvo que tengan capacidades activas para esos flujos.

3. Las remisiones deben decidir orígenes y destinos por:
   - capacidades operativas,
   - rutas de abastecimiento (`site_supply_routes`),
   - permisos del usuario.

4. Los productos por sede deben separar:
   - disponibilidad,
   - venta,
   - solicitud por remisión,
   - áreas solicitantes,
   - producción local,
   - LOC de producción local.

5. El selector **LOC de producción local** debe salir de los LOC/áreas reales de la sede seleccionada.

6. Si Saudo tiene `can_produce = true` y tiene LOCs/áreas reales configuradas, Saudo debe mostrar sus propias opciones en **LOC de producción local**.

7. No borrar áreas existentes.

8. No renombrar áreas existentes.

9. No migrar datos destructivamente.

---

## 3. Principios de arquitectura

### Regla permanente

`site_type` puede quedarse como clasificación general o visual, pero no debe decidir por sí solo la operación.

La operación se decide por capacidades configurables por sede.

### Reglas

- Una sede puede ser híbrida.
- Una sede puede vender, producir, solicitar remisiones, recibir remisiones y almacenar inventario al mismo tiempo si así se configura.
- Un segundo centro de producción debe poder agregarse configurando capacidades y rutas, sin tocar código.
- Una sede satélite puede producir localmente si `can_produce = true`.
- Un negocio comercial puede vender sin entrar al flujo de remisiones si `is_commercial_business = true` y no tiene capacidades de remisión.
- Desmarcar todas las áreas de remisión para una sede debe ser un estado explícito, no un retorno silencioso al global.

---

## 4. Modelo de datos propuesto

Estos cambios son **propuesta de schema para `vento-shell`**, no migraciones finales para pegar a ciegas.

Antes de crear migraciones, verificar en `vento-shell`:

- tipo real de `public.sites.id`;
- estructura real de `public.employees` y cómo se compara con `auth.uid()`;
- políticas RLS existentes y patrón de roles usado por el proyecto;
- existencia previa de columnas equivalentes en `product_site_settings`;
- existencia y relación real de `inventory_locations.site_id`;
- migraciones recientes relacionadas con `site_area_purpose_rules`, remisiones, LOCs y stock por presentación.

## 4.1 Nueva tabla: `site_operational_capabilities`

Crear una tabla nueva en vez de sobrecargar `sites`.

Esto permite mantener `site_type` como clasificación legacy y agregar capacidades sin romper pantallas existentes.

> Nota: si `public.sites.id` no es `uuid`, adaptar el tipo de `site_id` al tipo real del proyecto.

```sql
create table if not exists public.site_operational_capabilities (
  site_id uuid primary key references public.sites(id) on delete cascade,
  can_request_remissions boolean not null default false,
  can_fulfill_remissions boolean not null default false,
  can_receive_remissions boolean not null default false,
  can_sell boolean not null default false,
  can_produce boolean not null default false,
  can_hold_inventory boolean not null default false,
  is_commercial_business boolean not null default false,
  show_in_product_setup boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.site_operational_capabilities enable row level security;

drop policy if exists site_operational_capabilities_read_authenticated
on public.site_operational_capabilities;

create policy site_operational_capabilities_read_authenticated
on public.site_operational_capabilities
for select
to authenticated
using (true);

drop policy if exists site_operational_capabilities_write_admins
on public.site_operational_capabilities;

create policy site_operational_capabilities_write_admins
on public.site_operational_capabilities
for all
to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and lower(e.role) in ('propietario', 'gerente_general')
  )
)
with check (
  exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and lower(e.role) in ('propietario', 'gerente_general')
  )
);
```

## 4.2 Backfill inicial sugerido

El backfill debe mantener el comportamiento actual como punto de partida, pero sin impedir que una sede satélite pueda producir después.

Saudo debe poder marcarse manualmente con `can_produce = true` si produce localmente.

```sql
insert into public.site_operational_capabilities (
  site_id,
  can_request_remissions,
  can_fulfill_remissions,
  can_receive_remissions,
  can_sell,
  can_produce,
  can_hold_inventory,
  is_commercial_business,
  show_in_product_setup
)
select
  s.id,
  case when s.site_type = 'satellite' then true else false end,
  case when s.site_type = 'production_center' then true else false end,
  case when s.site_type in ('satellite', 'production_center') then true else false end,
  case when s.site_type in ('satellite', 'business') then true else false end,
  case when s.site_type = 'production_center' then true else false end,
  case when s.site_type in ('satellite', 'production_center', 'warehouse') then true else false end,
  case when s.site_type = 'business' then true else false end,
  case when s.site_type = 'business' then false else true end
from public.sites s
on conflict (site_id) do nothing;
```

## 4.3 Nueva tabla: `site_purpose_settings`

La configuración actual de áreas por remisión no representa bien el estado custom con cero áreas.

Crear una tabla de modo por sede/propósito.

```sql
create table if not exists public.site_purpose_settings (
  site_id uuid not null references public.sites(id) on delete cascade,
  purpose text not null,
  mode text not null default 'inherit_global'
    check (mode in ('inherit_global', 'custom', 'disabled')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (site_id, purpose)
);

alter table public.site_purpose_settings enable row level security;

drop policy if exists site_purpose_settings_read_authenticated
on public.site_purpose_settings;

create policy site_purpose_settings_read_authenticated
on public.site_purpose_settings
for select
to authenticated
using (true);

drop policy if exists site_purpose_settings_write_admins
on public.site_purpose_settings;

create policy site_purpose_settings_write_admins
on public.site_purpose_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and lower(e.role) in ('propietario', 'gerente_general')
  )
)
with check (
  exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and lower(e.role) in ('propietario', 'gerente_general')
  )
);
```

### Interpretación requerida

```ts
if (mode === "disabled") {
  effectiveAreaKinds = [];
} else if (mode === "custom") {
  effectiveAreaKinds = siteRulesForPurpose;
} else {
  effectiveAreaKinds = globalAreaKinds;
}
```

Regla clave:

```txt
custom + [] significa ninguna área habilitada.
No debe interpretarse como volver al global.
```

## 4.4 Extensiones a `product_site_settings`

La configuración por producto/sede necesita separar remisión y producción local.

Si ya existen columnas equivalentes, Codex debe reutilizarlas y no duplicarlas. Si no existen, crear columnas nuevas.

```sql
alter table public.product_site_settings
  add column if not exists local_production_enabled boolean not null default false,
  add column if not exists production_location_id uuid references public.inventory_locations(id),
  add column if not exists sales_enabled boolean,
  add column if not exists inventory_enabled boolean;
```

### Semántica esperada

- `remission_enabled`: controla si el producto se puede solicitar por remisión hacia esa sede.
- `local_production_enabled`: controla si ese producto se produce localmente en esa sede.
- `production_location_id`: apunta al LOC local por defecto para producción.
- `sales_enabled`: controla si el producto participa en venta en esa sede.
- `inventory_enabled`: controla si el producto participa en inventario de esa sede.

`local_production_enabled` y `production_location_id` son los campos críticos para resolver el problema de Saudo.

---

## 5. Helpers compartidos a crear

Crear helpers para evitar repetir consultas y volver a introducir hardcodes.

## 5.1 Archivo nuevo: `src/lib/inventory/site-capabilities.ts`

```ts
export type SiteOperationalCapabilities = {
  site_id: string;
  can_request_remissions: boolean;
  can_fulfill_remissions: boolean;
  can_receive_remissions: boolean;
  can_sell: boolean;
  can_produce: boolean;
  can_hold_inventory: boolean;
  is_commercial_business: boolean;
  show_in_product_setup: boolean;
};

export async function listSitesWithCapabilities(
  supabase: any,
  filters?: {
    canRequestRemissions?: boolean;
    canFulfillRemissions?: boolean;
    canReceiveRemissions?: boolean;
    canSell?: boolean;
    canProduce?: boolean;
    canHoldInventory?: boolean;
    includeCommercialBusinesses?: boolean;
    showInProductSetup?: boolean;
  }
) {
  // Join sites + site_operational_capabilities.
  // Do not filter by site_type unless explicitly needed for backward display.
  // If includeCommercialBusinesses !== true, exclude rows where is_commercial_business = true
  // unless they also have the requested operational capability.
}

export async function getSiteCapabilitiesBySiteId(
  supabase: any,
  siteIds: string[]
): Promise<Map<string, SiteOperationalCapabilities>> {
  // Return Map<string, SiteOperationalCapabilities>.
  // If a site has no row, return safe defaults and avoid assuming production_center/satellite.
  return new Map();
}
```

## 5.2 Archivo nuevo: `src/lib/inventory/remission-runtime-settings.ts`

```ts
export const APP_ID = "nexo";
export const REMISSIONS_INVENTORY_POSTING_SETTING_KEY =
  "remissions.inventory_posting_enabled";

export async function readRemissionsInventoryPostingEnabled(
  supabase: any,
  fallback = false
): Promise<boolean> {
  const { data, error } = await supabase
    .from("app_runtime_settings")
    .select("bool_value")
    .eq("app_id", APP_ID)
    .eq("setting_key", REMISSIONS_INVENTORY_POSTING_SETTING_KEY)
    .maybeSingle();

  if (error) return fallback;
  return typeof data?.bool_value === "boolean" ? data.bool_value : fallback;
}
```

---

## 6. Cambios por pantalla y módulo

## 6.1 Configuración de sedes

Archivo esperado:

```txt
src/app/inventory/settings/sites/page.tsx
```

Si el archivo tiene otra estructura, Codex debe ubicar la pantalla de sedes y agregar una sección llamada **Capacidades operativas**.

Agregar por cada sede una sección editable con estos switches:

| Campo UI | Columna | Comportamiento esperado |
|---|---|---|
| Solicita remisiones | `can_request_remissions` | La sede puede crear solicitudes hacia un origen configurado por rutas. |
| Despacha remisiones | `can_fulfill_remissions` | La sede aparece como origen/bodega si hay rutas activas. |
| Recibe remisiones | `can_receive_remissions` | La sede puede registrar recepción. |
| Vende | `can_sell` | La sede aparece en flujos comerciales/POS y producto para venta. |
| Produce | `can_produce` | La sede puede tener producción local y LOC de producción por producto. |
| Almacena inventario | `can_hold_inventory` | La sede participa en stock y conteos. |
| Negocio comercial | `is_commercial_business` | Si no tiene capacidades operativas, no aparece en remisiones ni configuración operativa. |
| Mostrar en productos | `show_in_product_setup` | Controla si aparece en la configuración producto-sede. |

## 6.2 Configuración de remisiones

Archivo actual:

```txt
src/app/inventory/settings/remissions/page.tsx
```

Mantener el switch maestro de inventario real arriba.

Rehacer el bloque de áreas para que sea por sede y no dé miedo.

### Reglas de UI

- No mostrar Centro de Producción como solicitante solo por estar activo.
- Mostrar sedes según capacidades.
- El selector de sede puede mostrar:
  - todas las sedes no comerciales, o
  - todas las sedes con al menos una capacidad operativa activa.
- En la ficha de una sede mostrar sus capacidades:
  - solicita,
  - despacha,
  - recibe,
  - vende,
  - produce,
  - almacena.
- Si `can_request_remissions = true`, mostrar **Áreas que pueden solicitar** para esa sede.
- Si `can_request_remissions = false`, mostrar mensaje: `Esta sede no solicita remisiones.`
- Si el usuario desmarca todas las áreas, guardar `mode = custom` y cero reglas, o `mode = disabled` si el usuario elige deshabilitar.
- No volver automáticamente al global.
- Mover global a **Avanzado - Fallback global**, colapsado con `<details>`.

### Regla de resolución de áreas

```ts
if (mode === "disabled") {
  effectiveAreaKinds = [];
} else if (mode === "custom") {
  effectiveAreaKinds = siteRulesForPurpose;
} else {
  effectiveAreaKinds = globalAreaKinds;
}
```

Importante:

```txt
custom + [] significa ninguna área habilitada.
No debe interpretarse como volver al global.
```

## 6.3 Productos por sede

Ubicar el archivo que renderiza los textos exactos:

```txt
LOC de producción local
Remisión hacia esta sede
```

Búsqueda recomendada:

```bash
grep -R "LOC de produccion local\|LOC de producción local\|Remision hacia esta sede\|Remisión hacia esta sede" src
```

Ese es el componente crítico para corregir ahora mientras se dejan productos bien.

### La UI por sede dentro del producto debe separar estos bloques

1. **Disponibilidad en sede**
   - Disponible en esta sede.
   - Stock mínimo de referencia.

2. **Venta**
   - Solo si la sede tiene `can_sell = true`.
   - Si el flujo de venta todavía no está listo, dejar preparado pero no bloquear.

3. **Remisión hacia esta sede**
   - Solo si la sede tiene `can_request_remissions = true`.
   - Debe usar `remission_enabled` y `area_kinds`.

4. **Áreas que pueden solicitar**
   - Cargar áreas reales de esa sede, no una lista global.
   - Permitir varias.
   - La primera puede ser `default_area_kind`.

5. **Producción local**
   - Solo si la sede tiene `can_produce = true`.
   - Campo `local_production_enabled` por producto/sede.

6. **LOC de producción local**
   - Solo visible si `can_produce = true` y `local_production_enabled = true`.
   - Cargar LOCs reales de la misma sede.

### Caso obligatorio: Saudo

Saudo puede producir.

Si Saudo tiene:

```txt
can_produce = true
```

y tiene LOCs/áreas reales de producción, el selector **LOC de producción local** debe mostrar opciones de Saudo.

No debe depender de:

```txt
site_type = production_center
```

ni de:

```txt
site_type = satellite
```

ni del nombre de la sede.

### Pseudológica para LOC de producción local

```ts
const canProduceHere = capabilitiesBySiteId[site.id]?.can_produce === true;
const localProductionEnabled =
  productSiteSetting.local_production_enabled === true;

const productionLocOptions = canProduceHere
  ? inventoryLocations
      .filter((loc) => loc.site_id === site.id)
      .filter((loc) => loc.is_active !== false)
      // Si existen kinds/roles de LOC, filtrar por producción.
      // Si no existen, mostrar LOCs activos de la sede para no ocultar opciones válidas.
  : [];

const showProductionLocationSelect =
  canProduceHere && localProductionEnabled;
```

## 6.4 Remisiones - página principal

Archivo actual:

```txt
src/app/inventory/remissions/page.tsx
```

Ajustes requeridos:

- Eliminar cualquier botón duplicado para conectar/desconectar inventario.
- El único switch vive en:

```txt
/inventory/settings/remissions
```

- Derivar `canCreate` desde:

```txt
can_request_remissions + permiso
```

no desde:

```txt
viewMode === "satélite"
```

- Derivar orígenes disponibles desde:

```txt
site_supply_routes + fulfillment_site.can_fulfill_remissions = true
```

- Eliminar fallback que busca:

```ts
.eq("site_type", "production_center")
```

cuando no hay rutas.

- En lugar del fallback, mostrar alerta:

```txt
No hay rutas de abastecimiento configuradas para esta sede.
```

- Derivar vista bodega/preparación desde `can_fulfill_remissions`, no desde `site_type = production_center`.
- Mostrar estado inventario conectado/desconectado solo lectura con link a configuración.

## 6.5 Remisiones - detalle y acciones

Archivos:

```txt
src/app/inventory/remissions/[id]/page.tsx
src/app/inventory/remissions/[id]/detail-actions.ts
```

Mantener el candado de inventario ya trabajado.

Si:

```txt
remissions.inventory_posting_enabled = false
```

no ejecutar movimientos reales.

### Reglas obligatorias

Con switch apagado:

- No ejecutar `apply_restock_shipment`.
- No ejecutar `apply_restock_receipt`.
- No ejecutar `consume_inventory_stock_by_uom_profile`.
- No ejecutar `upsert_inventory_stock_by_location`.
- No exigir LOC de origen.
- No validar disponibilidad contra stock.
- Sí validar coherencia mínima:
  - preparado >= 0,
  - enviado >= 0,
  - preparado <= solicitado,
  - enviado <= solicitado,
  - enviado <= preparado.
- No permitir pasar a tránsito si ninguna línea tiene cantidad preparada/enviada.

---

## 7. Hardcodes a buscar y eliminar

Codex debe buscar estos patrones y reemplazarlos por capacidades o helpers compartidos.

No todos los usos de `site_type` deben borrarse: algunos pueden quedar como etiqueta visual. Lo que se elimina es su uso como regla de negocio.

| Búsqueda | Problema | Reemplazo esperado |
|---|---|---|
| `site_type === "production_center"` | Asume que todo centro produce/despacha y que solo centros lo hacen. | `capabilities.can_fulfill_remissions` o `can_produce` según contexto. |
| `site_type === "satellite"` | Asume que todo satélite solicita/recibe y nunca produce. | `can_request_remissions`, `can_receive_remissions`, `can_produce`. |
| `.eq("site_type", "production_center")` | Fallback hardcodeado de origen de remisiones. | Rutas de abastecimiento + `can_fulfill_remissions`. |
| `use_for_remission` como única fuente | Global se muestra como verdad para todas las sedes. | `site_purpose_settings` + `site_area_purpose_rules`. |
| `LOC de producción local` | Puede estar filtrando por `site_type`, nombre o area kind incompleto. | `inventory_locations` / `areas` por `site_id` + `can_produce`. |
| `Remisión hacia esta sede` | Puede mezclar producto disponible, solicitud y producción local. | Separar `remission_enabled`, `local_production_enabled`, `production_location_id`. |
| `Centro de Producción` | Nombre fijo que puede romper expansión. | Usar labels de sede, no como condición. |

---

## 8. Reglas de UI definitivas

La UI nunca debe hacer parecer que una sede está mal configurada cuando simplemente una capacidad no aplica.

Si una capacidad no está activa, mostrar **No aplica** o esconder el bloque correspondiente.

| Situación | UI correcta | UI incorrecta |
|---|---|---|
| Sede sin `can_produce` | Ocultar Producción local o mostrar No aplica. | Mostrar LOC de producción local como Sin definir. |
| Sede con `can_produce` y sin LOCs | Mostrar alerta: Esta sede produce, pero no tiene LOCs activos. | Ocultar silenciosamente opciones. |
| Sede con `can_request_remissions = false` | Mostrar: Esta sede no solicita remisiones. | Mostrar áreas solicitantes. |
| Sede con `mode = custom` y cero áreas | Mostrar: Sin áreas habilitadas para remisión. | Volver al global. |
| Sede comercial sin capacidades | No aparece en remisiones/productos operativos. | Aparece por estar activa. |
| Inventario desconectado | Remisiones operan como solicitudes/alistamientos. | Exigir LOC/stock. |

---

## 9. Plan de implementación recomendado

### Fase 0: inspección obligatoria

1. Revisar estado de `vento-nexo` y `vento-shell`.
2. Inspeccionar migraciones recientes en `vento-shell`.
3. Inspeccionar schema real de tablas implicadas.
4. Buscar usos actuales de `site_type`, `production_center`, `satellite`, `LOC de producción local` y `Remisión hacia esta sede`.
5. Identificar si ya existen helpers o columnas equivalentes.

### Fase 1: base de datos en `vento-shell`

1. Crear migración `site_operational_capabilities` en `vento-shell`.
2. Ejecutar backfill inicial no destructivo.
3. Crear migración `site_purpose_settings` en `vento-shell`.
4. Agregar columnas faltantes a `product_site_settings` desde `vento-shell`.
5. Verificar RLS, tipos, constraints y datos resultantes.

### Fase 2: helpers y lectura en `vento-nexo`

1. Crear helper `src/lib/inventory/site-capabilities.ts`.
2. Crear o consolidar helper `src/lib/inventory/remission-runtime-settings.ts`.
3. Usar defaults seguros cuando falte una fila de capacidades, sin volver a inferir negocio por `site_type`.

### Fase 3: UI de configuración

1. Actualizar pantalla de sedes para editar capacidades operativas.
2. Actualizar pantalla de configuración de remisiones:
   - switch maestro arriba,
   - configuración por sede,
   - global solo avanzado,
   - sin fallback silencioso al global.

### Fase 4: productos por sede

1. Localizar componente de producto por sede con `LOC de producción local` y `Remisión hacia esta sede`.
2. Separar disponibilidad, remisión, venta y producción local.
3. Corregir LOC de producción local para que cargue LOCs/áreas de la sede seleccionada, incluyendo Saudo.

### Fase 5: remisiones

1. Actualizar `remissions/page.tsx` para usar capacidades y rutas, eliminando fallback `production_center`.
2. Actualizar detalle/acciones de remisión para mantener switch de inventario y coherencia operativa.
3. Agregar pruebas manuales y, si el proyecto tiene test runner, pruebas unitarias para helpers.

---

## 10. Prompt operativo para Codex

Usar este bloque como instrucción principal de ejecución.

```txt
Implementa en vento-nexo una arquitectura de capacidades operativas por sede para eliminar hardcodes de production_center/satellite en productos y remisiones.

Reglas de repositorio:
- Crear y correr migraciones solo desde vento-shell.
- En vento-nexo hacer únicamente cambios de UI, helpers y lógica de aplicación.
- Inspeccionar schema real antes de escribir SQL. No asumir tipos ni políticas RLS.
- Si ya existen columnas/helpers equivalentes, reutilizarlos.
- No levantar servidor dev salvo pedido explícito.
- Si se toca aspecto visual en vento-nexo, correr npm run audit:i18n.

Objetivo:
- Cada sede debe poder marcar si solicita remisiones, despacha remisiones, recibe remisiones, vende, produce, almacena inventario o es negocio comercial.
- site_type queda solo como clasificación visual/legacy. No debe decidir flujos operativos.
- Los productos por sede deben separar: disponible, venta, solicitud por remisión, áreas solicitantes, producción local y LOC de producción local.
- Saudo puede producir: si tiene can_produce=true y LOCs/áreas reales, debe mostrar opciones en LOC de producción local.
- Las remisiones deben usar capacidades + site_supply_routes, no fallback a site_type='production_center'.
- El switch remissions.inventory_posting_enabled debe seguir siendo único y vivir en configuración. Con switch apagado no debe mover inventario.

Tareas:
1. Inspeccionar vento-shell y vento-nexo antes de editar.
2. En vento-shell, crear migración site_operational_capabilities si no existe equivalente.
3. En vento-shell, crear migración site_purpose_settings para distinguir inherit_global/custom/disabled si no existe equivalente.
4. En vento-shell, agregar columnas faltantes a product_site_settings: local_production_enabled, production_location_id, sales_enabled, inventory_enabled si no existen.
5. En vento-nexo, crear src/lib/inventory/site-capabilities.ts.
6. En vento-nexo, crear src/lib/inventory/remission-runtime-settings.ts o reutilizar helper equivalente.
7. Actualizar src/app/inventory/settings/sites/page.tsx para editar capacidades operativas por sede.
8. Actualizar src/app/inventory/settings/remissions/page.tsx: switch maestro arriba, configuración por sede, global solo avanzado, sin fallback silencioso al global cuando una sede queda con cero áreas.
9. Localizar el componente con textos "LOC de producción local" y "Remisión hacia esta sede". Separar remisión de producción local. LOC de producción local solo visible si la sede puede producir y el producto tiene local_production_enabled=true.
10. Actualizar src/app/inventory/remissions/page.tsx: orígenes por rutas + can_fulfill_remissions, destinos por can_request_remissions/can_receive_remissions, sin fallback a production_center.
11. Revisar src/app/inventory/remissions/[id]/page.tsx y detail-actions.ts para mantener switch de inventario y no exigir LOC con switch apagado.

No hacer:
- No borrar áreas existentes.
- No renombrar áreas existentes.
- No hardcodear Saudo, Vento Café ni Centro de Producción.
- No ocultar una sede por site_type si tiene capacidades activas.
- No volver automáticamente al global cuando una sede tiene configuración custom vacía.

Definition of done:
- Saudo, si can_produce=true y tiene LOCs/áreas, muestra LOC de producción local.
- Vento Café mantiene sus opciones correctas.
- Un nuevo centro/bodega puede despachar remisiones solo configurando capacidades y rutas.
- Una sede comercial no aparece en remisiones si no tiene capacidades de remisión.
- Con remissions.inventory_posting_enabled=false, una remisión completa no crea inventory_movements.
- No quedan reglas de negocio basadas exclusivamente en site_type.
```

---

## 11. Checklist de pruebas manuales

## 11.1 Configuración de sedes

- Marcar Saudo con:
  - `can_request_remissions = true`,
  - `can_receive_remissions = true`,
  - `can_produce = true`,
  - `can_hold_inventory = true`.
- Marcar Centro de Producción con:
  - `can_fulfill_remissions = true`,
  - `can_produce = true`,
  - `can_hold_inventory = true`.
- Marcar un negocio comercial con:
  - `is_commercial_business = true`,
  - sin capacidades de remisión.
- Confirmar que ese negocio comercial no aparece en remisiones.
- Crear una sede nueva tipo bodega/centro.
- Marcar `can_fulfill_remissions = true`.
- Confirmar que puede aparecer como origen si se crea ruta.

## 11.2 Productos por sede

- Abrir un producto y revisar Saudo.
- Deben verse bloques separados para:
  - disponibilidad,
  - remisión,
  - producción local.
- Si Saudo tiene `can_produce = true`, activar Producción local para ese producto.
- Confirmar que **LOC de producción local** muestra LOCs/áreas de Saudo.
- Confirmar que Vento Café sigue mostrando Barra/Cocina si esas son sus áreas reales.
- Confirmar que una sede sin `can_produce` no muestra LOC de producción local como error.
- Confirmar que una sede con `can_request_remissions = false` no muestra áreas solicitantes como si aplicaran.

## 11.3 Remisiones

- Con switch de inventario apagado, crear remisión, preparar, despachar y recibir.
- Verificar que no se crean filas en `inventory_movements` para esa remisión.
- Con switch apagado, confirmar que no exige LOC de origen ni bloquea por stock.
- Con switch encendido, confirmar que vuelve a validar stock/LOC y ejecutar movimientos.
- Confirmar que no hay fallback automático a Centro de Producción si faltan rutas.
- Si faltan rutas, debe mostrar alerta para configurar rutas.

### SQL de verificación

```sql
select *
from public.inventory_movements
where related_restock_request_id = '<REQUEST_ID_DE_PRUEBA>';
```

Resultado esperado con switch apagado:

```txt
cero filas
```

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper flujos actuales de remisión | Hacer backfill inicial y mantener helpers con defaults seguros. Probar con switch apagado primero. |
| Ocultar sedes que sí operan | Filtrar por capacidades, no por `site_type`. Si una sede tiene cualquier capacidad activa, puede aparecer donde corresponda. |
| Confundir cero áreas con global | Usar `site_purpose_settings.mode`. `custom + []` o `disabled` no deben volver al global. |
| Saudo sin LOC local aunque produce | Cargar LOCs por `site_id` y `can_produce`; no depender de `production_center`. |
| Negocios mezclados en remisiones | `is_commercial_business` los excluye salvo que tengan capacidades de remisión activas. |
| Duplicar settings de inventario | Un único switch en `/inventory/settings/remissions` usando `app_runtime_settings`. Páginas operativas solo leen. |

---

## 13. Archivos conocidos y búsquedas requeridas

| Archivo / búsqueda | Acción esperada |
|---|---|
| `src/app/inventory/settings/sites/page.tsx` | Agregar edición de capacidades por sede. |
| `src/app/inventory/settings/remissions/page.tsx` | Switch maestro, configuración por sede, global avanzado. |
| `src/app/inventory/remissions/page.tsx` | Usar capacidades + rutas; eliminar fallback `production_center` y botón duplicado. |
| `src/app/inventory/remissions/[id]/page.tsx` | Alinear UI del detalle con switch y capacidades. |
| `src/app/inventory/remissions/[id]/detail-actions.ts` | Mantener candados de inventario y validaciones operativas. |
| `src/components/vento/remissions-create-form.tsx` | Recibir `inventoryPostingEnabled` y no mostrar stock si switch apagado. |
| `src/components/vento/remissions-items.tsx` | No bloquear por stock; solo mostrar referencia si se recibe. |
| `grep: LOC de producción local` | Encontrar componente de productos por sede y corregir producción local. |
| `grep: Remisión hacia esta sede` | Encontrar componente de productos por sede y separar remisión/producción. |
| `grep: production_center / satellite` | Reemplazar reglas de negocio por capacidades cuando aplique. |

---

## 14. Lo que queda fuera de este cambio

No incluir en esta implementación:

- Rediseño completo de recetas.
- Exigir que todos los productos tengan fotos antes de operar.
- Obligar a configurar QRs/LOCs perfectos para usar remisiones operativas con inventario desconectado.
- Convertir negocios comerciales en sedes operativas salvo que se les activen capacidades.
- Borrar o reemplazar `site_type` todavía.

Primero se desactiva su uso como regla de negocio.

---

## Cierre

Este cambio permite dejar productos bien ahora y evita reconstruir el sistema cuando Vento agregue otro centro de producción, bodega, sede híbrida o negocio con reglas especiales.

El objetivo no es meter más configuración por meter configuración. El objetivo es que cada sede tenga capacidades explícitas y que productos/remisiones lean esas capacidades, sin hardcodes, sin asumir que solo Centro produce o despacha, y sin impedir que Saudo produzca localmente.
