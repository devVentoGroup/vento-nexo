# Migracion de Categorias Maestras de Venta v1

Estado: `Aplicada y auditada`
Fecha: `2026-03-12`
Scope: `NEXO v1`

## Objetivo

Crear el arbol maestro de `venta` que faltaba en `product_categories` y mover los productos de venta ya existentes desde categorias heredadas de menu hacia una categoria operativa unica y estable.

La migracion:

- crea una raiz global `Venta`;
- crea categorias maestras globales de venta;
- mueve `products.category_id` para `product_type = venta` segun el nombre de la categoria heredada;
- no elimina categorias heredadas;
- las heredadas de `venta` quedan desactivadas en `v1` para reservarlas a la futura capa comercial.

## Arbol maestro nuevo

Raiz:

- `Venta`

Hijas maestras:

- `Cafe y espresso`
- `Otras bebidas calientes`
- `Bebidas frias`
- `Cocteles y alcohol`
- `Panaderia y bolleria`
- `Desayunos y brunch`
- `Entradas y para compartir`
- `Ensaladas y bowls`
- `Sanduches, wraps y tostadas`
- `Platos fuertes`
- `Tortas y postres`
- `Helados y frios dulces`
- `Productos empacados y retail`
- `Otros de venta`

## Criterio

Estas categorias no representan menu por marca o por sede. Representan el tipo operativo del producto maestro vendible.

Ejemplos:

- el mismo croissant puede venderse en `Vento Cafe` o `Saudo`, pero en v1 cae en `Venta / Panaderia y bolleria`;
- una limonada cae en `Venta / Bebidas frias`;
- un desayuno completo cae en `Venta / Desayunos y brunch`.

## Mapeo heredado -> maestro

| Categoria heredada | Categoria maestra nueva |
| --- | --- |
| `BEBIDAS` | `Venta / Bebidas frias` |
| `CAFE`, `CAFÉ` | `Venta / Cafe y espresso` |
| `CALIENTES` | `Venta / Otras bebidas calientes` |
| `COCTELES`, `CON ALCOHOL` | `Venta / Cocteles y alcohol` |
| `CROISSANTS` | `Venta / Panaderia y bolleria` |
| `PAN & BRUNCH`, `PANCAKES & WAFFLES`, `DESAYUNOS` | `Venta / Desayunos y brunch` |
| `ENTRADAS`, `PARA COMPARTIR` | `Venta / Entradas y para compartir` |
| `ENSALADAS`, `BOWLS` | `Venta / Ensaladas y bowls` |
| `BIKINIS`, `SANDWICH`, `TOSTADAS` | `Venta / Sanduches, wraps y tostadas` |
| `COMIDA`, `FUERTES`, `SOPAS`, `PIZZAS` | `Venta / Platos fuertes` |
| `POSTRES` | `Venta / Tortas y postres` |
| `HELADOS` | `Venta / Helados y frios dulces` |
| `FRIAS`, `FRÍAS`, `JUGOS`, `LIMONADAS`, `MALTEADAS`, `SMOOTHIE`, `SODAS` | `Venta / Bebidas frias` |
| `OTROS` | `Venta / Otros de venta` |

## Decisiones intencionales

- No se crea una categoria `Pizzas` porque hoy no queremos volver a abrir el arbol por menu.
- `PIZZAS` se mueve a `Platos fuertes` para no dejar productos vendibles sin categoria maestra.
- `Otros de venta` existe como categoria de aterrizaje para casos heredados ambiguos. No es la meta final; es una cola de saneamiento.
- `Productos empacados y retail` se crea desde ya aunque no reciba categorias heredadas automaticas. Es parte del arbol maestro esperado para vitrinas o productos terminados empacados.

## Lo que no hace esta migracion

- no borra categorias heredadas;
- no cambia categorias de `insumo` ni de `preparacion`;
- no implementa aun la capa comercial por negocio o por canal.

## Archivo de migracion

- `vento-shell/supabase/migrations/20260312183000_nexo_venta_master_categories_migration.sql`
- `vento-shell/supabase/migrations/20260312190000_nexo_venta_master_categories_followup.sql`
- `vento-shell/supabase/migrations/20260312193000_nexo_venta_master_categories_alcohol_boundary_fix.sql`
- `vento-shell/supabase/migrations/20260312200000_nexo_deactivate_legacy_sale_categories.sql`
- `vento-shell/supabase/migrations/20260312203000_nexo_force_deactivate_legacy_sale_categories.sql`

## Follow-up aplicado

Despues de la primera corrida se detectaron tres categorias heredadas activas de venta que no estaban en el mapeo original pero si tenian productos vivos:

- `Bebidas Listas (RTD)`
- `HORNEADOS`
- `VITRINA`

La migracion follow-up hace esto:

- `HORNEADOS` -> `Venta / Panaderia y bolleria`
- `VITRINA` -> `Venta / Panaderia y bolleria`
- `Bebidas Listas (RTD)`:
  - productos con nombre de cerveza/licor -> `Venta / Cocteles y alcohol`
  - resto -> `Venta / Bebidas frias`

Despues se aplico una correccion adicional porque el criterio inicial de alcohol por substring podia atrapar nombres como `Ginger` u `Original`.
La tercera migracion deja el criterio por palabras completas y devuelve esos falsos positivos a `Venta / Bebidas frias`.

## Desactivacion operativa de heredadas

En `v1` las categorias heredadas de venta ya no deben seguir apareciendo en formularios operativos.

Por eso se aplico una cuarta migracion que:

- desactiva todas las categorias `venta` que no pertenecen al arbol canonico colgado de `Venta`;
- no borra nada;
- deja trazabilidad en `description` con la marca `LEGACY COMERCIAL v1`.

Eso permite que en `v1` la operacion solo use el arbol maestro, mientras en `v2` esas heredadas se reinterpretan o migran a categorias comerciales.

La cuarta migracion no alcanzo a limpiar todos los remanentes heredados activos, asi que despues se aplico una quinta migracion con una regla operativa mas dura:

- en `v1`, las unicas categorias `venta` que deben quedar activas son:
  - la raiz `Venta`;
  - sus hijas maestras globales con slug `venta-*`.

## Siguiente verificacion recomendada

1. Revisar `Catalogo > Productos` y confirmar que los productos de venta ya caen bajo el arbol `Venta`.
2. Revisar `Remisiones` y confirmar que el selector ya agrupa por estas nuevas categorias maestras cuando aplique.
3. Auditar cuantas fichas quedaron en `Venta / Otros de venta` para su saneamiento manual.

## Resultado auditado final

Fecha de auditado: `2026-03-12`

Distribucion real encontrada en productos `venta`:

- `Venta / Panaderia y bolleria`: `14`
- `Venta / Bebidas frias`: `13`
- `Venta / Cocteles y alcohol`: `2`
- `Venta / Otros de venta`: `0`

Estado:

- no quedaron productos `venta` colgando de `HORNEADOS`, `VITRINA` ni `Bebidas Listas (RTD)`;
- en `Cocteles y alcohol` solo quedaron las cervezas reales detectadas en la corrida (`Heineken` y `Coronita`);
- no quedaron productos `venta` aterrizados en `Otros de venta` en esta corrida.
- las categorias heredadas de `venta` quedaron con `is_active = false` y marca `LEGACY COMERCIAL v1` en `description`;
- el arbol activo de `venta` en `v1` quedo reducido a `15` categorias canonicas:
  - `Venta` como raiz;
  - `14` hijas maestras globales con slug `venta-*`.
