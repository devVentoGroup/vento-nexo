begin;

-- Snapshot migration preserved only to keep remote migration history aligned.
-- The original file was a full schema dump captured from the remote project.
-- Replaying that dump locally duplicates objects from baseline plus prior
-- migrations and prevents Supabase shadow databases from bootstrapping.
--
-- Keep schema evolution in incremental migrations and reconciliation patches.

commit;
