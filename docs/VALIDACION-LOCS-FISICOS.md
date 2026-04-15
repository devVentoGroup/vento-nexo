# Validación de LOCs contra Espacios Físicos
**Propósito:** Asegurar que cada LOC en la BD corresponda exactamente a un espacio real en los almacenes.

---

## 1. VARIABLES CRÍTICAS DE UN LOC

Todo LOC válido debe tener estos atributos **verificables en la realidad**:

### 1.1 Identidad y Ubicación
| Variable | Definición | Validación | Razón Crítica |
|----------|-----------|-----------|--------------|
| **code** | Código único (ej: REC-01, PROD-01) | Debe estar **físicamente impreso** en la ubicación | Sin código visible, operarios no saben cuál es |
| **site_id** | Centro (Centro, Vento Café, Saudo, Molka) | Confirmar que el almacén existe y está operativo | Envío a sitio inexistente = pérdida de mercancía |
| **physical_location** | Descripción: "Recepción - Piso 1", "Bodega Secos - Estante A" | Debe ser **identificable visualmente** sin plano | Si un operario entra, ¿sabe llegar allá? |
| **zone_code** | Zona (ej: REC, PROD, SECOS, FRIO, DESP) | Debe estar **demarcada físicamente** (color, señal) | Separación lógica debe ser visible |

### 1.2 Dimensiones y Capacidad
| Variable | Definición | Validación | Razón Crítica |
|----------|-----------|-----------|--------------|
| **capacity_units** | Cantidad máxima de unidades que caben | **Medir y contar realmente** (ej: 50 cajas) | Sobrecarga = daño, desorden, riesgo |
| **capacity_weight_kg** | Peso máximo soportado | Verificar **límites estructurales** (estante, piso) | Riesgo de colapso si sobrecarga |
| **dimension_length_cm** | Largo del espacio | **Medir con cinta métrica** | Planificación de layout futuro |
| **dimension_width_cm** | Ancho | Medir | Planificación de layout |
| **dimension_height_cm** | Alto | Medir | ¿Entra un pallet? ¿Altura de estante? |

### 1.3 Características Físicas
| Variable | Definición | Validación | Razón Crítica |
|----------|-----------|-----------|--------------|
| **environment_type** | Tipo (AMBIENT, SECOS, FRIO, CONGELADO) | Verificar **temperatura actual** con termómetro | Productos se dañan si no están en env. correcto |
| **shelving_type** | Tipo (FLOOR, PALLET_RACK, WALL_RACK, BIN) | Describir **qué hay realmente allí** | Afecta cómo se distribuye la mercancía |
| **surface_condition** | Condición (CLEAN, DUSTY, WET, DAMAGED) | Inspección visual | Afecta preservación de productos |
| **accessibility** | Acceso (EASY, RESTRICTED, HAZARD) | Verificar si hay obstáculos | Operarios necesitan acceso rápido |

### 1.4 Conexiones Operativas
| Variable | Definición | Validación | Razón Crítica |
|----------|-----------|-----------|--------------|
| **adjacent_locs** | LOCs vecinos | Verificar **mapa físico del almacén** | Traslados, movimientos cercanos |
| **entry_point** | Acceso a almacén desde REC-01 | Confirmar ruta disponible | Flujo de recepción debe ser lógico |
| **equipment_available** | Montacargas, escaleras, carretillas | Listado de herramientas **presentes** | Operarios necesitan equipo para acceder |

---

## 2. LÓGICA DE VALIDACIÓN (PASO A PASO)

### **Fase A: Auditoría en Almacén (In Situ)**

**Equipo necesario:**
- Cinta métrica (5m+)
- Termómetro (para frío/congelado)
- Fotógrafo/documento
- Plano del almacén (o papel para dibujar)
- Checklist (esta plantilla)

**Proceso:**

```
Para CADA LOC en la BD:

1. ¿EXISTE FÍSICAMENTE?
   ☐ Sitio correcto (Centro, Vento Café, etc.)
   ☐ Ubicación encontrada sin dudas (piso, zona)
   ☐ Código impreso visible (o listo para pegar)
   
   Si NO → ELIMINAR o REUBICAR en BD

2. ¿IDENTIDAD CORRECTA?
   ☐ Nombre coincide con descripción real
   ☐ Zona demarcada físicamente
   ☐ Acceso sin obstáculos
   
   Si NO → RENOMBRAR o REMARCAR en físico

3. ¿CAPACIDAD REALISTA?
   ☐ Medir largo, ancho, alto (cm)
   ☐ Contar: ¿cuántas cajas estándar caben?
   ☐ Verificar peso máximo del estante
   ☐ Dejar 10% vacío para manipuleo
   
   Si CAPACIDAD EN BD > CAPACIDAD REAL → CORREGIR EN BD

4. ¿AMBIENTE CORRECTO?
   ☐ Temperatura actual (termómetro)
   ☐ ¿Hay corriente de aire, humedad, luz?
   ☐ ¿Es seguro para productos perecederos?
   
   Si AMBIENTE EN BD ≠ REALIDAD → CAMBIAR TIPO o REUBICACIÓN

5. ¿EQUIPAMIENTO DISPONIBLE?
   ☐ ¿Se puede acceder con carretilla?
   ☐ ¿Hay estantes, pallets, pisos?
   ☐ ¿Necesita escalera?
   
   Si EQUIPO FALTA → PROBLEMA OPERATIVO → SOLUCIÓN

6. ¿FLUJO LÓGICO?
   ☐ REC-01 tiene acceso desde puerta
   ☐ LOCs de producción cerca de REC
   ☐ Almacenaje lejos de entrada
   
   Si FLUJO INEFICIENTE → REPLANTEAR LAYOUT
```

---

## 3. MATRIZ DE VALIDACIÓN (PLANTILLA DE AUDITORÍA)

```
SITIO: ____________    FECHA: ____________    AUDITOR: ____________

┌─────────────────────────────────────────────────────────────────┐
│ LOC: __________ | NOMBRE: _________________ | ZONA: ___________│
├─────────────────────────────────────────────────────────────────┤

IDENTIDAD
  ☐ Código impreso/visible         Si/No    Foto: ___
  ☐ Ubicación inequívoca           Si/No    Descripción: ___
  ☐ Acceso sin obstáculos          Si/No    Restricciones: ___
  
DIMENSIONES (medir con cinta)
  Largo: _____ cm   Ancho: _____ cm   Alto: _____ cm
  ☐ Medidas coinciden con BD       Si/No    Varianza: ±__%
  
CAPACIDAD
  Cajas estándar que caben: _____
  Peso máximo (estante/piso): _____ kg
  ☐ Capacidad actual = BD          Si/No    Ajustar a: _____
  
AMBIENTE
  Tipo actual: ☐ AMBIENT ☐ SECOS ☐ FRIO ☐ CONG
  Temperatura: _____ °C
  Humedad: _____ %
  ☐ Ambiente coincide con BD       Si/No    Tipo correcto: _____
  
EQUIPAMIENTO
  ☐ Pallet disponible              Si/No
  ☐ Estante/Rack disponible        Si/No
  ☐ Acceso con carretilla          Si/No    Restricción: ___
  ☐ Escalera/Elevador si necesario Si/No
  
FLUJO OPERATIVO
  Distancia a REC-01: _____ pasos
  LOCs cercanos: ________________
  ☐ Flujo lógico respecto a operación Si/No
  
PROBLEMAS ENCONTRADOS
  ________________________
  ________________________
  ________________________
  
ACCIÓN REQUERIDA
  ☐ Corrección en BD
  ☐ Corrección en Físico (pintar código, remarcar zona)
  ☐ Reubicación del LOC
  ☐ Eliminación (no necesario)
  ☐ Equipamiento requerido: _______

FOTOS ADJUNTAS
  ☐ Frente del LOC
  ☐ Código visible
  ☐ Capacidad (foto de estimación)
  
REVISADO POR (Jefe Operaciones): ____________  FECHA: ____________
```

---

## 4. ARGUMENTOS CLAVE POR CADA VALIDACIÓN

### **¿Por qué validar CÓDIGO IMPRESO?**
- Si el operario no ve un código, no sabe cuál es el LOC
- El QR scanner es inútil sin código físico
- Genera errores de entrada (puteo en LOC equivocado)

### **¿Por qué validar DIMENSIONES?**
- Capacidad en BD puede ser mentira
- Sobrecarga = daño de productos y riesgo de colapso
- Planificación futura (ej: ¿entra un pallet?)

### **¿Por qué validar AMBIENTE?**
- Producto frío en AMBIENT = descomposición
- Producto AMBIENT en FRIO = congelación y daño
- Validación es crítica para trazabilidad

### **¿Por qué validar ACCESIBILIDAD?**
- LOC inaccesible = operarios pierden tiempo
- Aumenta riesgo de accidentes
- Requiere equipo especial (montacargas, escalera)

### **¿Por qué validar FLUJO?**
- REC-01 lejos de puerta = ineficiencia
- PROD-01 lejos de REC = tiempo perdido
- Layout irracional causa errores

---

## 5. DECISIONES CRÍTICAS DURANTE VALIDACIÓN

| Situación | Decisión | Razón |
|-----------|----------|-------|
| LOC existe pero código no está impreso | IMPRIMIR y PEGAR código ahora | Sin código = imposible operación |
| Capacidad BD > capacidad física real | BAJAR capacidad en BD | Prevenir sobrecarga |
| LOC muy lejos de flujo lógico | REUBICAR en BD o MOVER físicamente | Eficiencia operativa |
| Ambiente no coincide (frío en AMBIENT) | MOVER LOC a zona FRIO o CAMBIAR tipo | Riesgo de pérdida de mercancía |
| LOC no tiene acceso con carretilla | MARCAR como RESTRICTED en BD | Operarios sabrán que necesitan escalera |
| LOC no existe físicamente | ELIMINAR de BD | No gastar tiempo buscando |

---

## 6. PLAN DE VALIDACIÓN POR SITIO

### **Centro (10 LOCs)**
Prioridad: **REC-01, PROD-01, DESP-01, BOD-MAIN** (flujo principal)

**Tiempo estimado:** 3-4 horas (incluye mediciones y fotos)

### **Vento Café, Saudo, Molka (3 LOCs cada uno)**
Prioridad: **REC-01, STO-01** (recepción y almacenaje básico)

**Tiempo estimado:** 1-2 horas por sitio

**TOTAL ESTIMADO:** 8-10 horas de auditoría

---

## 7. CRITERIOS DE "VALIDACIÓN APROBADA"

Un LOC pasa validación si:

✅ **Identidad:**
- Código físico visible o listo para imprimir
- Ubicación inequívoca (sin dudas de dónde está)

✅ **Capacidad:**
- Coincide con realidad (±10%)
- Tiene espacio para manipuleo (no 100% lleno)

✅ **Ambiente:**
- Tipo coincide con condiciones (frío = frío, etc.)
- Temperatura estable (±2°C)

✅ **Accesibilidad:**
- Operarios pueden entrar sin riesgo
- Equipo necesario disponible

✅ **Flujo:**
- Ubicación lógica respecto a operación
- No interfiere con otras áreas

---

## 8. PLANTILLA DE REPORTE FINAL

**REPORTE DE VALIDACIÓN - NEXO FASE 1**

| LOC | Sitio | Estado | Acciones | Fecha | Responsable |
|-----|-------|--------|----------|-------|-------------|
| REC-01 | Centro | ✅ VALIDADO | Imprimir código | 15/04 | Juan |
| PROD-01 | Centro | ⚠️ AJUSTES | Bajar capacidad: 100→50 | 15/04 | Juan |
| SECOS-MAIN | Centro | ❌ FALLA | NO EXISTE → ELIMINAR | 15/04 | Juan |
| ... | ... | ... | ... | ... | ... |

**Resumen:**
- Validados: 16/19 (84%)
- Con ajustes: 2/19 (11%)
- Eliminados: 1/19 (5%)

**GO-LIVE LISTO:** Sí ☐ / No ☐

---

## 9. PRÓXIMOS PASOS DESPUÉS DE VALIDACIÓN

1. **Actualizar BD** con capacidades reales, dimensiones exactas
2. **Imprimir y pegar códigos** en todos los LOCs
3. **Crear signalización** (zonas demarcadas, colores, áreas restringidas)
4. **Entrenar operarios** en ubicaciones y flujo
5. **Dar visto bueno** operacional antes de GO-LIVE
