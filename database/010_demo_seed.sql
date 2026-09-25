-- =============================================================================
-- DEMO / STAGING seed data. Replace with your real branches and contacts.
-- (Numbers use the UK drama range +447700900xxx; addresses use example.com.)
-- =============================================================================
INSERT INTO regions (name) VALUES ('North'), ('South') ON CONFLICT (name) DO NOTHING;

INSERT INTO branches (code, name, region_id, timezone, phone, google_review_url) VALUES
  ('LDS-N', 'Leeds North',   (SELECT id FROM regions WHERE name = 'North'), 'Europe/London', '0113 000 0001', 'https://g.page/r/leeds-north/review'),
  ('LDS-S', 'Leeds South',   (SELECT id FROM regions WHERE name = 'North'), 'Europe/London', '0113 000 0002', 'https://g.page/r/leeds-south/review'),
  ('MCR-C', 'Manchester City', (SELECT id FROM regions WHERE name = 'North'), 'Europe/London', '0161 000 0003', 'https://g.page/r/manchester/review'),
  ('LON-W', 'London West',   (SELECT id FROM regions WHERE name = 'South'), 'Europe/London', '020 0000 0004', 'https://g.page/r/london-west/review'),
  ('BRS-1', 'Bristol',       (SELECT id FROM regions WHERE name = 'South'), 'Europe/London', '0117 000 0005', 'https://g.page/r/bristol/review')
ON CONFLICT (code) DO NOTHING;

INSERT INTO staff_contacts (name, role, branch_id, region_id, whatsapp, email)
SELECT v.name, v.role, (SELECT id FROM branches WHERE code = v.branch), (SELECT id FROM regions WHERE name = v.region), v.wa, v.email
FROM (VALUES
  ('Leeds North Team',   'branch_team',      'LDS-N', NULL,    NULL,             'leeds-north@example.com'),
  ('Tom Walker',         'branch_lead',      'LDS-N', NULL,    '+447700900101', 'tom.walker@example.com'),
  ('Leeds South Team',   'branch_team',      'LDS-S', NULL,    NULL,             'leeds-south@example.com'),
  ('Priya Shah',         'branch_lead',      'LDS-S', NULL,    '+447700900102', 'priya.shah@example.com'),
  ('Manchester Team',    'branch_team',      'MCR-C', NULL,    NULL,             'manchester@example.com'),
  ('Dan Okafor',         'branch_lead',      'MCR-C', NULL,    '+447700900103', 'dan.okafor@example.com'),
  ('London West Team',   'branch_team',      'LON-W', NULL,    NULL,             'london-west@example.com'),
  ('Sofia Marin',        'branch_lead',      'LON-W', NULL,    '+447700900104', 'sofia.marin@example.com'),
  ('Bristol Team',       'branch_team',      'BRS-1', NULL,    NULL,             'bristol@example.com'),
  ('Gareth Lewis',       'branch_lead',      'BRS-1', NULL,    '+447700900105', 'gareth.lewis@example.com'),
  ('Rachel North',       'regional_manager', NULL,    'North', '+447700900201', 'rachel.north@example.com'),
  ('Sam South',          'regional_manager', NULL,    'South', '+447700900202', 'sam.south@example.com'),
  ('HQ Customer Care',   'hq',               NULL,    NULL,    '+447700900301', 'customer-care@example.com'),
  ('Olivia Director',    'ops_director',     NULL,    NULL,    '+447700900302', 'ops.director@example.com'),
  ('Marketing',          'marketing',        NULL,    NULL,    NULL,             'marketing@example.com'),
  ('System Admin',       'admin',            NULL,    NULL,    NULL,             'ops-admin@example.com')
) AS v(name, role, branch, region, wa, email)
WHERE NOT EXISTS (SELECT 1 FROM staff_contacts s WHERE s.email = v.email);
