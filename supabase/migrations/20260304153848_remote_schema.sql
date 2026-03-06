create extension if not exists "pg_cron" with schema "pg_catalog";

create extension if not exists "pg_net" with schema "extensions";

create schema if not exists "vital";

create type "public"."document_scope" as enum ('employee', 'site', 'group');

create type "public"."document_status" as enum ('pending_review', 'approved', 'rejected');

create type "public"."permission_scope_type" as enum ('global', 'site', 'site_type', 'area', 'area_kind');

create type "public"."support_ticket_status" as enum ('open', 'in_progress', 'resolved', 'closed');

create type "vital"."challenge_scope" as enum ('personal', 'squad', 'company');

create type "vital"."competition_mode" as enum ('private', 'friends', 'team', 'public');

create type "vital"."fair_play_severity" as enum ('low', 'medium', 'high');

create type "vital"."league_tier" as enum ('bronze', 'silver', 'gold', 'platinum', 'titan');

create type "vital"."profile_context" as enum ('personal', 'employee');

create type "vital"."program_status" as enum ('draft', 'active', 'paused', 'archived');

create type "vital"."task_status" as enum ('pending', 'in_progress', 'completed', 'skipped', 'snoozed');

create sequence "public"."inventory_sku_seq";

drop policy "employees_write_owner" on "public"."employees";

drop policy "Employees can view locations of their sites" on "public"."inventory_locations";

drop policy "Owners and managers can manage locations" on "public"."inventory_locations";

drop policy "Employees can view LPNs of their sites" on "public"."inventory_lpns";

drop policy "Staff can manage LPNs" on "public"."inventory_lpns";

drop policy "inventory_movements_insert_roles" on "public"."inventory_movements";

drop policy "inventory_movements_select_site" on "public"."inventory_movements";

drop policy "inventory_movements_update_owner" on "public"."inventory_movements";

drop policy "inventory_stock_select_site" on "public"."inventory_stock_by_site";

drop policy "inventory_stock_write_manager" on "public"."inventory_stock_by_site";

drop policy "employees_crud_reception_items" on "public"."procurement_reception_items";

drop policy "employees_crud_receptions" on "public"."procurement_receptions";

drop policy "restock_request_items_insert_site" on "public"."restock_request_items";

drop policy "restock_request_items_select_site" on "public"."restock_request_items";

drop policy "restock_request_items_update_site" on "public"."restock_request_items";

drop policy "restock_requests_delete_owner" on "public"."restock_requests";

drop policy "restock_requests_insert_site" on "public"."restock_requests";

drop policy "restock_requests_select_site" on "public"."restock_requests";

drop policy "restock_requests_update_site" on "public"."restock_requests";

drop policy "areas_select_staff" on "public"."areas";

drop policy "attendance_logs_select_manager" on "public"."attendance_logs";

drop policy "employee_shifts_select_manager" on "public"."employee_shifts";

drop policy "employee_shifts_write_manager" on "public"."employee_shifts";

drop policy "employees_select_area" on "public"."employees";

drop policy "employees_select_manager" on "public"."employees";

drop policy "loyalty_redemptions_select_cashier" on "public"."loyalty_redemptions";

drop policy "loyalty_redemptions_validate_cashier" on "public"."loyalty_redemptions";

drop policy "production_batches_write_production" on "public"."production_batches";

drop policy "Owners can update feedback" on "public"."user_feedback";

drop policy "users_select_cashier" on "public"."users";

drop policy "users_select_cashier_for_qr" on "public"."users";

revoke delete on table "public"."_backup_inventory_movements_initial_count" from "anon";

revoke insert on table "public"."_backup_inventory_movements_initial_count" from "anon";

revoke references on table "public"."_backup_inventory_movements_initial_count" from "anon";

revoke select on table "public"."_backup_inventory_movements_initial_count" from "anon";

revoke trigger on table "public"."_backup_inventory_movements_initial_count" from "anon";

revoke truncate on table "public"."_backup_inventory_movements_initial_count" from "anon";

revoke update on table "public"."_backup_inventory_movements_initial_count" from "anon";

revoke delete on table "public"."_backup_inventory_movements_initial_count" from "authenticated";

revoke insert on table "public"."_backup_inventory_movements_initial_count" from "authenticated";

revoke references on table "public"."_backup_inventory_movements_initial_count" from "authenticated";

revoke select on table "public"."_backup_inventory_movements_initial_count" from "authenticated";

revoke trigger on table "public"."_backup_inventory_movements_initial_count" from "authenticated";

revoke truncate on table "public"."_backup_inventory_movements_initial_count" from "authenticated";

revoke update on table "public"."_backup_inventory_movements_initial_count" from "authenticated";

revoke delete on table "public"."_backup_inventory_movements_initial_count" from "service_role";

revoke insert on table "public"."_backup_inventory_movements_initial_count" from "service_role";

revoke references on table "public"."_backup_inventory_movements_initial_count" from "service_role";

revoke select on table "public"."_backup_inventory_movements_initial_count" from "service_role";

revoke trigger on table "public"."_backup_inventory_movements_initial_count" from "service_role";

revoke truncate on table "public"."_backup_inventory_movements_initial_count" from "service_role";

revoke update on table "public"."_backup_inventory_movements_initial_count" from "service_role";

alter table "public"."employees" drop constraint "employees_role_check";

alter table "public"."product_categories" drop constraint "product_categories_slug_key";

drop view if exists "public"."inventory_stock_by_location";

drop index if exists "public"."product_categories_slug_key";

drop table "public"."_backup_inventory_movements_initial_count";


  create table "public"."announcements" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "body" text not null,
    "tag" text not null default 'INFO'::text,
    "published_at" timestamp with time zone not null default now(),
    "is_active" boolean not null default true,
    "display_order" integer not null default 0,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."announcements" enable row level security;


  create table "public"."app_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "app_id" uuid not null,
    "code" text not null,
    "name" text not null,
    "description" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."app_permissions" enable row level security;


  create table "public"."apps" (
    "id" uuid not null default gen_random_uuid(),
    "code" text not null,
    "name" text not null,
    "description" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."apps" enable row level security;


  create table "public"."area_kinds" (
    "code" text not null,
    "name" text not null,
    "description" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."area_kinds" enable row level security;


  create table "public"."attendance_breaks" (
    "id" uuid not null default gen_random_uuid(),
    "employee_id" uuid not null,
    "site_id" uuid not null,
    "started_at" timestamp with time zone not null default now(),
    "ended_at" timestamp with time zone,
    "start_source" text not null default 'mobile'::text,
    "end_source" text,
    "start_notes" text,
    "end_notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."attendance_breaks" enable row level security;


  create table "public"."attendance_shift_events" (
    "id" uuid not null default gen_random_uuid(),
    "employee_id" uuid not null,
    "site_id" uuid not null,
    "shift_start_at" timestamp with time zone not null,
    "event_type" text not null,
    "occurred_at" timestamp with time zone not null default now(),
    "distance_meters" integer,
    "accuracy_meters" integer,
    "source" text not null default 'mobile'::text,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."attendance_shift_events" enable row level security;


  create table "public"."document_types" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "scope" public.document_scope not null default 'employee'::public.document_scope,
    "requires_expiry" boolean not null default false,
    "validity_months" integer,
    "reminder_days" integer not null default 7,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "display_order" integer not null default 999
      );


alter table "public"."document_types" enable row level security;


  create table "public"."documents" (
    "id" uuid not null default gen_random_uuid(),
    "scope" public.document_scope not null,
    "owner_employee_id" uuid not null,
    "target_employee_id" uuid,
    "site_id" uuid,
    "title" text not null,
    "description" text,
    "status" public.document_status not null default 'pending_review'::public.document_status,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "rejected_reason" text,
    "storage_path" text not null,
    "file_name" text not null,
    "file_size_bytes" integer,
    "file_mime" text default 'application/pdf'::text,
    "expiry_date" date,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "document_type_id" uuid,
    "issue_date" date
      );


alter table "public"."documents" enable row level security;


  create table "public"."employee_devices" (
    "id" uuid not null default gen_random_uuid(),
    "employee_id" uuid not null,
    "expo_push_token" text not null,
    "platform" text,
    "device_label" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."employee_devices" enable row level security;


  create table "public"."employee_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "employee_id" uuid not null,
    "permission_id" uuid not null,
    "is_allowed" boolean not null default true,
    "scope_type" public.permission_scope_type not null default 'site'::public.permission_scope_type,
    "scope_site_id" uuid,
    "scope_area_id" uuid,
    "scope_site_type" public.site_type,
    "scope_area_kind" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."employee_permissions" enable row level security;


  create table "public"."employee_push_tokens" (
    "id" uuid not null default gen_random_uuid(),
    "employee_id" uuid not null,
    "token" text not null,
    "platform" text,
    "device_id" text,
    "is_active" boolean not null default true,
    "last_seen" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."employee_push_tokens" enable row level security;


  create table "public"."inventory_cost_policies" (
    "site_id" uuid not null,
    "cost_basis" text not null default 'net'::text,
    "is_active" boolean not null default true,
    "updated_by" uuid,
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."inventory_count_lines" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "product_id" uuid not null,
    "quantity_counted" numeric not null default 0,
    "current_qty_at_close" numeric,
    "quantity_delta" numeric,
    "adjustment_applied_at" timestamp with time zone
      );



  create table "public"."inventory_count_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "site_id" uuid not null,
    "status" text not null default 'open'::text,
    "scope_type" text not null default 'site'::text,
    "scope_zone" text,
    "scope_location_id" uuid,
    "name" text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "closed_at" timestamp with time zone,
    "closed_by" uuid
      );



  create table "public"."inventory_entries" (
    "id" uuid not null default gen_random_uuid(),
    "site_id" uuid not null,
    "supplier_name" text not null,
    "invoice_number" text,
    "received_at" timestamp with time zone default now(),
    "status" text not null default 'pending'::text,
    "notes" text,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "supplier_id" uuid,
    "purchase_order_id" uuid,
    "source_app" text not null default 'origo'::text,
    "entry_mode" text not null default 'normal'::text,
    "emergency_reason" text
      );


alter table "public"."inventory_entries" enable row level security;


  create table "public"."inventory_entry_items" (
    "id" uuid not null default gen_random_uuid(),
    "entry_id" uuid not null,
    "product_id" uuid not null,
    "quantity_declared" numeric not null,
    "quantity_received" numeric not null,
    "unit" text,
    "notes" text,
    "discrepancy" numeric generated always as ((quantity_received - quantity_declared)) stored,
    "created_at" timestamp with time zone not null default now(),
    "location_id" uuid,
    "input_qty" numeric,
    "input_unit_code" text,
    "conversion_factor_to_stock" numeric,
    "stock_unit_code" text,
    "input_unit_cost" numeric,
    "stock_unit_cost" numeric,
    "line_total_cost" numeric,
    "cost_source" text,
    "currency" text default 'COP'::text,
    "purchase_order_item_id" uuid
      );


alter table "public"."inventory_entry_items" enable row level security;


  create table "public"."inventory_stock_by_location" (
    "location_id" uuid not null,
    "product_id" uuid not null,
    "current_qty" numeric not null default 0,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."inventory_stock_by_location" enable row level security;


  create table "public"."inventory_transfer_items" (
    "id" uuid not null default gen_random_uuid(),
    "transfer_id" uuid not null,
    "product_id" uuid not null,
    "quantity" numeric not null,
    "unit" text,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "input_qty" numeric,
    "input_unit_code" text,
    "conversion_factor_to_stock" numeric,
    "stock_unit_code" text
      );


alter table "public"."inventory_transfer_items" enable row level security;


  create table "public"."inventory_transfers" (
    "id" uuid not null default gen_random_uuid(),
    "site_id" uuid not null,
    "from_loc_id" uuid not null,
    "to_loc_id" uuid not null,
    "status" text not null default 'completed'::text,
    "notes" text,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."inventory_transfers" enable row level security;


  create table "public"."inventory_unit_aliases" (
    "alias" text not null,
    "unit_code" text not null,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."inventory_units" (
    "code" text not null,
    "name" text not null,
    "family" text not null,
    "factor_to_base" numeric not null,
    "symbol" text,
    "display_decimals" integer not null default 2,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."loyalty_external_sales" (
    "id" uuid not null default gen_random_uuid(),
    "site_id" uuid not null,
    "user_id" uuid not null,
    "amount_cop" numeric not null,
    "points_awarded" integer not null,
    "external_ref" text not null,
    "source_app" text not null default 'pulso'::text,
    "awarded_by" uuid not null,
    "loyalty_transaction_id" uuid,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."loyalty_external_sales" enable row level security;


  create table "public"."product_cost_events" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "site_id" uuid,
    "source" text not null,
    "source_entry_id" uuid,
    "source_adjust_movement_id" uuid,
    "qty_before" numeric not null default 0,
    "qty_in" numeric not null default 0,
    "cost_before" numeric not null default 0,
    "cost_in" numeric not null default 0,
    "cost_after" numeric not null default 0,
    "basis" text not null default 'net'::text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid
      );



  create table "public"."product_site_settings" (
    "id" uuid not null default gen_random_uuid(),
    "site_id" uuid not null,
    "product_id" uuid not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "default_area_kind" text,
    "audience" text not null default 'BOTH'::text,
    "min_stock_qty" numeric,
    "min_stock_input_mode" text,
    "min_stock_purchase_qty" numeric,
    "min_stock_purchase_unit_code" text,
    "min_stock_purchase_to_base_factor" numeric
      );


alter table "public"."product_site_settings" enable row level security;


  create table "public"."product_uom_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "label" text not null,
    "input_unit_code" text not null,
    "qty_in_input_unit" numeric not null,
    "qty_in_stock_unit" numeric not null,
    "is_default" boolean not null default false,
    "is_active" boolean not null default true,
    "source" text not null default 'manual'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "usage_context" text not null default 'general'::text
      );



  create table "public"."production_batch_consumptions" (
    "id" uuid not null default gen_random_uuid(),
    "batch_id" uuid not null,
    "ingredient_product_id" uuid not null,
    "location_id" uuid not null,
    "required_qty" numeric not null default 0,
    "consumed_qty" numeric not null default 0,
    "stock_unit_code" text not null,
    "movement_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid
      );



  create table "public"."role_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "role" text not null,
    "permission_id" uuid not null,
    "scope_type" public.permission_scope_type not null default 'site'::public.permission_scope_type,
    "scope_site_type" public.site_type,
    "scope_area_kind" text,
    "is_allowed" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."role_permissions" enable row level security;


  create table "public"."role_site_type_rules" (
    "role" text not null,
    "site_type" public.site_type not null,
    "is_allowed" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."role_site_type_rules" enable row level security;


  create table "public"."roles" (
    "code" text not null,
    "name" text not null,
    "description" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."roles" enable row level security;


  create table "public"."site_production_pick_order" (
    "site_id" uuid not null,
    "location_id" uuid not null,
    "priority" integer not null default 100,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );



  create table "public"."site_supply_routes" (
    "id" uuid not null default gen_random_uuid(),
    "requesting_site_id" uuid not null,
    "fulfillment_site_id" uuid not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."site_supply_routes" enable row level security;


  create table "public"."support_messages" (
    "id" uuid not null default gen_random_uuid(),
    "ticket_id" uuid not null,
    "author_id" uuid not null,
    "body" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."support_messages" enable row level security;


  create table "public"."support_tickets" (
    "id" uuid not null default gen_random_uuid(),
    "created_by" uuid not null,
    "site_id" uuid,
    "category" text not null default 'attendance'::text,
    "title" text not null,
    "description" text,
    "status" public.support_ticket_status not null default 'open'::public.support_ticket_status,
    "assigned_to" uuid,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."support_tickets" enable row level security;


  create table "public"."wallet_devices" (
    "id" uuid not null default gen_random_uuid(),
    "device_library_identifier" text not null,
    "pass_type_identifier" text not null,
    "serial_number" text not null,
    "push_token" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );



  create table "public"."wallet_passes" (
    "serial_number" text not null,
    "user_id" uuid not null,
    "pass_type_identifier" text not null,
    "auth_token" text not null,
    "data_hash" text,
    "updated_at" timestamp with time zone default now()
      );



  create table "vital"."adaptive_decision_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "decision_at" timestamp with time zone not null default now(),
    "decision_type" text not null,
    "reason" text not null,
    "inputs" jsonb not null default '{}'::jsonb,
    "outputs" jsonb not null default '{}'::jsonb,
    "safety_checked" boolean not null default false,
    "confidence" numeric(5,4),
    "created_by" text not null default 'system'::text
      );


alter table "vital"."adaptive_decision_logs" enable row level security;


  create table "vital"."admin_users" (
    "user_id" uuid not null,
    "role" text not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."admin_users" enable row level security;


  create table "vital"."availability_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "available_days" smallint[] not null default '{1,2,3,4,5}'::smallint[],
    "preferred_time_window" text not null default 'mixed'::text,
    "timezone" text not null default 'America/Bogota'::text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."availability_profiles" enable row level security;


  create table "vital"."badges" (
    "id" uuid not null default gen_random_uuid(),
    "code" text not null,
    "name" text not null,
    "description" text,
    "rarity" text not null default 'common'::text,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."badges" enable row level security;


  create table "vital"."body_metrics" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "measured_at" timestamp with time zone not null default now(),
    "weight_kg" numeric(6,2),
    "waist_cm" numeric(6,2),
    "body_fat_pct" numeric(5,2),
    "sleep_hours" numeric(4,2),
    "energy_score" smallint,
    "notes" text,
    "source" text not null default 'manual'::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."body_metrics" enable row level security;


  create table "vital"."challenge_progress" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "challenge_id" uuid not null,
    "progress_value" numeric(12,2) not null default 0,
    "target_value" numeric(12,2),
    "status" text not null default 'in_progress'::text,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."challenge_progress" enable row level security;


  create table "vital"."challenges" (
    "id" uuid not null default gen_random_uuid(),
    "created_by_user_id" uuid not null,
    "scope" vital.challenge_scope not null default 'personal'::vital.challenge_scope,
    "name" text not null,
    "description" text,
    "rules" jsonb not null default '{}'::jsonb,
    "starts_at" timestamp with time zone not null,
    "ends_at" timestamp with time zone not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."challenges" enable row level security;


  create table "vital"."consent_records" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "consent_type" text not null,
    "version" text not null,
    "accepted_at" timestamp with time zone not null default now(),
    "revoked_at" timestamp with time zone,
    "metadata" jsonb not null default '{}'::jsonb
      );


alter table "vital"."consent_records" enable row level security;


  create table "vital"."daily_readiness_inputs" (
    "user_id" uuid not null,
    "input_date" date not null,
    "sleep_score" smallint not null default 60,
    "stress_score" smallint not null default 50,
    "energy_score" smallint not null default 60,
    "pain_map" jsonb not null default '{}'::jsonb,
    "steps" integer,
    "hrv_ms" numeric(8,2),
    "resting_hr" smallint,
    "source" text not null default 'manual'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."daily_readiness_inputs" enable row level security;


  create table "vital"."fair_play_events" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "event_time" timestamp with time zone not null default now(),
    "severity" vital.fair_play_severity not null default 'low'::vital.fair_play_severity,
    "event_type" text not null,
    "details" jsonb not null default '{}'::jsonb,
    "action_taken" text,
    "resolved_at" timestamp with time zone,
    "resolved_by_user_id" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."fair_play_events" enable row level security;


  create table "vital"."fatigue_scores" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "score_date" date not null,
    "muscle_group" text not null,
    "fatigue_index" numeric(6,2) not null,
    "confidence" numeric(5,4) not null default 0.70,
    "factors" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."fatigue_scores" enable row level security;


  create table "vital"."feature_flags" (
    "key" text not null,
    "description" text,
    "enabled_by_default" boolean not null default false,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."feature_flags" enable row level security;


  create table "vital"."game_profiles" (
    "user_id" uuid not null,
    "xp_total" bigint not null default 0,
    "level" integer not null default 1,
    "current_streak" integer not null default 0,
    "best_streak" integer not null default 0,
    "competition_mode" vital.competition_mode not null default 'private'::vital.competition_mode,
    "vital_score_weekly" numeric(10,2) not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."game_profiles" enable row level security;


  create table "vital"."goal_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "objective" text not null,
    "secondary_goals" text[] not null default '{}'::text[],
    "weekly_days" smallint not null,
    "minutes_per_session" smallint not null,
    "experience_level" text not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."goal_profiles" enable row level security;


  create table "vital"."health_profiles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "injuries_notes" text,
    "limitations_notes" text,
    "risk_flags" jsonb not null default '[]'::jsonb,
    "safety_gate_status" text not null default 'clear'::text,
    "physician_clearance_required" boolean not null default false,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."health_profiles" enable row level security;


  create table "vital"."league_memberships" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "season_id" uuid not null,
    "league_tier" vital.league_tier not null default 'bronze'::vital.league_tier,
    "bracket_code" text,
    "week_points" numeric(10,2) not null default 0,
    "promoted" boolean not null default false,
    "relegated" boolean not null default false,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."league_memberships" enable row level security;


  create table "vital"."level_states" (
    "user_id" uuid not null,
    "level" integer not null default 1,
    "xp_into_level" integer not null default 0,
    "xp_needed_for_next" integer not null default 100,
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."level_states" enable row level security;


  create table "vital"."module_catalog" (
    "key" text not null,
    "name" text not null,
    "description" text not null,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."module_catalog" enable row level security;


  create table "vital"."module_template_catalog" (
    "id" uuid not null default gen_random_uuid(),
    "module_key" text not null,
    "task_type" text not null,
    "title" text not null,
    "days_of_week" smallint[] not null default '{1,2,3,4,5,6,7}'::smallint[],
    "ordering" smallint not null default 1,
    "estimated_minutes" smallint,
    "payload" jsonb not null default '{}'::jsonb,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."module_template_catalog" enable row level security;


  create table "vital"."muscle_load_snapshots" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "snapshot_date" date not null,
    "muscle_group" text not null,
    "internal_load" numeric(12,2) not null default 0,
    "stimulus_score" numeric(12,2) not null default 0,
    "acute_load" numeric(12,2) not null default 0,
    "chronic_load" numeric(12,2) not null default 0,
    "acute_chronic_ratio" numeric(8,3),
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."muscle_load_snapshots" enable row level security;


  create table "vital"."notification_plans" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "task_type" text not null,
    "schedule" jsonb not null default '{}'::jsonb,
    "enabled" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."notification_plans" enable row level security;


  create table "vital"."program_versions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "program_id" uuid not null,
    "version_number" integer not null,
    "archetype" text not null,
    "generated_from" jsonb not null default '{}'::jsonb,
    "rules_snapshot" jsonb not null default '{}'::jsonb,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."program_versions" enable row level security;


  create table "vital"."programs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "objective" text not null,
    "status" vital.program_status not null default 'draft'::vital.program_status,
    "started_on" date,
    "ended_on" date,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."programs" enable row level security;


  create table "vital"."readiness_scores" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "score_date" date not null,
    "readiness_score" numeric(6,2) not null,
    "confidence" numeric(5,4) not null default 0.70,
    "recommendation" text,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."readiness_scores" enable row level security;


  create table "vital"."recovery_signals" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "signal_date" date not null,
    "sleep_quality" smallint,
    "energy_score" smallint,
    "soreness_score" smallint,
    "resting_hr" smallint,
    "hrv_ms" numeric(8,2),
    "source" text not null default 'manual'::text,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."recovery_signals" enable row level security;


  create table "vital"."safety_intake" (
    "user_id" uuid not null,
    "intake_payload" jsonb not null default '{}'::jsonb,
    "risk_level" text not null default 'low'::text,
    "blocked_modules" jsonb not null default '[]'::jsonb,
    "requires_professional_check" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."safety_intake" enable row level security;


  create table "vital"."seasons" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "starts_at" date not null,
    "ends_at" date not null,
    "is_active" boolean not null default false,
    "created_by_user_id" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."seasons" enable row level security;


  create table "vital"."session_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "task_instance_id" uuid,
    "started_at" timestamp with time zone not null default now(),
    "ended_at" timestamp with time zone,
    "duration_minutes" integer,
    "session_rpe" numeric(3,1),
    "avg_rir" numeric(3,1),
    "total_sets" integer,
    "total_reps" integer,
    "total_load_kg" numeric(12,2),
    "notes" text,
    "source" text not null default 'manual'::text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."session_logs" enable row level security;


  create table "vital"."squad_memberships" (
    "id" uuid not null default gen_random_uuid(),
    "squad_id" uuid not null,
    "user_id" uuid not null,
    "role" text not null default 'member'::text,
    "active" boolean not null default true,
    "joined_at" timestamp with time zone not null default now()
      );


alter table "vital"."squad_memberships" enable row level security;


  create table "vital"."squads" (
    "id" uuid not null default gen_random_uuid(),
    "owner_user_id" uuid not null,
    "name" text not null,
    "is_private" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."squads" enable row level security;


  create table "vital"."starter_program_catalog" (
    "key" text not null,
    "name" text not null,
    "objective" text not null,
    "days_per_week" smallint not null,
    "level" text not null default 'general'::text,
    "is_active" boolean not null default true,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."starter_program_catalog" enable row level security;


  create table "vital"."starter_program_tasks" (
    "id" uuid not null default gen_random_uuid(),
    "starter_key" text not null,
    "day_of_week" smallint not null,
    "ordering" smallint not null default 1,
    "task_type" text not null,
    "title" text not null,
    "estimated_minutes" smallint,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."starter_program_tasks" enable row level security;


  create table "vital"."task_instances" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "task_template_id" uuid not null,
    "task_date" date not null,
    "window_start" timestamp with time zone,
    "window_end" timestamp with time zone,
    "status" vital.task_status not null default 'pending'::vital.task_status,
    "priority" smallint not null default 50,
    "snooze_until" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "completion_payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "module_key" text not null default 'training'::text
      );


alter table "vital"."task_instances" enable row level security;


  create table "vital"."task_templates" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "program_version_id" uuid not null,
    "task_type" text not null,
    "title" text not null,
    "recurrence_rule" jsonb not null default '{}'::jsonb,
    "ordering" smallint not null default 0,
    "estimated_minutes" smallint,
    "payload" jsonb not null default '{}'::jsonb,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "module_key" text not null default 'training'::text
      );


alter table "vital"."task_templates" enable row level security;


  create table "vital"."telemetry_events" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "event_name" text not null,
    "event_version" text not null default 'v1'::text,
    "source" text not null default 'app'::text,
    "occurred_at" timestamp with time zone not null default now(),
    "received_at" timestamp with time zone not null default now(),
    "payload" jsonb not null default '{}'::jsonb
      );


alter table "vital"."telemetry_events" enable row level security;


  create table "vital"."user_badges" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "badge_id" uuid not null,
    "awarded_at" timestamp with time zone not null default now(),
    "context" jsonb not null default '{}'::jsonb
      );


alter table "vital"."user_badges" enable row level security;


  create table "vital"."user_feature_flags" (
    "user_id" uuid not null,
    "flag_key" text not null,
    "enabled" boolean not null,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."user_feature_flags" enable row level security;


  create table "vital"."user_module_preferences" (
    "user_id" uuid not null,
    "module_key" text not null,
    "is_enabled" boolean not null default false,
    "config" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."user_module_preferences" enable row level security;


  create table "vital"."user_profiles" (
    "user_id" uuid not null,
    "employee_id" uuid,
    "profile_context" vital.profile_context not null default 'personal'::vital.profile_context,
    "display_name" text,
    "timezone" text not null default 'America/Bogota'::text,
    "competition_mode" vital.competition_mode not null default 'private'::vital.competition_mode,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "vital"."user_profiles" enable row level security;


  create table "vital"."weekly_leaderboard_snapshots" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "season_id" uuid not null,
    "week_start" date not null,
    "vital_score" numeric(10,2) not null,
    "rank_position" integer,
    "fair_play_multiplier" numeric(4,2) not null default 1.00,
    "payload" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."weekly_leaderboard_snapshots" enable row level security;


  create table "vital"."weekly_reviews" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "week_start" date not null,
    "adherence_pct" numeric(5,2),
    "perceived_fatigue" smallint,
    "summary" jsonb not null default '{}'::jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "vital"."weekly_reviews" enable row level security;


  create table "vital"."xp_events" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "occurred_at" timestamp with time zone not null default now(),
    "event_type" text not null,
    "base_xp" integer not null,
    "consistency_multiplier" numeric(4,2) not null default 1.00,
    "safety_multiplier" numeric(4,2) not null default 1.00,
    "fair_play_multiplier" numeric(4,2) not null default 1.00,
    "final_xp" integer not null,
    "metadata" jsonb not null default '{}'::jsonb
      );


alter table "vital"."xp_events" enable row level security;

alter table "public"."inventory_locations" add column "parent_location_id" uuid;

alter table "public"."inventory_movements" add column "conversion_factor_to_stock" numeric;

alter table "public"."inventory_movements" add column "created_by" uuid default auth.uid();

alter table "public"."inventory_movements" add column "input_qty" numeric;

alter table "public"."inventory_movements" add column "input_unit_code" text;

alter table "public"."inventory_movements" add column "line_total_cost" numeric;

alter table "public"."inventory_movements" add column "stock_unit_code" text;

alter table "public"."inventory_movements" add column "stock_unit_cost" numeric;

alter table "public"."loyalty_redemptions" add column "site_id" uuid;

alter table "public"."product_categories" add column "applies_to_kinds" text[] not null default ARRAY['insumo'::text, 'preparacion'::text, 'venta'::text, 'equipo'::text];

alter table "public"."product_inventory_profiles" add column "costing_mode" text not null default 'auto_primary_supplier'::text;

alter table "public"."product_inventory_profiles" add column "unit_family" text;

alter table "public"."product_suppliers" add column "purchase_pack_qty" numeric;

alter table "public"."product_suppliers" add column "purchase_pack_unit_code" text;

alter table "public"."production_batches" add column "batch_code" text;

alter table "public"."production_batches" add column "destination_location_id" uuid;

alter table "public"."production_batches" add column "expires_at" timestamp with time zone;

alter table "public"."production_batches" add column "recipe_consumed" boolean not null default false;

alter table "public"."production_request_items" add column "production_area_kind" text default 'general'::text;

alter table "public"."products" add column "catalog_image_url" text;

alter table "public"."products" add column "image_url" text;

alter table "public"."products" add column "production_area_kind" text default 'general'::text;

alter table "public"."products" add column "stock_unit_code" text;

alter table "public"."recipe_steps" add column "step_image_url" text;

alter table "public"."recipe_steps" add column "step_video_url" text;

alter table "public"."restock_request_items" add column "conversion_factor_to_stock" numeric;

alter table "public"."restock_request_items" add column "input_qty" numeric;

alter table "public"."restock_request_items" add column "input_unit_code" text;

alter table "public"."restock_request_items" add column "item_status" text not null default 'pending'::text;

alter table "public"."restock_request_items" add column "notes" text;

alter table "public"."restock_request_items" add column "prepared_quantity" numeric not null default 0;

alter table "public"."restock_request_items" add column "production_area_kind" text default 'general'::text;

alter table "public"."restock_request_items" add column "received_quantity" numeric not null default 0;

alter table "public"."restock_request_items" add column "shipped_quantity" numeric not null default 0;

alter table "public"."restock_request_items" add column "shortage_quantity" numeric not null default 0;

alter table "public"."restock_request_items" add column "source_location_id" uuid;

alter table "public"."restock_request_items" add column "stock_unit_code" text;

alter table "public"."restock_requests" add column "cancelled_at" timestamp with time zone;

alter table "public"."restock_requests" add column "closed_at" timestamp with time zone;

alter table "public"."restock_requests" add column "in_transit_at" timestamp with time zone;

alter table "public"."restock_requests" add column "in_transit_by" uuid;

alter table "public"."restock_requests" add column "prepared_at" timestamp with time zone;

alter table "public"."restock_requests" add column "prepared_by" uuid;

alter table "public"."restock_requests" add column "priority" text default 'normal'::text;

alter table "public"."restock_requests" add column "received_at" timestamp with time zone;

alter table "public"."restock_requests" add column "received_by" uuid;

alter table "public"."restock_requests" add column "request_code" text;

alter table "public"."restock_requests" add column "request_type" text default 'internal'::text;

alter table "public"."restock_requests" add column "requested_by_site_id" uuid;

alter table "public"."restock_requests" add column "status_updated_at" timestamp with time zone default now();

CREATE INDEX announcements_active_order_idx ON public.announcements USING btree (is_active, display_order, published_at DESC);

CREATE UNIQUE INDEX announcements_pkey ON public.announcements USING btree (id);

CREATE UNIQUE INDEX app_permissions_app_id_code_key ON public.app_permissions USING btree (app_id, code);

CREATE UNIQUE INDEX app_permissions_pkey ON public.app_permissions USING btree (id);

CREATE UNIQUE INDEX apps_code_key ON public.apps USING btree (code);

CREATE UNIQUE INDEX apps_pkey ON public.apps USING btree (id);

CREATE UNIQUE INDEX area_kinds_pkey ON public.area_kinds USING btree (code);

CREATE INDEX attendance_breaks_employee_started_idx ON public.attendance_breaks USING btree (employee_id, started_at DESC);

CREATE UNIQUE INDEX attendance_breaks_one_open_per_employee_idx ON public.attendance_breaks USING btree (employee_id) WHERE (ended_at IS NULL);

CREATE UNIQUE INDEX attendance_breaks_pkey ON public.attendance_breaks USING btree (id);

CREATE INDEX attendance_breaks_site_started_idx ON public.attendance_breaks USING btree (site_id, started_at DESC);

CREATE INDEX attendance_shift_events_employee_shift_idx ON public.attendance_shift_events USING btree (employee_id, shift_start_at DESC);

CREATE UNIQUE INDEX attendance_shift_events_pkey ON public.attendance_shift_events USING btree (id);

CREATE INDEX attendance_shift_events_site_occurred_idx ON public.attendance_shift_events USING btree (site_id, occurred_at DESC);

CREATE UNIQUE INDEX attendance_shift_events_unique_shift_event_idx ON public.attendance_shift_events USING btree (employee_id, shift_start_at, event_type);

CREATE INDEX document_types_display_order_idx ON public.document_types USING btree (display_order, name);

CREATE UNIQUE INDEX document_types_name_scope_idx ON public.document_types USING btree (name, scope);

CREATE UNIQUE INDEX document_types_pkey ON public.document_types USING btree (id);

CREATE INDEX documents_expiry_idx ON public.documents USING btree (expiry_date);

CREATE INDEX documents_owner_idx ON public.documents USING btree (owner_employee_id);

CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id);

CREATE INDEX documents_site_idx ON public.documents USING btree (site_id);

CREATE INDEX documents_status_idx ON public.documents USING btree (status);

CREATE INDEX documents_target_idx ON public.documents USING btree (target_employee_id);

CREATE UNIQUE INDEX employee_devices_pkey ON public.employee_devices USING btree (id);

CREATE UNIQUE INDEX employee_devices_unique_token ON public.employee_devices USING btree (expo_push_token);

CREATE UNIQUE INDEX employee_permissions_employee_id_permission_id_scope_type_s_key ON public.employee_permissions USING btree (employee_id, permission_id, scope_type, scope_site_id, scope_area_id, scope_site_type, scope_area_kind);

CREATE UNIQUE INDEX employee_permissions_pkey ON public.employee_permissions USING btree (id);

CREATE INDEX employee_push_tokens_employee_idx ON public.employee_push_tokens USING btree (employee_id);

CREATE UNIQUE INDEX employee_push_tokens_pkey ON public.employee_push_tokens USING btree (id);

CREATE UNIQUE INDEX employee_push_tokens_token_idx ON public.employee_push_tokens USING btree (token);

CREATE INDEX idx_count_lines_session ON public.inventory_count_lines USING btree (session_id);

CREATE INDEX idx_count_sessions_created_at ON public.inventory_count_sessions USING btree (created_at DESC);

CREATE INDEX idx_count_sessions_site_status ON public.inventory_count_sessions USING btree (site_id, status);

CREATE INDEX idx_inventory_entries_purchase_order_id ON public.inventory_entries USING btree (purchase_order_id);

CREATE INDEX idx_inventory_entries_site ON public.inventory_entries USING btree (site_id);

CREATE INDEX idx_inventory_entries_source_mode ON public.inventory_entries USING btree (source_app, entry_mode, created_at DESC);

CREATE INDEX idx_inventory_entries_status ON public.inventory_entries USING btree (status);

CREATE INDEX idx_inventory_entries_supplier ON public.inventory_entries USING btree (supplier_id);

CREATE INDEX idx_inventory_entry_items_entry ON public.inventory_entry_items USING btree (entry_id);

CREATE INDEX idx_inventory_entry_items_location ON public.inventory_entry_items USING btree (location_id);

CREATE INDEX idx_inventory_entry_items_product ON public.inventory_entry_items USING btree (product_id);

CREATE INDEX idx_inventory_entry_items_stock_unit_code ON public.inventory_entry_items USING btree (stock_unit_code);

CREATE INDEX idx_inventory_movements_stock_unit_code ON public.inventory_movements USING btree (stock_unit_code);

CREATE INDEX idx_inventory_stock_by_location_location ON public.inventory_stock_by_location USING btree (location_id);

CREATE INDEX idx_inventory_stock_by_location_product ON public.inventory_stock_by_location USING btree (product_id);

CREATE INDEX idx_inventory_transfer_items_product ON public.inventory_transfer_items USING btree (product_id);

CREATE INDEX idx_inventory_transfer_items_stock_unit_code ON public.inventory_transfer_items USING btree (stock_unit_code);

CREATE INDEX idx_inventory_transfer_items_transfer ON public.inventory_transfer_items USING btree (transfer_id);

CREATE INDEX idx_inventory_transfers_from ON public.inventory_transfers USING btree (from_loc_id);

CREATE INDEX idx_inventory_transfers_site ON public.inventory_transfers USING btree (site_id);

CREATE INDEX idx_inventory_transfers_to ON public.inventory_transfers USING btree (to_loc_id);

CREATE INDEX idx_inventory_units_family ON public.inventory_units USING btree (family, is_active);

CREATE INDEX idx_loyalty_external_sales_user_created ON public.loyalty_external_sales USING btree (user_id, created_at DESC);

CREATE INDEX idx_product_categories_applies_to_kinds ON public.product_categories USING gin (applies_to_kinds);

CREATE INDEX idx_product_categories_domain ON public.product_categories USING btree (COALESCE(NULLIF(TRIM(BOTH FROM domain), ''::text), '*'::text));

CREATE INDEX idx_product_categories_scope_parent ON public.product_categories USING btree (site_id, parent_id);

CREATE INDEX idx_product_cost_events_product_created ON public.product_cost_events USING btree (product_id, created_at DESC);

CREATE INDEX idx_product_inventory_profiles_unit_family ON public.product_inventory_profiles USING btree (unit_family, costing_mode);

CREATE INDEX idx_product_site_settings_site_active_audience ON public.product_site_settings USING btree (site_id, is_active, audience);

CREATE INDEX idx_product_site_settings_site_active_min ON public.product_site_settings USING btree (site_id, is_active, min_stock_qty);

CREATE INDEX idx_product_suppliers_pack_unit ON public.product_suppliers USING btree (product_id, purchase_pack_unit_code);

CREATE INDEX idx_product_uom_profiles_product ON public.product_uom_profiles USING btree (product_id);

CREATE INDEX idx_product_uom_profiles_product_active ON public.product_uom_profiles USING btree (product_id, is_active, is_default);

CREATE INDEX idx_product_uom_profiles_product_context ON public.product_uom_profiles USING btree (product_id, usage_context, is_active, is_default);

CREATE INDEX idx_production_batch_consumptions_batch ON public.production_batch_consumptions USING btree (batch_id);

CREATE INDEX idx_production_batch_consumptions_ingredient ON public.production_batch_consumptions USING btree (ingredient_product_id, created_at DESC);

CREATE INDEX idx_production_batch_consumptions_location ON public.production_batch_consumptions USING btree (location_id);

CREATE INDEX idx_products_stock_unit_code ON public.products USING btree (stock_unit_code);

CREATE INDEX idx_restock_request_items_source_location ON public.restock_request_items USING btree (source_location_id);

CREATE INDEX idx_restock_request_items_stock_unit_code ON public.restock_request_items USING btree (stock_unit_code);

CREATE INDEX idx_site_production_pick_order_active ON public.site_production_pick_order USING btree (site_id, is_active, priority);

CREATE UNIQUE INDEX inventory_cost_policies_pkey ON public.inventory_cost_policies USING btree (site_id);

CREATE UNIQUE INDEX inventory_count_lines_pkey ON public.inventory_count_lines USING btree (id);

CREATE UNIQUE INDEX inventory_count_lines_session_id_product_id_key ON public.inventory_count_lines USING btree (session_id, product_id);

CREATE UNIQUE INDEX inventory_count_sessions_pkey ON public.inventory_count_sessions USING btree (id);

CREATE UNIQUE INDEX inventory_entries_pkey ON public.inventory_entries USING btree (id);

CREATE UNIQUE INDEX inventory_entry_items_pkey ON public.inventory_entry_items USING btree (id);

CREATE INDEX inventory_locations_parent_id_idx ON public.inventory_locations USING btree (parent_location_id);

CREATE UNIQUE INDEX inventory_locations_site_code_uniq ON public.inventory_locations USING btree (site_id, code);

CREATE UNIQUE INDEX inventory_stock_by_location_pkey ON public.inventory_stock_by_location USING btree (location_id, product_id);

CREATE UNIQUE INDEX inventory_transfer_items_pkey ON public.inventory_transfer_items USING btree (id);

CREATE UNIQUE INDEX inventory_transfers_pkey ON public.inventory_transfers USING btree (id);

CREATE UNIQUE INDEX inventory_unit_aliases_pkey ON public.inventory_unit_aliases USING btree (alias);

CREATE UNIQUE INDEX inventory_units_pkey ON public.inventory_units USING btree (code);

CREATE UNIQUE INDEX loyalty_external_sales_pkey ON public.loyalty_external_sales USING btree (id);

CREATE INDEX loyalty_redemptions_site_idx ON public.loyalty_redemptions USING btree (site_id);

CREATE UNIQUE INDEX product_cost_events_pkey ON public.product_cost_events USING btree (id);

CREATE UNIQUE INDEX product_site_settings_pkey ON public.product_site_settings USING btree (id);

CREATE INDEX product_site_settings_product_id_idx ON public.product_site_settings USING btree (product_id);

CREATE INDEX product_site_settings_site_id_idx ON public.product_site_settings USING btree (site_id);

CREATE UNIQUE INDEX product_site_settings_site_product_uniq ON public.product_site_settings USING btree (site_id, product_id);

CREATE UNIQUE INDEX product_uom_profiles_pkey ON public.product_uom_profiles USING btree (id);

CREATE UNIQUE INDEX production_batch_consumptions_pkey ON public.production_batch_consumptions USING btree (id);

CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (id);

CREATE UNIQUE INDEX role_permissions_role_permission_id_scope_type_scope_site_t_key ON public.role_permissions USING btree (role, permission_id, scope_type, scope_site_type, scope_area_kind);

CREATE UNIQUE INDEX role_site_type_rules_pkey ON public.role_site_type_rules USING btree (role, site_type);

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (code);

CREATE UNIQUE INDEX site_production_pick_order_pkey ON public.site_production_pick_order USING btree (site_id, location_id);

CREATE UNIQUE INDEX site_supply_routes_pkey ON public.site_supply_routes USING btree (id);

CREATE UNIQUE INDEX site_supply_routes_requesting_site_id_fulfillment_site_id_key ON public.site_supply_routes USING btree (requesting_site_id, fulfillment_site_id);

CREATE UNIQUE INDEX support_messages_pkey ON public.support_messages USING btree (id);

CREATE INDEX support_tickets_assigned_idx ON public.support_tickets USING btree (assigned_to);

CREATE UNIQUE INDEX support_tickets_pkey ON public.support_tickets USING btree (id);

CREATE INDEX support_tickets_site_idx ON public.support_tickets USING btree (site_id);

CREATE INDEX support_tickets_status_idx ON public.support_tickets USING btree (status);

CREATE UNIQUE INDEX uq_loyalty_external_sales_site_ref ON public.loyalty_external_sales USING btree (site_id, lower(btrim(external_ref)));

CREATE UNIQUE INDEX ux_product_categories_scope_parent_name ON public.product_categories USING btree (COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(NULLIF(TRIM(BOTH FROM domain), ''::text), '*'::text), lower(TRIM(BOTH FROM name)));

CREATE UNIQUE INDEX ux_product_categories_scope_parent_slug ON public.product_categories USING btree (COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(NULLIF(TRIM(BOTH FROM domain), ''::text), '*'::text), lower(TRIM(BOTH FROM slug))) WHERE ((slug IS NOT NULL) AND (TRIM(BOTH FROM slug) <> ''::text));

CREATE UNIQUE INDEX ux_product_site_settings_product_site ON public.product_site_settings USING btree (product_id, site_id);

CREATE UNIQUE INDEX ux_product_uom_profiles_default_per_product_context ON public.product_uom_profiles USING btree (product_id, usage_context) WHERE ((is_default = true) AND (is_active = true));

CREATE UNIQUE INDEX ux_production_batch_consumptions_batch_ingredient_location ON public.production_batch_consumptions USING btree (batch_id, ingredient_product_id, location_id);

CREATE UNIQUE INDEX ux_products_sku_unique_global ON public.products USING btree (lower(TRIM(BOTH FROM sku))) WHERE ((sku IS NOT NULL) AND (TRIM(BOTH FROM sku) <> ''::text));

CREATE UNIQUE INDEX wallet_devices_device_library_identifier_pass_type_identifi_key ON public.wallet_devices USING btree (device_library_identifier, pass_type_identifier, serial_number);

CREATE UNIQUE INDEX wallet_devices_pkey ON public.wallet_devices USING btree (id);

CREATE UNIQUE INDEX wallet_passes_pkey ON public.wallet_passes USING btree (serial_number);

CREATE UNIQUE INDEX adaptive_decision_logs_pkey ON vital.adaptive_decision_logs USING btree (id);

CREATE INDEX adaptive_decision_logs_user_idx ON vital.adaptive_decision_logs USING btree (user_id, decision_at DESC);

CREATE UNIQUE INDEX admin_users_pkey ON vital.admin_users USING btree (user_id);

CREATE UNIQUE INDEX availability_profiles_pkey ON vital.availability_profiles USING btree (id);

CREATE UNIQUE INDEX availability_profiles_user_active_uidx ON vital.availability_profiles USING btree (user_id) WHERE is_active;

CREATE UNIQUE INDEX badges_code_key ON vital.badges USING btree (code);

CREATE UNIQUE INDEX badges_pkey ON vital.badges USING btree (id);

CREATE UNIQUE INDEX body_metrics_pkey ON vital.body_metrics USING btree (id);

CREATE INDEX body_metrics_user_measured_idx ON vital.body_metrics USING btree (user_id, measured_at DESC);

CREATE UNIQUE INDEX challenge_progress_pkey ON vital.challenge_progress USING btree (id);

CREATE UNIQUE INDEX challenge_progress_user_challenge_uidx ON vital.challenge_progress USING btree (user_id, challenge_id);

CREATE UNIQUE INDEX challenges_pkey ON vital.challenges USING btree (id);

CREATE UNIQUE INDEX consent_records_pkey ON vital.consent_records USING btree (id);

CREATE UNIQUE INDEX daily_readiness_inputs_pkey ON vital.daily_readiness_inputs USING btree (user_id, input_date);

CREATE UNIQUE INDEX fair_play_events_pkey ON vital.fair_play_events USING btree (id);

CREATE INDEX fair_play_events_user_time_idx ON vital.fair_play_events USING btree (user_id, event_time DESC);

CREATE UNIQUE INDEX fatigue_scores_pkey ON vital.fatigue_scores USING btree (id);

CREATE UNIQUE INDEX fatigue_scores_unique_idx ON vital.fatigue_scores USING btree (user_id, score_date, muscle_group);

CREATE UNIQUE INDEX feature_flags_pkey ON vital.feature_flags USING btree (key);

CREATE UNIQUE INDEX game_profiles_pkey ON vital.game_profiles USING btree (user_id);

CREATE UNIQUE INDEX goal_profiles_pkey ON vital.goal_profiles USING btree (id);

CREATE UNIQUE INDEX goal_profiles_user_active_uidx ON vital.goal_profiles USING btree (user_id) WHERE is_active;

CREATE UNIQUE INDEX health_profiles_pkey ON vital.health_profiles USING btree (id);

CREATE UNIQUE INDEX health_profiles_user_active_uidx ON vital.health_profiles USING btree (user_id) WHERE is_active;

CREATE UNIQUE INDEX league_memberships_pkey ON vital.league_memberships USING btree (id);

CREATE UNIQUE INDEX league_memberships_user_season_uidx ON vital.league_memberships USING btree (user_id, season_id);

CREATE UNIQUE INDEX level_states_pkey ON vital.level_states USING btree (user_id);

CREATE UNIQUE INDEX module_catalog_pkey ON vital.module_catalog USING btree (key);

CREATE UNIQUE INDEX module_template_catalog_pkey ON vital.module_template_catalog USING btree (id);

CREATE UNIQUE INDEX module_template_catalog_unique_idx ON vital.module_template_catalog USING btree (module_key, title);

CREATE UNIQUE INDEX muscle_load_snapshots_pkey ON vital.muscle_load_snapshots USING btree (id);

CREATE UNIQUE INDEX muscle_load_snapshots_unique_idx ON vital.muscle_load_snapshots USING btree (user_id, snapshot_date, muscle_group);

CREATE UNIQUE INDEX notification_plans_pkey ON vital.notification_plans USING btree (id);

CREATE UNIQUE INDEX notification_plans_user_task_type_uidx ON vital.notification_plans USING btree (user_id, task_type);

CREATE UNIQUE INDEX program_versions_id_user_uidx ON vital.program_versions USING btree (id, user_id);

CREATE UNIQUE INDEX program_versions_pkey ON vital.program_versions USING btree (id);

CREATE UNIQUE INDEX program_versions_program_active_uidx ON vital.program_versions USING btree (program_id) WHERE is_active;

CREATE UNIQUE INDEX program_versions_program_version_uidx ON vital.program_versions USING btree (program_id, version_number);

CREATE INDEX program_versions_user_id_idx ON vital.program_versions USING btree (user_id);

CREATE UNIQUE INDEX programs_id_user_uidx ON vital.programs USING btree (id, user_id);

CREATE UNIQUE INDEX programs_pkey ON vital.programs USING btree (id);

CREATE INDEX programs_user_id_idx ON vital.programs USING btree (user_id);

CREATE UNIQUE INDEX readiness_scores_pkey ON vital.readiness_scores USING btree (id);

CREATE UNIQUE INDEX readiness_scores_unique_idx ON vital.readiness_scores USING btree (user_id, score_date);

CREATE UNIQUE INDEX recovery_signals_pkey ON vital.recovery_signals USING btree (id);

CREATE UNIQUE INDEX recovery_signals_unique_idx ON vital.recovery_signals USING btree (user_id, signal_date, source);

CREATE UNIQUE INDEX safety_intake_pkey ON vital.safety_intake USING btree (user_id);

CREATE UNIQUE INDEX seasons_name_key ON vital.seasons USING btree (name);

CREATE UNIQUE INDEX seasons_pkey ON vital.seasons USING btree (id);

CREATE UNIQUE INDEX session_logs_pkey ON vital.session_logs USING btree (id);

CREATE INDEX session_logs_user_started_idx ON vital.session_logs USING btree (user_id, started_at DESC);

CREATE UNIQUE INDEX squad_memberships_pkey ON vital.squad_memberships USING btree (id);

CREATE UNIQUE INDEX squad_memberships_squad_user_uidx ON vital.squad_memberships USING btree (squad_id, user_id);

CREATE INDEX squad_memberships_user_idx ON vital.squad_memberships USING btree (user_id);

CREATE UNIQUE INDEX squads_owner_name_uidx ON vital.squads USING btree (owner_user_id, name);

CREATE UNIQUE INDEX squads_pkey ON vital.squads USING btree (id);

CREATE UNIQUE INDEX starter_program_catalog_pkey ON vital.starter_program_catalog USING btree (key);

CREATE UNIQUE INDEX starter_program_tasks_pkey ON vital.starter_program_tasks USING btree (id);

CREATE UNIQUE INDEX starter_program_tasks_unique_idx ON vital.starter_program_tasks USING btree (starter_key, day_of_week, ordering);

CREATE UNIQUE INDEX task_instances_id_user_uidx ON vital.task_instances USING btree (id, user_id);

CREATE UNIQUE INDEX task_instances_pkey ON vital.task_instances USING btree (id);

CREATE UNIQUE INDEX task_instances_template_date_uidx ON vital.task_instances USING btree (task_template_id, task_date);

CREATE INDEX task_instances_user_date_idx ON vital.task_instances USING btree (user_id, task_date DESC);

CREATE INDEX task_instances_user_module_date_idx ON vital.task_instances USING btree (user_id, module_key, task_date DESC);

CREATE UNIQUE INDEX task_templates_id_user_uidx ON vital.task_templates USING btree (id, user_id);

CREATE UNIQUE INDEX task_templates_pkey ON vital.task_templates USING btree (id);

CREATE INDEX task_templates_user_id_idx ON vital.task_templates USING btree (user_id);

CREATE INDEX task_templates_user_module_idx ON vital.task_templates USING btree (user_id, module_key, is_active);

CREATE INDEX telemetry_events_name_time_idx ON vital.telemetry_events USING btree (event_name, occurred_at DESC);

CREATE UNIQUE INDEX telemetry_events_pkey ON vital.telemetry_events USING btree (id);

CREATE INDEX telemetry_events_user_time_idx ON vital.telemetry_events USING btree (user_id, occurred_at DESC);

CREATE UNIQUE INDEX user_badges_pkey ON vital.user_badges USING btree (id);

CREATE UNIQUE INDEX user_badges_user_badge_uidx ON vital.user_badges USING btree (user_id, badge_id);

CREATE UNIQUE INDEX user_feature_flags_pkey ON vital.user_feature_flags USING btree (user_id, flag_key);

CREATE INDEX user_feature_flags_user_id_idx ON vital.user_feature_flags USING btree (user_id);

CREATE UNIQUE INDEX user_module_preferences_pkey ON vital.user_module_preferences USING btree (user_id, module_key);

CREATE UNIQUE INDEX user_profiles_employee_id_uidx ON vital.user_profiles USING btree (employee_id) WHERE (employee_id IS NOT NULL);

CREATE UNIQUE INDEX user_profiles_pkey ON vital.user_profiles USING btree (user_id);

CREATE UNIQUE INDEX weekly_leaderboard_snapshots_pkey ON vital.weekly_leaderboard_snapshots USING btree (id);

CREATE UNIQUE INDEX weekly_leaderboard_unique_idx ON vital.weekly_leaderboard_snapshots USING btree (user_id, season_id, week_start);

CREATE UNIQUE INDEX weekly_reviews_pkey ON vital.weekly_reviews USING btree (id);

CREATE UNIQUE INDEX weekly_reviews_user_week_uidx ON vital.weekly_reviews USING btree (user_id, week_start);

CREATE UNIQUE INDEX xp_events_pkey ON vital.xp_events USING btree (id);

CREATE INDEX xp_events_user_occurred_idx ON vital.xp_events USING btree (user_id, occurred_at DESC);

alter table "public"."announcements" add constraint "announcements_pkey" PRIMARY KEY using index "announcements_pkey";

alter table "public"."app_permissions" add constraint "app_permissions_pkey" PRIMARY KEY using index "app_permissions_pkey";

alter table "public"."apps" add constraint "apps_pkey" PRIMARY KEY using index "apps_pkey";

alter table "public"."area_kinds" add constraint "area_kinds_pkey" PRIMARY KEY using index "area_kinds_pkey";

alter table "public"."attendance_breaks" add constraint "attendance_breaks_pkey" PRIMARY KEY using index "attendance_breaks_pkey";

alter table "public"."attendance_shift_events" add constraint "attendance_shift_events_pkey" PRIMARY KEY using index "attendance_shift_events_pkey";

alter table "public"."document_types" add constraint "document_types_pkey" PRIMARY KEY using index "document_types_pkey";

alter table "public"."documents" add constraint "documents_pkey" PRIMARY KEY using index "documents_pkey";

alter table "public"."employee_devices" add constraint "employee_devices_pkey" PRIMARY KEY using index "employee_devices_pkey";

alter table "public"."employee_permissions" add constraint "employee_permissions_pkey" PRIMARY KEY using index "employee_permissions_pkey";

alter table "public"."employee_push_tokens" add constraint "employee_push_tokens_pkey" PRIMARY KEY using index "employee_push_tokens_pkey";

alter table "public"."inventory_cost_policies" add constraint "inventory_cost_policies_pkey" PRIMARY KEY using index "inventory_cost_policies_pkey";

alter table "public"."inventory_count_lines" add constraint "inventory_count_lines_pkey" PRIMARY KEY using index "inventory_count_lines_pkey";

alter table "public"."inventory_count_sessions" add constraint "inventory_count_sessions_pkey" PRIMARY KEY using index "inventory_count_sessions_pkey";

alter table "public"."inventory_entries" add constraint "inventory_entries_pkey" PRIMARY KEY using index "inventory_entries_pkey";

alter table "public"."inventory_entry_items" add constraint "inventory_entry_items_pkey" PRIMARY KEY using index "inventory_entry_items_pkey";

alter table "public"."inventory_stock_by_location" add constraint "inventory_stock_by_location_pkey" PRIMARY KEY using index "inventory_stock_by_location_pkey";

alter table "public"."inventory_transfer_items" add constraint "inventory_transfer_items_pkey" PRIMARY KEY using index "inventory_transfer_items_pkey";

alter table "public"."inventory_transfers" add constraint "inventory_transfers_pkey" PRIMARY KEY using index "inventory_transfers_pkey";

alter table "public"."inventory_unit_aliases" add constraint "inventory_unit_aliases_pkey" PRIMARY KEY using index "inventory_unit_aliases_pkey";

alter table "public"."inventory_units" add constraint "inventory_units_pkey" PRIMARY KEY using index "inventory_units_pkey";

alter table "public"."loyalty_external_sales" add constraint "loyalty_external_sales_pkey" PRIMARY KEY using index "loyalty_external_sales_pkey";

alter table "public"."product_cost_events" add constraint "product_cost_events_pkey" PRIMARY KEY using index "product_cost_events_pkey";

alter table "public"."product_site_settings" add constraint "product_site_settings_pkey" PRIMARY KEY using index "product_site_settings_pkey";

alter table "public"."product_uom_profiles" add constraint "product_uom_profiles_pkey" PRIMARY KEY using index "product_uom_profiles_pkey";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_pkey" PRIMARY KEY using index "production_batch_consumptions_pkey";

alter table "public"."role_permissions" add constraint "role_permissions_pkey" PRIMARY KEY using index "role_permissions_pkey";

alter table "public"."role_site_type_rules" add constraint "role_site_type_rules_pkey" PRIMARY KEY using index "role_site_type_rules_pkey";

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."site_production_pick_order" add constraint "site_production_pick_order_pkey" PRIMARY KEY using index "site_production_pick_order_pkey";

alter table "public"."site_supply_routes" add constraint "site_supply_routes_pkey" PRIMARY KEY using index "site_supply_routes_pkey";

alter table "public"."support_messages" add constraint "support_messages_pkey" PRIMARY KEY using index "support_messages_pkey";

alter table "public"."support_tickets" add constraint "support_tickets_pkey" PRIMARY KEY using index "support_tickets_pkey";

alter table "public"."wallet_devices" add constraint "wallet_devices_pkey" PRIMARY KEY using index "wallet_devices_pkey";

alter table "public"."wallet_passes" add constraint "wallet_passes_pkey" PRIMARY KEY using index "wallet_passes_pkey";

alter table "vital"."adaptive_decision_logs" add constraint "adaptive_decision_logs_pkey" PRIMARY KEY using index "adaptive_decision_logs_pkey";

alter table "vital"."admin_users" add constraint "admin_users_pkey" PRIMARY KEY using index "admin_users_pkey";

alter table "vital"."availability_profiles" add constraint "availability_profiles_pkey" PRIMARY KEY using index "availability_profiles_pkey";

alter table "vital"."badges" add constraint "badges_pkey" PRIMARY KEY using index "badges_pkey";

alter table "vital"."body_metrics" add constraint "body_metrics_pkey" PRIMARY KEY using index "body_metrics_pkey";

alter table "vital"."challenge_progress" add constraint "challenge_progress_pkey" PRIMARY KEY using index "challenge_progress_pkey";

alter table "vital"."challenges" add constraint "challenges_pkey" PRIMARY KEY using index "challenges_pkey";

alter table "vital"."consent_records" add constraint "consent_records_pkey" PRIMARY KEY using index "consent_records_pkey";

alter table "vital"."daily_readiness_inputs" add constraint "daily_readiness_inputs_pkey" PRIMARY KEY using index "daily_readiness_inputs_pkey";

alter table "vital"."fair_play_events" add constraint "fair_play_events_pkey" PRIMARY KEY using index "fair_play_events_pkey";

alter table "vital"."fatigue_scores" add constraint "fatigue_scores_pkey" PRIMARY KEY using index "fatigue_scores_pkey";

alter table "vital"."feature_flags" add constraint "feature_flags_pkey" PRIMARY KEY using index "feature_flags_pkey";

alter table "vital"."game_profiles" add constraint "game_profiles_pkey" PRIMARY KEY using index "game_profiles_pkey";

alter table "vital"."goal_profiles" add constraint "goal_profiles_pkey" PRIMARY KEY using index "goal_profiles_pkey";

alter table "vital"."health_profiles" add constraint "health_profiles_pkey" PRIMARY KEY using index "health_profiles_pkey";

alter table "vital"."league_memberships" add constraint "league_memberships_pkey" PRIMARY KEY using index "league_memberships_pkey";

alter table "vital"."level_states" add constraint "level_states_pkey" PRIMARY KEY using index "level_states_pkey";

alter table "vital"."module_catalog" add constraint "module_catalog_pkey" PRIMARY KEY using index "module_catalog_pkey";

alter table "vital"."module_template_catalog" add constraint "module_template_catalog_pkey" PRIMARY KEY using index "module_template_catalog_pkey";

alter table "vital"."muscle_load_snapshots" add constraint "muscle_load_snapshots_pkey" PRIMARY KEY using index "muscle_load_snapshots_pkey";

alter table "vital"."notification_plans" add constraint "notification_plans_pkey" PRIMARY KEY using index "notification_plans_pkey";

alter table "vital"."program_versions" add constraint "program_versions_pkey" PRIMARY KEY using index "program_versions_pkey";

alter table "vital"."programs" add constraint "programs_pkey" PRIMARY KEY using index "programs_pkey";

alter table "vital"."readiness_scores" add constraint "readiness_scores_pkey" PRIMARY KEY using index "readiness_scores_pkey";

alter table "vital"."recovery_signals" add constraint "recovery_signals_pkey" PRIMARY KEY using index "recovery_signals_pkey";

alter table "vital"."safety_intake" add constraint "safety_intake_pkey" PRIMARY KEY using index "safety_intake_pkey";

alter table "vital"."seasons" add constraint "seasons_pkey" PRIMARY KEY using index "seasons_pkey";

alter table "vital"."session_logs" add constraint "session_logs_pkey" PRIMARY KEY using index "session_logs_pkey";

alter table "vital"."squad_memberships" add constraint "squad_memberships_pkey" PRIMARY KEY using index "squad_memberships_pkey";

alter table "vital"."squads" add constraint "squads_pkey" PRIMARY KEY using index "squads_pkey";

alter table "vital"."starter_program_catalog" add constraint "starter_program_catalog_pkey" PRIMARY KEY using index "starter_program_catalog_pkey";

alter table "vital"."starter_program_tasks" add constraint "starter_program_tasks_pkey" PRIMARY KEY using index "starter_program_tasks_pkey";

alter table "vital"."task_instances" add constraint "task_instances_pkey" PRIMARY KEY using index "task_instances_pkey";

alter table "vital"."task_templates" add constraint "task_templates_pkey" PRIMARY KEY using index "task_templates_pkey";

alter table "vital"."telemetry_events" add constraint "telemetry_events_pkey" PRIMARY KEY using index "telemetry_events_pkey";

alter table "vital"."user_badges" add constraint "user_badges_pkey" PRIMARY KEY using index "user_badges_pkey";

alter table "vital"."user_feature_flags" add constraint "user_feature_flags_pkey" PRIMARY KEY using index "user_feature_flags_pkey";

alter table "vital"."user_module_preferences" add constraint "user_module_preferences_pkey" PRIMARY KEY using index "user_module_preferences_pkey";

alter table "vital"."user_profiles" add constraint "user_profiles_pkey" PRIMARY KEY using index "user_profiles_pkey";

alter table "vital"."weekly_leaderboard_snapshots" add constraint "weekly_leaderboard_snapshots_pkey" PRIMARY KEY using index "weekly_leaderboard_snapshots_pkey";

alter table "vital"."weekly_reviews" add constraint "weekly_reviews_pkey" PRIMARY KEY using index "weekly_reviews_pkey";

alter table "vital"."xp_events" add constraint "xp_events_pkey" PRIMARY KEY using index "xp_events_pkey";

alter table "public"."announcements" add constraint "announcements_body_not_empty" CHECK ((length(TRIM(BOTH FROM body)) > 0)) not valid;

alter table "public"."announcements" validate constraint "announcements_body_not_empty";

alter table "public"."announcements" add constraint "announcements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."announcements" validate constraint "announcements_created_by_fkey";

alter table "public"."announcements" add constraint "announcements_tag_valid" CHECK ((tag = ANY (ARRAY['IMPORTANTE'::text, 'INFO'::text, 'ALERTA'::text]))) not valid;

alter table "public"."announcements" validate constraint "announcements_tag_valid";

alter table "public"."announcements" add constraint "announcements_title_not_empty" CHECK ((length(TRIM(BOTH FROM title)) > 0)) not valid;

alter table "public"."announcements" validate constraint "announcements_title_not_empty";

alter table "public"."app_permissions" add constraint "app_permissions_app_id_code_key" UNIQUE using index "app_permissions_app_id_code_key";

alter table "public"."app_permissions" add constraint "app_permissions_app_id_fkey" FOREIGN KEY (app_id) REFERENCES public.apps(id) ON DELETE CASCADE not valid;

alter table "public"."app_permissions" validate constraint "app_permissions_app_id_fkey";

alter table "public"."apps" add constraint "apps_code_key" UNIQUE using index "apps_code_key";

alter table "public"."areas" add constraint "areas_kind_fkey" FOREIGN KEY (kind) REFERENCES public.area_kinds(code) not valid;

alter table "public"."areas" validate constraint "areas_kind_fkey";

alter table "public"."attendance_breaks" add constraint "attendance_breaks_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."attendance_breaks" validate constraint "attendance_breaks_employee_id_fkey";

alter table "public"."attendance_breaks" add constraint "attendance_breaks_end_source_check" CHECK (((end_source IS NULL) OR (end_source = ANY (ARRAY['mobile'::text, 'web'::text, 'kiosk'::text, 'system'::text])))) not valid;

alter table "public"."attendance_breaks" validate constraint "attendance_breaks_end_source_check";

alter table "public"."attendance_breaks" add constraint "attendance_breaks_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE RESTRICT not valid;

alter table "public"."attendance_breaks" validate constraint "attendance_breaks_site_id_fkey";

alter table "public"."attendance_breaks" add constraint "attendance_breaks_start_source_check" CHECK ((start_source = ANY (ARRAY['mobile'::text, 'web'::text, 'kiosk'::text, 'system'::text]))) not valid;

alter table "public"."attendance_breaks" validate constraint "attendance_breaks_start_source_check";

alter table "public"."attendance_breaks" add constraint "attendance_breaks_time_check" CHECK (((ended_at IS NULL) OR (ended_at >= started_at))) not valid;

alter table "public"."attendance_breaks" validate constraint "attendance_breaks_time_check";

alter table "public"."attendance_shift_events" add constraint "attendance_shift_events_accuracy_check" CHECK (((accuracy_meters IS NULL) OR (accuracy_meters >= 0))) not valid;

alter table "public"."attendance_shift_events" validate constraint "attendance_shift_events_accuracy_check";

alter table "public"."attendance_shift_events" add constraint "attendance_shift_events_distance_check" CHECK (((distance_meters IS NULL) OR (distance_meters >= 0))) not valid;

alter table "public"."attendance_shift_events" validate constraint "attendance_shift_events_distance_check";

alter table "public"."attendance_shift_events" add constraint "attendance_shift_events_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."attendance_shift_events" validate constraint "attendance_shift_events_employee_id_fkey";

alter table "public"."attendance_shift_events" add constraint "attendance_shift_events_event_type_check" CHECK ((event_type = ANY (ARRAY['left_site_open_shift'::text]))) not valid;

alter table "public"."attendance_shift_events" validate constraint "attendance_shift_events_event_type_check";

alter table "public"."attendance_shift_events" add constraint "attendance_shift_events_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE RESTRICT not valid;

alter table "public"."attendance_shift_events" validate constraint "attendance_shift_events_site_id_fkey";

alter table "public"."attendance_shift_events" add constraint "attendance_shift_events_source_check" CHECK ((source = ANY (ARRAY['mobile'::text, 'web'::text, 'kiosk'::text, 'system'::text]))) not valid;

alter table "public"."attendance_shift_events" validate constraint "attendance_shift_events_source_check";

alter table "public"."documents" add constraint "documents_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES public.employees(id) ON DELETE SET NULL not valid;

alter table "public"."documents" validate constraint "documents_approved_by_fkey";

alter table "public"."documents" add constraint "documents_document_type_id_fkey" FOREIGN KEY (document_type_id) REFERENCES public.document_types(id) ON DELETE SET NULL not valid;

alter table "public"."documents" validate constraint "documents_document_type_id_fkey";

alter table "public"."documents" add constraint "documents_owner_employee_id_fkey" FOREIGN KEY (owner_employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."documents" validate constraint "documents_owner_employee_id_fkey";

alter table "public"."documents" add constraint "documents_scope_site_check" CHECK ((((scope = 'site'::public.document_scope) AND (site_id IS NOT NULL)) OR (scope <> 'site'::public.document_scope))) not valid;

alter table "public"."documents" validate constraint "documents_scope_site_check";

alter table "public"."documents" add constraint "documents_scope_target_check" CHECK ((((scope = 'employee'::public.document_scope) AND (target_employee_id IS NOT NULL)) OR (scope <> 'employee'::public.document_scope))) not valid;

alter table "public"."documents" validate constraint "documents_scope_target_check";

alter table "public"."documents" add constraint "documents_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL not valid;

alter table "public"."documents" validate constraint "documents_site_id_fkey";

alter table "public"."documents" add constraint "documents_target_employee_id_fkey" FOREIGN KEY (target_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL not valid;

alter table "public"."documents" validate constraint "documents_target_employee_id_fkey";

alter table "public"."employee_devices" add constraint "employee_devices_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."employee_devices" validate constraint "employee_devices_employee_id_fkey";

alter table "public"."employee_devices" add constraint "employee_devices_unique_token" UNIQUE using index "employee_devices_unique_token";

alter table "public"."employee_permissions" add constraint "employee_permissions_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."employee_permissions" validate constraint "employee_permissions_employee_id_fkey";

alter table "public"."employee_permissions" add constraint "employee_permissions_employee_id_permission_id_scope_type_s_key" UNIQUE using index "employee_permissions_employee_id_permission_id_scope_type_s_key";

alter table "public"."employee_permissions" add constraint "employee_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES public.app_permissions(id) ON DELETE CASCADE not valid;

alter table "public"."employee_permissions" validate constraint "employee_permissions_permission_id_fkey";

alter table "public"."employee_permissions" add constraint "employee_permissions_scope_area_id_fkey" FOREIGN KEY (scope_area_id) REFERENCES public.areas(id) not valid;

alter table "public"."employee_permissions" validate constraint "employee_permissions_scope_area_id_fkey";

alter table "public"."employee_permissions" add constraint "employee_permissions_scope_area_kind_fkey" FOREIGN KEY (scope_area_kind) REFERENCES public.area_kinds(code) not valid;

alter table "public"."employee_permissions" validate constraint "employee_permissions_scope_area_kind_fkey";

alter table "public"."employee_permissions" add constraint "employee_permissions_scope_site_id_fkey" FOREIGN KEY (scope_site_id) REFERENCES public.sites(id) not valid;

alter table "public"."employee_permissions" validate constraint "employee_permissions_scope_site_id_fkey";

alter table "public"."employee_push_tokens" add constraint "employee_push_tokens_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."employee_push_tokens" validate constraint "employee_push_tokens_employee_id_fkey";

alter table "public"."employees" add constraint "employees_role_fkey" FOREIGN KEY (role) REFERENCES public.roles(code) not valid;

alter table "public"."employees" validate constraint "employees_role_fkey";

alter table "public"."inventory_cost_policies" add constraint "inventory_cost_policies_cost_basis_chk" CHECK ((cost_basis = ANY (ARRAY['net'::text, 'gross'::text]))) not valid;

alter table "public"."inventory_cost_policies" validate constraint "inventory_cost_policies_cost_basis_chk";

alter table "public"."inventory_cost_policies" add constraint "inventory_cost_policies_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_cost_policies" validate constraint "inventory_cost_policies_site_id_fkey";

alter table "public"."inventory_cost_policies" add constraint "inventory_cost_policies_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_cost_policies" validate constraint "inventory_cost_policies_updated_by_fkey";

alter table "public"."inventory_count_lines" add constraint "inventory_count_lines_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_count_lines" validate constraint "inventory_count_lines_product_id_fkey";

alter table "public"."inventory_count_lines" add constraint "inventory_count_lines_quantity_counted_check" CHECK ((quantity_counted >= (0)::numeric)) not valid;

alter table "public"."inventory_count_lines" validate constraint "inventory_count_lines_quantity_counted_check";

alter table "public"."inventory_count_lines" add constraint "inventory_count_lines_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.inventory_count_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_count_lines" validate constraint "inventory_count_lines_session_id_fkey";

alter table "public"."inventory_count_lines" add constraint "inventory_count_lines_session_id_product_id_key" UNIQUE using index "inventory_count_lines_session_id_product_id_key";

alter table "public"."inventory_count_sessions" add constraint "inventory_count_sessions_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_count_sessions" validate constraint "inventory_count_sessions_closed_by_fkey";

alter table "public"."inventory_count_sessions" add constraint "inventory_count_sessions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_count_sessions" validate constraint "inventory_count_sessions_created_by_fkey";

alter table "public"."inventory_count_sessions" add constraint "inventory_count_sessions_scope_location_id_fkey" FOREIGN KEY (scope_location_id) REFERENCES public.inventory_locations(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_count_sessions" validate constraint "inventory_count_sessions_scope_location_id_fkey";

alter table "public"."inventory_count_sessions" add constraint "inventory_count_sessions_scope_type_check" CHECK ((scope_type = ANY (ARRAY['site'::text, 'zone'::text, 'loc'::text]))) not valid;

alter table "public"."inventory_count_sessions" validate constraint "inventory_count_sessions_scope_type_check";

alter table "public"."inventory_count_sessions" add constraint "inventory_count_sessions_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_count_sessions" validate constraint "inventory_count_sessions_site_id_fkey";

alter table "public"."inventory_count_sessions" add constraint "inventory_count_sessions_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text]))) not valid;

alter table "public"."inventory_count_sessions" validate constraint "inventory_count_sessions_status_check";

alter table "public"."inventory_entries" add constraint "inventory_entries_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.employees(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_entries" validate constraint "inventory_entries_created_by_fkey";

alter table "public"."inventory_entries" add constraint "inventory_entries_emergency_reason_chk" CHECK (((entry_mode <> 'emergency'::text) OR (NULLIF(TRIM(BOTH FROM emergency_reason), ''::text) IS NOT NULL))) not valid;

alter table "public"."inventory_entries" validate constraint "inventory_entries_emergency_reason_chk";

alter table "public"."inventory_entries" add constraint "inventory_entries_entry_mode_chk" CHECK ((entry_mode = ANY (ARRAY['normal'::text, 'emergency'::text]))) not valid;

alter table "public"."inventory_entries" validate constraint "inventory_entries_entry_mode_chk";

alter table "public"."inventory_entries" add constraint "inventory_entries_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_entries" validate constraint "inventory_entries_purchase_order_id_fkey";

alter table "public"."inventory_entries" add constraint "inventory_entries_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_entries" validate constraint "inventory_entries_site_id_fkey";

alter table "public"."inventory_entries" add constraint "inventory_entries_source_app_chk" CHECK ((source_app = ANY (ARRAY['origo'::text, 'nexo'::text]))) not valid;

alter table "public"."inventory_entries" validate constraint "inventory_entries_source_app_chk";

alter table "public"."inventory_entries" add constraint "inventory_entries_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_entries" validate constraint "inventory_entries_supplier_id_fkey";

alter table "public"."inventory_entry_items" add constraint "inventory_entry_items_cost_source_chk" CHECK (((cost_source IS NULL) OR (cost_source = ANY (ARRAY['manual'::text, 'po_prefill'::text, 'fallback_product_cost'::text])))) not valid;

alter table "public"."inventory_entry_items" validate constraint "inventory_entry_items_cost_source_chk";

alter table "public"."inventory_entry_items" add constraint "inventory_entry_items_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES public.inventory_entries(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_entry_items" validate constraint "inventory_entry_items_entry_id_fkey";

alter table "public"."inventory_entry_items" add constraint "inventory_entry_items_input_unit_code_fkey" FOREIGN KEY (input_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."inventory_entry_items" validate constraint "inventory_entry_items_input_unit_code_fkey";

alter table "public"."inventory_entry_items" add constraint "inventory_entry_items_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_entry_items" validate constraint "inventory_entry_items_location_id_fkey";

alter table "public"."inventory_entry_items" add constraint "inventory_entry_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."inventory_entry_items" validate constraint "inventory_entry_items_product_id_fkey";

alter table "public"."inventory_entry_items" add constraint "inventory_entry_items_purchase_order_item_id_fkey" FOREIGN KEY (purchase_order_item_id) REFERENCES public.purchase_order_items(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_entry_items" validate constraint "inventory_entry_items_purchase_order_item_id_fkey";

alter table "public"."inventory_entry_items" add constraint "inventory_entry_items_stock_unit_code_fkey" FOREIGN KEY (stock_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."inventory_entry_items" validate constraint "inventory_entry_items_stock_unit_code_fkey";

alter table "public"."inventory_locations" add constraint "inventory_locations_parent_fkey" FOREIGN KEY (parent_location_id) REFERENCES public.inventory_locations(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_locations" validate constraint "inventory_locations_parent_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.employees(id) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_created_by_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_input_unit_code_fkey" FOREIGN KEY (input_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_input_unit_code_fkey";

alter table "public"."inventory_movements" add constraint "inventory_movements_stock_unit_code_fkey" FOREIGN KEY (stock_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."inventory_movements" validate constraint "inventory_movements_stock_unit_code_fkey";

alter table "public"."inventory_stock_by_location" add constraint "inventory_stock_by_location_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_stock_by_location" validate constraint "inventory_stock_by_location_location_id_fkey";

alter table "public"."inventory_stock_by_location" add constraint "inventory_stock_by_location_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_stock_by_location" validate constraint "inventory_stock_by_location_product_id_fkey";

alter table "public"."inventory_transfer_items" add constraint "inventory_transfer_items_input_unit_code_fkey" FOREIGN KEY (input_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."inventory_transfer_items" validate constraint "inventory_transfer_items_input_unit_code_fkey";

alter table "public"."inventory_transfer_items" add constraint "inventory_transfer_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."inventory_transfer_items" validate constraint "inventory_transfer_items_product_id_fkey";

alter table "public"."inventory_transfer_items" add constraint "inventory_transfer_items_stock_unit_code_fkey" FOREIGN KEY (stock_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."inventory_transfer_items" validate constraint "inventory_transfer_items_stock_unit_code_fkey";

alter table "public"."inventory_transfer_items" add constraint "inventory_transfer_items_transfer_id_fkey" FOREIGN KEY (transfer_id) REFERENCES public.inventory_transfers(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_transfer_items" validate constraint "inventory_transfer_items_transfer_id_fkey";

alter table "public"."inventory_transfers" add constraint "inventory_transfers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.employees(id) ON DELETE SET NULL not valid;

alter table "public"."inventory_transfers" validate constraint "inventory_transfers_created_by_fkey";

alter table "public"."inventory_transfers" add constraint "inventory_transfers_from_loc_id_fkey" FOREIGN KEY (from_loc_id) REFERENCES public.inventory_locations(id) not valid;

alter table "public"."inventory_transfers" validate constraint "inventory_transfers_from_loc_id_fkey";

alter table "public"."inventory_transfers" add constraint "inventory_transfers_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_transfers" validate constraint "inventory_transfers_site_id_fkey";

alter table "public"."inventory_transfers" add constraint "inventory_transfers_to_loc_id_fkey" FOREIGN KEY (to_loc_id) REFERENCES public.inventory_locations(id) not valid;

alter table "public"."inventory_transfers" validate constraint "inventory_transfers_to_loc_id_fkey";

alter table "public"."inventory_unit_aliases" add constraint "inventory_unit_aliases_unit_code_fkey" FOREIGN KEY (unit_code) REFERENCES public.inventory_units(code) ON DELETE CASCADE not valid;

alter table "public"."inventory_unit_aliases" validate constraint "inventory_unit_aliases_unit_code_fkey";

alter table "public"."inventory_units" add constraint "inventory_units_display_decimals_check" CHECK (((display_decimals >= 0) AND (display_decimals <= 6))) not valid;

alter table "public"."inventory_units" validate constraint "inventory_units_display_decimals_check";

alter table "public"."inventory_units" add constraint "inventory_units_factor_to_base_check" CHECK ((factor_to_base > (0)::numeric)) not valid;

alter table "public"."inventory_units" validate constraint "inventory_units_factor_to_base_check";

alter table "public"."inventory_units" add constraint "inventory_units_family_check" CHECK ((family = ANY (ARRAY['volume'::text, 'mass'::text, 'count'::text]))) not valid;

alter table "public"."inventory_units" validate constraint "inventory_units_family_check";

alter table "public"."loyalty_external_sales" add constraint "loyalty_external_sales_amount_cop_check" CHECK ((amount_cop > (0)::numeric)) not valid;

alter table "public"."loyalty_external_sales" validate constraint "loyalty_external_sales_amount_cop_check";

alter table "public"."loyalty_external_sales" add constraint "loyalty_external_sales_awarded_by_fkey" FOREIGN KEY (awarded_by) REFERENCES public.employees(id) ON DELETE RESTRICT not valid;

alter table "public"."loyalty_external_sales" validate constraint "loyalty_external_sales_awarded_by_fkey";

alter table "public"."loyalty_external_sales" add constraint "loyalty_external_sales_external_ref_chk" CHECK ((btrim(external_ref) <> ''::text)) not valid;

alter table "public"."loyalty_external_sales" validate constraint "loyalty_external_sales_external_ref_chk";

alter table "public"."loyalty_external_sales" add constraint "loyalty_external_sales_loyalty_transaction_id_fkey" FOREIGN KEY (loyalty_transaction_id) REFERENCES public.loyalty_transactions(id) ON DELETE SET NULL not valid;

alter table "public"."loyalty_external_sales" validate constraint "loyalty_external_sales_loyalty_transaction_id_fkey";

alter table "public"."loyalty_external_sales" add constraint "loyalty_external_sales_points_awarded_check" CHECK ((points_awarded > 0)) not valid;

alter table "public"."loyalty_external_sales" validate constraint "loyalty_external_sales_points_awarded_check";

alter table "public"."loyalty_external_sales" add constraint "loyalty_external_sales_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE RESTRICT not valid;

alter table "public"."loyalty_external_sales" validate constraint "loyalty_external_sales_site_id_fkey";

alter table "public"."loyalty_external_sales" add constraint "loyalty_external_sales_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT not valid;

alter table "public"."loyalty_external_sales" validate constraint "loyalty_external_sales_user_id_fkey";

alter table "public"."loyalty_redemptions" add constraint "loyalty_redemptions_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL not valid;

alter table "public"."loyalty_redemptions" validate constraint "loyalty_redemptions_site_id_fkey";

alter table "public"."product_categories" add constraint "product_categories_applies_to_kinds_allowed_chk" CHECK ((applies_to_kinds <@ ARRAY['insumo'::text, 'preparacion'::text, 'venta'::text, 'equipo'::text])) not valid;

alter table "public"."product_categories" validate constraint "product_categories_applies_to_kinds_allowed_chk";

alter table "public"."product_categories" add constraint "product_categories_applies_to_kinds_nonempty_chk" CHECK ((cardinality(applies_to_kinds) > 0)) not valid;

alter table "public"."product_categories" validate constraint "product_categories_applies_to_kinds_nonempty_chk";

alter table "public"."product_categories" add constraint "product_categories_domain_requires_venta_chk" CHECK (((NULLIF(TRIM(BOTH FROM domain), ''::text) IS NULL) OR (applies_to_kinds @> ARRAY['venta'::text]))) not valid;

alter table "public"."product_categories" validate constraint "product_categories_domain_requires_venta_chk";

alter table "public"."product_cost_events" add constraint "product_cost_events_basis_chk" CHECK ((basis = ANY (ARRAY['net'::text, 'gross'::text]))) not valid;

alter table "public"."product_cost_events" validate constraint "product_cost_events_basis_chk";

alter table "public"."product_cost_events" add constraint "product_cost_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."product_cost_events" validate constraint "product_cost_events_created_by_fkey";

alter table "public"."product_cost_events" add constraint "product_cost_events_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_cost_events" validate constraint "product_cost_events_product_id_fkey";

alter table "public"."product_cost_events" add constraint "product_cost_events_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL not valid;

alter table "public"."product_cost_events" validate constraint "product_cost_events_site_id_fkey";

alter table "public"."product_cost_events" add constraint "product_cost_events_source_adjust_movement_id_fkey" FOREIGN KEY (source_adjust_movement_id) REFERENCES public.inventory_movements(id) ON DELETE SET NULL not valid;

alter table "public"."product_cost_events" validate constraint "product_cost_events_source_adjust_movement_id_fkey";

alter table "public"."product_cost_events" add constraint "product_cost_events_source_chk" CHECK ((source = ANY (ARRAY['entry'::text, 'adjust'::text, 'production'::text]))) not valid;

alter table "public"."product_cost_events" validate constraint "product_cost_events_source_chk";

alter table "public"."product_cost_events" add constraint "product_cost_events_source_entry_id_fkey" FOREIGN KEY (source_entry_id) REFERENCES public.inventory_entries(id) ON DELETE SET NULL not valid;

alter table "public"."product_cost_events" validate constraint "product_cost_events_source_entry_id_fkey";

alter table "public"."product_inventory_profiles" add constraint "product_inventory_profiles_costing_mode_chk" CHECK ((costing_mode = ANY (ARRAY['auto_primary_supplier'::text, 'manual'::text]))) not valid;

alter table "public"."product_inventory_profiles" validate constraint "product_inventory_profiles_costing_mode_chk";

alter table "public"."product_inventory_profiles" add constraint "product_inventory_profiles_unit_family_chk" CHECK (((unit_family = ANY (ARRAY['volume'::text, 'mass'::text, 'count'::text])) OR (unit_family IS NULL))) not valid;

alter table "public"."product_inventory_profiles" validate constraint "product_inventory_profiles_unit_family_chk";

alter table "public"."product_site_settings" add constraint "product_site_settings_audience_chk" CHECK ((audience = ANY (ARRAY['SAUDO'::text, 'VCF'::text, 'BOTH'::text, 'INTERNAL'::text]))) not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_audience_chk";

alter table "public"."product_site_settings" add constraint "product_site_settings_default_area_kind_fkey" FOREIGN KEY (default_area_kind) REFERENCES public.area_kinds(code) not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_default_area_kind_fkey";

alter table "public"."product_site_settings" add constraint "product_site_settings_min_stock_input_mode_chk" CHECK (((min_stock_input_mode IS NULL) OR (min_stock_input_mode = ANY (ARRAY['base'::text, 'purchase'::text])))) not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_min_stock_input_mode_chk";

alter table "public"."product_site_settings" add constraint "product_site_settings_min_stock_mode_consistency_chk" CHECK (((min_stock_input_mode IS NULL) OR (min_stock_input_mode = 'base'::text) OR ((min_stock_input_mode = 'purchase'::text) AND (min_stock_purchase_qty IS NOT NULL) AND (min_stock_purchase_unit_code IS NOT NULL) AND (min_stock_purchase_to_base_factor IS NOT NULL)))) not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_min_stock_mode_consistency_chk";

alter table "public"."product_site_settings" add constraint "product_site_settings_min_stock_purchase_qty_chk" CHECK (((min_stock_purchase_qty IS NULL) OR (min_stock_purchase_qty >= (0)::numeric))) not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_min_stock_purchase_qty_chk";

alter table "public"."product_site_settings" add constraint "product_site_settings_min_stock_purchase_to_base_factor_chk" CHECK (((min_stock_purchase_to_base_factor IS NULL) OR (min_stock_purchase_to_base_factor > (0)::numeric))) not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_min_stock_purchase_to_base_factor_chk";

alter table "public"."product_site_settings" add constraint "product_site_settings_min_stock_qty_chk" CHECK (((min_stock_qty IS NULL) OR (min_stock_qty >= (0)::numeric))) not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_min_stock_qty_chk";

alter table "public"."product_site_settings" add constraint "product_site_settings_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_product_id_fkey";

alter table "public"."product_site_settings" add constraint "product_site_settings_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE not valid;

alter table "public"."product_site_settings" validate constraint "product_site_settings_site_id_fkey";

alter table "public"."product_site_settings" add constraint "product_site_settings_site_product_uniq" UNIQUE using index "product_site_settings_site_product_uniq";

alter table "public"."product_suppliers" add constraint "product_suppliers_purchase_pack_qty_chk" CHECK (((purchase_pack_qty IS NULL) OR (purchase_pack_qty > (0)::numeric))) not valid;

alter table "public"."product_suppliers" validate constraint "product_suppliers_purchase_pack_qty_chk";

alter table "public"."product_suppliers" add constraint "product_suppliers_purchase_pack_unit_code_fkey" FOREIGN KEY (purchase_pack_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."product_suppliers" validate constraint "product_suppliers_purchase_pack_unit_code_fkey";

alter table "public"."product_uom_profiles" add constraint "product_uom_profiles_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_uom_profiles" validate constraint "product_uom_profiles_product_id_fkey";

alter table "public"."product_uom_profiles" add constraint "product_uom_profiles_qty_input_chk" CHECK ((qty_in_input_unit > (0)::numeric)) not valid;

alter table "public"."product_uom_profiles" validate constraint "product_uom_profiles_qty_input_chk";

alter table "public"."product_uom_profiles" add constraint "product_uom_profiles_qty_stock_chk" CHECK ((qty_in_stock_unit > (0)::numeric)) not valid;

alter table "public"."product_uom_profiles" validate constraint "product_uom_profiles_qty_stock_chk";

alter table "public"."product_uom_profiles" add constraint "product_uom_profiles_source_chk" CHECK ((source = ANY (ARRAY['manual'::text, 'supplier_primary'::text]))) not valid;

alter table "public"."product_uom_profiles" validate constraint "product_uom_profiles_source_chk";

alter table "public"."product_uom_profiles" add constraint "product_uom_profiles_usage_context_chk" CHECK ((usage_context = ANY (ARRAY['general'::text, 'purchase'::text, 'remission'::text]))) not valid;

alter table "public"."product_uom_profiles" validate constraint "product_uom_profiles_usage_context_chk";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES public.production_batches(id) ON DELETE CASCADE not valid;

alter table "public"."production_batch_consumptions" validate constraint "production_batch_consumptions_batch_id_fkey";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_consumed_qty_chk" CHECK ((consumed_qty >= (0)::numeric)) not valid;

alter table "public"."production_batch_consumptions" validate constraint "production_batch_consumptions_consumed_qty_chk";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."production_batch_consumptions" validate constraint "production_batch_consumptions_created_by_fkey";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_ingredient_product_id_fkey" FOREIGN KEY (ingredient_product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."production_batch_consumptions" validate constraint "production_batch_consumptions_ingredient_product_id_fkey";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE RESTRICT not valid;

alter table "public"."production_batch_consumptions" validate constraint "production_batch_consumptions_location_id_fkey";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_movement_id_fkey" FOREIGN KEY (movement_id) REFERENCES public.inventory_movements(id) ON DELETE SET NULL not valid;

alter table "public"."production_batch_consumptions" validate constraint "production_batch_consumptions_movement_id_fkey";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_required_qty_chk" CHECK ((required_qty >= (0)::numeric)) not valid;

alter table "public"."production_batch_consumptions" validate constraint "production_batch_consumptions_required_qty_chk";

alter table "public"."production_batch_consumptions" add constraint "production_batch_consumptions_stock_unit_code_fkey" FOREIGN KEY (stock_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."production_batch_consumptions" validate constraint "production_batch_consumptions_stock_unit_code_fkey";

alter table "public"."production_batches" add constraint "production_batches_destination_location_id_fkey" FOREIGN KEY (destination_location_id) REFERENCES public.inventory_locations(id) ON DELETE SET NULL not valid;

alter table "public"."production_batches" validate constraint "production_batches_destination_location_id_fkey";

alter table "public"."production_request_items" add constraint "production_request_items_area_kind_fkey" FOREIGN KEY (production_area_kind) REFERENCES public.area_kinds(code) not valid;

alter table "public"."production_request_items" validate constraint "production_request_items_area_kind_fkey";

alter table "public"."products" add constraint "products_production_area_kind_fkey" FOREIGN KEY (production_area_kind) REFERENCES public.area_kinds(code) not valid;

alter table "public"."products" validate constraint "products_production_area_kind_fkey";

alter table "public"."products" add constraint "products_sku_format_chk" CHECK (((sku IS NULL) OR (TRIM(BOTH FROM sku) = ''::text) OR (upper(TRIM(BOTH FROM sku)) ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'::text))) NOT VALID not valid;

alter table "public"."products" validate constraint "products_sku_format_chk";

alter table "public"."products" add constraint "products_stock_unit_code_fkey" FOREIGN KEY (stock_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."products" validate constraint "products_stock_unit_code_fkey";

alter table "public"."restock_request_items" add constraint "restock_request_items_area_kind_fkey" FOREIGN KEY (production_area_kind) REFERENCES public.area_kinds(code) not valid;

alter table "public"."restock_request_items" validate constraint "restock_request_items_area_kind_fkey";

alter table "public"."restock_request_items" add constraint "restock_request_items_input_unit_code_fkey" FOREIGN KEY (input_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."restock_request_items" validate constraint "restock_request_items_input_unit_code_fkey";

alter table "public"."restock_request_items" add constraint "restock_request_items_source_location_id_fkey" FOREIGN KEY (source_location_id) REFERENCES public.inventory_locations(id) ON DELETE SET NULL not valid;

alter table "public"."restock_request_items" validate constraint "restock_request_items_source_location_id_fkey";

alter table "public"."restock_request_items" add constraint "restock_request_items_stock_unit_code_fkey" FOREIGN KEY (stock_unit_code) REFERENCES public.inventory_units(code) not valid;

alter table "public"."restock_request_items" validate constraint "restock_request_items_stock_unit_code_fkey";

alter table "public"."restock_requests" add constraint "restock_requests_in_transit_by_fkey" FOREIGN KEY (in_transit_by) REFERENCES public.employees(id) not valid;

alter table "public"."restock_requests" validate constraint "restock_requests_in_transit_by_fkey";

alter table "public"."restock_requests" add constraint "restock_requests_prepared_by_fkey" FOREIGN KEY (prepared_by) REFERENCES public.employees(id) not valid;

alter table "public"."restock_requests" validate constraint "restock_requests_prepared_by_fkey";

alter table "public"."restock_requests" add constraint "restock_requests_received_by_fkey" FOREIGN KEY (received_by) REFERENCES public.employees(id) not valid;

alter table "public"."restock_requests" validate constraint "restock_requests_received_by_fkey";

alter table "public"."restock_requests" add constraint "restock_requests_requested_by_site_id_fkey" FOREIGN KEY (requested_by_site_id) REFERENCES public.sites(id) not valid;

alter table "public"."restock_requests" validate constraint "restock_requests_requested_by_site_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES public.app_permissions(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_permission_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_role_fkey" FOREIGN KEY (role) REFERENCES public.roles(code) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_role_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_role_permission_id_scope_type_scope_site_t_key" UNIQUE using index "role_permissions_role_permission_id_scope_type_scope_site_t_key";

alter table "public"."role_permissions" add constraint "role_permissions_scope_area_kind_fkey" FOREIGN KEY (scope_area_kind) REFERENCES public.area_kinds(code) not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_scope_area_kind_fkey";

alter table "public"."role_site_type_rules" add constraint "role_site_type_rules_role_fkey" FOREIGN KEY (role) REFERENCES public.roles(code) ON DELETE CASCADE not valid;

alter table "public"."role_site_type_rules" validate constraint "role_site_type_rules_role_fkey";

alter table "public"."site_production_pick_order" add constraint "site_production_pick_order_location_id_fkey" FOREIGN KEY (location_id) REFERENCES public.inventory_locations(id) ON DELETE CASCADE not valid;

alter table "public"."site_production_pick_order" validate constraint "site_production_pick_order_location_id_fkey";

alter table "public"."site_production_pick_order" add constraint "site_production_pick_order_priority_chk" CHECK ((priority > 0)) not valid;

alter table "public"."site_production_pick_order" validate constraint "site_production_pick_order_priority_chk";

alter table "public"."site_production_pick_order" add constraint "site_production_pick_order_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE CASCADE not valid;

alter table "public"."site_production_pick_order" validate constraint "site_production_pick_order_site_id_fkey";

alter table "public"."site_supply_routes" add constraint "site_supply_routes_fulfillment_site_id_fkey" FOREIGN KEY (fulfillment_site_id) REFERENCES public.sites(id) not valid;

alter table "public"."site_supply_routes" validate constraint "site_supply_routes_fulfillment_site_id_fkey";

alter table "public"."site_supply_routes" add constraint "site_supply_routes_requesting_site_id_fkey" FOREIGN KEY (requesting_site_id) REFERENCES public.sites(id) not valid;

alter table "public"."site_supply_routes" validate constraint "site_supply_routes_requesting_site_id_fkey";

alter table "public"."site_supply_routes" add constraint "site_supply_routes_requesting_site_id_fulfillment_site_id_key" UNIQUE using index "site_supply_routes_requesting_site_id_fulfillment_site_id_key";

alter table "public"."staff_invitations" add constraint "staff_invitations_role_fkey" FOREIGN KEY (staff_role) REFERENCES public.roles(code) not valid;

alter table "public"."staff_invitations" validate constraint "staff_invitations_role_fkey";

alter table "public"."support_messages" add constraint "support_messages_author_id_fkey" FOREIGN KEY (author_id) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."support_messages" validate constraint "support_messages_author_id_fkey";

alter table "public"."support_messages" add constraint "support_messages_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE not valid;

alter table "public"."support_messages" validate constraint "support_messages_ticket_id_fkey";

alter table "public"."support_tickets" add constraint "support_tickets_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES public.employees(id) ON DELETE SET NULL not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_assigned_to_fkey";

alter table "public"."support_tickets" add constraint "support_tickets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.employees(id) ON DELETE CASCADE not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_created_by_fkey";

alter table "public"."support_tickets" add constraint "support_tickets_site_id_fkey" FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL not valid;

alter table "public"."support_tickets" validate constraint "support_tickets_site_id_fkey";

alter table "public"."wallet_devices" add constraint "wallet_devices_device_library_identifier_pass_type_identifi_key" UNIQUE using index "wallet_devices_device_library_identifier_pass_type_identifi_key";

alter table "public"."wallet_devices" add constraint "wallet_devices_serial_number_fkey" FOREIGN KEY (serial_number) REFERENCES public.wallet_passes(serial_number) ON DELETE CASCADE not valid;

alter table "public"."wallet_devices" validate constraint "wallet_devices_serial_number_fkey";

alter table "vital"."adaptive_decision_logs" add constraint "adaptive_decision_logs_confidence_check" CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))) not valid;

alter table "vital"."adaptive_decision_logs" validate constraint "adaptive_decision_logs_confidence_check";

alter table "vital"."adaptive_decision_logs" add constraint "adaptive_decision_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."adaptive_decision_logs" validate constraint "adaptive_decision_logs_user_id_fkey";

alter table "vital"."admin_users" add constraint "admin_users_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'analyst'::text]))) not valid;

alter table "vital"."admin_users" validate constraint "admin_users_role_check";

alter table "vital"."admin_users" add constraint "admin_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."admin_users" validate constraint "admin_users_user_id_fkey";

alter table "vital"."availability_profiles" add constraint "availability_profiles_preferred_time_window_check" CHECK ((preferred_time_window = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text, 'mixed'::text]))) not valid;

alter table "vital"."availability_profiles" validate constraint "availability_profiles_preferred_time_window_check";

alter table "vital"."availability_profiles" add constraint "availability_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."availability_profiles" validate constraint "availability_profiles_user_id_fkey";

alter table "vital"."badges" add constraint "badges_code_key" UNIQUE using index "badges_code_key";

alter table "vital"."badges" add constraint "badges_rarity_check" CHECK ((rarity = ANY (ARRAY['common'::text, 'rare'::text, 'epic'::text, 'legendary'::text]))) not valid;

alter table "vital"."badges" validate constraint "badges_rarity_check";

alter table "vital"."body_metrics" add constraint "body_metrics_body_fat_pct_check" CHECK (((body_fat_pct IS NULL) OR ((body_fat_pct >= (0)::numeric) AND (body_fat_pct <= (100)::numeric)))) not valid;

alter table "vital"."body_metrics" validate constraint "body_metrics_body_fat_pct_check";

alter table "vital"."body_metrics" add constraint "body_metrics_energy_score_check" CHECK (((energy_score IS NULL) OR ((energy_score >= 1) AND (energy_score <= 5)))) not valid;

alter table "vital"."body_metrics" validate constraint "body_metrics_energy_score_check";

alter table "vital"."body_metrics" add constraint "body_metrics_sleep_hours_check" CHECK (((sleep_hours IS NULL) OR ((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric)))) not valid;

alter table "vital"."body_metrics" validate constraint "body_metrics_sleep_hours_check";

alter table "vital"."body_metrics" add constraint "body_metrics_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."body_metrics" validate constraint "body_metrics_user_id_fkey";

alter table "vital"."body_metrics" add constraint "body_metrics_waist_cm_check" CHECK (((waist_cm IS NULL) OR (waist_cm > (0)::numeric))) not valid;

alter table "vital"."body_metrics" validate constraint "body_metrics_waist_cm_check";

alter table "vital"."body_metrics" add constraint "body_metrics_weight_kg_check" CHECK (((weight_kg IS NULL) OR (weight_kg > (0)::numeric))) not valid;

alter table "vital"."body_metrics" validate constraint "body_metrics_weight_kg_check";

alter table "vital"."challenge_progress" add constraint "challenge_progress_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES vital.challenges(id) ON DELETE CASCADE not valid;

alter table "vital"."challenge_progress" validate constraint "challenge_progress_challenge_id_fkey";

alter table "vital"."challenge_progress" add constraint "challenge_progress_status_check" CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "vital"."challenge_progress" validate constraint "challenge_progress_status_check";

alter table "vital"."challenge_progress" add constraint "challenge_progress_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."challenge_progress" validate constraint "challenge_progress_user_id_fkey";

alter table "vital"."challenges" add constraint "challenges_check" CHECK ((ends_at >= starts_at)) not valid;

alter table "vital"."challenges" validate constraint "challenges_check";

alter table "vital"."challenges" add constraint "challenges_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."challenges" validate constraint "challenges_created_by_user_id_fkey";

alter table "vital"."consent_records" add constraint "consent_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."consent_records" validate constraint "consent_records_user_id_fkey";

alter table "vital"."daily_readiness_inputs" add constraint "daily_readiness_inputs_energy_score_check" CHECK (((energy_score >= 0) AND (energy_score <= 100))) not valid;

alter table "vital"."daily_readiness_inputs" validate constraint "daily_readiness_inputs_energy_score_check";

alter table "vital"."daily_readiness_inputs" add constraint "daily_readiness_inputs_sleep_score_check" CHECK (((sleep_score >= 0) AND (sleep_score <= 100))) not valid;

alter table "vital"."daily_readiness_inputs" validate constraint "daily_readiness_inputs_sleep_score_check";

alter table "vital"."daily_readiness_inputs" add constraint "daily_readiness_inputs_stress_score_check" CHECK (((stress_score >= 0) AND (stress_score <= 100))) not valid;

alter table "vital"."daily_readiness_inputs" validate constraint "daily_readiness_inputs_stress_score_check";

alter table "vital"."daily_readiness_inputs" add constraint "daily_readiness_inputs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."daily_readiness_inputs" validate constraint "daily_readiness_inputs_user_id_fkey";

alter table "vital"."fair_play_events" add constraint "fair_play_events_resolved_by_user_id_fkey" FOREIGN KEY (resolved_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "vital"."fair_play_events" validate constraint "fair_play_events_resolved_by_user_id_fkey";

alter table "vital"."fair_play_events" add constraint "fair_play_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."fair_play_events" validate constraint "fair_play_events_user_id_fkey";

alter table "vital"."fatigue_scores" add constraint "fatigue_scores_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))) not valid;

alter table "vital"."fatigue_scores" validate constraint "fatigue_scores_confidence_check";

alter table "vital"."fatigue_scores" add constraint "fatigue_scores_fatigue_index_check" CHECK (((fatigue_index >= (0)::numeric) AND (fatigue_index <= (100)::numeric))) not valid;

alter table "vital"."fatigue_scores" validate constraint "fatigue_scores_fatigue_index_check";

alter table "vital"."fatigue_scores" add constraint "fatigue_scores_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."fatigue_scores" validate constraint "fatigue_scores_user_id_fkey";

alter table "vital"."game_profiles" add constraint "game_profiles_level_check" CHECK ((level > 0)) not valid;

alter table "vital"."game_profiles" validate constraint "game_profiles_level_check";

alter table "vital"."game_profiles" add constraint "game_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."game_profiles" validate constraint "game_profiles_user_id_fkey";

alter table "vital"."goal_profiles" add constraint "goal_profiles_experience_level_check" CHECK ((experience_level = ANY (ARRAY['new'::text, 'intermediate'::text, 'advanced'::text]))) not valid;

alter table "vital"."goal_profiles" validate constraint "goal_profiles_experience_level_check";

alter table "vital"."goal_profiles" add constraint "goal_profiles_minutes_per_session_check" CHECK (((minutes_per_session >= 10) AND (minutes_per_session <= 180))) not valid;

alter table "vital"."goal_profiles" validate constraint "goal_profiles_minutes_per_session_check";

alter table "vital"."goal_profiles" add constraint "goal_profiles_objective_check" CHECK ((objective = ANY (ARRAY['general_health'::text, 'fat_loss'::text, 'hypertrophy'::text, 'strength'::text, 'athlete'::text, 'minimalist'::text]))) not valid;

alter table "vital"."goal_profiles" validate constraint "goal_profiles_objective_check";

alter table "vital"."goal_profiles" add constraint "goal_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."goal_profiles" validate constraint "goal_profiles_user_id_fkey";

alter table "vital"."goal_profiles" add constraint "goal_profiles_weekly_days_check" CHECK (((weekly_days >= 1) AND (weekly_days <= 7))) not valid;

alter table "vital"."goal_profiles" validate constraint "goal_profiles_weekly_days_check";

alter table "vital"."health_profiles" add constraint "health_profiles_safety_gate_status_check" CHECK ((safety_gate_status = ANY (ARRAY['clear'::text, 'review_required'::text, 'blocked'::text]))) not valid;

alter table "vital"."health_profiles" validate constraint "health_profiles_safety_gate_status_check";

alter table "vital"."health_profiles" add constraint "health_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."health_profiles" validate constraint "health_profiles_user_id_fkey";

alter table "vital"."league_memberships" add constraint "league_memberships_season_id_fkey" FOREIGN KEY (season_id) REFERENCES vital.seasons(id) ON DELETE CASCADE not valid;

alter table "vital"."league_memberships" validate constraint "league_memberships_season_id_fkey";

alter table "vital"."league_memberships" add constraint "league_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."league_memberships" validate constraint "league_memberships_user_id_fkey";

alter table "vital"."level_states" add constraint "level_states_level_check" CHECK ((level > 0)) not valid;

alter table "vital"."level_states" validate constraint "level_states_level_check";

alter table "vital"."level_states" add constraint "level_states_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."level_states" validate constraint "level_states_user_id_fkey";

alter table "vital"."level_states" add constraint "level_states_xp_into_level_check" CHECK ((xp_into_level >= 0)) not valid;

alter table "vital"."level_states" validate constraint "level_states_xp_into_level_check";

alter table "vital"."level_states" add constraint "level_states_xp_needed_for_next_check" CHECK ((xp_needed_for_next > 0)) not valid;

alter table "vital"."level_states" validate constraint "level_states_xp_needed_for_next_check";

alter table "vital"."module_catalog" add constraint "module_catalog_key_check" CHECK ((key = ANY (ARRAY['training'::text, 'nutrition'::text, 'habits'::text, 'recovery'::text]))) not valid;

alter table "vital"."module_catalog" validate constraint "module_catalog_key_check";

alter table "vital"."module_template_catalog" add constraint "module_template_catalog_module_key_fkey" FOREIGN KEY (module_key) REFERENCES vital.module_catalog(key) ON DELETE CASCADE not valid;

alter table "vital"."module_template_catalog" validate constraint "module_template_catalog_module_key_fkey";

alter table "vital"."module_template_catalog" add constraint "module_template_catalog_task_type_check" CHECK ((task_type = ANY (ARRAY['workout'::text, 'cardio'::text, 'nutrition'::text, 'supplement'::text, 'sleep'::text, 'metrics'::text, 'recovery'::text]))) not valid;

alter table "vital"."module_template_catalog" validate constraint "module_template_catalog_task_type_check";

alter table "vital"."muscle_load_snapshots" add constraint "muscle_load_snapshots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."muscle_load_snapshots" validate constraint "muscle_load_snapshots_user_id_fkey";

alter table "vital"."notification_plans" add constraint "notification_plans_schedule_valid_chk" CHECK (vital.validate_notification_schedule(schedule)) not valid;

alter table "vital"."notification_plans" validate constraint "notification_plans_schedule_valid_chk";

alter table "vital"."notification_plans" add constraint "notification_plans_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."notification_plans" validate constraint "notification_plans_user_id_fkey";

alter table "vital"."program_versions" add constraint "program_versions_program_id_fkey" FOREIGN KEY (program_id) REFERENCES vital.programs(id) ON DELETE CASCADE not valid;

alter table "vital"."program_versions" validate constraint "program_versions_program_id_fkey";

alter table "vital"."program_versions" add constraint "program_versions_program_user_fkey" FOREIGN KEY (program_id, user_id) REFERENCES vital.programs(id, user_id) ON DELETE CASCADE not valid;

alter table "vital"."program_versions" validate constraint "program_versions_program_user_fkey";

alter table "vital"."program_versions" add constraint "program_versions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."program_versions" validate constraint "program_versions_user_id_fkey";

alter table "vital"."program_versions" add constraint "program_versions_version_number_check" CHECK ((version_number > 0)) not valid;

alter table "vital"."program_versions" validate constraint "program_versions_version_number_check";

alter table "vital"."programs" add constraint "programs_check" CHECK (((ended_on IS NULL) OR (started_on IS NULL) OR (ended_on >= started_on))) not valid;

alter table "vital"."programs" validate constraint "programs_check";

alter table "vital"."programs" add constraint "programs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."programs" validate constraint "programs_user_id_fkey";

alter table "vital"."readiness_scores" add constraint "readiness_scores_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))) not valid;

alter table "vital"."readiness_scores" validate constraint "readiness_scores_confidence_check";

alter table "vital"."readiness_scores" add constraint "readiness_scores_readiness_score_check" CHECK (((readiness_score >= (0)::numeric) AND (readiness_score <= (100)::numeric))) not valid;

alter table "vital"."readiness_scores" validate constraint "readiness_scores_readiness_score_check";

alter table "vital"."readiness_scores" add constraint "readiness_scores_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."readiness_scores" validate constraint "readiness_scores_user_id_fkey";

alter table "vital"."recovery_signals" add constraint "recovery_signals_energy_score_check" CHECK (((energy_score IS NULL) OR ((energy_score >= 1) AND (energy_score <= 5)))) not valid;

alter table "vital"."recovery_signals" validate constraint "recovery_signals_energy_score_check";

alter table "vital"."recovery_signals" add constraint "recovery_signals_hrv_ms_check" CHECK (((hrv_ms IS NULL) OR (hrv_ms > (0)::numeric))) not valid;

alter table "vital"."recovery_signals" validate constraint "recovery_signals_hrv_ms_check";

alter table "vital"."recovery_signals" add constraint "recovery_signals_resting_hr_check" CHECK (((resting_hr IS NULL) OR (resting_hr > 0))) not valid;

alter table "vital"."recovery_signals" validate constraint "recovery_signals_resting_hr_check";

alter table "vital"."recovery_signals" add constraint "recovery_signals_sleep_quality_check" CHECK (((sleep_quality IS NULL) OR ((sleep_quality >= 1) AND (sleep_quality <= 5)))) not valid;

alter table "vital"."recovery_signals" validate constraint "recovery_signals_sleep_quality_check";

alter table "vital"."recovery_signals" add constraint "recovery_signals_soreness_score_check" CHECK (((soreness_score IS NULL) OR ((soreness_score >= 0) AND (soreness_score <= 5)))) not valid;

alter table "vital"."recovery_signals" validate constraint "recovery_signals_soreness_score_check";

alter table "vital"."recovery_signals" add constraint "recovery_signals_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."recovery_signals" validate constraint "recovery_signals_user_id_fkey";

alter table "vital"."safety_intake" add constraint "safety_intake_risk_level_check" CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))) not valid;

alter table "vital"."safety_intake" validate constraint "safety_intake_risk_level_check";

alter table "vital"."safety_intake" add constraint "safety_intake_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."safety_intake" validate constraint "safety_intake_user_id_fkey";

alter table "vital"."seasons" add constraint "seasons_check" CHECK ((ends_at >= starts_at)) not valid;

alter table "vital"."seasons" validate constraint "seasons_check";

alter table "vital"."seasons" add constraint "seasons_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "vital"."seasons" validate constraint "seasons_created_by_user_id_fkey";

alter table "vital"."seasons" add constraint "seasons_name_key" UNIQUE using index "seasons_name_key";

alter table "vital"."session_logs" add constraint "session_logs_avg_rir_check" CHECK (((avg_rir IS NULL) OR ((avg_rir >= (0)::numeric) AND (avg_rir <= (10)::numeric)))) not valid;

alter table "vital"."session_logs" validate constraint "session_logs_avg_rir_check";

alter table "vital"."session_logs" add constraint "session_logs_check" CHECK (((ended_at IS NULL) OR (ended_at >= started_at))) not valid;

alter table "vital"."session_logs" validate constraint "session_logs_check";

alter table "vital"."session_logs" add constraint "session_logs_duration_minutes_check" CHECK (((duration_minutes IS NULL) OR (duration_minutes >= 0))) not valid;

alter table "vital"."session_logs" validate constraint "session_logs_duration_minutes_check";

alter table "vital"."session_logs" add constraint "session_logs_session_rpe_check" CHECK (((session_rpe IS NULL) OR ((session_rpe >= (0)::numeric) AND (session_rpe <= (10)::numeric)))) not valid;

alter table "vital"."session_logs" validate constraint "session_logs_session_rpe_check";

alter table "vital"."session_logs" add constraint "session_logs_task_instance_id_fkey" FOREIGN KEY (task_instance_id) REFERENCES vital.task_instances(id) ON DELETE SET NULL not valid;

alter table "vital"."session_logs" validate constraint "session_logs_task_instance_id_fkey";

alter table "vital"."session_logs" add constraint "session_logs_total_load_kg_check" CHECK (((total_load_kg IS NULL) OR (total_load_kg >= (0)::numeric))) not valid;

alter table "vital"."session_logs" validate constraint "session_logs_total_load_kg_check";

alter table "vital"."session_logs" add constraint "session_logs_total_reps_check" CHECK (((total_reps IS NULL) OR (total_reps >= 0))) not valid;

alter table "vital"."session_logs" validate constraint "session_logs_total_reps_check";

alter table "vital"."session_logs" add constraint "session_logs_total_sets_check" CHECK (((total_sets IS NULL) OR (total_sets >= 0))) not valid;

alter table "vital"."session_logs" validate constraint "session_logs_total_sets_check";

alter table "vital"."session_logs" add constraint "session_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."session_logs" validate constraint "session_logs_user_id_fkey";

alter table "vital"."squad_memberships" add constraint "squad_memberships_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text]))) not valid;

alter table "vital"."squad_memberships" validate constraint "squad_memberships_role_check";

alter table "vital"."squad_memberships" add constraint "squad_memberships_squad_id_fkey" FOREIGN KEY (squad_id) REFERENCES vital.squads(id) ON DELETE CASCADE not valid;

alter table "vital"."squad_memberships" validate constraint "squad_memberships_squad_id_fkey";

alter table "vital"."squad_memberships" add constraint "squad_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."squad_memberships" validate constraint "squad_memberships_user_id_fkey";

alter table "vital"."squads" add constraint "squads_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."squads" validate constraint "squads_owner_user_id_fkey";

alter table "vital"."starter_program_catalog" add constraint "starter_program_catalog_days_per_week_check" CHECK (((days_per_week >= 2) AND (days_per_week <= 6))) not valid;

alter table "vital"."starter_program_catalog" validate constraint "starter_program_catalog_days_per_week_check";

alter table "vital"."starter_program_catalog" add constraint "starter_program_catalog_level_check" CHECK ((level = ANY (ARRAY['general'::text, 'intermediate'::text, 'advanced'::text]))) not valid;

alter table "vital"."starter_program_catalog" validate constraint "starter_program_catalog_level_check";

alter table "vital"."starter_program_tasks" add constraint "starter_program_tasks_day_of_week_check" CHECK (((day_of_week >= 1) AND (day_of_week <= 7))) not valid;

alter table "vital"."starter_program_tasks" validate constraint "starter_program_tasks_day_of_week_check";

alter table "vital"."starter_program_tasks" add constraint "starter_program_tasks_estimated_minutes_check" CHECK (((estimated_minutes IS NULL) OR ((estimated_minutes >= 10) AND (estimated_minutes <= 180)))) not valid;

alter table "vital"."starter_program_tasks" validate constraint "starter_program_tasks_estimated_minutes_check";

alter table "vital"."starter_program_tasks" add constraint "starter_program_tasks_starter_key_fkey" FOREIGN KEY (starter_key) REFERENCES vital.starter_program_catalog(key) ON DELETE CASCADE not valid;

alter table "vital"."starter_program_tasks" validate constraint "starter_program_tasks_starter_key_fkey";

alter table "vital"."starter_program_tasks" add constraint "starter_program_tasks_task_type_check" CHECK ((task_type = ANY (ARRAY['workout'::text, 'cardio'::text, 'nutrition'::text, 'supplement'::text, 'sleep'::text, 'metrics'::text, 'recovery'::text]))) not valid;

alter table "vital"."starter_program_tasks" validate constraint "starter_program_tasks_task_type_check";

alter table "vital"."task_instances" add constraint "task_instances_check" CHECK (((window_end IS NULL) OR (window_start IS NULL) OR (window_end >= window_start))) not valid;

alter table "vital"."task_instances" validate constraint "task_instances_check";

alter table "vital"."task_instances" add constraint "task_instances_module_key_fkey" FOREIGN KEY (module_key) REFERENCES vital.module_catalog(key) not valid;

alter table "vital"."task_instances" validate constraint "task_instances_module_key_fkey";

alter table "vital"."task_instances" add constraint "task_instances_priority_check" CHECK (((priority >= 0) AND (priority <= 100))) not valid;

alter table "vital"."task_instances" validate constraint "task_instances_priority_check";

alter table "vital"."task_instances" add constraint "task_instances_task_template_id_fkey" FOREIGN KEY (task_template_id) REFERENCES vital.task_templates(id) ON DELETE CASCADE not valid;

alter table "vital"."task_instances" validate constraint "task_instances_task_template_id_fkey";

alter table "vital"."task_instances" add constraint "task_instances_task_template_user_fkey" FOREIGN KEY (task_template_id, user_id) REFERENCES vital.task_templates(id, user_id) ON DELETE CASCADE not valid;

alter table "vital"."task_instances" validate constraint "task_instances_task_template_user_fkey";

alter table "vital"."task_instances" add constraint "task_instances_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."task_instances" validate constraint "task_instances_user_id_fkey";

alter table "vital"."task_templates" add constraint "task_templates_module_key_fkey" FOREIGN KEY (module_key) REFERENCES vital.module_catalog(key) not valid;

alter table "vital"."task_templates" validate constraint "task_templates_module_key_fkey";

alter table "vital"."task_templates" add constraint "task_templates_program_version_id_fkey" FOREIGN KEY (program_version_id) REFERENCES vital.program_versions(id) ON DELETE CASCADE not valid;

alter table "vital"."task_templates" validate constraint "task_templates_program_version_id_fkey";

alter table "vital"."task_templates" add constraint "task_templates_program_version_user_fkey" FOREIGN KEY (program_version_id, user_id) REFERENCES vital.program_versions(id, user_id) ON DELETE CASCADE not valid;

alter table "vital"."task_templates" validate constraint "task_templates_program_version_user_fkey";

alter table "vital"."task_templates" add constraint "task_templates_task_type_check" CHECK ((task_type = ANY (ARRAY['workout'::text, 'cardio'::text, 'nutrition'::text, 'supplement'::text, 'sleep'::text, 'metrics'::text, 'recovery'::text]))) not valid;

alter table "vital"."task_templates" validate constraint "task_templates_task_type_check";

alter table "vital"."task_templates" add constraint "task_templates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."task_templates" validate constraint "task_templates_user_id_fkey";

alter table "vital"."telemetry_events" add constraint "telemetry_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "vital"."telemetry_events" validate constraint "telemetry_events_user_id_fkey";

alter table "vital"."user_badges" add constraint "user_badges_badge_id_fkey" FOREIGN KEY (badge_id) REFERENCES vital.badges(id) ON DELETE CASCADE not valid;

alter table "vital"."user_badges" validate constraint "user_badges_badge_id_fkey";

alter table "vital"."user_badges" add constraint "user_badges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."user_badges" validate constraint "user_badges_user_id_fkey";

alter table "vital"."user_feature_flags" add constraint "user_feature_flags_flag_key_fkey" FOREIGN KEY (flag_key) REFERENCES vital.feature_flags(key) ON DELETE CASCADE not valid;

alter table "vital"."user_feature_flags" validate constraint "user_feature_flags_flag_key_fkey";

alter table "vital"."user_feature_flags" add constraint "user_feature_flags_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."user_feature_flags" validate constraint "user_feature_flags_user_id_fkey";

alter table "vital"."user_module_preferences" add constraint "user_module_preferences_module_key_fkey" FOREIGN KEY (module_key) REFERENCES vital.module_catalog(key) ON DELETE CASCADE not valid;

alter table "vital"."user_module_preferences" validate constraint "user_module_preferences_module_key_fkey";

alter table "vital"."user_module_preferences" add constraint "user_module_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."user_module_preferences" validate constraint "user_module_preferences_user_id_fkey";

alter table "vital"."user_profiles" add constraint "user_profiles_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL not valid;

alter table "vital"."user_profiles" validate constraint "user_profiles_employee_id_fkey";

alter table "vital"."user_profiles" add constraint "user_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."user_profiles" validate constraint "user_profiles_user_id_fkey";

alter table "vital"."weekly_leaderboard_snapshots" add constraint "weekly_leaderboard_snapshots_fair_play_multiplier_check" CHECK (((fair_play_multiplier >= (0)::numeric) AND (fair_play_multiplier <= 1.00))) not valid;

alter table "vital"."weekly_leaderboard_snapshots" validate constraint "weekly_leaderboard_snapshots_fair_play_multiplier_check";

alter table "vital"."weekly_leaderboard_snapshots" add constraint "weekly_leaderboard_snapshots_rank_position_check" CHECK (((rank_position IS NULL) OR (rank_position > 0))) not valid;

alter table "vital"."weekly_leaderboard_snapshots" validate constraint "weekly_leaderboard_snapshots_rank_position_check";

alter table "vital"."weekly_leaderboard_snapshots" add constraint "weekly_leaderboard_snapshots_season_id_fkey" FOREIGN KEY (season_id) REFERENCES vital.seasons(id) ON DELETE CASCADE not valid;

alter table "vital"."weekly_leaderboard_snapshots" validate constraint "weekly_leaderboard_snapshots_season_id_fkey";

alter table "vital"."weekly_leaderboard_snapshots" add constraint "weekly_leaderboard_snapshots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."weekly_leaderboard_snapshots" validate constraint "weekly_leaderboard_snapshots_user_id_fkey";

alter table "vital"."weekly_reviews" add constraint "weekly_reviews_adherence_pct_check" CHECK (((adherence_pct IS NULL) OR ((adherence_pct >= (0)::numeric) AND (adherence_pct <= (100)::numeric)))) not valid;

alter table "vital"."weekly_reviews" validate constraint "weekly_reviews_adherence_pct_check";

alter table "vital"."weekly_reviews" add constraint "weekly_reviews_perceived_fatigue_check" CHECK (((perceived_fatigue IS NULL) OR ((perceived_fatigue >= 1) AND (perceived_fatigue <= 10)))) not valid;

alter table "vital"."weekly_reviews" validate constraint "weekly_reviews_perceived_fatigue_check";

alter table "vital"."weekly_reviews" add constraint "weekly_reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."weekly_reviews" validate constraint "weekly_reviews_user_id_fkey";

alter table "vital"."xp_events" add constraint "xp_events_base_xp_check" CHECK ((base_xp >= 0)) not valid;

alter table "vital"."xp_events" validate constraint "xp_events_base_xp_check";

alter table "vital"."xp_events" add constraint "xp_events_consistency_multiplier_check" CHECK (((consistency_multiplier >= (0)::numeric) AND (consistency_multiplier <= 2.00))) not valid;

alter table "vital"."xp_events" validate constraint "xp_events_consistency_multiplier_check";

alter table "vital"."xp_events" add constraint "xp_events_fair_play_multiplier_check" CHECK (((fair_play_multiplier >= (0)::numeric) AND (fair_play_multiplier <= 1.00))) not valid;

alter table "vital"."xp_events" validate constraint "xp_events_fair_play_multiplier_check";

alter table "vital"."xp_events" add constraint "xp_events_final_xp_check" CHECK ((final_xp >= 0)) not valid;

alter table "vital"."xp_events" validate constraint "xp_events_final_xp_check";

alter table "vital"."xp_events" add constraint "xp_events_safety_multiplier_check" CHECK (((safety_multiplier >= (0)::numeric) AND (safety_multiplier <= 1.00))) not valid;

alter table "vital"."xp_events" validate constraint "xp_events_safety_multiplier_check";

alter table "vital"."xp_events" add constraint "xp_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "vital"."xp_events" validate constraint "xp_events_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.apply_restock_receipt(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request record;
  v_item record;
  v_qty numeric;
begin
  select *
  into v_request
  from public.restock_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'restock_request not found: %', p_request_id;
  end if;

  if v_request.to_site_id is null then
    raise exception 'to_site_id requerido para recepcion de remision';
  end if;

  if not public.has_permission('nexo.inventory.remissions.receive', v_request.to_site_id) then
    raise exception 'permission denied: remissions.receive';
  end if;

  for v_item in
    select *
    from public.restock_request_items
    where request_id = p_request_id
  loop
    v_qty := coalesce(v_item.received_quantity, 0);
    if v_qty <= 0 then
      continue;
    end if;

    insert into public.inventory_movements (
      site_id,
      product_id,
      movement_type,
      quantity,
      note,
      related_restock_request_id
    )
    values (
      v_request.to_site_id,
      v_item.product_id,
      'transfer_in',
      v_qty,
      'Recepcion remision ' || p_request_id::text,
      p_request_id
    );

    insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
    values (v_request.to_site_id, v_item.product_id, v_qty, now())
    on conflict (site_id, product_id)
    do update set
      current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
      updated_at = now();
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_restock_shipment(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request record;
  v_item record;
  v_qty numeric;
begin
  select *
  into v_request
  from public.restock_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'restock_request not found: %', p_request_id;
  end if;

  if v_request.from_site_id is null then
    raise exception 'from_site_id requerido para salida de remision';
  end if;

  if not public.has_permission('nexo.inventory.remissions.prepare', v_request.from_site_id) then
    raise exception 'permission denied: remissions.prepare';
  end if;

  for v_item in
    select *
    from public.restock_request_items
    where request_id = p_request_id
  loop
    v_qty := coalesce(v_item.shipped_quantity, 0);
    if v_qty <= 0 then
      continue;
    end if;

    insert into public.inventory_movements (
      site_id,
      product_id,
      movement_type,
      quantity,
      note,
      related_restock_request_id
    )
    values (
      v_request.from_site_id,
      v_item.product_id,
      'transfer_out',
      v_qty,
      'Salida remision ' || p_request_id::text,
      p_request_id
    );

    insert into public.inventory_stock_by_site (site_id, product_id, current_qty, updated_at)
    values (v_request.from_site_id, v_item.product_id, -v_qty, now())
    on conflict (site_id, product_id)
    do update set
      current_qty = public.inventory_stock_by_site.current_qty + excluded.current_qty,
      updated_at = now();
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.award_loyalty_points_external(p_user_id uuid, p_site_id uuid, p_amount_cop numeric, p_external_ref text, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_points integer;
  v_ref text;
  v_sale_id uuid;
  v_grant_result jsonb;
  v_transaction_id uuid;
  v_new_balance integer;
begin
  if not public.is_active_staff() then
    return jsonb_build_object('success', false, 'error', 'No autorizado (staff requerido)');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_id es requerido');
  end if;

  if p_site_id is null then
    return jsonb_build_object('success', false, 'error', 'site_id es requerido');
  end if;

  if not public.has_permission('pulso.pos.main', p_site_id, null) then
    return jsonb_build_object('success', false, 'error', 'No autorizado para operar en esta sede');
  end if;

  if p_amount_cop is null or p_amount_cop <= 0 then
    return jsonb_build_object('success', false, 'error', 'amount_cop debe ser mayor a 0');
  end if;

  v_ref := btrim(coalesce(p_external_ref, ''));
  if v_ref = '' then
    return jsonb_build_object('success', false, 'error', 'external_ref es requerido');
  end if;

  v_points := floor(p_amount_cop / 1000);
  if v_points <= 0 then
    return jsonb_build_object('success', false, 'error', 'El monto no genera puntos');
  end if;

  begin
    insert into public.loyalty_external_sales (
      site_id,
      user_id,
      amount_cop,
      points_awarded,
      external_ref,
      source_app,
      awarded_by,
      metadata
    ) values (
      p_site_id,
      p_user_id,
      p_amount_cop,
      v_points,
      v_ref,
      'pulso',
      auth.uid(),
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('external_ref', v_ref, 'site_id', p_site_id)
    )
    returning id into v_sale_id;
  exception
    when unique_violation then
      return jsonb_build_object(
        'success', false,
        'duplicate', true,
        'error', 'Referencia externa ya registrada en esta sede'
      );
  end;

  v_grant_result := public.grant_loyalty_points(
    p_user_id,
    v_points,
    coalesce(p_description, format('Compra externa (%s)', v_ref)),
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source_app', 'pulso',
        'flow', 'external_pos',
        'site_id', p_site_id,
        'external_ref', v_ref,
        'external_sale_id', v_sale_id
      )
  );

  if coalesce((v_grant_result->>'success')::boolean, false) is not true then
    raise exception '%', coalesce(v_grant_result->>'error', 'Error otorgando puntos');
  end if;

  v_transaction_id := nullif(v_grant_result->>'transaction_id', '')::uuid;
  v_new_balance := nullif(v_grant_result->>'new_balance', '')::integer;

  update public.loyalty_external_sales
  set loyalty_transaction_id = v_transaction_id
  where id = v_sale_id;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'points_awarded', v_points,
    'new_balance', v_new_balance,
    'transaction_id', v_transaction_id,
    'external_sale_id', v_sale_id
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_nexo_permissions(p_employee_id uuid, p_site_id uuid)
 RETURNS TABLE(permission_code text, allowed boolean)
 LANGUAGE sql
 STABLE
AS $function$
  with perms as (
    select ap.code as permission_code
    from public.app_permissions ap
    join public.apps a on a.id = ap.app_id
    where a.code = 'nexo'
  ),
  ctx as (
    select p_employee_id as employee_id, p_site_id as site_id
  )
  select p.permission_code,
         public.has_permission('nexo.' || p.permission_code, (select site_id from ctx), null) as allowed
  from perms p
  order by p.permission_code;
$function$
;

CREATE OR REPLACE FUNCTION public.close_open_attendance_day_end(p_timezone text DEFAULT 'America/Bogota'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_closed int := 0;
begin
  v_day_start := (date_trunc('day', now() at time zone p_timezone)) at time zone p_timezone;
  v_day_end := (date_trunc('day', now() at time zone p_timezone) + interval '1 day' - interval '1 second') at time zone p_timezone;

  with last_logs as (
    select distinct on (employee_id)
      employee_id,
      site_id,
      action,
      occurred_at
    from public.attendance_logs
    where occurred_at <= v_day_end
    order by employee_id, occurred_at desc, created_at desc
  ),
  inserted as (
    insert into public.attendance_logs (
      employee_id,
      site_id,
      action,
      source,
      occurred_at,
      latitude,
      longitude,
      accuracy_meters,
      device_info,
      notes
    )
    select
      l.employee_id,
      l.site_id,
      'check_out',
      'system',
      v_day_end,
      s.latitude,
      s.longitude,
      0,
      jsonb_build_object('auto_close', true, 'reason', 'day_end'),
      'Cierre automatico: turno abierto cerrado por el sistema a las 23:59'
    from last_logs l
    join public.sites s on s.id = l.site_id
    where l.action = 'check_in'
      and not exists (
        select 1
        from public.attendance_logs al
        where al.employee_id = l.employee_id
          and al.action = 'check_out'
          and al.occurred_at > l.occurred_at
          and al.occurred_at <= v_day_end
      )
    returning 1
  )
  select count(*) into v_closed from inserted;

  return v_closed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.end_attendance_break(p_source text DEFAULT 'mobile'::text, p_notes text DEFAULT NULL::text)
 RETURNS public.attendance_breaks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_employee_id uuid;
  v_open_break public.attendance_breaks%rowtype;
  v_result public.attendance_breaks%rowtype;
begin
  v_employee_id := auth.uid();
  if v_employee_id is null then
    raise exception 'No autenticado';
  end if;

  select *
    into v_open_break
  from public.attendance_breaks
  where employee_id = v_employee_id
    and ended_at is null
  order by started_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No hay descanso activo para finalizar';
  end if;

  update public.attendance_breaks
  set
    ended_at = now(),
    end_source = coalesce(p_source, 'mobile'),
    end_notes = p_notes
  where id = v_open_break.id
  returning *
    into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_inventory_location_parent_same_site()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.parent_location_id is null then
    return new;
  end if;

  -- no puede ser su propio padre
  if new.parent_location_id = new.id then
    raise exception 'inventory_locations: parent_location_id cannot equal id';
  end if;

  -- el padre debe pertenecer al mismo site_id
  if not exists (
    select 1
    from public.inventory_locations p
    where p.id = new.parent_location_id
      and p.site_id = new.site_id
  ) then
    raise exception 'inventory_locations: parent_location_id must belong to the same site_id';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_inventory_sku(p_product_type text DEFAULT NULL::text, p_inventory_kind text DEFAULT NULL::text, p_name text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  v_type text;
  v_name text;
  v_seq bigint;
begin
  v_type := case
    when lower(coalesce(trim(p_inventory_kind), '')) = 'asset' then 'EQP'
    when lower(coalesce(trim(p_product_type), '')) = 'venta' then 'VEN'
    when lower(coalesce(trim(p_product_type), '')) = 'preparacion' then 'PRE'
    else 'INS'
  end;

  v_name := upper(coalesce(trim(p_name), ''));
  v_name := translate(v_name,
    'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
    'AAAAAEEEEIIIIOOOOOUUUUNCaaaaaeeeeiiiiooooouuuunc'
  );
  v_name := regexp_replace(v_name, '[^A-Z0-9]+', '', 'g');
  v_name := left(nullif(v_name, ''), 6);
  if v_name is null then
    v_name := 'ITEM';
  end if;

  v_seq := nextval('public.inventory_sku_seq');

  return v_type || '-' || v_name || '-' || lpad(v_seq::text, 6, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission_code text, p_site_id uuid DEFAULT NULL::uuid, p_area_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_employee_id uuid;
  v_role text;
  v_permission_id uuid;
  v_site_id uuid;
  v_area_id uuid;
  v_denied boolean;
  v_allowed boolean;
begin
  v_employee_id := auth.uid();
  if v_employee_id is null then
    return false;
  end if;

  select e.role into v_role
  from public.employees e
  where e.id = v_employee_id
    and e.is_active = true;

  if v_role is null then
    return false;
  end if;

  select ap.id into v_permission_id
  from public.app_permissions ap
  join public.apps a on a.id = ap.app_id
  where (a.code || '.' || ap.code) = p_permission_code
    and a.is_active = true
    and ap.is_active = true;

  if v_permission_id is null then
    return false;
  end if;

  v_site_id := coalesce(p_site_id, public.current_employee_site_id());
  v_area_id := p_area_id;

  select exists (
    select 1
    from public.employee_permissions ep
    where ep.employee_id = v_employee_id
      and ep.permission_id = v_permission_id
      and ep.is_allowed = false
      and public.permission_scope_matches(
        ep.scope_type,
        v_site_id,
        v_area_id,
        ep.scope_site_id,
        ep.scope_area_id,
        ep.scope_site_type,
        ep.scope_area_kind
      )
  ) into v_denied;

  if v_denied then
    return false;
  end if;

  select exists (
    select 1
    from public.employee_permissions ep
    where ep.employee_id = v_employee_id
      and ep.permission_id = v_permission_id
      and ep.is_allowed = true
      and public.permission_scope_matches(
        ep.scope_type,
        v_site_id,
        v_area_id,
        ep.scope_site_id,
        ep.scope_area_id,
        ep.scope_site_type,
        ep.scope_area_kind
      )
  ) into v_allowed;

  if v_allowed then
    return true;
  end if;

  select exists (
    select 1
    from public.role_permissions rp
    where rp.role = v_role
      and rp.permission_id = v_permission_id
      and rp.is_allowed = true
      and public.permission_scope_matches(
        rp.scope_type,
        v_site_id,
        v_area_id,
        null,
        null,
        rp.scope_site_type,
        rp.scope_area_kind
      )
  ) into v_allowed;

  return coalesce(v_allowed, false);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.permission_scope_matches(p_scope_type public.permission_scope_type, p_context_site_id uuid, p_context_area_id uuid, p_scope_site_id uuid, p_scope_area_id uuid, p_scope_site_type public.site_type, p_scope_area_kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_site_type public.site_type;
  v_area_kind text;
begin
  if p_scope_type = 'global' then
    return true;
  end if;

  if p_scope_type = 'site' then
    if p_context_site_id is null then
      return false;
    end if;
    if p_scope_site_id is not null and p_scope_site_id <> p_context_site_id then
      return false;
    end if;
    return public.can_access_site(p_context_site_id);
  end if;

  if p_scope_type = 'site_type' then
    if p_context_site_id is null then
      return false;
    end if;
    if not public.can_access_site(p_context_site_id) then
      return false;
    end if;
    select site_type into v_site_type from public.sites where id = p_context_site_id;
    return v_site_type = p_scope_site_type;
  end if;

  if p_scope_type = 'area' then
    if p_context_area_id is null then
      return false;
    end if;
    if p_scope_area_id is not null and p_scope_area_id <> p_context_area_id then
      return false;
    end if;
    return public.can_access_area(p_context_area_id);
  end if;

  if p_scope_type = 'area_kind' then
    if p_context_area_id is null then
      return false;
    end if;
    if not public.can_access_area(p_context_area_id) then
      return false;
    end if;
    select kind into v_area_kind from public.areas where id = p_context_area_id;
    return v_area_kind = p_scope_area_kind;
  end if;

  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.register_shift_departure_event(p_site_id uuid, p_distance_meters integer, p_accuracy_meters integer DEFAULT NULL::integer, p_source text DEFAULT 'mobile'::text, p_notes text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_employee_id uuid := auth.uid();
  v_employee public.employees%rowtype;
  v_shift_site_id uuid;
  v_shift_start_at timestamptz;
  v_event_id uuid;
  v_distance integer := greatest(coalesce(p_distance_meters, 0), 0);
  v_accuracy integer := case
    when p_accuracy_meters is null then null
    else greatest(p_accuracy_meters, 0)
  end;
  v_event_time timestamptz := coalesce(p_occurred_at, now());
begin
  if v_employee_id is null then
    raise exception 'No autenticado';
  end if;

  select *
    into v_employee
  from public.employees
  where id = v_employee_id;

  if not found then
    raise exception 'Empleado no encontrado';
  end if;

  if coalesce(v_employee.is_active, false) is false then
    raise exception 'Empleado inactivo';
  end if;

  select al.site_id, al.occurred_at
    into v_shift_site_id, v_shift_start_at
  from public.attendance_logs al
  where al.employee_id = v_employee_id
    and al.action = 'check_in'
    and not exists (
      select 1
      from public.attendance_logs ao
      where ao.employee_id = al.employee_id
        and ao.action = 'check_out'
        and ao.occurred_at > al.occurred_at
    )
  order by al.occurred_at desc, al.created_at desc
  limit 1;

  if v_shift_start_at is null then
    return jsonb_build_object('inserted', false, 'reason', 'no_open_shift');
  end if;

  if p_site_id is not null and p_site_id is distinct from v_shift_site_id then
    return jsonb_build_object('inserted', false, 'reason', 'site_mismatch');
  end if;

  if exists (
    select 1
    from public.attendance_breaks b
    where b.employee_id = v_employee_id
      and b.ended_at is null
  ) then
    return jsonb_build_object('inserted', false, 'reason', 'on_break');
  end if;

  insert into public.attendance_shift_events (
    employee_id,
    site_id,
    shift_start_at,
    event_type,
    occurred_at,
    distance_meters,
    accuracy_meters,
    source,
    notes
  )
  values (
    v_employee_id,
    coalesce(p_site_id, v_shift_site_id),
    v_shift_start_at,
    'left_site_open_shift',
    v_event_time,
    v_distance,
    v_accuracy,
    coalesce(p_source, 'mobile'),
    p_notes
  )
  on conflict (employee_id, shift_start_at, event_type) do nothing
  returning id
    into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('inserted', false, 'reason', 'already_recorded');
  end if;

  return jsonb_build_object(
    'inserted', true,
    'event_id', v_event_id,
    'shift_start_at', v_shift_start_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_nexo_inventory_reset(p_confirm text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_expected constant text := 'RESET_NEXO_INVENTORY';
  v_deleted_products integer := 0;
  v_preserved_products integer := 0;
  r record;
begin
  if p_confirm <> v_expected then
    raise exception 'Confirmacion invalida. Ejecuta run_nexo_inventory_reset(''%s'') para continuar.', v_expected;
  end if;

  create temporary table if not exists tmp_preserve_products (
    product_id uuid primary key
  ) on commit drop;
  truncate table tmp_preserve_products;

  create temporary table if not exists tmp_reset_products (
    product_id uuid primary key
  ) on commit drop;
  truncate table tmp_reset_products;

  /*
    Preserve products used by Vento Pass reward redemption.
    - If loyalty_rewards.metadata stores product_id in known paths, keep those ids.
    - If metadata stores sku/code, keep products that match by sku.
  */
  if to_regclass('public.loyalty_rewards') is not null then
    insert into tmp_preserve_products(product_id)
    select distinct raw_product_id::uuid
    from (
      select trim(v.raw_value) as raw_product_id
      from public.loyalty_rewards lr
      cross join lateral (
        values
          (lr.metadata ->> 'product_id'),
          (lr.metadata ->> 'inventory_product_id'),
          (lr.metadata ->> 'catalog_product_id'),
          (lr.metadata ->> 'product_uuid'),
          (lr.metadata ->> 'productId'),
          (lr.metadata ->> 'product_id_uuid'),
          (lr.metadata -> 'product' ->> 'id'),
          (lr.metadata -> 'item' ->> 'product_id')
      ) as v(raw_value)
    ) candidates
    where raw_product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    on conflict (product_id) do nothing;

    insert into tmp_preserve_products(product_id)
    select distinct p.id
    from public.products p
    join public.loyalty_rewards lr
      on lower(coalesce(p.sku, '')) in (
        lower(coalesce(lr.code, '')),
        lower(coalesce(lr.metadata ->> 'sku', '')),
        lower(coalesce(lr.metadata ->> 'product_sku', ''))
      )
    where p.sku is not null
      and btrim(p.sku) <> ''
    on conflict (product_id) do nothing;
  end if;

  /*
    Products to delete: everything in products except reward-redemption preserves.
    This leaves Nexo inventory fully clean.
  */
  insert into tmp_reset_products(product_id)
  select p.id
  from public.products p
  where not exists (
    select 1
    from tmp_preserve_products keep
    where keep.product_id = p.id
  );

  select count(*) into v_preserved_products from tmp_preserve_products;

  -- Inventory transactional cleanup.
  if to_regclass('public.inventory_movements') is not null then
    delete from public.inventory_movements;
  end if;
  if to_regclass('public.inventory_stock_by_location') is not null then
    delete from public.inventory_stock_by_location;
  end if;
  if to_regclass('public.inventory_stock_by_site') is not null then
    delete from public.inventory_stock_by_site;
  end if;
  if to_regclass('public.inventory_entry_items') is not null then
    delete from public.inventory_entry_items;
  end if;
  if to_regclass('public.inventory_entries') is not null then
    delete from public.inventory_entries;
  end if;
  if to_regclass('public.inventory_transfer_items') is not null then
    delete from public.inventory_transfer_items;
  end if;
  if to_regclass('public.inventory_transfers') is not null then
    delete from public.inventory_transfers;
  end if;
  if to_regclass('public.restock_request_items') is not null then
    delete from public.restock_request_items;
  end if;
  if to_regclass('public.restock_requests') is not null then
    delete from public.restock_requests;
  end if;
  if to_regclass('public.inventory_count_lines') is not null then
    delete from public.inventory_count_lines;
  end if;
  if to_regclass('public.inventory_count_sessions') is not null then
    delete from public.inventory_count_sessions;
  end if;
  if to_regclass('public.production_batches') is not null then
    delete from public.production_batches;
  end if;

  -- Cleanup all FK dependencies that point to products(id) for target product ids.
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attname as column_name
    from pg_constraint fk
    join pg_class c
      on c.oid = fk.conrelid
    join pg_namespace n
      on n.oid = c.relnamespace
    join unnest(fk.conkey) with ordinality as ck(attnum, ord)
      on true
    join unnest(fk.confkey) with ordinality as rk(attnum, ord)
      on rk.ord = ck.ord
    join pg_attribute a
      on a.attrelid = fk.conrelid
     and a.attnum = ck.attnum
    where fk.contype = 'f'
      and fk.confrelid = 'public.products'::regclass
      and n.nspname = 'public'
      and array_length(fk.conkey, 1) = 1
  loop
    execute format(
      'delete from %I.%I where %I in (select product_id from tmp_reset_products)',
      r.schema_name,
      r.table_name,
      r.column_name
    );
  end loop;

  delete from public.products p
  using tmp_reset_products t
  where p.id = t.product_id;

  get diagnostics v_deleted_products = row_count;

  raise notice 'Inventory reset done. Deleted products: %, preserved reward products: %.',
    v_deleted_products,
    v_preserved_products;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_production_batch_code()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;

  if new.batch_code is null or btrim(new.batch_code) = '' then
    new.batch_code := 'BATCH-' || upper(substr(replace(new.id::text, '-', ''), 1, 8));
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_attendance_break(p_site_id uuid, p_source text DEFAULT 'mobile'::text, p_notes text DEFAULT NULL::text)
 RETURNS public.attendance_breaks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_employee public.employees%rowtype;
  v_last_action text;
  v_last_site_id uuid;
  v_result public.attendance_breaks%rowtype;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select *
    into v_employee
  from public.employees
  where id = auth.uid();

  if not found then
    raise exception 'Empleado no encontrado';
  end if;

  if coalesce(v_employee.is_active, false) is false then
    raise exception 'Empleado inactivo';
  end if;

  select action, site_id
    into v_last_action, v_last_site_id
  from public.attendance_logs
  where employee_id = v_employee.id
  order by occurred_at desc, created_at desc
  limit 1;

  if v_last_action is distinct from 'check_in' then
    raise exception 'No hay un turno activo para iniciar descanso';
  end if;

  if p_site_id is not null and p_site_id is distinct from v_last_site_id then
    raise exception 'La sede del descanso no coincide con el turno activo';
  end if;

  if exists (
    select 1
    from public.attendance_breaks b
    where b.employee_id = v_employee.id
      and b.ended_at is null
  ) then
    raise exception 'Ya tienes un descanso activo';
  end if;

  insert into public.attendance_breaks (
    employee_id,
    site_id,
    started_at,
    start_source,
    start_notes
  )
  values (
    v_employee.id,
    coalesce(p_site_id, v_last_site_id),
    now(),
    coalesce(p_source, 'mobile'),
    p_notes
  )
  returning *
    into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_inventory_stock_by_location(p_location_id uuid, p_product_id uuid, p_delta numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_site_id uuid;
begin
  select site_id into v_site_id
  from public.inventory_locations
  where id = p_location_id;

  if v_site_id is null then
    raise exception 'location not found';
  end if;

  if not (
    public.has_permission('nexo.inventory.stock', v_site_id)
    or public.has_permission('nexo.inventory.remissions.prepare', v_site_id)
    or public.has_permission('nexo.inventory.remissions.receive', v_site_id)
    or public.has_permission('nexo.inventory.entries', v_site_id)
    or public.has_permission('nexo.inventory.entries_emergency', v_site_id)
    or public.has_permission('nexo.inventory.transfers', v_site_id)
    or public.has_permission('nexo.inventory.withdraw', v_site_id)
    or public.has_permission('nexo.inventory.counts', v_site_id)
    or public.has_permission('nexo.inventory.adjustments', v_site_id)
    or public.has_permission('origo.procurement.receipts', v_site_id)
    or public.has_permission('fogo.production.batches', v_site_id)
  ) then
    raise exception 'permission denied';
  end if;

  insert into public.inventory_stock_by_location (location_id, product_id, current_qty, updated_at)
  values (p_location_id, p_product_id, p_delta, now())
  on conflict (location_id, product_id) do update
    set current_qty = public.inventory_stock_by_location.current_qty + excluded.current_qty,
        updated_at = now();
end;
$function$
;

create or replace view "public"."v_inventory_stock_by_location" as  SELECT loc.id AS location_id,
    loc.code AS location_code,
    loc.zone,
    loc.site_id,
    s.name AS site_name,
    p.id AS product_id,
    p.name AS product_name,
    p.sku,
    isl.current_qty AS total_quantity,
    p.unit
   FROM (((public.inventory_stock_by_location isl
     JOIN public.inventory_locations loc ON ((loc.id = isl.location_id)))
     JOIN public.sites s ON ((s.id = loc.site_id)))
     JOIN public.products p ON ((p.id = isl.product_id)))
  WHERE (loc.is_active = true);


CREATE OR REPLACE FUNCTION vital.can_access_user(target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  select (
    auth.uid() = target_user_id
    or vital.is_vital_admin()
    or vital.is_service_role()
  );
$function$
;

CREATE OR REPLACE FUNCTION vital.complete_task_instance(p_task_instance_id uuid, p_completion_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS vital.task_instances
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_row vital.task_instances;
begin
  update vital.task_instances ti
  set
    status = 'completed',
    completed_at = now(),
    completion_payload = coalesce(p_completion_payload, '{}'::jsonb),
    updated_at = now()
  where ti.id = p_task_instance_id
    and ti.user_id = auth.uid()
  returning ti.* into v_row;

  if v_row.id is null then
    raise exception 'task_instance not found or access denied';
  end if;

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.compute_hoy_scores(p_target_date date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date)
 RETURNS TABLE(task_instance_id uuid, module_key text, priority_score integer, reason_code text, reason_text text, safety_state text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_blocked_modules jsonb := '[]'::jsonb;
  v_risk_level text := 'low';
  v_adherence integer := 60;
  v_readiness integer := 60;
  v_risk_penalty integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  perform 1 from vital.today_tasks(p_target_date);

  select s.blocked_modules, s.risk_level
    into v_blocked_modules, v_risk_level
  from vital.get_safety_status() s;

  select coalesce(
    round(
      100.0
      * sum(case when status = 'completed' then 1 else 0 end)::numeric
      / nullif(count(*), 0)
    )::integer,
    60
  )
  into v_adherence
  from vital.task_instances
  where user_id = v_user_id
    and task_date between (p_target_date - 6) and p_target_date;

  select coalesce(
    round(
      (
        dri.sleep_score::numeric
        + (100 - dri.stress_score)::numeric
        + dri.energy_score::numeric
      ) / 3
    )::integer,
    60
  )
  into v_readiness
  from vital.daily_readiness_inputs dri
  where dri.user_id = v_user_id
    and dri.input_date = p_target_date;

  if v_risk_level = 'critical' then
    v_risk_penalty := 100;
  elsif v_risk_level = 'high' then
    v_risk_penalty := 60;
  elsif v_risk_level = 'medium' then
    v_risk_penalty := 30;
  else
    v_risk_penalty := 0;
  end if;

  return query
  with enabled_modules as (
    select ump.module_key
    from vital.get_user_module_preferences()
    as ump(module_key, is_enabled, config)
    where ump.is_enabled
  ),
  base as (
    select
      ti.id as task_instance_id,
      ti.module_key,
      ti.status,
      ti.priority,
      case
        when exists (
          select 1
          from jsonb_array_elements_text(v_blocked_modules) b
          where b = ti.module_key
        ) then 'blocked'
        else 'ok'
      end as safety_state,
      case
        when ti.module_key = 'recovery' then 78
        when ti.module_key = 'training' then 72
        when ti.module_key = 'nutrition' then 66
        else 62
      end as objective_urgency
    from vital.task_instances ti
    join vital.task_templates tt
      on tt.id = ti.task_template_id
     and tt.user_id = ti.user_id
    join enabled_modules em
      on em.module_key = ti.module_key
    where ti.user_id = v_user_id
      and ti.task_date = p_target_date
  )
  select
    b.task_instance_id,
    b.module_key,
    case
      when b.safety_state = 'blocked' then 0
      else greatest(
        0,
        least(
          100,
          round(
            0.25 * v_adherence
            + 0.25 * v_readiness
            + 0.20 * (100 - v_risk_penalty)
            + 0.20 * b.objective_urgency
            + 0.10 * coalesce(b.priority, 50)
          )::integer
        )
      )
    end as priority_score,
    case
      when b.safety_state = 'blocked' then 'safety_blocked'
      when v_readiness < 45 then 'low_readiness'
      when v_adherence < 50 then 'low_adherence'
      else 'balanced_priority'
    end as reason_code,
    case
      when b.safety_state = 'blocked' then 'Bloqueado por safety gate activo para este modulo.'
      when v_readiness < 45 then 'Prioridad ajustada por readiness bajo del dia.'
      when v_adherence < 50 then 'Prioridad ajustada para recuperar adherencia semanal.'
      else 'Prioridad balanceada por adherencia, readiness, riesgo y urgencia.'
    end as reason_text,
    b.safety_state
  from base b
  order by priority_score desc, b.task_instance_id;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.create_initial_bundle_from_onboarding(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_modules jsonb := coalesce(v_payload -> 'modules', '[]'::jsonb);
  v_safety jsonb := coalesce(v_payload -> 'safety', '{}'::jsonb);
  v_objective text := coalesce(nullif(trim(v_payload ->> 'objective'), ''), 'general_health');
  v_days smallint := least(6, greatest(2, coalesce((v_payload ->> 'days_per_week')::smallint, 3)));
  v_minutes smallint := least(90, greatest(20, coalesce((v_payload ->> 'minutes_per_session')::smallint, 45)));
  v_starter_key text := coalesce(nullif(trim(v_payload ->> 'starter_key'), ''), format('starter_%sd', v_days));
  v_blocked_modules jsonb := '[]'::jsonb;
  v_training_requested boolean := false;
  v_training_enabled boolean := false;
  v_program_name text;
  v_created_non_training_templates integer := 0;
  v_created_training boolean := false;
  v_inserted_count integer := 0;
  v_module_record record;
  v_program_id uuid;
  v_program_version_id uuid;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if jsonb_typeof(v_modules) <> 'array' then
    raise exception 'modules must be json array';
  end if;

  perform vital.submit_safety_intake(v_safety);

  select s.blocked_modules
    into v_blocked_modules
  from vital.get_safety_status() s;

  perform vital.upsert_user_module_preferences(
    (
      select jsonb_agg(
        jsonb_build_object(
          'module_key', mc.key,
          'is_enabled',
            case
              when exists (
                select 1
                from jsonb_array_elements_text(v_modules) m
                where m = mc.key
              ) then true
              else false
            end,
          'config', '{}'::jsonb
        )
      )
      from vital.module_catalog mc
      where mc.is_active
    )
  );

  v_training_requested := exists (
    select 1
    from jsonb_array_elements_text(v_modules) m
    where m = 'training'
  );

  v_training_enabled := v_training_requested and not exists (
    select 1
    from jsonb_array_elements_text(v_blocked_modules) b
    where b = 'training'
  );

  if v_training_enabled then
    v_program_name := format(
      '%s %sD · %smin',
      case
        when v_objective = 'strength' then 'Fuerza'
        when v_objective = 'hypertrophy' then 'Hipertrofia'
        else 'Salud'
      end,
      v_days,
      v_minutes
    );
    perform *
    from vital.create_program_from_starter(v_starter_key, v_program_name);
    v_created_training := true;
  end if;

  for v_module_record in
    select distinct x.value as module_key
    from jsonb_array_elements_text(v_modules) as x(value)
    where x.value in ('nutrition', 'habits', 'recovery')
  loop
    select p.id
      into v_program_id
    from vital.programs p
    where p.user_id = v_user_id
      and p.is_active
      and p.objective = format('%s_core', v_module_record.module_key)
    limit 1;

    if v_program_id is null then
      insert into vital.programs (
        user_id,
        name,
        objective,
        status,
        started_on,
        is_active
      )
      values (
        v_user_id,
        initcap(v_module_record.module_key) || ' Core',
        format('%s_core', v_module_record.module_key),
        'active',
        current_date,
        true
      )
      returning id into v_program_id;

      insert into vital.program_versions (
        user_id,
        program_id,
        version_number,
        archetype,
        generated_from,
        rules_snapshot,
        is_active
      )
      values (
        v_user_id,
        v_program_id,
        1,
        format('%s_v1', v_module_record.module_key),
        jsonb_build_object('source', 'onboarding_v2'),
        '{}'::jsonb,
        true
      )
      returning id into v_program_version_id;

      insert into vital.task_templates (
        user_id,
        program_version_id,
        module_key,
        task_type,
        title,
        recurrence_rule,
        ordering,
        estimated_minutes,
        payload,
        is_active
      )
      select
        v_user_id,
        v_program_version_id,
        mtc.module_key,
        mtc.task_type,
        mtc.title,
        jsonb_build_object(
          'type', 'weekly',
          'days', to_jsonb(mtc.days_of_week)
        ),
        mtc.ordering,
        mtc.estimated_minutes,
        mtc.payload,
        true
      from vital.module_template_catalog mtc
      where mtc.module_key = v_module_record.module_key
        and mtc.is_active;

      get diagnostics v_inserted_count = row_count;
      v_created_non_training_templates := v_created_non_training_templates + coalesce(v_inserted_count, 0);
    end if;
  end loop;

  return jsonb_build_object(
    'training_requested', v_training_requested,
    'training_created', v_created_training,
    'blocked_modules', v_blocked_modules,
    'non_training_templates_created', v_created_non_training_templates,
    'objective', v_objective,
    'days_per_week', v_days,
    'minutes_per_session', v_minutes
  );
end
$function$
;

CREATE OR REPLACE FUNCTION vital.create_program_from_starter(p_starter_key text, p_program_name text DEFAULT NULL::text)
 RETURNS TABLE(program_id uuid, program_version_id uuid, templates_created integer)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_catalog vital.starter_program_catalog%rowtype;
  v_program_id uuid;
  v_program_version_id uuid;
  v_templates_created integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  select * into v_catalog
  from vital.starter_program_catalog
  where key = p_starter_key
    and is_active;

  if v_catalog.key is null then
    raise exception 'starter program not found or inactive';
  end if;

  insert into vital.programs (
    user_id,
    name,
    objective,
    status,
    started_on,
    is_active
  )
  values (
    v_user_id,
    coalesce(nullif(btrim(p_program_name), ''), v_catalog.name),
    v_catalog.objective,
    'active',
    current_date,
    true
  )
  returning id into v_program_id;

  insert into vital.program_versions (
    user_id,
    program_id,
    version_number,
    archetype,
    generated_from,
    rules_snapshot,
    is_active
  )
  values (
    v_user_id,
    v_program_id,
    1,
    coalesce(v_catalog.metadata ->> 'archetype', v_catalog.key),
    jsonb_build_object('source', 'starter_catalog', 'starter_key', v_catalog.key),
    '{}'::jsonb,
    true
  )
  returning id into v_program_version_id;

  insert into vital.task_templates (
    user_id,
    program_version_id,
    task_type,
    title,
    recurrence_rule,
    ordering,
    estimated_minutes,
    payload,
    is_active
  )
  select
    v_user_id,
    v_program_version_id,
    spt.task_type,
    spt.title,
    jsonb_build_object('type', 'weekly', 'days', jsonb_build_array(spt.day_of_week)),
    spt.ordering,
    spt.estimated_minutes,
    spt.payload,
    true
  from vital.starter_program_tasks spt
  where spt.starter_key = v_catalog.key;

  get diagnostics v_templates_created = row_count;

  return query
  select v_program_id, v_program_version_id, v_templates_created;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.get_safety_status()
 RETURNS TABLE(risk_level text, blocked_modules jsonb, requires_professional_check boolean, updated_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  select
    coalesce(si.risk_level, 'low') as risk_level,
    coalesce(si.blocked_modules, '[]'::jsonb) as blocked_modules,
    coalesce(si.requires_professional_check, false) as requires_professional_check,
    si.updated_at
  from vital.safety_intake si
  where si.user_id = auth.uid()
  union all
  select 'low', '[]'::jsonb, false, null
  where not exists (select 1 from vital.safety_intake x where x.user_id = auth.uid())
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION vital.get_user_module_preferences()
 RETURNS TABLE(module_key text, is_enabled boolean, config jsonb)
 LANGUAGE sql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  with base as (
    select key as module_key
    from vital.module_catalog
    where is_active
  )
  select
    b.module_key,
    coalesce(ump.is_enabled, b.module_key = 'training') as is_enabled,
    coalesce(ump.config, '{}'::jsonb) as config
  from base b
  left join vital.user_module_preferences ump
    on ump.user_id = auth.uid()
   and ump.module_key = b.module_key
  order by b.module_key;
$function$
;

CREATE OR REPLACE FUNCTION vital.is_feature_enabled(p_flag_key text, p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  with base as (
    select ff.enabled_by_default
    from vital.feature_flags ff
    where ff.key = p_flag_key
  ),
  override as (
    select uff.enabled
    from vital.user_feature_flags uff
    where uff.flag_key = p_flag_key
      and uff.user_id = p_user_id
  )
  select coalesce((select enabled from override), (select enabled_by_default from base), false);
$function$
;

CREATE OR REPLACE FUNCTION vital.is_service_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$function$
;

CREATE OR REPLACE FUNCTION vital.is_squad_member(target_squad_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  select exists (
    select 1
    from vital.squad_memberships sm
    where sm.squad_id = target_squad_id
      and sm.user_id = auth.uid()
      and sm.active
  );
$function$
;

CREATE OR REPLACE FUNCTION vital.is_vital_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  select exists (
    select 1
    from vital.admin_users au
    where au.user_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION vital.list_module_catalog()
 RETURNS SETOF vital.module_catalog
 LANGUAGE sql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  select *
  from vital.module_catalog
  where is_active
  order by key;
$function$
;

CREATE OR REPLACE FUNCTION vital.list_notification_plans()
 RETURNS SETOF vital.notification_plans
 LANGUAGE sql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  select np.*
  from vital.notification_plans np
  where np.user_id = auth.uid()
  order by np.task_type asc;
$function$
;

CREATE OR REPLACE FUNCTION vital.list_starter_programs()
 RETURNS SETOF vital.starter_program_catalog
 LANGUAGE sql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  select *
  from vital.starter_program_catalog
  where is_active
  order by days_per_week asc, key asc;
$function$
;

CREATE OR REPLACE FUNCTION vital.reprogram_task_instance(p_task_instance_id uuid, p_new_date date)
 RETURNS vital.task_instances
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_row vital.task_instances;
begin
  if p_new_date is null then
    raise exception 'p_new_date is required';
  end if;

  begin
    update vital.task_instances ti
    set
      task_date = p_new_date,
      status = 'pending',
      snooze_until = null,
      completed_at = null,
      updated_at = now()
    where ti.id = p_task_instance_id
      and ti.user_id = auth.uid()
    returning ti.* into v_row;
  exception
    when unique_violation then
      raise exception 'task already exists for template and date';
  end;

  if v_row.id is null then
    raise exception 'task_instance not found or access denied';
  end if;

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.set_task_completion_minlog(p_task_instance_id uuid, p_done boolean, p_rpe_simple numeric DEFAULT NULL::numeric, p_weight_kg numeric DEFAULT NULL::numeric)
 RETURNS vital.task_instances
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_row vital.task_instances;
  v_payload jsonb := '{}'::jsonb;
begin
  if p_rpe_simple is not null and (p_rpe_simple < 0 or p_rpe_simple > 10) then
    raise exception 'p_rpe_simple must be between 0 and 10';
  end if;

  if p_weight_kg is not null and p_weight_kg <= 0 then
    raise exception 'p_weight_kg must be greater than 0';
  end if;

  v_payload := jsonb_build_object('done', coalesce(p_done, false));
  if p_rpe_simple is not null then
    v_payload := v_payload || jsonb_build_object('rpe_simple', p_rpe_simple);
  end if;
  if p_weight_kg is not null then
    v_payload := v_payload || jsonb_build_object('weight_kg', p_weight_kg);
  end if;

  update vital.task_instances ti
  set
    status = case when coalesce(p_done, false) then 'completed'::vital.task_status else 'pending'::vital.task_status end,
    completed_at = case when coalesce(p_done, false) then now() else null end,
    completion_payload = coalesce(ti.completion_payload, '{}'::jsonb) || v_payload,
    updated_at = now()
  where ti.id = p_task_instance_id
    and ti.user_id = auth.uid()
  returning ti.* into v_row;

  if v_row.id is null then
    raise exception 'task_instance not found or access denied';
  end if;

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION vital.should_materialize_on_date(p_rule jsonb, p_target_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_type text := coalesce(nullif(trim(p_rule ->> 'type'), ''), 'daily');
  v_dow int := extract(isodow from p_target_date);
  v_anchor date := coalesce((p_rule ->> 'anchor_date')::date, p_target_date);
begin
  if v_type = 'daily' then
    return true;
  elsif v_type = 'weekly' then
    if jsonb_typeof(p_rule -> 'days') = 'array' then
      return exists (
        select 1
        from jsonb_array_elements_text(p_rule -> 'days') d
        where d::int = v_dow
      );
    end if;
    return false;
  elsif v_type = 'every_other_day' then
    return mod((p_target_date - v_anchor), 2) = 0;
  elsif v_type = 'flexible_within_week' then
    if jsonb_typeof(p_rule -> 'days') = 'array' then
      return exists (
        select 1
        from jsonb_array_elements_text(p_rule -> 'days') d
        where d::int = v_dow
      );
    end if;
    -- Default flexible behavior: weekdays.
    return v_dow between 1 and 5;
  end if;

  -- Unknown rule type: fail safe to avoid silent materialization.
  return false;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.snooze_task_instance(p_task_instance_id uuid, p_snooze_until timestamp with time zone)
 RETURNS vital.task_instances
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_row vital.task_instances;
begin
  if p_snooze_until is null then
    raise exception 'p_snooze_until is required';
  end if;

  update vital.task_instances ti
  set
    status = 'snoozed',
    snooze_until = p_snooze_until,
    updated_at = now()
  where ti.id = p_task_instance_id
    and ti.user_id = auth.uid()
  returning ti.* into v_row;

  if v_row.id is null then
    raise exception 'task_instance not found or access denied';
  end if;

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.submit_safety_intake(p_payload jsonb)
 RETURNS vital.safety_intake
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_chest_pain boolean := coalesce((v_payload ->> 'chest_pain')::boolean, false);
  v_dizziness boolean := coalesce((v_payload ->> 'dizziness')::boolean, false);
  v_severe_injury boolean := coalesce((v_payload ->> 'severe_injury')::boolean, false);
  v_post_surgery boolean := coalesce((v_payload ->> 'post_surgery')::boolean, false);
  v_pregnancy_risk boolean := coalesce((v_payload ->> 'pregnancy_risk')::boolean, false);
  v_risk_level text := 'low';
  v_blocked_modules jsonb := '[]'::jsonb;
  v_row vital.safety_intake;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if v_chest_pain or v_dizziness or v_severe_injury or v_post_surgery or v_pregnancy_risk then
    v_risk_level := 'critical';
    v_blocked_modules := '["training"]'::jsonb;
  elsif coalesce((v_payload ->> 'joint_pain')::boolean, false) then
    v_risk_level := 'high';
    v_blocked_modules := '["training"]'::jsonb;
  elsif coalesce((v_payload ->> 'chronic_condition')::boolean, false) then
    v_risk_level := 'medium';
  end if;

  insert into vital.safety_intake (
    user_id,
    intake_payload,
    risk_level,
    blocked_modules,
    requires_professional_check
  )
  values (
    v_user_id,
    v_payload,
    v_risk_level,
    v_blocked_modules,
    v_risk_level in ('high', 'critical')
  )
  on conflict (user_id) do update
  set
    intake_payload = excluded.intake_payload,
    risk_level = excluded.risk_level,
    blocked_modules = excluded.blocked_modules,
    requires_professional_check = excluded.requires_professional_check,
    updated_at = now()
  returning * into v_row;

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.today_feed(p_target_date date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date)
 RETURNS TABLE(id uuid, user_id uuid, task_template_id uuid, task_date date, status vital.task_status, priority smallint, module_key text, task_type text, title text, estimated_minutes smallint, ordering smallint, template_payload jsonb, completion_payload jsonb, priority_score integer, reason_code text, reason_text text, safety_state text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  perform 1 from vital.today_tasks(p_target_date);

  return query
  with scores as (
    select *
    from vital.compute_hoy_scores(p_target_date)
  )
  select
    ti.id,
    ti.user_id,
    ti.task_template_id,
    ti.task_date,
    ti.status,
    ti.priority,
    ti.module_key,
    tt.task_type,
    tt.title,
    tt.estimated_minutes,
    tt.ordering,
    tt.payload as template_payload,
    ti.completion_payload,
    s.priority_score,
    s.reason_code,
    s.reason_text,
    s.safety_state,
    ti.created_at,
    ti.updated_at
  from vital.task_instances ti
  join vital.task_templates tt
    on tt.id = ti.task_template_id
   and tt.user_id = ti.user_id
  join scores s
    on s.task_instance_id = ti.id
  where ti.user_id = v_user_id
    and ti.task_date = p_target_date
  order by
    case when s.safety_state = 'blocked' then 1 else 0 end asc,
    s.priority_score desc,
    tt.ordering asc,
    ti.created_at asc;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.today_notification_intents(p_target_date date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date)
 RETURNS TABLE(task_instance_id uuid, task_type text, title text, notify_at timestamp with time zone, schedule_type text)
 LANGUAGE sql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
  with ctx as (
    select coalesce(up.timezone, 'UTC') as tz
    from vital.user_profiles up
    where up.user_id = auth.uid()
  )
  select
    t.id as task_instance_id,
    t.task_type,
    t.title,
    case
      when np.schedule ->> 'type' = 'fixed_time' then
        make_timestamptz(
          extract(year from p_target_date)::int,
          extract(month from p_target_date)::int,
          extract(day from p_target_date)::int,
          (np.schedule ->> 'hour')::int,
          (np.schedule ->> 'minute')::int,
          0,
          coalesce(np.schedule ->> 'timezone', (select tz from ctx), 'UTC')
        )
      when np.schedule ->> 'type' = 'relative_to_window'
           and t.window_start is not null then
        t.window_start + make_interval(mins => (np.schedule ->> 'offset_minutes')::int)
      else null
    end as notify_at,
    np.schedule ->> 'type' as schedule_type
  from vital.today_tasks(p_target_date) t
  join vital.notification_plans np
    on np.user_id = t.user_id
   and np.task_type = t.task_type
   and np.enabled
  where t.user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION vital.today_tasks(p_target_date date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date)
 RETURNS TABLE(id uuid, user_id uuid, task_template_id uuid, task_date date, status vital.task_status, priority smallint, window_start timestamp with time zone, window_end timestamp with time zone, snooze_until timestamp with time zone, completed_at timestamp with time zone, completion_payload jsonb, task_type text, title text, estimated_minutes smallint, ordering smallint, template_payload jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  insert into vital.task_instances (
    user_id,
    task_template_id,
    module_key,
    task_date,
    status,
    priority
  )
  select
    tt.user_id,
    tt.id,
    tt.module_key,
    p_target_date,
    'pending'::vital.task_status,
    50::smallint
  from vital.task_templates tt
  join vital.program_versions pv
    on pv.id = tt.program_version_id
   and pv.user_id = tt.user_id
   and pv.is_active
  join vital.programs p
    on p.id = pv.program_id
   and p.user_id = pv.user_id
   and p.is_active
  where tt.user_id = v_user_id
    and tt.is_active
    and vital.should_materialize_on_date(tt.recurrence_rule, p_target_date)
    and not exists (
      select 1
      from vital.task_instances ti
      where ti.task_template_id = tt.id
        and ti.task_date = p_target_date
    );

  return query
  select
    ti.id,
    ti.user_id,
    ti.task_template_id,
    ti.task_date,
    ti.status,
    ti.priority,
    ti.window_start,
    ti.window_end,
    ti.snooze_until,
    ti.completed_at,
    ti.completion_payload,
    tt.task_type,
    tt.title,
    tt.estimated_minutes,
    tt.ordering,
    tt.payload as template_payload,
    ti.created_at,
    ti.updated_at
  from vital.task_instances ti
  join vital.task_templates tt
    on tt.id = ti.task_template_id
   and tt.user_id = ti.user_id
  where ti.user_id = v_user_id
    and ti.task_date = p_target_date
  order by ti.priority desc, tt.ordering asc, ti.created_at asc;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.track_event(p_event_name text, p_payload jsonb DEFAULT '{}'::jsonb, p_source text DEFAULT 'app'::text, p_occurred_at timestamp with time zone DEFAULT now(), p_event_version text DEFAULT 'v1'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if p_event_name is null or btrim(p_event_name) = '' then
    raise exception 'p_event_name is required';
  end if;

  insert into vital.telemetry_events (
    user_id,
    event_name,
    event_version,
    source,
    occurred_at,
    payload
  )
  values (
    v_user_id,
    p_event_name,
    coalesce(nullif(btrim(p_event_version), ''), 'v1'),
    coalesce(nullif(btrim(p_source), ''), 'app'),
    coalesce(p_occurred_at, now()),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.upsert_notification_plan(p_task_type text, p_schedule jsonb, p_enabled boolean DEFAULT true)
 RETURNS vital.notification_plans
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_row vital.notification_plans;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_task_type is null or btrim(p_task_type) = '' then
    raise exception 'p_task_type is required';
  end if;

  if not vital.validate_notification_schedule(p_schedule) then
    raise exception 'invalid notification schedule payload';
  end if;

  insert into vital.notification_plans (
    user_id,
    task_type,
    schedule,
    enabled
  )
  values (
    v_user_id,
    p_task_type,
    p_schedule,
    coalesce(p_enabled, true)
  )
  on conflict (user_id, task_type)
  do update set
    schedule = excluded.schedule,
    enabled = excluded.enabled,
    updated_at = now()
  returning * into v_row;

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.upsert_user_feature_flag(p_flag_key text, p_enabled boolean, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS vital.user_feature_flags
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_row vital.user_feature_flags;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_flag_key is null or btrim(p_flag_key) = '' then
    raise exception 'p_flag_key is required';
  end if;

  insert into vital.user_feature_flags (
    user_id,
    flag_key,
    enabled,
    metadata
  )
  values (
    v_user_id,
    p_flag_key,
    p_enabled,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, flag_key)
  do update set
    enabled = excluded.enabled,
    metadata = excluded.metadata,
    updated_at = now()
  returning * into v_row;

  return v_row;
end
$function$
;

CREATE OR REPLACE FUNCTION vital.upsert_user_module_preferences(p_modules jsonb)
 RETURNS TABLE(module_key text, is_enabled boolean, config jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'vital', 'auth'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_modules is null or jsonb_typeof(p_modules) <> 'array' then
    raise exception 'p_modules must be a jsonb array';
  end if;

  insert into vital.user_module_preferences (user_id, module_key, is_enabled, config)
  select
    v_user_id,
    (elem ->> 'module_key')::text as module_key,
    coalesce((elem ->> 'is_enabled')::boolean, false) as is_enabled,
    coalesce(elem -> 'config', '{}'::jsonb) as config
  from jsonb_array_elements(p_modules) as elem
  where elem ? 'module_key'
    and exists (
      select 1
      from vital.module_catalog mc
      where mc.key = (elem ->> 'module_key')
    )
  on conflict on constraint user_module_preferences_pkey do update
  set
    is_enabled = excluded.is_enabled,
    config = excluded.config,
    updated_at = now();

  return query
  select *
  from vital.get_user_module_preferences();
end
$function$
;

CREATE OR REPLACE FUNCTION vital.validate_notification_schedule(p_schedule jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_type text := coalesce(nullif(trim(p_schedule ->> 'type'), ''), '');
  v_hour int;
  v_minute int;
  v_offset int;
begin
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object' then
    return false;
  end if;

  if v_type = 'fixed_time' then
    v_hour := (p_schedule ->> 'hour')::int;
    v_minute := (p_schedule ->> 'minute')::int;
    return v_hour between 0 and 23 and v_minute between 0 and 59;
  elsif v_type = 'relative_to_window' then
    v_offset := (p_schedule ->> 'offset_minutes')::int;
    return v_offset between -720 and 720;
  end if;

  return false;
exception
  when others then
    return false;
end
$function$
;

CREATE OR REPLACE FUNCTION public._set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END$function$
;

CREATE OR REPLACE FUNCTION public._vento_norm(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT regexp_replace(trim(coalesce($1,'')), '\s+', ' ', 'g')
$function$
;

CREATE OR REPLACE FUNCTION public._vento_slugify(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT trim(both '-' from regexp_replace(lower(coalesce($1,'')), '[^a-z0-9]+', '-', 'g'))
$function$
;

CREATE OR REPLACE FUNCTION public._vento_uuid_from_text(input text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT (
    substr(md5(coalesce($1,'')), 1, 8)  || '-' ||
    substr(md5(coalesce($1,'')), 9, 4)  || '-' ||
    substr(md5(coalesce($1,'')), 13, 4) || '-' ||
    substr(md5(coalesce($1,'')), 17, 4) || '-' ||
    substr(md5(coalesce($1,'')), 21, 12)
  )::uuid
$function$
;

CREATE OR REPLACE FUNCTION public.anonymize_user_personal_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.users
  SET
    full_name = 'Deleted User',
    document_id = NULL,
    document_type = NULL,
    phone = NULL,
    email = CONCAT('deleted+', SUBSTRING(p_user_id::text, 1, 8), '@deleted.local'),
    birth_date = NULL,
    is_active = false,
    is_client = false,
    marketing_opt_in = false,
    has_reviewed_google = false,
    last_review_prompt_date = NULL,
    updated_at = now()
  WHERE id = p_user_id;

  DELETE FROM public.user_favorites WHERE user_id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_area(p_area_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_recipe_scope(p_site_id uuid, p_area_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.is_owner()
    or public.is_global_manager()
    or (
      public.current_employee_role() = any (array['gerente'::text, 'bodeguero'::text])
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
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_site(p_site_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select
    case
      when p_site_id is null then false
      when is_owner() then true
      when is_global_manager() then true
      when exists (
        select 1
        from public.employee_sites es
        where es.employee_id = auth.uid()
          and es.site_id = p_site_id
          and es.is_active = true
      ) then true
      when exists (
        select 1
        from public.employees e
        where e.id = auth.uid()
          and e.site_id = p_site_id
          and (e.is_active is true or e.is_active is null)
      ) then true
      else false
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_employee_area_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select public.current_employee_selected_area_id();
$function$
;

CREATE OR REPLACE FUNCTION public.current_employee_primary_site_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.current_employee_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select e.role
  from public.employees e
  where e.id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.current_employee_selected_area_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.current_employee_selected_site_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select coalesce(
    (
      select s.selected_site_id
      from public.employee_settings s
      where s.employee_id = auth.uid()
    ),
    public.current_employee_primary_site_id()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.current_employee_site_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select public.current_employee_selected_site_id();
$function$
;

CREATE OR REPLACE FUNCTION public.device_info_has_blocking_warnings(di jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_attendance_geofence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_site record;
  v_emp record;

  v_requires_geo boolean;
  v_max_acc integer;
  v_radius integer;

  v_distance double precision;
  v_accuracy double precision;
  v_is_assigned boolean;
begin
  if new.source <> 'system' then
    new.occurred_at := now();
  end if;

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

  if new.action = 'check_in' then
    v_is_assigned := (v_emp.site_id is not distinct from new.site_id)
      or exists (
        select 1
        from public.employee_sites es
        where es.employee_id = new.employee_id
          and es.site_id = new.site_id
          and es.is_active = true
      );

    if not v_is_assigned then
      raise exception 'No autorizado: check-in solo permitido en tu sede asignada';
    end if;
  end if;

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

  if new.source = 'system' then
    return new;
  end if;

  if v_site.type <> 'vento_group' then
    if v_site.latitude is null or v_site.longitude is null then
      raise exception 'Configuracion invalida: la sede % no tiene coordenadas', v_site.name;
    end if;
    if v_site.checkin_radius_meters is null or v_site.checkin_radius_meters <= 0 then
      raise exception 'Configuracion invalida: la sede % no tiene radio de check-in configurado', v_site.name;
    end if;
    v_requires_geo := true;
  else
    v_requires_geo := false;
  end if;

  if v_requires_geo then
    if new.latitude is null or new.longitude is null or new.accuracy_meters is null then
      raise exception 'Ubicacion requerida para registrar asistencia';
    end if;

    if public.device_info_has_blocking_warnings(new.device_info) then
      raise exception 'Ubicacion no valida: senales de ubicacion simulada detectadas';
    end if;

    if new.action = 'check_in' then
      v_max_acc := 20;
    elsif new.action = 'check_out' then
      v_max_acc := 25;
    else
      raise exception 'Accion invalida: %', new.action;
    end if;

    v_radius := v_site.checkin_radius_meters;
    v_accuracy := new.accuracy_meters::double precision;

    if v_accuracy > v_max_acc then
      raise exception 'Precision GPS insuficiente: %m (maximo %m)', round(v_accuracy), v_max_acc;
    end if;

    v_distance := public.haversine_m(new.latitude, new.longitude, v_site.latitude, v_site.longitude);

    if (v_distance + v_accuracy) > v_radius then
      raise exception 'Fuera de rango: %m (precision %m) > radio %m',
        round(v_distance), round(v_accuracy), v_radius;
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_attendance_sequence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_employee_role_site()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  st public.site_type;
begin
  select s.site_type into st
  from public.sites s
  where s.id = new.site_id;

  if st is null then
    raise exception 'site_id invalido o sede sin site_type';
  end if;

  if not exists (
    select 1
    from public.role_site_type_rules r
    where r.role = new.role
      and r.site_type = st
      and r.is_allowed = true
  ) then
    raise exception 'Rol "%" no permitido para site_type="%"', new.role, st;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_location_code(p_site_code text, p_zone text, p_aisle text DEFAULT NULL::text, p_level text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.generate_lpn_code(p_site_code text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_year_month TEXT;
  v_seq INT;
BEGIN
  v_year_month := TO_CHAR(NOW(), 'YYMM');
  v_seq := NEXTVAL('lpn_sequence');
  RETURN 'LPN-' || UPPER(p_site_code) || '-' || v_year_month || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_product_sku(p_product_type text, p_site_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_total_earned_points()
 RETURNS TABLE(total_earned bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(lt.points_delta), 0)::bigint as total_earned
  from public.loyalty_transactions lt
  where lt.user_id = auth.uid()
    and lt.kind = 'earn';
$function$
;

CREATE OR REPLACE FUNCTION public.grant_loyalty_points(p_user_id uuid, p_points integer, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.users (id, email, full_name, loyalty_points)
  VALUES (new.id, new.email, '', 0)
  ON CONFLICT (id) DO NOTHING; -- Evita errores si ya existe
  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.haversine_m(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select 2 * 6371000::double precision *
    asin(
      sqrt(
        power(sin((((lat2::double precision - lat1::double precision) * pi()) / 180) / 2), 2) +
        cos((lat1::double precision * pi()) / 180) *
        cos((lat2::double precision * pi()) / 180) *
        power(sin((((lon2::double precision - lon1::double precision) * pi()) / 180) / 2), 2)
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_active_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select public.is_employee();
$function$
;

CREATE OR REPLACE FUNCTION public.is_employee()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select exists (
    select 1
    from public.employees e
    where e.id = auth.uid()
      and coalesce(e.is_active, true) = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_global_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select public.current_employee_role() = 'gerente_general';
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select public.current_employee_role() = 'gerente';
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager_or_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select public.current_employee_role() in ('propietario', 'gerente', 'gerente_general');
$function$
;

CREATE OR REPLACE FUNCTION public.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  select public.current_employee_role() = 'propietario';
$function$
;

CREATE OR REPLACE FUNCTION public.process_loyalty_earning(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.process_order_payment(p_order_id uuid, p_site_id uuid, p_payment_method text, p_payment_reference text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_purchase_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_product_sku_brand_code(p_site_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_product_sku_type_code(p_product_type text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_product_sku()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.sku is null or btrim(new.sku) = '' then
    new.sku := public.generate_product_sku(new.product_type, null);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_employee_shifts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_loyalty_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.util_column_usage(p_table regclass)
 RETURNS TABLE(column_name text, non_null_count bigint, total_count bigint, pct_non_null numeric)
 LANGUAGE plpgsql
AS $function$
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
end $function$
;

grant delete on table "public"."announcements" to "anon";

grant insert on table "public"."announcements" to "anon";

grant references on table "public"."announcements" to "anon";

grant select on table "public"."announcements" to "anon";

grant trigger on table "public"."announcements" to "anon";

grant truncate on table "public"."announcements" to "anon";

grant update on table "public"."announcements" to "anon";

grant delete on table "public"."announcements" to "authenticated";

grant insert on table "public"."announcements" to "authenticated";

grant references on table "public"."announcements" to "authenticated";

grant select on table "public"."announcements" to "authenticated";

grant trigger on table "public"."announcements" to "authenticated";

grant truncate on table "public"."announcements" to "authenticated";

grant update on table "public"."announcements" to "authenticated";

grant delete on table "public"."announcements" to "service_role";

grant insert on table "public"."announcements" to "service_role";

grant references on table "public"."announcements" to "service_role";

grant select on table "public"."announcements" to "service_role";

grant trigger on table "public"."announcements" to "service_role";

grant truncate on table "public"."announcements" to "service_role";

grant update on table "public"."announcements" to "service_role";

grant delete on table "public"."app_permissions" to "anon";

grant insert on table "public"."app_permissions" to "anon";

grant references on table "public"."app_permissions" to "anon";

grant select on table "public"."app_permissions" to "anon";

grant trigger on table "public"."app_permissions" to "anon";

grant truncate on table "public"."app_permissions" to "anon";

grant update on table "public"."app_permissions" to "anon";

grant delete on table "public"."app_permissions" to "authenticated";

grant insert on table "public"."app_permissions" to "authenticated";

grant references on table "public"."app_permissions" to "authenticated";

grant select on table "public"."app_permissions" to "authenticated";

grant trigger on table "public"."app_permissions" to "authenticated";

grant truncate on table "public"."app_permissions" to "authenticated";

grant update on table "public"."app_permissions" to "authenticated";

grant delete on table "public"."app_permissions" to "service_role";

grant insert on table "public"."app_permissions" to "service_role";

grant references on table "public"."app_permissions" to "service_role";

grant select on table "public"."app_permissions" to "service_role";

grant trigger on table "public"."app_permissions" to "service_role";

grant truncate on table "public"."app_permissions" to "service_role";

grant update on table "public"."app_permissions" to "service_role";

grant delete on table "public"."apps" to "anon";

grant insert on table "public"."apps" to "anon";

grant references on table "public"."apps" to "anon";

grant select on table "public"."apps" to "anon";

grant trigger on table "public"."apps" to "anon";

grant truncate on table "public"."apps" to "anon";

grant update on table "public"."apps" to "anon";

grant delete on table "public"."apps" to "authenticated";

grant insert on table "public"."apps" to "authenticated";

grant references on table "public"."apps" to "authenticated";

grant select on table "public"."apps" to "authenticated";

grant trigger on table "public"."apps" to "authenticated";

grant truncate on table "public"."apps" to "authenticated";

grant update on table "public"."apps" to "authenticated";

grant delete on table "public"."apps" to "service_role";

grant insert on table "public"."apps" to "service_role";

grant references on table "public"."apps" to "service_role";

grant select on table "public"."apps" to "service_role";

grant trigger on table "public"."apps" to "service_role";

grant truncate on table "public"."apps" to "service_role";

grant update on table "public"."apps" to "service_role";

grant delete on table "public"."area_kinds" to "anon";

grant insert on table "public"."area_kinds" to "anon";

grant references on table "public"."area_kinds" to "anon";

grant select on table "public"."area_kinds" to "anon";

grant trigger on table "public"."area_kinds" to "anon";

grant truncate on table "public"."area_kinds" to "anon";

grant update on table "public"."area_kinds" to "anon";

grant delete on table "public"."area_kinds" to "authenticated";

grant insert on table "public"."area_kinds" to "authenticated";

grant references on table "public"."area_kinds" to "authenticated";

grant select on table "public"."area_kinds" to "authenticated";

grant trigger on table "public"."area_kinds" to "authenticated";

grant truncate on table "public"."area_kinds" to "authenticated";

grant update on table "public"."area_kinds" to "authenticated";

grant delete on table "public"."area_kinds" to "service_role";

grant insert on table "public"."area_kinds" to "service_role";

grant references on table "public"."area_kinds" to "service_role";

grant select on table "public"."area_kinds" to "service_role";

grant trigger on table "public"."area_kinds" to "service_role";

grant truncate on table "public"."area_kinds" to "service_role";

grant update on table "public"."area_kinds" to "service_role";

grant delete on table "public"."attendance_breaks" to "anon";

grant insert on table "public"."attendance_breaks" to "anon";

grant references on table "public"."attendance_breaks" to "anon";

grant select on table "public"."attendance_breaks" to "anon";

grant trigger on table "public"."attendance_breaks" to "anon";

grant truncate on table "public"."attendance_breaks" to "anon";

grant update on table "public"."attendance_breaks" to "anon";

grant delete on table "public"."attendance_breaks" to "authenticated";

grant insert on table "public"."attendance_breaks" to "authenticated";

grant references on table "public"."attendance_breaks" to "authenticated";

grant select on table "public"."attendance_breaks" to "authenticated";

grant trigger on table "public"."attendance_breaks" to "authenticated";

grant truncate on table "public"."attendance_breaks" to "authenticated";

grant update on table "public"."attendance_breaks" to "authenticated";

grant delete on table "public"."attendance_breaks" to "service_role";

grant insert on table "public"."attendance_breaks" to "service_role";

grant references on table "public"."attendance_breaks" to "service_role";

grant select on table "public"."attendance_breaks" to "service_role";

grant trigger on table "public"."attendance_breaks" to "service_role";

grant truncate on table "public"."attendance_breaks" to "service_role";

grant update on table "public"."attendance_breaks" to "service_role";

grant delete on table "public"."attendance_shift_events" to "anon";

grant insert on table "public"."attendance_shift_events" to "anon";

grant references on table "public"."attendance_shift_events" to "anon";

grant select on table "public"."attendance_shift_events" to "anon";

grant trigger on table "public"."attendance_shift_events" to "anon";

grant truncate on table "public"."attendance_shift_events" to "anon";

grant update on table "public"."attendance_shift_events" to "anon";

grant delete on table "public"."attendance_shift_events" to "authenticated";

grant insert on table "public"."attendance_shift_events" to "authenticated";

grant references on table "public"."attendance_shift_events" to "authenticated";

grant select on table "public"."attendance_shift_events" to "authenticated";

grant trigger on table "public"."attendance_shift_events" to "authenticated";

grant truncate on table "public"."attendance_shift_events" to "authenticated";

grant update on table "public"."attendance_shift_events" to "authenticated";

grant delete on table "public"."attendance_shift_events" to "service_role";

grant insert on table "public"."attendance_shift_events" to "service_role";

grant references on table "public"."attendance_shift_events" to "service_role";

grant select on table "public"."attendance_shift_events" to "service_role";

grant trigger on table "public"."attendance_shift_events" to "service_role";

grant truncate on table "public"."attendance_shift_events" to "service_role";

grant update on table "public"."attendance_shift_events" to "service_role";

grant delete on table "public"."document_types" to "anon";

grant insert on table "public"."document_types" to "anon";

grant references on table "public"."document_types" to "anon";

grant select on table "public"."document_types" to "anon";

grant trigger on table "public"."document_types" to "anon";

grant truncate on table "public"."document_types" to "anon";

grant update on table "public"."document_types" to "anon";

grant delete on table "public"."document_types" to "authenticated";

grant insert on table "public"."document_types" to "authenticated";

grant references on table "public"."document_types" to "authenticated";

grant select on table "public"."document_types" to "authenticated";

grant trigger on table "public"."document_types" to "authenticated";

grant truncate on table "public"."document_types" to "authenticated";

grant update on table "public"."document_types" to "authenticated";

grant delete on table "public"."document_types" to "service_role";

grant insert on table "public"."document_types" to "service_role";

grant references on table "public"."document_types" to "service_role";

grant select on table "public"."document_types" to "service_role";

grant trigger on table "public"."document_types" to "service_role";

grant truncate on table "public"."document_types" to "service_role";

grant update on table "public"."document_types" to "service_role";

grant delete on table "public"."documents" to "anon";

grant insert on table "public"."documents" to "anon";

grant references on table "public"."documents" to "anon";

grant select on table "public"."documents" to "anon";

grant trigger on table "public"."documents" to "anon";

grant truncate on table "public"."documents" to "anon";

grant update on table "public"."documents" to "anon";

grant delete on table "public"."documents" to "authenticated";

grant insert on table "public"."documents" to "authenticated";

grant references on table "public"."documents" to "authenticated";

grant select on table "public"."documents" to "authenticated";

grant trigger on table "public"."documents" to "authenticated";

grant truncate on table "public"."documents" to "authenticated";

grant update on table "public"."documents" to "authenticated";

grant delete on table "public"."documents" to "service_role";

grant insert on table "public"."documents" to "service_role";

grant references on table "public"."documents" to "service_role";

grant select on table "public"."documents" to "service_role";

grant trigger on table "public"."documents" to "service_role";

grant truncate on table "public"."documents" to "service_role";

grant update on table "public"."documents" to "service_role";

grant delete on table "public"."employee_devices" to "anon";

grant insert on table "public"."employee_devices" to "anon";

grant references on table "public"."employee_devices" to "anon";

grant select on table "public"."employee_devices" to "anon";

grant trigger on table "public"."employee_devices" to "anon";

grant truncate on table "public"."employee_devices" to "anon";

grant update on table "public"."employee_devices" to "anon";

grant delete on table "public"."employee_devices" to "authenticated";

grant insert on table "public"."employee_devices" to "authenticated";

grant references on table "public"."employee_devices" to "authenticated";

grant select on table "public"."employee_devices" to "authenticated";

grant trigger on table "public"."employee_devices" to "authenticated";

grant truncate on table "public"."employee_devices" to "authenticated";

grant update on table "public"."employee_devices" to "authenticated";

grant delete on table "public"."employee_devices" to "service_role";

grant insert on table "public"."employee_devices" to "service_role";

grant references on table "public"."employee_devices" to "service_role";

grant select on table "public"."employee_devices" to "service_role";

grant trigger on table "public"."employee_devices" to "service_role";

grant truncate on table "public"."employee_devices" to "service_role";

grant update on table "public"."employee_devices" to "service_role";

grant delete on table "public"."employee_permissions" to "anon";

grant insert on table "public"."employee_permissions" to "anon";

grant references on table "public"."employee_permissions" to "anon";

grant select on table "public"."employee_permissions" to "anon";

grant trigger on table "public"."employee_permissions" to "anon";

grant truncate on table "public"."employee_permissions" to "anon";

grant update on table "public"."employee_permissions" to "anon";

grant delete on table "public"."employee_permissions" to "authenticated";

grant insert on table "public"."employee_permissions" to "authenticated";

grant references on table "public"."employee_permissions" to "authenticated";

grant select on table "public"."employee_permissions" to "authenticated";

grant trigger on table "public"."employee_permissions" to "authenticated";

grant truncate on table "public"."employee_permissions" to "authenticated";

grant update on table "public"."employee_permissions" to "authenticated";

grant delete on table "public"."employee_permissions" to "service_role";

grant insert on table "public"."employee_permissions" to "service_role";

grant references on table "public"."employee_permissions" to "service_role";

grant select on table "public"."employee_permissions" to "service_role";

grant trigger on table "public"."employee_permissions" to "service_role";

grant truncate on table "public"."employee_permissions" to "service_role";

grant update on table "public"."employee_permissions" to "service_role";

grant delete on table "public"."employee_push_tokens" to "anon";

grant insert on table "public"."employee_push_tokens" to "anon";

grant references on table "public"."employee_push_tokens" to "anon";

grant select on table "public"."employee_push_tokens" to "anon";

grant trigger on table "public"."employee_push_tokens" to "anon";

grant truncate on table "public"."employee_push_tokens" to "anon";

grant update on table "public"."employee_push_tokens" to "anon";

grant delete on table "public"."employee_push_tokens" to "authenticated";

grant insert on table "public"."employee_push_tokens" to "authenticated";

grant references on table "public"."employee_push_tokens" to "authenticated";

grant select on table "public"."employee_push_tokens" to "authenticated";

grant trigger on table "public"."employee_push_tokens" to "authenticated";

grant truncate on table "public"."employee_push_tokens" to "authenticated";

grant update on table "public"."employee_push_tokens" to "authenticated";

grant delete on table "public"."employee_push_tokens" to "service_role";

grant insert on table "public"."employee_push_tokens" to "service_role";

grant references on table "public"."employee_push_tokens" to "service_role";

grant select on table "public"."employee_push_tokens" to "service_role";

grant trigger on table "public"."employee_push_tokens" to "service_role";

grant truncate on table "public"."employee_push_tokens" to "service_role";

grant update on table "public"."employee_push_tokens" to "service_role";

grant delete on table "public"."inventory_cost_policies" to "anon";

grant insert on table "public"."inventory_cost_policies" to "anon";

grant references on table "public"."inventory_cost_policies" to "anon";

grant select on table "public"."inventory_cost_policies" to "anon";

grant trigger on table "public"."inventory_cost_policies" to "anon";

grant truncate on table "public"."inventory_cost_policies" to "anon";

grant update on table "public"."inventory_cost_policies" to "anon";

grant delete on table "public"."inventory_cost_policies" to "authenticated";

grant insert on table "public"."inventory_cost_policies" to "authenticated";

grant references on table "public"."inventory_cost_policies" to "authenticated";

grant select on table "public"."inventory_cost_policies" to "authenticated";

grant trigger on table "public"."inventory_cost_policies" to "authenticated";

grant truncate on table "public"."inventory_cost_policies" to "authenticated";

grant update on table "public"."inventory_cost_policies" to "authenticated";

grant delete on table "public"."inventory_cost_policies" to "service_role";

grant insert on table "public"."inventory_cost_policies" to "service_role";

grant references on table "public"."inventory_cost_policies" to "service_role";

grant select on table "public"."inventory_cost_policies" to "service_role";

grant trigger on table "public"."inventory_cost_policies" to "service_role";

grant truncate on table "public"."inventory_cost_policies" to "service_role";

grant update on table "public"."inventory_cost_policies" to "service_role";

grant delete on table "public"."inventory_count_lines" to "anon";

grant insert on table "public"."inventory_count_lines" to "anon";

grant references on table "public"."inventory_count_lines" to "anon";

grant select on table "public"."inventory_count_lines" to "anon";

grant trigger on table "public"."inventory_count_lines" to "anon";

grant truncate on table "public"."inventory_count_lines" to "anon";

grant update on table "public"."inventory_count_lines" to "anon";

grant delete on table "public"."inventory_count_lines" to "authenticated";

grant insert on table "public"."inventory_count_lines" to "authenticated";

grant references on table "public"."inventory_count_lines" to "authenticated";

grant select on table "public"."inventory_count_lines" to "authenticated";

grant trigger on table "public"."inventory_count_lines" to "authenticated";

grant truncate on table "public"."inventory_count_lines" to "authenticated";

grant update on table "public"."inventory_count_lines" to "authenticated";

grant delete on table "public"."inventory_count_lines" to "service_role";

grant insert on table "public"."inventory_count_lines" to "service_role";

grant references on table "public"."inventory_count_lines" to "service_role";

grant select on table "public"."inventory_count_lines" to "service_role";

grant trigger on table "public"."inventory_count_lines" to "service_role";

grant truncate on table "public"."inventory_count_lines" to "service_role";

grant update on table "public"."inventory_count_lines" to "service_role";

grant delete on table "public"."inventory_count_sessions" to "anon";

grant insert on table "public"."inventory_count_sessions" to "anon";

grant references on table "public"."inventory_count_sessions" to "anon";

grant select on table "public"."inventory_count_sessions" to "anon";

grant trigger on table "public"."inventory_count_sessions" to "anon";

grant truncate on table "public"."inventory_count_sessions" to "anon";

grant update on table "public"."inventory_count_sessions" to "anon";

grant delete on table "public"."inventory_count_sessions" to "authenticated";

grant insert on table "public"."inventory_count_sessions" to "authenticated";

grant references on table "public"."inventory_count_sessions" to "authenticated";

grant select on table "public"."inventory_count_sessions" to "authenticated";

grant trigger on table "public"."inventory_count_sessions" to "authenticated";

grant truncate on table "public"."inventory_count_sessions" to "authenticated";

grant update on table "public"."inventory_count_sessions" to "authenticated";

grant delete on table "public"."inventory_count_sessions" to "service_role";

grant insert on table "public"."inventory_count_sessions" to "service_role";

grant references on table "public"."inventory_count_sessions" to "service_role";

grant select on table "public"."inventory_count_sessions" to "service_role";

grant trigger on table "public"."inventory_count_sessions" to "service_role";

grant truncate on table "public"."inventory_count_sessions" to "service_role";

grant update on table "public"."inventory_count_sessions" to "service_role";

grant delete on table "public"."inventory_entries" to "anon";

grant insert on table "public"."inventory_entries" to "anon";

grant references on table "public"."inventory_entries" to "anon";

grant select on table "public"."inventory_entries" to "anon";

grant trigger on table "public"."inventory_entries" to "anon";

grant truncate on table "public"."inventory_entries" to "anon";

grant update on table "public"."inventory_entries" to "anon";

grant delete on table "public"."inventory_entries" to "authenticated";

grant insert on table "public"."inventory_entries" to "authenticated";

grant references on table "public"."inventory_entries" to "authenticated";

grant select on table "public"."inventory_entries" to "authenticated";

grant trigger on table "public"."inventory_entries" to "authenticated";

grant truncate on table "public"."inventory_entries" to "authenticated";

grant update on table "public"."inventory_entries" to "authenticated";

grant delete on table "public"."inventory_entries" to "service_role";

grant insert on table "public"."inventory_entries" to "service_role";

grant references on table "public"."inventory_entries" to "service_role";

grant select on table "public"."inventory_entries" to "service_role";

grant trigger on table "public"."inventory_entries" to "service_role";

grant truncate on table "public"."inventory_entries" to "service_role";

grant update on table "public"."inventory_entries" to "service_role";

grant delete on table "public"."inventory_entry_items" to "anon";

grant insert on table "public"."inventory_entry_items" to "anon";

grant references on table "public"."inventory_entry_items" to "anon";

grant select on table "public"."inventory_entry_items" to "anon";

grant trigger on table "public"."inventory_entry_items" to "anon";

grant truncate on table "public"."inventory_entry_items" to "anon";

grant update on table "public"."inventory_entry_items" to "anon";

grant delete on table "public"."inventory_entry_items" to "authenticated";

grant insert on table "public"."inventory_entry_items" to "authenticated";

grant references on table "public"."inventory_entry_items" to "authenticated";

grant select on table "public"."inventory_entry_items" to "authenticated";

grant trigger on table "public"."inventory_entry_items" to "authenticated";

grant truncate on table "public"."inventory_entry_items" to "authenticated";

grant update on table "public"."inventory_entry_items" to "authenticated";

grant delete on table "public"."inventory_entry_items" to "service_role";

grant insert on table "public"."inventory_entry_items" to "service_role";

grant references on table "public"."inventory_entry_items" to "service_role";

grant select on table "public"."inventory_entry_items" to "service_role";

grant trigger on table "public"."inventory_entry_items" to "service_role";

grant truncate on table "public"."inventory_entry_items" to "service_role";

grant update on table "public"."inventory_entry_items" to "service_role";

grant delete on table "public"."inventory_stock_by_location" to "anon";

grant insert on table "public"."inventory_stock_by_location" to "anon";

grant references on table "public"."inventory_stock_by_location" to "anon";

grant select on table "public"."inventory_stock_by_location" to "anon";

grant trigger on table "public"."inventory_stock_by_location" to "anon";

grant truncate on table "public"."inventory_stock_by_location" to "anon";

grant update on table "public"."inventory_stock_by_location" to "anon";

grant delete on table "public"."inventory_stock_by_location" to "authenticated";

grant insert on table "public"."inventory_stock_by_location" to "authenticated";

grant references on table "public"."inventory_stock_by_location" to "authenticated";

grant select on table "public"."inventory_stock_by_location" to "authenticated";

grant trigger on table "public"."inventory_stock_by_location" to "authenticated";

grant truncate on table "public"."inventory_stock_by_location" to "authenticated";

grant update on table "public"."inventory_stock_by_location" to "authenticated";

grant delete on table "public"."inventory_stock_by_location" to "service_role";

grant insert on table "public"."inventory_stock_by_location" to "service_role";

grant references on table "public"."inventory_stock_by_location" to "service_role";

grant select on table "public"."inventory_stock_by_location" to "service_role";

grant trigger on table "public"."inventory_stock_by_location" to "service_role";

grant truncate on table "public"."inventory_stock_by_location" to "service_role";

grant update on table "public"."inventory_stock_by_location" to "service_role";

grant delete on table "public"."inventory_transfer_items" to "anon";

grant insert on table "public"."inventory_transfer_items" to "anon";

grant references on table "public"."inventory_transfer_items" to "anon";

grant select on table "public"."inventory_transfer_items" to "anon";

grant trigger on table "public"."inventory_transfer_items" to "anon";

grant truncate on table "public"."inventory_transfer_items" to "anon";

grant update on table "public"."inventory_transfer_items" to "anon";

grant delete on table "public"."inventory_transfer_items" to "authenticated";

grant insert on table "public"."inventory_transfer_items" to "authenticated";

grant references on table "public"."inventory_transfer_items" to "authenticated";

grant select on table "public"."inventory_transfer_items" to "authenticated";

grant trigger on table "public"."inventory_transfer_items" to "authenticated";

grant truncate on table "public"."inventory_transfer_items" to "authenticated";

grant update on table "public"."inventory_transfer_items" to "authenticated";

grant delete on table "public"."inventory_transfer_items" to "service_role";

grant insert on table "public"."inventory_transfer_items" to "service_role";

grant references on table "public"."inventory_transfer_items" to "service_role";

grant select on table "public"."inventory_transfer_items" to "service_role";

grant trigger on table "public"."inventory_transfer_items" to "service_role";

grant truncate on table "public"."inventory_transfer_items" to "service_role";

grant update on table "public"."inventory_transfer_items" to "service_role";

grant delete on table "public"."inventory_transfers" to "anon";

grant insert on table "public"."inventory_transfers" to "anon";

grant references on table "public"."inventory_transfers" to "anon";

grant select on table "public"."inventory_transfers" to "anon";

grant trigger on table "public"."inventory_transfers" to "anon";

grant truncate on table "public"."inventory_transfers" to "anon";

grant update on table "public"."inventory_transfers" to "anon";

grant delete on table "public"."inventory_transfers" to "authenticated";

grant insert on table "public"."inventory_transfers" to "authenticated";

grant references on table "public"."inventory_transfers" to "authenticated";

grant select on table "public"."inventory_transfers" to "authenticated";

grant trigger on table "public"."inventory_transfers" to "authenticated";

grant truncate on table "public"."inventory_transfers" to "authenticated";

grant update on table "public"."inventory_transfers" to "authenticated";

grant delete on table "public"."inventory_transfers" to "service_role";

grant insert on table "public"."inventory_transfers" to "service_role";

grant references on table "public"."inventory_transfers" to "service_role";

grant select on table "public"."inventory_transfers" to "service_role";

grant trigger on table "public"."inventory_transfers" to "service_role";

grant truncate on table "public"."inventory_transfers" to "service_role";

grant update on table "public"."inventory_transfers" to "service_role";

grant delete on table "public"."inventory_unit_aliases" to "anon";

grant insert on table "public"."inventory_unit_aliases" to "anon";

grant references on table "public"."inventory_unit_aliases" to "anon";

grant select on table "public"."inventory_unit_aliases" to "anon";

grant trigger on table "public"."inventory_unit_aliases" to "anon";

grant truncate on table "public"."inventory_unit_aliases" to "anon";

grant update on table "public"."inventory_unit_aliases" to "anon";

grant delete on table "public"."inventory_unit_aliases" to "authenticated";

grant insert on table "public"."inventory_unit_aliases" to "authenticated";

grant references on table "public"."inventory_unit_aliases" to "authenticated";

grant select on table "public"."inventory_unit_aliases" to "authenticated";

grant trigger on table "public"."inventory_unit_aliases" to "authenticated";

grant truncate on table "public"."inventory_unit_aliases" to "authenticated";

grant update on table "public"."inventory_unit_aliases" to "authenticated";

grant delete on table "public"."inventory_unit_aliases" to "service_role";

grant insert on table "public"."inventory_unit_aliases" to "service_role";

grant references on table "public"."inventory_unit_aliases" to "service_role";

grant select on table "public"."inventory_unit_aliases" to "service_role";

grant trigger on table "public"."inventory_unit_aliases" to "service_role";

grant truncate on table "public"."inventory_unit_aliases" to "service_role";

grant update on table "public"."inventory_unit_aliases" to "service_role";

grant delete on table "public"."inventory_units" to "anon";

grant insert on table "public"."inventory_units" to "anon";

grant references on table "public"."inventory_units" to "anon";

grant select on table "public"."inventory_units" to "anon";

grant trigger on table "public"."inventory_units" to "anon";

grant truncate on table "public"."inventory_units" to "anon";

grant update on table "public"."inventory_units" to "anon";

grant delete on table "public"."inventory_units" to "authenticated";

grant insert on table "public"."inventory_units" to "authenticated";

grant references on table "public"."inventory_units" to "authenticated";

grant select on table "public"."inventory_units" to "authenticated";

grant trigger on table "public"."inventory_units" to "authenticated";

grant truncate on table "public"."inventory_units" to "authenticated";

grant update on table "public"."inventory_units" to "authenticated";

grant delete on table "public"."inventory_units" to "service_role";

grant insert on table "public"."inventory_units" to "service_role";

grant references on table "public"."inventory_units" to "service_role";

grant select on table "public"."inventory_units" to "service_role";

grant trigger on table "public"."inventory_units" to "service_role";

grant truncate on table "public"."inventory_units" to "service_role";

grant update on table "public"."inventory_units" to "service_role";

grant delete on table "public"."loyalty_external_sales" to "anon";

grant insert on table "public"."loyalty_external_sales" to "anon";

grant references on table "public"."loyalty_external_sales" to "anon";

grant select on table "public"."loyalty_external_sales" to "anon";

grant trigger on table "public"."loyalty_external_sales" to "anon";

grant truncate on table "public"."loyalty_external_sales" to "anon";

grant update on table "public"."loyalty_external_sales" to "anon";

grant delete on table "public"."loyalty_external_sales" to "authenticated";

grant insert on table "public"."loyalty_external_sales" to "authenticated";

grant references on table "public"."loyalty_external_sales" to "authenticated";

grant select on table "public"."loyalty_external_sales" to "authenticated";

grant trigger on table "public"."loyalty_external_sales" to "authenticated";

grant truncate on table "public"."loyalty_external_sales" to "authenticated";

grant update on table "public"."loyalty_external_sales" to "authenticated";

grant delete on table "public"."loyalty_external_sales" to "service_role";

grant insert on table "public"."loyalty_external_sales" to "service_role";

grant references on table "public"."loyalty_external_sales" to "service_role";

grant select on table "public"."loyalty_external_sales" to "service_role";

grant trigger on table "public"."loyalty_external_sales" to "service_role";

grant truncate on table "public"."loyalty_external_sales" to "service_role";

grant update on table "public"."loyalty_external_sales" to "service_role";

grant delete on table "public"."product_cost_events" to "anon";

grant insert on table "public"."product_cost_events" to "anon";

grant references on table "public"."product_cost_events" to "anon";

grant select on table "public"."product_cost_events" to "anon";

grant trigger on table "public"."product_cost_events" to "anon";

grant truncate on table "public"."product_cost_events" to "anon";

grant update on table "public"."product_cost_events" to "anon";

grant delete on table "public"."product_cost_events" to "authenticated";

grant insert on table "public"."product_cost_events" to "authenticated";

grant references on table "public"."product_cost_events" to "authenticated";

grant select on table "public"."product_cost_events" to "authenticated";

grant trigger on table "public"."product_cost_events" to "authenticated";

grant truncate on table "public"."product_cost_events" to "authenticated";

grant update on table "public"."product_cost_events" to "authenticated";

grant delete on table "public"."product_cost_events" to "service_role";

grant insert on table "public"."product_cost_events" to "service_role";

grant references on table "public"."product_cost_events" to "service_role";

grant select on table "public"."product_cost_events" to "service_role";

grant trigger on table "public"."product_cost_events" to "service_role";

grant truncate on table "public"."product_cost_events" to "service_role";

grant update on table "public"."product_cost_events" to "service_role";

grant delete on table "public"."product_site_settings" to "anon";

grant insert on table "public"."product_site_settings" to "anon";

grant references on table "public"."product_site_settings" to "anon";

grant select on table "public"."product_site_settings" to "anon";

grant trigger on table "public"."product_site_settings" to "anon";

grant truncate on table "public"."product_site_settings" to "anon";

grant update on table "public"."product_site_settings" to "anon";

grant delete on table "public"."product_site_settings" to "authenticated";

grant insert on table "public"."product_site_settings" to "authenticated";

grant references on table "public"."product_site_settings" to "authenticated";

grant select on table "public"."product_site_settings" to "authenticated";

grant trigger on table "public"."product_site_settings" to "authenticated";

grant truncate on table "public"."product_site_settings" to "authenticated";

grant update on table "public"."product_site_settings" to "authenticated";

grant delete on table "public"."product_site_settings" to "service_role";

grant insert on table "public"."product_site_settings" to "service_role";

grant references on table "public"."product_site_settings" to "service_role";

grant select on table "public"."product_site_settings" to "service_role";

grant trigger on table "public"."product_site_settings" to "service_role";

grant truncate on table "public"."product_site_settings" to "service_role";

grant update on table "public"."product_site_settings" to "service_role";

grant delete on table "public"."product_uom_profiles" to "anon";

grant insert on table "public"."product_uom_profiles" to "anon";

grant references on table "public"."product_uom_profiles" to "anon";

grant select on table "public"."product_uom_profiles" to "anon";

grant trigger on table "public"."product_uom_profiles" to "anon";

grant truncate on table "public"."product_uom_profiles" to "anon";

grant update on table "public"."product_uom_profiles" to "anon";

grant delete on table "public"."product_uom_profiles" to "authenticated";

grant insert on table "public"."product_uom_profiles" to "authenticated";

grant references on table "public"."product_uom_profiles" to "authenticated";

grant select on table "public"."product_uom_profiles" to "authenticated";

grant trigger on table "public"."product_uom_profiles" to "authenticated";

grant truncate on table "public"."product_uom_profiles" to "authenticated";

grant update on table "public"."product_uom_profiles" to "authenticated";

grant delete on table "public"."product_uom_profiles" to "service_role";

grant insert on table "public"."product_uom_profiles" to "service_role";

grant references on table "public"."product_uom_profiles" to "service_role";

grant select on table "public"."product_uom_profiles" to "service_role";

grant trigger on table "public"."product_uom_profiles" to "service_role";

grant truncate on table "public"."product_uom_profiles" to "service_role";

grant update on table "public"."product_uom_profiles" to "service_role";

grant delete on table "public"."production_batch_consumptions" to "anon";

grant insert on table "public"."production_batch_consumptions" to "anon";

grant references on table "public"."production_batch_consumptions" to "anon";

grant select on table "public"."production_batch_consumptions" to "anon";

grant trigger on table "public"."production_batch_consumptions" to "anon";

grant truncate on table "public"."production_batch_consumptions" to "anon";

grant update on table "public"."production_batch_consumptions" to "anon";

grant delete on table "public"."production_batch_consumptions" to "authenticated";

grant insert on table "public"."production_batch_consumptions" to "authenticated";

grant references on table "public"."production_batch_consumptions" to "authenticated";

grant select on table "public"."production_batch_consumptions" to "authenticated";

grant trigger on table "public"."production_batch_consumptions" to "authenticated";

grant truncate on table "public"."production_batch_consumptions" to "authenticated";

grant update on table "public"."production_batch_consumptions" to "authenticated";

grant delete on table "public"."production_batch_consumptions" to "service_role";

grant insert on table "public"."production_batch_consumptions" to "service_role";

grant references on table "public"."production_batch_consumptions" to "service_role";

grant select on table "public"."production_batch_consumptions" to "service_role";

grant trigger on table "public"."production_batch_consumptions" to "service_role";

grant truncate on table "public"."production_batch_consumptions" to "service_role";

grant update on table "public"."production_batch_consumptions" to "service_role";

grant delete on table "public"."role_permissions" to "anon";

grant insert on table "public"."role_permissions" to "anon";

grant references on table "public"."role_permissions" to "anon";

grant select on table "public"."role_permissions" to "anon";

grant trigger on table "public"."role_permissions" to "anon";

grant truncate on table "public"."role_permissions" to "anon";

grant update on table "public"."role_permissions" to "anon";

grant delete on table "public"."role_permissions" to "authenticated";

grant insert on table "public"."role_permissions" to "authenticated";

grant references on table "public"."role_permissions" to "authenticated";

grant select on table "public"."role_permissions" to "authenticated";

grant trigger on table "public"."role_permissions" to "authenticated";

grant truncate on table "public"."role_permissions" to "authenticated";

grant update on table "public"."role_permissions" to "authenticated";

grant delete on table "public"."role_permissions" to "service_role";

grant insert on table "public"."role_permissions" to "service_role";

grant references on table "public"."role_permissions" to "service_role";

grant select on table "public"."role_permissions" to "service_role";

grant trigger on table "public"."role_permissions" to "service_role";

grant truncate on table "public"."role_permissions" to "service_role";

grant update on table "public"."role_permissions" to "service_role";

grant delete on table "public"."role_site_type_rules" to "anon";

grant insert on table "public"."role_site_type_rules" to "anon";

grant references on table "public"."role_site_type_rules" to "anon";

grant select on table "public"."role_site_type_rules" to "anon";

grant trigger on table "public"."role_site_type_rules" to "anon";

grant truncate on table "public"."role_site_type_rules" to "anon";

grant update on table "public"."role_site_type_rules" to "anon";

grant delete on table "public"."role_site_type_rules" to "authenticated";

grant insert on table "public"."role_site_type_rules" to "authenticated";

grant references on table "public"."role_site_type_rules" to "authenticated";

grant select on table "public"."role_site_type_rules" to "authenticated";

grant trigger on table "public"."role_site_type_rules" to "authenticated";

grant truncate on table "public"."role_site_type_rules" to "authenticated";

grant update on table "public"."role_site_type_rules" to "authenticated";

grant delete on table "public"."role_site_type_rules" to "service_role";

grant insert on table "public"."role_site_type_rules" to "service_role";

grant references on table "public"."role_site_type_rules" to "service_role";

grant select on table "public"."role_site_type_rules" to "service_role";

grant trigger on table "public"."role_site_type_rules" to "service_role";

grant truncate on table "public"."role_site_type_rules" to "service_role";

grant update on table "public"."role_site_type_rules" to "service_role";

grant delete on table "public"."roles" to "anon";

grant insert on table "public"."roles" to "anon";

grant references on table "public"."roles" to "anon";

grant select on table "public"."roles" to "anon";

grant trigger on table "public"."roles" to "anon";

grant truncate on table "public"."roles" to "anon";

grant update on table "public"."roles" to "anon";

grant delete on table "public"."roles" to "authenticated";

grant insert on table "public"."roles" to "authenticated";

grant references on table "public"."roles" to "authenticated";

grant select on table "public"."roles" to "authenticated";

grant trigger on table "public"."roles" to "authenticated";

grant truncate on table "public"."roles" to "authenticated";

grant update on table "public"."roles" to "authenticated";

grant delete on table "public"."roles" to "service_role";

grant insert on table "public"."roles" to "service_role";

grant references on table "public"."roles" to "service_role";

grant select on table "public"."roles" to "service_role";

grant trigger on table "public"."roles" to "service_role";

grant truncate on table "public"."roles" to "service_role";

grant update on table "public"."roles" to "service_role";

grant delete on table "public"."site_production_pick_order" to "anon";

grant insert on table "public"."site_production_pick_order" to "anon";

grant references on table "public"."site_production_pick_order" to "anon";

grant select on table "public"."site_production_pick_order" to "anon";

grant trigger on table "public"."site_production_pick_order" to "anon";

grant truncate on table "public"."site_production_pick_order" to "anon";

grant update on table "public"."site_production_pick_order" to "anon";

grant delete on table "public"."site_production_pick_order" to "authenticated";

grant insert on table "public"."site_production_pick_order" to "authenticated";

grant references on table "public"."site_production_pick_order" to "authenticated";

grant select on table "public"."site_production_pick_order" to "authenticated";

grant trigger on table "public"."site_production_pick_order" to "authenticated";

grant truncate on table "public"."site_production_pick_order" to "authenticated";

grant update on table "public"."site_production_pick_order" to "authenticated";

grant delete on table "public"."site_production_pick_order" to "service_role";

grant insert on table "public"."site_production_pick_order" to "service_role";

grant references on table "public"."site_production_pick_order" to "service_role";

grant select on table "public"."site_production_pick_order" to "service_role";

grant trigger on table "public"."site_production_pick_order" to "service_role";

grant truncate on table "public"."site_production_pick_order" to "service_role";

grant update on table "public"."site_production_pick_order" to "service_role";

grant delete on table "public"."site_supply_routes" to "anon";

grant insert on table "public"."site_supply_routes" to "anon";

grant references on table "public"."site_supply_routes" to "anon";

grant select on table "public"."site_supply_routes" to "anon";

grant trigger on table "public"."site_supply_routes" to "anon";

grant truncate on table "public"."site_supply_routes" to "anon";

grant update on table "public"."site_supply_routes" to "anon";

grant delete on table "public"."site_supply_routes" to "authenticated";

grant insert on table "public"."site_supply_routes" to "authenticated";

grant references on table "public"."site_supply_routes" to "authenticated";

grant select on table "public"."site_supply_routes" to "authenticated";

grant trigger on table "public"."site_supply_routes" to "authenticated";

grant truncate on table "public"."site_supply_routes" to "authenticated";

grant update on table "public"."site_supply_routes" to "authenticated";

grant delete on table "public"."site_supply_routes" to "service_role";

grant insert on table "public"."site_supply_routes" to "service_role";

grant references on table "public"."site_supply_routes" to "service_role";

grant select on table "public"."site_supply_routes" to "service_role";

grant trigger on table "public"."site_supply_routes" to "service_role";

grant truncate on table "public"."site_supply_routes" to "service_role";

grant update on table "public"."site_supply_routes" to "service_role";

grant delete on table "public"."support_messages" to "anon";

grant insert on table "public"."support_messages" to "anon";

grant references on table "public"."support_messages" to "anon";

grant select on table "public"."support_messages" to "anon";

grant trigger on table "public"."support_messages" to "anon";

grant truncate on table "public"."support_messages" to "anon";

grant update on table "public"."support_messages" to "anon";

grant delete on table "public"."support_messages" to "authenticated";

grant insert on table "public"."support_messages" to "authenticated";

grant references on table "public"."support_messages" to "authenticated";

grant select on table "public"."support_messages" to "authenticated";

grant trigger on table "public"."support_messages" to "authenticated";

grant truncate on table "public"."support_messages" to "authenticated";

grant update on table "public"."support_messages" to "authenticated";

grant delete on table "public"."support_messages" to "service_role";

grant insert on table "public"."support_messages" to "service_role";

grant references on table "public"."support_messages" to "service_role";

grant select on table "public"."support_messages" to "service_role";

grant trigger on table "public"."support_messages" to "service_role";

grant truncate on table "public"."support_messages" to "service_role";

grant update on table "public"."support_messages" to "service_role";

grant delete on table "public"."support_tickets" to "anon";

grant insert on table "public"."support_tickets" to "anon";

grant references on table "public"."support_tickets" to "anon";

grant select on table "public"."support_tickets" to "anon";

grant trigger on table "public"."support_tickets" to "anon";

grant truncate on table "public"."support_tickets" to "anon";

grant update on table "public"."support_tickets" to "anon";

grant delete on table "public"."support_tickets" to "authenticated";

grant insert on table "public"."support_tickets" to "authenticated";

grant references on table "public"."support_tickets" to "authenticated";

grant select on table "public"."support_tickets" to "authenticated";

grant trigger on table "public"."support_tickets" to "authenticated";

grant truncate on table "public"."support_tickets" to "authenticated";

grant update on table "public"."support_tickets" to "authenticated";

grant delete on table "public"."support_tickets" to "service_role";

grant insert on table "public"."support_tickets" to "service_role";

grant references on table "public"."support_tickets" to "service_role";

grant select on table "public"."support_tickets" to "service_role";

grant trigger on table "public"."support_tickets" to "service_role";

grant truncate on table "public"."support_tickets" to "service_role";

grant update on table "public"."support_tickets" to "service_role";

grant delete on table "public"."wallet_devices" to "anon";

grant insert on table "public"."wallet_devices" to "anon";

grant references on table "public"."wallet_devices" to "anon";

grant select on table "public"."wallet_devices" to "anon";

grant trigger on table "public"."wallet_devices" to "anon";

grant truncate on table "public"."wallet_devices" to "anon";

grant update on table "public"."wallet_devices" to "anon";

grant delete on table "public"."wallet_devices" to "authenticated";

grant insert on table "public"."wallet_devices" to "authenticated";

grant references on table "public"."wallet_devices" to "authenticated";

grant select on table "public"."wallet_devices" to "authenticated";

grant trigger on table "public"."wallet_devices" to "authenticated";

grant truncate on table "public"."wallet_devices" to "authenticated";

grant update on table "public"."wallet_devices" to "authenticated";

grant delete on table "public"."wallet_devices" to "service_role";

grant insert on table "public"."wallet_devices" to "service_role";

grant references on table "public"."wallet_devices" to "service_role";

grant select on table "public"."wallet_devices" to "service_role";

grant trigger on table "public"."wallet_devices" to "service_role";

grant truncate on table "public"."wallet_devices" to "service_role";

grant update on table "public"."wallet_devices" to "service_role";

grant delete on table "public"."wallet_passes" to "anon";

grant insert on table "public"."wallet_passes" to "anon";

grant references on table "public"."wallet_passes" to "anon";

grant select on table "public"."wallet_passes" to "anon";

grant trigger on table "public"."wallet_passes" to "anon";

grant truncate on table "public"."wallet_passes" to "anon";

grant update on table "public"."wallet_passes" to "anon";

grant delete on table "public"."wallet_passes" to "authenticated";

grant insert on table "public"."wallet_passes" to "authenticated";

grant references on table "public"."wallet_passes" to "authenticated";

grant select on table "public"."wallet_passes" to "authenticated";

grant trigger on table "public"."wallet_passes" to "authenticated";

grant truncate on table "public"."wallet_passes" to "authenticated";

grant update on table "public"."wallet_passes" to "authenticated";

grant delete on table "public"."wallet_passes" to "service_role";

grant insert on table "public"."wallet_passes" to "service_role";

grant references on table "public"."wallet_passes" to "service_role";

grant select on table "public"."wallet_passes" to "service_role";

grant trigger on table "public"."wallet_passes" to "service_role";

grant truncate on table "public"."wallet_passes" to "service_role";

grant update on table "public"."wallet_passes" to "service_role";

grant delete on table "vital"."adaptive_decision_logs" to "authenticated";

grant insert on table "vital"."adaptive_decision_logs" to "authenticated";

grant select on table "vital"."adaptive_decision_logs" to "authenticated";

grant update on table "vital"."adaptive_decision_logs" to "authenticated";

grant delete on table "vital"."admin_users" to "authenticated";

grant insert on table "vital"."admin_users" to "authenticated";

grant select on table "vital"."admin_users" to "authenticated";

grant update on table "vital"."admin_users" to "authenticated";

grant delete on table "vital"."availability_profiles" to "authenticated";

grant insert on table "vital"."availability_profiles" to "authenticated";

grant select on table "vital"."availability_profiles" to "authenticated";

grant update on table "vital"."availability_profiles" to "authenticated";

grant delete on table "vital"."badges" to "authenticated";

grant insert on table "vital"."badges" to "authenticated";

grant select on table "vital"."badges" to "authenticated";

grant update on table "vital"."badges" to "authenticated";

grant delete on table "vital"."body_metrics" to "authenticated";

grant insert on table "vital"."body_metrics" to "authenticated";

grant select on table "vital"."body_metrics" to "authenticated";

grant update on table "vital"."body_metrics" to "authenticated";

grant delete on table "vital"."challenge_progress" to "authenticated";

grant insert on table "vital"."challenge_progress" to "authenticated";

grant select on table "vital"."challenge_progress" to "authenticated";

grant update on table "vital"."challenge_progress" to "authenticated";

grant delete on table "vital"."challenges" to "authenticated";

grant insert on table "vital"."challenges" to "authenticated";

grant select on table "vital"."challenges" to "authenticated";

grant update on table "vital"."challenges" to "authenticated";

grant delete on table "vital"."consent_records" to "authenticated";

grant insert on table "vital"."consent_records" to "authenticated";

grant select on table "vital"."consent_records" to "authenticated";

grant update on table "vital"."consent_records" to "authenticated";

grant delete on table "vital"."daily_readiness_inputs" to "authenticated";

grant insert on table "vital"."daily_readiness_inputs" to "authenticated";

grant select on table "vital"."daily_readiness_inputs" to "authenticated";

grant update on table "vital"."daily_readiness_inputs" to "authenticated";

grant delete on table "vital"."fair_play_events" to "authenticated";

grant insert on table "vital"."fair_play_events" to "authenticated";

grant select on table "vital"."fair_play_events" to "authenticated";

grant update on table "vital"."fair_play_events" to "authenticated";

grant delete on table "vital"."fatigue_scores" to "authenticated";

grant insert on table "vital"."fatigue_scores" to "authenticated";

grant select on table "vital"."fatigue_scores" to "authenticated";

grant update on table "vital"."fatigue_scores" to "authenticated";

grant delete on table "vital"."feature_flags" to "authenticated";

grant insert on table "vital"."feature_flags" to "authenticated";

grant select on table "vital"."feature_flags" to "authenticated";

grant update on table "vital"."feature_flags" to "authenticated";

grant delete on table "vital"."game_profiles" to "authenticated";

grant insert on table "vital"."game_profiles" to "authenticated";

grant select on table "vital"."game_profiles" to "authenticated";

grant update on table "vital"."game_profiles" to "authenticated";

grant delete on table "vital"."goal_profiles" to "authenticated";

grant insert on table "vital"."goal_profiles" to "authenticated";

grant select on table "vital"."goal_profiles" to "authenticated";

grant update on table "vital"."goal_profiles" to "authenticated";

grant delete on table "vital"."health_profiles" to "authenticated";

grant insert on table "vital"."health_profiles" to "authenticated";

grant select on table "vital"."health_profiles" to "authenticated";

grant update on table "vital"."health_profiles" to "authenticated";

grant delete on table "vital"."league_memberships" to "authenticated";

grant insert on table "vital"."league_memberships" to "authenticated";

grant select on table "vital"."league_memberships" to "authenticated";

grant update on table "vital"."league_memberships" to "authenticated";

grant delete on table "vital"."level_states" to "authenticated";

grant insert on table "vital"."level_states" to "authenticated";

grant select on table "vital"."level_states" to "authenticated";

grant update on table "vital"."level_states" to "authenticated";

grant delete on table "vital"."module_catalog" to "authenticated";

grant insert on table "vital"."module_catalog" to "authenticated";

grant select on table "vital"."module_catalog" to "authenticated";

grant update on table "vital"."module_catalog" to "authenticated";

grant delete on table "vital"."module_template_catalog" to "authenticated";

grant insert on table "vital"."module_template_catalog" to "authenticated";

grant select on table "vital"."module_template_catalog" to "authenticated";

grant update on table "vital"."module_template_catalog" to "authenticated";

grant delete on table "vital"."muscle_load_snapshots" to "authenticated";

grant insert on table "vital"."muscle_load_snapshots" to "authenticated";

grant select on table "vital"."muscle_load_snapshots" to "authenticated";

grant update on table "vital"."muscle_load_snapshots" to "authenticated";

grant delete on table "vital"."notification_plans" to "authenticated";

grant insert on table "vital"."notification_plans" to "authenticated";

grant select on table "vital"."notification_plans" to "authenticated";

grant update on table "vital"."notification_plans" to "authenticated";

grant delete on table "vital"."program_versions" to "authenticated";

grant insert on table "vital"."program_versions" to "authenticated";

grant select on table "vital"."program_versions" to "authenticated";

grant update on table "vital"."program_versions" to "authenticated";

grant delete on table "vital"."programs" to "authenticated";

grant insert on table "vital"."programs" to "authenticated";

grant select on table "vital"."programs" to "authenticated";

grant update on table "vital"."programs" to "authenticated";

grant delete on table "vital"."readiness_scores" to "authenticated";

grant insert on table "vital"."readiness_scores" to "authenticated";

grant select on table "vital"."readiness_scores" to "authenticated";

grant update on table "vital"."readiness_scores" to "authenticated";

grant delete on table "vital"."recovery_signals" to "authenticated";

grant insert on table "vital"."recovery_signals" to "authenticated";

grant select on table "vital"."recovery_signals" to "authenticated";

grant update on table "vital"."recovery_signals" to "authenticated";

grant delete on table "vital"."safety_intake" to "authenticated";

grant insert on table "vital"."safety_intake" to "authenticated";

grant select on table "vital"."safety_intake" to "authenticated";

grant update on table "vital"."safety_intake" to "authenticated";

grant delete on table "vital"."seasons" to "authenticated";

grant insert on table "vital"."seasons" to "authenticated";

grant select on table "vital"."seasons" to "authenticated";

grant update on table "vital"."seasons" to "authenticated";

grant delete on table "vital"."session_logs" to "authenticated";

grant insert on table "vital"."session_logs" to "authenticated";

grant select on table "vital"."session_logs" to "authenticated";

grant update on table "vital"."session_logs" to "authenticated";

grant delete on table "vital"."squad_memberships" to "authenticated";

grant insert on table "vital"."squad_memberships" to "authenticated";

grant select on table "vital"."squad_memberships" to "authenticated";

grant update on table "vital"."squad_memberships" to "authenticated";

grant delete on table "vital"."squads" to "authenticated";

grant insert on table "vital"."squads" to "authenticated";

grant select on table "vital"."squads" to "authenticated";

grant update on table "vital"."squads" to "authenticated";

grant delete on table "vital"."starter_program_catalog" to "authenticated";

grant insert on table "vital"."starter_program_catalog" to "authenticated";

grant select on table "vital"."starter_program_catalog" to "authenticated";

grant update on table "vital"."starter_program_catalog" to "authenticated";

grant delete on table "vital"."starter_program_tasks" to "authenticated";

grant insert on table "vital"."starter_program_tasks" to "authenticated";

grant select on table "vital"."starter_program_tasks" to "authenticated";

grant update on table "vital"."starter_program_tasks" to "authenticated";

grant delete on table "vital"."task_instances" to "authenticated";

grant insert on table "vital"."task_instances" to "authenticated";

grant select on table "vital"."task_instances" to "authenticated";

grant update on table "vital"."task_instances" to "authenticated";

grant delete on table "vital"."task_templates" to "authenticated";

grant insert on table "vital"."task_templates" to "authenticated";

grant select on table "vital"."task_templates" to "authenticated";

grant update on table "vital"."task_templates" to "authenticated";

grant delete on table "vital"."telemetry_events" to "authenticated";

grant insert on table "vital"."telemetry_events" to "authenticated";

grant select on table "vital"."telemetry_events" to "authenticated";

grant update on table "vital"."telemetry_events" to "authenticated";

grant delete on table "vital"."user_badges" to "authenticated";

grant insert on table "vital"."user_badges" to "authenticated";

grant select on table "vital"."user_badges" to "authenticated";

grant update on table "vital"."user_badges" to "authenticated";

grant delete on table "vital"."user_feature_flags" to "authenticated";

grant insert on table "vital"."user_feature_flags" to "authenticated";

grant select on table "vital"."user_feature_flags" to "authenticated";

grant update on table "vital"."user_feature_flags" to "authenticated";

grant delete on table "vital"."user_module_preferences" to "authenticated";

grant insert on table "vital"."user_module_preferences" to "authenticated";

grant select on table "vital"."user_module_preferences" to "authenticated";

grant update on table "vital"."user_module_preferences" to "authenticated";

grant delete on table "vital"."user_profiles" to "authenticated";

grant insert on table "vital"."user_profiles" to "authenticated";

grant select on table "vital"."user_profiles" to "authenticated";

grant update on table "vital"."user_profiles" to "authenticated";

grant delete on table "vital"."weekly_leaderboard_snapshots" to "authenticated";

grant insert on table "vital"."weekly_leaderboard_snapshots" to "authenticated";

grant select on table "vital"."weekly_leaderboard_snapshots" to "authenticated";

grant update on table "vital"."weekly_leaderboard_snapshots" to "authenticated";

grant delete on table "vital"."weekly_reviews" to "authenticated";

grant insert on table "vital"."weekly_reviews" to "authenticated";

grant select on table "vital"."weekly_reviews" to "authenticated";

grant update on table "vital"."weekly_reviews" to "authenticated";

grant delete on table "vital"."xp_events" to "authenticated";

grant insert on table "vital"."xp_events" to "authenticated";

grant select on table "vital"."xp_events" to "authenticated";

grant update on table "vital"."xp_events" to "authenticated";


  create policy "announcements_select_authenticated"
  on "public"."announcements"
  as permissive
  for select
  to authenticated
using ((is_active = true));



  create policy "announcements_write_management"
  on "public"."announcements"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text, 'gerente'::text]))))))
with check ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text, 'gerente'::text]))))));



  create policy "app_permissions_manage_owner"
  on "public"."app_permissions"
  as permissive
  for all
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "app_permissions_select_all"
  on "public"."app_permissions"
  as permissive
  for select
  to authenticated
using (true);



  create policy "apps_manage_owner"
  on "public"."apps"
  as permissive
  for all
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "apps_select_all"
  on "public"."apps"
  as permissive
  for select
  to authenticated
using (true);



  create policy "area_kinds_manage_owner"
  on "public"."area_kinds"
  as permissive
  for all
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "area_kinds_select_all"
  on "public"."area_kinds"
  as permissive
  for select
  to authenticated
using (true);



  create policy "attendance_breaks_select_manager"
  on "public"."attendance_breaks"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text])) AND ((e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text])) OR (e.site_id = attendance_breaks.site_id))))));



  create policy "attendance_breaks_select_self"
  on "public"."attendance_breaks"
  as permissive
  for select
  to authenticated
using ((employee_id = auth.uid()));



  create policy "attendance_shift_events_select_manager"
  on "public"."attendance_shift_events"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text])) AND ((e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text])) OR (e.site_id = attendance_shift_events.site_id))))));



  create policy "attendance_shift_events_select_self"
  on "public"."attendance_shift_events"
  as permissive
  for select
  to authenticated
using ((employee_id = auth.uid()));



  create policy "document_types_select"
  on "public"."document_types"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "document_types_write_admin"
  on "public"."document_types"
  as permissive
  for all
  to public
using ((public.is_owner() OR public.is_global_manager() OR (public.current_employee_role() = 'gerente'::text)))
with check ((public.is_owner() OR public.is_global_manager() OR (public.current_employee_role() = 'gerente'::text)));



  create policy "documents_delete"
  on "public"."documents"
  as permissive
  for delete
  to public
using ((public.is_owner() OR public.is_global_manager() OR ((public.current_employee_role() = 'gerente'::text) AND (((scope = 'site'::public.document_scope) AND (site_id = ( SELECT me.site_id
   FROM public.employees me
  WHERE (me.id = auth.uid())))) OR ((scope = 'employee'::public.document_scope) AND (target_employee_id IN ( SELECT e.id
   FROM public.employees e
  WHERE (e.site_id = ( SELECT me.site_id
           FROM public.employees me
          WHERE (me.id = auth.uid())))))) OR (scope = 'group'::public.document_scope)))));



  create policy "documents_insert"
  on "public"."documents"
  as permissive
  for insert
  to public
with check (((public.is_owner() OR public.is_global_manager() OR (public.current_employee_role() = 'gerente'::text)) AND (((scope = 'employee'::public.document_scope) AND (public.is_owner() OR public.is_global_manager() OR ((public.current_employee_role() = 'gerente'::text) AND (target_employee_id IN ( SELECT e.id
   FROM public.employees e
  WHERE (e.site_id = ( SELECT me.site_id
           FROM public.employees me
          WHERE (me.id = auth.uid())))))))) OR ((scope = 'site'::public.document_scope) AND (public.is_owner() OR public.is_global_manager() OR ((public.current_employee_role() = 'gerente'::text) AND (site_id = ( SELECT me.site_id
   FROM public.employees me
  WHERE (me.id = auth.uid())))))) OR ((scope = 'group'::public.document_scope) AND (public.is_owner() OR public.is_global_manager())))));



  create policy "documents_select"
  on "public"."documents"
  as permissive
  for select
  to public
using ((public.is_owner() OR public.is_global_manager() OR ((public.current_employee_role() = 'gerente'::text) AND (((scope = 'site'::public.document_scope) AND (site_id = ( SELECT me.site_id
   FROM public.employees me
  WHERE (me.id = auth.uid())))) OR ((scope = 'employee'::public.document_scope) AND (target_employee_id IN ( SELECT e.id
   FROM public.employees e
  WHERE (e.site_id = ( SELECT me.site_id
           FROM public.employees me
          WHERE (me.id = auth.uid())))))) OR (scope = 'group'::public.document_scope))) OR (((scope = 'employee'::public.document_scope) AND (target_employee_id = auth.uid())) OR ((scope = 'site'::public.document_scope) AND (site_id IN ( SELECT employees.site_id
   FROM public.employees
  WHERE (employees.id = auth.uid())
UNION
 SELECT es.site_id
   FROM public.employee_sites es
  WHERE ((es.employee_id = auth.uid()) AND (es.is_active = true))))))));



  create policy "documents_update_owner"
  on "public"."documents"
  as permissive
  for update
  to public
using (((owner_employee_id = auth.uid()) AND (status = 'pending_review'::public.document_status)))
with check (((owner_employee_id = auth.uid()) AND (status = 'pending_review'::public.document_status)));



  create policy "documents_update_review"
  on "public"."documents"
  as permissive
  for update
  to public
using (((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.employees e
     JOIN public.employee_sites es ON ((es.employee_id = e.id)))
  WHERE ((e.id = auth.uid()) AND (e.role = 'gerente'::text) AND (es.site_id = documents.site_id) AND (es.is_active = true))))))
with check (((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.employees e
     JOIN public.employee_sites es ON ((es.employee_id = e.id)))
  WHERE ((e.id = auth.uid()) AND (e.role = 'gerente'::text) AND (es.site_id = documents.site_id) AND (es.is_active = true))))));



  create policy "documents_write_restrict_delete_owner_manager"
  on "public"."documents"
  as restrictive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text, 'gerente'::text]))))));



  create policy "documents_write_restrict_insert_owner_manager"
  on "public"."documents"
  as restrictive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text, 'gerente'::text]))))));



  create policy "documents_write_restrict_update_owner_manager"
  on "public"."documents"
  as restrictive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text, 'gerente'::text]))))))
with check ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text, 'gerente'::text]))))));



  create policy "employee_devices_insert"
  on "public"."employee_devices"
  as permissive
  for insert
  to public
with check ((employee_id = auth.uid()));



  create policy "employee_devices_select"
  on "public"."employee_devices"
  as permissive
  for select
  to public
using ((employee_id = auth.uid()));



  create policy "employee_devices_update"
  on "public"."employee_devices"
  as permissive
  for update
  to public
using ((employee_id = auth.uid()))
with check ((employee_id = auth.uid()));



  create policy "employee_permissions_manage_owner"
  on "public"."employee_permissions"
  as permissive
  for all
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "employee_permissions_select_owner"
  on "public"."employee_permissions"
  as permissive
  for select
  to authenticated
using ((public.is_owner() OR public.is_global_manager()));



  create policy "employee_permissions_select_self"
  on "public"."employee_permissions"
  as permissive
  for select
  to authenticated
using ((employee_id = auth.uid()));



  create policy "employee_push_tokens_delete_self"
  on "public"."employee_push_tokens"
  as permissive
  for delete
  to public
using ((employee_id = auth.uid()));



  create policy "employee_push_tokens_insert_self"
  on "public"."employee_push_tokens"
  as permissive
  for insert
  to public
with check ((employee_id = auth.uid()));



  create policy "employee_push_tokens_select_self"
  on "public"."employee_push_tokens"
  as permissive
  for select
  to public
using ((employee_id = auth.uid()));



  create policy "employee_push_tokens_update_self"
  on "public"."employee_push_tokens"
  as permissive
  for update
  to public
using ((employee_id = auth.uid()))
with check ((employee_id = auth.uid()));



  create policy "employee_sites_read_management"
  on "public"."employee_sites"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees me
  WHERE ((me.id = auth.uid()) AND (me.is_active IS TRUE) AND (me.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text]))))));



  create policy "employee_sites_read_self"
  on "public"."employee_sites"
  as permissive
  for select
  to authenticated
using ((employee_id = auth.uid()));



  create policy "employee_sites_select"
  on "public"."employee_sites"
  as permissive
  for select
  to public
using (((auth.role() = 'authenticated'::text) AND (public.is_owner() OR public.is_global_manager() OR ((public.current_employee_role() = 'gerente'::text) AND (employee_id IN ( SELECT e.id
   FROM public.employees e
  WHERE (e.site_id = ( SELECT me.site_id
           FROM public.employees me
          WHERE (me.id = auth.uid())))))) OR (employee_id = auth.uid()))));



  create policy "employee_sites_write_admin"
  on "public"."employee_sites"
  as permissive
  for all
  to public
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "employees_insert_owner_global_manager"
  on "public"."employees"
  as permissive
  for insert
  to authenticated
with check ((public.is_owner() OR (public.is_global_manager() AND (role <> ALL (ARRAY['propietario'::text, 'gerente_general'::text])))));



  create policy "employees_select"
  on "public"."employees"
  as permissive
  for select
  to public
using (((auth.role() = 'authenticated'::text) AND (public.is_owner() OR public.is_global_manager() OR ((public.current_employee_role() = 'gerente'::text) AND (site_id = public.current_employee_site_id())) OR (id = auth.uid()))));



  create policy "employees_update"
  on "public"."employees"
  as permissive
  for update
  to public
using ((public.is_owner() OR public.is_global_manager() OR ((public.current_employee_role() = 'gerente'::text) AND (site_id = public.current_employee_site_id())) OR (id = auth.uid())))
with check ((public.is_owner() OR (public.is_global_manager() AND (role <> ALL (ARRAY['propietario'::text, 'gerente_general'::text]))) OR ((public.current_employee_role() = 'gerente'::text) AND (role <> ALL (ARRAY['propietario'::text, 'gerente_general'::text, 'gerente'::text])) AND (site_id = public.current_employee_site_id())) OR ((id = auth.uid()) AND (role = public.current_employee_role()))));



  create policy "inventory_entries_delete_permission"
  on "public"."inventory_entries"
  as permissive
  for delete
  to authenticated
using ((public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id)));



  create policy "inventory_entries_insert_permission"
  on "public"."inventory_entries"
  as permissive
  for insert
  to authenticated
with check ((public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id)));



  create policy "inventory_entries_select_permission"
  on "public"."inventory_entries"
  as permissive
  for select
  to authenticated
using ((public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id) OR public.has_permission('nexo.inventory.stock'::text, site_id)));



  create policy "inventory_entries_update_permission"
  on "public"."inventory_entries"
  as permissive
  for update
  to authenticated
using ((public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id)))
with check ((public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id)));



  create policy "inventory_entry_items_delete_permission"
  on "public"."inventory_entry_items"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_entries ie
  WHERE ((ie.id = inventory_entry_items.entry_id) AND (public.has_permission('nexo.inventory.entries'::text, ie.site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, ie.site_id) OR public.has_permission('origo.procurement.receipts'::text, ie.site_id))))));



  create policy "inventory_entry_items_insert_permission"
  on "public"."inventory_entry_items"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.inventory_entries ie
  WHERE ((ie.id = inventory_entry_items.entry_id) AND (public.has_permission('nexo.inventory.entries'::text, ie.site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, ie.site_id) OR public.has_permission('origo.procurement.receipts'::text, ie.site_id))))));



  create policy "inventory_entry_items_select_permission"
  on "public"."inventory_entry_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_entries ie
  WHERE ((ie.id = inventory_entry_items.entry_id) AND (public.has_permission('nexo.inventory.entries'::text, ie.site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, ie.site_id) OR public.has_permission('origo.procurement.receipts'::text, ie.site_id) OR public.has_permission('nexo.inventory.stock'::text, ie.site_id))))));



  create policy "inventory_entry_items_update_permission"
  on "public"."inventory_entry_items"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_entries ie
  WHERE ((ie.id = inventory_entry_items.entry_id) AND (public.has_permission('nexo.inventory.entries'::text, ie.site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, ie.site_id) OR public.has_permission('origo.procurement.receipts'::text, ie.site_id))))))
with check ((EXISTS ( SELECT 1
   FROM public.inventory_entries ie
  WHERE ((ie.id = inventory_entry_items.entry_id) AND (public.has_permission('nexo.inventory.entries'::text, ie.site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, ie.site_id) OR public.has_permission('origo.procurement.receipts'::text, ie.site_id))))));



  create policy "inventory_locations_delete_permission"
  on "public"."inventory_locations"
  as permissive
  for delete
  to authenticated
using (public.has_permission('nexo.inventory.locations'::text, site_id));



  create policy "inventory_locations_insert_permission"
  on "public"."inventory_locations"
  as permissive
  for insert
  to authenticated
with check (public.has_permission('nexo.inventory.locations'::text, site_id));



  create policy "inventory_locations_select_permission"
  on "public"."inventory_locations"
  as permissive
  for select
  to authenticated
using ((public.has_permission('nexo.inventory.locations'::text, site_id) OR public.has_permission('nexo.inventory.withdraw'::text, site_id)));



  create policy "inventory_locations_update_permission"
  on "public"."inventory_locations"
  as permissive
  for update
  to authenticated
using (public.has_permission('nexo.inventory.locations'::text, site_id))
with check (public.has_permission('nexo.inventory.locations'::text, site_id));



  create policy "inventory_lpns_delete_permission"
  on "public"."inventory_lpns"
  as permissive
  for delete
  to authenticated
using (public.has_permission('nexo.inventory.lpns'::text, site_id));



  create policy "inventory_lpns_insert_permission"
  on "public"."inventory_lpns"
  as permissive
  for insert
  to authenticated
with check (public.has_permission('nexo.inventory.lpns'::text, site_id));



  create policy "inventory_lpns_select_permission"
  on "public"."inventory_lpns"
  as permissive
  for select
  to authenticated
using (public.has_permission('nexo.inventory.lpns'::text, site_id));



  create policy "inventory_lpns_update_permission"
  on "public"."inventory_lpns"
  as permissive
  for update
  to authenticated
using (public.has_permission('nexo.inventory.lpns'::text, site_id))
with check (public.has_permission('nexo.inventory.lpns'::text, site_id));



  create policy "inventory_movements_insert_permission"
  on "public"."inventory_movements"
  as permissive
  for insert
  to authenticated
with check ((public.has_permission('nexo.inventory.movements'::text, site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, site_id) OR public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('nexo.inventory.transfers'::text, site_id) OR public.has_permission('nexo.inventory.withdraw'::text, site_id) OR public.has_permission('nexo.inventory.counts'::text, site_id) OR public.has_permission('nexo.inventory.adjustments'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id) OR public.has_permission('fogo.production.batches'::text, site_id)));



  create policy "inventory_movements_select_permission"
  on "public"."inventory_movements"
  as permissive
  for select
  to authenticated
using (public.has_permission('nexo.inventory.movements'::text, site_id));



  create policy "inventory_stock_by_location_delete_permission"
  on "public"."inventory_stock_by_location"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_locations loc
  WHERE ((loc.id = inventory_stock_by_location.location_id) AND public.has_permission('nexo.inventory.stock'::text, loc.site_id)))));



  create policy "inventory_stock_by_location_insert_permission"
  on "public"."inventory_stock_by_location"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.inventory_locations loc
  WHERE ((loc.id = inventory_stock_by_location.location_id) AND (public.has_permission('nexo.inventory.stock'::text, loc.site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, loc.site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, loc.site_id) OR public.has_permission('nexo.inventory.entries'::text, loc.site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, loc.site_id) OR public.has_permission('nexo.inventory.transfers'::text, loc.site_id) OR public.has_permission('nexo.inventory.withdraw'::text, loc.site_id) OR public.has_permission('nexo.inventory.counts'::text, loc.site_id) OR public.has_permission('nexo.inventory.adjustments'::text, loc.site_id) OR public.has_permission('origo.procurement.receipts'::text, loc.site_id) OR public.has_permission('fogo.production.batches'::text, loc.site_id))))));



  create policy "inventory_stock_by_location_select_permission"
  on "public"."inventory_stock_by_location"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_locations loc
  WHERE ((loc.id = inventory_stock_by_location.location_id) AND (public.has_permission('nexo.inventory.stock'::text, loc.site_id) OR public.has_permission('nexo.inventory.withdraw'::text, loc.site_id))))));



  create policy "inventory_stock_by_location_update_permission"
  on "public"."inventory_stock_by_location"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_locations loc
  WHERE ((loc.id = inventory_stock_by_location.location_id) AND (public.has_permission('nexo.inventory.stock'::text, loc.site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, loc.site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, loc.site_id) OR public.has_permission('nexo.inventory.entries'::text, loc.site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, loc.site_id) OR public.has_permission('nexo.inventory.transfers'::text, loc.site_id) OR public.has_permission('nexo.inventory.withdraw'::text, loc.site_id) OR public.has_permission('nexo.inventory.counts'::text, loc.site_id) OR public.has_permission('nexo.inventory.adjustments'::text, loc.site_id) OR public.has_permission('origo.procurement.receipts'::text, loc.site_id) OR public.has_permission('fogo.production.batches'::text, loc.site_id))))))
with check ((EXISTS ( SELECT 1
   FROM public.inventory_locations loc
  WHERE ((loc.id = inventory_stock_by_location.location_id) AND (public.has_permission('nexo.inventory.stock'::text, loc.site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, loc.site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, loc.site_id) OR public.has_permission('nexo.inventory.entries'::text, loc.site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, loc.site_id) OR public.has_permission('nexo.inventory.transfers'::text, loc.site_id) OR public.has_permission('nexo.inventory.withdraw'::text, loc.site_id) OR public.has_permission('nexo.inventory.counts'::text, loc.site_id) OR public.has_permission('nexo.inventory.adjustments'::text, loc.site_id) OR public.has_permission('origo.procurement.receipts'::text, loc.site_id) OR public.has_permission('fogo.production.batches'::text, loc.site_id))))));



  create policy "inventory_stock_insert_permission"
  on "public"."inventory_stock_by_site"
  as permissive
  for insert
  to authenticated
with check ((public.has_permission('nexo.inventory.stock'::text, site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, site_id) OR public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('nexo.inventory.transfers'::text, site_id) OR public.has_permission('nexo.inventory.withdraw'::text, site_id) OR public.has_permission('nexo.inventory.counts'::text, site_id) OR public.has_permission('nexo.inventory.adjustments'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id) OR public.has_permission('fogo.production.batches'::text, site_id)));



  create policy "inventory_stock_select_permission"
  on "public"."inventory_stock_by_site"
  as permissive
  for select
  to authenticated
using ((public.has_permission('nexo.inventory.stock'::text, site_id) OR public.has_permission('nexo.inventory.withdraw'::text, site_id)));



  create policy "inventory_stock_update_permission"
  on "public"."inventory_stock_by_site"
  as permissive
  for update
  to authenticated
using ((public.has_permission('nexo.inventory.stock'::text, site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, site_id) OR public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('nexo.inventory.transfers'::text, site_id) OR public.has_permission('nexo.inventory.withdraw'::text, site_id) OR public.has_permission('nexo.inventory.counts'::text, site_id) OR public.has_permission('nexo.inventory.adjustments'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id) OR public.has_permission('fogo.production.batches'::text, site_id)))
with check ((public.has_permission('nexo.inventory.stock'::text, site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, site_id) OR public.has_permission('nexo.inventory.entries'::text, site_id) OR public.has_permission('nexo.inventory.entries_emergency'::text, site_id) OR public.has_permission('nexo.inventory.transfers'::text, site_id) OR public.has_permission('nexo.inventory.withdraw'::text, site_id) OR public.has_permission('nexo.inventory.counts'::text, site_id) OR public.has_permission('nexo.inventory.adjustments'::text, site_id) OR public.has_permission('origo.procurement.receipts'::text, site_id) OR public.has_permission('fogo.production.batches'::text, site_id)));



  create policy "inventory_transfer_items_delete_permission"
  on "public"."inventory_transfer_items"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_transfers it
  WHERE ((it.id = inventory_transfer_items.transfer_id) AND public.has_permission('nexo.inventory.transfers'::text, it.site_id)))));



  create policy "inventory_transfer_items_insert_permission"
  on "public"."inventory_transfer_items"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.inventory_transfers it
  WHERE ((it.id = inventory_transfer_items.transfer_id) AND public.has_permission('nexo.inventory.transfers'::text, it.site_id)))));



  create policy "inventory_transfer_items_select_permission"
  on "public"."inventory_transfer_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_transfers it
  WHERE ((it.id = inventory_transfer_items.transfer_id) AND (public.has_permission('nexo.inventory.transfers'::text, it.site_id) OR public.has_permission('nexo.inventory.stock'::text, it.site_id))))));



  create policy "inventory_transfer_items_update_permission"
  on "public"."inventory_transfer_items"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.inventory_transfers it
  WHERE ((it.id = inventory_transfer_items.transfer_id) AND public.has_permission('nexo.inventory.transfers'::text, it.site_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.inventory_transfers it
  WHERE ((it.id = inventory_transfer_items.transfer_id) AND public.has_permission('nexo.inventory.transfers'::text, it.site_id)))));



  create policy "inventory_transfers_delete_permission"
  on "public"."inventory_transfers"
  as permissive
  for delete
  to authenticated
using (public.has_permission('nexo.inventory.transfers'::text, site_id));



  create policy "inventory_transfers_insert_permission"
  on "public"."inventory_transfers"
  as permissive
  for insert
  to authenticated
with check (public.has_permission('nexo.inventory.transfers'::text, site_id));



  create policy "inventory_transfers_select_permission"
  on "public"."inventory_transfers"
  as permissive
  for select
  to authenticated
using ((public.has_permission('nexo.inventory.transfers'::text, site_id) OR public.has_permission('nexo.inventory.stock'::text, site_id)));



  create policy "inventory_transfers_update_permission"
  on "public"."inventory_transfers"
  as permissive
  for update
  to authenticated
using (public.has_permission('nexo.inventory.transfers'::text, site_id))
with check (public.has_permission('nexo.inventory.transfers'::text, site_id));



  create policy "loyalty_external_sales_insert_staff"
  on "public"."loyalty_external_sales"
  as permissive
  for insert
  to authenticated
with check ((public.is_active_staff() AND public.has_permission('pulso.pos.main'::text, site_id, NULL::uuid) AND (awarded_by = auth.uid())));



  create policy "loyalty_external_sales_select_staff"
  on "public"."loyalty_external_sales"
  as permissive
  for select
  to authenticated
using ((public.is_active_staff() AND public.has_permission('pulso.pos.main'::text, site_id, NULL::uuid)));



  create policy "pass_satellites_delete_admin"
  on "public"."pass_satellites"
  as permissive
  for delete
  to authenticated
using ((public.is_owner() OR public.is_global_manager()));



  create policy "pass_satellites_insert_admin"
  on "public"."pass_satellites"
  as permissive
  for insert
  to authenticated
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "pass_satellites_select_admin"
  on "public"."pass_satellites"
  as permissive
  for select
  to authenticated
using ((public.is_owner() OR public.is_global_manager()));



  create policy "pass_satellites_update_admin"
  on "public"."pass_satellites"
  as permissive
  for update
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "procurement_reception_items_delete_permission"
  on "public"."procurement_reception_items"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.procurement_receptions pr
  WHERE ((pr.id = procurement_reception_items.reception_id) AND public.has_permission('nexo.inventory.stock'::text, pr.site_id)))));



  create policy "procurement_reception_items_insert_permission"
  on "public"."procurement_reception_items"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.procurement_receptions pr
  WHERE ((pr.id = procurement_reception_items.reception_id) AND public.has_permission('nexo.inventory.stock'::text, pr.site_id)))));



  create policy "procurement_reception_items_select_permission"
  on "public"."procurement_reception_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.procurement_receptions pr
  WHERE ((pr.id = procurement_reception_items.reception_id) AND public.has_permission('nexo.inventory.stock'::text, pr.site_id)))));



  create policy "procurement_reception_items_update_permission"
  on "public"."procurement_reception_items"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.procurement_receptions pr
  WHERE ((pr.id = procurement_reception_items.reception_id) AND public.has_permission('nexo.inventory.stock'::text, pr.site_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.procurement_receptions pr
  WHERE ((pr.id = procurement_reception_items.reception_id) AND public.has_permission('nexo.inventory.stock'::text, pr.site_id)))));



  create policy "procurement_receptions_delete_permission"
  on "public"."procurement_receptions"
  as permissive
  for delete
  to authenticated
using (public.has_permission('nexo.inventory.stock'::text, site_id));



  create policy "procurement_receptions_insert_permission"
  on "public"."procurement_receptions"
  as permissive
  for insert
  to authenticated
with check (public.has_permission('nexo.inventory.stock'::text, site_id));



  create policy "procurement_receptions_select_permission"
  on "public"."procurement_receptions"
  as permissive
  for select
  to authenticated
using (public.has_permission('nexo.inventory.stock'::text, site_id));



  create policy "procurement_receptions_update_permission"
  on "public"."procurement_receptions"
  as permissive
  for update
  to authenticated
using (public.has_permission('nexo.inventory.stock'::text, site_id))
with check (public.has_permission('nexo.inventory.stock'::text, site_id));



  create policy "product_site_settings_select_staff"
  on "public"."product_site_settings"
  as permissive
  for select
  to public
using (public.is_employee());



  create policy "product_site_settings_write_owner"
  on "public"."product_site_settings"
  as permissive
  for all
  to public
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "pss_select_authenticated"
  on "public"."product_site_settings"
  as permissive
  for select
  to authenticated
using (true);



  create policy "pss_write_authenticated"
  on "public"."product_site_settings"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "restock_request_items_insert_permission"
  on "public"."restock_request_items"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.restock_requests r
  WHERE ((r.id = restock_request_items.request_id) AND (public.has_permission('nexo.inventory.remissions.request'::text, r.to_site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, r.from_site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, r.to_site_id) OR public.has_permission('nexo.inventory.remissions.cancel'::text))))));



  create policy "restock_request_items_select_permission"
  on "public"."restock_request_items"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.restock_requests r
  WHERE ((r.id = restock_request_items.request_id) AND (public.has_permission('nexo.inventory.remissions'::text, r.from_site_id) OR public.has_permission('nexo.inventory.remissions'::text, r.to_site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, r.from_site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, r.to_site_id) OR public.has_permission('nexo.inventory.remissions.all_sites'::text))))));



  create policy "restock_request_items_update_permission"
  on "public"."restock_request_items"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.restock_requests r
  WHERE ((r.id = restock_request_items.request_id) AND (public.has_permission('nexo.inventory.remissions.request'::text, r.to_site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, r.from_site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, r.to_site_id) OR public.has_permission('nexo.inventory.remissions.cancel'::text))))))
with check ((EXISTS ( SELECT 1
   FROM public.restock_requests r
  WHERE ((r.id = restock_request_items.request_id) AND (public.has_permission('nexo.inventory.remissions.request'::text, r.to_site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, r.from_site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, r.to_site_id) OR public.has_permission('nexo.inventory.remissions.cancel'::text))))));



  create policy "restock_requests_delete_permission"
  on "public"."restock_requests"
  as permissive
  for delete
  to authenticated
using ((public.has_permission('nexo.inventory.remissions.cancel'::text) OR ((created_by = auth.uid()) AND (status = ANY (ARRAY['pending'::text, 'preparing'::text])))));



  create policy "restock_requests_insert_permission"
  on "public"."restock_requests"
  as permissive
  for insert
  to authenticated
with check (((to_site_id IS NOT NULL) AND public.has_permission('nexo.inventory.remissions.request'::text, to_site_id)));



  create policy "restock_requests_select_permission"
  on "public"."restock_requests"
  as permissive
  for select
  to authenticated
using ((public.has_permission('nexo.inventory.remissions'::text, from_site_id) OR public.has_permission('nexo.inventory.remissions'::text, to_site_id) OR public.has_permission('nexo.inventory.remissions.prepare'::text, from_site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, to_site_id) OR public.has_permission('nexo.inventory.remissions.all_sites'::text)));



  create policy "restock_requests_update_permission"
  on "public"."restock_requests"
  as permissive
  for update
  to authenticated
using ((public.has_permission('nexo.inventory.remissions.prepare'::text, from_site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, to_site_id) OR public.has_permission('nexo.inventory.remissions.cancel'::text) OR ((created_by = auth.uid()) AND (status = ANY (ARRAY['pending'::text, 'preparing'::text])))))
with check ((public.has_permission('nexo.inventory.remissions.prepare'::text, from_site_id) OR public.has_permission('nexo.inventory.remissions.receive'::text, to_site_id) OR public.has_permission('nexo.inventory.remissions.cancel'::text) OR ((created_by = auth.uid()) AND (status = ANY (ARRAY['pending'::text, 'preparing'::text])))));



  create policy "role_permissions_manage_owner"
  on "public"."role_permissions"
  as permissive
  for all
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "role_permissions_select_all"
  on "public"."role_permissions"
  as permissive
  for select
  to authenticated
using (true);



  create policy "role_site_type_rules_manage_owner"
  on "public"."role_site_type_rules"
  as permissive
  for all
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "role_site_type_rules_select_all"
  on "public"."role_site_type_rules"
  as permissive
  for select
  to authenticated
using (true);



  create policy "roles_manage_owner"
  on "public"."roles"
  as permissive
  for all
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "roles_select"
  on "public"."roles"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "roles_select_all"
  on "public"."roles"
  as permissive
  for select
  to authenticated
using (true);



  create policy "site_supply_routes_manage_owner"
  on "public"."site_supply_routes"
  as permissive
  for all
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "site_supply_routes_select_all"
  on "public"."site_supply_routes"
  as permissive
  for select
  to authenticated
using (true);



  create policy "sites_select"
  on "public"."sites"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "sites_select_owner_manager"
  on "public"."sites"
  as permissive
  for select
  to authenticated
using ((public.is_owner() OR public.is_global_manager()));



  create policy "suppliers_delete_owner_manager"
  on "public"."suppliers"
  as permissive
  for delete
  to authenticated
using ((public.is_owner() OR public.is_global_manager() OR public.is_manager()));



  create policy "suppliers_insert_owner_manager"
  on "public"."suppliers"
  as permissive
  for insert
  to authenticated
with check ((public.is_owner() OR public.is_global_manager() OR public.is_manager()));



  create policy "suppliers_update_owner_manager"
  on "public"."suppliers"
  as permissive
  for update
  to authenticated
using ((public.is_owner() OR public.is_global_manager() OR public.is_manager()))
with check ((public.is_owner() OR public.is_global_manager() OR public.is_manager()));



  create policy "support_messages_insert"
  on "public"."support_messages"
  as permissive
  for insert
  to public
with check (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND ((t.created_by = auth.uid()) OR (t.assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.employees e
          WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text]))))) OR (EXISTS ( SELECT 1
           FROM (public.employees e
             JOIN public.employee_sites es ON ((es.employee_id = e.id)))
          WHERE ((e.id = auth.uid()) AND (e.role = 'gerente'::text) AND (es.site_id = t.site_id) AND (es.is_active = true))))))))));



  create policy "support_messages_select"
  on "public"."support_messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.support_tickets t
  WHERE ((t.id = support_messages.ticket_id) AND ((t.created_by = auth.uid()) OR (t.assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.employees e
          WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text]))))) OR (EXISTS ( SELECT 1
           FROM (public.employees e
             JOIN public.employee_sites es ON ((es.employee_id = e.id)))
          WHERE ((e.id = auth.uid()) AND (e.role = 'gerente'::text) AND (es.site_id = t.site_id) AND (es.is_active = true)))))))));



  create policy "support_tickets_insert"
  on "public"."support_tickets"
  as permissive
  for insert
  to public
with check ((created_by = auth.uid()));



  create policy "support_tickets_select"
  on "public"."support_tickets"
  as permissive
  for select
  to public
using (((created_by = auth.uid()) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.employees e
     JOIN public.employee_sites es ON ((es.employee_id = e.id)))
  WHERE ((e.id = auth.uid()) AND (e.role = 'gerente'::text) AND (es.site_id = support_tickets.site_id) AND (es.is_active = true))))));



  create policy "support_tickets_update"
  on "public"."support_tickets"
  as permissive
  for update
  to public
using (((created_by = auth.uid()) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.employees e
     JOIN public.employee_sites es ON ((es.employee_id = e.id)))
  WHERE ((e.id = auth.uid()) AND (e.role = 'gerente'::text) AND (es.site_id = support_tickets.site_id) AND (es.is_active = true))))))
with check (((created_by = auth.uid()) OR (assigned_to = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text]))))) OR (EXISTS ( SELECT 1
   FROM (public.employees e
     JOIN public.employee_sites es ON ((es.employee_id = e.id)))
  WHERE ((e.id = auth.uid()) AND (e.role = 'gerente'::text) AND (es.site_id = support_tickets.site_id) AND (es.is_active = true))))));



  create policy "users_delete_admin"
  on "public"."users"
  as permissive
  for delete
  to authenticated
using ((public.is_owner() OR public.is_global_manager()));



  create policy "users_insert_admin"
  on "public"."users"
  as permissive
  for insert
  to authenticated
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "users_update_admin"
  on "public"."users"
  as permissive
  for update
  to authenticated
using ((public.is_owner() OR public.is_global_manager()))
with check ((public.is_owner() OR public.is_global_manager()));



  create policy "adaptive_decision_logs_delete"
  on "vital"."adaptive_decision_logs"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "adaptive_decision_logs_insert"
  on "vital"."adaptive_decision_logs"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "adaptive_decision_logs_select"
  on "vital"."adaptive_decision_logs"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "adaptive_decision_logs_update"
  on "vital"."adaptive_decision_logs"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "admin_users_manage_service_only"
  on "vital"."admin_users"
  as permissive
  for all
  to public
using (vital.is_service_role())
with check (vital.is_service_role());



  create policy "admin_users_select_self"
  on "vital"."admin_users"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "availability_profiles_delete"
  on "vital"."availability_profiles"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "availability_profiles_insert"
  on "vital"."availability_profiles"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "availability_profiles_select"
  on "vital"."availability_profiles"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "availability_profiles_update"
  on "vital"."availability_profiles"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "badges_manage_admin"
  on "vital"."badges"
  as permissive
  for all
  to public
using ((vital.is_vital_admin() OR vital.is_service_role()))
with check ((vital.is_vital_admin() OR vital.is_service_role()));



  create policy "badges_read_all_authenticated"
  on "vital"."badges"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "body_metrics_delete"
  on "vital"."body_metrics"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "body_metrics_insert"
  on "vital"."body_metrics"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "body_metrics_select"
  on "vital"."body_metrics"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "body_metrics_update"
  on "vital"."body_metrics"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "challenge_progress_delete"
  on "vital"."challenge_progress"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "challenge_progress_insert"
  on "vital"."challenge_progress"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "challenge_progress_select"
  on "vital"."challenge_progress"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "challenge_progress_update"
  on "vital"."challenge_progress"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "challenges_delete_creator_or_admin"
  on "vital"."challenges"
  as permissive
  for delete
  to public
using (((created_by_user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "challenges_insert_creator_or_admin"
  on "vital"."challenges"
  as permissive
  for insert
  to public
with check (((created_by_user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "challenges_select_authenticated"
  on "vital"."challenges"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "challenges_update_creator_or_admin"
  on "vital"."challenges"
  as permissive
  for update
  to public
using (((created_by_user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()))
with check (((created_by_user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "consent_records_delete"
  on "vital"."consent_records"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "consent_records_insert"
  on "vital"."consent_records"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "consent_records_select"
  on "vital"."consent_records"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "consent_records_update"
  on "vital"."consent_records"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "daily_readiness_inputs_delete"
  on "vital"."daily_readiness_inputs"
  as permissive
  for delete
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "daily_readiness_inputs_insert"
  on "vital"."daily_readiness_inputs"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "daily_readiness_inputs_select"
  on "vital"."daily_readiness_inputs"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "daily_readiness_inputs_update"
  on "vital"."daily_readiness_inputs"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()))
with check (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "fair_play_events_delete"
  on "vital"."fair_play_events"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "fair_play_events_insert"
  on "vital"."fair_play_events"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "fair_play_events_select"
  on "vital"."fair_play_events"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "fair_play_events_update"
  on "vital"."fair_play_events"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "fatigue_scores_delete"
  on "vital"."fatigue_scores"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "fatigue_scores_insert"
  on "vital"."fatigue_scores"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "fatigue_scores_select"
  on "vital"."fatigue_scores"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "fatigue_scores_update"
  on "vital"."fatigue_scores"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "feature_flags_manage_admin"
  on "vital"."feature_flags"
  as permissive
  for all
  to public
using ((vital.is_vital_admin() OR vital.is_service_role()))
with check ((vital.is_vital_admin() OR vital.is_service_role()));



  create policy "feature_flags_read_authenticated"
  on "vital"."feature_flags"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "game_profiles_delete"
  on "vital"."game_profiles"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "game_profiles_insert"
  on "vital"."game_profiles"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "game_profiles_select"
  on "vital"."game_profiles"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "game_profiles_update"
  on "vital"."game_profiles"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "goal_profiles_delete"
  on "vital"."goal_profiles"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "goal_profiles_insert"
  on "vital"."goal_profiles"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "goal_profiles_select"
  on "vital"."goal_profiles"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "goal_profiles_update"
  on "vital"."goal_profiles"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "health_profiles_delete"
  on "vital"."health_profiles"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "health_profiles_insert"
  on "vital"."health_profiles"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "health_profiles_select"
  on "vital"."health_profiles"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "health_profiles_update"
  on "vital"."health_profiles"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "league_memberships_delete"
  on "vital"."league_memberships"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "league_memberships_insert"
  on "vital"."league_memberships"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "league_memberships_select"
  on "vital"."league_memberships"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "league_memberships_update"
  on "vital"."league_memberships"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "level_states_delete"
  on "vital"."level_states"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "level_states_insert"
  on "vital"."level_states"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "level_states_select"
  on "vital"."level_states"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "level_states_update"
  on "vital"."level_states"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "module_catalog_manage_admin"
  on "vital"."module_catalog"
  as permissive
  for all
  to public
using ((vital.is_vital_admin() OR vital.is_service_role()))
with check ((vital.is_vital_admin() OR vital.is_service_role()));



  create policy "module_catalog_read_authenticated"
  on "vital"."module_catalog"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "module_template_catalog_manage_admin"
  on "vital"."module_template_catalog"
  as permissive
  for all
  to public
using ((vital.is_vital_admin() OR vital.is_service_role()))
with check ((vital.is_vital_admin() OR vital.is_service_role()));



  create policy "module_template_catalog_read_authenticated"
  on "vital"."module_template_catalog"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "muscle_load_snapshots_delete"
  on "vital"."muscle_load_snapshots"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "muscle_load_snapshots_insert"
  on "vital"."muscle_load_snapshots"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "muscle_load_snapshots_select"
  on "vital"."muscle_load_snapshots"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "muscle_load_snapshots_update"
  on "vital"."muscle_load_snapshots"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "notification_plans_delete"
  on "vital"."notification_plans"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "notification_plans_insert"
  on "vital"."notification_plans"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "notification_plans_select"
  on "vital"."notification_plans"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "notification_plans_update"
  on "vital"."notification_plans"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "program_versions_delete"
  on "vital"."program_versions"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "program_versions_insert"
  on "vital"."program_versions"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "program_versions_select"
  on "vital"."program_versions"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "program_versions_update"
  on "vital"."program_versions"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "programs_delete"
  on "vital"."programs"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "programs_insert"
  on "vital"."programs"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "programs_select"
  on "vital"."programs"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "programs_update"
  on "vital"."programs"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "readiness_scores_delete"
  on "vital"."readiness_scores"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "readiness_scores_insert"
  on "vital"."readiness_scores"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "readiness_scores_select"
  on "vital"."readiness_scores"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "readiness_scores_update"
  on "vital"."readiness_scores"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "recovery_signals_delete"
  on "vital"."recovery_signals"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "recovery_signals_insert"
  on "vital"."recovery_signals"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "recovery_signals_select"
  on "vital"."recovery_signals"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "recovery_signals_update"
  on "vital"."recovery_signals"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "safety_intake_insert"
  on "vital"."safety_intake"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "safety_intake_select"
  on "vital"."safety_intake"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "safety_intake_update"
  on "vital"."safety_intake"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()))
with check (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "seasons_manage_admin"
  on "vital"."seasons"
  as permissive
  for all
  to public
using ((vital.is_vital_admin() OR vital.is_service_role()))
with check ((vital.is_vital_admin() OR vital.is_service_role()));



  create policy "seasons_read_all_authenticated"
  on "vital"."seasons"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "session_logs_delete"
  on "vital"."session_logs"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "session_logs_insert"
  on "vital"."session_logs"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "session_logs_select"
  on "vital"."session_logs"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "session_logs_update"
  on "vital"."session_logs"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "squad_memberships_delete"
  on "vital"."squad_memberships"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "squad_memberships_insert"
  on "vital"."squad_memberships"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "squad_memberships_select"
  on "vital"."squad_memberships"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "squad_memberships_update"
  on "vital"."squad_memberships"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "squads_delete_owner_or_admin"
  on "vital"."squads"
  as permissive
  for delete
  to public
using (((owner_user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "squads_insert_owner_or_admin"
  on "vital"."squads"
  as permissive
  for insert
  to public
with check (((owner_user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "squads_select_owner_or_member"
  on "vital"."squads"
  as permissive
  for select
  to public
using (((owner_user_id = auth.uid()) OR vital.is_squad_member(id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "squads_update_owner_or_admin"
  on "vital"."squads"
  as permissive
  for update
  to public
using (((owner_user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()))
with check (((owner_user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "starter_program_catalog_manage_admin"
  on "vital"."starter_program_catalog"
  as permissive
  for all
  to public
using ((vital.is_vital_admin() OR vital.is_service_role()))
with check ((vital.is_vital_admin() OR vital.is_service_role()));



  create policy "starter_program_catalog_read_authenticated"
  on "vital"."starter_program_catalog"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "starter_program_tasks_manage_admin"
  on "vital"."starter_program_tasks"
  as permissive
  for all
  to public
using ((vital.is_vital_admin() OR vital.is_service_role()))
with check ((vital.is_vital_admin() OR vital.is_service_role()));



  create policy "starter_program_tasks_read_authenticated"
  on "vital"."starter_program_tasks"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "task_instances_delete"
  on "vital"."task_instances"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "task_instances_insert"
  on "vital"."task_instances"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "task_instances_select"
  on "vital"."task_instances"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "task_instances_update"
  on "vital"."task_instances"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "task_templates_delete"
  on "vital"."task_templates"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "task_templates_insert"
  on "vital"."task_templates"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "task_templates_select"
  on "vital"."task_templates"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "task_templates_update"
  on "vital"."task_templates"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "telemetry_events_delete_admin"
  on "vital"."telemetry_events"
  as permissive
  for delete
  to public
using ((vital.is_vital_admin() OR vital.is_service_role()));



  create policy "telemetry_events_insert"
  on "vital"."telemetry_events"
  as permissive
  for insert
  to public
with check (((user_id IS NULL) OR (user_id = auth.uid()) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "telemetry_events_select"
  on "vital"."telemetry_events"
  as permissive
  for select
  to public
using ((((user_id IS NOT NULL) AND vital.can_access_user(user_id)) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "user_badges_delete"
  on "vital"."user_badges"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "user_badges_insert"
  on "vital"."user_badges"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "user_badges_select"
  on "vital"."user_badges"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "user_badges_update"
  on "vital"."user_badges"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "user_feature_flags_delete"
  on "vital"."user_feature_flags"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "user_feature_flags_insert"
  on "vital"."user_feature_flags"
  as permissive
  for insert
  to public
with check (vital.can_access_user(user_id));



  create policy "user_feature_flags_select"
  on "vital"."user_feature_flags"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "user_feature_flags_update"
  on "vital"."user_feature_flags"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "user_module_preferences_delete"
  on "vital"."user_module_preferences"
  as permissive
  for delete
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "user_module_preferences_insert"
  on "vital"."user_module_preferences"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "user_module_preferences_select"
  on "vital"."user_module_preferences"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "user_module_preferences_update"
  on "vital"."user_module_preferences"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) OR vital.is_service_role()))
with check (((auth.uid() = user_id) OR vital.is_service_role()));



  create policy "user_profiles_delete"
  on "vital"."user_profiles"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "user_profiles_insert"
  on "vital"."user_profiles"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "user_profiles_select"
  on "vital"."user_profiles"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "user_profiles_update"
  on "vital"."user_profiles"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "weekly_leaderboard_snapshots_delete"
  on "vital"."weekly_leaderboard_snapshots"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "weekly_leaderboard_snapshots_insert"
  on "vital"."weekly_leaderboard_snapshots"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "weekly_leaderboard_snapshots_select"
  on "vital"."weekly_leaderboard_snapshots"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "weekly_leaderboard_snapshots_update"
  on "vital"."weekly_leaderboard_snapshots"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "weekly_reviews_delete"
  on "vital"."weekly_reviews"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "weekly_reviews_insert"
  on "vital"."weekly_reviews"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "weekly_reviews_select"
  on "vital"."weekly_reviews"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "weekly_reviews_update"
  on "vital"."weekly_reviews"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "xp_events_delete"
  on "vital"."xp_events"
  as permissive
  for delete
  to public
using (vital.can_access_user(user_id));



  create policy "xp_events_insert"
  on "vital"."xp_events"
  as permissive
  for insert
  to public
with check (((auth.uid() = user_id) OR vital.is_vital_admin() OR vital.is_service_role()));



  create policy "xp_events_select"
  on "vital"."xp_events"
  as permissive
  for select
  to public
using (vital.can_access_user(user_id));



  create policy "xp_events_update"
  on "vital"."xp_events"
  as permissive
  for update
  to public
using (vital.can_access_user(user_id))
with check (vital.can_access_user(user_id));



  create policy "areas_select_staff"
  on "public"."areas"
  as permissive
  for select
  to public
using ((public.can_access_area(id) OR ((public.current_employee_role() = ANY (ARRAY['gerente'::text, 'bodeguero'::text])) AND public.can_access_site(site_id))));



  create policy "attendance_logs_select_manager"
  on "public"."attendance_logs"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text])) AND ((e.role = ANY (ARRAY['propietario'::text, 'gerente_general'::text])) OR (e.site_id = attendance_logs.site_id))))));



  create policy "employee_shifts_select_manager"
  on "public"."employee_shifts"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['gerente'::text])) AND (e.site_id = employee_shifts.site_id)))));



  create policy "employee_shifts_write_manager"
  on "public"."employee_shifts"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['gerente'::text])) AND (e.site_id = employee_shifts.site_id)))))
with check ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.role = ANY (ARRAY['gerente'::text])) AND (e.site_id = employee_shifts.site_id)))));



  create policy "employees_select_area"
  on "public"."employees"
  as permissive
  for select
  to public
using (((area_id IS NOT NULL) AND public.can_access_area(area_id) AND (public.is_owner() OR public.is_global_manager() OR (public.current_employee_role() <> 'gerente'::text) OR (site_id = public.current_employee_site_id()))));



  create policy "employees_select_manager"
  on "public"."employees"
  as permissive
  for select
  to public
using (((auth.role() = 'authenticated'::text) AND (public.is_owner() OR public.is_global_manager() OR ((public.current_employee_role() = 'gerente'::text) AND (site_id = public.current_employee_site_id())) OR ((public.current_employee_role() = 'bodeguero'::text) AND public.can_access_site(site_id)))));



  create policy "loyalty_redemptions_select_cashier"
  on "public"."loyalty_redemptions"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public.employees e
     JOIN public.loyalty_rewards r ON ((r.id = loyalty_redemptions.reward_id)))
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text, 'mesero'::text])) AND ((e.site_id = r.site_id) OR (EXISTS ( SELECT 1
           FROM public.employee_sites es
          WHERE ((es.employee_id = e.id) AND (es.is_active = true) AND (es.site_id = r.site_id)))))))));



  create policy "loyalty_redemptions_validate_cashier"
  on "public"."loyalty_redemptions"
  as permissive
  for update
  to authenticated
using (((status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM (public.employees e
     JOIN public.loyalty_rewards r ON ((r.id = loyalty_redemptions.reward_id)))
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text, 'mesero'::text])) AND ((e.site_id = r.site_id) OR (EXISTS ( SELECT 1
           FROM public.employee_sites es
          WHERE ((es.employee_id = e.id) AND (es.is_active = true) AND (es.site_id = r.site_id))))))))))
with check (((status = 'validated'::text) AND (EXISTS ( SELECT 1
   FROM (public.employees e
     JOIN public.loyalty_rewards r ON ((r.id = loyalty_redemptions.reward_id)))
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text, 'mesero'::text])) AND ((e.site_id = r.site_id) OR (EXISTS ( SELECT 1
           FROM public.employee_sites es
          WHERE ((es.employee_id = e.id) AND (es.is_active = true) AND (es.site_id = r.site_id))))))))));



  create policy "production_batches_write_production"
  on "public"."production_batches"
  as permissive
  for all
  to public
using (((public.current_employee_role() = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'barista'::text, 'cocinero'::text, 'panadero'::text, 'repostero'::text, 'pastelero'::text])) AND ((public.current_employee_role() = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text])) OR (site_id = public.current_employee_site_id()))))
with check (((public.current_employee_role() = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'barista'::text, 'cocinero'::text, 'panadero'::text, 'repostero'::text, 'pastelero'::text])) AND ((public.current_employee_role() = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text])) OR (site_id = public.current_employee_site_id()))));



  create policy "Owners can update feedback"
  on "public"."user_feedback"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees
  WHERE ((employees.id = auth.uid()) AND (employees.role = 'propietario'::text)))));



  create policy "users_select_cashier"
  on "public"."users"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text, 'mesero'::text]))))));



  create policy "users_select_cashier_for_qr"
  on "public"."users"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = auth.uid()) AND (e.is_active = true) AND (e.role = ANY (ARRAY['propietario'::text, 'gerente'::text, 'gerente_general'::text, 'cajero'::text, 'mesero'::text]))))));


CREATE TRIGGER attendance_breaks_set_updated_at BEFORE UPDATE ON public.attendance_breaks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER attendance_shift_events_set_updated_at BEFORE UPDATE ON public.attendance_shift_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_document_types_updated_at BEFORE UPDATE ON public.document_types FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

CREATE TRIGGER documents_set_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER employee_devices_set_updated_at BEFORE UPDATE ON public.employee_devices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_employee_push_tokens_updated_at BEFORE UPDATE ON public.employee_push_tokens FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

CREATE TRIGGER update_inventory_entries_updated_at BEFORE UPDATE ON public.inventory_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_inventory_locations_parent_same_site BEFORE INSERT OR UPDATE OF parent_location_id, site_id ON public.inventory_locations FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_location_parent_same_site();

CREATE TRIGGER update_inventory_transfers_updated_at BEFORE UPDATE ON public.inventory_transfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_inventory_units_updated_at BEFORE UPDATE ON public.inventory_units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_product_site_settings_updated_at BEFORE UPDATE ON public.product_site_settings FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();

CREATE TRIGGER trg_set_production_batch_code BEFORE INSERT ON public.production_batches FOR EACH ROW EXECUTE FUNCTION public.set_production_batch_code();

CREATE TRIGGER support_tickets_set_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_availability_profiles_updated_at BEFORE UPDATE ON vital.availability_profiles FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_challenge_progress_updated_at BEFORE UPDATE ON vital.challenge_progress FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_daily_readiness_inputs_updated_at BEFORE UPDATE ON vital.daily_readiness_inputs FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_feature_flags_updated_at BEFORE UPDATE ON vital.feature_flags FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_game_profiles_updated_at BEFORE UPDATE ON vital.game_profiles FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_goal_profiles_updated_at BEFORE UPDATE ON vital.goal_profiles FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_health_profiles_updated_at BEFORE UPDATE ON vital.health_profiles FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_level_states_updated_at BEFORE UPDATE ON vital.level_states FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_module_catalog_updated_at BEFORE UPDATE ON vital.module_catalog FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_notification_plans_updated_at BEFORE UPDATE ON vital.notification_plans FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_programs_updated_at BEFORE UPDATE ON vital.programs FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_safety_intake_updated_at BEFORE UPDATE ON vital.safety_intake FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_squads_updated_at BEFORE UPDATE ON vital.squads FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_starter_program_catalog_updated_at BEFORE UPDATE ON vital.starter_program_catalog FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_task_instances_updated_at BEFORE UPDATE ON vital.task_instances FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_task_templates_updated_at BEFORE UPDATE ON vital.task_templates FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_user_feature_flags_updated_at BEFORE UPDATE ON vital.user_feature_flags FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_user_module_preferences_updated_at BEFORE UPDATE ON vital.user_module_preferences FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();

CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON vital.user_profiles FOR EACH ROW EXECUTE FUNCTION vital.set_updated_at();


  create policy "INSERT_AUTH flreew_0"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'documents'::text));



  create policy "SELECT_AUTH flreew_0"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'documents'::text));



  create policy "documents_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'documents'::text));



  create policy "documents_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'documents'::text));



  create policy "documents_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'documents'::text));



  create policy "nexo_catalog_images_authenticated_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'nexo-catalog-images'::text));



  create policy "nexo_catalog_images_authenticated_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'nexo-catalog-images'::text));



  create policy "nexo_catalog_images_authenticated_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'nexo-catalog-images'::text));



  create policy "nexo_catalog_images_public_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'nexo-catalog-images'::text));



  create policy "pass_satellite_logos_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'pass-satellite-logos'::text) AND (public.is_owner() OR public.is_global_manager())));



  create policy "pass_satellite_logos_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'pass-satellite-logos'::text) AND (public.is_owner() OR public.is_global_manager())));



  create policy "pass_satellite_logos_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'pass-satellite-logos'::text));



  create policy "pass_satellite_logos_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'pass-satellite-logos'::text) AND (public.is_owner() OR public.is_global_manager())))
with check (((bucket_id = 'pass-satellite-logos'::text) AND (public.is_owner() OR public.is_global_manager())));



  create policy "product_images_authenticated_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'product-images'::text));



  create policy "product_images_authenticated_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'product-images'::text));



  create policy "product_images_authenticated_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'product-images'::text));



  create policy "product_images_public_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'product-images'::text));



