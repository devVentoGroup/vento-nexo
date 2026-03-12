-- Seed content blocks for Pass screens: order_home, satellite_hub, order_menu, order_checkout.
-- These are consumed by useAppContentBlocks in vento_pass and editable from VISO.

begin;

insert into public.app_content_blocks (app_key, screen_key, section_key, locale, sort_order, payload)
values
  -- order_home: pantalla "Pedir" (modalidad + Ver menú)
  (
    'vento_pass',
    'order_home',
    'hero',
    'es-CO',
    10,
    jsonb_build_object(
      'eyebrow', 'PEDIR EN',
      'subtitle', 'Elige cómo quieres recibir tu pedido y revisa el menú.',
      'primary_cta', 'Ver menú'
    )
  ),
  (
    'vento_pass',
    'order_home',
    'service',
    'es-CO',
    20,
    jsonb_build_object(
      'title', '¿Cómo quieres recibirlo?',
      'delivery_label', 'Domicilio',
      'delivery_detail', 'Lo llevamos hasta tu puerta.',
      'delivery_eta', '35-50 min',
      'pickup_label', 'Recoger',
      'pickup_detail', 'Pasa por tu pedido ya listo.',
      'pickup_eta', '18-25 min',
      'on_premise_label', 'En sitio',
      'on_premise_detail', 'Ordena con el mismo flujo cuando estés en mesa.',
      'on_premise_eta', 'Servicio guiado'
    )
  ),
  -- satellite_hub: pantalla interna del satélite (hero, CTA Pedir aquí, Club, Mis pedidos)
  (
    'vento_pass',
    'satellite_hub',
    'hero',
    'es-CO',
    10,
    jsonb_build_object(
      'top_badge', 'Tu experiencia',
      'eyebrow', 'EXPERIENCIA',
      'subtitle', 'Compra, acumula y aprovecha tus beneficios.',
      'eta_label', 'Recoge 18-25 min'
    )
  ),
  (
    'vento_pass',
    'satellite_hub',
    'actions',
    'es-CO',
    20,
    jsonb_build_object(
      'order_label', 'Pedir aquí'
    )
  ),
  (
    'vento_pass',
    'satellite_hub',
    'club',
    'es-CO',
    30,
    jsonb_build_object(
      'cta_active', 'Club',
      'cta_default', 'Conocer Club'
    )
  ),
  (
    'vento_pass',
    'satellite_hub',
    'activity',
    'es-CO',
    40,
    jsonb_build_object(
      'title', 'Mis pedidos'
    )
  ),
  -- order_menu: menú de productos
  (
    'vento_pass',
    'order_menu',
    'hero',
    'es-CO',
    10,
    jsonb_build_object(
      'title', 'Menú',
      'subtitle', 'Agrega al carrito y continúa al checkout.'
    )
  ),
  (
    'vento_pass',
    'order_menu',
    'empty',
    'es-CO',
    20,
    jsonb_build_object(
      'title', 'Sin productos',
      'description', 'Aún no hay ítems en el catálogo para esta sede.'
    )
  ),
  (
    'vento_pass',
    'order_menu',
    'cart',
    'es-CO',
    30,
    jsonb_build_object(
      'cta_label', 'Ir al checkout',
      'subtotal_label', 'Subtotal'
    )
  ),
  -- order_checkout: resumen y envío
  (
    'vento_pass',
    'order_checkout',
    'pricing',
    'es-CO',
    10,
    jsonb_build_object(
      'delivery_fee', 6000,
      'delivery_fee_label', 'Domicilio',
      'subtotal_label', 'Subtotal',
      'total_label', 'Total'
    )
  )
on conflict (app_key, screen_key, section_key, locale) do update
set
  payload = excluded.payload,
  sort_order = excluded.sort_order,
  is_enabled = true,
  updated_at = now();

commit;
