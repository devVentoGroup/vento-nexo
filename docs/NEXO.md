1) Procesos logísticos de punta a punta (CP + satélites)
A. Gobierno del dato (lo que hace que todo lo demás funcione)
Proceso: Gestión de “maestros” (Master Data)
•	Qué incluye: Productos/SKUs, unidades de medida (UOM), presentaciones (caja, bolsa, bandeja), proveedores, ubicaciones/áreas, rutas, satélites, usuarios/roles, reglas (par stock, ABC, ventanas).
•	Estandarizar: nomenclaturas, unidades, categorías, reglas de calidad (caducidad, temperatura), criterios de criticidad (ABC).
•	Digitalizar: catálogos con historial de cambios, vigencia, aprobaciones.
•	Automatizar: validaciones (no permitir cantidades sin unidad), conversiones (1 caja = 12 unidades), alertas por caducidad/rotación.
•	Control: auditoría de cambios (quién cambió un SKU, qué unidad, cuándo).
Pantallas: Catálogo (SKUs), Unidades/Conversiones, Proveedores, Satélites, Zonas/Áreas, Roles & Permisos, Reglas (ABC/PAR).
________________________________________
B. Abastecimiento (Procurement) y planificación
Proceso: Plan de compra / reposición
•	Estandarizar: calendario de compras, mínimos/máximos, lead times, criterios de urgencia.
•	Digitalizar: solicitudes internas de compra, órdenes de compra (PO), recepción contra PO.
•	Automatizar: sugerencias de compra por consumo histórico, alertas “bajo mínimo”, aprobación escalonada.
•	Control: diferencias precio/factura, recepción parcial, backorders.
Pantallas: Planificador (recomendaciones), Solicitudes de compra, Órdenes de compra, Proveedores, Historial de precios.
________________________________________
C. Inbound (Recepción de proveedores)
Proceso: Recepción, verificación, cuarentena
•	Estandarizar: “qué se revisa”: cantidad, temperatura, fecha vencimiento, integridad, lote, documentos.
•	Digitalizar: documento de recepción con líneas (SKU, cantidad, lote/exp, temperatura, fotos, observaciones), estado (pendiente → verificado → cerrado).
•	Automatizar: reglas de calidad (si temp fuera de rango → cuarentena), diferencias vs PO, alertas a compras/finanzas.
•	Control: trazabilidad por lote, rechazos, notas de crédito.
Pantallas: Nueva Recepción, Recepciones (bandeja), Detalle de recepción, Cuarentena/No conformidades.
________________________________________
D. Put-away (Almacenamiento inicial)
Proceso: “Dónde queda” lo recibido
•	Estandarizar: método de ubicación (zonas por familia: seco/frío/congelado), prioridad FIFO/FEFO (por vencimiento).
•	Digitalizar: movimiento de recepción → almacenamiento (sin exigir micro-ubicación al inicio; puede ser por área).
•	Automatizar: sugerencia de ubicación, bloqueo de zonas por temperatura, alerta “recepción sin guardar > X horas”.
•	Control: responsable del put-away, SLA interno.
Pantallas: Tareas de Put-away, Sugerencias de ubicación, Movimientos.
________________________________________
E. Almacenamiento y control de stock (Warehouse control)
Proceso: Gestión del inventario disponible
•	Estandarizar: estructura de stock (por SKU, lote, unidad, “contenedor” como LPN), reglas de rotación FEFO.
•	Digitalizar: existencias por área/satélite, stock disponible vs reservado, historial (ledger).
•	Automatizar: alertas por vencimiento, stock negativo, diferencias, inventario “en tránsito”.
•	Control: auditoría de ajustes, permisos para cambios.
Pantallas: Inventario (consulta), Kardex/Ledger, Alertas (vencimientos/bajo stock), Ajustes con motivo.
________________________________________
F. Reabastecimiento interno (CP → áreas internas)
Proceso: Entrega a cocina/panadería/producción (sin micro-consumo)
•	Estandarizar: ventanas de entrega, responsables, unidad de control (bandeja/saco/caja), mínimos por área (PAR).
•	Digitalizar: documento “Entrega interna” (request → pick → entrega → confirmación).
•	Automatizar: sugerencias de reposición por PAR, lista diaria por turnos, alertas de urgencias.
•	Control: quién pidió, quién entregó, quién recibió, cuánto.
Pantallas: Solicitudes internas, Entregas internas, Picking interno, Confirmación/Recepción interna.
________________________________________
G. Producción / transformación (si aplica a CP)
Proceso: Órdenes de producción, consumo y producto terminado
•	Estandarizar: recetas, rendimientos, mermas, lotes de producción.
•	Digitalizar: orden de producción, consumo teórico vs real, generación de lote terminado (LPN lote).
•	Automatizar: cálculo automático de insumos, FEFO, sugerencia de picking, etiquetas FIFO.
•	Control: costo teórico, merma, trazabilidad.
Pantallas: Recetas, Órdenes de producción, Consumo, Lotes terminados, Etiquetado.
________________________________________
H. Distribución a satélites (CP → satélites)
Proceso: Remisiones/transferencias, picking, packing, carga, despacho
•	Estandarizar: ventana de corte, prioridades, empaques, temperatura, rutas, SLA de llegada.
•	Digitalizar: documento “Transferencia/Remisión” con estados (draft → confirmado → preparado → cargado → en tránsito → recibido/disputado).
•	Automatizar: consolidación de pedidos por satélite, picking list por zonas (seco/frío/congelado), secuenciación de picking, checklist de carga.
•	Control: discrepancias al recibir, prueba de entrega (firma/foto), trazabilidad en tránsito.
Pantallas: Solicitudes satélite (opcional), Remisiones, Picking list, Packing, Carga/Despacho, Tracking, Recepción en satélite.
________________________________________
I. Recepción en satélites (Inbound interno)
Proceso: Confirmación de recibido y discrepancias
•	Estandarizar: criterios de aceptación, revisión por temperatura, registro de faltantes/daños.
•	Digitalizar: recepción contra remisión (confirmar líneas, marcar faltante/dañado, evidencia).
•	Automatizar: notificar CP, generar ajustes o reenvíos, actualizar stock satélite.
•	Control: métricas de OTIF (On-Time In-Full), causas de discrepancia.
Pantallas: Recepción de remisiones, Discrepancias, Stock satélite, Historial.
________________________________________
J. Devoluciones / logística inversa
Proceso: retornos, empaques retornables, producto vencido/dañado
•	Estandarizar: motivos (dañado, vencido, error picking), autorización, cuarentena.
•	Digitalizar: documento devolución, estados, resolución (reintegrar / desechar / crédito).
•	Automatizar: bloqueo automático del stock devuelto, alertas de calidad, trazabilidad.
•	Control: merma, responsabilidad, tendencias.
Pantallas: Devoluciones, Cuarentena, Disposición (reintegrar/desechar), Reporte merma.
________________________________________
K. Inventarios físicos (conteos)
Proceso: conteo cíclico, conteo total, auditorías
•	Estandarizar: calendario ABC (A frecuente, C menos), método (por área, por SKU), tolerancias.
•	Digitalizar: sesiones de conteo (iniciar → contar → reconciliar → aprobar).
•	Automatizar: selección de SKUs por riesgo/rotación, bloqueo temporal durante conteo, propuestas de ajuste.
•	Control: aprobación de ajustes, logs, KPI de precisión.
Pantallas: Conteos, Sesiones, Diferencias, Aprobaciones.
________________________________________
L. Control de calidad y cadena de frío
Proceso: cumplimiento sanitario/temperatura
•	Estandarizar: rangos de temperatura, registro en recepción/almacenamiento/transporte, manejo de no conformidades.
•	Digitalizar: logs de temperatura (manual o IoT), cuarentena, liberación.
•	Automatizar: alertas por fuera de rango, bloqueos de uso.
•	Control: trazabilidad ante incidentes.
Pantallas: Control de calidad, Temperaturas, No conformidades, Cuarentena.
________________________________________
M. Seguridad, permisos y auditoría
Proceso: quién puede hacer qué, y evidencia
•	Estandarizar: roles (bodega, cocina, despacho, satélite), umbrales de aprobación.
•	Digitalizar: RBAC, bitácoras, firma de entregas.
•	Automatizar: aprobaciones por monto/cantidad/ítem crítico.
•	Control: auditoría, reportes por usuario.
Pantallas: Usuarios, Roles, Permisos, Auditoría.
________________________________________
N. Analítica y desempeño (KPIs)
Proceso: indicadores operativos
•	Estandarizar: definiciones (OTIF, lead time, precisión inventario, merma, rotación).
•	Digitalizar: tableros con filtros por sede/satélite/categoría.
•	Automatizar: alertas y reportes diarios.
•	Control: seguimiento, planes de mejora.
Pantallas: Dashboard, Reportes, Alertas, Exportación.
________________________________________
2) Cómo estandarizar/digitalizar sin “matar” la operación (principio clave)
Para cada proceso, NEXO debe operar con 3 capas:
1.	Documento (la “verdad”): Recepción, Entrega interna, Remisión, Devolución, Conteo.
2.	Estados (flujo claro): draft → confirmado → ejecutado → cerrado (con variantes).
3.	Tareas (lo que ve el operador): “tienes 6 put-aways pendientes”, “tienes 3 remisiones por despachar”.
Esto hace que la app sea usable por operarios: no navegan “módulos”, ejecutan tareas.
________________________________________
3) Roles de trabajadores y qué verían/hacen
En CP
•	Recepción: crear recepciones, marcar discrepancias, enviar a put-away.
•	Bodeguero/Almacén: put-away, picking, entregas internas, conteos.
•	Despacho: preparar remisiones, packing, checklist de carga.
•	Calidad (si existe): cuarentena, liberación, control de temperaturas.
•	Jefe de operación: dashboard, aprobaciones, auditoría, ajustes.
•	Compras/Administración: proveedores, órdenes de compra, precios.
En satélites
•	Encargado: solicitudes, recepción de remisiones, discrepancias, stock local.
•	Cajero/operación (si aplica): ver stock disponible, solicitar reposición.
Transporte
•	Conductor: ver ruta, confirmar carga, proof-of-delivery (firma/foto), incidencias.
________________________________________
4) Esquema de pantallas NEXO (arquitectura completa y limpia)
Navegación principal (propuesta)
1.	Inicio
o	KPIs, alertas, tareas pendientes.
2.	Tareas
o	Put-away, picking, entregas internas, recepciones por cerrar, remisiones por despachar.
3.	Documentos
o	Recepciones
o	Entregas internas
o	Remisiones/Transferencias
o	Devoluciones
o	Conteos
4.	Inventario
o	Existencias (por sede/satélite)
o	Lotes/vencimientos
o	Ledger (historial)
o	Ajustes (con aprobación)
5.	Operación
o	Ventanas de entrega
o	Rutas/Despachos
o	Control de calidad / Temperaturas
6.	Maestros
o	Productos/SKUs
o	Unidades/Conversiones
o	Proveedores
o	Satélites
o	Reglas ABC/PAR
7.	Reportes
o	OTIF, mermas, rotación, precisión, tiempos de proceso.
8.	Configuración
o	Roles, permisos, auditoría, estaciones de impresión (más adelante).
Nota: LOC/LPN pueden existir técnicamente “debajo” como soporte, pero no gobiernan el UX. El UX gobierna por documentos y tareas.
________________________________________
5) Flujos “canónicos” (lo que toda empresa similar termina teniendo)
Aquí está el “mapa” de flujos que NEXO debe soportar, en versión simple:
1.	Compra → Recepción → Put-away → Disponible
2.	Solicitud interna → Picking → Entrega interna → Confirmación
3.	Solicitud satélite → Remisión → Picking → Packing → Carga → En tránsito → Recepción satélite
4.	Devolución → Cuarentena → Disposición (reintegrar/desechar/nota crédito)
5.	Conteo → Diferencia → Aprobación → Ajuste
6.	Calidad/temperatura → No conformidad → Bloqueo/Liberación

