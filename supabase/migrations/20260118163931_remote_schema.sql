begin;

-- Snapshot migration preserved only to keep remote migration history aligned.
-- The original file was a full schema dump that duplicated objects already
-- created by baseline and earlier migrations, which breaks shadow DB replay.
-- Canonical schema changes must live in forward-only migrations, not snapshots.

commit;
