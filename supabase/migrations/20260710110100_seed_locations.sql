-- Seed the default box locations. Matches the partial unique index on lower(code).
INSERT INTO public.locations (name, code) VALUES
  ('Box 01', 'BOX-01'),
  ('Box 02', 'BOX-02'),
  ('Box 03', 'BOX-03'),
  ('Box 04', 'BOX-04'),
  ('Box 05', 'BOX-05'),
  ('Box 06', 'BOX-06'),
  ('Box 07', 'BOX-07'),
  ('Box 08', 'BOX-08'),
  ('Box 09', 'BOX-09'),
  ('Box 10', 'BOX-10')
ON CONFLICT (lower(code)) WHERE code IS NOT NULL DO NOTHING;
