# Operacion V1 NEXO

## Objetivo

Salir a operar con inventario base y remisiones sin depender de `FOGO`, `ORIGO` ni `VISO`.

## Alcance operativo

### Modulos oficiales de v1
- `/inventory/catalog`
- `/inventory/entries`
- `/inventory/remissions`
- `/inventory/locations`
- `/inventory/count-initial`
- `/inventory/stock`
- `/inventory/transfers`
- `/inventory/withdraw`
- `/inventory/settings/checklist`

### Fuera de alcance
- Produccion integrada.
- Recetas.
- Recepcion normal contra orden de compra.
- Segundo satelite.

## Secuencia de arranque

1. Completa el checklist.
2. Carga el catalogo minimo.
3. Activa productos para `Centro` y `Saudo`.
4. Carga stock inicial en `Centro`.
5. Verifica stock por sede y por LOC.
6. Haz una remision real de prueba.

## Alta de productos

### Camino 1: alta manual rapida
- Usa `catalog/new?mode=quick`.
- Prioriza top 20-40 productos criticos.
- Completa solo lo minimo para operar.

### Camino 2: alta asistida
- Usa `/inventory/ai-ingestions?flow=catalog_create`.
- Sirve para cola larga o carga masiva.

## Validaciones que no se negocian

- No remitir productos no habilitados por sede.
- No preparar mas de lo disponible.
- No crear entradas en `Centro` sin `LOC`.
- No recibir sin solicitud previa.

## Prueba minima de aceptacion

1. Crear un insumo.
2. Habilitarlo para `Centro` y `Saudo`.
3. Cargar entrada inicial con `LOC`.
4. Ver stock en `Centro`.
5. Solicitar remision desde `Saudo`.
6. Preparar en `Centro`.
7. Recibir en `Saudo`.
8. Confirmar movimientos y saldos.
