# Plan Maestro de Validacion NEXO ORIGO FOGO

Fecha: 2026-04-21  
Estado: Borrador operativo ejecutable  
Objetivo: validar de punta a punta permisos, pantallas, maestros, flujos, errores y evidencia antes de go-live operativo.

## 1. Principio de trabajo

No se prueba "pantalla por pantalla" sin contexto.  
Se prueba por capas:

1. Acceso y permisos
2. Maestros y configuracion
3. Flujos felices por modulo
4. Flujos de error y borde
5. End-to-end entre apps
6. Evidencia y auditoria final

Cada caso debe dejar:
- resultado esperado
- resultado real
- evidencia
- decision: `ok`, `fail`, `blocked`

## 2. Alcance

### NEXO
- ubicaciones LOC
- QR y landing de ubicacion
- contenido por LOC
- retiros
- stock
- movimientos
- remisiones
- traslados
- impresion de etiquetas LOC

### ORIGO
- compras
- recepciones
- ingreso de mercancia
- documentos y estados
- impacto en inventario

### FOGO
- lotes de produccion
- consumos de insumo
- salidas a producto terminado
- trazabilidad minima de produccion

### Cruces entre apps
- ORIGO recibe y deja inventario disponible
- NEXO ubica y mueve inventario
- FOGO consume inventario y genera produccion
- NEXO despacha a satelites o destino final

## 3. Roles minimos a probar

Se deben ejecutar pruebas al menos con estos perfiles:

| Rol | App principal | Debe poder | No debe poder |
|---|---|---|---|
| Admin operativo | NEXO / ORIGO / FOGO | ver todo, configurar, operar, auditar | nada critico bloqueado |
| Bodeguero | NEXO | ver LOCs, stock, movimientos, retiros, remisiones, impresion LOC | tocar configuracion global o maestros sensibles |
| Compras / recepcion | ORIGO | crear compra, registrar recepcion, consultar proveedor y documento | consumir inventario de produccion o despachar |
| Produccion | FOGO / NEXO | retirar insumos, consultar LOCs de produccion, crear o cerrar lote | alterar compras, recepciones o configuracion de bodegas |
| Despacho | NEXO | preparar y confirmar remisiones, consultar stock disponible | cambiar maestros o compras |
| Supervisor / auditor | NEXO / ORIGO / FOGO | ver estados, trazabilidad, evidencia y errores | ejecutar movimientos operativos sin permiso |
| Usuario restringido | cualquiera | ver solo lo minimo | entrar a modulos no asignados |

## 4. Ambientes

### Sandbox
- para romper flujo sin riesgo
- para casos negativos y reintentos

### Pre go-live
- con datos casi reales
- aqui se validan permisos, layouts, QR, remisiones, consumos y evidencia

### Produccion
- solo smoke tests controlados
- no usar para descubrir logica base rota

## 5. Datos de prueba minimos

Antes de empezar, deben existir:

- 1 sede Centro de Produccion activa
- LOCs reales y validados fisicamente
- 3 a 5 proveedores reales o dummy consistentes
- 10 a 15 SKUs de prueba repartidos entre:
  - secos
  - frio
  - congelado
  - insumo de produccion
  - producto despachable
- 1 producto producido en FOGO con receta clara
- 1 usuario por rol de prueba
- 1 impresora Zebra configurada para QR de LOC

## 6. Oleadas de validacion

## Oleada 1. Bloqueo de go-live

Debe aprobarse completa antes de abrir operacion:

1. acceso
2. permisos
3. LOCs
4. QR
5. stock visible
6. retiros
7. recepciones
8. remisiones

## Oleada 2. Robustez

1. traslados
2. devoluciones
3. errores de stock
4. casos duplicados
5. reintentos
6. consistencia documental

## Oleada 3. Refinamiento

1. UX
2. textos
3. layouts
4. tiempos de carga
5. reportes y auditoria

## 7. Secuencia correcta de ejecucion

Ejecutar en este orden:

1. Permisos y navegacion
2. Maestros
3. NEXO solo
4. ORIGO solo
5. FOGO solo
6. End-to-end cruzado
7. Casos de error
8. Cierre de hallazgos

## 8. Checklist de permisos y pantallas

## 8.1 Navegacion por rol

Para cada usuario:

- iniciar sesion
- validar sede activa
- validar modulo visible
- validar modulo oculto
- validar acceso directo por URL a modulo prohibido
- validar mensaje o redireccion al no tener permiso

### Evidencia minima
- captura del home
- captura del menu lateral
- captura del error o bloqueo de acceso

## 8.2 Permisos de accion

En cada modulo validar:

- ver
- crear
- editar
- confirmar
- imprimir
- cancelar
- eliminar, si existe

Cada accion debe tener respuesta consistente:

- permitida con exito
- o bloqueada con mensaje correcto

## 9. Checklist de maestros

Validar:

- sedes activas y sin duplicados
- LOCs con codigo, descripcion, zona y sitio correctos
- productos con categoria y unidad coherentes
- proveedores validos
- relaciones producto-LOC-area correctas
- estados operativos consistentes
- layouts de impresion cargables
- QR de LOC abriendo landing correcta

### Casos obligatorios

| ID | Caso | Esperado |
|---|---|---|
| MST-001 | crear LOC valido | se guarda y se lista |
| MST-002 | LOC duplicado | sistema bloquea |
| MST-003 | producto sin categoria | sistema bloquea o alerta |
| MST-004 | proveedor incompleto | sistema bloquea |
| MST-005 | QR de LOC | abre landing correcta |

## 10. NEXO. Casos prioritarios

## 10.1 LOC y QR

| ID | Caso | Resultado esperado |
|---|---|---|
| NEXO-LOC-001 | abrir QR de LOC real | abre `/inventory/locations/open?loc=...` y resuelve al LOC correcto |
| NEXO-LOC-002 | QR de LOC inexistente | error claro, sin pantalla rota |
| NEXO-LOC-003 | ver landing del LOC | muestra codigo, descripcion, acciones y contenido |
| NEXO-LOC-004 | ver contenido del LOC | stock coherente |

## 10.2 Retiros y stock

| ID | Caso | Resultado esperado |
|---|---|---|
| NEXO-RET-001 | retiro con stock suficiente | descuenta stock y crea movimiento |
| NEXO-RET-002 | retiro sin stock | bloquea con mensaje claro |
| NEXO-RET-003 | retiro parcial | saldo correcto |
| NEXO-RET-004 | doble envio | no duplica movimiento |

## 10.3 Remisiones y despacho

| ID | Caso | Resultado esperado |
|---|---|---|
| NEXO-REM-001 | remision valida | se crea y cambia de estado correctamente |
| NEXO-REM-002 | remision sin lineas | bloqueada |
| NEXO-REM-003 | remision con cantidad total 0 | bloqueada |
| NEXO-REM-004 | remision completa | descuenta stock y deja evidencia |
| NEXO-REM-005 | remision desde LOC equivocado | alerta o bloqueo |

## 10.4 Impresion LOC

| ID | Caso | Resultado esperado |
|---|---|---|
| NEXO-IMP-001 | cargar layout guardado | aparece como layout activo |
| NEXO-IMP-002 | preview de layout | refleja el mismo diseño y datos del LOC |
| NEXO-IMP-003 | imprimir cola | genera salida correcta a Zebra |
| NEXO-IMP-004 | quitar layout | vuelve al preset estandar |

## 11. ORIGO. Casos prioritarios

| ID | Caso | Resultado esperado |
|---|---|---|
| ORIGO-CMP-001 | crear compra valida | documento guardado |
| ORIGO-CMP-002 | compra incompleta | bloqueada |
| ORIGO-REC-001 | recepcion valida | incrementa inventario y deja documento |
| ORIGO-REC-002 | recepcion con cantidades inconsistentes | alerta o bloqueo |
| ORIGO-REC-003 | recepcion duplicada | no duplica ingreso |
| ORIGO-REC-004 | recepcion sin proveedor valido | bloqueada |

## 12. FOGO. Casos prioritarios

| ID | Caso | Resultado esperado |
|---|---|---|
| FOGO-BAT-001 | crear lote valido | lote visible y consistente |
| FOGO-BAT-002 | consumir insumo desde inventario | descuenta insumo correcto |
| FOGO-BAT-003 | cerrar lote | deja producto resultante o evidencia del lote |
| FOGO-BAT-004 | lote sin insumo suficiente | bloquea |
| FOGO-BAT-005 | lote con receta invalida | alerta o bloqueo |

## 13. End-to-end obligatorios

Estos son los casos que realmente deciden go-live:

## E2E-001 Compra a recepcion a stock

1. crear compra en ORIGO
2. recibir mercancia
3. validar ingreso a inventario
4. validar visibilidad en NEXO por LOC

Esperado:
- documento creado
- stock visible en LOC correcto
- movimiento auditable

## E2E-002 Stock a produccion

1. ubicar insumo en NEXO
2. retirar desde LOC para produccion
3. validar descuento
4. validar evidencia para FOGO

Esperado:
- retiro correcto
- stock remanente correcto
- sin doble movimiento

## E2E-003 Produccion a despacho

1. cerrar lote en FOGO
2. confirmar producto disponible para despacho
3. preparar remision en NEXO
4. confirmar salida

Esperado:
- consistencia entre lote, stock y remision
- evidencia de salida

## E2E-004 Recepcion a remision en mismo dia

1. recibir en ORIGO
2. ubicar en NEXO
3. retirar o despachar
4. cerrar remision

Esperado:
- no se rompe disponibilidad
- saldos correctos

## 14. Casos de error y borde

Se deben probar explicitamente:

- QR con codigo invalido
- LOC borrado o inactivo
- usuario sin sede
- usuario sin rol
- refresh en mitad del flujo
- doble click en confirmar
- red intermitente
- datos requeridos vacios
- cantidades negativas
- cantidades cero
- producto en LOC no autorizado
- remision ya cerrada intentando modificarse
- lote ya cerrado intentando reconsumir

## 15. Evidencia requerida por caso

Cada caso debe dejar:

- ID del caso
- fecha
- usuario
- app
- entorno
- pasos ejecutados
- esperado
- real
- captura inicial
- captura final
- si aplica: evidencia de BD, documento o movimiento
- estado final: `ok`, `fail`, `blocked`

## 16. Criterios de salida

No se recomienda go-live si falla alguno de estos:

- permisos criticos mal asignados
- QR de LOC no resuelve consistentemente
- recepcion no impacta inventario
- retiro no descuenta stock bien
- remision permite salir sin lineas o sin cantidades reales
- FOGO no deja evidencia del consumo o lote
- no existe trazabilidad minima entre apps

Go-live condicionable solo si los fallos son menores:

- copy de pantalla
- estilos
- labels de UI
- mejoras no bloqueantes de layout

## 17. Formato de ejecucion diaria

Para una sesion de pruebas real:

### Paso 1
- definir oleada del dia
- asignar responsables
- congelar alcance

### Paso 2
- ejecutar casos
- registrar evidencia en el momento

### Paso 3
- consolidar hallazgos
- clasificar severidad:
  - S1 bloqueante
  - S2 alta
  - S3 media
  - S4 baja

### Paso 4
- cerrar con semaforo:
  - verde
  - amarillo
  - rojo

## 18. Matriz minima de seguimiento

| ID | Modulo | Caso | Rol | Esperado | Real | Estado | Severidad | Responsable |
|---|---|---|---|---|---|---|---|---|
| NEXO-LOC-001 | NEXO | QR abre landing | Bodeguero | abre LOC correcto | pendiente | pendiente | - | - |
| NEXO-REM-002 | NEXO | remision sin lineas bloqueada | Despacho | bloquea | pendiente | pendiente | - | - |
| ORIGO-REC-001 | ORIGO | recepcion valida | Recepcion | crea ingreso | pendiente | pendiente | - | - |
| FOGO-BAT-002 | FOGO | consumo de insumo | Produccion | descuenta stock | pendiente | pendiente | - | - |
| E2E-003 | Cruzado | produccion a despacho | Produccion / Despacho | cierra flujo | pendiente | pendiente | - | - |

## 19. Recomendacion operativa

Primero ejecutar 1 dia completo de validacion controlada solo con:

- admin operativo
- bodeguero
- recepcion
- produccion
- despacho

Y limitar el alcance inicial a:

- LOCs
- QR
- recepcion
- stock
- retiros
- remisiones
- un flujo real de produccion

Despues de eso se abre la segunda ronda con:

- traslados
- devoluciones
- edge cases
- auditoria detallada

## 20. Siguiente entregable recomendado

Despues de este documento, conviene crear 3 anexos:

1. `MATRIZ-PERMISOS-NEXO-ORIGO-FOGO.md`
2. `CASOS-DE-PRUEBA-NEXO-ORIGO-FOGO.csv`
3. `ACTA-HALLAZGOS-NEXO-ORIGO-FOGO.md`
