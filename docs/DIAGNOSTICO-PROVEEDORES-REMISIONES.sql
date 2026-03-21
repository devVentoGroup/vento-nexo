-- Diagnostico rapido: proveedores + remisiones
-- Ejecuta en SQL Editor de Supabase sobre NEXO.

-- 1) Productos con proveedores pero sin proveedor primario.
select
  ps.product_id,
  p.name as product_name,
  count(*) as suppliers_count
from public.product_suppliers ps
join public.products p on p.id = ps.product_id
group by ps.product_id, p.name
having sum(case when coalesce(ps.is_primary, false) then 1 else 0 end) = 0
order by p.name;

"No arrojó nada"

-- 2) Productos con mas de un primario (inconsistencia).
select
  ps.product_id,
  p.name as product_name,
  sum(case when coalesce(ps.is_primary, false) then 1 else 0 end) as primary_count
from public.product_suppliers ps
join public.products p on p.id = ps.product_id
group by ps.product_id, p.name
having sum(case when coalesce(ps.is_primary, false) then 1 else 0 end) > 1
order by primary_count desc, p.name;

"No arrojó nada"

-- 3) Insumos/reventa sin proveedor configurado.
select
  p.id,
  p.name,
  p.product_type,
  pip.inventory_kind
from public.products p
join public.product_inventory_profiles pip on pip.product_id = p.id
left join public.product_suppliers ps on ps.product_id = p.id
where p.is_active = true
  and (
    (p.product_type = 'insumo' and coalesce(pip.inventory_kind, '') <> 'asset')
    or (p.product_type = 'venta' and coalesce(pip.inventory_kind, '') = 'resale')
  )
group by p.id, p.name, p.product_type, pip.inventory_kind
having count(ps.id) = 0
order by p.name;

"| id                                   | name                            | product_type | inventory_kind |
| ------------------------------------ | ------------------------------- | ------------ | -------------- |
| 03d31f01-6293-49ed-9c7c-18a082df02df | Aceite de Oliva                 | insumo       | ingredient     |
| 9f6297ee-2841-471e-954c-4e79b5470867 | Aceite Vegetal                  | insumo       | ingredient     |
| 67e563ef-893e-4ad1-b53e-72fb562608ce | Albahaca                        | insumo       | ingredient     |
| f0956e68-0094-4682-87b3-c12822dd1328 | Alcaparras Baby                 | insumo       | ingredient     |
| 0dd8cd7b-6ccb-4d6d-93af-80a0bd21bfea | Almendra Fileteada              | insumo       | ingredient     |
| 6e7dbe51-784e-427c-9874-4237c9e52816 | Almidón de Maíz                 | insumo       | ingredient     |
| f96fb6fd-7122-4048-b7d8-584bedbe124d | Almidón de Yuca                 | insumo       | ingredient     |
| 97c043c4-39a3-4558-99af-274cd40bc066 | Amarenas                        | insumo       | ingredient     |
| 608c46a5-3449-456f-bca2-0ae7c21f2f3b | Amaretto                        | insumo       | ingredient     |
| 6a9f4521-649a-4ab4-8c25-1ff582a94610 | Amaretto                        | insumo       | ingredient     |
| 83815b30-8a7e-49d7-8bcd-2912ff119351 | Aperol                          | insumo       | ingredient     |
| 5c28775c-7de0-469b-8855-97815aac40f5 | Arándanos                       | insumo       | ingredient     |
| b4d56187-0be9-4956-b4aa-0259f939c388 | Arequipe                        | insumo       | ingredient     |
| 0469cca9-088c-44ba-a485-39dcaae4353c | Arroz Blanco                    | insumo       | ingredient     |
| 6020f9ef-9bc0-4a65-87f6-c4d84f601f4b | Azucar Blanca                   | insumo       | ingredient     |
| 4f45a711-ae30-4188-be07-a0a94373fe64 | Azúcar Morena                   | insumo       | ingredient     |
| 2fe2ef20-871b-43c0-a302-b4ab71681174 | Azúcar Pulverizada              | insumo       | ingredient     |
| b3575318-3c20-4924-8b93-83186de765fa | Azúcar Tubipak                  | insumo       | ingredient     |
| 66d54c27-834e-4ab4-9100-7b128dbb62ae | Base Bowl 1300                  | insumo       | ingredient     |
| 08c44196-46f3-4b6a-9ed6-d96bb3d6e26e | Base Bowl 750                   | insumo       | ingredient     |
| eb9487eb-1c12-450c-9037-c6dc446405bf | Base Capri                      | insumo       | ingredient     |
| b6a1a340-1f13-4cdf-9902-65fdf186fe1b | Base Contenedor Fruta Talla M   | insumo       | ingredient     |
| c6d212ed-9edd-4715-992c-219b37c3ca4e | Base Salseros                   | insumo       | ingredient     |
| 8c91c9de-82c0-475f-a01b-98746b473806 | Base Whip Topping (Chantilly)   | insumo       | ingredient     |
| c8ca93f1-2e9a-4e73-a22c-d6256281aa61 | Bolsa de Aseo Grande            | insumo       | ingredient     |
| 97990b59-6153-4643-86c8-263919b3428f | Bolsa de Aseo Pequeña           | insumo       | ingredient     |
| 9360c30f-a70e-4d05-86ab-45cd0e78bd48 | Bolsa de Papel Saudo            | insumo       | ingredient     |
| 0906092d-ad2f-4f52-a091-3bbfafc3c736 | Bolsa de Porcionar Media Libra  | insumo       | ingredient     |
| 4ddce8f8-eaa6-436d-9f63-45558f0bd750 | Bolsa para Llevar Mediana Saudo | insumo       | ingredient     |
| d3b3acf2-aa48-4115-a56e-ede925ced84a | Café                            | insumo       | ingredient     |
| 0bc2baac-db50-455d-bc8c-2ffda730137c | Caja de Pizza #11               | insumo       | ingredient     |
| eb910e88-c185-42a8-8250-566eea6f83bc | Caja de Pizza #8                | insumo       | ingredient     |
| 1397fa90-180a-4c8a-8e41-3ab1ed9a4fb3 | Caja de Postre Saudo            | insumo       | ingredient     |
| 60e780f4-5354-47d7-86ca-64eac835a8fe | Canela en Polvo                 | insumo       | ingredient     |
| b6032bf0-4624-4d83-af7b-0fa043bc5f99 | Cereza Marrosquino              | insumo       | ingredient     |
| 6b9bea3e-1716-4c2e-81d2-27d374c23d5f | Champiñones                     | insumo       | ingredient     |
| 29e965f6-0751-4554-8f1f-ba8745c57701 | Chocolisto                      | insumo       | ingredient     |
| 13525b36-8f35-4a09-8c21-c5a21c9d154e | Chorizo Coctelero               | insumo       | ingredient     |
| 5db9eeab-548f-4989-80b0-9611ff918dad | Chorizo Santarrozano            | insumo       | ingredient     |
| 6fe2a298-aa65-4fcd-9aad-bbab99f286a5 | Cloro                           | insumo       | ingredient     |
| 45ce1c01-5c65-4f9c-846f-0caa5aa7ae76 | Coco Rallado                    | insumo       | ingredient     |
| 7da9dacb-42e4-4fca-a808-bc32a19acf88 | Cocoa Superior                  | insumo       | ingredient     |
| bd4584cb-3d60-4304-8909-18422bd8aa7e | Cofias (Gorro de Cabello)       | insumo       | ingredient     |
| 4465297f-65c1-41af-ab68-db52c08ad627 | Conos                           | insumo       | ingredient     |
| 575ced55-ca85-4c27-b3a9-abe2bac272cd | Crema de Leche                  | insumo       | ingredient     |
| c52c568e-8cba-4e4e-b3b8-1b4f0a1ca813 | Crema de Whisky                 | insumo       | ingredient     |
| 064cce03-c815-4cfb-9e6b-1567ee1167f5 | Crocomilk                       | insumo       | ingredient     |
| 313ee628-ada6-4108-80b0-de7682676400 | Desengrasante                   | insumo       | ingredient     |
| c7111ef2-7a39-4531-bc6b-df04d9fb9c1f | Desengrasante de Plancha        | insumo       | ingredient     |
| e18a0219-c29a-48aa-9a1f-65eb6d322a17 | Dextrosa                        | insumo       | ingredient     |
| d775850c-3a0f-4d3f-917d-37121d45717c | Encendedor                      | insumo       | ingredient     |
| 0338517f-56d9-4dd3-bfa9-119c180e0f10 | Escencia de Vainilla            | insumo       | ingredient     |
| d8a23407-56e8-4768-9442-fa1b5a7bb514 | Escoba con Palo                 | insumo       | ingredient     |
| 1b5a5814-ddc2-4bd1-8cf7-0e9437732568 | Esponja de Lavar                | insumo       | ingredient     |
| 836bd981-ab1e-4b57-ab02-7e2016ad67fe | Esponja de Parrilla             | insumo       | ingredient     |
| 2ceefadf-a67e-4149-8443-a57d7ada1c58 | Flores Comestibles              | insumo       | ingredient     |
| 850257c1-4be0-446a-bbd3-6ab14fc69818 | Fríjol                          | insumo       | ingredient     |
| dd755eed-546a-42fc-9ec0-2cf553812279 | Frutos del Bosque               | insumo       | ingredient     |
| 66a2c08c-d354-4cea-b7d1-d08f03ed9333 | Germinados Verdes               | insumo       | ingredient     |
| 71b12956-0fdf-4656-82de-a1c76778e1d0 | Ginebra Gordons                 | insumo       | ingredient     |
| 005b3df2-cca8-4a48-942d-ed142f8ef812 | Guantes L                       | insumo       | ingredient     |
| 93a416a4-c961-4dcc-9133-996ebae7f032 | Guantes M                       | insumo       | ingredient     |
| b74bc247-3b6a-4f69-8be1-ae997ff95eec | Harina de Trigo                 | insumo       | ingredient     |
| 24eaaa36-8501-45a4-839e-cea5e1ac21aa | Hierbabuena                     | insumo       | ingredient     |
| 0c741a2e-36e4-4709-be81-85d0c65903f4 | Huevos de Codorniz              | insumo       | ingredient     |
| cd0a666a-6045-4719-a148-0f6709e1b94a | Infusión Frutos Amarillos       | insumo       | ingredient     |
| c9f991f1-7358-4701-9d88-c1540440cd31 | Infusión Frutos Rojos           | insumo       | ingredient     |
| 35921400-a9f7-4875-bec6-03978dbc164b | Infusión Frutos Rojos           | insumo       | ingredient     |
| 17b83553-2f8c-44fc-92a0-44eede2799d9 | Infusión Frutos Rojos           | insumo       | ingredient     |
| a417ada2-278c-4c4d-9d4e-3899e939f86c | Infusión Frutos Verdes          | insumo       | ingredient     |
| 70a35510-d158-4f6b-a6c2-82dd7fa5f792 | Jabón de Manos                  | insumo       | ingredient     |
| 4d56a0c4-10d4-4e14-bd46-b6d835540eca | Jabón en Polvo                  | insumo       | ingredient     |
| 61b022af-291c-4b09-b8da-cc43baa279f3 | Jamón Ahumado                   | insumo       | ingredient     |
| a138a7c6-1727-4e0b-a0e1-40b7b778e6a1 | Jamón de Pavo                   | insumo       | ingredient     |
| cac8116e-3274-4a63-9fbd-bb30e1c2dd74 | Jamón Serrano                   | insumo       | ingredient     |
| 3a3671c4-b09f-4f5f-a721-23e2b9f527f2 | Lata de Lychees                 | insumo       | ingredient     |
| 3c8f37bd-9c49-48e8-8f3a-e36f625d37e2 | Lavanda Pisos                   | insumo       | ingredient     |
| 756a3ef8-0b17-4f90-8dad-1c9a122510ab | Lavaplatos                      | insumo       | ingredient     |
| 50f9a30f-a98c-404a-8cb4-12dfb5802bc9 | Leche de Almendras              | insumo       | ingredient     |
| 8a8fb3d4-870d-474d-9cab-0fa2ce5fb610 | Leche en Polvo                  | insumo       | ingredient     |
| 2d1750ae-e575-4fb5-895c-b73a24f8c3f9 | Limpiavidrios                   | insumo       | ingredient     |
| a885404e-cafa-4eef-872a-5016311767a1 | M&M                             | insumo       | ingredient     |
| 56bd7148-9151-4c0f-a702-0ef47e8a63dd | Maíz Dulce                      | insumo       | ingredient     |
| abd73c80-2f64-4425-91fa-d39a375d2162 | Maní Triturado                  | insumo       | ingredient     |
| b80ce000-566f-4ea8-b8f0-df3125a04fa3 | Margarina con Sal               | insumo       | ingredient     |
| 59446a22-befc-4688-a0ad-c9d36b5d9d19 | Matcha en Polvo                 | insumo       | ingredient     |
| e62a36a2-b0d8-413b-b9fc-89aea36d49d5 | Mezcladores                     | insumo       | ingredient     |
| c350f3bd-ee60-486b-8a0a-c73fb36110f2 | Miel de Maple                   | insumo       | ingredient     |
| 5dae0dde-c0ff-4973-a6e2-7fb09cb980bb | Milo                            | insumo       | ingredient     |
| e4ef76e3-5330-4c35-834e-8bcbbff95a12 | Mini Salchichas                 | insumo       | ingredient     |
| 170dc865-f23d-417f-8ec5-3f8b02696b39 | Nutella                         | insumo       | ingredient     |
| d112410c-8323-4975-a227-4cb3b7f88624 | Oreo Triturado                  | insumo       | ingredient     |
| f110b03a-fdb3-4b8d-8cf0-24de9eea98bb | Palillo de Bambu                | insumo       | ingredient     |
| 99801779-b9e6-4e8f-ae1c-f7bc85091c7c | Panalpina                       | insumo       | ingredient     |
| d79d4bbe-bf38-4819-86ac-cf82c613351c | Papa Premium                    | insumo       | ingredient     |
| 4b35a4bf-ff04-4e25-a15a-2ba2bfa19e2a | Papel Aluminio 100mt            | insumo       | ingredient     |
| bc749d13-196f-40af-ae3d-82b1ade1d609 | Papel Higiénico                 | insumo       | ingredient     |
| db5890f4-69d9-4d02-8484-811772185b7e | Papel Parafinado Plato Saudo    | insumo       | ingredient     |
| 680defe4-b1b4-4012-be98-0e71c08ac623 | Papel Parafinado Sandwich Saudo | insumo       | ingredient     |
| 09f17bf2-3aff-4771-9164-45ae6b976202 | Papel Parafinado Vento          | insumo       | ingredient     |"

-- 4) product_site_settings con audience nulo/vacio (puede ocultar insumos en remision).
select
  pss.product_id,
  p.name as product_name,
  pss.site_id,
  pss.is_active,
  pss.audience
from public.product_site_settings pss
join public.products p on p.id = pss.product_id
where pss.is_active = true
  and coalesce(trim(pss.audience), '') = ''
order by p.name, pss.site_id;

"No arrojó nada"

-- 5) Solicitudes de remision sin items.
select
  rr.id,
  rr.created_at,
  rr.status,
  rr.from_site_id,
  rr.to_site_id
from public.restock_requests rr
left join public.restock_request_items rri on rri.request_id = rr.id
group by rr.id, rr.created_at, rr.status, rr.from_site_id, rr.to_site_id
having count(rri.id) = 0
order by rr.created_at desc;

"| id                                   | created_at                    | status    | from_site_id                         | to_site_id                           |
| ------------------------------------ | ----------------------------- | --------- | ------------------------------------ | ------------------------------------ |
| d3685e85-43b8-4168-9ca9-0a28427c05d6 | 2026-03-20 14:05:32.056185+00 | cancelled | 407ccca3-bc35-4252-8998-7280623de78f | 58362682-4ea3-4718-bd83-b4f311f885cd |"

-- 6) Items de remision con normalizacion incompleta de unidades.
select
  rri.id,
  rri.request_id,
  rri.product_id,
  rri.quantity,
  rri.input_qty,
  rri.input_unit_code,
  rri.stock_unit_code,
  rri.conversion_factor_to_stock
from public.restock_request_items rri
where rri.quantity is null
   or rri.quantity <= 0
   or rri.input_qty is null
   or rri.input_qty <= 0
   or rri.input_unit_code is null
   or rri.stock_unit_code is null
   or rri.conversion_factor_to_stock is null
   or rri.conversion_factor_to_stock <= 0
order by rri.created_at desc nulls last;

"No arrojó nada"