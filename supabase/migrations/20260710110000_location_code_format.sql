-- Normalize location codes to a consistent BOX-01 style: uppercase + trimmed,
-- enforced going forward by a CHECK. Clean up existing rows first so the CHECK
-- can be added without failing on old data.
UPDATE public.locations SET code = upper(trim(code)) WHERE code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_normalize_location_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NOT NULL THEN
    NEW.code := upper(trim(NEW.code));
    IF NEW.code = '' THEN
      NEW.code := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_locations_normalize_code
  BEFORE INSERT OR UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_location_code();

ALTER TABLE public.locations
  ADD CONSTRAINT locations_code_format CHECK (code IS NULL OR code ~ '^[A-Z]+-[0-9]{2,}$');
