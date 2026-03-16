-- Desactivar el tipo de documento confuso "Para saber si requiere contrato" (entrada de prueba/nota).
-- Sigue en la tabla pero deja de aparecer en desplegables que filtran por is_active = true.

update public.document_types
set is_active = false
where name = 'Para saber si requiere contrato'
  and (is_active is null or is_active = true);
