-- Informational only: no auto-assignment logic reads this anywhere. Nullable since
-- non-technicians (and technicians not yet leveled) have no level.
ALTER TABLE public.profiles
  ADD COLUMN technician_level text CHECK (technician_level IS NULL OR technician_level IN ('Level 1', 'Level 2'));
