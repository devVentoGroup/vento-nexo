# NEXO

NEXO es la app operativa de inventario y remisiones de Vento.

## Enfoque actual

El repo queda alineado a una **v1 operativa**:
- Inventario base.
- Stock inicial manual.
- Remisiones entre `Centro` y `Saudo`.
- LOCs solo en `Centro`.
- Conteos, ajustes, retiros, traslados y movimientos.

Queda fuera del arranque:
- Produccion integrada.
- Consumo por receta.
- Recepcion normal contra OC.
- Integraciones reales con `FOGO`, `ORIGO` y `VISO`.

## Arranque local

```bash
npm run dev
```

## Documentacion v1

- [Guia de configuracion inicial](./docs/GUIA-CONFIGURACION-INICIAL.md)
- [Operacion v1](./docs/OPERACION-V1-NEXO.md)
- [Roadmap](./docs/ROADMAP-NEXO.md)
- [Plantilla de productos](./docs/PLANTILLA-PRODUCTOS-V1.csv)

## Flujos principales

- `/inventory/settings/checklist`
- `/inventory/catalog`
- `/inventory/entries`
- `/inventory/remissions`
- `/inventory/stock`
- `/inventory/locations`

## Alta asistida con IA

Configura en `.env.local`:

```bash
OPENAI_API_KEY=...
OPENAI_INVENTORY_MODEL=gpt-4.1-mini
```

Rutas:
- `/inventory/ai-ingestions?flow=catalog_create`
- `/inventory/ai-ingestions?flow=supplier_entries`
