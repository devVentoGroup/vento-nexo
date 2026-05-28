# NEXO

NEXO es la app Vento OS para inventario, LOCs, remisiones, conteos, movimientos y abastecimiento interno.

## Estado actual

- Catalogo maestro operativo.
- Configuracion por sede y presentaciones fisicas.
- Stock por sede, LOC y presentacion fisica real.
- Entradas, conteos, ajustes, retiros, traslados y movimientos.
- Remisiones con solicitud, preparacion, despacho, transito y recepcion.
- Kiosk/board por LOC, posiciones internas y flujos QR.
- Printing/Zebra para etiquetas y layouts.

NEXO no es owner de compras, recetas, POS ni categorias comerciales. Esos dominios pertenecen a Origo, Fogo, Pulso/Pass y Viso/Pass respectivamente.

## Documentacion vigente

- `docs/ESTADO-ACTUAL-NEXO-2026-05-28.md`
- `docs/ROADMAP-NEXO.md` queda como bitacora historica y backlog especifico.
- `docs/ROADMAP-NEXO.md` y `docs/BACKLOG-TECNICO-V1-NEXO.md` quedan como estado futuro/backlog vivo.

## Desarrollo

```bash
npm install
npm run dev
```

## Regla de base de datos

Todo cambio de schema, RPC, storage o permisos compartidos se hace desde `vento-shell`.
