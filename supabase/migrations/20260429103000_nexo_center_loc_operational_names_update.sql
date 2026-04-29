begin;

update public.inventory_locations
set description = case code
  when 'LOC-CP-BOD-MAIN' then 'Bodega principal'
  when 'LOC-CP-FRIO-MAIN' then 'Cuarto frio'
  when 'LOC-CP-CONG-MAIN' then 'Congelados'
  when 'LOC-CP-N2P-MAIN' then 'Nevera 2 puertas'
  when 'LOC-CP-N3P-MAIN' then 'Nevera de preparaciones'
  else description
end
where code in (
  'LOC-CP-BOD-MAIN',
  'LOC-CP-FRIO-MAIN',
  'LOC-CP-CONG-MAIN',
  'LOC-CP-N2P-MAIN',
  'LOC-CP-N3P-MAIN'
);

commit;
