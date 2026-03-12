# Simulación completa: flujo de remisiones

Guía paso a paso para simular el flujo **Solicitar → Preparar → Recibir** cambiando de rol y sede. Sirve para probar el flujo completo con un solo usuario (por ejemplo con override de rol) o con varias personas.

## Checklist rapido de ejecucion

Usa este bloque como hoja corta de corrida. Marca cada punto al terminarlo.

### Caso A. Remision normal

- [ ] Crear remision desde `Saudo` hacia `Centro`.
- [ ] Preparar completo en `Centro`.
- [ ] Marcar `En viaje`.
- [ ] Recibir completo en `Saudo`.
- [ ] Confirmar estado final `Recibida`.
- [ ] Confirmar stock correcto en `/inventory/stock`.
- [ ] Confirmar movimientos correctos en `/inventory/movements`.

### Caso B. Remision con `partir linea`

- [ ] Crear remision con una cantidad que la sede tiene, pero ningun `LOC` unico cubre.
- [ ] Abrir detalle en `Centro`.
- [ ] Usar `Partir linea`.
- [ ] Asignar un `LOC` distinto por cada linea.
- [ ] Marcar `En viaje`.
- [ ] Recibir completo en `Saudo`.
- [ ] Confirmar estado final `Recibida`.
- [ ] Confirmar descuento correcto por `LOC`.

### Caso C. Remision con recepcion parcial

- [ ] Crear remision normal.
- [ ] Preparar y enviar desde `Centro`.
- [ ] Recibir incompleto en `Saudo`.
- [ ] Registrar faltante.
- [ ] Guardar como `Parcial`.
- [ ] Confirmar mensajes de parcial/faltante.
- [ ] Completar conciliacion final si aplica.
- [ ] Confirmar cierre final en `Recibida`.

### Cierre de v1

- [ ] Los 3 casos se ejecutaron sin depender de `FOGO`, `ORIGO` o `VISO`.
- [ ] No aparecio un bloqueo real que obligue modelo multi-LOC por linea.
- [ ] Si hubo hallazgos, quedaron anotados con pantalla, paso y mensaje exacto.

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

---

## Corrida de cierre v1

Esta es la corrida minima que define si `NEXO v1` ya esta cerrable para operacion `Centro + Saudo`.

### Caso A. Remision normal

1. Solicita una remision desde `Saudo` con 2 o 3 productos que el `Centro` tenga disponibles.
2. En `Centro`, prepara cantidades completas y marca `En viaje`.
3. En `Saudo`, recibe todo completo.

**Debe terminar así:**
- remision en `Recibida`;
- descuento correcto en stock del `Centro`;
- aumento correcto en stock de `Saudo`;
- sin mensajes incoherentes en detalle ni hub.

### Caso B. Remision con `partir linea`

1. Usa un producto cuya cantidad total exista en la sede `Centro`, pero repartida en mas de un `LOC`.
2. Solicita una cantidad que ningun `LOC` individual cubra por si solo.
3. En `Centro`, abre el detalle y usa `Partir linea`.
4. Asigna un `LOC` distinto por cada linea resultante.
5. Marca `En viaje`.
6. En `Saudo`, recibe completo.

**Debe terminar así:**
- la accion `Partir linea` crea una segunda linea sin romper la remision;
- cada linea acepta su propio `LOC origen`;
- el envio y la recepcion completan sin bloquearse por `LOC insuficiente`;
- el stock por `LOC` baja segun cada linea.

### Caso C. Remision con recepcion parcial

1. Solicita una remision normal.
2. En `Centro`, prepara y envia todo.
3. En `Saudo`, registra recepcion incompleta y faltante en al menos una linea.
4. Guarda como `Parcial`.

**Debe terminar así:**
- remision en `Parcial`;
- mensaje claro de lineas pendientes y faltantes;
- no se permite cerrar como recepcion completa mientras falte conciliacion;
- si luego completas la conciliacion, debe terminar en `Recibida`.

### Evidencia minima para cerrar v1

- Captura o nota del estado final de cada caso.
- Confirmacion visual de stock en `/inventory/stock`.
- Confirmacion visual de movimientos en `/inventory/movements`.
- Confirmacion de que el flujo se pudo hacer sin depender de `FOGO`, `ORIGO` o `VISO`.
