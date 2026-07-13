-- =============================================================================
-- SRMMS sample data seed
-- =============================================================================
--
-- PREREQUISITE — create these 7 auth users first (this script cannot create
-- auth.users rows itself; it only looks them up by email). See README.md,
-- section "Seed data", for the exact Dashboard steps or an Admin-API curl
-- snippet. Emails must match exactly:
--
--   admin@srmms.test        Admin
--   reception1@srmms.test   Receptionist
--   reception2@srmms.test   Receptionist
--   tech.l1.a@srmms.test    Technician, Level 1
--   tech.l1.b@srmms.test    Technician, Level 1
--   tech.l2.a@srmms.test    Technician, Level 2
--   tech.l2.b@srmms.test    Technician, Level 2
--
-- Creating each auth user fires handle_new_user(), which auto-creates their
-- `profiles` row. This script then UPDATEs those profiles (technician_level)
-- and INSERTs their user_roles — it never inserts into profiles/auth.users
-- itself.
--
-- WHY SOME TRIGGERS ARE DISABLED DURING SEEDING
-- Several AFTER-triggers derive required fields from auth.uid() (the calling
-- user's JWT), which is NULL in a plain SQL session — a repair/part insert
-- with an initial location would otherwise fail on custody_history's NOT NULL
-- moved_by, and a part with initial quantity_on_hand > 0 would otherwise fail
-- trg_parts_initial_stock_entry the same way (stock_entries.entered_by is
-- NOT NULL too). Rather than fight that, this script disables the audit,
-- custody-history, initial-stock-entry, and client-notification triggers for
-- the duration of the seed and inserts equivalent rows itself by hand, so the
-- end state (history chains, notifications, stock entries) looks exactly like
-- what real usage would have produced.
-- The one exception left ENABLED on purpose: tg_repair_parts_stock — it has no
-- auth.uid() dependency, so parts.quantity_on_hand is decremented by the real
-- trigger when repair_parts rows are inserted below (not hand-computed).
--
-- CONSEQUENCE: audit_log is NOT populated by this script (it only exists via
-- those disabled audit_* triggers, and this script does not fabricate rows in
-- it — per instructions, audit trail entries are only ever real trigger output).
-- It will start filling in as soon as real users interact with the seeded data.
--
-- RE-RUNNING: safe. The reset step below truncates all business/sample data
-- (clients, machines, repairs and everything hanging off them) but leaves
-- auth.users, profiles and user_roles alone, so you don't need to recreate the
-- 7 accounts every time you reseed. `locations` (BOX-01..BOX-10) is reseeded
-- idempotently (ON CONFLICT DO NOTHING) rather than truncated.
--
-- HOW TO RUN: see README.md, section "Seed data".
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Guard: the 7 seed auth users must already exist
-- -----------------------------------------------------------------------------
do $$
declare
  v_found int;
begin
  select count(*) into v_found
    from public.profiles
   where email in (
     'admin@srmms.test', 'reception1@srmms.test', 'reception2@srmms.test',
     'tech.l1.a@srmms.test', 'tech.l1.b@srmms.test',
     'tech.l2.a@srmms.test', 'tech.l2.b@srmms.test'
   );
  if v_found < 7 then
    raise exception
      'Only % of the 7 required seed auth users exist. Create them first — see README.md "Seed data".',
      v_found;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Reset — truncate sample/business data only (FK-safe via CASCADE), keep
--    auth users / profiles / user_roles / locations
-- -----------------------------------------------------------------------------
truncate table
  public.deliveries,
  public.repair_location_history,
  public.part_location_history,
  public.repair_parts,
  public.repair_logs,
  public.notifications,
  public.repairs,
  public.machines,
  public.clients,
  public.parts,
  public.stock_entries,
  public.audit_log
  cascade;

alter sequence public.repairs_number_seq restart with 1;
alter sequence public.stock_entries_number_seq restart with 1;

-- -----------------------------------------------------------------------------
-- 2. Disable side-effect triggers that depend on auth.uid() (see header) or
--    that we're replacing with hand-authored, more complete data
-- -----------------------------------------------------------------------------
alter table public.repairs        disable trigger notify_repair;
alter table public.repairs        disable trigger trg_repairs_custody_history;
alter table public.parts          disable trigger trg_parts_custody_history;
alter table public.parts          disable trigger trg_parts_initial_stock_entry;
alter table public.stock_entries  disable trigger trg_stock_entries_before_insert;
alter table public.stock_entries  disable trigger trg_stock_entries_apply;
alter table public.stock_entries  disable trigger audit_stock_entries;
alter table public.repairs        disable trigger audit_repairs;
alter table public.parts          disable trigger audit_parts;
alter table public.clients        disable trigger audit_clients;
alter table public.machines       disable trigger audit_machines;
alter table public.user_roles     disable trigger audit_user_roles;
alter table public.repair_logs    disable trigger audit_repair_logs;
alter table public.deliveries     disable trigger audit_deliveries;

-- -----------------------------------------------------------------------------
-- 3. Resolve seed users by email
-- -----------------------------------------------------------------------------
create temp table seed_users (slot text primary key, id uuid not null) on commit drop;
insert into seed_users (slot, id)
select v.slot, p.id
  from (values
    ('admin',      'admin@srmms.test'),
    ('reception1', 'reception1@srmms.test'),
    ('reception2', 'reception2@srmms.test'),
    ('tech_l1_a',  'tech.l1.a@srmms.test'),
    ('tech_l1_b',  'tech.l1.b@srmms.test'),
    ('tech_l2_a',  'tech.l2.a@srmms.test'),
    ('tech_l2_b',  'tech.l2.b@srmms.test')
  ) as v(slot, email)
  join public.profiles p on p.email = v.email;

update public.profiles set technician_level = 'Level 1'
 where id in (select id from seed_users where slot in ('tech_l1_a', 'tech_l1_b'));
update public.profiles set technician_level = 'Level 2'
 where id in (select id from seed_users where slot in ('tech_l2_a', 'tech_l2_b'));

insert into public.user_roles (user_id, role)
select id, 'Admin'::public.app_role from seed_users where slot = 'admin'
union all
select id, 'Receptionist'::public.app_role from seed_users where slot in ('reception1', 'reception2')
union all
select id, 'Technician'::public.app_role from seed_users where slot in ('tech_l1_a', 'tech_l1_b', 'tech_l2_a', 'tech_l2_b')
on conflict (user_id, role) do nothing;

-- -----------------------------------------------------------------------------
-- 4. Locations — idempotent, matches the BOX-01..BOX-10 migration seed
-- -----------------------------------------------------------------------------
insert into public.locations (name, code) values
  ('Box 01', 'BOX-01'), ('Box 02', 'BOX-02'), ('Box 03', 'BOX-03'),
  ('Box 04', 'BOX-04'), ('Box 05', 'BOX-05'), ('Box 06', 'BOX-06'),
  ('Box 07', 'BOX-07'), ('Box 08', 'BOX-08'), ('Box 09', 'BOX-09'),
  ('Box 10', 'BOX-10')
on conflict (lower(code)) where code is not null do nothing;

create temp table seed_locations (slot text primary key, id uuid not null) on commit drop;
insert into seed_locations (slot, id) select code, id from public.locations where code like 'BOX-%';

-- -----------------------------------------------------------------------------
-- 5. Clients — Cameroonian names, +237 6XX phones, mixed email presence
-- -----------------------------------------------------------------------------
create temp table seed_clients (slot text primary key, id uuid not null) on commit drop;

with ins as (
  insert into public.clients (name, contact_person, email, phone, address, created_by)
  select v.name, v.contact, v.email, v.phone, v.address, (select id from seed_users where slot = 'reception1')
    from (values
      ('C1',  'Établissements Fotso',        'Fotso Jean-Baptiste',  'contact@fotso-ets.cm',   '+237 677 12 34 56', 'Akwa, Douala'),
      ('C2',  'Mballa Marie-Claire',         null,                    null,                     '+237 691 23 45 67', 'Bastos, Yaoundé'),
      ('C3',  'Nkeng Paul',                  null,                    'nkeng.paul@gmail.com',   '+237 699 34 56 78', 'Bonanjo, Douala'),
      ('C4',  'Cabinet Ateba & Associés',    'Ateba Sylvie',          'sylvie.ateba@cabinet.cm','+237 675 45 67 89', 'Mvan, Yaoundé'),
      ('C5',  'Njoya Ibrahim',               null,                    null,                     '+237 655 56 78 90', 'Bépanda, Douala'),
      ('C6',  'Kamga Solange',               null,                    'kamga.solange@yahoo.fr', '+237 670 67 89 01', 'Essos, Yaoundé'),
      ('C7',  'Talla Emmanuel',              null,                    null,                     '+237 694 78 90 12', 'Deido, Douala'),
      ('C8',  'Ekotto Grace',                null,                    'ekotto.grace@outlook.com','+237 680 89 01 23','Nlongkak, Yaoundé'),
      ('C9',  'Mendomo Alain',               null,                    null,                     '+237 650 90 12 34', 'Biyem-Assi, Yaoundé'),
      ('C10', 'Ngo Bella Christelle',        null,                    'ngobella.c@gmail.com',   '+237 696 01 23 45', 'New-Bell, Douala')
    ) as v(slot, name, contact, email, phone, address)
  returning id, name
)
insert into seed_clients (slot, id)
select v.slot, ins.id
  from ins
  join (values
    ('C1','Établissements Fotso'), ('C2','Mballa Marie-Claire'), ('C3','Nkeng Paul'),
    ('C4','Cabinet Ateba & Associés'), ('C5','Njoya Ibrahim'), ('C6','Kamga Solange'),
    ('C7','Talla Emmanuel'), ('C8','Ekotto Grace'), ('C9','Mendomo Alain'), ('C10','Ngo Bella Christelle')
  ) as v(slot, name) on v.name = ins.name;

-- -----------------------------------------------------------------------------
-- 6. Machines — laptops, desktops, printers, UPS, a switch; varied brands
-- -----------------------------------------------------------------------------
create temp table seed_machines (slot text primary key, id uuid not null) on commit drop;

with ins as (
  insert into public.machines (client_id, brand, model, serial_number, machine_type, year, created_by)
  select (select id from seed_clients where slot = v.client_slot), v.brand, v.model, v.serial, v.mtype, v.year,
         (select id from seed_users where slot = 'reception1')
    from (values
      ('M01','C1','HP','ProBook 450 G8','HP-LT-0001','Laptop',2022),
      ('M02','C1','Canon','imageCLASS MF264dw','CN-PR-0002','Printer',2021),
      ('M03','C2','Dell','OptiPlex 3080','DL-DT-0003','Desktop computer',2020),
      ('M04','C2','APC','Back-UPS 1100','APC-UPS-0004','UPS',2019),
      ('M05','C3','Lenovo','ThinkPad E14','LN-LT-0005','Laptop',2023),
      ('M06','C3','HP','LaserJet Pro M404','HP-PR-0006','Printer',2021),
      ('M07','C4','Cisco','Catalyst 2960','CSC-SW-0007','Network switch',2018),
      ('M08','C4','Dell','Latitude 5490','DL-LT-0008','Laptop',2020),
      ('M09','C5','Asus','VivoBook X515','ASU-LT-0009','Laptop',2022),
      ('M10','C5','Epson','L3150','EPS-PR-0010','Printer',2021),
      ('M11','C6','HP','Compaq Elite 8300','HP-DT-0011','Desktop computer',2017),
      ('M12','C6','APC','Smart-UPS 750','APC-UPS-0012','UPS',2020),
      ('M13','C7','TP-Link','TL-SG1016','TPL-SW-0013','Network switch',2021),
      ('M14','C8','Brother','HL-L2350DW','BRO-PR-0014','Printer',2022)
    ) as v(slot, client_slot, brand, model, serial, mtype, year)
  returning id, serial_number
)
insert into seed_machines (slot, id)
select v.slot, ins.id
  from ins
  join (values
    ('M01','HP-LT-0001'),('M02','CN-PR-0002'),('M03','DL-DT-0003'),('M04','APC-UPS-0004'),
    ('M05','LN-LT-0005'),('M06','HP-PR-0006'),('M07','CSC-SW-0007'),('M08','DL-LT-0008'),
    ('M09','ASU-LT-0009'),('M10','EPS-PR-0010'),('M11','HP-DT-0011'),('M12','APC-UPS-0012'),
    ('M13','TPL-SW-0013'),('M14','BRO-PR-0014')
  ) as v(slot, serial) on v.serial = ins.serial_number;

-- -----------------------------------------------------------------------------
-- 7. Parts — starting stock is PRE-consumption; repair_parts (step 10) triggers
--    the real tg_repair_parts_stock decrement, so final quantity_on_hand is
--    computed by Postgres, not hand-typed
-- -----------------------------------------------------------------------------
create temp table seed_parts (slot text primary key, id uuid not null) on commit drop;

with ins as (
  insert into public.parts (sku, name, description, category, unit, unit_cost, unit_price, quantity_on_hand, reorder_level, created_by)
  select v.sku, v.name, v.description, v.category, 'unit', v.cost, v.price, v.qty, v.reorder,
         (select id from seed_users where slot = 'admin')
    from (values
      ('P01','TNR-001','HP 05A toner cartridge','Black toner compatible with HP LaserJet printers','Toner',15000,25000,10,3),
      ('P02','INK-002','Canon 045 ink cartridge','Color ink for Canon imageCLASS','Ink',8000,14000,12,4),
      ('P03','RAM-003','8GB DDR4 RAM module','2666MHz SODIMM memory','Memory',12000,20000,15,5),
      ('P04','SSD-004','SSD 240GB SATA','2.5" SSD drive for upgrades','Storage',18000,30000,8,3),
      ('P05','BAT-005','12V 7Ah UPS battery','Replacement battery for UPS units','Battery',9000,16000,10,4),
      ('P06','PWR-006','65W power adapter','Universal charger for laptops','Power supply',6000,11000,20,6),
      ('P07','CBL-007','5m RJ45 network cable','Shielded Cat6 Ethernet cable','Cabling',1500,3000,40,10),
      ('P08','DRM-008','Universal printer drum','Multi-brand compatible drum unit','Toner',20000,32000,6,2),
      ('P09','FAN-009','12cm CPU fan','Replacement cooling fan','Cooling',4000,8000,12,4),
      ('P10','HDD-010','1TB 2.5" hard drive','Mechanical hard drive for laptop/desktop','Storage',22000,35000,7,3),
      ('P11','SCR-011','14-inch LCD screen','Replacement panel for 14" laptops','Screen',35000,55000,5,2),
      ('P12','KBD-012','Replacement keyboard','AZERTY keyboard for laptop','Peripheral',5000,9000,9,3)
    ) as v(slot, sku, name, description, category, cost, price, qty, reorder)
  returning id, sku
)
insert into seed_parts (slot, id) select v.slot, ins.id from ins join (values
  ('P01','TNR-001'),('P02','INK-002'),('P03','RAM-003'),('P04','SSD-004'),
  ('P05','BAT-005'),('P06','PWR-006'),('P07','CBL-007'),('P08','DRM-008'),
  ('P09','FAN-009'),('P10','HDD-010'),('P11','SCR-011'),('P12','KBD-012')
) as v(slot, sku) on v.sku = ins.sku;

-- Parts custody: some placed in boxes, one currently checked out to a technician
update public.parts set location_id = (select id from seed_locations where slot = 'BOX-07')
 where id in (select id from seed_parts where slot in ('P01', 'P02'));
update public.parts set location_id = (select id from seed_locations where slot = 'BOX-08')
 where id in (select id from seed_parts where slot in ('P03', 'P04'));
update public.parts set location_id = (select id from seed_locations where slot = 'BOX-09')
 where id in (select id from seed_parts where slot = 'P07');
update public.parts set current_holder_id = (select id from seed_users where slot = 'tech_l2_a')
 where id in (select id from seed_parts where slot = 'P11');

-- Hand-authored initial stock entry per part — matches what
-- trg_parts_initial_stock_entry (disabled above) would have produced for a
-- real registration with the same starting quantity.
insert into public.stock_entries (part_id, quantity, entered_by, notes, resulting_quantity_on_hand)
select seed_parts.id, v.qty, (select id from seed_users where slot = 'admin'),
       'Initial stock at part registration', v.qty
  from seed_parts join (values
    ('P01',10),('P02',12),('P03',15),('P04',8),
    ('P05',10),('P06',20),('P07',40),('P08',6),
    ('P09',12),('P10',7),('P11',5),('P12',9)
  ) as v(slot, qty) on v.slot = seed_parts.slot;

-- -----------------------------------------------------------------------------
-- 8. Repairs — 20 rows across all 7 statuses, spread over the past 4 months,
--    varied priority, some unassigned, some in a box, some held by a technician
--    (location_id / current_holder_id are mutually exclusive per the CHECK)
-- -----------------------------------------------------------------------------
create temp table seed_repairs (slot text primary key, id uuid not null) on commit drop;

with ins as (
  insert into public.repairs (
    client_id, machine_id, title, description, status, priority, assigned_to,
    intake_date, due_date, completed_at, diagnosis, resolution, cost,
    location_id, current_holder_id, created_by, created_at, updated_at
  )
  select
    (select id from seed_clients where slot = v.client_slot),
    (select id from seed_machines where slot = v.machine_slot),
    v.title, v.description, v.status::public.repair_status, v.priority::public.repair_priority,
    (select id from seed_users where slot = v.assignee_slot),
    v.created_at::date, v.due_date::date, v.completed_at::timestamptz,
    v.diagnosis, v.resolution, v.cost,
    (select id from seed_locations where slot = v.location_slot),
    (select id from seed_users where slot = v.holder_slot),
    (select id from seed_users where slot = 'reception2'),
    v.created_at::timestamptz, coalesce(v.completed_at::timestamptz, v.created_at::timestamptz)
    from (values
      -- slot, client, machine,   title,                                            description,                                                status,          priority,  assignee,     created_at,   due_date,     completed_at, diagnosis, resolution, cost,  location, holder
      ('R01','C1','M01','Laptop won''t turn on','The client reports the computer has not started for 2 days.','completed','normal','tech_l1_a','2026-03-20','2026-03-27','2026-03-29 16:00','Faulty power supply and unstable RAM','Motherboard cleaned, RAM replaced, tests OK',45000,'BOX-01',null),
      ('R02','C2','M03','Desktop no longer detects the hard drive','Blue screen at startup, hard drive suspected.','delivered','high','tech_l2_a','2026-03-10',null,'2026-03-18 11:00','Failing SSD','SSD replaced, system reinstalled',60000,null,null),
      ('R03','C3','M05','Screen cracked after a fall','Laptop was accidentally dropped, screen cracked.','delivered','normal','tech_l1_b','2026-03-25',null,'2026-04-02 15:30','Panel needs replacing','Screen replaced, calibration done',38000,null,null),
      ('R04','C4','M07','Network switch won''t power on','No ports active since a power outage.','delivered','urgent','tech_l2_b','2026-04-01',null,'2026-04-06 09:00','Internal power supply burned out','Rewired, switch validated by testing',25000,null,null),
      ('R05','C1','M02','Printer prints blank pages','Toner likely empty or drum worn out.','in_progress','normal','tech_l1_a','2026-04-10','2026-04-20',null,'Toner empty, drum to be checked',null,null,'BOX-03',null),
      ('R06','C5','M09','Laptop overheats and shuts down','Frequent shutdowns after 10-15 minutes of use.','in_progress','high','tech_l2_a','2026-04-15','2026-04-25',null,'Fan blocked by dust',null,null,null,'tech_l2_a'),
      ('R07','C6','M11','Desktop very slow to start up','Client complains of significant slowness.','in_progress','low','tech_l1_b','2026-04-20','2026-05-01',null,'Mechanical drive at end of life',null,null,'BOX-04',null),
      ('R08','C2','M04','UPS no longer holds a charge','Immediate cutoff during a power cut.','awaiting_parts','high','tech_l2_b','2026-04-25',null,null,'Internal battery dead, awaiting replacement battery',null,null,'BOX-02',null),
      ('R09','C7','M13','Switch intermittently loses connection','Several ports randomly go down.','awaiting_parts','normal','tech_l1_a','2026-05-01',null,null,'Internal wiring damaged, part on order',null,null,null,'tech_l1_a'),
      ('R10','C3','M06','Printer leaves marks on pages','Vertical streaks on every printout.','diagnosed','normal','tech_l1_b','2026-05-10',null,null,'Drum worn out, replacement needed',null,null,null,null),
      ('R11','C8','M14','Printer has recurring paper jams','Paper jam on every double-sided print.','diagnosed','low','tech_l2_a','2026-05-15',null,null,'Feed rollers clogged with dirt',null,null,null,null),
      ('R12','C4','M08','Laptop no longer charges the battery','Battery drains even while plugged in.','diagnosed','urgent',null,'2026-05-18',null,null,'Charging port damaged',null,null,null,null),
      ('R13','C5','M10','Printer no longer responds on the network','Unable to detect the printer on the Wi-Fi network.','pending','normal',null,'2026-05-30',null,null,null,null,null,null,null),
      ('R14','C9',null,'Laptop repair','On-site visit requested, equipment not yet registered.','pending','high',null,'2026-06-05',null,null,null,null,null,null,null),
      ('R15','C10',null,'Desktop computer diagnostic','Client is bringing in the tower next week.','pending','normal',null,'2026-06-10',null,null,null,null,null,null,null),
      ('R16','C6','M12','UPS noisy and unstable','Continuous beeping and irregular output voltage.','completed','normal','tech_l2_b','2026-05-20','2026-05-27','2026-05-28 14:00','Battery at end of life','Battery replaced, load tests OK',42000,'BOX-05',null),
      ('R17','C1','M01','Second fault, keyboard not responding','Client feedback: several keys no longer work.','completed','low','tech_l1_a','2026-06-15','2026-06-22','2026-06-20 10:00','Keyboard faulty after a liquid spill','Keyboard replaced, full cleaning done',15000,'BOX-01',null),
      ('R18','C8','M14','Service request cancelled','Client cancelled the request after receiving the quote.','cancelled','normal','tech_l1_b','2026-06-25',null,null,null,null,null,null,null),
      ('R19','C2','M04','Second UPS faulty','Another office UPS that will no longer power on.','pending','urgent',null,'2026-07-05',null,null,null,null,null,null,null),
      ('R20','C9',null,'Multifunction printer repair','Client is bringing in a faulty multifunction printer.','completed','normal','tech_l2_a','2026-04-28','2026-05-05','2026-05-05 12:00','Toner depleted and drum dirty','Toner replaced, drum cleaned',20000,'BOX-06',null)
    ) as v(slot, client_slot, machine_slot, title, description, status, priority, assignee_slot,
           created_at, due_date, completed_at, diagnosis, resolution, cost, location_slot, holder_slot)
  returning id, title, created_at
)
insert into seed_repairs (slot, id)
select v.slot, ins.id
  from ins
  join (values
    ('R01','Laptop won''t turn on','2026-03-20'),
    ('R02','Desktop no longer detects the hard drive','2026-03-10'),
    ('R03','Screen cracked after a fall','2026-03-25'),
    ('R04','Network switch won''t power on','2026-04-01'),
    ('R05','Printer prints blank pages','2026-04-10'),
    ('R06','Laptop overheats and shuts down','2026-04-15'),
    ('R07','Desktop very slow to start up','2026-04-20'),
    ('R08','UPS no longer holds a charge','2026-04-25'),
    ('R09','Switch intermittently loses connection','2026-05-01'),
    ('R10','Printer leaves marks on pages','2026-05-10'),
    ('R11','Printer has recurring paper jams','2026-05-15'),
    ('R12','Laptop no longer charges the battery','2026-05-18'),
    ('R13','Printer no longer responds on the network','2026-05-30'),
    ('R14','Laptop repair','2026-06-05'),
    ('R15','Desktop computer diagnostic','2026-06-10'),
    ('R16','UPS noisy and unstable','2026-05-20'),
    ('R17','Second fault, keyboard not responding','2026-06-15'),
    ('R18','Service request cancelled','2026-06-25'),
    ('R19','Second UPS faulty','2026-07-05'),
    ('R20','Multifunction printer repair','2026-04-28')
  ) as v(slot, title, created_date) on v.title = ins.title and v.created_date = ins.created_at::date;

-- -----------------------------------------------------------------------------
-- 9. Repair logs — 2-4 entries per non-pending, non-cancelled repair
-- -----------------------------------------------------------------------------
insert into public.repair_logs (repair_id, action, result, technician_id, time_spent_minutes, created_at)
select (select id from seed_repairs where slot = v.repair_slot),
       v.action, v.result, (select id from seed_users where slot = v.tech_slot), v.minutes, v.logged_at::timestamptz
  from (values
    ('R01','tech_l1_a','Initial fault diagnosis','Power fault confirmed',45,'2026-03-20 10:00'),
    ('R01','tech_l1_a','Replaced the faulty part','Power supply unit replaced',60,'2026-03-22 09:30'),
    ('R01','tech_l1_a','Functional test','Working normally after service',30,'2026-03-29 15:00'),

    ('R02','tech_l2_a','Initial fault diagnosis','Failing SSD confirmed by SMART test',40,'2026-03-11 09:00'),
    ('R02','tech_l2_a','Backed up client data','Backup successfully completed to external media',50,'2026-03-12 14:00'),
    ('R02','tech_l2_a','Installed replacement parts','New SSD installed, OS reinstalled',90,'2026-03-16 11:00'),
    ('R02','tech_l2_a','Functional test','Test conclusive',20,'2026-03-18 10:30'),

    ('R03','tech_l1_b','Initial fault diagnosis','Panel cracked, replacement needed',25,'2026-03-25 11:00'),
    ('R03','tech_l1_b','Replaced the faulty part','Screen replaced',75,'2026-03-30 09:00'),
    ('R03','tech_l1_b','Reassembly and quality check','Performance improvement observed',20,'2026-04-02 15:00'),

    ('R04','tech_l2_b','Initial fault diagnosis','Internal power supply burned out',35,'2026-04-01 10:00'),
    ('R04','tech_l2_b','Replaced the faulty part','Power supply unit replaced, rewired',60,'2026-04-04 09:00'),
    ('R04','tech_l2_b','Functional test','Fault resolved',20,'2026-04-06 08:30'),

    ('R05','tech_l1_a','Initial fault diagnosis','Toner empty, drum to be checked',20,'2026-04-10 09:30'),
    ('R05','tech_l1_a','Replaced toner/cartridge','Toner replaced',30,'2026-04-25 14:00'),

    ('R06','tech_l2_a','Cleaning and dust removal','Fan cleaned, thermal paste redone',40,'2026-04-16 10:00'),
    ('R06','tech_l2_a','Functional test','Awaiting client confirmation',15,'2026-04-30 11:00'),

    ('R07','tech_l1_b','Initial fault diagnosis','Mechanical drive confirmed at end of life',30,'2026-04-21 09:00'),

    ('R08','tech_l2_b','Initial fault diagnosis','Internal battery dead',25,'2026-04-26 09:00'),
    ('R08','tech_l2_b','Checked the power supply','Requires an additional part',20,'2026-04-28 10:00'),

    ('R09','tech_l1_a','Initial fault diagnosis','Internal wiring damaged',35,'2026-05-02 09:00'),
    ('R09','tech_l1_a','Checked the power supply','Part ordered',15,'2026-05-20 09:30'),

    ('R10','tech_l1_b','Initial fault diagnosis','Drum worn out, replacement needed',20,'2026-05-10 10:00'),

    ('R11','tech_l2_a','Initial fault diagnosis','Feed rollers clogged with dirt',25,'2026-05-15 11:00'),

    ('R12','tech_l2_a','Initial fault diagnosis','Charging port damaged',30,'2026-05-18 09:00'),

    ('R16','tech_l2_b','Initial fault diagnosis','Battery at end of life',25,'2026-05-20 09:00'),
    ('R16','tech_l2_b','Replaced the faulty part','Battery replaced',45,'2026-05-25 09:30'),
    ('R16','tech_l2_b','Functional test','Load test conclusive',20,'2026-05-28 13:30'),

    ('R17','tech_l1_a','Initial fault diagnosis','Keyboard faulty after a liquid spill',20,'2026-06-15 10:00'),
    ('R17','tech_l1_a','Replaced the faulty part','Keyboard replaced',50,'2026-06-19 09:00'),
    ('R17','tech_l1_a','Cleaning and dust removal','Full cleaning completed',25,'2026-06-20 09:30'),

    ('R20','tech_l2_a','Initial fault diagnosis','Toner depleted and drum dirty',20,'2026-04-28 09:00'),
    ('R20','tech_l2_a','Replaced toner/cartridge','Toner replaced',30,'2026-05-02 10:00'),
    ('R20','tech_l2_a','Cleaning and dust removal','Drum cleaned, test conclusive',25,'2026-05-05 11:30')
  ) as v(repair_slot, tech_slot, action, result, minutes, logged_at);

-- -----------------------------------------------------------------------------
-- 10. Repair parts — consumes stock via the REAL tg_repair_parts_stock trigger
--     (left enabled; no auth.uid() dependency). Drives TNR-001 and SSD-004 to
--     or below their reorder_level.
-- -----------------------------------------------------------------------------
insert into public.repair_parts (repair_id, part_id, quantity, unit_price, created_by)
select (select id from seed_repairs where slot = v.repair_slot),
       (select id from seed_parts where slot = v.part_slot),
       v.qty,
       (select unit_price from public.parts where id = (select id from seed_parts where slot = v.part_slot)),
       (select id from seed_users where slot = v.tech_slot)
  from (values
    ('R01','P03','tech_l1_a',2),  -- RAM
    ('R01','P06','tech_l1_a',1),  -- power adapter
    ('R02','P04','tech_l2_a',3),  -- SSD
    ('R02','P09','tech_l2_a',1),  -- fan
    ('R03','P03','tech_l1_b',2),  -- RAM
    ('R03','P11','tech_l1_b',1),  -- screen
    ('R04','P07','tech_l2_b',6),  -- network cable
    ('R05','P01','tech_l1_a',4),  -- toner
    ('R05','P08','tech_l1_a',1),  -- drum
    ('R06','P12','tech_l2_a',1),  -- keyboard
    ('R07','P04','tech_l1_b',3),  -- SSD
    ('R16','P05','tech_l2_b',4),  -- UPS battery
    ('R17','P06','tech_l1_a',2),  -- power adapter
    ('R17','P09','tech_l1_a',1),  -- fan
    ('R20','P01','tech_l2_a',3)   -- toner
  ) as v(repair_slot, part_slot, tech_slot, qty);

-- -----------------------------------------------------------------------------
-- 11. Custody history — hand-authored chains (placed -> retrieved -> placed),
--     latest row per item matches that item's actual current location/holder
-- -----------------------------------------------------------------------------
insert into public.repair_location_history (repair_id, location_id, movement_type, moved_by, moved_at)
select (select id from seed_repairs where slot = v.repair_slot),
       (select id from seed_locations where slot = v.location_slot),
       v.movement_type, (select id from seed_users where slot = v.mover_slot), v.moved_at::timestamptz
  from (values
    -- R05: full three-step chain ending in its current location (BOX-03)
    ('R05','BOX-01','placed','reception1','2026-04-11 09:00'),
    ('R05',null,'retrieved','tech_l1_a','2026-04-25 08:30'),
    ('R05','BOX-03','placed','tech_l1_a','2026-05-01 16:00'),
    -- R06: placed then retrieved, ends held by tech_l2_a (current state)
    ('R06','BOX-02','placed','reception2','2026-04-16 09:00'),
    ('R06',null,'retrieved','tech_l2_a','2026-04-30 10:00'),
    -- R09: placed then retrieved, ends held by tech_l1_a (current state)
    ('R09','BOX-04','placed','reception1','2026-05-02 09:00'),
    ('R09',null,'retrieved','tech_l1_a','2026-05-20 09:00'),
    -- Single-step placements matching current state
    ('R01','BOX-01','placed','tech_l1_a','2026-03-29 16:00'),
    ('R07','BOX-04','placed','tech_l1_b','2026-04-21 09:30'),
    ('R08','BOX-02','placed','tech_l2_b','2026-04-26 09:30'),
    ('R16','BOX-05','placed','tech_l2_b','2026-05-28 14:00'),
    ('R17','BOX-01','placed','tech_l1_a','2026-06-20 10:00'),
    ('R20','BOX-06','placed','tech_l2_a','2026-05-05 12:00')
  ) as v(repair_slot, location_slot, movement_type, mover_slot, moved_at);

insert into public.part_location_history (part_id, location_id, movement_type, moved_by, moved_at)
select (select id from seed_parts where slot = v.part_slot),
       (select id from seed_locations where slot = v.location_slot),
       v.movement_type, (select id from seed_users where slot = v.mover_slot), v.moved_at::timestamptz
  from (values
    ('P01','BOX-07','placed','reception1','2026-03-01 09:00'),
    ('P02','BOX-07','placed','reception1','2026-03-02 09:00'),
    ('P03','BOX-08','placed','reception1','2026-03-06 09:00'),
    ('P04','BOX-08','placed','reception2','2026-03-05 09:00'),
    ('P07','BOX-09','placed','reception2','2026-03-07 09:00'),
    -- P11 (screen): placed then retrieved, ends held by tech_l2_a (current state)
    ('P11','BOX-08','placed','admin','2026-03-10 09:00'),
    ('P11',null,'retrieved','tech_l2_a','2026-06-01 10:00')
  ) as v(part_slot, location_slot, movement_type, mover_slot, moved_at);

-- -----------------------------------------------------------------------------
-- 12. Deliveries — one per delivered repair (R02, R03, R04)
-- -----------------------------------------------------------------------------
insert into public.deliveries (repair_id, picked_up_by_name, picked_up_by_phone, handed_over_by, notes, delivered_at)
select (select id from seed_repairs where slot = v.repair_slot),
       v.name, v.phone, (select id from seed_users where slot = v.handler_slot), v.notes, v.delivered_at::timestamptz
  from (values
    ('R02','Mballa Marie-Claire','+237 691 23 45 67','reception1','Picked up by the client in person.','2026-03-20 10:00'),
    ('R03','Nkeng Paul','+237 699 34 56 78','reception2','Verified with the client before handover.','2026-04-05 15:00'),
    ('R04','Ateba Sylvie','+237 675 45 67 89','admin','Handed over to the firm''s representative.','2026-04-08 09:30')
  ) as v(repair_slot, name, phone, handler_slot, notes, delivered_at);

-- -----------------------------------------------------------------------------
-- 13. Notifications — consistent with each repair's assignment/status, in the
--     same shape/wording as tg_notify_repair
-- -----------------------------------------------------------------------------
-- 13a. In-app "assignment" notifications for every assigned repair
insert into public.notifications (user_id, kind, title, body, link, channel)
select r.assigned_to, 'assignment', 'New repair assigned: ' || r.order_number, coalesce(r.description, ''),
       '/repairs/' || r.id::text, 'in_app'
  from public.repairs r
 where r.assigned_to is not null;

-- 13b. In-app "status" notifications for every non-pending assigned repair
insert into public.notifications (user_id, kind, title, body, link, channel)
select r.assigned_to, 'status', 'Repair ' || r.order_number || ' → ' || r.status::text, null,
       '/repairs/' || r.id::text, 'in_app'
  from public.repairs r
 where r.assigned_to is not null and r.status <> 'pending';

-- 13c. Client-facing notifications (email if the client has one, else sms) for
--      every non-pending repair, with varied delivery_status
with client_repairs as (
  select r.id as repair_id, r.order_number, r.status, r.client_id,
         row_number() over (order by r.created_at) as rn
    from public.repairs r
   where r.status <> 'pending'
),
messages as (
  select cr.repair_id, cr.order_number, cr.rn, c.email, c.phone,
    case cr.status
      when 'completed'      then 'Your repair ' || cr.order_number || ' is complete. You can come pick up your equipment.'
      when 'delivered'      then 'Your repair ' || cr.order_number || ' has been delivered. Thank you for your business.'
      when 'cancelled'      then 'Your repair ' || cr.order_number || ' has been cancelled. Contact us for more details.'
      when 'awaiting_parts' then 'Your repair ' || cr.order_number || ' is awaiting parts.'
      when 'in_progress'    then 'Your repair ' || cr.order_number || ' is in progress.'
      when 'diagnosed'      then 'The diagnosis for your repair ' || cr.order_number || ' is complete.'
      else 'The status of your repair ' || cr.order_number || ' has been updated.'
    end as body
  from client_repairs cr
  join public.clients c on c.id = cr.client_id
)
insert into public.notifications (user_id, kind, title, body, link, channel, recipient, delivery_status)
select null, 'status', 'Update on your repair', body, '/repairs/' || repair_id::text,
       case when email is not null then 'email' else 'sms' end,
       coalesce(email, phone),
       case
         when email is null then 'simulated'                 -- sms: always simulated
         when rn % 5 = 0 then 'failed'                        -- occasional Resend failure
         when rn % 7 = 0 then null                            -- occasional still-pending row
         else 'sent'
       end
  from messages
 where email is not null or phone is not null;

-- -----------------------------------------------------------------------------
-- 14. Re-enable every trigger disabled in step 2
-- -----------------------------------------------------------------------------
alter table public.repairs        enable trigger notify_repair;
alter table public.repairs        enable trigger trg_repairs_custody_history;
alter table public.parts          enable trigger trg_parts_custody_history;
alter table public.parts          enable trigger trg_parts_initial_stock_entry;
alter table public.stock_entries  enable trigger trg_stock_entries_before_insert;
alter table public.stock_entries  enable trigger trg_stock_entries_apply;
alter table public.stock_entries  enable trigger audit_stock_entries;
alter table public.repairs        enable trigger audit_repairs;
alter table public.parts          enable trigger audit_parts;
alter table public.clients        enable trigger audit_clients;
alter table public.machines       enable trigger audit_machines;
alter table public.user_roles     enable trigger audit_user_roles;
alter table public.repair_logs    enable trigger audit_repair_logs;
alter table public.deliveries     enable trigger audit_deliveries;

-- -----------------------------------------------------------------------------
-- 15. Consistency checks — fail the whole transaction rather than leave bad data
-- -----------------------------------------------------------------------------
do $$
declare
  v_bad_stock int;
  v_bad_xor_parts int;
  v_bad_xor_repairs int;
  v_missing_delivery int;
  v_low_stock int;
  v_held int;
begin
  select count(*) into v_bad_stock from public.parts where quantity_on_hand < 0;
  if v_bad_stock > 0 then
    raise exception 'Consistency check failed: % part(s) have negative quantity_on_hand', v_bad_stock;
  end if;

  select count(*) into v_bad_xor_parts from public.parts
   where location_id is not null and current_holder_id is not null;
  if v_bad_xor_parts > 0 then
    raise exception 'Consistency check failed: % part(s) violate the location/holder either-or rule', v_bad_xor_parts;
  end if;

  select count(*) into v_bad_xor_repairs from public.repairs
   where location_id is not null and current_holder_id is not null;
  if v_bad_xor_repairs > 0 then
    raise exception 'Consistency check failed: % repair(s) violate the location/holder either-or rule', v_bad_xor_repairs;
  end if;

  select count(*) into v_missing_delivery from public.repairs r
   where r.status = 'delivered'
     and not exists (select 1 from public.deliveries d where d.repair_id = r.id);
  if v_missing_delivery > 0 then
    raise exception 'Consistency check failed: % delivered repair(s) have no deliveries row', v_missing_delivery;
  end if;

  select count(*) into v_low_stock from public.parts where quantity_on_hand <= reorder_level;
  select count(*) into v_held from (
    select current_holder_id from public.repairs where current_holder_id is not null
    union all
    select current_holder_id from public.parts where current_holder_id is not null
  ) h;

  raise notice 'Seed OK — % clients, % machines, % parts (% at/below reorder), % repairs, % held item(s), % deliveries, % notifications',
    (select count(*) from seed_clients),
    (select count(*) from seed_machines),
    (select count(*) from seed_parts),
    v_low_stock,
    (select count(*) from seed_repairs),
    v_held,
    (select count(*) from public.deliveries),
    (select count(*) from public.notifications);
end $$;

commit;
