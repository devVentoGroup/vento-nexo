


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."recipe_status" AS ENUM (
    'draft',
    'published',
    'archived'
);


ALTER TYPE "public"."recipe_status" OWNER TO "postgres";


CREATE TYPE "public"."site_type" AS ENUM (
    'satellite',
    'production_center',
    'admin'
);


ALTER TYPE "public"."site_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$$;


ALTER FUNCTION "public"."_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_vento_norm"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  SELECT regexp_replace(trim(coalesce($1,'')), '\s+', ' ', 'g')
$_$;


ALTER FUNCTION "public"."_vento_norm"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_vento_slugify"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  SELECT trim(both '-' from regexp_replace(lower(coalesce($1,'')), '[^a-z0-9]+', '-', 'g'))
$_$;


ALTER FUNCTION "public"."_vento_slugify"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_vento_uuid_from_text"("input" "text") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  SELECT (
    substr(md5(coalesce($1,'')), 1, 8)  || '-' ||
    substr(md5(coalesce($1,'')), 9, 4)  || '-' ||
    substr(md5(coalesce($1,'')), 13, 4) || '-' ||
    substr(md5(coalesce($1,'')), 17, 4) || '-' ||
    substr(md5(coalesce($1,'')), 21, 12)
  )::uuid
$_$;


ALTER FUNCTION "public"."_vento_uuid_from_text"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_area"("p_area_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p_area_id is null
    or public.is_owner()
    or public.is_global_manager()
    or exists (
      select 1
      from public.employee_areas ea
      join public.areas a on a.id = ea.area_id
      where ea.employee_id = auth.uid()
        and ea.area_id = p_area_id
        and coalesce(ea.is_active, true) = true
        and a.site_id = public.current_employee_selected_site_id()
    )
    or exists (
      select 1
      from public.employees e
      where e.id = auth.uid()
        and e.area_id = p_area_id
    );
$$;


ALTER FUNCTION "public"."can_access_area"("p_area_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_recipe_scope"("p_site_id" "uuid", "p_area_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_owner()
    or public.is_global_manager()
    or (
      public.current_employee_role() = any (array['manager'::text, 'logistics'::text])
      and p_site_id is not null
      and public.can_access_site(p_site_id)
    )
    or (
      public.is_employee()
      and p_site_id is not null
      and p_area_id is not null
      and public.can_access_site(p_site_id)
      and public.can_access_area(p_area_id)
    );
$$;


ALTER FUNCTION "public"."can_access_recipe_scope"("p_site_id" "uuid", "p_area_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_site"("p_site_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when p_site_id is null then false
      when is_owner() then true
      when is_global_manager() then true
      when exists (
        select 1
        from employee_sites es
        where es.employee_id = auth.uid()
          and es.site_id = p_site_id
          and es.is_active = true
      ) then true
      when exists (
        select 1
        from employees e
        where e.id = auth.uid()
          and e.site_id = p_site_id
          and (e.is_active is true or e.is_active is null)
      ) then true
      else false
    end;
$$;


ALTER FUNCTION "public"."can_access_site"("p_site_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_employee_area_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.current_employee_selected_area_id();
$$;


ALTER FUNCTION "public"."current_employee_area_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_employee_primary_site_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select es.site_id
      from public.employee_sites es
      where es.employee_id = auth.uid()
        and es.is_primary = true
      limit 1
    ),
    (
      select e.site_id
      from public.employees e
      where e.id = auth.uid()
    )
  );
$$;


ALTER FUNCTION "public"."current_employee_primary_site_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_employee_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select e.role
  from public.employees e
  where e.id = auth.uid();
$$;


ALTER FUNCTION "public"."current_employee_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_employee_selected_area_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select s.selected_area_id
      from public.employee_settings s
      where s.employee_id = auth.uid()
    ),
    (
      select ea.area_id
      from public.employee_areas ea
      where ea.employee_id = auth.uid()
        and ea.is_primary = true
      limit 1
    ),
    (
      select e.area_id
      from public.employees e
      where e.id = auth.uid()
    )
  );
$$;


ALTER FUNCTION "public"."current_employee_selected_area_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_employee_selected_site_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    (
      select s.selected_site_id
      from public.employee_settings s
      where s.employee_id = auth.uid()
    ),
    public.current_employee_primary_site_id()
  );
$$;


ALTER FUNCTION "public"."current_employee_selected_site_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_employee_site_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.current_employee_selected_site_id();
$$;


ALTER FUNCTION "public"."current_employee_site_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."device_info_has_blocking_warnings"("di" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select exists (
    select 1
    from jsonb_array_elements_text(
      case
        when di is null then '[]'::jsonb
        when jsonb_typeof(di->'validationWarnings') = 'array' then di->'validationWarnings'
        else '[]'::jsonb
      end
    ) as w(txt)
    where lower(w.txt) like any (
      array[
        '%mock%',
        '%simulada%',
        '%spoof%',
        '%punto nulo%',
        '%patron sospechoso%',
        '%digitos repetidos%'
      ]
    )
  );
$$;


ALTER FUNCTION "public"."device_info_has_blocking_warnings"("di" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_attendance_geofence"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_site record;
  v_emp record;

  v_requires_geo boolean;
  v_cap integer;
  v_max_acc integer;
  v_radius integer;

  v_distance double precision;
  v_accuracy double precision;
begin
  -- Hora servidor (anti manipulación)
  new.occurred_at := now();

  -- Empleado: debe existir y estar activo
  select id, site_id, is_active
    into v_emp
  from public.employees
  where id = new.employee_id;

  if not found then
    raise exception 'Empleado no encontrado';
  end if;

  if v_emp.is_active is false then
    raise exception 'Empleado inactivo';
  end if;

  -- En check_in, la sede del log debe coincidir con la sede asignada al empleado
  -- (si tu operación permite multi-sede formal, esto se reemplaza luego por employee_sites)
  if new.action = 'check_in' and v_emp.site_id is distinct from new.site_id then
    raise exception 'No autorizado: check-in solo permitido en tu sede asignada';
  end if;

  -- Sede: debe existir y estar activa
  select id, name, type, is_active, latitude, longitude, checkin_radius_meters
    into v_site
  from public.sites
  where id = new.site_id;

  if not found then
    raise exception 'Sede no encontrada';
  end if;

  if v_site.is_active is false then
    raise exception 'Sede inactiva';
  end if;

  -- Requiere geolocalización si NO es vento_group
  if v_site.type <> 'vento_group' then
    if v_site.latitude is null or v_site.longitude is null then
      raise exception 'Configuración inválida: la sede % no tiene coordenadas', v_site.name;
    end if;
    v_requires_geo := true;
  else
    v_requires_geo := false;
  end if;

  if v_requires_geo then
    -- Debe venir ubicación
    if new.latitude is null or new.longitude is null or new.accuracy_meters is null then
      raise exception 'Ubicación requerida para registrar asistencia';
    end if;

    -- Si el cliente reporta warnings bloqueantes, rechaza (ayuda, pero no es el “anti-mock” definitivo)
    if public.device_info_has_blocking_warnings(new.device_info) then
      raise exception 'Ubicación no válida: señales de ubicación simulada detectadas';
    end if;

    -- Política estricta
    if new.action = 'check_in' then
      v_cap := 30;
      v_max_acc := 25;
    elsif new.action = 'check_out' then
      v_cap := 40;
      v_max_acc := 30;
    else
      raise exception 'Acción inválida: %', new.action;
    end if;

    v_radius := least(coalesce(v_site.checkin_radius_meters, 50), v_cap);
    v_accuracy := new.accuracy_meters::double precision;

    if v_accuracy > v_max_acc then
      raise exception 'Precisión GPS insuficiente: %m (máximo %m)', round(v_accuracy), v_max_acc;
    end if;

    v_distance := public.haversine_m(new.latitude, new.longitude, v_site.latitude, v_site.longitude);

    -- Regla estricta de confianza: distancia + precisión <= radio
    if (v_distance + v_accuracy) > v_radius then
      raise exception 'Fuera de rango: %m (precisión %m) > radio %m',
        round(v_distance), round(v_accuracy), v_radius;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_attendance_geofence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_attendance_sequence"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_last_action text;
  v_last_site_id uuid;
  v_last_occurred_at timestamptz;
begin
  -- Serializa operaciones por empleado (evita doble insert concurrente)
  perform pg_advisory_xact_lock(hashtext(new.employee_id::text)::bigint);

  -- Validar acción (por si entra algo raro)
  if new.action not in ('check_in','check_out') then
    raise exception 'Acción inválida: %', new.action;
  end if;

  -- Tomar el último evento del empleado (global, no solo "hoy")
  select action, site_id, occurred_at
    into v_last_action, v_last_site_id, v_last_occurred_at
  from public.attendance_logs
  where employee_id = new.employee_id
  order by occurred_at desc, created_at desc
  limit 1;

  if v_last_action is null then
    -- Primer evento debe ser check_in
    if new.action <> 'check_in' then
      raise exception 'Secuencia inválida: el primer registro debe ser check_in';
    end if;

    return new;
  end if;

  -- (Opcional pero recomendado) evitar inserts "hacia atrás" en el tiempo
  if new.occurred_at < v_last_occurred_at then
    raise exception 'Secuencia inválida: occurred_at no puede ser menor al último registro';
  end if;

  -- No permitir dos acciones iguales seguidas
  if new.action = v_last_action then
    raise exception 'Secuencia inválida: no puedes registrar % dos veces seguidas', new.action;
  end if;

  -- Si es check_out, debe cerrar el mismo sitio del check_in anterior
  if new.action = 'check_out' and v_last_action = 'check_in' then
    if new.site_id <> v_last_site_id then
      raise exception 'Secuencia inválida: el check_out debe ser en la misma sede del check_in anterior';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_attendance_sequence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_employee_role_site"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  st public.site_type;
begin
  select s.site_type into st
  from public.sites s
  where s.id = new.site_id;

  if st is null then
    raise exception 'site_id inválido o sede sin site_type';
  end if;

  -- ADMIN (Vento Group): solo gerencia
  if st = 'admin' then
    if new.role not in ('owner','manager') then
      raise exception 'Rol "%" no permitido para site_type="admin"', new.role;
    end if;
    return new;
  end if;

  -- PRODUCTION CENTER
  if st = 'production_center' then
    if new.role not in ('owner','manager','cook','chef','baker','pastry','warehouse','logistics') then
      raise exception 'Rol "%" no permitido para site_type="production_center"', new.role;
    end if;
    return new;
  end if;

  -- SATELLITE
  if st = 'satellite' then
    if new.role not in ('owner','manager','staff','cashier','waiter','barista','cook','chef','warehouse','logistics') then
      raise exception 'Rol "%" no permitido para site_type="satellite"', new.role;
    end if;
    return new;
  end if;

  raise exception 'site_type desconocido: %', st;
end;
$$;


ALTER FUNCTION "public"."enforce_employee_role_site"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_location_code"("p_site_code" "text", "p_zone" "text", "p_aisle" "text" DEFAULT NULL::"text", "p_level" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v_code TEXT;
BEGIN
  v_code := 'LOC-' || UPPER(p_site_code) || '-' || UPPER(p_zone);
  IF p_aisle IS NOT NULL THEN
    v_code := v_code || '-' || UPPER(p_aisle);
  END IF;
  IF p_level IS NOT NULL THEN
    v_code := v_code || '-' || UPPER(p_level);
  END IF;
  RETURN v_code;
END;
$$;


ALTER FUNCTION "public"."generate_location_code"("p_site_code" "text", "p_zone" "text", "p_aisle" "text", "p_level" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_lpn_code"("p_site_code" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_year_month TEXT;
  v_seq INT;
BEGIN
  v_year_month := TO_CHAR(NOW(), 'YYMM');
  v_seq := NEXTVAL('lpn_sequence');
  RETURN 'LPN-' || UPPER(p_site_code) || '-' || v_year_month || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;


ALTER FUNCTION "public"."generate_lpn_code"("p_site_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_product_sku"("p_product_type" "text", "p_site_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_site_id uuid;
  v_brand_code text;
  v_type_code text;
  v_next integer;
begin
  v_site_id := coalesce(
    p_site_id,
    public.current_employee_selected_site_id(),
    public.current_employee_primary_site_id()
  );

  if v_site_id is null then
    select s.id into v_site_id
    from public.sites s
    where s.site_kind = 'hq'
    order by s.created_at
    limit 1;
  end if;

  if v_site_id is null then
    select s.id into v_site_id
    from public.sites s
    order by s.created_at
    limit 1;
  end if;

  if v_site_id is null then
    raise exception 'No site available to generate SKU';
  end if;

  v_brand_code := public.resolve_product_sku_brand_code(v_site_id);
  if v_brand_code is null or v_brand_code = '' then
    raise exception 'No brand code available for site %', v_site_id;
  end if;

  v_type_code := public.resolve_product_sku_type_code(p_product_type);
  if v_type_code is null or v_type_code = '' then
    v_type_code := 'GEN';
  end if;

  insert into public.product_sku_sequences (brand_code, type_code, last_value, updated_at)
  values (v_brand_code, v_type_code, 1, now())
  on conflict (brand_code, type_code)
  do update
    set last_value = public.product_sku_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  return v_brand_code || '-' || v_type_code || '-' || lpad(v_next::text, 5, '0');
end;
$$;


ALTER FUNCTION "public"."generate_product_sku"("p_product_type" "text", "p_site_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current_balance integer;
  v_new_balance integer;
  v_transaction_id uuid;
begin
  -- ✅ Solo staff activo
  if not is_active_staff() then
    return jsonb_build_object('success', false, 'error', 'No autorizado (staff requerido)');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_id es requerido');
  end if;

  if p_points is null or p_points <= 0 then
    return jsonb_build_object('success', false, 'error', 'p_points debe ser mayor a 0');
  end if;

  -- ✅ Lock para evitar race conditions
  select u.loyalty_points
    into v_current_balance
  from public.users u
  where u.id = p_user_id
  for update;

  if v_current_balance is null then
    return jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  end if;

  v_new_balance := coalesce(v_current_balance, 0) + p_points;

  insert into public.loyalty_transactions (
    user_id,
    kind,
    points_delta,
    description,
    metadata
  ) values (
    p_user_id,
    'earn',
    p_points,
    coalesce(p_description, 'Puntos otorgados'),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('staff_user_id', auth.uid())
  )
  returning id into v_transaction_id;

  -- Mantengo tu update explícito (misma conducta que hoy)
  update public.users
  set loyalty_points = v_new_balance,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'points_awarded', p_points,
    'transaction_id', v_transaction_id
  );

exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;


ALTER FUNCTION "public"."grant_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, loyalty_points)
  VALUES (new.id, new.email, '', 0)
  ON CONFLICT (id) DO NOTHING; -- Evita errores si ya existe
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."haversine_m"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select 2 * 6371000::double precision *
    asin(
      sqrt(
        power(sin((((lat2::double precision - lat1::double precision) * pi()) / 180) / 2), 2) +
        cos((lat1::double precision * pi()) / 180) *
        cos((lat2::double precision * pi()) / 180) *
        power(sin((((lon2::double precision - lon1::double precision) * pi()) / 180) / 2), 2)
      )
    );
$$;


ALTER FUNCTION "public"."haversine_m"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_employee();
$$;


ALTER FUNCTION "public"."is_active_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_employee"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and coalesce(e.is_active, true) = true
  );
$$;


ALTER FUNCTION "public"."is_employee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_global_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from employees e
    join sites s on s.id = e.site_id
    where e.id = auth.uid()
      and e.role = 'manager'
      and s.site_type = 'admin'
  )
  or exists (
    select 1
    from employee_sites es
    join sites s on s.id = es.site_id
    join employees e on e.id = es.employee_id
    where es.employee_id = auth.uid()
      and es.is_active = true
      and e.role = 'manager'
      and s.site_type = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_global_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_manager"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.current_employee_role() = 'manager';
$$;


ALTER FUNCTION "public"."is_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_manager_or_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.current_employee_role() in ('owner', 'manager');
$$;


ALTER FUNCTION "public"."is_manager_or_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.current_employee_role() = 'owner';
$$;


ALTER FUNCTION "public"."is_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_loyalty_earning"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  POINT_CONVERSION_RATE constant integer := 1000; -- 1 punto por cada X pesos
  v_order record;
  v_points integer;
begin
  -- Obtener y bloquear la orden
  select
    o.id,
    o.client_id,
    o.payment_status,
    o.loyalty_processed,
    o.total_amount,           -- TODO: cambia al campo real de monto
    o.loyalty_points_awarded  -- TODO: cambia al campo real de puntos ganados
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order % not found', p_order_id using errcode = 'P0001';
  end if;

  if v_order.payment_status <> 'paid' then
    raise exception 'Order % is not paid', p_order_id using errcode = 'P0001';
  end if;

  if v_order.loyalty_processed then
    raise exception 'Order % already processed for loyalty', p_order_id using errcode = 'P0001';
  end if;

  v_points := floor(coalesce(v_order.total_amount, 0) / POINT_CONVERSION_RATE);

  -- Si no hay puntos, solo marcamos procesada
  if v_points <= 0 then
    update public.orders
      set loyalty_processed = true,
          loyalty_points_awarded = 0
    where id = p_order_id;
    return;
  end if;

  insert into public.loyalty_transactions (
    user_id,
    order_id,
    kind,
    points_delta,
    description
  ) values (
    v_order.client_id,
    p_order_id,
    'earn',
    v_points,
    'Order paid: loyalty earning'
  );

  update public.users
    set loyalty_points = coalesce(loyalty_points, 0) + v_points
  where id = v_order.client_id;

  update public.orders
    set loyalty_processed = true,
        loyalty_points_awarded = v_points
  where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."process_loyalty_earning"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_order_payment"("p_order_id" "uuid", "p_site_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  v_order RECORD;
  v_loyalty_points INT := 0;
  v_result JSON;
BEGIN
  -- Obtener la orden
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Orden no encontrada');
  END IF;
  
  -- Calcular puntos de lealtad (1 punto por cada $1000 COP)
  v_loyalty_points := FLOOR(v_order.total_amount / 1000);
  
  -- Actualizar estado de la orden
  UPDATE orders 
  SET 
    status = 'completed',
    payment_status = 'paid',
    loyalty_processed = true,
    loyalty_points_awarded = v_loyalty_points,
    updated_at = NOW()
  WHERE id = p_order_id;
  
  -- Registrar el pago en pos_payments
  INSERT INTO pos_payments (
    order_id, 
    payment_method, 
    amount, 
    reference,
    created_at
  ) VALUES (
    p_order_id,
    p_payment_method,
    v_order.total_amount,
    p_payment_reference,
    NOW()
  );
  
  -- Si el cliente tiene ID, actualizar puntos de lealtad
  IF v_order.client_id IS NOT NULL AND v_loyalty_points > 0 THEN
    UPDATE users 
    SET loyalty_points = COALESCE(loyalty_points, 0) + v_loyalty_points
    WHERE id = v_order.client_id;
    
    -- Registrar transacción de lealtad
    INSERT INTO loyalty_transactions (
      user_id,
      order_id,
      points,
      type,
      created_at
    ) VALUES (
      v_order.client_id,
      p_order_id,
      v_loyalty_points,
      'earned',
      NOW()
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'loyalty_points_awarded', v_loyalty_points
  );
END;
$_$;


ALTER FUNCTION "public"."process_order_payment"("p_order_id" "uuid", "p_site_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."receive_purchase_order"("p_purchase_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_po record;
  v_item record;

  v_purchase_unit_size numeric;
  v_received_base_qty numeric;

  v_prev_total_qty numeric;          -- stock TOTAL antes de recibir
  v_existing_cost numeric;
  v_received_unit_cost_base numeric;
  v_new_cost numeric;

  v_line_total numeric;
  v_total_amount numeric := 0;
BEGIN
  -- Lock PO
  SELECT *
  INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % no existe', p_purchase_order_id;
  END IF;

  IF v_po.status IN ('received', 'completed') THEN
    RAISE EXCEPTION 'Purchase order % ya está recibida (status=%)', p_purchase_order_id, v_po.status;
  END IF;

  -- Procesar items recibidos
  FOR v_item IN
    SELECT *
    FROM public.purchase_order_items
    WHERE purchase_order_id = p_purchase_order_id
    ORDER BY created_at ASC
  LOOP
    IF v_item.quantity_received IS NULL OR v_item.quantity_received <= 0 THEN
      CONTINUE;
    END IF;

    -- purchase_unit_size por proveedor+producto
    SELECT ps.purchase_unit_size
    INTO v_purchase_unit_size
    FROM public.product_suppliers ps
    WHERE ps.supplier_id = v_po.supplier_id
      AND ps.product_id = v_item.product_id
    LIMIT 1;

    IF v_purchase_unit_size IS NULL OR v_purchase_unit_size <= 0 THEN
      RAISE EXCEPTION
        'Falta purchase_unit_size en product_suppliers para supplier_id=% product_id=% (PO=%)',
        v_po.supplier_id, v_item.product_id, p_purchase_order_id;
    END IF;

    -- Convertir a unidad base
    v_received_base_qty := v_item.quantity_received * v_purchase_unit_size;

    -- 1) Capturar stock total PREVIO (antes de sumar lo recibido)
    SELECT COALESCE(SUM(current_qty), 0)
    INTO v_prev_total_qty
    FROM public.inventory_stock_by_site
    WHERE product_id = v_item.product_id;

    -- 2) Costo actual (promedio anterior)
    SELECT COALESCE(cost, 0)
    INTO v_existing_cost
    FROM public.products
    WHERE id = v_item.product_id;

    -- 3) Costo recibido en unidad base
    v_received_unit_cost_base := v_item.unit_cost / v_purchase_unit_size;

    -- 4) Nuevo costo promedio ponderado (usando stock previo real)
    IF (v_prev_total_qty + v_received_base_qty) > 0 THEN
      v_new_cost :=
        (
          (v_existing_cost * v_prev_total_qty) +
          (v_received_unit_cost_base * v_received_base_qty)
        )
        / (v_prev_total_qty + v_received_base_qty);
    ELSE
      v_new_cost := v_received_unit_cost_base;
    END IF;

    -- Kardex
    INSERT INTO public.inventory_movements (
      site_id,
      product_id,
      movement_type,
      quantity,
      note,
      related_purchase_order_id,
      related_order_id
    )
    VALUES (
      v_po.site_id,
      v_item.product_id,
      'purchase_in',
      v_received_base_qty,
      'Recepción OC ' || p_purchase_order_id::text,
      p_purchase_order_id,
      NULL
    );

    -- Stock por sede
    INSERT INTO public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
    VALUES (v_po.site_id, v_item.product_id, v_received_base_qty, now())
    ON CONFLICT (site_id, product_id)
    DO UPDATE SET
      current_qty = public.inventory_stock_by_site.current_qty + EXCLUDED.current_qty,
      updated_at = now();

    -- Actualizar costo del producto
    UPDATE public.products
    SET cost = v_new_cost,
        updated_at = now()
    WHERE id = v_item.product_id;

    -- Totales PO
    v_line_total := v_item.unit_cost * v_item.quantity_received;
    v_total_amount := v_total_amount + COALESCE(v_line_total, 0);

    UPDATE public.purchase_order_items
    SET line_total = v_line_total
    WHERE id = v_item.id;
  END LOOP;

  UPDATE public.purchase_orders
  SET status = 'received',
      received_at = now(),
      total_amount = v_total_amount
  WHERE id = p_purchase_order_id;

END;
$$;


ALTER FUNCTION "public"."receive_purchase_order"("p_purchase_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_product_sku_brand_code"("p_site_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  v_site_type text;
  v_site_code text;
begin
  select s.type, s.code
    into v_site_type, v_site_code
  from public.sites s
  where s.id = p_site_id;

  if v_site_type is not null then
    case lower(v_site_type)
      when 'vento_group' then return 'VGR';
      when 'vento_cafe' then return 'VCF';
      when 'saudo' then return 'SAU';
      when 'vaila_vainilla' then return 'VAI';
      when 'catering' then return 'CAT';
    end case;
  end if;

  if v_site_code is null then
    return null;
  end if;

  return upper(regexp_replace(v_site_code, '[^A-Za-z0-9]', '', 'g'));
end;
$$;


ALTER FUNCTION "public"."resolve_product_sku_brand_code"("p_site_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_product_sku_type_code"("p_product_type" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  v_raw text;
  v_clean text;
begin
  v_raw := coalesce(p_product_type, '');
  v_clean := lower(v_raw);

  if v_clean like '%venta%' then
    return 'VEN';
  elsif v_clean like '%insum%' then
    return 'INS';
  elsif v_clean like '%prepar%' then
    return 'PRE';
  elsif v_clean like '%empa%' then
    return 'EMP';
  elsif v_clean like '%limp%' then
    return 'LIM';
  elsif v_clean like '%mant%' then
    return 'MAN';
  elsif v_clean like '%acti%' then
    return 'ACT';
  end if;

  v_clean := regexp_replace(v_clean, '[^a-z0-9]', '', 'g');
  if v_clean = '' then
    return 'GEN';
  end if;

  return upper(substr(v_clean, 1, 3));
end;
$$;


ALTER FUNCTION "public"."resolve_product_sku_type_code"("p_product_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_product_sku"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := public.generate_product_sku(new.product_type, null);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_product_sku"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end $$;


ALTER FUNCTION "public"."tg_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_employee_shifts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_employee_shifts_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_loyalty_balance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Si insertamos una transacción, sumamos/restamos al saldo del usuario
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.users
    SET loyalty_points = loyalty_points + NEW.points_delta,
        updated_at = now()
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_loyalty_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."util_column_usage"("p_table" "regclass") RETURNS TABLE("column_name" "text", "non_null_count" bigint, "total_count" bigint, "pct_non_null" numeric)
    LANGUAGE "plpgsql"
    AS $$
declare
  col record;
  total bigint;
begin
  execute format('select count(*) from %s', p_table) into total;

  for col in
    select a.attname as column_name
    from pg_attribute a
    where a.attrelid = p_table
      and a.attnum > 0
      and not a.attisdropped
  loop
    return query execute format(
      'select %L::text,
              count(%I)::bigint,
              %s::bigint,
              round((count(%I)::numeric / nullif(%s,0))*100, 2)
       from %s',
      col.column_name,
      col.column_name,
      total,
      col.column_name,
      total,
      p_table
    );
  end loop;
end $$;


ALTER FUNCTION "public"."util_column_usage"("p_table" "regclass") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."_backup_inventory_movements_initial_count" (
    "id" "uuid",
    "site_id" "uuid",
    "product_id" "uuid",
    "movement_type" "text",
    "quantity" numeric,
    "note" "text",
    "related_order_id" "uuid",
    "related_production_request_id" "uuid",
    "related_restock_request_id" "uuid",
    "created_at" timestamp with time zone,
    "related_purchase_order_id" "uuid",
    "unit_cost" numeric,
    "related_production_batch_id" "uuid"
);


ALTER TABLE "public"."_backup_inventory_movements_initial_count" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


COMMENT ON TABLE "public"."areas" IS 'Core – tabla canónica para áreas dentro de un site. Usa para segmentar zonas de servicio/operación dentro de cada site.';



CREATE TABLE IF NOT EXISTS "public"."asistencia_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empleado_nombre" "text",
    "empleado_id" "text" NOT NULL,
    "fecha_hora" timestamp with time zone NOT NULL,
    "sucursal" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."asistencia_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "site_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "source" "text" DEFAULT 'web'::"text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "accuracy_meters" numeric(6,1),
    "device_info" "jsonb" DEFAULT '{}'::"jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "attendance_logs_action_check" CHECK (("action" = ANY (ARRAY['check_in'::"text", 'check_out'::"text"]))),
    CONSTRAINT "attendance_logs_source_check" CHECK (("source" = ANY (ARRAY['mobile'::"text", 'web'::"text", 'kiosk'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."attendance_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."attendance_logs" IS 'Registro de check-in/check-out de empleados (ANIMA)';



COMMENT ON COLUMN "public"."attendance_logs"."action" IS 'Tipo de acción: check_in o check_out';



COMMENT ON COLUMN "public"."attendance_logs"."source" IS 'Origen del registro: mobile, web, kiosk, system';



COMMENT ON COLUMN "public"."attendance_logs"."accuracy_meters" IS 'Precisión del GPS en metros';



CREATE TABLE IF NOT EXISTS "public"."cost_centers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid",
    "name" "text" NOT NULL,
    "monthly_budget" numeric DEFAULT 0,
    "current_month_spend" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."cost_centers" OWNER TO "postgres";


COMMENT ON TABLE "public"."cost_centers" IS 'Core – tabla canónica para centros de costo. Organización financiera por site para asociar compras y presupuestos.';



CREATE TABLE IF NOT EXISTS "public"."employee_areas" (
    "employee_id" "uuid" NOT NULL,
    "area_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_areas" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."employee_attendance_status" AS
 SELECT DISTINCT ON ("employee_id") "employee_id",
    "action" AS "current_status",
    "occurred_at" AS "last_action_at",
    "site_id" AS "last_site_id"
   FROM "public"."attendance_logs"
  ORDER BY "employee_id", "occurred_at" DESC;


ALTER VIEW "public"."employee_attendance_status" OWNER TO "postgres";


COMMENT ON VIEW "public"."employee_attendance_status" IS 'Estado actual de asistencia por empleado (último check-in/out)';



CREATE TABLE IF NOT EXISTS "public"."employee_settings" (
    "employee_id" "uuid" NOT NULL,
    "selected_site_id" "uuid",
    "selected_area_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "site_id" "uuid" NOT NULL,
    "shift_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "break_minutes" integer DEFAULT 0,
    "notes" "text",
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_shifts_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text"])))
);


ALTER TABLE "public"."employee_shifts" OWNER TO "postgres";


COMMENT ON TABLE "public"."employee_shifts" IS 'Turnos programados de empleados - ANIMA';



COMMENT ON COLUMN "public"."employee_shifts"."shift_date" IS 'Fecha del turno';



COMMENT ON COLUMN "public"."employee_shifts"."start_time" IS 'Hora de inicio programada';



COMMENT ON COLUMN "public"."employee_shifts"."end_time" IS 'Hora de fin programada';



COMMENT ON COLUMN "public"."employee_shifts"."break_minutes" IS 'Minutos de descanso dentro del turno';



COMMENT ON COLUMN "public"."employee_shifts"."status" IS 'scheduled=programado, confirmed=confirmado, completed=completado, cancelled=cancelado, no_show=no se presentó';



CREATE TABLE IF NOT EXISTS "public"."employee_sites" (
    "employee_id" "uuid" NOT NULL,
    "site_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_sites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" NOT NULL,
    "site_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "permissions" "jsonb" DEFAULT '{}'::"jsonb",
    "full_name" "text" NOT NULL,
    "alias" "text",
    "pin_code" "text",
    "is_active" boolean DEFAULT true,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "area_id" "uuid",
    CONSTRAINT "employees_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'staff'::"text", 'cashier'::"text", 'waiter'::"text", 'barista'::"text", 'cook'::"text", 'chef'::"text", 'baker'::"text", 'pastry'::"text", 'warehouse'::"text", 'logistics'::"text"])))
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON TABLE "public"."employees" IS 'Core – tabla canónica para empleados/staff. Gestión de personal por site, roles y permisos operativos.';



CREATE TABLE IF NOT EXISTS "public"."inventory_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "zone" "text" NOT NULL,
    "aisle" "text",
    "level" "text",
    "description" "text",
    "is_active" boolean DEFAULT true,
    "capacity_units" numeric(10,2),
    "location_type" "text" DEFAULT 'storage'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_locations_location_type_check" CHECK (("location_type" = ANY (ARRAY['storage'::"text", 'picking'::"text", 'receiving'::"text", 'staging'::"text", 'production'::"text"])))
);


ALTER TABLE "public"."inventory_locations" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_locations" IS 'Ubicaciones físicas en almacén (LOC)';



COMMENT ON COLUMN "public"."inventory_locations"."code" IS 'Código único LOC-{SEDE}-{ZONA}-{PASILLO}-{NIVEL}';



CREATE TABLE IF NOT EXISTS "public"."inventory_lpn_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lpn_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric(10,2) DEFAULT 0 NOT NULL,
    "unit" "text" DEFAULT 'unidad'::"text" NOT NULL,
    "lot_number" "text",
    "expiry_date" "date",
    "received_at" timestamp with time zone DEFAULT "now"(),
    "cost_per_unit" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inventory_lpn_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_lpn_items" IS 'Contenido de cada LPN con lote y vencimiento';



CREATE TABLE IF NOT EXISTS "public"."inventory_lpns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "location_id" "uuid",
    "status" "text" DEFAULT 'active'::"text",
    "container_type" "text" DEFAULT 'box'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "label" "text",
    CONSTRAINT "inventory_lpns_container_type_check" CHECK (("container_type" = ANY (ARRAY['box'::"text", 'pallet'::"text", 'bag'::"text", 'tray'::"text", 'bin'::"text", 'other'::"text"]))),
    CONSTRAINT "inventory_lpns_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'empty'::"text", 'consumed'::"text", 'damaged'::"text"])))
);


ALTER TABLE "public"."inventory_lpns" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_lpns" IS 'License Plate Numbers - Contenedores/Cajas identificables';



COMMENT ON COLUMN "public"."inventory_lpns"."code" IS 'Código único LPN-{SEDE}-{AAMM}-{SEQ}';



CREATE TABLE IF NOT EXISTS "public"."inventory_movement_types" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "affects_stock" smallint NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_movement_types_affects_stock_check" CHECK (("affects_stock" = ANY (ARRAY['-1'::integer, 0, 1])))
);


ALTER TABLE "public"."inventory_movement_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" numeric NOT NULL,
    "note" "text",
    "related_order_id" "uuid",
    "related_production_request_id" "uuid",
    "related_restock_request_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "related_purchase_order_id" "uuid",
    "unit_cost" numeric,
    "related_production_batch_id" "uuid"
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_movements" IS 'Core – tabla canónica para movimientos de inventario. Registra entradas/salidas y relaciones con orders/production/restock para auditoría y conciliación.';



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sku" "text",
    "price" numeric,
    "cost" numeric,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_type" "text" DEFAULT 'venta'::"text" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "unit" "text" NOT NULL,
    "cost_original" numeric,
    CONSTRAINT "products_product_type_check" CHECK (("product_type" = ANY (ARRAY['venta'::"text", 'insumo'::"text", 'preparacion'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON TABLE "public"."products" IS 'Core – tabla canónica para catálogo maestro de productos y preparaciones. Catálogo maestro de productos de venta, insumos y preparaciones; usar en todo el código nuevo.';



COMMENT ON COLUMN "public"."products"."unit" IS 'Unidad base del producto/insumo (ej: "g", "kg", "ml", "L", "unidades"). 
Migrado desde inventory.unit (legacy).';



CREATE TABLE IF NOT EXISTS "public"."sites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "address" "text",
    "site_type" "public"."site_type" DEFAULT 'satellite'::"public"."site_type" NOT NULL,
    "site_kind" "text" NOT NULL,
    "checkin_radius_meters" integer DEFAULT 50,
    "is_public" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."sites" OWNER TO "postgres";


COMMENT ON TABLE "public"."sites" IS 'Core – tabla canónica para ubicaciones (sites). Define locales/almacenes donde hay stock, movimientos y operaciones.';



COMMENT ON COLUMN "public"."sites"."latitude" IS 'Latitud de la sede para LiveMap';



COMMENT ON COLUMN "public"."sites"."longitude" IS 'Longitud de la sede para LiveMap';



COMMENT ON COLUMN "public"."sites"."address" IS 'Dirección física de la sede';



COMMENT ON COLUMN "public"."sites"."checkin_radius_meters" IS 'Radio en metros para validar check-in GPS (default 50m)';



CREATE OR REPLACE VIEW "public"."inventory_stock_by_location" AS
 SELECT "loc"."id" AS "location_id",
    "loc"."code" AS "location_code",
    "loc"."zone",
    "loc"."site_id",
    "s"."name" AS "site_name",
    "p"."id" AS "product_id",
    "p"."name" AS "product_name",
    "p"."sku",
    "sum"("li"."quantity") AS "total_quantity",
    "li"."unit",
    "min"("li"."expiry_date") AS "nearest_expiry"
   FROM (((("public"."inventory_locations" "loc"
     JOIN "public"."sites" "s" ON (("loc"."site_id" = "s"."id")))
     LEFT JOIN "public"."inventory_lpns" "lpn" ON ((("lpn"."location_id" = "loc"."id") AND ("lpn"."status" = 'active'::"text"))))
     LEFT JOIN "public"."inventory_lpn_items" "li" ON (("li"."lpn_id" = "lpn"."id")))
     LEFT JOIN "public"."products" "p" ON (("li"."product_id" = "p"."id")))
  WHERE ("loc"."is_active" = true)
  GROUP BY "loc"."id", "loc"."code", "loc"."zone", "loc"."site_id", "s"."name", "p"."id", "p"."name", "p"."sku", "li"."unit";


ALTER VIEW "public"."inventory_stock_by_location" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_stock_by_site" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "current_qty" numeric DEFAULT '0'::numeric NOT NULL,
    "min_qty" numeric DEFAULT '0'::numeric NOT NULL,
    "max_qty" numeric DEFAULT '0'::numeric NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "avg_unit_cost" numeric
);


ALTER TABLE "public"."inventory_stock_by_site" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_stock_by_site" IS 'Core – tabla canónica para stock por sitio. Registra cantidades actuales y umbrales por site+product; usar para consultas de disponibilidad y reabastecimiento.';



CREATE TABLE IF NOT EXISTS "public"."loyalty_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "reward_id" "uuid" NOT NULL,
    "points_spent" integer NOT NULL,
    "qr_code" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "validated_at" timestamp with time zone,
    CONSTRAINT "loyalty_redemptions_points_spent_check" CHECK (("points_spent" > 0)),
    CONSTRAINT "loyalty_redemptions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'validated'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."loyalty_redemptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."loyalty_redemptions" IS 'Core – tabla canónica para redenciones de lealtad. Registro de canjes/validaciones y estado asociado a orders y usuarios.';



CREATE TABLE IF NOT EXISTS "public"."loyalty_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "points_cost" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "site_id" "uuid",
    CONSTRAINT "loyalty_rewards_points_cost_check" CHECK (("points_cost" > 0))
);


ALTER TABLE "public"."loyalty_rewards" OWNER TO "postgres";


COMMENT ON TABLE "public"."loyalty_rewards" IS 'Core – tabla canónica para recompensas de lealtad. Catálogo de recompensas canónicas que los usuarios pueden canjear.';



CREATE TABLE IF NOT EXISTS "public"."loyalty_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "kind" "text" NOT NULL,
    "points_delta" integer NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "loyalty_transactions_kind_check" CHECK (("kind" = ANY (ARRAY['earn'::"text", 'spend'::"text", 'adjust'::"text"]))),
    CONSTRAINT "loyalty_transactions_points_delta_check" CHECK (("points_delta" <> 0))
);


ALTER TABLE "public"."loyalty_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."loyalty_transactions" IS 'Core – tabla canónica para transacciones de lealtad. Registro de puntos ganados/gastados por user y relación con orders.';



CREATE SEQUENCE IF NOT EXISTS "public"."lpn_sequence"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lpn_sequence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT '1'::numeric NOT NULL,
    "unit_price" numeric DEFAULT '0'::numeric NOT NULL,
    "total_amount" numeric DEFAULT '0'::numeric NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "seat_number" integer,
    "course" "text" DEFAULT 'main'::"text",
    "status" "text" DEFAULT 'pending'::"text",
    "sent_at" timestamp with time zone,
    "allergy_alert" "text",
    "is_comped" boolean DEFAULT false,
    "comp_reason" "text"
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_items" IS 'Core – tabla canónica para líneas de pedido. Detalle de productos, cantidades y precios asociados a cada order.';



CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "order_type" "text" DEFAULT 'dine_in'::"text" NOT NULL,
    "source" "text" DEFAULT 'vento_os'::"text" NOT NULL,
    "table_number" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'unpaid'::"text" NOT NULL,
    "total_amount" numeric DEFAULT '0'::numeric NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inventory_processed" boolean DEFAULT false NOT NULL,
    "loyalty_processed" boolean DEFAULT false NOT NULL,
    "loyalty_points_awarded" integer DEFAULT 0 NOT NULL,
    "guest_info" "jsonb" DEFAULT '{}'::"jsonb",
    "site_id" "uuid",
    "session_id" "uuid",
    "server_id" "uuid",
    "split_type" "text",
    "discount_amount" numeric DEFAULT 0,
    "discount_reason" "text",
    "voided_at" timestamp with time zone,
    "voided_by" "uuid",
    "void_reason" "text"
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."orders" IS 'Core – tabla canónica para pedidos de clientes. Registro maestro de órdenes de venta/consumo (dine-in/takeaway) y su estado en el sistema.';



CREATE TABLE IF NOT EXISTS "public"."pos_cash_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "payment_method" "text",
    "reference" "text",
    "description" "text",
    "order_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_cash_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_cash_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "opening_amount" numeric DEFAULT 0 NOT NULL,
    "expected_amount" numeric,
    "counted_amount" numeric,
    "difference" numeric,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_cash_shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_modifier_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "modifier_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price_adjustment" numeric DEFAULT 0,
    "display_order" integer DEFAULT 0,
    "is_default" boolean DEFAULT false,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_modifier_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid",
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'single'::"text" NOT NULL,
    "is_required" boolean DEFAULT false,
    "min_selections" integer DEFAULT 0,
    "max_selections" integer DEFAULT 1,
    "display_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_order_item_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "modifier_id" "uuid" NOT NULL,
    "modifier_option_id" "uuid",
    "price_adjustment" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_order_item_modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "shift_id" "uuid",
    "payment_method" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "tip_amount" numeric DEFAULT 0,
    "reference" "text",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "processed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_product_modifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "modifier_id" "uuid" NOT NULL,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_product_modifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_session_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "seat_number" integer,
    "course" "text" DEFAULT 'main'::"text",
    "course_status" "text" DEFAULT 'pending'::"text",
    "fired_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_session_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "table_id" "uuid" NOT NULL,
    "server_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "pax" integer DEFAULT 1,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "zone_id" "uuid",
    "name" "text" NOT NULL,
    "table_number" integer,
    "shape" "text" DEFAULT 'square'::"text" NOT NULL,
    "capacity" integer DEFAULT 4 NOT NULL,
    "position_x" numeric DEFAULT 0 NOT NULL,
    "position_y" numeric DEFAULT 0 NOT NULL,
    "rotation" numeric DEFAULT 0,
    "width" numeric DEFAULT 80,
    "height" numeric DEFAULT 80,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_tables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_zones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#00d4ff'::"text",
    "display_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pos_zones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."procurement_agreed_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "agreed_price" numeric NOT NULL,
    "currency" "text" DEFAULT 'COP'::"text",
    "valid_from" timestamp with time zone DEFAULT "now"(),
    "valid_until" timestamp with time zone,
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."procurement_agreed_prices" OWNER TO "postgres";


COMMENT ON TABLE "public"."procurement_agreed_prices" IS 'Core – tabla canónica para precios acordados con proveedores. Almacena tarifas vigentes por supplier+product para negociar/planificar compras.';



CREATE TABLE IF NOT EXISTS "public"."procurement_reception_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reception_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity_declared" numeric NOT NULL,
    "quantity_received" numeric NOT NULL,
    "discrepancy" numeric GENERATED ALWAYS AS (("quantity_received" - "quantity_declared")) STORED
);


ALTER TABLE "public"."procurement_reception_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."procurement_reception_items" IS 'Core – tabla canónica para ítems de recepción de compra. Detalle de cantidades recibidas y discrepancias por recepción.';



CREATE TABLE IF NOT EXISTS "public"."procurement_receptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "received_by" "uuid" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"(),
    "site_id" "uuid",
    "evidence_photo_url" "text" NOT NULL,
    "weight_source" "text" DEFAULT 'MANUAL'::"text",
    "notes" "text",
    "geolocation" "jsonb"
);


ALTER TABLE "public"."procurement_receptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."procurement_receptions" IS 'Core – tabla canónica para recepciones de compras. Registra el acto de recepción físico/fecha/evidencia por purchase_order.';



CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "description" "text",
    "display_order" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "domain" "text",
    "parent_id" "uuid",
    "updated_at" timestamp with time zone,
    "site_id" "uuid"
);


ALTER TABLE "public"."product_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_categories" IS 'Core – tabla canónica para categorías de productos. Clasificación canónica usada por products (referenciar por category_id) en nuevas implementaciones.';



COMMENT ON COLUMN "public"."product_categories"."site_id" IS 'Sede específica de la categoría. NULL = categoría global compartida entre todas las sedes';



CREATE TABLE IF NOT EXISTS "public"."product_inventory_profiles" (
    "product_id" "uuid" NOT NULL,
    "track_inventory" boolean DEFAULT true NOT NULL,
    "inventory_kind" "text" DEFAULT 'unclassified'::"text" NOT NULL,
    "default_unit" "text",
    "lot_tracking" boolean DEFAULT false NOT NULL,
    "expiry_tracking" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_inventory_profiles_kind_chk" CHECK (("inventory_kind" = ANY (ARRAY['ingredient'::"text", 'finished'::"text", 'resale'::"text", 'packaging'::"text", 'asset'::"text", 'unclassified'::"text"])))
);


ALTER TABLE "public"."product_inventory_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_sku_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_sku_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_sku_sequences" (
    "brand_code" "text" NOT NULL,
    "type_code" "text" NOT NULL,
    "last_value" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_sku_sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "supplier_sku" "text",
    "purchase_unit" "text",
    "purchase_unit_size" numeric,
    "purchase_price" numeric,
    "currency" "text" DEFAULT 'COP'::"text" NOT NULL,
    "lead_time_days" integer,
    "min_order_qty" numeric,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_suppliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_suppliers" IS 'Core – tabla canónica para relación producto↔proveedor. Define proveedores asociados a productos, SKUs proveedor y condiciones de compra.';



CREATE TABLE IF NOT EXISTS "public"."production_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "recipe_card_id" "uuid",
    "produced_qty" numeric NOT NULL,
    "produced_unit" "text" NOT NULL,
    "total_cost" numeric,
    "unit_cost" numeric,
    "status" "text" DEFAULT 'posted'::"text" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."production_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."production_request_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "recipe_id" "uuid",
    "quantity" numeric DEFAULT '0'::numeric,
    "unit" "text",
    "requested_quantity" numeric DEFAULT '0'::numeric NOT NULL,
    "produced_quantity" numeric DEFAULT '0'::numeric NOT NULL,
    "loaded_quantity" numeric DEFAULT '0'::numeric NOT NULL,
    "received_quantity" numeric DEFAULT '0'::numeric NOT NULL,
    "stage_status" "text" DEFAULT '''pending'''::"text" NOT NULL
);


ALTER TABLE "public"."production_request_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."production_request_items" IS 'Core – tabla canónica para ítems de producción. Detalle de productos/recetas y cantidades asociadas a cada producción.';



CREATE TABLE IF NOT EXISTS "public"."production_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "from_location" "text" NOT NULL,
    "to_location" "text" NOT NULL,
    "status" "text" DEFAULT '''pending'''::"text" NOT NULL,
    "needed_for_date" "date",
    "notes" "text",
    "from_site_id" "uuid",
    "to_site_id" "uuid"
);


ALTER TABLE "public"."production_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."production_requests" IS 'Core – tabla canónica para solicitudes de producción. Coordina producción interna desde inventario/recetas entre sitios.';



CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity_ordered" numeric NOT NULL,
    "quantity_received" numeric,
    "unit_cost" numeric NOT NULL,
    "line_total" numeric,
    "unit" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."purchase_order_items" IS 'Core – tabla canónica para líneas de órdenes de compra. Detalle de productos, cantidades y costos por purchase_order.';



CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" "uuid" NOT NULL,
    "site_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expected_at" timestamp with time zone,
    "received_at" timestamp with time zone,
    "total_amount" numeric,
    "currency" "text" DEFAULT 'COP'::"text" NOT NULL,
    "notes" "text",
    "cost_center_id" "uuid",
    "approved_by" "uuid",
    "approval_date" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"()
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


COMMENT ON TABLE "public"."purchase_orders" IS 'Core – tabla canónica para órdenes de compra a proveedores. Registra pedidos, estado y metadatos para recepción y pagos.';



CREATE TABLE IF NOT EXISTS "public"."recipe_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "yield_qty" numeric DEFAULT 1 NOT NULL,
    "yield_unit" "text" NOT NULL,
    "portion_size" numeric,
    "portion_unit" "text",
    "prep_time_minutes" integer,
    "shelf_life_days" integer,
    "area" "text",
    "difficulty" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "site_id" "uuid",
    "area_id" "uuid",
    "recipe_description" "text",
    "cover_image_path" "text",
    "video_path" "text",
    "status" "public"."recipe_status" DEFAULT 'draft'::"public"."recipe_status" NOT NULL,
    CONSTRAINT "recipe_cards_yield_qty_positive" CHECK (("yield_qty" > (0)::numeric))
);


ALTER TABLE "public"."recipe_cards" OWNER TO "postgres";


COMMENT ON COLUMN "public"."recipe_cards"."status" IS 'Recipe workflow status: draft (work in progress), published (visible to staff), archived (hidden)';



CREATE TABLE IF NOT EXISTS "public"."recipe_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_card_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "description" "text" NOT NULL,
    "tip" "text",
    "time_minutes" integer,
    "image_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recipe_steps_step_number_positive" CHECK (("step_number" > 0)),
    CONSTRAINT "recipe_steps_time_minutes_positive" CHECK ((("time_minutes" IS NULL) OR ("time_minutes" >= 0)))
);


ALTER TABLE "public"."recipe_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT '0'::numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ingredient_product_id" "uuid"
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


COMMENT ON TABLE "public"."recipes" IS 'Core – tabla canónica para recetas/consumos. Define relaciones producto→insumo (inventory) y cantidades necesarias para producción.';



COMMENT ON COLUMN "public"."recipes"."product_id" IS 'ID del producto final (pizza, bebida, preparación terminada).';



COMMENT ON COLUMN "public"."recipes"."ingredient_product_id" IS 'Producto usado como ingrediente (FK a products.id). 
El producto debe tener product_type = ''insumo''. 
Este es el campo canónico que reemplaza a inventory_id (legacy).';



CREATE TABLE IF NOT EXISTS "public"."restock_request_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" numeric DEFAULT '0'::numeric NOT NULL,
    "unit" "text",
    "transfer_unit_price" numeric,
    "transfer_currency" "text",
    "transfer_total" numeric
);


ALTER TABLE "public"."restock_request_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."restock_request_items" IS 'Core – tabla canónica para ítems de reabastecimiento. Detalle de productos y cantidades solicitadas en cada restock_request.';



CREATE TABLE IF NOT EXISTS "public"."restock_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "from_location" "text" NOT NULL,
    "to_location" "text" NOT NULL,
    "status" "text" DEFAULT '''pending'''::"text" NOT NULL,
    "expected_date" "date",
    "notes" "text",
    "from_site_id" "uuid",
    "to_site_id" "uuid",
    "pricing_mode" "text" DEFAULT 'none'::"text" NOT NULL,
    "pricing_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "internal_supplier_site_id" "uuid"
);


ALTER TABLE "public"."restock_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."restock_requests" IS 'Core – tabla canónica para solicitudes de reabastecimiento. Gestiona pedidos internos de re-stock entre ubicaciones o hacia proveedores.';



CREATE OR REPLACE VIEW "public"."shift_calendar_view" AS
 SELECT "s"."id",
    "s"."employee_id",
    "e"."full_name" AS "employee_name",
    "e"."alias" AS "employee_alias",
    "s"."site_id",
    "si"."name" AS "site_name",
    "s"."shift_date",
    "s"."start_time",
    "s"."end_time",
    "s"."break_minutes",
    "s"."notes",
    "s"."status",
    ((EXTRACT(epoch FROM ("s"."end_time" - "s"."start_time")) / (3600)::numeric) - (("s"."break_minutes")::numeric / 60.0)) AS "scheduled_hours",
    ( SELECT "al"."occurred_at"
           FROM "public"."attendance_logs" "al"
          WHERE (("al"."employee_id" = "s"."employee_id") AND ("al"."site_id" = "s"."site_id") AND ("al"."action" = 'check_in'::"text") AND ("date"("al"."occurred_at") = "s"."shift_date"))
          ORDER BY "al"."occurred_at"
         LIMIT 1) AS "actual_check_in",
    ( SELECT "al"."occurred_at"
           FROM "public"."attendance_logs" "al"
          WHERE (("al"."employee_id" = "s"."employee_id") AND ("al"."site_id" = "s"."site_id") AND ("al"."action" = 'check_out'::"text") AND ("date"("al"."occurred_at") = "s"."shift_date"))
          ORDER BY "al"."occurred_at" DESC
         LIMIT 1) AS "actual_check_out",
    "s"."created_at",
    "s"."updated_at"
   FROM (("public"."employee_shifts" "s"
     JOIN "public"."employees" "e" ON (("e"."id" = "s"."employee_id")))
     JOIN "public"."sites" "si" ON (("si"."id" = "s"."site_id")));


ALTER VIEW "public"."shift_calendar_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."staff_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "email" "text",
    "full_name" "text",
    "staff_site_id" "uuid",
    "staff_role" "text",
    "staff_area" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."staff_invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff_invitations" IS 'Core – tabla canónica para invitaciones de staff. Gestiona invitaciones a empleados/colaboradores y su onboarding.';



CREATE TABLE IF NOT EXISTS "public"."staging_insumos_import" (
    "fecha" "text",
    "area" "text",
    "proveedor" "text",
    "producto" "text",
    "presentacion_raw" "text",
    "purchase_unit" "text",
    "purchase_unit_size" "text",
    "base_unit" "text",
    "unit_token" "text",
    "precio_raw" "text",
    "precio_cop" "text",
    "issues" "text"
);


ALTER TABLE "public"."staging_insumos_import" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "tax_id" "text",
    "contact_name" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."suppliers" IS 'Core – tabla canónica para proveedores. Datos maestros de proveedores usados en compras y acuerdos de suministro.';



CREATE TABLE IF NOT EXISTS "public"."user_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reward_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_favorites" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_favorites" IS 'Tabla de productos favoritos marcados por usuarios';



COMMENT ON COLUMN "public"."user_favorites"."user_id" IS 'ID del usuario que marcó el favorito';



COMMENT ON COLUMN "public"."user_favorites"."reward_id" IS 'ID del producto (reward) marcado como favorito';



COMMENT ON COLUMN "public"."user_favorites"."created_at" IS 'Fecha y hora en que se marcó como favorito';



CREATE TABLE IF NOT EXISTS "public"."user_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "site_id" "uuid",
    "rating" integer NOT NULL,
    "feedback_text" "text",
    "category" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "resolution_notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."user_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "document_id" "text",
    "phone" "text",
    "role" "text" DEFAULT 'client'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "loyalty_points" integer DEFAULT 0 NOT NULL,
    "email" "text",
    "document_type" "text",
    "birth_date" "date",
    "is_client" boolean DEFAULT true NOT NULL,
    "marketing_opt_in" boolean DEFAULT false NOT NULL,
    "has_reviewed_google" boolean DEFAULT false,
    "last_review_prompt_date" timestamp with time zone
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'Core – tabla canónica para usuarios/clients. Registro de clientes/usuarios del sistema, sus datos y relación con pedidos y lealtad.';



CREATE OR REPLACE VIEW "public"."v_inventory_catalog" AS
 SELECT "p"."id",
    "p"."name",
    "p"."description",
    "p"."sku",
    "p"."price",
    "p"."cost",
    "p"."unit",
    "p"."product_type",
    "p"."category_id",
    "pc"."name" AS "category_name",
    "p"."is_active",
    "p"."created_at",
    "p"."updated_at"
   FROM ("public"."products" "p"
     LEFT JOIN "public"."product_categories" "pc" ON (("p"."category_id" = "pc"."id")));


ALTER VIEW "public"."v_inventory_catalog" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_procurement_price_book" AS
 SELECT "s"."id" AS "supplier_id",
    "s"."name" AS "supplier_name",
    "p"."id" AS "product_id",
    "p"."name" AS "product_name",
    "p"."unit",
    "pap"."agreed_price",
    "pap"."valid_from",
    "pap"."valid_until",
    "pc"."name" AS "category_name"
   FROM ((("public"."procurement_agreed_prices" "pap"
     JOIN "public"."suppliers" "s" ON (("pap"."supplier_id" = "s"."id")))
     JOIN "public"."products" "p" ON (("pap"."product_id" = "p"."id")))
     LEFT JOIN "public"."product_categories" "pc" ON (("p"."category_id" = "pc"."id")))
  WHERE (("pap"."is_active" = true) AND ("s"."is_active" = true) AND ("p"."is_active" = true));


ALTER VIEW "public"."v_procurement_price_book" OWNER TO "postgres";


ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asistencia_logs"
    ADD CONSTRAINT "asistencia_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_areas"
    ADD CONSTRAINT "employee_areas_pkey" PRIMARY KEY ("employee_id", "area_id");



ALTER TABLE ONLY "public"."employee_settings"
    ADD CONSTRAINT "employee_settings_pkey" PRIMARY KEY ("employee_id");



ALTER TABLE ONLY "public"."employee_shifts"
    ADD CONSTRAINT "employee_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_sites"
    ADD CONSTRAINT "employee_sites_pkey" PRIMARY KEY ("employee_id", "site_id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_locations"
    ADD CONSTRAINT "inventory_locations_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."inventory_locations"
    ADD CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_lpn_items"
    ADD CONSTRAINT "inventory_lpn_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_lpns"
    ADD CONSTRAINT "inventory_lpns_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."inventory_lpns"
    ADD CONSTRAINT "inventory_lpns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movement_types"
    ADD CONSTRAINT "inventory_movement_types_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_stock_by_site"
    ADD CONSTRAINT "inventory_stock_by_site_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_stock_by_site"
    ADD CONSTRAINT "inventory_stock_by_site_site_product_unique" UNIQUE ("site_id", "product_id");



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_cash_movements"
    ADD CONSTRAINT "pos_cash_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_cash_shifts"
    ADD CONSTRAINT "pos_cash_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_modifier_options"
    ADD CONSTRAINT "pos_modifier_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_modifiers"
    ADD CONSTRAINT "pos_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_order_item_modifiers"
    ADD CONSTRAINT "pos_order_item_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_product_modifiers"
    ADD CONSTRAINT "pos_product_modifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_product_modifiers"
    ADD CONSTRAINT "pos_product_modifiers_product_id_modifier_id_key" UNIQUE ("product_id", "modifier_id");



ALTER TABLE ONLY "public"."pos_session_orders"
    ADD CONSTRAINT "pos_session_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_sessions"
    ADD CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_tables"
    ADD CONSTRAINT "pos_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_zones"
    ADD CONSTRAINT "pos_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procurement_agreed_prices"
    ADD CONSTRAINT "procurement_agreed_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procurement_reception_items"
    ADD CONSTRAINT "procurement_reception_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."procurement_receptions"
    ADD CONSTRAINT "procurement_receptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."product_inventory_profiles"
    ADD CONSTRAINT "product_inventory_profiles_pkey" PRIMARY KEY ("product_id");



ALTER TABLE ONLY "public"."product_sku_aliases"
    ADD CONSTRAINT "product_sku_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_sku_sequences"
    ADD CONSTRAINT "product_sku_sequences_pkey" PRIMARY KEY ("brand_code", "type_code");



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_request_items"
    ADD CONSTRAINT "production_request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."production_requests"
    ADD CONSTRAINT "production_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_cards"
    ADD CONSTRAINT "recipe_cards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_cards"
    ADD CONSTRAINT "recipe_cards_product_id_key" UNIQUE ("product_id");



ALTER TABLE ONLY "public"."recipe_steps"
    ADD CONSTRAINT "recipe_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_steps"
    ADD CONSTRAINT "recipe_steps_unique_step" UNIQUE ("recipe_card_id", "step_number");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restock_request_items"
    ADD CONSTRAINT "restock_request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restock_requests"
    ADD CONSTRAINT "restock_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "sites_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."sites"
    ADD CONSTRAINT "sites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_shifts"
    ADD CONSTRAINT "unique_employee_shift_per_day" UNIQUE ("employee_id", "site_id", "shift_date", "start_time");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_user_id_reward_id_key" UNIQUE ("user_id", "reward_id");



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_document_id_key" UNIQUE ("document_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "areas_site_code_unique" ON "public"."areas" USING "btree" ("site_id", "code");



CREATE INDEX "areas_site_id_idx" ON "public"."areas" USING "btree" ("site_id");



CREATE UNIQUE INDEX "asistencia_logs_employee_fecha_unique" ON "public"."asistencia_logs" USING "btree" ("empleado_id", "fecha_hora");



CREATE INDEX "attendance_logs_employee_occurred_at_idx" ON "public"."attendance_logs" USING "btree" ("employee_id", "occurred_at" DESC);



CREATE INDEX "employee_areas_employee_idx" ON "public"."employee_areas" USING "btree" ("employee_id");



CREATE UNIQUE INDEX "employee_areas_one_primary" ON "public"."employee_areas" USING "btree" ("employee_id") WHERE ("is_primary" = true);



CREATE INDEX "employee_sites_employee_idx" ON "public"."employee_sites" USING "btree" ("employee_id");



CREATE UNIQUE INDEX "employee_sites_one_primary" ON "public"."employee_sites" USING "btree" ("employee_id") WHERE ("is_primary" = true);



CREATE INDEX "employees_area_id_idx" ON "public"."employees" USING "btree" ("area_id");



CREATE INDEX "idx_attendance_logs_employee" ON "public"."attendance_logs" USING "btree" ("employee_id");



CREATE INDEX "idx_attendance_logs_employee_date" ON "public"."attendance_logs" USING "btree" ("employee_id", "occurred_at" DESC);



CREATE INDEX "idx_attendance_logs_occurred" ON "public"."attendance_logs" USING "btree" ("occurred_at" DESC);



CREATE INDEX "idx_attendance_logs_site_date" ON "public"."attendance_logs" USING "btree" ("site_id", "occurred_at" DESC);



CREATE INDEX "idx_employee_shifts_date_range" ON "public"."employee_shifts" USING "btree" ("shift_date", "site_id");



CREATE INDEX "idx_employee_shifts_employee_date" ON "public"."employee_shifts" USING "btree" ("employee_id", "shift_date" DESC);



CREATE INDEX "idx_employee_shifts_site_date" ON "public"."employee_shifts" USING "btree" ("site_id", "shift_date" DESC);



CREATE INDEX "idx_employee_shifts_status" ON "public"."employee_shifts" USING "btree" ("status") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "idx_inv_locations_code" ON "public"."inventory_locations" USING "btree" ("code");



CREATE INDEX "idx_inv_locations_site" ON "public"."inventory_locations" USING "btree" ("site_id");



CREATE INDEX "idx_inv_locations_zone" ON "public"."inventory_locations" USING "btree" ("zone");



CREATE INDEX "idx_inv_lpn_items_expiry" ON "public"."inventory_lpn_items" USING "btree" ("expiry_date");



CREATE INDEX "idx_inv_lpn_items_lot" ON "public"."inventory_lpn_items" USING "btree" ("lot_number");



CREATE INDEX "idx_inv_lpn_items_lpn" ON "public"."inventory_lpn_items" USING "btree" ("lpn_id");



CREATE INDEX "idx_inv_lpn_items_product" ON "public"."inventory_lpn_items" USING "btree" ("product_id");



CREATE INDEX "idx_inv_lpns_code" ON "public"."inventory_lpns" USING "btree" ("code");



CREATE INDEX "idx_inv_lpns_location" ON "public"."inventory_lpns" USING "btree" ("location_id");



CREATE INDEX "idx_inv_lpns_site" ON "public"."inventory_lpns" USING "btree" ("site_id");



CREATE INDEX "idx_inv_lpns_status" ON "public"."inventory_lpns" USING "btree" ("status");



CREATE INDEX "idx_inventory_movements_movement_type" ON "public"."inventory_movements" USING "btree" ("movement_type");



CREATE INDEX "idx_orders_table_status" ON "public"."orders" USING "btree" ("table_number", "status") WHERE ("status" <> 'paid'::"text");



CREATE INDEX "idx_product_categories_domain_site_id" ON "public"."product_categories" USING "btree" ("domain", "site_id");



CREATE INDEX "idx_product_categories_site_id" ON "public"."product_categories" USING "btree" ("site_id");



CREATE INDEX "idx_recipe_cards_area_id" ON "public"."recipe_cards" USING "btree" ("area_id");



CREATE INDEX "idx_recipe_cards_site_id" ON "public"."recipe_cards" USING "btree" ("site_id");



CREATE INDEX "idx_recipe_cards_status" ON "public"."recipe_cards" USING "btree" ("status");



CREATE INDEX "idx_recipe_steps_recipe_card_id" ON "public"."recipe_steps" USING "btree" ("recipe_card_id");



CREATE INDEX "idx_recipes_ingredient_product_id" ON "public"."recipes" USING "btree" ("ingredient_product_id");



CREATE INDEX "idx_sites_location" ON "public"."sites" USING "btree" ("latitude", "longitude") WHERE (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL));



CREATE INDEX "idx_user_favorites_created_at" ON "public"."user_favorites" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_favorites_reward_id" ON "public"."user_favorites" USING "btree" ("reward_id");



CREATE INDEX "idx_user_favorites_user_id" ON "public"."user_favorites" USING "btree" ("user_id");



CREATE INDEX "idx_user_feedback_created_at" ON "public"."user_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_user_feedback_rating" ON "public"."user_feedback" USING "btree" ("rating");



CREATE INDEX "idx_user_feedback_site_id" ON "public"."user_feedback" USING "btree" ("site_id");



CREATE INDEX "idx_user_feedback_status" ON "public"."user_feedback" USING "btree" ("status");



CREATE INDEX "idx_user_feedback_user_id" ON "public"."user_feedback" USING "btree" ("user_id");



CREATE INDEX "inventory_movements_related_purchase_order_id_idx" ON "public"."inventory_movements" USING "btree" ("related_purchase_order_id");



CREATE UNIQUE INDEX "inventory_stock_by_site_site_product_uidx" ON "public"."inventory_stock_by_site" USING "btree" ("site_id", "product_id");



CREATE UNIQUE INDEX "inventory_stock_by_site_unique_site_product" ON "public"."inventory_stock_by_site" USING "btree" ("site_id", "product_id");



CREATE INDEX "loyalty_redemptions_order_idx" ON "public"."loyalty_redemptions" USING "btree" ("order_id");



CREATE INDEX "loyalty_redemptions_reward_idx" ON "public"."loyalty_redemptions" USING "btree" ("reward_id");



CREATE INDEX "loyalty_redemptions_user_created_idx" ON "public"."loyalty_redemptions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "loyalty_transactions_order_idx" ON "public"."loyalty_transactions" USING "btree" ("order_id");



CREATE INDEX "loyalty_transactions_user_created_idx" ON "public"."loyalty_transactions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "product_categories_domain_idx" ON "public"."product_categories" USING "btree" ("domain");



CREATE UNIQUE INDEX "product_categories_domain_parent_slug_uidx" ON "public"."product_categories" USING "btree" ("domain", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "slug");



CREATE INDEX "product_categories_parent_id_idx" ON "public"."product_categories" USING "btree" ("parent_id");



CREATE INDEX "product_sku_aliases_product_id_idx" ON "public"."product_sku_aliases" USING "btree" ("product_id");



CREATE UNIQUE INDEX "product_sku_aliases_sku_key" ON "public"."product_sku_aliases" USING "btree" ("sku");



CREATE INDEX "purchase_orders_created_by_idx" ON "public"."purchase_orders" USING "btree" ("created_by");



CREATE UNIQUE INDEX "staff_invitations_token_key" ON "public"."staff_invitations" USING "btree" ("token");



CREATE OR REPLACE TRIGGER "attendance_logs_00_geofence" BEFORE INSERT ON "public"."attendance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_attendance_geofence"();



CREATE OR REPLACE TRIGGER "attendance_logs_enforce_sequence" BEFORE INSERT ON "public"."attendance_logs" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_attendance_sequence"();



CREATE OR REPLACE TRIGGER "on_loyalty_transaction_created" AFTER INSERT ON "public"."loyalty_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."update_loyalty_balance"();



CREATE OR REPLACE TRIGGER "set_updated_at_product_inventory_profiles" BEFORE UPDATE ON "public"."product_inventory_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_enforce_employee_role_site" BEFORE INSERT OR UPDATE OF "role", "site_id" ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_employee_role_site"();



CREATE OR REPLACE TRIGGER "trg_product_categories_updated_at" BEFORE UPDATE ON "public"."product_categories" FOR EACH ROW EXECUTE FUNCTION "public"."_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_product_sku" BEFORE INSERT OR UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_product_sku"();



CREATE OR REPLACE TRIGGER "trigger_employee_shifts_updated_at" BEFORE UPDATE ON "public"."employee_shifts" FOR EACH ROW EXECUTE FUNCTION "public"."update_employee_shifts_updated_at"();



CREATE OR REPLACE TRIGGER "update_inventory_locations_updated_at" BEFORE UPDATE ON "public"."inventory_locations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_inventory_lpn_items_updated_at" BEFORE UPDATE ON "public"."inventory_lpn_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "update_inventory_lpns_updated_at" BEFORE UPDATE ON "public"."inventory_lpns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attendance_logs"
    ADD CONSTRAINT "attendance_logs_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cost_centers"
    ADD CONSTRAINT "cost_centers_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."employee_areas"
    ADD CONSTRAINT "employee_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_areas"
    ADD CONSTRAINT "employee_areas_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_settings"
    ADD CONSTRAINT "employee_settings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_settings"
    ADD CONSTRAINT "employee_settings_selected_area_id_fkey" FOREIGN KEY ("selected_area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."employee_settings"
    ADD CONSTRAINT "employee_settings_selected_site_id_fkey" FOREIGN KEY ("selected_site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."employee_shifts"
    ADD CONSTRAINT "employee_shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."employee_shifts"
    ADD CONSTRAINT "employee_shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_shifts"
    ADD CONSTRAINT "employee_shifts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_sites"
    ADD CONSTRAINT "employee_sites_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_sites"
    ADD CONSTRAINT "employee_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."inventory_locations"
    ADD CONSTRAINT "inventory_locations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_lpn_items"
    ADD CONSTRAINT "inventory_lpn_items_lpn_id_fkey" FOREIGN KEY ("lpn_id") REFERENCES "public"."inventory_lpns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_lpn_items"
    ADD CONSTRAINT "inventory_lpn_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_lpns"
    ADD CONSTRAINT "inventory_lpns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_lpns"
    ADD CONSTRAINT "inventory_lpns_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_lpns"
    ADD CONSTRAINT "inventory_lpns_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_movement_type_fkey" FOREIGN KEY ("movement_type") REFERENCES "public"."inventory_movement_types"("code");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_production_batch_id_fkey" FOREIGN KEY ("related_production_batch_id") REFERENCES "public"."production_batches"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_related_order_id_fkey" FOREIGN KEY ("related_order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_related_production_request_id_fkey" FOREIGN KEY ("related_production_request_id") REFERENCES "public"."production_requests"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_related_purchase_order_id_fkey" FOREIGN KEY ("related_purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_related_restock_request_id_fkey" FOREIGN KEY ("related_restock_request_id") REFERENCES "public"."restock_requests"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."inventory_stock_by_site"
    ADD CONSTRAINT "inventory_stock_by_site_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_stock_by_site"
    ADD CONSTRAINT "inventory_stock_by_site_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."loyalty_redemptions"
    ADD CONSTRAINT "loyalty_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."loyalty_rewards"
    ADD CONSTRAINT "loyalty_rewards_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_transactions"
    ADD CONSTRAINT "loyalty_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON UPDATE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."pos_sessions"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."pos_cash_movements"
    ADD CONSTRAINT "pos_cash_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."pos_cash_movements"
    ADD CONSTRAINT "pos_cash_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."pos_cash_movements"
    ADD CONSTRAINT "pos_cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."pos_cash_shifts"("id");



ALTER TABLE ONLY "public"."pos_cash_shifts"
    ADD CONSTRAINT "pos_cash_shifts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."pos_cash_shifts"
    ADD CONSTRAINT "pos_cash_shifts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."pos_modifier_options"
    ADD CONSTRAINT "pos_modifier_options_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "public"."pos_modifiers"("id");



ALTER TABLE ONLY "public"."pos_modifiers"
    ADD CONSTRAINT "pos_modifiers_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."pos_order_item_modifiers"
    ADD CONSTRAINT "pos_order_item_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "public"."pos_modifiers"("id");



ALTER TABLE ONLY "public"."pos_order_item_modifiers"
    ADD CONSTRAINT "pos_order_item_modifiers_modifier_option_id_fkey" FOREIGN KEY ("modifier_option_id") REFERENCES "public"."pos_modifier_options"("id");



ALTER TABLE ONLY "public"."pos_order_item_modifiers"
    ADD CONSTRAINT "pos_order_item_modifiers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."pos_sessions"("id");



ALTER TABLE ONLY "public"."pos_payments"
    ADD CONSTRAINT "pos_payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."pos_cash_shifts"("id");



ALTER TABLE ONLY "public"."pos_product_modifiers"
    ADD CONSTRAINT "pos_product_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "public"."pos_modifiers"("id");



ALTER TABLE ONLY "public"."pos_product_modifiers"
    ADD CONSTRAINT "pos_product_modifiers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."pos_session_orders"
    ADD CONSTRAINT "pos_session_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."pos_session_orders"
    ADD CONSTRAINT "pos_session_orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."pos_sessions"("id");



ALTER TABLE ONLY "public"."pos_sessions"
    ADD CONSTRAINT "pos_sessions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."pos_sessions"
    ADD CONSTRAINT "pos_sessions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."pos_sessions"
    ADD CONSTRAINT "pos_sessions_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."pos_tables"("id");



ALTER TABLE ONLY "public"."pos_tables"
    ADD CONSTRAINT "pos_tables_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."pos_tables"
    ADD CONSTRAINT "pos_tables_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "public"."pos_zones"("id");



ALTER TABLE ONLY "public"."pos_zones"
    ADD CONSTRAINT "pos_zones_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."procurement_agreed_prices"
    ADD CONSTRAINT "procurement_agreed_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."procurement_agreed_prices"
    ADD CONSTRAINT "procurement_agreed_prices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."procurement_reception_items"
    ADD CONSTRAINT "procurement_reception_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."procurement_reception_items"
    ADD CONSTRAINT "procurement_reception_items_reception_id_fkey" FOREIGN KEY ("reception_id") REFERENCES "public"."procurement_receptions"("id");



ALTER TABLE ONLY "public"."procurement_receptions"
    ADD CONSTRAINT "procurement_receptions_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."procurement_receptions"
    ADD CONSTRAINT "procurement_receptions_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."procurement_receptions"
    ADD CONSTRAINT "procurement_receptions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."product_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_inventory_profiles"
    ADD CONSTRAINT "product_inventory_profiles_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_sku_aliases"
    ADD CONSTRAINT "product_sku_aliases_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."product_suppliers"
    ADD CONSTRAINT "product_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_recipe_card_id_fkey" FOREIGN KEY ("recipe_card_id") REFERENCES "public"."recipe_cards"("id");



ALTER TABLE ONLY "public"."production_batches"
    ADD CONSTRAINT "production_batches_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."production_request_items"
    ADD CONSTRAINT "production_request_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."production_request_items"
    ADD CONSTRAINT "production_request_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id");



ALTER TABLE ONLY "public"."production_request_items"
    ADD CONSTRAINT "production_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."production_requests"("id");



ALTER TABLE ONLY "public"."production_requests"
    ADD CONSTRAINT "production_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."production_requests"
    ADD CONSTRAINT "production_requests_from_site_id_fkey" FOREIGN KEY ("from_site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."production_requests"
    ADD CONSTRAINT "production_requests_to_site_id_fkey" FOREIGN KEY ("to_site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."recipe_cards"
    ADD CONSTRAINT "recipe_cards_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id");



ALTER TABLE ONLY "public"."recipe_cards"
    ADD CONSTRAINT "recipe_cards_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_cards"
    ADD CONSTRAINT "recipe_cards_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."recipe_steps"
    ADD CONSTRAINT "recipe_steps_recipe_card_id_fkey" FOREIGN KEY ("recipe_card_id") REFERENCES "public"."recipe_cards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_ingredient_product_id_fkey" FOREIGN KEY ("ingredient_product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."restock_request_items"
    ADD CONSTRAINT "restock_request_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."restock_request_items"
    ADD CONSTRAINT "restock_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."restock_requests"("id");



ALTER TABLE ONLY "public"."restock_requests"
    ADD CONSTRAINT "restock_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."restock_requests"
    ADD CONSTRAINT "restock_requests_from_site_id_fkey" FOREIGN KEY ("from_site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."restock_requests"
    ADD CONSTRAINT "restock_requests_internal_supplier_site_id_fkey" FOREIGN KEY ("internal_supplier_site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."restock_requests"
    ADD CONSTRAINT "restock_requests_to_site_id_fkey" FOREIGN KEY ("to_site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."staff_invitations"
    ADD CONSTRAINT "staff_invitations_staff_site_id_fkey" FOREIGN KEY ("staff_site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_favorites"
    ADD CONSTRAINT "user_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id");



ALTER TABLE ONLY "public"."user_feedback"
    ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can read movement types" ON "public"."inventory_movement_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Employees can view LPN items of their sites" ON "public"."inventory_lpn_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."inventory_lpns" "lpn"
     JOIN "public"."employee_sites" "es" ON (("lpn"."site_id" = "es"."site_id")))
  WHERE (("lpn"."id" = "inventory_lpn_items"."lpn_id") AND ("es"."employee_id" = "auth"."uid"())))));



CREATE POLICY "Employees can view LPNs of their sites" ON "public"."inventory_lpns" FOR SELECT USING (("site_id" IN ( SELECT "es"."site_id"
   FROM "public"."employee_sites" "es"
  WHERE ("es"."employee_id" = "auth"."uid"()))));



CREATE POLICY "Employees can view all feedback" ON "public"."user_feedback" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees"
  WHERE ("employees"."id" = "auth"."uid"()))));



CREATE POLICY "Employees can view locations of their sites" ON "public"."inventory_locations" FOR SELECT USING (("site_id" IN ( SELECT "es"."site_id"
   FROM "public"."employee_sites" "es"
  WHERE ("es"."employee_id" = "auth"."uid"()))));



CREATE POLICY "Owners and managers can manage locations" ON "public"."inventory_locations" USING ((EXISTS ( SELECT 1
   FROM ("public"."employees" "e"
     JOIN "public"."employee_sites" "es" ON (("e"."id" = "es"."employee_id")))
  WHERE (("e"."id" = "auth"."uid"()) AND ("es"."site_id" = "inventory_locations"."site_id") AND ("e"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'admin'::"text"]))))));



CREATE POLICY "Owners can update feedback" ON "public"."user_feedback" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees"
  WHERE (("employees"."id" = "auth"."uid"()) AND ("employees"."role" = 'owner'::"text")))));



CREATE POLICY "Staff can manage LPN items" ON "public"."inventory_lpn_items" USING ((EXISTS ( SELECT 1
   FROM (("public"."inventory_lpns" "lpn"
     JOIN "public"."employees" "e" ON (("e"."id" = "auth"."uid"())))
     JOIN "public"."employee_sites" "es" ON ((("e"."id" = "es"."employee_id") AND ("lpn"."site_id" = "es"."site_id"))))
  WHERE ("lpn"."id" = "inventory_lpn_items"."lpn_id"))));



CREATE POLICY "Staff can manage LPNs" ON "public"."inventory_lpns" USING ((EXISTS ( SELECT 1
   FROM ("public"."employees" "e"
     JOIN "public"."employee_sites" "es" ON (("e"."id" = "es"."employee_id")))
  WHERE (("e"."id" = "auth"."uid"()) AND ("es"."site_id" = "inventory_lpns"."site_id")))));



CREATE POLICY "Users can delete their own favorites" ON "public"."user_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own favorites" ON "public"."user_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own feedback" ON "public"."user_feedback" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own redemptions" ON "public"."loyalty_redemptions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own transactions" ON "public"."loyalty_transactions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own favorites" ON "public"."user_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own feedback" ON "public"."user_feedback" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "areas_select_staff" ON "public"."areas" FOR SELECT USING (("public"."can_access_area"("id") OR (("public"."current_employee_role"() = ANY (ARRAY['manager'::"text", 'logistics'::"text"])) AND "public"."can_access_site"("site_id"))));



CREATE POLICY "areas_write_owner" ON "public"."areas" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."attendance_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_logs_insert_self" ON "public"."attendance_logs" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" = "auth"."uid"()));



CREATE POLICY "attendance_logs_select_manager" ON "public"."attendance_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'global_manager'::"text"])) AND (("e"."role" = ANY (ARRAY['owner'::"text", 'global_manager'::"text"])) OR ("e"."site_id" = "attendance_logs"."site_id"))))));



CREATE POLICY "attendance_logs_select_self" ON "public"."attendance_logs" FOR SELECT TO "authenticated" USING (("employee_id" = "auth"."uid"()));



ALTER TABLE "public"."cost_centers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_areas_select_owner" ON "public"."employee_areas" FOR SELECT USING (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "employee_areas_select_self" ON "public"."employee_areas" FOR SELECT USING (("employee_id" = "auth"."uid"()));



CREATE POLICY "employee_areas_write_owner" ON "public"."employee_areas" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."employee_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_settings_insert_self" ON "public"."employee_settings" FOR INSERT WITH CHECK ((("employee_id" = "auth"."uid"()) AND (("selected_site_id" IS NULL) OR "public"."can_access_site"("selected_site_id")) AND (("selected_area_id" IS NULL) OR "public"."can_access_area"("selected_area_id"))));



CREATE POLICY "employee_settings_select_owner" ON "public"."employee_settings" FOR SELECT USING (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "employee_settings_select_self" ON "public"."employee_settings" FOR SELECT USING (("employee_id" = "auth"."uid"()));



CREATE POLICY "employee_settings_update_self" ON "public"."employee_settings" FOR UPDATE USING (("employee_id" = "auth"."uid"())) WITH CHECK ((("employee_id" = "auth"."uid"()) AND (("selected_site_id" IS NULL) OR "public"."can_access_site"("selected_site_id")) AND (("selected_area_id" IS NULL) OR "public"."can_access_area"("selected_area_id"))));



ALTER TABLE "public"."employee_shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_shifts_select_manager" ON "public"."employee_shifts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."role" = ANY (ARRAY['manager'::"text", 'area_manager'::"text"])) AND ("e"."site_id" = "employee_shifts"."site_id")))));



CREATE POLICY "employee_shifts_select_owner" ON "public"."employee_shifts" FOR SELECT USING (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "employee_shifts_select_self" ON "public"."employee_shifts" FOR SELECT USING (("employee_id" = "auth"."uid"()));



CREATE POLICY "employee_shifts_write_manager" ON "public"."employee_shifts" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."role" = ANY (ARRAY['manager'::"text", 'area_manager'::"text"])) AND ("e"."site_id" = "employee_shifts"."site_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."role" = ANY (ARRAY['manager'::"text", 'area_manager'::"text"])) AND ("e"."site_id" = "employee_shifts"."site_id")))));



CREATE POLICY "employee_shifts_write_owner" ON "public"."employee_shifts" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."employee_sites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_sites_select_owner" ON "public"."employee_sites" FOR SELECT USING (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "employee_sites_select_self" ON "public"."employee_sites" FOR SELECT USING (("employee_id" = "auth"."uid"()));



CREATE POLICY "employee_sites_write_owner" ON "public"."employee_sites" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_crud_purchase_orders" ON "public"."purchase_orders" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees"
  WHERE ("employees"."id" = "auth"."uid"()))));



CREATE POLICY "employees_crud_reception_items" ON "public"."procurement_reception_items" TO "authenticated" USING (true);



CREATE POLICY "employees_crud_receptions" ON "public"."procurement_receptions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees"
  WHERE ("employees"."id" = "auth"."uid"()))));



CREATE POLICY "employees_read_agreed_prices" ON "public"."procurement_agreed_prices" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees"
  WHERE ("employees"."id" = "auth"."uid"()))));



CREATE POLICY "employees_read_cost_centers" ON "public"."cost_centers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees"
  WHERE ("employees"."id" = "auth"."uid"()))));



CREATE POLICY "employees_read_suppliers" ON "public"."suppliers" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees"
  WHERE ("employees"."id" = "auth"."uid"()))));



CREATE POLICY "employees_select_area" ON "public"."employees" FOR SELECT USING ((("area_id" IS NOT NULL) AND "public"."can_access_area"("area_id")));



CREATE POLICY "employees_select_manager" ON "public"."employees" FOR SELECT USING ((("public"."is_manager_or_owner"() OR ("public"."current_employee_role"() = ANY (ARRAY['logistics'::"text"]))) AND "public"."can_access_site"("site_id")));



CREATE POLICY "employees_select_self" ON "public"."employees" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "employees_write_owner" ON "public"."employees" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."inventory_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_lpn_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_lpns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movement_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_movements_insert_roles" ON "public"."inventory_movements" FOR INSERT WITH CHECK ((("public"."current_employee_role"() = ANY (ARRAY['owner'::"text", 'manager'::"text", 'cashier'::"text", 'logistics'::"text"])) AND "public"."can_access_site"("site_id")));



CREATE POLICY "inventory_movements_select_site" ON "public"."inventory_movements" FOR SELECT USING (("public"."is_employee"() AND "public"."can_access_site"("site_id")));



CREATE POLICY "inventory_movements_update_owner" ON "public"."inventory_movements" FOR UPDATE USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."inventory_stock_by_site" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_stock_select_site" ON "public"."inventory_stock_by_site" FOR SELECT USING (("public"."is_employee"() AND "public"."can_access_site"("site_id")));



CREATE POLICY "inventory_stock_write_manager" ON "public"."inventory_stock_by_site" USING (("public"."is_owner"() OR "public"."is_global_manager"() OR ("public"."is_manager"() AND "public"."can_access_site"("site_id")))) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"() OR ("public"."is_manager"() AND "public"."can_access_site"("site_id"))));



ALTER TABLE "public"."loyalty_redemptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_redemptions_select_cashier" ON "public"."loyalty_redemptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."employees" "e"
     JOIN "public"."loyalty_rewards" "r" ON (("r"."id" = "loyalty_redemptions"."reward_id")))
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."is_active" = true) AND ("e"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'cashier'::"text"])) AND (("e"."site_id" = "r"."site_id") OR (EXISTS ( SELECT 1
           FROM "public"."employee_sites" "es"
          WHERE (("es"."employee_id" = "e"."id") AND ("es"."is_active" = true) AND ("es"."site_id" = "r"."site_id")))))))));



CREATE POLICY "loyalty_redemptions_select_own" ON "public"."loyalty_redemptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "loyalty_redemptions_validate_cashier" ON "public"."loyalty_redemptions" FOR UPDATE TO "authenticated" USING ((("status" = 'pending'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."employees" "e"
     JOIN "public"."loyalty_rewards" "r" ON (("r"."id" = "loyalty_redemptions"."reward_id")))
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."is_active" = true) AND ("e"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'cashier'::"text"])) AND (("e"."site_id" = "r"."site_id") OR (EXISTS ( SELECT 1
           FROM "public"."employee_sites" "es"
          WHERE (("es"."employee_id" = "e"."id") AND ("es"."is_active" = true) AND ("es"."site_id" = "r"."site_id")))))))))) WITH CHECK ((("status" = 'validated'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."employees" "e"
     JOIN "public"."loyalty_rewards" "r" ON (("r"."id" = "loyalty_redemptions"."reward_id")))
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."is_active" = true) AND ("e"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'cashier'::"text"])) AND (("e"."site_id" = "r"."site_id") OR (EXISTS ( SELECT 1
           FROM "public"."employee_sites" "es"
          WHERE (("es"."employee_id" = "e"."id") AND ("es"."is_active" = true) AND ("es"."site_id" = "r"."site_id"))))))))));



ALTER TABLE "public"."loyalty_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "loyalty_transactions_select_own" ON "public"."loyalty_transactions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_delete_owner" ON "public"."order_items" FOR DELETE USING (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "order_items_insert_client" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."client_id" = "auth"."uid"())))));



CREATE POLICY "order_items_insert_staff" ON "public"."order_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND "public"."is_employee"() AND "public"."can_access_site"("o"."site_id")))));



CREATE POLICY "order_items_select_client" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."client_id" = "auth"."uid"())))));



CREATE POLICY "order_items_select_staff" ON "public"."order_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND "public"."is_employee"() AND "public"."can_access_site"("o"."site_id")))));



CREATE POLICY "order_items_update_staff" ON "public"."order_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND "public"."is_employee"() AND "public"."can_access_site"("o"."site_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND "public"."is_employee"() AND "public"."can_access_site"("o"."site_id")))));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_delete_owner" ON "public"."orders" FOR DELETE USING (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "orders_insert_client" ON "public"."orders" FOR INSERT WITH CHECK ((("client_id" = "auth"."uid"()) AND ("source" = 'vento_pass'::"text")));



CREATE POLICY "orders_insert_staff" ON "public"."orders" FOR INSERT WITH CHECK (("public"."is_employee"() AND "public"."can_access_site"("site_id")));



CREATE POLICY "orders_select_client" ON "public"."orders" FOR SELECT USING (("client_id" = "auth"."uid"()));



CREATE POLICY "orders_select_staff" ON "public"."orders" FOR SELECT USING (("public"."is_employee"() AND "public"."can_access_site"("site_id")));



CREATE POLICY "orders_update_staff" ON "public"."orders" FOR UPDATE USING (("public"."is_employee"() AND "public"."can_access_site"("site_id"))) WITH CHECK (("public"."is_employee"() AND "public"."can_access_site"("site_id")));



ALTER TABLE "public"."procurement_agreed_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."procurement_reception_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."procurement_receptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_categories_select_client" ON "public"."product_categories" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_client" = true)))) AND ("is_active" = true)));



CREATE POLICY "product_categories_select_staff" ON "public"."product_categories" FOR SELECT USING ("public"."is_employee"());



CREATE POLICY "product_categories_write_owner" ON "public"."product_categories" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."product_inventory_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_inventory_profiles_select_staff" ON "public"."product_inventory_profiles" FOR SELECT USING ("public"."is_employee"());



CREATE POLICY "product_inventory_profiles_write_owner" ON "public"."product_inventory_profiles" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."product_sku_aliases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_sku_aliases_select_staff" ON "public"."product_sku_aliases" FOR SELECT TO "authenticated" USING ("public"."is_employee"());



ALTER TABLE "public"."product_sku_sequences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_suppliers_select_staff" ON "public"."product_suppliers" FOR SELECT USING ("public"."is_employee"());



CREATE POLICY "product_suppliers_write_owner" ON "public"."product_suppliers" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."production_batches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_batches_select_staff" ON "public"."production_batches" FOR SELECT USING ("public"."is_employee"());



CREATE POLICY "production_batches_write_production" ON "public"."production_batches" USING ((("public"."current_employee_role"() = ANY (ARRAY['owner'::"text", 'manager'::"text", 'barista'::"text", 'chef'::"text", 'cocinero'::"text", 'panadero'::"text", 'repostero'::"text", 'pastelero'::"text"])) AND (("public"."current_employee_role"() = ANY (ARRAY['owner'::"text", 'manager'::"text"])) OR ("site_id" = "public"."current_employee_site_id"())))) WITH CHECK ((("public"."current_employee_role"() = ANY (ARRAY['owner'::"text", 'manager'::"text", 'barista'::"text", 'chef'::"text", 'cocinero'::"text", 'panadero'::"text", 'repostero'::"text", 'pastelero'::"text"])) AND (("public"."current_employee_role"() = ANY (ARRAY['owner'::"text", 'manager'::"text"])) OR ("site_id" = "public"."current_employee_site_id"()))));



ALTER TABLE "public"."production_request_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_request_items_insert_site" ON "public"."production_request_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."production_requests" "r"
  WHERE (("r"."id" = "production_request_items"."request_id") AND "public"."is_employee"() AND ("public"."can_access_site"("r"."from_site_id") OR "public"."can_access_site"("r"."to_site_id"))))));



CREATE POLICY "production_request_items_select_site" ON "public"."production_request_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."production_requests" "r"
  WHERE (("r"."id" = "production_request_items"."request_id") AND "public"."is_employee"() AND ("public"."can_access_site"("r"."from_site_id") OR "public"."can_access_site"("r"."to_site_id"))))));



CREATE POLICY "production_request_items_update_site" ON "public"."production_request_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."production_requests" "r"
  WHERE (("r"."id" = "production_request_items"."request_id") AND "public"."is_employee"() AND ("public"."can_access_site"("r"."from_site_id") OR "public"."can_access_site"("r"."to_site_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."production_requests" "r"
  WHERE (("r"."id" = "production_request_items"."request_id") AND "public"."is_employee"() AND ("public"."can_access_site"("r"."from_site_id") OR "public"."can_access_site"("r"."to_site_id"))))));



ALTER TABLE "public"."production_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "production_requests_delete_owner" ON "public"."production_requests" FOR DELETE USING (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "production_requests_insert_site" ON "public"."production_requests" FOR INSERT WITH CHECK (("public"."is_employee"() AND ("public"."can_access_site"("from_site_id") OR "public"."can_access_site"("to_site_id"))));



CREATE POLICY "production_requests_select_site" ON "public"."production_requests" FOR SELECT USING (("public"."is_employee"() AND ("public"."can_access_site"("from_site_id") OR "public"."can_access_site"("to_site_id"))));



CREATE POLICY "production_requests_update_site" ON "public"."production_requests" FOR UPDATE USING (("public"."is_employee"() AND ("public"."can_access_site"("from_site_id") OR "public"."can_access_site"("to_site_id")))) WITH CHECK (("public"."is_employee"() AND ("public"."can_access_site"("from_site_id") OR "public"."can_access_site"("to_site_id"))));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_select_client" ON "public"."products" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."is_client" = true)))) AND ("is_active" = true) AND ("product_type" = 'sale'::"text")));



CREATE POLICY "products_select_staff" ON "public"."products" FOR SELECT USING ("public"."is_employee"());



CREATE POLICY "products_write_owner" ON "public"."products" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_cards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipe_cards_select_staff" ON "public"."recipe_cards" FOR SELECT USING ("public"."can_access_recipe_scope"("site_id", "area_id"));



CREATE POLICY "recipe_cards_write_manager" ON "public"."recipe_cards" USING ((("public"."is_owner"() OR "public"."is_manager"()) AND "public"."can_access_recipe_scope"("site_id", "area_id"))) WITH CHECK ((("public"."is_owner"() OR "public"."is_manager"()) AND "public"."can_access_recipe_scope"("site_id", "area_id")));



ALTER TABLE "public"."recipe_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipe_steps_select_staff" ON "public"."recipe_steps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."recipe_cards" "rc"
  WHERE (("rc"."id" = "recipe_steps"."recipe_card_id") AND "public"."can_access_recipe_scope"("rc"."site_id", "rc"."area_id")))));



CREATE POLICY "recipe_steps_write_manager" ON "public"."recipe_steps" USING (("public"."is_owner"() OR "public"."is_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_manager"()));



ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipes_select_staff" ON "public"."recipes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."recipe_cards" "rc"
  WHERE (("rc"."product_id" = "recipes"."product_id") AND "public"."can_access_recipe_scope"("rc"."site_id", "rc"."area_id")))));



CREATE POLICY "recipes_write_manager" ON "public"."recipes" USING (("public"."is_owner"() OR "public"."is_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_manager"()));



ALTER TABLE "public"."restock_request_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restock_request_items_insert_site" ON "public"."restock_request_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."restock_requests" "r"
  WHERE (("r"."id" = "restock_request_items"."request_id") AND "public"."is_employee"() AND ("public"."can_access_site"("r"."from_site_id") OR "public"."can_access_site"("r"."to_site_id"))))));



CREATE POLICY "restock_request_items_select_site" ON "public"."restock_request_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."restock_requests" "r"
  WHERE (("r"."id" = "restock_request_items"."request_id") AND "public"."is_employee"() AND ("public"."can_access_site"("r"."from_site_id") OR "public"."can_access_site"("r"."to_site_id"))))));



CREATE POLICY "restock_request_items_update_site" ON "public"."restock_request_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."restock_requests" "r"
  WHERE (("r"."id" = "restock_request_items"."request_id") AND "public"."is_employee"() AND ("public"."can_access_site"("r"."from_site_id") OR "public"."can_access_site"("r"."to_site_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."restock_requests" "r"
  WHERE (("r"."id" = "restock_request_items"."request_id") AND "public"."is_employee"() AND ("public"."can_access_site"("r"."from_site_id") OR "public"."can_access_site"("r"."to_site_id"))))));



ALTER TABLE "public"."restock_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "restock_requests_delete_owner" ON "public"."restock_requests" FOR DELETE USING (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "restock_requests_insert_site" ON "public"."restock_requests" FOR INSERT WITH CHECK (("public"."is_employee"() AND ("public"."can_access_site"("from_site_id") OR "public"."can_access_site"("to_site_id"))));



CREATE POLICY "restock_requests_select_site" ON "public"."restock_requests" FOR SELECT USING (("public"."is_employee"() AND ("public"."can_access_site"("from_site_id") OR "public"."can_access_site"("to_site_id"))));



CREATE POLICY "restock_requests_update_site" ON "public"."restock_requests" FOR UPDATE USING (("public"."is_employee"() AND ("public"."can_access_site"("from_site_id") OR "public"."can_access_site"("to_site_id")))) WITH CHECK (("public"."is_employee"() AND ("public"."can_access_site"("from_site_id") OR "public"."can_access_site"("to_site_id"))));



ALTER TABLE "public"."sites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sites_select_public_vento_pass" ON "public"."sites" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) AND ("is_public" = true)));



CREATE POLICY "sites_select_staff" ON "public"."sites" FOR SELECT USING ("public"."can_access_site"("id"));



CREATE POLICY "sites_write_owner" ON "public"."sites" USING (("public"."is_owner"() OR "public"."is_global_manager"())) WITH CHECK (("public"."is_owner"() OR "public"."is_global_manager"()));



CREATE POLICY "staff_select_all_redemptions" ON "public"."loyalty_redemptions" FOR SELECT TO "authenticated" USING ("public"."is_active_staff"());



CREATE POLICY "staff_select_all_users" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."is_active_staff"());



CREATE POLICY "staff_validate_redemptions" ON "public"."loyalty_redemptions" FOR UPDATE TO "authenticated" USING (("public"."is_active_staff"() AND ("status" = 'pending'::"text"))) WITH CHECK (("public"."is_active_staff"() AND ("status" = 'validated'::"text")));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert_self" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "users_select_cashier" ON "public"."users" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."is_active" = true) AND ("e"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'cashier'::"text"]))))));



CREATE POLICY "users_select_cashier_for_qr" ON "public"."users" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "auth"."uid"()) AND ("e"."is_active" = true) AND ("e"."role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'cashier'::"text"]))))));



CREATE POLICY "users_select_self" ON "public"."users" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "users_update_self" ON "public"."users" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."_vento_norm"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_vento_norm"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_vento_norm"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_vento_slugify"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_vento_slugify"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_vento_slugify"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."_vento_uuid_from_text"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_vento_uuid_from_text"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_vento_uuid_from_text"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_area"("p_area_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_area"("p_area_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_area"("p_area_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_recipe_scope"("p_site_id" "uuid", "p_area_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_recipe_scope"("p_site_id" "uuid", "p_area_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_recipe_scope"("p_site_id" "uuid", "p_area_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_site"("p_site_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_site"("p_site_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_site"("p_site_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_employee_area_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_employee_area_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_employee_area_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_employee_primary_site_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_employee_primary_site_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_employee_primary_site_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_employee_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_employee_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_employee_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_employee_selected_area_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_employee_selected_area_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_employee_selected_area_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_employee_selected_site_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_employee_selected_site_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_employee_selected_site_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_employee_site_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_employee_site_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_employee_site_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."device_info_has_blocking_warnings"("di" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."device_info_has_blocking_warnings"("di" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."device_info_has_blocking_warnings"("di" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_attendance_geofence"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_attendance_geofence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_attendance_geofence"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_attendance_sequence"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_attendance_sequence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_attendance_sequence"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_employee_role_site"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_employee_role_site"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_employee_role_site"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_location_code"("p_site_code" "text", "p_zone" "text", "p_aisle" "text", "p_level" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_location_code"("p_site_code" "text", "p_zone" "text", "p_aisle" "text", "p_level" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_location_code"("p_site_code" "text", "p_zone" "text", "p_aisle" "text", "p_level" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_lpn_code"("p_site_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_lpn_code"("p_site_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_lpn_code"("p_site_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_product_sku"("p_product_type" "text", "p_site_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_product_sku"("p_product_type" "text", "p_site_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_product_sku"("p_product_type" "text", "p_site_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."grant_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_loyalty_points"("p_user_id" "uuid", "p_points" integer, "p_description" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."haversine_m"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."haversine_m"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."haversine_m"("lat1" numeric, "lon1" numeric, "lat2" numeric, "lon2" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_employee"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_employee"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_employee"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_global_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_global_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_global_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_manager_or_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_manager_or_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_manager_or_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_loyalty_earning"("p_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_loyalty_earning"("p_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_loyalty_earning"("p_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_order_payment"("p_order_id" "uuid", "p_site_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."process_order_payment"("p_order_id" "uuid", "p_site_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_order_payment"("p_order_id" "uuid", "p_site_id" "uuid", "p_payment_method" "text", "p_payment_reference" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."receive_purchase_order"("p_purchase_order_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."receive_purchase_order"("p_purchase_order_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_purchase_order"("p_purchase_order_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_product_sku_brand_code"("p_site_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_product_sku_brand_code"("p_site_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_product_sku_brand_code"("p_site_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_product_sku_type_code"("p_product_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_product_sku_type_code"("p_product_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_product_sku_type_code"("p_product_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_product_sku"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_product_sku"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_product_sku"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_employee_shifts_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_employee_shifts_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_employee_shifts_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_loyalty_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_loyalty_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_loyalty_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."util_column_usage"("p_table" "regclass") TO "anon";
GRANT ALL ON FUNCTION "public"."util_column_usage"("p_table" "regclass") TO "authenticated";
GRANT ALL ON FUNCTION "public"."util_column_usage"("p_table" "regclass") TO "service_role";



GRANT ALL ON TABLE "public"."_backup_inventory_movements_initial_count" TO "anon";
GRANT ALL ON TABLE "public"."_backup_inventory_movements_initial_count" TO "authenticated";
GRANT ALL ON TABLE "public"."_backup_inventory_movements_initial_count" TO "service_role";



GRANT ALL ON TABLE "public"."areas" TO "anon";
GRANT ALL ON TABLE "public"."areas" TO "authenticated";
GRANT ALL ON TABLE "public"."areas" TO "service_role";



GRANT ALL ON TABLE "public"."asistencia_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."asistencia_logs" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_logs" TO "anon";
GRANT ALL ON TABLE "public"."attendance_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_logs" TO "service_role";



GRANT ALL ON TABLE "public"."cost_centers" TO "anon";
GRANT ALL ON TABLE "public"."cost_centers" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_centers" TO "service_role";



GRANT ALL ON TABLE "public"."employee_areas" TO "anon";
GRANT ALL ON TABLE "public"."employee_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_areas" TO "service_role";



GRANT ALL ON TABLE "public"."employee_attendance_status" TO "anon";
GRANT ALL ON TABLE "public"."employee_attendance_status" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_attendance_status" TO "service_role";



GRANT ALL ON TABLE "public"."employee_settings" TO "anon";
GRANT ALL ON TABLE "public"."employee_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_settings" TO "service_role";



GRANT ALL ON TABLE "public"."employee_shifts" TO "anon";
GRANT ALL ON TABLE "public"."employee_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."employee_sites" TO "anon";
GRANT ALL ON TABLE "public"."employee_sites" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_sites" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_locations" TO "anon";
GRANT ALL ON TABLE "public"."inventory_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_locations" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_lpn_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_lpn_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_lpn_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_lpns" TO "anon";
GRANT ALL ON TABLE "public"."inventory_lpns" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_lpns" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movement_types" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movement_types" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movement_types" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."sites" TO "anon";
GRANT ALL ON TABLE "public"."sites" TO "authenticated";
GRANT ALL ON TABLE "public"."sites" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_stock_by_location" TO "anon";
GRANT ALL ON TABLE "public"."inventory_stock_by_location" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_stock_by_location" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_stock_by_site" TO "anon";
GRANT ALL ON TABLE "public"."inventory_stock_by_site" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_stock_by_site" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_redemptions" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."loyalty_rewards" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_rewards" TO "service_role";



GRANT ALL ON TABLE "public"."loyalty_transactions" TO "anon";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."loyalty_transactions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lpn_sequence" TO "anon";
GRANT ALL ON SEQUENCE "public"."lpn_sequence" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lpn_sequence" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."pos_cash_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_cash_movements" TO "service_role";



GRANT ALL ON TABLE "public"."pos_cash_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_cash_shifts" TO "service_role";



GRANT ALL ON TABLE "public"."pos_modifier_options" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_modifier_options" TO "service_role";



GRANT ALL ON TABLE "public"."pos_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."pos_order_item_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_order_item_modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."pos_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_payments" TO "service_role";



GRANT ALL ON TABLE "public"."pos_product_modifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_product_modifiers" TO "service_role";



GRANT ALL ON TABLE "public"."pos_session_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_session_orders" TO "service_role";



GRANT ALL ON TABLE "public"."pos_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."pos_tables" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_tables" TO "service_role";



GRANT ALL ON TABLE "public"."pos_zones" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_zones" TO "service_role";



GRANT ALL ON TABLE "public"."procurement_agreed_prices" TO "anon";
GRANT ALL ON TABLE "public"."procurement_agreed_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."procurement_agreed_prices" TO "service_role";



GRANT ALL ON TABLE "public"."procurement_reception_items" TO "anon";
GRANT ALL ON TABLE "public"."procurement_reception_items" TO "authenticated";
GRANT ALL ON TABLE "public"."procurement_reception_items" TO "service_role";



GRANT ALL ON TABLE "public"."procurement_receptions" TO "anon";
GRANT ALL ON TABLE "public"."procurement_receptions" TO "authenticated";
GRANT ALL ON TABLE "public"."procurement_receptions" TO "service_role";



GRANT ALL ON TABLE "public"."product_categories" TO "anon";
GRANT ALL ON TABLE "public"."product_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."product_categories" TO "service_role";



GRANT ALL ON TABLE "public"."product_inventory_profiles" TO "anon";
GRANT ALL ON TABLE "public"."product_inventory_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."product_inventory_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."product_sku_aliases" TO "anon";
GRANT ALL ON TABLE "public"."product_sku_aliases" TO "authenticated";
GRANT ALL ON TABLE "public"."product_sku_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."product_sku_sequences" TO "anon";
GRANT ALL ON TABLE "public"."product_sku_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."product_sku_sequences" TO "service_role";



GRANT ALL ON TABLE "public"."product_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."product_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."product_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."production_batches" TO "anon";
GRANT ALL ON TABLE "public"."production_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."production_batches" TO "service_role";



GRANT ALL ON TABLE "public"."production_request_items" TO "anon";
GRANT ALL ON TABLE "public"."production_request_items" TO "authenticated";
GRANT ALL ON TABLE "public"."production_request_items" TO "service_role";



GRANT ALL ON TABLE "public"."production_requests" TO "anon";
GRANT ALL ON TABLE "public"."production_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."production_requests" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_cards" TO "anon";
GRANT ALL ON TABLE "public"."recipe_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_cards" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_steps" TO "anon";
GRANT ALL ON TABLE "public"."recipe_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_steps" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."restock_request_items" TO "anon";
GRANT ALL ON TABLE "public"."restock_request_items" TO "authenticated";
GRANT ALL ON TABLE "public"."restock_request_items" TO "service_role";



GRANT ALL ON TABLE "public"."restock_requests" TO "anon";
GRANT ALL ON TABLE "public"."restock_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."restock_requests" TO "service_role";



GRANT ALL ON TABLE "public"."shift_calendar_view" TO "anon";
GRANT ALL ON TABLE "public"."shift_calendar_view" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_calendar_view" TO "service_role";



GRANT ALL ON TABLE "public"."staff_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."staging_insumos_import" TO "authenticated";
GRANT ALL ON TABLE "public"."staging_insumos_import" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."user_favorites" TO "anon";
GRANT ALL ON TABLE "public"."user_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."user_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."user_feedback" TO "anon";
GRANT ALL ON TABLE "public"."user_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."user_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."v_inventory_catalog" TO "anon";
GRANT ALL ON TABLE "public"."v_inventory_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."v_inventory_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."v_procurement_price_book" TO "anon";
GRANT ALL ON TABLE "public"."v_procurement_price_book" TO "authenticated";
GRANT ALL ON TABLE "public"."v_procurement_price_book" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







