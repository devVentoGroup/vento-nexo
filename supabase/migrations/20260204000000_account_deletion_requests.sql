-- Tabla para solicitudes de eliminación de cuenta (Vento Pass).
-- Los usuarios envían el formulario desde la URL pública; vosotros procesáis manualmente
-- o con un job que borra en auth.users + public.users y tablas relacionadas.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  processed_at timestamptz,
  processed_by text,
  notes text
);

COMMENT ON TABLE public.account_deletion_requests IS 'Solicitudes de eliminación de cuenta/datos para Vento Pass. URL pública en app y tiendas.';

-- Solo el backend (Edge Function con service_role) inserta; podéis leer desde el Dashboard.
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_deletion_requests_service_role"
  ON public.account_deletion_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
