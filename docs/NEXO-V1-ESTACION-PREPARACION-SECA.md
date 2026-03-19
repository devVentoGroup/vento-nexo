# NEXO V1 · Estacion de Preparacion Seca

Estado: `Propuesta canónica V1`
Fecha: `2026-03-19`
Documento base: `Nuevo sistema Tamizaje.md`

## Decision principal

Separar la operacion en **2 procesos** y **2 estaciones**, aunque fisicamente puedan quedar una al lado de la otra.

1. **Estacion A · Tamizado y almacenamiento base**
- Recibe materia prima seca desde proveedor o bodega.
- Tamiza.
- Pesa el total preparado.
- Lo pasa a `tambo`, `bin` o contenedor menor segun capacidad.
- Etiqueta el contenedor.
- Lo deja en una ubicacion de listo para usar.

2. **Estacion B · Mezclas y porcionado**
- Toma secos ya tamizados y almacenados desde la Estacion A.
- Dosifica cantidades exactas segun mezcla o premezcla.
- Arma kits, bolsas o porciones.
- Etiqueta cada porcion.
- Las deja listas para consumo diario o semanal.

Esta separacion es la correcta por 4 razones:

- evita mezclar preparacion de base con armado de recetas;
- permite ocultar la receta completa al operario de porcionado;
- hace mas simple el control de inventario y reposicion;
- permite arrancar V1 sin automatizar todo desde el primer dia.

## Regla operativa base

No todo seco tamizado se porciona de inmediato.

Hay 2 niveles de trabajo:

1. **Base preparada**
- Ejemplo: harina tamizada en tambo.
- Se usa como buffer controlado.
- Puede durar varios dias si el proceso y la inocuidad lo permiten.

2. **Mezcla o porcion preparada**
- Ejemplo: bolsa seca para una receta o corrida.
- Sale desde una o varias bases preparadas.
- Idealmente se prepara por lotes para cubrir uno o varios dias.

## Recomendacion operativa exacta

### Estacion A · Tamizado y almacenamiento base

Usar esta estacion para:

- harina;
- azucar;
- cocoa;
- secos de uso transversal;
- microingredientes en contenedores pequenos.

### Flujo A

1. Sacar saco o insumo original.
2. Abrir y tamizar.
3. Pesar el total util.
4. Definir a que contenedor va.
5. Si no cabe en un solo tambo, dividir en varios contenedores.
6. Etiquetar cada contenedor.
7. Guardar cada contenedor en ubicacion de base preparada.

### Regla de capacidad

Si un saco de `25 kg` no cabe en un tambo de `10 L`, **no fuerces un solo contenedor**.
La regla correcta es:

- dividir en varios contenedores del mismo material;
- cada contenedor queda con su propio peso real;
- todos pueden referenciar el mismo lote origen;
- cada contenedor conserva trazabilidad individual.

Ejemplo:

- `Harina lote proveedor X`
- `Contenedor A`: `9.8 kg`
- `Contenedor B`: `9.7 kg`
- `Contenedor C`: `5.1 kg`

No lo modelaria como error ni como excepcion. Debe ser comportamiento normal del sistema.

### Objeto del sistema para Estacion A

Usar un solo objeto canónico:

`base_container`

Campos minimos:

- `id`
- `material_id`
- `material_name`
- `source_lot_ref`
- `container_code`
- `container_type`
- `gross_capacity_optional`
- `net_qty`
- `unit`
- `status`
- `site_id`
- `location_id`
- `prepared_at`
- `prepared_by`
- `notes`

### Estados sugeridos para base_container

- `available`
- `in_use`
- `depleted`
- `discarded`

## Estacion B · Mezclas y porcionado

Esta estacion no recibe sacos grandes como flujo principal.
Recibe **bases preparadas** desde la Estacion A.

### Objetivo

Preparar mezclas o premezclas para varios dias, de forma que el operario final no tenga que:

- pesar;
- tamizar;
- conocer la receta completa.

### Flujo B

1. Seleccionar mezcla o premezcla objetivo.
2. El sistema indica cuantos insumos base se necesitan.
3. Tomar cantidades desde uno o varios `base_container`.
4. Registrar consumo exacto por contenedor.
5. Armar mezcla madre o porciones finales.
6. Etiquetar mezcla, bolsa o kit.
7. Guardar en staging listo para uso diario.

### Objeto del sistema para Estacion B

Separar 2 salidas posibles:

1. `mix_batch`
- mezcla madre o premezcla grande;
- puede luego dividirse.

2. `prepared_portion`
- bolsa, kit o porcion final lista para uso.

Campos minimos de `mix_batch`:

- `id`
- `formula_id or recipe_id`
- `name`
- `batch_code`
- `net_qty`
- `unit`
- `prepared_at`
- `prepared_by`
- `status`
- `site_id`
- `location_id`

Campos minimos de `prepared_portion`:

- `id`
- `recipe_id or portion_profile_id`
- `parent_mix_batch_id optional`
- `portion_code`
- `portion_index optional`
- `net_qty`
- `unit`
- `prepared_at`
- `prepared_by`
- `status`
- `site_id`
- `location_id`

## Regla de trazabilidad recomendada

Este es el punto clave para lo que quieres hacer.

La aplicacion debe poder responder siempre estas preguntas:

- de que lote proveedor vino este seco;
- en que contenedores base quedo dividido;
- cuanto se consumio de cada contenedor;
- que mezcla se preparo con ese consumo;
- cuantas porciones salieron;
- cuando se agoto un contenedor.

### Modelo de consumo minimo V1

No necesitas automatizacion total para arrancar.
Pero si necesitas una bitacora consistente de movimientos.

Usaria un registro tipo:

`base_container_movements`

Campos minimos:

- `id`
- `base_container_id`
- `movement_type`
- `qty`
- `unit`
- `reference_type`
- `reference_id`
- `created_at`
- `created_by`
- `notes`

Tipos sugeridos:

- `fill`
- `consume_for_mix`
- `adjustment`
- `deplete`
- `discard`

Con eso puedes modelar exactamente tu ejemplo:

- se llena un contenedor con `10 kg` de harina;
- cada mezcla consume una cantidad exacta;
- al llegar al total acumulado de `10 kg`, el contenedor queda en `depleted`;
- el sistema obliga a crear o seleccionar un nuevo contenedor para seguir porcionando.

## Recomendacion de layout fisico

Sí las manejaria como estaciones diferentes.
Aunque queden sobre la misma pared, deben tener logica propia.

### Orden sugerido de derecha a izquierda o de fondo a salida

1. Entrada de sacos / apertura / descarte
2. Tamizado
3. Pesaje total
4. Area de contenedores base
5. Mesa de mezcla y porcionado
6. Tablet + Zebra
7. Staging listo para uso

### Regla fisica

- La Estacion A termina cuando el seco queda bien guardado en contenedor etiquetado.
- La Estacion B arranca cuando alguien retira seco desde un contenedor base para una mezcla o porcion.

## Implicaciones para NEXO V1

### Lo que si deberia entrar desde V1

1. Registro de `base_container`.
2. Impresion de etiqueta para contenedor base.
3. Registro de consumo desde contenedor base.
4. Creacion de `mix_batch` o `prepared_portion`.
5. Impresion de etiqueta de mezcla o porcion.
6. Historial basico de movimientos.

### Lo que no meteria como requisito duro en V1

1. planeacion automatica completa del dia;
2. generacion automatica de print jobs desde todos los modulos;
3. spooler totalmente autonomo;
4. integracion profunda con FOGO para todos los tipos de lote.

Eso puede vivir en V2 y V3.

## LOC y estaciones

No usaria LOC para representar cada paso de trabajo.

### LOC si

Solo para lugares donde algo puede quedarse fisicamente:

- `SEC-IN`
- `SEC-BASE`
- `SEC-MIX`
- `SEC-STG`

### LOC no

No crearia LOC para:

- `tamizado`
- `pesaje`
- `porcionado`

Esos deben existir como:

- estacion;
- tipo de movimiento;
- estado operativo.

## Etiquetas V1

### Etiqueta de contenedor base

Campos minimos:

- material
- codigo de contenedor
- lote origen
- peso neto
- fecha de preparacion
- responsable
- ubicacion
- estado

### Etiqueta de mezcla o porcion

Campos minimos:

- nombre de mezcla o kit
- codigo de lote o porcion
- peso neto
- fecha de preparacion
- responsable
- destino o uso
- referencia interna trazable

## Recomendacion de implementacion documental

No pisaria el documento conversacional como documento canonico.

### Mantener en paralelo

1. `Nuevo sistema Tamizaje.md`
- queda como insumo de discovery y conversacion.

2. `NEXO-V1-ESTACION-PREPARACION-SECA.md`
- queda como decision operativa y tecnica canonica.

## Decisiones cerradas con este documento

1. V1 se divide en **2 estaciones**: base y porcionado.
2. Un saco grande puede terminar en **varios contenedores base**.
3. El contenedor base es el buffer correcto para controlar cantidades y reposicion.
4. Las mezclas y porciones salen desde contenedores base, no desde sacos como proceso normal.
5. La receta completa puede quedar restringida a quien configura la mezcla, no a quien ejecuta la porcion.
6. El consumo de cada contenedor debe registrarse desde V1.

## Siguiente fase recomendada

1. Definir catalogo de contenedores reales.
2. Definir que materiales van siempre a `base_container`.
3. Definir que mezclas se producen semanalmente.
4. Diseñar las 2 etiquetas V1.
5. Diseñar la pantalla operativa minima para:
- crear contenedor base;
- consumir contenedor base;
- crear mezcla/porcion;
- reimprimir.
