-- parts had two competing location fields: a free-text "location" column and a
-- location_id FK to public.locations. location_id is the single source of truth
-- going forward; drop the redundant text column. (No data migration/fuzzy-matching
-- of old text values into locations — those are unrelated, unstructured strings.)
ALTER TABLE public.parts DROP COLUMN location;
