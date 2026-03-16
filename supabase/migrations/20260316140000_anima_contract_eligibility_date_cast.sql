-- Asegurar comparación por fecha (evitar problemas con timestamptz y zona horaria).
create or replace function public.employee_wallet_eligibility(p_employee_id uuid default null)
returns table (
  employee_id uuid,
  contract_active boolean,
  contract_document_id uuid,
  contract_start_date date,
  contract_end_date date,
  documents_complete boolean,
  missing_required_document_type_ids uuid[],
  wallet_eligible boolean,
  wallet_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := current_date;
  v_emp_id uuid;
  v_contract_doc_id uuid;
  v_contract_start date;
  v_contract_end date;
  v_contract_ok boolean := false;
  v_required_ids uuid[];
  v_missing_ids uuid[] := '{}';
  v_docs_ok boolean := true;
  v_emp_active boolean;
  v_card_status text;
  v_rule record;
  v_has_doc boolean;
begin
  for v_emp_id in
    select e.id
    from public.employees e
    where p_employee_id is null or e.id = p_employee_id
  loop
    v_contract_doc_id := null;
    v_contract_start := null;
    v_contract_end := null;
    v_contract_ok := false;
    v_missing_ids := '{}';
    v_docs_ok := true;

    -- Contrato activo: documento tipo employment_contract con vigencia que incluya hoy.
    -- Comparación por fecha (::date) por si issue_date/expiry_date son timestamptz.
    select d.id, (d.issue_date)::date, (d.expiry_date)::date
    into v_contract_doc_id, v_contract_start, v_contract_end
    from public.documents d
    join public.document_types dt on dt.id = d.document_type_id and dt.system_key = 'employment_contract'
    where d.target_employee_id = v_emp_id
      and d.scope = 'employee'
      and d.status <> 'rejected'
      and d.issue_date is not null
      and ((d.expiry_date)::date is null or (d.expiry_date)::date >= v_today)
      and (d.issue_date)::date <= v_today
    order by (d.expiry_date)::date desc nulls first
    limit 1;

    v_contract_ok := v_contract_doc_id is not null;

    -- Documentos requeridos: reglas que aplican al empleado (por sede principal y rol)
    select array_agg(r.document_type_id order by r.display_order, r.document_type_id)
    into v_required_ids
    from public.required_document_rules r
    where r.active = true
      and r.is_required = true
      and (r.site_id is null or r.site_id = (
        select coalesce(es.site_id, e.site_id)
        from public.employees e
        left join public.employee_sites es on es.employee_id = e.id and es.is_primary = true
        where e.id = v_emp_id
        limit 1
      ))
      and (r.role is null or r.role = (select e.role from public.employees e where e.id = v_emp_id limit 1));

    if v_required_ids is not null then
      for v_rule in
        select unnest(v_required_ids) as doc_type_id
      loop
        select exists (
          select 1
          from public.documents d
          where d.target_employee_id = v_emp_id
            and d.document_type_id = v_rule.doc_type_id
            and d.scope = 'employee'
            and d.status <> 'rejected'
        ) into v_has_doc;
        if not v_has_doc then
          v_missing_ids := array_append(v_missing_ids, v_rule.doc_type_id);
          v_docs_ok := false;
        end if;
      end loop;
    end if;

    if v_required_ids is null or array_length(v_required_ids, 1) is null then
      v_docs_ok := true;
    end if;

    select e.is_active from public.employees e where e.id = v_emp_id limit 1 into v_emp_active;

    select coalesce(c.status::text, 'eligible')
    into v_card_status
    from public.employee_wallet_cards c
    where c.employee_id = v_emp_id
    limit 1;

    employee_id := v_emp_id;
    contract_active := v_contract_ok;
    contract_document_id := v_contract_doc_id;
    contract_start_date := v_contract_start;
    contract_end_date := v_contract_end;
    documents_complete := v_docs_ok;
    missing_required_document_type_ids := v_missing_ids;
    wallet_eligible := coalesce(v_emp_active, false) and v_contract_ok and v_docs_ok;
    wallet_status := v_card_status;
    return next;
  end loop;
end;
$$;
