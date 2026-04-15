# MATRIZ DE PERMISOS Y VISIBILIDAD - NEXO

## 1. ROLES Y NIVELES DE ACCESO

| Rol | Nivel | Descripción | Scope |
|-----|-------|-------------|-------|
| **Propietario** | 5 (Máximo) | Dueño y gerente general | Global (todas las sedes) |
| **Gerente General** | 5 (Máximo) | Gerencia global multi-sede | Global (todas las sedes) |
| **Gerente** | 3 (Gerencial) | Gerente de sede | Sede asignada |
| **Bodeguero** | 2 (Operativo) | Bodega e inventario | Sede asignada |
| **Conductor** | 2 (Operativo) | Transporte y remisiones | Sede asignada |
| **Otros** | 1 (Mínimo) | Resto de roles | Ninguno |

---

## 2. PERMISOS POR PÁGINA - NEXO INVENTORY

### **Página: `/inventory/warehouse` (Scanner QR operarios)**

| Rol | Acceso | Lectura | Escritura | Notas |
|-----|--------|---------|-----------|-------|
| Propietario | ✅ Sí | ✅ Sí | ✅ Sí | Ve todo, puede hacer todo |
| Gerente General | ✅ Sí | ✅ Sí | ✅ Sí | Ve todo, puede hacer todo |
| Gerente | ✅ Sí | ✅ Sí (su sede) | ✅ Sí (su sede) | Solo su sede |
| Bodeguero | ✅ Sí | ✅ Sí | ✅ Sí | Solo su sede |
| Conductor | ✅ Sí | ✅ Sí | ⚠️ Limitado | Solo remisiones |
| Otros | ❌ No | ❌ No | ❌ No | Sin acceso |

**Permiso requerido:** `nexo.access`

---

### **Página: `/inventory/validation/locs` (Checklist de validación)**

| Rol | Acceso | Lectura | Escritura | Ver Todas | Notas |
|-----|--------|---------|-----------|-----------|-------|
| Propietario | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí (global) | Ve y edita todo |
| Gerente General | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí (global) | Ve y edita todo |
| Gerente | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí (su sede) | Solo su sede |
| Bodeguero | ✅ Sí | ✅ Sí | ✅ Sí | ⚠️ Solo suyas | Crea pero ve todas |
| Conductor | ❌ No | ❌ No | ❌ No | ❌ No | Sin acceso |
| Otros | ❌ No | ❌ No | ❌ No | ❌ No | Sin acceso |

**Permiso requerido:** `nexo.inventory.validation`

---

### **Página: `/inventory/stock` (Vista de stock)**

| Rol | Acceso | Lectura | Escritura |
|-----|--------|---------|-----------|
| Propietario | ✅ Sí | ✅ Sí | ⚠️ No |
| Gerente General | ✅ Sí | ✅ Sí | ⚠️ No |
| Gerente | ✅ Sí | ✅ Sí (su sede) | ⚠️ No |
| Bodeguero | ✅ Sí | ✅ Sí | ⚠️ No |
| Conductor | ✅ Sí | ✅ Sí | ❌ No |
| Otros | ❌ No | ❌ No | ❌ No |

**Permiso requerido:** `nexo.inventory.stock`

---

### **Página: `/inventory/locations` (Gestión de LOCs)**

| Rol | Acceso | Lectura | Crear | Editar | Eliminar |
|-----|--------|---------|-------|--------|----------|
| Propietario | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Gerente General | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Gerente | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ⚠️ Con auditoría |
| Bodeguero | ✅ Sí | ✅ Sí | ❌ No | ❌ No | ❌ No |
| Conductor | ✅ Sí | ✅ Sí | ❌ No | ❌ No | ❌ No |
| Otros | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

**Permiso requerido:** `nexo.inventory.locations`

---

### **Página: `/inventory/remissions` (Remisiones internas)**

| Rol | Acceso | Lectura | Crear | Aprobar | Archivar |
|-----|--------|---------|-------|---------|----------|
| Propietario | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Gerente General | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Gerente | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Bodeguero | ✅ Sí | ✅ Sí | ✅ Sí | ❌ No | ❌ No |
| Conductor | ✅ Sí | ✅ Sí | ⚠️ Limitado | ⚠️ Limitado | ❌ No |
| Otros | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

**Permiso requerido:** `nexo.inventory.remissions`

---

### **Página: `/inventory/counts` (Conteos y ajustes)**

| Rol | Acceso | Lectura | Crear | Ejecutar | Ajustar |
|-----|--------|---------|-------|----------|---------|
| Propietario | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Gerente General | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Gerente | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí |
| Bodeguero | ✅ Sí | ✅ Sí | ✅ Sí | ✅ Sí | ⚠️ Hasta $1000 |
| Conductor | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| Otros | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |

**Permiso requerido:** `nexo.inventory.counts`, `nexo.inventory.adjustments`

---

## 3. MATRIZ DE VISIBILIDAD DE DATOS

### **Por Sede (Site Scope)**

| Rol | Centro | Vento Café | Saudo | Molka |
|-----|--------|-----------|-------|-------|
| Propietario | ✅ Todo | ✅ Todo | ✅ Todo | ✅ Todo |
| Gerente General | ✅ Todo | ✅ Todo | ✅ Todo | ✅ Todo |
| Gerente (Centro) | ✅ Todo | ❌ No | ❌ No | ❌ No |
| Gerente (Vento Café) | ❌ No | ✅ Todo | ❌ No | ❌ No |
| Bodeguero (Centro) | ✅ Su sede | ❌ No | ❌ No | ❌ No |
| Bodeguero (Vento Café) | ❌ No | ✅ Su sede | ❌ No | ❌ No |
| Conductor | ✅ Datos de remisión | ✅ Datos de remisión | ✅ Datos de remisión | ✅ Datos de remisión |

---

## 4. FLUJO DE VALIDACIÓN DE LOCs

### **Actores y Responsabilidades**

```
OPERARIO (bodeguero)
  │
  ├─→ Accede a `/inventory/warehouse`
  │   └─→ Escanea LOC
  │       └─→ Ve contenido, solicita traslado, devuelve producto
  │
GERENTE o BODEGUERO LÍDER
  │
  ├─→ Accede a `/inventory/validation/locs`
  │   ├─→ CREA validación
  │   │   └─→ Audita LOC (física)
  │   │       ├─→ Verifica código
  │   │       ├─→ Mide dimensiones
  │   │       ├─→ Prueba capacidad
  │   │       ├─→ Toma fotos
  │   │       └─→ Registra problemas
  │   │
  │   └─→ COMPLETA validación
  │       ├─→ Marca como "VALIDADO" o "REQUIERE ACCIONES"
  │       └─→ Sistema envía alerta a gerente
  │
GERENTE
  │
  ├─→ Revisa validaciones de su sede
  │   ├─→ VE todas las validaciones de `locations_validation`
  │   ├─→ FILTRA por estado (pending, validated, failed)
  │   └─→ APRUEBA o RECHAZA
  │
PROPIETARIO
  │
  ├─→ Dashboard global
  │   ├─→ VE validaciones de todas las sedes
  │   ├─→ REPORTES por sitio
  │   └─→ EXPORTA datos de auditoría
```

---

## 5. TABLA DE PERMISOS EN BASE DE DATOS

```sql
-- Tabla: role_permissions
INSERT INTO role_permissions (role, permission_id, scope_type) VALUES
  -- Propietario: acceso global a TODO
  ('propietario', <inventory.validation_id>, 'global'),
  ('propietario', <inventory.stock_id>, 'global'),
  ('propietario', <inventory.locations_id>, 'global'),
  ('propietario', <inventory.remissions_id>, 'global'),
  ('propietario', <inventory.counts_id>, 'global'),
  ('propietario', <inventory.adjustments_id>, 'global'),
  
  -- Gerente General: acceso global a TODO
  ('gerente_general', <inventory.validation_id>, 'global'),
  ('gerente_general', <inventory.stock_id>, 'global'),
  ('gerente_general', <inventory.locations_id>, 'global'),
  ('gerente_general', <inventory.remissions_id>, 'global'),
  ('gerente_general', <inventory.counts_id>, 'global'),
  ('gerente_general', <inventory.adjustments_id>, 'global'),
  
  -- Gerente: acceso a su sede
  ('gerente', <inventory.validation_id>, 'site'),
  ('gerente', <inventory.stock_id>, 'site'),
  ('gerente', <inventory.locations_id>, 'site'),
  ('gerente', <inventory.remissions_id>, 'site'),
  ('gerente', <inventory.counts_id>, 'site'),
  ('gerente', <inventory.adjustments_id>, 'site'),
  
  -- Bodeguero: acceso a su sede, solo lectura en algunas
  ('bodeguero', <inventory.validation_id>, 'site'),
  ('bodeguero', <inventory.stock_id>, 'site'),
  ('bodeguero', <inventory.locations_id>, 'site'),
  ('bodeguero', <inventory.remissions_id>, 'site'),
  ('bodeguero', <inventory.counts_id>, 'site'),
  ('bodeguero', <inventory.adjustments_id>, 'site'),
  
  -- Conductor: solo remisiones
  ('conductor', <inventory.remissions_id>, 'site'),
  ('conductor', <inventory.stock_id>, 'site');
```

---

## 6. IMPLEMENTACIÓN EN NEXTJS

### **Protección de Página**

```typescript
// /inventory/validation/locs/page.tsx
import { requireAppAccess } from "@/lib/auth/guard";
import { checkPermission } from "@/lib/auth/permissions";

export default async function ValidationPage() {
  // Requiere login en NEXO
  const { supabase, user } = await requireAppAccess({
    appId: "nexo",
    returnTo: "/inventory/validation/locs",
  });
  
  // Requiere permiso específico: inventory.validation
  const hasAccess = await checkPermission(
    supabase,
    "nexo",
    "inventory.validation"
  );
  
  if (!hasAccess) {
    redirect("/no-access");
  }
  
  // Renderizar formulario...
}
```

### **Filtrado de Datos por Sede**

```typescript
// Cliente: visto solo de su sede
const { data: validations } = await supabase
  .from("locations_validation")
  .select("*")
  .eq("site_id", userSiteId)  // ← Filtra por sede del usuario
  .order("created_at", { ascending: false });
```

---

## 7. CHECKLIST DE VISIBILIDAD

✅ **Propietario/Gerente General:**
- [ ] Ve todas las sedes
- [ ] Ve todas las validaciones
- [ ] Puede crear, editar, eliminar
- [ ] Acceso a `/inventory/validation/locs`
- [ ] Acceso a reportes globales

✅ **Gerente (por sede):**
- [ ] Ve solo su sede
- [ ] Ve validaciones de su sede
- [ ] Puede crear y editar en su sede
- [ ] Acceso a `/inventory/validation/locs`
- [ ] Acceso a reportes de su sede

✅ **Bodeguero (por sede):**
- [ ] Ve solo su sede
- [ ] Ve validaciones de su sede
- [ ] Puede crear validaciones
- [ ] Acceso a `/inventory/warehouse`
- [ ] Acceso a `/inventory/validation/locs` (solo lectura de creadas)

❌ **Conductor:**
- [ ] No accede a `/inventory/validation/locs`
- [ ] Acceso solo a remisiones en `/inventory/warehouse`

❌ **Otros roles:**
- [ ] Sin acceso a ninguna página de validación

---

## 8. VARIABLES DE CONTROL

En el componente de validación:

```typescript
// Determinar qué puede hacer el usuario
const canCreate = hasPermission("inventory.validation");
const canEdit = canCreate && (isManager || isOwner || isAuditor);
const canApprove = isManager || isOwner;
const canDelete = isOwner;
const canViewAll = isOwner || isManagerGeneral;
const visibleSites = isOwner 
  ? allSites 
  : userSites;  // Solo su sede
```

---

## 9. ROLLOUT SEGURO

**Fase 1:** Deploy con validación visible solo a propietario/gerente
**Fase 2:** Agregar bodeguero con permiso de crear
**Fase 3:** Agregar reportería para gerentes por sede
**Fase 4:** Integrar con Día 3+ auditoría en trazabilidad
