-- In-app account deletion and data cleanup support for Vento Pass.

BEGIN;

-- 1) Extend deletion requests table for audited in-app flows.
ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS request_type text,
  ADD COLUMN IF NOT EXISTS requested_via text NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS execute_after timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text;

UPDATE public.account_deletion_requests
SET request_type = COALESCE(request_type, 'full_account');

ALTER TABLE public.account_deletion_requests
  ALTER COLUMN request_type SET NOT NULL,
  ALTER COLUMN request_type SET DEFAULT 'full_account';

ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check;

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_status_check
  CHECK (
    status IN (
      'pending',
      'processing',
      'completed',
      'rejected',
      'canceled',
      'failed'
    )
  );

ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_requests_request_type_check;

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_request_type_check
  CHECK (request_type IN ('full_account', 'data_cleanup'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_deletion_requests_user_id_fkey'
  ) THEN
    ALTER TABLE public.account_deletion_requests
      ADD CONSTRAINT account_deletion_requests_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_user_status_execute
  ON public.account_deletion_requests (user_id, status, execute_after);

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_status_execute
  ON public.account_deletion_requests (status, execute_after);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account_deletion_requests'
      AND policyname = 'account_deletion_requests_select_own'
  ) THEN
    CREATE POLICY account_deletion_requests_select_own
      ON public.account_deletion_requests
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- 2) Foreign keys for historical retention with anonymization.
ALTER TABLE public.loyalty_transactions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.loyalty_redemptions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_client_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_client_id_fkey
  FOREIGN KEY (client_id)
  REFERENCES public.users(id)
  ON UPDATE RESTRICT
  ON DELETE SET NULL;

ALTER TABLE public.loyalty_transactions
  DROP CONSTRAINT IF EXISTS loyalty_transactions_user_id_fkey;

ALTER TABLE public.loyalty_transactions
  ADD CONSTRAINT loyalty_transactions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.loyalty_redemptions
  DROP CONSTRAINT IF EXISTS loyalty_redemptions_user_id_fkey;

ALTER TABLE public.loyalty_redemptions
  ADD CONSTRAINT loyalty_redemptions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

-- 3) Anonymization helper used by scheduled deletion processor.
CREATE OR REPLACE FUNCTION public.anonymize_user_personal_data(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.anonymize_user_personal_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anonymize_user_personal_data(uuid) TO service_role;

COMMIT;
