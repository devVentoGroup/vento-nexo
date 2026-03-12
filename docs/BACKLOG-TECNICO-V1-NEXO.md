# Backlog Tecnico V1 - NEXO

Estado: `Canonico para ejecucion`
Fecha: `2026-03-11`
Scope: `Rutas, pantallas y decisiones de limpieza para NEXO v1`

## 1. Objetivo

Este documento traduce el Plan Maestro y la Especificacion V1 Inmediata a trabajo ejecutable sobre las pantallas reales de `NEXO`.

La meta no es redisenar todo en abstracto. La meta es decidir, por ruta:

- si se mantiene;
- si se simplifica;
- si se fusiona;
- si se esconde;
- si se redirige;
- o si se depreca.

## 2. Regla de priorizacion

### `P0`

Flujo operativo critico de salida.

### `P1`

Configuracion y control necesarios para operar bien `v1`.

### `P2`

Utilidades y soporte valiosos, pero no centrales para el dia a dia.

### `P3`

Fuera de `v1`, compatibilidad o deprecacion.

## 3. Leyenda de accion

- `mantener`: se queda como modulo oficial.
- `simplificar`: se queda, pero con menos ruido, menos decisiones y menos UI mezclada.
- `partir`: dividir pantalla grande en modulos/componentes mas pequenos.
- `fusionar`: absorber en otro flujo o dejar como variacion del principal.
- `esconder`: quitar de navegacion principal y dejar solo por acceso directo o rol.
- `redirigir`: mantener ruta, pero llevar a otra pantalla o modulo.
- `deprecar`: dejar fuera del alcance y preparar retiro.

## 4. Inventario y decision por ruta

| Ruta | Lineas aprox. | Estado v1 | Accion | Prioridad | Decision |
| --- | ---: | --- | --- | --- | --- |
| `/` | 714 | Hub operativo | `simplificar` | `P0` | Debe quedar como cockpit de `v1`, no como feria de accesos. Solo entradas, abastecimiento interno, stock, conteos, setup y alertas. |
| `/inventory/catalog` | 1203 | Core | `mantener + partir + simplificar` | `P0` | Pantalla oficial del catalogo maestro. Debe enfocarse en salud del catalogo, filtros operativos y acciones maestras. |
| `/inventory/catalog/new` | 1373 | Core | `mantener + partir + simplificar` | `P0` | Flujo de alta de producto maestro. Debe sacar ruido comercial/futuro y dejar solo datos operativos. |
| `/inventory/catalog/[id]` | 1618 | Core | `mantener + partir + simplificar` | `P0` | Ficha maestra del producto. Debe separarse en secciones claras: maestro, operacion, sedes, proveedores, media. |
| `/inventory/entries` | 965 | Core | `mantener + partir + simplificar` | `P0` | Flujo oficial de entrada/recepcion v1. Debe enfocarse en recepcion manual auditable y contingencia. |
| `/inventory/remissions` | 899 | Core | `mantener + renombrar semanticamente + partir` | `P0` | Debe tratarse como `abastecimiento interno`. En UI puede conservar “Remisiones” temporalmente, pero su modelo oficial es suministro entre sedes. |
| `/inventory/remissions/[id]` | 1088 | Core | `mantener + partir + endurecer estados` | `P0` | Pantalla central de solicitud/preparacion/recepcion. Debe quedar como detalle del documento interno entre sedes. |
| `/inventory/stock` | 859 | Core | `mantener + partir + simplificar` | `P0` | Vista principal de stock por sede y salud basica. Debe mostrar lo necesario para operar y reabastecer. |
| `/inventory/settings/checklist` | 187 | Core arranque | `mantener` | `P0` | Es la puerta operativa de salida a produccion v1. Debe ser simple, visible y accionable. |
| `/inventory/locations` | 535 | Config operativa | `mantener + simplificar` | `P1` | Necesaria para CP. Debe enfocarse en LOC reales y no inflar modelado inutil para satelites. |
| `/inventory/count-initial` | 319 | Control | `mantener + simplificar` | `P1` | Necesaria para conteo inicial y saneamiento. |
| `/inventory/count-initial/session/[id]` | 380 | Control | `mantener + simplificar` | `P1` | Debe quedar como pantalla de cierre y ajuste auditable, sin complejidad extra. |
| `/inventory/movements` | 354 | Control | `mantener + simplificar` | `P1` | Fuente de auditoria. Debe ser lectura clara, no panel saturado. |
| `/inventory/settings/sites` | 176 | Setup | `mantener` | `P1` | Necesaria porque `sites` es maestro real. Debe quedarse administrativa y pequena. |
| `/inventory/settings/supply-routes` | 249 | Setup | `mantener` | `P1` | Critica para abastecimiento interno. Sin esto, la red de suministro queda manual y opaca. |
| `/inventory/settings/categories` | 1388 | Setup | `mantener + simplificar fuerte` | `P1` | Debe quedar como gestion administrativa de categoria operativa, no como laboratorio de catalogo comercial. |
| `/inventory/transfers` | 442 | Operacion secundaria | `mantener + simplificar` | `P1` | Valida para movimientos internos de bodega dentro de sede. Debe diferenciarse claramente de abastecimiento entre sedes. |
| `/inventory/withdraw` | 408 | Operacion secundaria | `mantener + simplificar` | `P1` | Mantener para retiros controlados. Debe quedar utilitario y directo. |
| `/inventory/adjust` | 186 | Operacion secundaria | `mantener + evaluar fusion parcial` | `P1` | Puede coexistir, pero parte del ajuste deberia empujarse a conteos. No debe ser la puerta facil para corregir cualquier cosa. |
| `/inventory/settings/units` | 400 | Setup | `mantener` | `P2` | Necesaria, pero no protagonista. Administrativa y estable. |
| `/inventory/ai-ingestions` | 99 | Utilidad | `mantener + esconder` | `P2` | Valiosa para alta asistida, pero no debe competir con el flujo diario de v1. |
| `/printing/jobs` | 604 | Utilidad | `mantener + esconder` | `P2` | Util para etiquetas y operacion, pero fuera del path principal de v1. |
| `/printing/setup` | 273 | Utilidad | `mantener + esconder` | `P2` | Setup tecnico. Debe salir de la navegacion primaria. |
| `/printing/designer` | 378 | Utilidad experimental | `mantener + esconder` | `P2` | Herramienta avanzada. No debe sentirse modulo core de Nexo v1. |
| `/inventory/remissions/prepare` | 198 | Duplicidad parcial | `fusionar o redirigir` | `P2` | Su funcion ya vive en el detalle de remision. Si no aporta una cola especializada, debe salir como ruta primaria. |
| `/inventory/production-batches` | 40 | Fuera de alcance | `redirigir / mantener info` | `P3` | Correcto mantenerlo fuera de v1 con mensaje o redireccion a `Fogo`. |
| `/inventory/lpns` | 5 | Fuera de alcance | `redirigir` | `P3` | Correcto dejarlo fuera del arranque. |

## 5. Decisiones de producto por grupo

## 5.1 Grupo `P0` - Lo que define la salida de `v1`

### `catalog`

Objetivo:

- operar sobre producto maestro, no sobre menu comercial.

Acciones:

- dividir `catalog`, `catalog/new` y `catalog/[id]`;
- quitar o esconder decisiones comerciales futuras;
- dejar visible solo lo minimo: identidad, unidad, categoria operativa, stock unit, estado, sedes, costo base, proveedor primario.

### `entries`

Objetivo:

- recepcion auditable y util.

Acciones:

- separar recepcion normal de contingencia;
- explicitar cuando se exige LOC;
- hacer el costo visible pero no excesivamente tecnico;
- endurecer errores y validaciones.

### `remissions`

Objetivo:

- convertir la experiencia de remision en abastecimiento interno claro.

Acciones:

- usar lenguaje operativo mas claro;
- diferenciar solicitud, preparacion, envio y recepcion;
- evitar duplicidad entre lista, prepare y detalle;
- preparar semantica futura de pricing sin mostrarla como complejidad diaria.

### `stock`

Objetivo:

- ver disponibilidad real y detectar accion necesaria.

Acciones:

- reforzar filtros por sede, LOC y minimo;
- priorizar faltantes, quiebres y productos sin setup;
- bajar ruido visual.

### `dashboard / checklist`

Objetivo:

- dirigir al usuario a la siguiente accion correcta.

Acciones:

- dejar home con pocas tarjetas de alto valor;
- poner checklist como arranque guiado;
- sacar accesos secundarios de la primera capa.

## 5.2 Grupo `P1` - Configuracion y control utiles

### `locations`, `sites`, `supply-routes`, `categories`, `units`

Regla:

- deben existir, pero como modulos administrativos compactos.
- no deben sentirse mas grandes que la operacion diaria.

### `count-initial`, `movements`, `transfers`, `withdraw`, `adjust`

Regla:

- son modulos de control y mantenimiento operativo;
- deben ser directos y con menos decisiones paralelas.

## 5.3 Grupo `P2` - Utilidades de apoyo

### `ai-ingestions`

Regla:

- mantener porque acelera catalogo;
- esconder de la navegacion principal;
- usarlo como herramienta, no como flujo central.

### `printing/*`

Regla:

- mantener porque la operacion necesita etiquetas;
- sacar de la ruta primaria de trabajo diario;
- concentrar acceso desde stock, ubicaciones o utilidades.

## 5.4 Grupo `P3` - Fuera de `v1`

### `production-batches`

- correcto dejarlo fuera de `Nexo v1`;
- si se conserva, que sea solo informacion y CTA a `Fogo`.

### `lpns`

- correcto dejarlo fuera del arranque;
- no debe generar deuda de UI ni falsa promesa operativa.

## 6. Backlog tecnico ordenado de ejecucion

## Sprint 1 - Navegacion y foco

1. Simplificar `/`.
2. Reordenar menu y agrupar por `Operar`, `Verificar`, `Configurar`, `Utilidades`.
3. Esconder `printing/*`, `ai-ingestions`, `production-batches`, `lpns` del primer nivel.
4. Decidir si `remissions/prepare` se fusiona o redirige.

## Sprint 2 - Catalogo maestro

1. Partir `/inventory/catalog`.
2. Partir `/inventory/catalog/new`.
3. Partir `/inventory/catalog/[id]`.
4. Reducir el peso de `audience` y del filtrado de categorias como mecanismo central.
5. Alinear el copy de la UI con `producto maestro` y `categoria operativa`.

## Sprint 3 - Entradas y stock

1. Partir `/inventory/entries`.
2. Simplificar `/inventory/stock`.
3. Endurecer mensajes y validaciones.
4. Hacer visibles par levels y salud de configuracion por sede.

## Sprint 4 - Abastecimiento interno

1. Renombrar semanticamente `remissions` en copy y documentacion interna.
2. Partir `/inventory/remissions`.
3. Partir `/inventory/remissions/[id]`.
4. Reducir duplicidad entre solicitud, preparacion y recepcion.
5. Dejar el modelo listo para pricing interno reservado, sin activarlo como complejidad diaria.

## Sprint 5 - Control y setup

1. Simplificar `count-initial` y `session/[id]`.
2. Simplificar `movements`, `withdraw`, `transfers`, `adjust`.
3. Compactar `settings/categories`, `settings/sites`, `settings/supply-routes`, `settings/units`.

## 7. Hallazgos clave del repositorio

1. Las pantallas mas grandes y criticas coinciden con el nucleo de `v1`:
   - `settings/categories`
   - `catalog/new`
   - `catalog`
   - `entries`
   - `remissions`
   - `stock`

2. `production-batches` y `lpns` ya estan tratados como fuera de `v1`, lo cual es correcto.

3. `printing/*` existe y es valioso, pero no debe dominar la jerarquia del producto.

4. `audience` sigue muy metido en catalogo y remisiones; eso debe tratarse como compatibilidad de `v1`, no como verdad de negocio futura.

## 8. Definicion de listo de este backlog

Este backlog queda bien ejecutado cuando:

- el usuario entiende `Nexo v1` como inventario + abastecimiento interno;
- el catalogo se siente maestro, no comercial;
- el dashboard dirige acciones reales;
- setup y utilidades no compiten con la operacion principal;
- la deuda principal deja de concentrarse en 5 pantallas gigantes;
- `Nexo` deja de prometer modulos que realmente pertenecen a `Fogo`, `Origo` u otras apps.
