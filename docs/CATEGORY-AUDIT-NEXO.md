# Auditoria de Categorias Nexo

## Objetivo
Estandarizar categorias para inventario y catalogo con un modelo unico:

- `domain` aplica solo cuando la categoria aplica a `venta`.
- Alcance de categoria: `global` (`site_id` nulo) o `sede` (`site_id` con valor).
- Aplicabilidad explicita por tipo: `insumo | preparacion | venta | equipo`.
- Una sola categoria por producto (`products.category_id`).

## Reglas Canonicas
1. `domain` no debe existir en categorias que no incluyan `venta`.
2. Toda categoria debe tener `applies_to_kinds` no vacio.
3. No deben existir categorias huerfanas (`parent_id` sin padre valido).
4. No deben existir productos sin categoria para el flujo operativo final.
5. La unicidad debe evaluarse por ruta y alcance (`site_id + parent_id + domain + name/slug`).

## Nota de contexto actual
El entorno auditado esta actualmente sin productos cargados (`products` vacio). En este estado:

- El backfill por uso real no aporta clasificacion.
- La clasificacion inicial debe apoyarse en semantica legacy de `domain` (`MENU` vs `INVENTORY`).
- Tras crear productos reales, volver a ejecutar esta auditoria para validar aplicabilidad final.

## SQL de Diagnostico

### 1) Cobertura por alcance y dominio
```sql
select
  case when pc.site_id is null then 'global' else 'sede' end as scope,
  coalesce(nullif(trim(pc.domain), ''), 'SIN_DOMINIO') as domain_code,
  count(*) as categories
from public.product_categories pc
group by 1, 2
order by 1, 2;
```
| scope  | domain_code | categories |
| ------ | ----------- | ---------- |
| global | INVENTORY   | 83         |
| global | MENU        | 13         |
| sede   | MENU        | 16         |

### 2) Cobertura por tipo aplicable
```sql
select
  kind,
  count(*) as categories
from public.product_categories pc
cross join lateral unnest(pc.applies_to_kinds) as kind
group by kind
order by kind;
```
| kind  | categories |
| ----- | ---------- |
| venta | 112        |

### 3) Uso real de categorias en productos
```sql
select
  pc.id as category_id,
  pc.name as category_name,
  count(p.id) as products_using
from public.product_categories pc
left join public.products p on p.category_id = pc.id
group by pc.id, pc.name
order by products_using desc, category_name asc;
```
| category_id                          | category_name                                               | products_using |
| ------------------------------------ | ----------------------------------------------------------- | -------------- |
| dd3ffe62-d767-72bf-3570-65a472d0c17c | Abarrotes y Despensa (Secos)                                | 0              |
| bc85ed2f-f2d8-40a6-93ae-03009c5ece6f | Aceites y Grasas                                            | 0              |
| 13043af3-f893-ac45-5b39-a68aeec5197c | ACTIVOS MENORES Y MENAJE (Smallwares)                       | 0              |
| d381cd0b-489f-414b-ac8b-9939b795f79a | Aderezos Fríos                                              | 0              |
| 0856ba7b-e67b-9859-41b4-82d361a94f1c | ALIMENTOS Y BEBIDAS (Materias Primas / Insumos)             | 0              |
| eabe4da6-c56c-21e8-4025-b00254b11f27 | ASEO, LIMPIEZA Y SEGURIDAD                                  | 0              |
| 3a14951c-aabf-4c54-9677-c835759519c0 | Aves                                                        | 0              |
| a61441c7-96e2-4f96-9dd4-17764dc3201a | Azúcares y Edulcorantes                                     | 0              |
| 0d428e6e-5406-48f9-a7ae-2f1cc4b0772c | Baños                                                       | 0              |
| 5a1065c6-ccc5-4c34-9543-66e5d7adb5ef | Barismo                                                     | 0              |
| 329fab3b-da6d-186f-4ed9-610dc1973c3f | Bases de Masa y Panadería (Crítico para Saudo y Vento Café) | 0              |
| 2618bca2-95c9-1871-1327-772a631d1f65 | Bases de Repostería y Rellenos                              | 0              |
| 5fb77038-90d8-53ef-ad9a-30ed659a2592 | Bebidas                                                     | 0              |
| 289c538d-601a-4b32-b9c4-97add71ad4c1 | Bebidas Listas (RTD)                                        | 0              |
| 9ac97e35-4929-4e1f-a13e-b5bb302de847 | BIKINIS                                                     | 0              |
| 05fc0877-e2df-477d-818f-84eea92c9069 | Bolsas                                                      | 0              |
| 2226befc-3cdf-4b59-823c-f58a65dad7b5 | BOWLS                                                       | 0              |
| 8f3d4085-ba82-473f-ab53-b209de0781a1 | Café                                                        | 0              |
| 304a38c9-4f56-40bf-a0e3-391ef336997a | Cajas                                                       | 0              |
| fc03b920-984d-fd17-5b7f-32cc3c066540 | CALIENTES                                                   | 0              |
| dee326cf-5677-43b4-be6d-681660235c25 | Carnes                                                      | 0              |
| 60ab14fb-b415-4acd-a3d9-67cce6b98c42 | Carnes Rojas                                                | 0              |
| a11c38aa-d984-4fa7-9c79-7094f08808ac | Cerdos                                                      | 0              |
| 91fa5a69-a47b-4be5-85b7-e86b0531e575 | Charcutería y Embutidos (Pizzería/Sandwichería)             | 0              |
| daeeb296-11d8-4c61-a26d-ad32a46153e3 | Chocolatería                                                | 0              |
| 3b1053d9-a3d6-46a5-b8d5-a3fedfa64390 | Cocina                                                      | 0              |
| 5984640e-010a-40ba-ba6e-91af39a01b92 | Cocina Caliente/Producción                                  | 0              |
| 94d617b1-61c9-e33e-33cd-6395ba254e59 | COCTELES                                                    | 0              |
| 133eb780-0f27-98c8-48cf-d6d590a72a42 | Comida                                                      | 0              |
| f6f25951-6be8-402f-899a-44a8f2a32db7 | CON ALCOHOL                                                 | 0              |
| c2215e5f-afdc-b566-3bec-f7a39b3100e2 | Consumibles de Servicio                                     | 0              |
| b26ad14a-c6ce-4e49-86a8-beb37c798f79 | Contenedores                                                | 0              |
| 309cbe6a-1c2f-49b3-b4d7-39e4c4b6f4a2 | Cortes Listos (IV Gama)                                     | 0              |
| adf3dd5b-af91-4ffc-9c1b-23be98d2787d | Cremas                                                      | 0              |
| c2d8fd1e-19c2-4842-9ac4-e9d78c74e7a7 | CROISSANTS                                                  | 0              |
| e6df2480-5ba3-4dfb-8649-737289ce500c | Cubiertos Desechables                                       | 0              |
| 4e5a9748-ce9c-4fca-a0a2-e0aa68d04e39 | Decoración Comestible                                       | 0              |
| 0fd68299-352e-239c-9dc4-b17366d003fe | DESAYUNOS                                                   | 0              |
| 3f6f43ba-d670-a160-cf9d-6c36af688a7b | Empaques para Delivery/Llevar                               | 0              |
| f9b30d66-aa10-bf8c-630c-b9098d78f340 | EMPAQUES Y DESECHABLES (Non-Food)                           | 0              |
| e37b26a4-ffc9-4d55-896b-a7755d10e4f7 | Enlatados y Conservas                                       | 0              |
| 76f79745-6d08-c308-3c61-5d88b57bb815 | ENSALADAS                                                   | 0              |
| dc743c05-f591-12f5-e58f-65bd88a6d1b0 | ENTRADAS                                                    | 0              |
| aaee8614-1f28-40ea-a270-74d8ea158954 | Especias y Condimentos Secos                                | 0              |
| b2faf4ca-66a1-4510-adcb-ec5b10e065b4 | Fermentos                                                   | 0              |
| 52e56c81-aa5a-96ed-21f5-d5a4b907c676 | FRÍAS                                                       | 0              |
| d7496092-d0c4-422f-a6f0-70cc454b24d2 | Frutas Frescas                                              | 0              |
| a0e8159b-4c01-4cf5-aada-5539d14dfd8a | Frutos Secos y Semillas                                     | 0              |
| 6490b326-3855-3f79-6d61-92f06defe59f | FUERTES                                                     | 0              |
| b840c26f-c52f-42d8-a402-a0f8431c8169 | General                                                     | 0              |
| 6c9ea1c8-c3cb-4f78-b912-d3d53d7e78db | Granos y Cereales                                           | 0              |
| 95c5f953-8218-4299-9a21-d36917806e59 | Harinas y Derivados                                         | 0              |
| 6c0a0211-cc09-c2ba-62c4-47ea40b85524 | HELADOS                                                     | 0              |
| 675783a3-f0b9-44b5-8e36-87dd8267ade9 | Herramientas                                                | 0              |
| 5a9cbecf-82f3-49ab-888a-6434a9cd6f0d | Hierbas Frescas                                             | 0              |
| 6fa3df53-dc2a-49e3-8640-f4f1108d3f75 | Hojas Verdes                                                | 0              |
| 27400416-3e34-4f58-b68f-c27ee34f4b3a | Huevos                                                      | 0              |
| b4aeadc5-c7de-2b06-8cec-ea105dd49a88 | Implementos de Aseo                                         | 0              |
| be672e96-fe98-4452-b24b-8a4f6a4708ef | Infusiones                                                  | 0              |
| 48a21981-00aa-be91-a106-01885437384f | Insumos Barista y Bebidas (Bar)                             | 0              |
| 48c3774f-7ad1-4622-ac65-d3668ab0028d | Insumos Bebidas                                             | 0              |
| 023ac8b9-632e-4cbb-a55e-b98e47de14df | Insumos Especializados de Repostería y Panadería            | 0              |
| fd7b3d34-6978-4650-aae2-c64a8fbec149 | Jarabes                                                     | 0              |
| ca549277-21a8-4d95-81b3-5cfb73a28744 | Jarabes y Siropes (Syrups)                                  | 0              |
| 47c01b43-01e5-51be-d522-4dcb42b317e4 | JUGOS                                                       | 0              |
| 3dc19eab-53ec-64e2-5adc-9da13fa649a0 | Lácteos y Refrigerados                                      | 0              |
| 1b9e5159-f23f-481b-8e0f-490d8c3204a6 | Leches y Cremas                                             | 0              |
| 2f34de93-f2aa-44c2-8b73-38b48377afea | Licores y Destilados                                        | 0              |
| 1f28e287-0df5-5810-db2a-57685b9ca5a0 | LIMONADAS                                                   | 0              |
| 6f37217d-a9be-a44c-f5a7-d5dec0e8ca40 | MALTEADAS                                                   | 0              |
| da570f9e-6a6c-4ccc-b2aa-9356e334d25a | Maquinaria y Equipos                                        | 0              |
| 1c1b82ab-8193-48b4-a46a-84e5a9b1e0c0 | Masas Crudas                                                | 0              |
| 5cdeda76-9a26-475e-9149-4ca19d36cfe2 | Mesa                                                        | 0              |
| 6924f022-c5f5-4de6-9f83-5cdd4e1a4ec2 | Mobiliario                                                  | 0              |
| aa507a2d-c350-7b8f-7ee2-cd26c8119ff0 | Otros                                                       | 0              |
| eca5a77d-68be-a9dc-d0bd-00d579c647b7 | OTROS                                                       | 0              |
| 13b2ddd0-6a62-488b-98d6-0a56cf456bc5 | PAN & BRUNCH                                                | 0              |
| 0bb260b0-7449-4504-aaf7-0246f57f24c6 | Panadería Pre-cocida                                        | 0              |
| 6be26077-712a-415c-84e6-09c901a55541 | PANCAKES & WAFFLES                                          | 0              |
| 780e0846-8a19-473c-ae67-bcd826f68a8e | Papeles                                                     | 0              |
| fb0cf648-98e2-0bb7-ff7e-9aac2fd8d075 | Papeles y Plásticos de Cocina (Insumos Operativos)          | 0              |
| 7a6e5740-a406-b233-a37d-e8c3f2ace5a2 | PARA COMPARTIR                                              | 0              |
| b4eb9d6d-a51c-3c72-2d23-53280bb3e5f5 | Perecederos: Frutas y Verduras (Fruver)                     | 0              |
| 4c6d37fb-fa3c-c89b-4622-b47529060f7a | Perecederos: Proteínas                                      | 0              |
| 33c7d7d9-47a7-4c8d-bee5-d15438148440 | Pescados y Mariscos                                         | 0              |
| 45337691-7885-421f-8938-75b1a0fb5ebd | PIZZAS                                                      | 0              |
| a2cf02df-1fac-4912-a541-8d0b283cc9df | Pollo                                                       | 0              |
| 5ddaaeda-b2e6-629a-03ca-3e75976c5931 | Postres                                                     | 0              |
| 0da47ff8-6828-4c92-7a65-66594fb1a08e | PREPARACIONES / SEMI-ELABORADOS (Work In Progress - WIP)    | 0              |
| 35c623d9-9b6f-126c-d7a5-a3069e0dc0bc | Proteínas Procesadas (Mise en Place)                        | 0              |
| bf53f6e2-5733-4372-9bed-54b59356993e | Quesos Frescos/Blandos                                      | 0              |
| 8a7c8558-7bf3-425b-8f0e-e530d14d6593 | Quesos Maduros/Duros                                        | 0              |
| 6bf9b40e-7b5b-9424-95bb-724906bcec90 | Químicos                                                    | 0              |
| 8727ec9d-d713-419b-b895-e84fa1b9473f | Rellenos de Fruta                                           | 0              |
| 772f4ea7-7861-43c1-9e12-4abec65ebd1a | Rellenos Industriales                                       | 0              |
| 95003309-1820-48cf-a269-83f8e3de4a0f | Saborizantes y Extractos                                    | 0              |
| e3b64f52-79a4-4611-98c1-a8075b9506f6 | Salsas Blancas/Cremosas                                     | 0              |
| a10fe34c-ee53-56a9-d433-6ed29d15bee6 | Salsas Madre y Aderezos (Batch)                             | 0              |
| fbf0d124-f22f-4d49-9d21-bfe23afcdf0e | Salsas Rojas                                                | 0              |
| 1be27a87-9eaa-40e3-9caa-c8197ccb3fa7 | Salsas y Condimentos Líquidos                               | 0              |

### 4) Productos sin categoria
```sql
select
  count(*) as products_without_category
from public.products p
where p.category_id is null;
```
| products_without_category |
| ------------------------- |
| 0                         |

### 5) Dominio usado fuera de venta (inconsistencia)
```sql
select
  p.id as product_id,
  p.name as product_name,
  p.product_type,
  pip.inventory_kind,
  pc.id as category_id,
  pc.name as category_name,
  pc.domain
from public.products p
left join public.product_inventory_profiles pip on pip.product_id = p.id
join public.product_categories pc on pc.id = p.category_id
where nullif(trim(pc.domain), '') is not null
  and not (
    lower(coalesce(p.product_type, '')) = 'venta'
  );
```
No arrojó resultados

### 6) Categorias huerfanas en el arbol
```sql
select
  child.id,
  child.name,
  child.parent_id
from public.product_categories child
left join public.product_categories parent on parent.id = child.parent_id
where child.parent_id is not null
  and parent.id is null;
```
No arrojó resultados

### 7) Duplicidad funcional por alcance/ruta
```sql
select
  coalesce(pc.site_id::text, 'GLOBAL') as scope_site,
  coalesce(pc.parent_id::text, 'ROOT') as scope_parent,
  coalesce(nullif(trim(pc.domain), ''), 'SIN_DOMINIO') as scope_domain,
  lower(trim(pc.name)) as normalized_name,
  count(*) as duplicates
from public.product_categories pc
group by 1, 2, 3, 4
having count(*) > 1
order by duplicates desc, normalized_name asc;
```
No arrojó resultados

### 8) Cola de revision (sin uso + tipos ambiguos)
```sql
with usage_count as (
  select
    p.category_id,
    count(*) as product_count
  from public.products p
  where p.category_id is not null
  group by p.category_id
)
select
  pc.id,
  pc.name,
  pc.site_id,
  pc.domain,
  pc.applies_to_kinds,
  coalesce(u.product_count, 0) as product_count
from public.product_categories pc
left join usage_count u on u.category_id = pc.id
where coalesce(u.product_count, 0) = 0
order by pc.name asc;
```
| id                                   | name                                                        | site_id                              | domain    | applies_to_kinds | product_count |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------------ | --------- | ---------------- | ------------- |
| dd3ffe62-d767-72bf-3570-65a472d0c17c | Abarrotes y Despensa (Secos)                                | null                                 | INVENTORY | ["venta"]        | 0             |
| bc85ed2f-f2d8-40a6-93ae-03009c5ece6f | Aceites y Grasas                                            | null                                 | INVENTORY | ["venta"]        | 0             |
| 13043af3-f893-ac45-5b39-a68aeec5197c | ACTIVOS MENORES Y MENAJE (Smallwares)                       | null                                 | INVENTORY | ["venta"]        | 0             |
| d381cd0b-489f-414b-ac8b-9939b795f79a | Aderezos Fríos                                              | null                                 | INVENTORY | ["venta"]        | 0             |
| 0856ba7b-e67b-9859-41b4-82d361a94f1c | ALIMENTOS Y BEBIDAS (Materias Primas / Insumos)             | null                                 | INVENTORY | ["venta"]        | 0             |
| eabe4da6-c56c-21e8-4025-b00254b11f27 | ASEO, LIMPIEZA Y SEGURIDAD                                  | null                                 | INVENTORY | ["venta"]        | 0             |
| 3a14951c-aabf-4c54-9677-c835759519c0 | Aves                                                        | null                                 | INVENTORY | ["venta"]        | 0             |
| a61441c7-96e2-4f96-9dd4-17764dc3201a | Azúcares y Edulcorantes                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| 0d428e6e-5406-48f9-a7ae-2f1cc4b0772c | Baños                                                       | null                                 | INVENTORY | ["venta"]        | 0             |
| 5a1065c6-ccc5-4c34-9543-66e5d7adb5ef | Barismo                                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| 329fab3b-da6d-186f-4ed9-610dc1973c3f | Bases de Masa y Panadería (Crítico para Saudo y Vento Café) | null                                 | INVENTORY | ["venta"]        | 0             |
| 2618bca2-95c9-1871-1327-772a631d1f65 | Bases de Repostería y Rellenos                              | null                                 | INVENTORY | ["venta"]        | 0             |
| 5fb77038-90d8-53ef-ad9a-30ed659a2592 | Bebidas                                                     | null                                 | MENU      | ["venta"]        | 0             |
| 289c538d-601a-4b32-b9c4-97add71ad4c1 | Bebidas Listas (RTD)                                        | null                                 | INVENTORY | ["venta"]        | 0             |
| 9ac97e35-4929-4e1f-a13e-b5bb302de847 | BIKINIS                                                     | 58362682-4ea3-4718-bd83-b4f311f885cd | MENU      | ["venta"]        | 0             |
| 05fc0877-e2df-477d-818f-84eea92c9069 | Bolsas                                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| 2226befc-3cdf-4b59-823c-f58a65dad7b5 | BOWLS                                                       | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| 8f3d4085-ba82-473f-ab53-b209de0781a1 | Café                                                        | null                                 | INVENTORY | ["venta"]        | 0             |
| 304a38c9-4f56-40bf-a0e3-391ef336997a | Cajas                                                       | null                                 | INVENTORY | ["venta"]        | 0             |
| fc03b920-984d-fd17-5b7f-32cc3c066540 | CALIENTES                                                   | null                                 | MENU      | ["venta"]        | 0             |
| dee326cf-5677-43b4-be6d-681660235c25 | Carnes                                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| 60ab14fb-b415-4acd-a3d9-67cce6b98c42 | Carnes Rojas                                                | null                                 | INVENTORY | ["venta"]        | 0             |
| a11c38aa-d984-4fa7-9c79-7094f08808ac | Cerdos                                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| 91fa5a69-a47b-4be5-85b7-e86b0531e575 | Charcutería y Embutidos (Pizzería/Sandwichería)             | null                                 | INVENTORY | ["venta"]        | 0             |
| daeeb296-11d8-4c61-a26d-ad32a46153e3 | Chocolatería                                                | null                                 | INVENTORY | ["venta"]        | 0             |
| 3b1053d9-a3d6-46a5-b8d5-a3fedfa64390 | Cocina                                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| 5984640e-010a-40ba-ba6e-91af39a01b92 | Cocina Caliente/Producción                                  | null                                 | INVENTORY | ["venta"]        | 0             |
| 94d617b1-61c9-e33e-33cd-6395ba254e59 | COCTELES                                                    | null                                 | MENU      | ["venta"]        | 0             |
| 133eb780-0f27-98c8-48cf-d6d590a72a42 | Comida                                                      | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| f6f25951-6be8-402f-899a-44a8f2a32db7 | CON ALCOHOL                                                 | null                                 | MENU      | ["venta"]        | 0             |
| c2215e5f-afdc-b566-3bec-f7a39b3100e2 | Consumibles de Servicio                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| b26ad14a-c6ce-4e49-86a8-beb37c798f79 | Contenedores                                                | null                                 | INVENTORY | ["venta"]        | 0             |
| 309cbe6a-1c2f-49b3-b4d7-39e4c4b6f4a2 | Cortes Listos (IV Gama)                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| adf3dd5b-af91-4ffc-9c1b-23be98d2787d | Cremas                                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| c2d8fd1e-19c2-4842-9ac4-e9d78c74e7a7 | CROISSANTS                                                  | null                                 | MENU      | ["venta"]        | 0             |
| e6df2480-5ba3-4dfb-8649-737289ce500c | Cubiertos Desechables                                       | null                                 | INVENTORY | ["venta"]        | 0             |
| 4e5a9748-ce9c-4fca-a0a2-e0aa68d04e39 | Decoración Comestible                                       | null                                 | INVENTORY | ["venta"]        | 0             |
| 0fd68299-352e-239c-9dc4-b17366d003fe | DESAYUNOS                                                   | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| 3f6f43ba-d670-a160-cf9d-6c36af688a7b | Empaques para Delivery/Llevar                               | null                                 | INVENTORY | ["venta"]        | 0             |
| f9b30d66-aa10-bf8c-630c-b9098d78f340 | EMPAQUES Y DESECHABLES (Non-Food)                           | null                                 | INVENTORY | ["venta"]        | 0             |
| e37b26a4-ffc9-4d55-896b-a7755d10e4f7 | Enlatados y Conservas                                       | null                                 | INVENTORY | ["venta"]        | 0             |
| 76f79745-6d08-c308-3c61-5d88b57bb815 | ENSALADAS                                                   | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| dc743c05-f591-12f5-e58f-65bd88a6d1b0 | ENTRADAS                                                    | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| aaee8614-1f28-40ea-a270-74d8ea158954 | Especias y Condimentos Secos                                | null                                 | INVENTORY | ["venta"]        | 0             |
| b2faf4ca-66a1-4510-adcb-ec5b10e065b4 | Fermentos                                                   | null                                 | INVENTORY | ["venta"]        | 0             |
| 52e56c81-aa5a-96ed-21f5-d5a4b907c676 | FRÍAS                                                       | null                                 | MENU      | ["venta"]        | 0             |
| d7496092-d0c4-422f-a6f0-70cc454b24d2 | Frutas Frescas                                              | null                                 | INVENTORY | ["venta"]        | 0             |
| a0e8159b-4c01-4cf5-aada-5539d14dfd8a | Frutos Secos y Semillas                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| 6490b326-3855-3f79-6d61-92f06defe59f | FUERTES                                                     | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| b840c26f-c52f-42d8-a402-a0f8431c8169 | General                                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| 6c9ea1c8-c3cb-4f78-b912-d3d53d7e78db | Granos y Cereales                                           | null                                 | INVENTORY | ["venta"]        | 0             |
| 95c5f953-8218-4299-9a21-d36917806e59 | Harinas y Derivados                                         | null                                 | INVENTORY | ["venta"]        | 0             |
| 6c0a0211-cc09-c2ba-62c4-47ea40b85524 | HELADOS                                                     | null                                 | MENU      | ["venta"]        | 0             |
| 675783a3-f0b9-44b5-8e36-87dd8267ade9 | Herramientas                                                | null                                 | INVENTORY | ["venta"]        | 0             |
| 5a9cbecf-82f3-49ab-888a-6434a9cd6f0d | Hierbas Frescas                                             | null                                 | INVENTORY | ["venta"]        | 0             |
| 6fa3df53-dc2a-49e3-8640-f4f1108d3f75 | Hojas Verdes                                                | null                                 | INVENTORY | ["venta"]        | 0             |
| 27400416-3e34-4f58-b68f-c27ee34f4b3a | Huevos                                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| b4aeadc5-c7de-2b06-8cec-ea105dd49a88 | Implementos de Aseo                                         | null                                 | INVENTORY | ["venta"]        | 0             |
| be672e96-fe98-4452-b24b-8a4f6a4708ef | Infusiones                                                  | null                                 | INVENTORY | ["venta"]        | 0             |
| 48a21981-00aa-be91-a106-01885437384f | Insumos Barista y Bebidas (Bar)                             | null                                 | INVENTORY | ["venta"]        | 0             |
| 48c3774f-7ad1-4622-ac65-d3668ab0028d | Insumos Bebidas                                             | null                                 | INVENTORY | ["venta"]        | 0             |
| 023ac8b9-632e-4cbb-a55e-b98e47de14df | Insumos Especializados de Repostería y Panadería            | null                                 | INVENTORY | ["venta"]        | 0             |
| fd7b3d34-6978-4650-aae2-c64a8fbec149 | Jarabes                                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| ca549277-21a8-4d95-81b3-5cfb73a28744 | Jarabes y Siropes (Syrups)                                  | null                                 | INVENTORY | ["venta"]        | 0             |
| 47c01b43-01e5-51be-d522-4dcb42b317e4 | JUGOS                                                       | null                                 | MENU      | ["venta"]        | 0             |
| 3dc19eab-53ec-64e2-5adc-9da13fa649a0 | Lácteos y Refrigerados                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| 1b9e5159-f23f-481b-8e0f-490d8c3204a6 | Leches y Cremas                                             | null                                 | INVENTORY | ["venta"]        | 0             |
| 2f34de93-f2aa-44c2-8b73-38b48377afea | Licores y Destilados                                        | null                                 | INVENTORY | ["venta"]        | 0             |
| 1f28e287-0df5-5810-db2a-57685b9ca5a0 | LIMONADAS                                                   | null                                 | MENU      | ["venta"]        | 0             |
| 6f37217d-a9be-a44c-f5a7-d5dec0e8ca40 | MALTEADAS                                                   | null                                 | MENU      | ["venta"]        | 0             |
| da570f9e-6a6c-4ccc-b2aa-9356e334d25a | Maquinaria y Equipos                                        | null                                 | INVENTORY | ["venta"]        | 0             |
| 1c1b82ab-8193-48b4-a46a-84e5a9b1e0c0 | Masas Crudas                                                | null                                 | INVENTORY | ["venta"]        | 0             |
| 5cdeda76-9a26-475e-9149-4ca19d36cfe2 | Mesa                                                        | null                                 | INVENTORY | ["venta"]        | 0             |
| 6924f022-c5f5-4de6-9f83-5cdd4e1a4ec2 | Mobiliario                                                  | null                                 | INVENTORY | ["venta"]        | 0             |
| aa507a2d-c350-7b8f-7ee2-cd26c8119ff0 | Otros                                                       | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| eca5a77d-68be-a9dc-d0bd-00d579c647b7 | OTROS                                                       | null                                 | MENU      | ["venta"]        | 0             |
| 13b2ddd0-6a62-488b-98d6-0a56cf456bc5 | PAN & BRUNCH                                                | 58362682-4ea3-4718-bd83-b4f311f885cd | MENU      | ["venta"]        | 0             |
| 0bb260b0-7449-4504-aaf7-0246f57f24c6 | Panadería Pre-cocida                                        | null                                 | INVENTORY | ["venta"]        | 0             |
| 6be26077-712a-415c-84e6-09c901a55541 | PANCAKES & WAFFLES                                          | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| 780e0846-8a19-473c-ae67-bcd826f68a8e | Papeles                                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| fb0cf648-98e2-0bb7-ff7e-9aac2fd8d075 | Papeles y Plásticos de Cocina (Insumos Operativos)          | null                                 | INVENTORY | ["venta"]        | 0             |
| 7a6e5740-a406-b233-a37d-e8c3f2ace5a2 | PARA COMPARTIR                                              | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| b4eb9d6d-a51c-3c72-2d23-53280bb3e5f5 | Perecederos: Frutas y Verduras (Fruver)                     | null                                 | INVENTORY | ["venta"]        | 0             |
| 4c6d37fb-fa3c-c89b-4622-b47529060f7a | Perecederos: Proteínas                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| 33c7d7d9-47a7-4c8d-bee5-d15438148440 | Pescados y Mariscos                                         | null                                 | INVENTORY | ["venta"]        | 0             |
| 45337691-7885-421f-8938-75b1a0fb5ebd | PIZZAS                                                      | 58362682-4ea3-4718-bd83-b4f311f885cd | MENU      | ["venta"]        | 0             |
| a2cf02df-1fac-4912-a541-8d0b283cc9df | Pollo                                                       | null                                 | INVENTORY | ["venta"]        | 0             |
| 5ddaaeda-b2e6-629a-03ca-3e75976c5931 | Postres                                                     | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| 0da47ff8-6828-4c92-7a65-66594fb1a08e | PREPARACIONES / SEMI-ELABORADOS (Work In Progress - WIP)    | null                                 | INVENTORY | ["venta"]        | 0             |
| 35c623d9-9b6f-126c-d7a5-a3069e0dc0bc | Proteínas Procesadas (Mise en Place)                        | null                                 | INVENTORY | ["venta"]        | 0             |
| bf53f6e2-5733-4372-9bed-54b59356993e | Quesos Frescos/Blandos                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| 8a7c8558-7bf3-425b-8f0e-e530d14d6593 | Quesos Maduros/Duros                                        | null                                 | INVENTORY | ["venta"]        | 0             |
| 6bf9b40e-7b5b-9424-95bb-724906bcec90 | Químicos                                                    | null                                 | INVENTORY | ["venta"]        | 0             |
| 8727ec9d-d713-419b-b895-e84fa1b9473f | Rellenos de Fruta                                           | null                                 | INVENTORY | ["venta"]        | 0             |
| 772f4ea7-7861-43c1-9e12-4abec65ebd1a | Rellenos Industriales                                       | null                                 | INVENTORY | ["venta"]        | 0             |
| 95003309-1820-48cf-a269-83f8e3de4a0f | Saborizantes y Extractos                                    | null                                 | INVENTORY | ["venta"]        | 0             |
| e3b64f52-79a4-4611-98c1-a8075b9506f6 | Salsas Blancas/Cremosas                                     | null                                 | INVENTORY | ["venta"]        | 0             |
| a10fe34c-ee53-56a9-d433-6ed29d15bee6 | Salsas Madre y Aderezos (Batch)                             | null                                 | INVENTORY | ["venta"]        | 0             |
| fbf0d124-f22f-4d49-9d21-bfe23afcdf0e | Salsas Rojas                                                | null                                 | INVENTORY | ["venta"]        | 0             |
| 1be27a87-9eaa-40e3-9caa-c8197ccb3fa7 | Salsas y Condimentos Líquidos                               | null                                 | INVENTORY | ["venta"]        | 0             |
| 86faeb53-2b2d-5f20-ef9f-ad92525e9e84 | SANDWICH                                                    | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| 710b8e2e-11b2-49b5-87f5-2ed3b34458f0 | Servicio a la Mesa (Vajilla)                                | null                                 | INVENTORY | ["venta"]        | 0             |
| e9ed5794-efab-b7bd-e5af-14928c9b6cf5 | SMOOTHIE                                                    | null                                 | MENU      | ["venta"]        | 0             |
| bf2d34b5-dddd-c010-95b9-0e6ff4444fce | SODAS                                                       | null                                 | MENU      | ["venta"]        | 0             |
| e215fa89-7f8a-6868-5b58-3ea57fbad2e2 | SOPAS                                                       | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| 01f858dd-cdb3-4ee7-8b76-25153a24e3ef | Textiles                                                    | null                                 | INVENTORY | ["venta"]        | 0             |
| e424da27-9d4b-b7c1-a15a-b2ceb829409e | TOSTADAS                                                    | 7da218c3-fbf2-4f5d-b033-2fa9a40f767c | MENU      | ["venta"]        | 0             |
| 29d6ae04-e30b-45b1-97b9-08896888d5eb | Varios                                                      | null                                 | INVENTORY | ["venta"]        | 0             |
| 5205cb6f-85e5-4e33-8ea7-9d3e8ddad9b3 | Vasos y empaques para bebidas                               | null                                 | INVENTORY | ["venta"]        | 0             |
| 98e23232-eeca-41cc-903a-82aacfead4bf | Vegetales Cocidos                                           | null                                 | INVENTORY | ["venta"]        | 0             |
| 4feb9e81-223f-1ebc-3f1b-edd5250b9df4 | Vegetales Procesados (Cortes y Cocciones)                   | null                                 | INVENTORY | ["venta"]        | 0             |
| 2bd01a9d-5b50-4389-a072-0093951adfe7 | Verduras Base                                               | null                                 | INVENTORY | ["venta"]        | 0             |

## Matriz Operativa Recomendada
Consolidar resultados en una matriz por `tipo x sede`:

- Filas: `insumo`, `preparacion`, `venta`, `equipo`.
- Columnas: `global`, cada `site_id` activo.
- Celdas: categorias activas, categorias faltantes, categorias sobrantes y duplicadas.

## Checklist de Ejecucion
1. Ejecutar los 8 queries y guardar evidencia.
2. Resolver duplicados de ruta/alcance antes de constraints estrictas.
3. Corregir productos sin categoria o con categoria invalida por tipo.
4. Revisar cola de categorias sin uso y decidir `mantener | fusionar | desactivar`.
5. Activar validaciones duras de DB y publicar el dashboard de salud en `/inventory/settings/categories`.
