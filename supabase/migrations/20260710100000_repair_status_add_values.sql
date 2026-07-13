-- Extend the repair lifecycle with two stages:
--   pending -> diagnosed -> in_progress -> awaiting_parts -> completed -> delivered
-- (cancelled remains reachable from any non-delivered status).
--
-- Postgres will not let a transaction reference an enum value it just added, so this
-- migration ONLY adds the values. The transition-validation trigger that references
-- 'diagnosed'/'delivered' lives in the next migration, once these are committed.
ALTER TYPE public.repair_status ADD VALUE IF NOT EXISTS 'diagnosed' AFTER 'pending';
ALTER TYPE public.repair_status ADD VALUE IF NOT EXISTS 'delivered' AFTER 'completed';
