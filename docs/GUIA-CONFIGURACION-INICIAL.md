# Guía de configuración inicial – Inventario y remisiones

Guía paso a paso para dejar todo listo: insumos, sedes, stock inicial y flujo de remisiones. Sin pasos de más.

---

## 1. Modelo mental: quién tiene qué

```
CENTRO DE PRODUCCIÓN (bodega)
├── LOCs (ubicaciones: Bodega, Cuarto frío, etc.)
├── Stock por LOC (cuánto hay en cada ubicación)
├── Recibe compras de proveedor (entradas)
├── Prepara remisiones hacia satélites
└── Hace conteos y ajustes

SAUDO (satélite)
├── Stock por sede (sin LOCs)
├── Solicita remisiones al Centro
└── Recibe remisiones (sube su stock)

VENTO CAFÉ (satélite)
├── Igual que Saudo
└── Independiente de Saudo
```

Regla importante: el Centro es la bodega que abastece a los satélites. Los satélites no compran directo; piden remisiones al Centro.

---

## 2. Orden de configuración (en qué orden hacer las cosas)

| Paso | Qué hacer | Dónde |
|------|-----------|-------|
| 1 | Sedes creadas (Centro, Saudo, Vento Café) | Supabase / Shell |
| 2 | Rutas de abastecimiento (Saudo→Centro, Vento→Centro) | Supabase / Shell |
| 3 | Insumos en el catálogo (con tipo correcto) | NEXO → Catálogo → Insumos |
| 4 | Configurar por sede: qué insumos usa cada sede | NEXO → Catálogo → ficha del insumo → Sedes |
| 5 | LOCs en el Centro (Bodega, Cuarto frío, etc.) | NEXO → Ubicaciones |
| 6 | Entrada inicial en el Centro (stock que ya tienes) | NEXO → Entradas |
| 7 | Conteo inicial (opcional, para cuadrar) | NEXO → Conteo inicial |
| 8 | Solicitar / Preparar / Recibir remisiones | NEXO → Remisiones |

---

## 3. Paso a paso concreto

### 3.1 Sedes y rutas

- **Sedes:** Centro de producción, Saudo, Vento Café (ya deben existir). Ver listado en **Configuración → Sedes**.
- **Rutas:** Cada satélite debe tener al Centro como quien le abastece.
  - **Configuración → Rutas de abastecimiento** (pantalla en NEXO).
  - Añadir: Solicitante = Saudo (o Vento Café), Abastecedor = Centro.

### 3.2 Insumos en el catálogo

1. Ir a **Catálogo** → pestaña **Insumos**.
2. Crear o revisar insumos: Harina, Aceite, etc.
3. En cada insumo:
   - **Tipo:** Insumo
   - **Tipo de inventario:** Insumo (ingredient) o Empaque (packaging), según corresponda.
   - Si es activo (abrelatas, muebles), ponerlo en pestaña **Equipos y activos** y tipo inventario **Activo**.

### 3.3 Configuración por sede (qué insumo va a cada sede)

En la ficha del insumo, sección **"Distribución y venta interna"**:

- **Saudo:** añadir fila con Sede = Saudo, Activo ✓.
- **Vento Café:** añadir fila con Sede = Vento Café, Activo ✓ (si aplica).
- **Centro:** añadir fila con Sede = Centro, Activo ✓.

Si no configuras esto, en Remisiones el insumo puede no aparecer (o aparecer todo, según configuración actual). Lo seguro es configurarlo por sede.

**Acelerar para muchos insumos:** si tienes muchos, se puede preparar un script SQL que inserte en `product_site_settings` para todos los insumos activos en Saudo, Vento y Centro.

### 3.4 LOCs en el Centro

1. Ir a **Ubicaciones**.
2. Crear LOCs del Centro: Bodega, Cuarto frío, Congelación, Secos, etc.
3. Los satélites no tienen LOCs; solo stock por sede.

### 3.5 Entrada inicial (stock que ya tienes en el Centro)

1. Ir a **Entradas**.
2. Crear una entrada nueva (origen = proveedor o manual).
3. Elegir sede = **Centro**.
4. Cargar insumos con las cantidades reales que ya tienes.
5. Asignar cada ítem a un LOC (ej. Harina → Bodega).
6. Confirmar entrada.

Con esto el Centro ya tiene stock.

### 3.6 Conteo inicial (opcional)

Si quieres cuadrar con lo que realmente hay en bodega:

1. Ir a **Conteo inicial**.
2. Crear sesión de conteo.
3. Contar por LOC y registrar diferencias.
4. Aprobar ajustes para que el stock quede correcto.

### 3.7 Remisiones (flujo normal)

1. **Saudo solicita:** Remisiones → Sede activa = Saudo → Crear remisión → Origen = Centro, Destino = Saudo → Agregar insumos y cantidades → Enviar.
2. **Centro prepara:** Sede activa = Centro → Abrir la remisión → Marcar cantidades preparadas → En viaje.
3. **Saudo recibe:** Sede activa = Saudo → Abrir la remisión → Marcar cantidades recibidas → Recibir.

El stock del Centro baja; el de Saudo sube.

---

## 4. Resumen rápido

| Pregunta | Respuesta |
|----------|-----------|
| ¿Dónde configuro insumos? | Catálogo → Insumos |
| ¿Dónde indico qué insumo va a Saudo? | Ficha del insumo → Sedes (product_site_settings) |
| ¿Dónde pongo el stock que ya tengo? | Entradas (Centro) |
| ¿Dónde cuadro el inventario físico? | Conteo inicial |
| ¿Cómo pide Saudo insumos al Centro? | Remisiones → Solicitar remisión |

---

## 5. Script para configurar insumos por sede en masa

Si tienes muchos insumos y quieres activar Saudo, Vento y Centro para todos:

```sql
-- 1. Obtén los IDs de tus sedes:
--    SELECT id, name FROM sites;

-- 2. Para cada sede (ej. Saudo), ejecuta:
INSERT INTO product_site_settings (product_id, site_id, is_active)
SELECT p.id, 'UUID-DE-SAUDO-AQUI', true
FROM products p
WHERE p.product_type = 'insumo'
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM product_site_settings pss
    WHERE pss.product_id = p.id AND pss.site_id = 'UUID-DE-SAUDO-AQUI'
  );

-- Repite para Centro y Vento Café cambiando el UUID.
```

---

## 6. Diagrama del flujo

```
[Catálogo] ── Insumos definidos
     │
     ├── [Ficha] ── Sedes: Centro ✓, Saudo ✓, Vento ✓
     │
[Centro] ── LOCs creados
     │
[Entradas] ── Stock inicial cargado en Centro
     │
[Conteo] ── (opcional) Ajustar a inventario real
     │
[Remisiones]
     │
     ├── Saudo solicita → Centro prepara → Saudo recibe
     └── Vento solicita → Centro prepara → Vento recibe
```

---

*Última actualización: Guía de configuración inicial.*
