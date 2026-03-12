# Modelo Canónico de Categorías y Oferta Comercial

Estado: `Canónico propuesto`
Fecha: `2026-03-11`
Scope: `NEXO + catálogo maestro + futuro POS/Pass/Viso`

## 1. Problema real

Hoy `products.category_id` obliga a que un producto tenga una sola categoría. Eso funciona solo si una sola categoría responde todas estas preguntas al mismo tiempo:

- ¿qué es este producto operativamente?
- ¿en qué negocio se vende?
- ¿en qué categoría comercial aparece?
- ¿cómo lo quiero mostrar al cliente?
- ¿cómo lo agrupo para reportes?

En un restaurante o grupo con varias marcas, eso no es cierto.

## 2. Ejemplo del croissant

El croissant puede ser el mismo producto maestro, pero aparecer en catálogos distintos:

| Nivel | Ejemplo |
| --- | --- |
| Producto maestro | `Croissant mantequilla` |
| Categoría operativa | `Venta > Panadería laminada > Croissants` |
| Negocio / contexto 1 | `Vento Cafe / Menu principal` |
| Categoría comercial 1 | `Bollería` |
| Negocio / contexto 2 | `Saudo / Vitrina` |
| Categoría comercial 2 | `Vitrina` |
| Negocio / contexto 3 | `Molka / Bakery` |
| Categoría comercial 3 | `Panadería` |

No son tres productos. Son tres ofertas comerciales del mismo producto maestro.

## 3. Diagnóstico de raíz

La falla no es "falta otra categoría". La falla es que hoy un solo campo intenta mezclar:

1. taxonomía canónica;
2. merchandising por negocio;
3. segmentación comercial;
4. reporting.

Eso produce remaches inevitables.

## 4. Decisión canónica

### 4.1 Qué es `products`

`products` debe representar el producto maestro.

Debe contener solo atributos relativamente estables del ítem físico/operativo:

- nombre canónico;
- SKU maestro;
- unidad base y unidad de stock;
- tipo (`venta`, `insumo`, `preparacion`, `equipo`);
- receta o relación productiva cuando aplique;
- imagen maestra opcional;
- categoría operativa canónica.

### 4.2 Qué NO debe vivir en `products`

No debe vivir en `products` nada que cambie por negocio, marca, sede o canal:

- categoría comercial;
- precio final por negocio;
- nombre visible por marca;
- foto promocional por canal;
- orden en menú;
- visibilidad por catálogo;
- badges, destacados o etiquetas comerciales.

## 5. Modelo definitivo

### 5.1 Capa 1 — Producto maestro

Tabla actual: `products`

Regla:

- un producto maestro representa una identidad operativa única.
- si cambia receta, composición base, unidad operativa o comportamiento de inventario, probablemente ya es otro producto maestro.

### 5.2 Capa 2 — Categoría operativa canónica

Tabla actual: `product_categories`

Regla:

- `products.category_id` se interpreta como `primary_operational_category_id` aunque el nombre físico de la columna siga igual en `v1`.
- esta categoría clasifica el producto para inventario, abastecimiento, producción y reporting base.
- debe tender a ser global y estable.
- no debe usarse para resolver cómo se ve el producto en cada negocio.

### 5.3 Capa 3 — Contexto comercial

Nueva tabla propuesta: `catalog_contexts`

Representa el lugar lógico donde un producto se oferta.

Ejemplos:

- `vcf_menu_principal`
- `sau_vitrina`
- `mka_bakery`
- `vcf_rappi`
- `club_rewards`

Campos sugeridos:

- `id`
- `code`
- `name`
- `business_code` o `brand_code`
- `site_id` opcional
- `channel_code` opcional
- `is_active`

La clave es esta: la categoría comercial cuelga del contexto, no del producto maestro.

### 5.4 Capa 4 — Oferta comercial

Nueva tabla propuesta: `product_offerings`

Representa el producto maestro dentro de un contexto comercial.

Campos sugeridos:

- `id`
- `catalog_context_id`
- `product_id`
- `display_name`
- `short_description`
- `price`
- `currency`
- `image_url`
- `is_active`
- `display_order`

Regla:

- un mismo `product_id` puede tener múltiples `product_offerings`.
- eso permite que el croissant sea el mismo producto, pero tenga nombre, precio o copy distinto por negocio/canal.

### 5.5 Capa 5 — Categorías comerciales

Nueva tabla propuesta: `commercial_categories`

Campos sugeridos:

- `id`
- `catalog_context_id`
- `parent_id`
- `name`
- `slug`
- `description`
- `is_active`
- `display_order`

Regla:

- cada árbol comercial pertenece a un contexto.
- `Bollería` en `Vento Cafe` no es la misma categoría que `Vitrina` en `Saudo`, aunque apunten al mismo producto maestro.

### 5.6 Capa 6 — Asignación categoría comercial ↔ oferta

Nueva tabla propuesta: `product_offering_category_assignments`

Campos sugeridos:

- `id`
- `product_offering_id`
- `commercial_category_id`
- `is_primary`
- `display_order`

Reglas:

- una oferta puede pertenecer a varias categorías comerciales.
- debe existir máximo una categoría primaria por oferta dentro del mismo contexto.
- esto permite casos como un producto visible en `Bollería` y `Desayunos`, sin duplicar producto.

## 6. Qué pasa con el ejemplo del croissant

### Correcto

- `products`: una fila para `Croissant mantequilla`.
- `products.category_id`: una categoría operativa canónica.
- `product_offerings`: una fila para `VCF`, otra para `SAU`, otra para `MKA`.
- `commercial_categories`: categorías propias de cada contexto.
- `product_offering_category_assignments`: enlaza cada offering a su categoría comercial.

### Incorrecto

- duplicar el producto solo porque cambia la categoría comercial;
- permitir múltiples categorías directas en `products` para resolver ventas;
- seguir usando `domain/site_id` en la categoría maestra como sustituto de contexto comercial.

## 7. Qué se conserva y qué cambia

### Se conserva

- `products`
- `product_site_settings` como configuración operativa por sede
- `product_categories` como taxonomía canónica

### Se reinterpreta

- `products.category_id` deja de significar "categoría visible del negocio" y pasa a significar "categoría operativa primaria".

### Se agrega en `v2`

- `catalog_contexts`
- `product_offerings`
- `commercial_categories`
- `product_offering_category_assignments`

## 8. Impacto en UI

### Crear producto en `NEXO`

El flujo correcto debe quedar así:

1. Crear producto maestro.
2. Elegir categoría operativa canónica.
3. Configurar inventario y abastecimiento por sede.
4. Si el producto es vendible, configurar ofertas comerciales por contexto.

Eso significa que la pregunta "¿en qué categoría aparece este producto en Saudo o Vento Cafe?" no debe vivir en el paso base de creación del producto maestro.

### Editar producto

La ficha debe separarse en pestañas o bloques distintos:

- Maestro
- Operación
- Abastecimiento por sede
- Ofertas comerciales
- Producción

## 9. Qué hacer con el modelo actual

### `v1`

- mantener `products.category_id` para no romper flujos;
- tratar esa categoría como operativa/canónica;
- evitar seguir creando árboles comerciales dentro de la misma lógica;
- no expandir más `domain` y `site_id` como solución principal.

### `v2`

- crear contexto comercial y offerings;
- mover precio, nombre visible y categoría comercial al offering;
- empezar a sacar lógica comercial de `products`;
- reemplazar uso duro de `audience` por contexto/oferta.

### `v3`

- hacer que `Pulso`, `Pass` y `Viso` consuman `product_offerings` y no el producto maestro directamente para navegación y merchandising.

## 10. Regla para saber si algo es el mismo producto o no

Debe seguir siendo el mismo `product_id` si comparten:

- identidad física base;
- receta o composición base equivalente;
- unidad operativa y comportamiento de inventario;
- trazabilidad y costo como el mismo item base.

Probablemente debe ser otro `product_id` si cambia:

- receta/BOM real;
- unidad o yield operativo;
- tratamiento de inventario;
- presentación física que obliga a otra trazabilidad.

Precio, categoría comercial, foto, copy y orden de menú no justifican otro producto maestro.

## 11. Anti-patrones prohibidos

No hacer:

1. `products` con varias categorías directas para resolver catálogos.
2. categorías maestras duplicadas por cada negocio solo para fines comerciales.
3. campos tipo `category_domain = SAU/VCF/MOLKA/...` como solución permanente del catálogo.
4. seguir metiendo reglas de negocio dentro del core de inventario.
5. usar JSON libre para resolver asignaciones comerciales.

## 12. Decisión final recomendada

La decisión definitiva y escalable es esta:

- un solo producto maestro;
- una sola categoría operativa primaria;
- cero o muchas ofertas comerciales por contexto;
- una o muchas categorías comerciales por oferta;
- separación estricta entre operación e interfaz de venta.

Ese modelo resuelve el croissant, pero también resuelve de una vez:

- precios distintos por negocio;
- nombres visibles distintos;
- menús distintos por canal;
- vitrinas distintas por marca;
- promociones y filtros sin duplicar catálogo;
- reporting más limpio.
