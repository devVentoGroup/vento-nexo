-- Sesiones de conteo (Fase 3.2–3.4)
-- Ejecutar en BD cuando corresponda. RLS y permisos según nexo.inventory.counts.

-- Sesión de conteo: ámbito sede (o zona/LOC), estado abierto/cerrado
CREATE TABLE IF NOT EXISTS inventory_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  scope_type text NOT NULL DEFAULT 'site' CHECK (scope_type IN ('site', 'zone', 'loc')),
  scope_zone text,
  scope_location_id uuid REFERENCES inventory_locations(id) ON DELETE SET NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_count_sessions_site_status ON inventory_count_sessions(site_id, status);
CREATE INDEX IF NOT EXISTS idx_count_sessions_created_at ON inventory_count_sessions(created_at DESC);

COMMENT ON TABLE inventory_count_sessions IS 'Sesiones de conteo cíclico; open=en curso, closed=cerrada con diferencias calculadas';

-- Líneas del conteo: producto y cantidad contada; al cerrar se rellenan current_qty y quantity_delta
CREATE TABLE IF NOT EXISTS inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES inventory_count_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_counted numeric NOT NULL DEFAULT 0 CHECK (quantity_counted >= 0),
  current_qty_at_close numeric,
  quantity_delta numeric,
  adjustment_applied_at timestamptz,
  UNIQUE(session_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_count_lines_session ON inventory_count_lines(session_id);

COMMENT ON TABLE inventory_count_lines IS 'Líneas de conteo por sesión; quantity_delta = quantity_counted - current_qty_at_close al cerrar';
