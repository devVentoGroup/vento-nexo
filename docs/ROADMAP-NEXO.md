# Roadmap NEXO

## Estado actual

NEXO queda congelado en una **v1 operativa** para inventario base y remisiones.

### Dentro de v1
- Catalogo de productos operativos.
- Sedes, rutas de abastecimiento y checklist de arranque.
- LOCs solo en `Centro`.
- Entradas manuales v1 para stock inicial y contingencias.
- Stock por sede y por LOC.
- Remisiones `Saudo <-> Centro` con preparacion y recepcion.
- Retiros, traslados, conteos, ajustes y movimientos.
- Alta rapida de productos y carga asistida con IA.

### Fuera de v1
- Produccion integrada.
- Consumo por receta.
- Recepcion operativa normal contra OC.
- Integracion real con `FOGO`.
- Integracion real con `ORIGO`.
- Segundo satelite (`Vento Cafe`) en el arranque.

## V1 cerrada

### Flujo oficial
1. Crear producto.
2. Habilitar producto por sede.
3. Crear LOCs del `Centro`.
4. Cargar stock inicial en `Centro`.
5. Contar y ajustar si aplica.
6. Solicitar remision desde `Saudo`.
7. Preparar en `Centro`.
8. Recibir en `Saudo`.

### Reglas operativas
- `Centro` es la unica sede con LOCs.
- `Saudo` opera stock solo por sede.
- `LPN` no bloquea el arranque.
- La produccion queda fuera del flujo diario de v1.
- Las compras completas quedan como continuidad futura.

## Seguimiento de implementacion

### Criterio UX transversal
- La meta de `NEXO` no es tener formularios tipo wizard por defecto.
- Crear y editar deben converger hacia una misma experiencia: formulario simple, completo y facil de entender para alguien nuevo.
- Regla de diseño:
  - una sola pantalla cuando sea posible;
  - secciones claras en vez de pasos ocultos;
  - contexto y ayuda visibles sin obligar a navegar por wizard;
  - crear y editar con estructura casi identica;
  - advanced/compatibilidad como apoyo, no como barrera.
- Esto aplica a catalogo, remisiones, entradas, traslados, ajustes, LOCs, conteo inicial y cualquier alta/edicion operativa.

### Bitacora 2026-03-11
- Sprint 1 ejecutado en UI principal: home y navegacion reorganizados por `Operar`, `Verificar`, `Configurar` y `Utilidades`.
- Sprint 2 en curso sobre catalogo maestro:
  - Listado partido en componentes de toolbar, filtros y resultados.
  - Alta y ficha reorientadas semanticamente a producto maestro + categoria operativa.
  - Campos compartidos de identidad y almacenamiento extraidos para `new` y `[id]`.
  - Ficha maestra `[id]` ya separada en bloques menores para resumen de costo, compra principal y disponibilidad por sede.
  - Bloques finales de foto, checklist y pie de guardado ya quedaron compartidos entre alta y ficha maestra cuando aplica.
- Remisiones reencuadradas sobre el flujo oficial `Solicitar -> Preparar -> Recibir`.
  - `/inventory/remissions` queda como hub del flujo.
  - `/inventory/remissions/prepare` queda como cola especializada de bodega, no como flujo paralelo.
  - El detalle de remision ya sabe volver a la cola de preparacion cuando entras desde ahi.
- Endurecimiento inicial de remisiones sobre el detalle:
  - Se conserva el contexto `from=prepare` al guardar items o cambiar estado.
  - Ya no se aceptan combinaciones incoherentes entre `preparado`, `enviado`, `recibido` y `faltante`.
  - El despacho ya no cae por defecto en `cantidad solicitada` cuando falta `enviado`; ahora se fuerza coherencia operativa antes de mover stock.
  - Hub y detalle ya comunican mejor quien debe actuar por rol/sede y dejan mas explicito el manejo de recepcion parcial.
  - El detalle ya muestra diagnostico por linea para LOC origen, stock en sede/LOC y conciliacion parcial antes de guardar.
  - En v1 `received` queda como estado terminal visible. `closed` se mantiene solo como compatibilidad de registros viejos y deja de ofrecerse como accion operativa.
  - La documentacion operativa y la guia inicial ya quedaron limpias respecto a esto; no hace falta abrir otro corte de v1 para perseguir `closed` a nivel UX.
  - La creacion de remisiones ya se alineo al patron de formulario unico: ruta, items, revision y confirmacion en una sola vista, con ayudas inline y mejor lectura para alguien nuevo.
  - El create ya muestra stock referencial de la sede origen por linea y en el resumen, sin mezclar preparacion ni LOCs dentro de la solicitud.
  - La frescura del stock referencial ya queda visible por linea (`timestamp + hace X min/h`), asi que este create no necesita convertirse en una vista de stock mas pesada.
  - La cola `prepare` ya anticipa senales por remision (`LOC pendiente`, `preparacion corta`, `faltante probable`, `sin LOC unico suficiente`) y el detalle ahora sugiere LOCs por linea y hace mas explicita la preparacion parcial.
  - El detalle ya permite `partir linea` como escape hatch de v1 cuando la sede tiene stock suficiente pero ningun LOC unico cubre toda la cantidad. Esto evita abrir todavia un modelo multi-LOC por linea solo para cerrar v1.
  - La migracion `20260311162000_nexo_remissions_split_item.sql` ya quedó promovida desde `vento-shell`, sincronizada al resto de repos y aplicada en remoto.
- `Entradas` ya salio del esquema wizard.
  - `entries-form.tsx` ahora opera como formulario unico con contexto, items, revision y confirmacion en una sola vista.
  - Queda como primer patron real para migrar create/edit hacia UX simple pero completa.
- `Traslados` ya salio del esquema wizard.
  - `transfers-form.tsx` ahora opera como formulario unico con origen, destino, items, revision y confirmacion en una sola vista.
  - Reutiliza el mismo criterio de `Entradas`: contexto visible, ayuda inline y cierre simple para alguien nuevo.
- `Ajustes` ya salio del esquema wizard.
  - `adjust-form.tsx` ahora opera como formulario unico con producto, diferencia, motivo, revision y confirmacion en una sola vista.
  - Se alinea con `Entradas` y `Traslados` para empezar a formar un patron consistente de create/edit operativo.
  - `inventory/adjust/page.tsx` ya no presenta la seleccion de sede como `Paso 1`, y si el usuario solo tiene una sede asignada entra directo a la vista correcta.
- `LOCs` ya salio del esquema wizard tanto en alta como en edicion.
  - `loc-create-form.tsx` y `loc-edit-form.tsx` ahora operan como formularios unicos con contexto visible, revision y confirmacion final.
  - Alta y edicion ya comparten mejor el mismo lenguaje visual y el mismo catalogo de zonas operativas.
  - `inventory/locations/page.tsx` ya separa mejor el modo alta del modo edicion para que no compitan en la misma pantalla.
- `Conteo inicial` ya salio del esquema wizard.
  - `count-initial-form.tsx` ahora opera como formulario unico con captura, resumen operativo y confirmacion final en la misma vista.
  - Queda alineado con el mismo patron de revision antes de guardar.
- `Produccion manual` ya salio del esquema wizard a nivel de componente.
  - `production-batch-form.tsx` ahora opera como formulario unico con contexto, lote, impacto y confirmacion final.
  - Aun asi, produccion integrada sigue fuera de v1 y no cambia su prioridad operativa.
- `Catalogo maestro` ya dejo de comunicarse como secuencia numerada.
  - `catalog/new` y `catalog/[id]` mantienen secciones claras, pero ya no se presentan como pasos obligatorios ni usan marcadores numerados.
  - La lectura del formulario ahora es de ficha continua: identidad, almacenamiento, compra, foto y disponibilidad por sede.

### Punto exacto alcanzado
- Catalogo maestro ya quedo estabilizado en su corte de particion principal para `page`, `new` y `[id]`.
- Remisiones ya quedaron alineadas semanticamente con la operacion v1 entre hub, cola de preparacion y detalle.
- La base remota ya tiene aplicada la migracion para `partir linea`; el siguiente cierre ya no es de desarrollo sino de corrida operativa real.
- Aun no esta completada la migracion global de formularios hacia UX simple + completa.
- Estado real de formularios:
  - `catalog/new` y `catalog/[id]`: ya reencuadrados como ficha continua, sin semantica de paso obligatoria.
  - `entries-form.tsx`: ya migrado a formulario unico sin wizard.
  - `transfers-form.tsx`: ya migrado a formulario unico sin wizard.
  - `adjust-form.tsx`: ya migrado a formulario unico sin wizard.
  - `loc-create-form.tsx` y `loc-edit-form.tsx`: ya migrados a formulario unico sin wizard y mas alineados entre create/edit.
  - `count-initial-form.tsx`: ya migrado a formulario unico sin wizard.
  - `production-batch-form.tsx`: ya migrado a formulario unico sin wizard, aunque el modulo siga fuera de v1.
  - `remissions`: hub, create y detalle ya reencuadrados al flujo oficial; la solicitud ya opera como formulario unico sin wizard.
  - Ya no quedan formularios operativos principales con wizard puro en el backlog revisado.
- Componentes nuevos usados para bajar complejidad:
  - `src/features/inventory/catalog/product-cost-status-panel.tsx`
  - `src/features/inventory/catalog/product-purchase-section.tsx`
  - `src/features/inventory/catalog/product-site-availability-section.tsx`
  - `src/features/inventory/catalog/product-uom-profile-panel.tsx`
  - `src/features/inventory/catalog/product-photo-section.tsx`
  - `src/features/inventory/catalog/product-checklist-panel.tsx`
  - `src/features/inventory/catalog/product-form-footer.tsx`

### Siguiente corte recomendado
- Ya no toca abrir otro frente de producto para v1 salvo que la corrida operativa encuentre un hueco real.
- Siguiente foco concreto: ejecutar la corrida `Centro + Saudo` con los 3 casos de `docs/SIMULACION-REMISIONES.md` y decidir con eso si `v1` queda cerrable.
- Backlog UX create/edit:
  - remisiones ya quedo dentro del patron simple + completo; los siguientes refinamientos UX deben concentrarse otra vez en preparacion y recepcion, no en agregar mas peso al create.
  - usar `entries-form.tsx`, `transfers-form.tsx`, `adjust-form.tsx`, `count-initial-form.tsx`, `production-batch-form.tsx` y los formularios de LOC como patron para los siguientes formularios create/edit.

## Backlog v2

### Integraciones
- Integracion real con `FOGO` para recetas, produccion y descuento automatico.
- Integracion real con `ORIGO` para ordenes de compra y recepcion contra OC.
- Integracion con `VISO` para seguimiento gerencial.

### Expansion operativa
- Salida de `Vento Cafe` como segundo satelite.
- Origen LOC por linea en remisiones como flujo endurecido.
- Lotes y vencimientos por item.
- Notas de incidencia por linea en entradas.

### Mejora de datos
- Costo automatico completo por receta y produccion.
- Plantillas masivas por proveedor y por sede.
- Validaciones mas estrictas de salud del catalogo.

## Criterio de salida

NEXO v1 se considera lista cuando:
- El checklist `Centro + Saudo` queda completo.
- Existe stock inicial en `Centro`.
- Hay productos activos para `Centro` y `Saudo`.
- Se completa una remision end-to-end sin depender de `FOGO`, `ORIGO` o `VISO`.
