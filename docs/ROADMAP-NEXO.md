# Roadmap NEXO (Checklist completo)

## Leyenda
- ⬜ Pendiente  - 🟡 En progreso  - 🟢 Listo

## Fase 0 — Alineacion y reglas del juego (1-2 dias)
- ⬜ Definir objetivo: NEXO = fuente de verdad de inventario (ledger + documentos)
- ⬜ Definir alcance MVP (que entra ahora, que se pospone)
- ⬜ Definir sedes: Centro Produccion + satelites (IDs y nombres oficiales)
- ⬜ Definir roles y responsabilidades operativas
  - Recepcion proveedores
  - Bodega/put-away
  - Cocina/panaderia (solicita/recibe)
  - Despacho/remisiones
  - Satelite (recibe y disputa)
  - Admin/owner
- ⬜ Definir glosario operativo (SLA, custodia, staging, ABC, PAR, FEFO/FIFO)
- ⬜ Definir politicas: quien puede ajustar, quien aprueba, que requiere evidencia

**Listo cuando:** hay reglas y owners por proceso (aunque sea provisional).

## Fase 1 — Base tecnica y seguridad (2-5 dias)

**1.1 Autenticacion y autorizacion**
- ⬜ Login estable (staff)
- 🟢 Login principal en vento-shell (SSO); NEXO redirige si no hay sesion
- 🟢 Si esta autenticado y no tiene permisos: pagina "No tienes permisos" + boton Volver al Hub
- 🟡 Permisos por app/vista desde BD (roles/apps/permissions + scopes)
- ⬜ Roles (owner/global_manager/manager/cashier o equivalentes)
- ⬜ RLS consistente para tablas criticas:
  - products (ya)
  - inventory_movements
  - inventory_stock_by_site
  - procurement_receptions / items
  - restock_requests / items
  - transfers/shipments (cuando existan)
- ⬜ Auditoria minima: created_by, created_at en documentos/movimientos

**Listo cuando:** un usuario no autorizado no puede ver ni escribir inventario.

**1.2 Higiene de datos (catalogo)**
- ⬜ Insumos con SKU: 563 / 563 con SKU (0 sin SKU)
- ⬜ Corregir incoherencias de product_type en policies (ej. sale vs venta)
- ⬜ Validar product_inventory_profiles cubre todos los insumos
  - 0 insumos sin perfil (o plan para completar perfiles)

**Listo cuando:** catalogo no bloquea inventario.

## Fase 2 — Inventario Core (MVP operativo) (5-10 dias)

Esto desbloquea control de todo aunque aun no existan LPN/LOC perfectos.

**🟡 2.1 Ledger de movimientos (Inventory Movements) — la verdad**
- ⬜ Definir catalogo de tipos de movimiento (estandar):
  - receipt (entrada por proveedor)
  - issue_internal (salida a cocina/panaderia)
  - transfer_out / transfer_in (CP -> satelite)
  - adjustment (ajuste manual controlado)
  - count (conteo que genera ajuste)
  - waste/shrink (merma/perdida)
- ⬜ Regla: toda operacion de stock escribe movimiento con motivo y relacion a documento
- ⬜ Guardrails:
  - evitar duplicidad de conteos por sesion
  - cuantizacion de quantity (decimales consistentes)
  - notas obligatorias en adjustment

**Listo cuando:** puedes reconstruir stock desde movimientos.

**2.2 Stock por sede (Inventory Stock by Site) — vista operativa**
- ⬜ Definir si se mantiene:
  - derivado por trigger / function, o
  - recalculado por job/manual (al inicio puede ser manual)
- ⬜ Vista/endpoint de consulta rapido por SKU, sede, categoria
- ⬜ Alertas basicas:
  - stock negativo
  - bajo minimo (si existe PAR)
  - vencimiento (si manejas lotes)

**Listo cuando:** hay pantalla de stock confiable para operar.

**2.3 Pantallas core**
- ⬜ Inventario > Stock (filtros, busqueda, export basico)
- ⬜ Inventario > Movimientos (filtros por fecha, sede, tipo, SKU)
- ⬜ Inventario > Ajuste (con motivo, permisos, evidencia opcional)
- ⬜ Inventario > Conteo inicial (wizard por sede; genera sesion y movimientos)
- ⬜ Conteos > Historial (sesiones, diferencias, aprobacion si aplica)

**Listo cuando:** puedes iniciar control desde cero sin Excel/Epsilon.

## Fase 3 — Recepcion de proveedores (Inbound) (7-14 dias)

**3.1 Documento de recepcion**
- ⬜ Recepciones > Nueva:
  - proveedor, factura, fecha/hora
  - lineas: SKU + cantidad + unidad + costo (si aplica) + lote/exp (si aplica)
  - estado: draft -> verificado -> cerrado
- ⬜ Manejo de discrepancias:
  - faltante/danado -> cuarentena
- ⬜ Al cerrar:
  - crea movimientos receipt
  - actualiza stock

**3.2 Operacion real (staging + SLA)**
- ⬜ Bandeja "pendiente de guardar" (put-away pendiente)
- ⬜ SLA: recepcion cerrada -> guardada antes de X horas

**Listo cuando:** todo lo que entra queda registrado y disponible.

## Fase 4 — Entregas internas (CP -> cocina/panaderia/produccion) (7-14 dias)
- ⬜ Maestros: destinos internos (cocina, panaderia, reposteria, frio, etc.)
- ⬜ Entregas internas > Nueva:
  - responsable entrega / recibe
  - lineas SKU + cantidad (en unidades controlables)
  - motivo (reposicion / urgencia)
- ⬜ Al confirmar:
  - crea movimientos issue_internal
- ⬜ Ventanas de entrega:
  - agenda por turnos
  - urgencias registradas

**Listo cuando:** desaparece el "sacan y ya" al menos para bodega.

## Fase 5 — Transferencias y remisiones a satelites (2-4 semanas)

**5.1 Solicitud y preparacion**
- ⬜ Solicitudes satelite (opcional al inicio; puede arrancar manual)
- �YY� Remisiones MVP (crear -> preparar -> en viaje -> recibir -> faltantes)
- ⬜ Transferencias > Nueva:
  - destino (satelite)
  - lineas solicitadas
  - estado: draft -> aprobado -> picking -> packed -> despachado -> recibido
- ⬜ Picking list (por zonas: seco/frio/congelado)

**5.2 Despacho y recepcion**
- ⬜ Confirmacion de carga (quien, hora, checklist)
- ⬜ Recepcion en satelite:
  - confirmar lineas
  - discrepancias (faltante/danado)
- ⬜ Movimientos:
  - transfer_out en CP
  - transfer_in en satelite (al recibir)
  - manejo de disputa (ajuste controlado)

**Listo cuando:** las remisiones dejan de ser WhatsApp/papel.

## Fase 6 — LPN/LOC (contenedores/ubicaciones) como mejora de trazabilidad (2-6 semanas)

Importante: esto es potente, pero no debe bloquear el core.

- ⬜ Definir modelo minimo:
  - LOC = ubicacion fisica (area/zona/nivel/pasillo)
  - LPN = contenedor (caja/canasta/pallet)
- ⬜ Pantallas:
  - LOC list + create
  - LPN list + create
  - Put-away: asignar LPN -> LOC
  - Contenido por LPN (SKU + qty)
- ⬜ Integrar con movimientos:
  - movimientos pueden referenciar lpn_id / from_loc / to_loc si existe
- ⬜ Impresion Zebra operacion:
  - Jobs persistentes
- �YY� Etiquetas produccion (lote + expiracion)
  - plantillas finales ZPL
  - Print Station estable

**Listo cuando:** trazas fisicamente donde esta cada contenedor.

## Fase 7 — Conteos ciclicos y auditoria (continuo)
- ⬜ ABC operativo:
  - A: diario/semanal
  - B: quincenal
  - C: mensual
- ⬜ Sesiones de conteo por area/LOC/LPN
- ⬜ Reconciliacion y aprobacion de ajustes
- ⬜ Reporte de precision inventario

**Listo cuando:** reduces merma/fugas sostenidamente.

## Fase 8 — Costeo y compras (si quieres reemplazar parte de Epsilon) (4-8 semanas)
- ⬜ Captura de costo unitario en recepciones
- ⬜ Historial de costos por proveedor
- ⬜ Valorizacion de inventario (promedio ponderado o FIFO contable, segun decidan)
- ⬜ Ordenes de compra (PO) y recepciones contra PO
- ⬜ Recomendaciones de compra (PAR + consumo)

**Listo cuando:** compras vuelve a ser controlable y auditable.

## Fase 9 — Produccion/recetas (FOGO) integrado (posterior)
- ⬜ Recetas y rendimientos
- ⬜ Ordenes de produccion
- ⬜ Consumo automatico (ledger) + creacion de lote terminado
- ⬜ Etiquetas FIFO/FEFO y trazabilidad por lote

## Modulos transversales (aplican en todas las fases)
- ⬜ UI Kit NEXO (consistencia visual): layout, cards, tables, filters, toasts, empty states
- ⬜ Observabilidad: logs de errores en API, auditoria de acciones
- ⬜ Permisos y aprobaciones: ajustes/mermas requieren rol o aprobacion
- ⬜ Exportaciones: CSV de stock, movimientos, recepciones, transferencias
- ⬜ SOPs (procedimientos): recepcion, salida interna, remisiones, conteos

## Prioridad recomendada (para que esto se vuelva real rapido)
Si tu urgencia es control ya, el orden de implementacion mas efectivo es:
1) Fase 2 (Inventario Core)
2) Fase 3 (Recepciones)
3) Fase 4 (Entregas internas)
4) Fase 5 (Transferencias satelites)
5) Fase 6 (LPN/LOC + Zebra)

