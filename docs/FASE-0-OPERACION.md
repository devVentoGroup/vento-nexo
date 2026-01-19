# Fase 0 - Alineacion y reglas del juego

Este documento formaliza las definiciones base para NEXO antes de continuar con fases tecnicas.

## 1. Objetivo
- NEXO es la fuente de verdad del inventario (ledger + documentos).

## 2. Alcance MVP
- Incluye:
  - Inventario core (movimientos + stock por sede)
  - Recepciones de proveedores
  - Entregas internas
  - Remisiones/transferencias a satelites
- Fuera de alcance (por ahora):
  - LPN/LOC avanzados
  - Costeo/POs completos
  - Recetas/produccion integrada

## 3. Sedes (IDs y nombres oficiales)
- Centro de produccion (CP):
  - id: 407ccca3-bc35-4252-8998-7280623de78f
  - nombre: Centro de Produccion
- Satelites:
  - id: 7da218c3-fbf2-4f5d-b033-2fa9a40f767c
    nombre: Vento Cafe
  - id: 58362682-4ea3-4718-bd83-b4f311f885cd
    nombre: Saudo
- Admin/global:
  - id: 59de8039-239a-4791-a20c-c2e7fe2344d3
  - nombre: Vento Group

## 4. Roles y responsabilidades operativas
- Recepcion proveedores:
  - Responsable: bodeguero (operacion), gerente (supervisa)
- Bodega/put-away:
  - Responsable: bodeguero
- Cocina/panaderia (solicita/recibe):
  - Responsable: cocinero / panadero / repostero / pastelero (segun area)
- Despacho/remisiones:
  - Responsable: bodeguero (prepara) + conductor (transporta)
- Satelite (recibe y disputa):
  - Responsable: gerente o cajero (en sede satelite)
- Admin/owner:
  - Responsable: propietario / gerente_general
- Roles definidos en BD:
  - barista: Barista (Barista)
  - bodeguero: Bodeguero (Bodega e inventario)
  - cajero: Cajero (Caja y cobros)
  - cocinero: Cocinero (Cocina)
  - conductor: Conductor (Transporte y remisiones)
  - contador: Contador (Finanzas y contabilidad)
  - gerente: Gerente (Gerente de sede)
  - gerente_general: Gerente General (Gerencia global multi-sede)
  - marketing: Marketing (Marketing y growth)
  - mesero: Mesero (Servicio en sala)
  - panadero: Panadero (Panaderia)
  - pastelero: Pastelero (Pasteleria)
  - propietario: Propietario (Dueno y gerente general)
  - repostero: Repostero (Reposteria)
- Personal activo (BD):
  - Carlos Alejandro Ibarra Ariza | rol: propietario | sede: Vento Group
  - Dev Vento Group | rol: cajero | sede: Vento Cafe

## 5. Glosario operativo
- SLA: tiempo objetivo para completar un proceso.
- Custodia: responsabilidad formal sobre el inventario en un punto.
- Staging: area temporal antes de ubicacion final.
- ABC: clasificacion por rotacion/valor para conteos.
- PAR: nivel minimo objetivo por SKU.
- FEFO/FIFO: salida por vencimiento/antiguedad.
## 6. Politicas
- Quien puede ajustar: bodeguero y gerente (solo en su sede).
- Quien aprueba ajustes/mermas: gerente y gerente_general; propietario en casos especiales.
- Que requiere evidencia: ajustes manuales, merma y discrepancias de recepcion/remision.
## 7. Estado de definiciones
- Fecha de ultima revision: 2026-01-18
- Aprobado por: pendiente

