begin;

update public.inventory_locations
set
  description = case code
    when 'LOC-CP-BOD-MAIN' then 'Bodega principal'
    when 'LOC-CP-SECOS-MAIN' then 'Secos'
    when 'LOC-CP-FRIO-MAIN' then 'Cuarto frio'
    when 'LOC-CP-CONG-MAIN' then 'Congelados'
    when 'LOC-CP-N2P-MAIN' then 'Nevera produccion'
    when 'LOC-CP-N3P-MAIN' then 'Nevera despacho'
    when 'LOC-CP-PROD-CAL-01' then 'Zona caliente'
    when 'LOC-CP-PROD-PAN-01' then 'Panaderia'
    when 'LOC-CP-PROD-REP-01' then 'Reposteria'
    when 'LOC-CP-PROD-COC-01' then 'Cocina caliente'
    else description
  end,
  updated_at = now()
where code in (
  'LOC-CP-BOD-MAIN',
  'LOC-CP-SECOS-MAIN',
  'LOC-CP-FRIO-MAIN',
  'LOC-CP-CONG-MAIN',
  'LOC-CP-N2P-MAIN',
  'LOC-CP-N3P-MAIN',
  'LOC-CP-PROD-CAL-01',
  'LOC-CP-PROD-PAN-01',
  'LOC-CP-PROD-REP-01',
  'LOC-CP-PROD-COC-01'
);

commit;
