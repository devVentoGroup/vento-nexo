# Simulación completa: flujo de remisiones

Guía paso a paso para simular el flujo **Solicitar → Preparar → Recibir** cambiando de rol y sede. Sirve para probar el flujo completo con un solo usuario (por ejemplo con override de rol) o con varias personas.

---

## Antes de empezar

- **Sedes típicas:** Centro de producción (bodega), Saudo, Vento Café.
- **Quién puede qué:**
  - **Satélite (Saudo / Vento Café):** solicitar remisión (origen = Centro, destino = mi sede) y recibir remisión.
  - **Centro (bodega):** preparar remisión (marcar cantidades, poner “En viaje”) — roles: bodeguero, gerente_general, propietario.
- **Para simular todo tú solo:** entra con un usuario que tenga **varias sedes** asignadas (ej. Centro + Saudo) y, si está disponible, usa **modo prueba / override de rol** (propietario o gerente_general) para no depender del rol por sede. Cambia la **sede activa** en el panel (selector “Sede activa”) según el paso.

---

## Paso 1 — Soy cajero/cocinero en Saudo: SOLICITAR REMISIÓN

**Objetivo:** Pedir insumos que vendrán del Centro a Saudo.

1. Entra a **NEXO** y asegúrate de estar con **sede activa = Saudo** (o Vento Café).
   - En el **Panel** (`/`), en “Sede activa” elige **Saudo** (o la sede satélite que uses).
2. Ve a **Remisiones** (menú o Panel → “Solicitar remisión” / “Remisiones”).
3. En la página de Remisiones:
   - Si ves el bloque **“Nueva solicitud”** o **“Solicitar remisión”**, perfecto.
   - **Origen (desde):** debe ser el **Centro de producción** (quien envía).
   - **Destino (hacia):** debe ser **Saudo** (tu sede).
4. Añade ítems:
   - Producto (ej. Harina, Aceite, etc.).
   - Cantidad solicitada.
   - Repite para varios ítems si quieres.
5. Opcional: notas.
6. Pulsa **“Enviar”** / **“Solicitar”**.
7. **Resultado esperado:** Te redirige al detalle de la remisión recién creada. Estado **Pendiente**. Anota el ID o déjalo abierto para el siguiente paso.

**Si no ves “Solicitar remisión”:** Comprueba que la sede activa sea la satélite (Saudo/Vento Café) y que tu rol tenga permiso `inventory.remissions.request`. En prueba, usa override a “cajero” o “cocinero” si tu usuario es de bodega.

---

## Paso 2 — Soy bodeguero en el Centro: PREPARAR REMISIÓN Y MARCAR “EN VÍAJE”

**Objetivo:** Preparar la solicitud en bodega y marcar que ya salió hacia Saudo.

1. Cambia la **sede activa** a **Centro de producción** (en el Panel, selector “Sede activa”).
2. Ve a **Remisiones** (o **Preparar remisiones** en el menú / panel).
3. Localiza la remisión que creaste (estado **Pendiente**), origen = Centro, destino = Saudo.
   - Puedes abrirla desde la lista o desde **Preparar remisiones** → botón “Preparar” en esa fila.
4. En el **detalle de la remisión**:
   - Revisa los ítems y el **stock disponible** (por sede o por LOC si se muestra).
   - En cada ítem, indica **cantidad preparada** (≤ disponible). Puedes preparar menos que lo solicitado (recepción parcial).
   - Pulsa **“Guardar ítems”** si aplica.
   - Luego **“En viaje”** (o el botón que pase la remisión a estado **En tránsito**).
5. **Resultado esperado:** La remisión pasa a estado **En tránsito**. El stock del Centro se descuenta según lo preparado (a nivel sede; por LOC si está implementado 2.2).

**Si no ves “Preparar” o “En viaje”:** La sede activa debe ser el Centro y tu rol debe poder preparar (bodeguero, gerente_general, propietario). Usa override de rol si estás en modo prueba.

---

## Paso 3 — Vuelvo a ser cajero/cocinero en Saudo: RECIBIR REMISIÓN

**Objetivo:** Registrar qué llegó a Saudo (cantidades recibidas y eventuales faltantes).

1. Cambia de nuevo la **sede activa** a **Saudo** (o la sede destino de la remisión).
2. Ve a **Remisiones** y abre la misma remisión (ahora **En tránsito**).
3. En el detalle:
   - Deberías ver el bloque para **recibir** (cantidad recibida por ítem, y opcionalmente faltante/shortage).
   - Indica **cantidad recibida** por cada ítem (puede ser menor que lo enviado).
   - Si hay faltante, indica **cantidad faltante** donde aplique.
   - Pulsa **“Recibir”** / **“Confirmar recepción”** (o el CTA que cierre la recepción).
4. **Resultado esperado:** La remisión pasa a **Recibida** (o **Parcial** si no se recibió todo). El stock en **Saudo** (solo por sede, sin LOCs) aumenta según las cantidades recibidas.

---

## Resumen del flujo (una sola persona)

| Paso | Rol / sede que simulas | Dónde estás en NEXO | Acción |
|------|------------------------|----------------------|--------|
| 1    | Cajero/cocinero en Saudo | Remisiones, sede = Saudo | Solicitar remisión (origen Centro → destino Saudo), ítems, Enviar. |
| 2    | Bodeguero en Centro      | Remisiones / Preparar, sede = Centro | Abrir remisión, cantidades preparadas, Guardar ítems, En viaje. |
| 3    | Cajero/cocinero en Saudo | Remisiones, sede = Saudo | Abrir remisión, cantidades recibidas (y faltantes si hay), Recibir. |

---

## Cambiar de sede y de rol (para la simulación)

- **Sede:** En el **Panel** (`/`), bloque “Sede activa” → desplegable → elige Centro, Saudo o Vento Café. En **Remisiones** a veces también se puede elegir sede; lo que cuenta para permisos es la sede activa del panel.
- **Rol (modo prueba):** Si tu usuario es propietario o gerente_general, en el Panel suele aparecer “Modo prueba” y puedes elegir otro rol (cajero, cocinero, bodeguero, etc.). Así simulas que en Saudo eres cajero y en Centro eres bodeguero sin cambiar de usuario.

---

## Errores frecuentes

- **No veo “Solicitar remisión”:** Sede activa debe ser satélite (Saudo/Vento Café). Rol con permiso de solicitar.
- **No veo “Preparar” / “En viaje”:** Sede activa = Centro. Rol bodeguero (o gerente/propietario).
- **No veo “Recibir”:** Sede activa = sede destino de la remisión (Saudo). Rol con permiso de recibir.
- **“No hay sede activa”:** El empleado debe tener al menos una sede en `employee_sites`; elegirla en el selector del Panel.

---

## Datos de prueba recomendados

- **Sedes:** Centro de producción, Saudo (y opcionalmente Vento Café).
- **Productos:** Varios con inventario en el Centro (para que “stock disponible” sea > 0 al preparar).
- **Rutas:** En `site_supply_routes`, que Saudo (y Vento Café) tengan como `fulfillment_site_id` el Centro, para que al solicitar desde Saudo el “origen” sea el Centro.

Con esto puedes hacer una **simulación completa** del flujo de remisiones cambiando solo de sede (y de rol en modo prueba) en cada paso.
