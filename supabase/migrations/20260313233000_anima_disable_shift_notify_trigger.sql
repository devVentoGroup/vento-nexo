-- Desactiva el trigger de notificaciones de turnos.
-- Las notificaciones se envían ahora desde acciones explícitas de publicación
-- (ANIMA publishNow y VISO Publicar horarios), para evitar opacidad y facilitar depuración.

drop trigger if exists trg_employee_shifts_notify_published on public.employee_shifts;

comment on function public.notify_shift_published() is
  'Legacy helper no usado por trigger. Las notificaciones de turnos se disparan desde acciones explícitas de publicación.';
