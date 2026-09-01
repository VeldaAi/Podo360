// Podo360 — SQLite data layer
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'podo360.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  birth_date TEXT,
  sex TEXT,
  cpf TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  emergency_contact TEXT,
  medical_history TEXT,
  allergies TEXT,
  medications TEXT,
  relevant_conditions TEXT,
  previous_foot_problems TEXT,
  previous_treatment TEXT,
  surgical_history TEXT,
  clinical_notes TEXT,
  assessment TEXT,                        -- anamnese: avaliação (queixa)
  shoe_type TEXT,                         -- aberto | fechado
  shoe_size TEXT,
  sock_type TEXT,                         -- social | esportiva
  sports TEXT,                            -- sim | nao
  sports_detail TEXT,
  pregnant TEXT,                          -- sim | nao
  pregnant_weeks TEXT,
  hypertension TEXT,                      -- sim | nao
  cancer TEXT,
  pacemaker TEXT,
  blood_pressure TEXT,
  oxygenation TEXT,
  temperature TEXT,
  pain_sensitivity TEXT,                  -- sim | nao
  pain_detail TEXT,
  lower_limb_surgery TEXT,                -- sim | nao
  surgery_detail TEXT,
  leprosy TEXT,
  circulatory_disorder TEXT,
  heart_disease TEXT,
  hepatitis TEXT,
  status TEXT DEFAULT 'active',           -- active | inactive | follow_up_due | overdue
  engagement_score INTEGER DEFAULT 50,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                     -- unha_encravada | verruga | granuloma | calosidade | fissura | micose | lesoes | outro
  label TEXT,                             -- custom label when type=outro
  foot TEXT,                              -- right | left | both
  location TEXT,                          -- hallux | 2nd_toe | ... | heel | nail | ankle | dorsal | plantar | medial | lateral
  severity TEXT DEFAULT 'moderate',       -- mild | moderate | severe
  status TEXT DEFAULT 'needs_attention',  -- improving | stable | needs_attention | worsening | resolved
  details TEXT,                           -- JSON: condition-specific dynamic fields
  opened_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS footmap_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition_id INTEGER REFERENCES conditions(id) ON DELETE SET NULL,
  view TEXT NOT NULL,                     -- right_plantar | left_plantar | right_dorsal | left_dorsal | right_medial | right_lateral | ...
  x REAL NOT NULL, y REAL NOT NULL,       -- normalized 0..1 coords on foot SVG
  status INTEGER DEFAULT 0,               -- 0=issue(green) 1=observation(amber) 2=critical(red) 3=healed(blue)
  label TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_number INTEGER,
  visit_date TEXT DEFAULT (datetime('now')),
  complaint TEXT,
  treatment TEXT,
  notes TEXT,
  pain_score REAL,                          -- 0..10 escala
  systolic_bp INTEGER,                      -- PA sistólica (mmHg)
  diastolic_bp INTEGER,                     -- PA diastólica (mmHg)
  heart_rate INTEGER,                       -- FC (bpm)
  temperature REAL,                         -- °C
  spo2 INTEGER,                             -- SatO2 (%)
  glycemia REAL,                            -- glicemia capilar (mg/dL)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visit_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL,                  -- monofilament | tuning_fork | pulses | doppler | temp_diff | risk_class
  result TEXT,                              -- achado (ex.: "diminuída antepé E")
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visit_procedures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  modality TEXT NOT NULL,                   -- laser | high_frequency | plasma | acid | cryo | cauterization | dressing | spiculactomy | nail_correction | orthonyx | debridement | other
  equipment TEXT,                           -- aparelho/produto
  parameters TEXT,                          -- parâmetros usados
  duration_sec INTEGER,                     -- tempo de aplicação
  reaction TEXT,                            -- reação da paciente
  skin_before TEXT,                         -- aspecto da pele antes
  skin_after TEXT,                          -- aspecto da pele depois
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition_id INTEGER REFERENCES conditions(id) ON DELETE SET NULL,
  point_id INTEGER REFERENCES footmap_points(id) ON DELETE SET NULL,
  visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  taken_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition_id INTEGER REFERENCES conditions(id) ON DELETE CASCADE,
  image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
  type TEXT NOT NULL,                     -- length | width | area | depth | pain | severity | nail_involvement_pct | fissure_length | other
  value REAL NOT NULL,
  unit TEXT DEFAULT 'mm',
  measured_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  source TEXT DEFAULT 'manual'            -- 'ai' (Auto IA) | 'manual' (user-entered or user-overridden)
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition_id INTEGER REFERENCES conditions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                     -- intake | condition | measurement | photo | treatment | followup | exam | referral | consent | ai
  title TEXT NOT NULL,
  detail TEXT,
  event_date TEXT DEFAULT (datetime('now')),
  data JSON
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  condition_id INTEGER REFERENCES conditions(id) ON DELETE SET NULL,
  type TEXT,                              -- lab | culture_fungal | culture_bacterial | report | imaging | other
  title TEXT,
  file_path TEXT,
  exam_date TEXT,
  description TEXT,
  ai_extracted TEXT,                      -- JSON, flagged as AI-extracted
  ai_confirmed INTEGER DEFAULT 0,         -- professional confirmation required
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                     -- treatment | image | data_privacy | other
  version TEXT DEFAULT '1.0',
  signed_at TEXT,
  signature TEXT,                         -- data URI or name
  professional TEXT,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signing_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS patient_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES signing_sessions(id) ON DELETE SET NULL,
  doc_key TEXT NOT NULL,                  -- 'intake' | template key
  title_pt TEXT, title_es TEXT, title_en TEXT,
  content_pt TEXT, content_es TEXT, content_en TEXT,   -- rendered snapshot (HTML)
  status TEXT DEFAULT 'pending',          -- pending | signed
  signature TEXT,                         -- data URI PNG
  signer_name TEXT,
  signer_cpf TEXT,
  signer_role TEXT,                       -- patient | guardian
  signed_at TEXT,
  ip TEXT,
  content_hash TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  professional TEXT DEFAULT 'default',
  room TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  type TEXT DEFAULT 'consulta',
  status TEXT DEFAULT 'confirmed',        -- confirmed | cancelled | rescheduled | no_show | waitlist
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,                -- incoming | outgoing
  partner_name TEXT,
  specialty TEXT,
  clinic TEXT,
  phone TEXT,
  email TEXT,
  location TEXT,
  website TEXT,
  source TEXT,                            -- google_search | google_reviews | instagram | facebook | tiktok | website | professional | clinic | patient_recommendation | other
  reason TEXT,
  status TEXT DEFAULT 'open',             -- open | contacted | converted | closed
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
  condition_id INTEGER REFERENCES conditions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,                     -- pre_assessment | progress | projection | timeline | alert
  content TEXT NOT NULL,                  -- JSON: sections + disclaimer
  based_on TEXT,                          -- snapshot summary of source data
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  avatar TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  plan TEXT DEFAULT 'Free',
  company TEXT,
  phone TEXT,
  address TEXT,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  method TEXT DEFAULT 'password',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ── Migrations (idempotent) ──
const cols = db.prepare("PRAGMA table_info(footmap_points)").all().map(c => c.name);
if (!cols.includes('status')) db.exec("ALTER TABLE footmap_points ADD COLUMN status INTEGER DEFAULT 0");
// Foot-map marker description (2026-08-26) — free-text issue reported at the pin
if (!cols.includes('description')) db.exec("ALTER TABLE footmap_points ADD COLUMN description TEXT");

// Measurements: vitals visit history (2026-08-26) — which user recorded each
// batch + a shared batch id so a single vitals save groups into one "visit".
const mvcols = db.prepare("PRAGMA table_info(measurements)").all().map(c => c.name);
if (!mvcols.includes('user_id')) db.exec("ALTER TABLE measurements ADD COLUMN user_id INTEGER");
if (!mvcols.includes('vitals_batch')) db.exec("ALTER TABLE measurements ADD COLUMN vitals_batch TEXT");

// images table migrations — AI analysis artifacts (mask overlay + tissue %)
const icols = db.prepare("PRAGMA table_info(images)").all().map(c => c.name);
if (!icols.includes('ai_overlay')) db.exec("ALTER TABLE images ADD COLUMN ai_overlay TEXT");
if (!icols.includes('tissue_json')) db.exec("ALTER TABLE images ADD COLUMN tissue_json TEXT");
if (!icols.includes('ai_w')) db.exec("ALTER TABLE images ADD COLUMN ai_w INTEGER");
if (!icols.includes('ai_h')) db.exec("ALTER TABLE images ADD COLUMN ai_h INTEGER");
// stored AI alignment (upload-time, so Before/After needs no request)
if (!icols.includes('align_before_id')) db.exec("ALTER TABLE images ADD COLUMN align_before_id INTEGER");
if (!icols.includes('align_before_b64')) db.exec("ALTER TABLE images ADD COLUMN align_before_b64 TEXT");
if (!icols.includes('align_after_b64')) db.exec("ALTER TABLE images ADD COLUMN align_after_b64 TEXT");
if (!icols.includes('align_meta')) db.exec("ALTER TABLE images ADD COLUMN align_meta TEXT");

// users table migrations (idempotent)
const ucols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
if (!ucols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
if (!ucols.includes('status')) db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");

// measurements table migration — source (ai | manual), v34. Backfill: existing
// 'Auto (IA)' rows are AI; everything else (hand-seeded pain etc.) is manual.
const mcols = db.prepare("PRAGMA table_info(measurements)").all().map(c => c.name);
if (!mcols.includes('source')) {
  db.exec("ALTER TABLE measurements ADD COLUMN source TEXT DEFAULT 'manual'");
  db.prepare("UPDATE measurements SET source='ai' WHERE notes='Auto (IA)'").run();
}

// visits table migrations — clinical session data (v32): pain scale + vitals
const vcols = db.prepare("PRAGMA table_info(visits)").all().map(c => c.name);
if (!vcols.includes('pain_score')) db.exec("ALTER TABLE visits ADD COLUMN pain_score REAL");
if (!vcols.includes('systolic_bp')) db.exec("ALTER TABLE visits ADD COLUMN systolic_bp INTEGER");
if (!vcols.includes('diastolic_bp')) db.exec("ALTER TABLE visits ADD COLUMN diastolic_bp INTEGER");
if (!vcols.includes('heart_rate')) db.exec("ALTER TABLE visits ADD COLUMN heart_rate INTEGER");
if (!vcols.includes('temperature')) db.exec("ALTER TABLE visits ADD COLUMN temperature REAL");
if (!vcols.includes('spo2')) db.exec("ALTER TABLE visits ADD COLUMN spo2 INTEGER");
if (!vcols.includes('glycemia')) db.exec("ALTER TABLE visits ADD COLUMN glycemia REAL");

// ── Analytics capture migrations (2026-08-19) — keep schema reproducible on fresh installs ──
// patients: intake capture fields (referral source, diabetic flag, risk stratification)
const pcols = db.prepare("PRAGMA table_info(patients)").all().map(c => c.name);
if (!pcols.includes('referral_source')) db.exec("ALTER TABLE patients ADD COLUMN referral_source TEXT");
if (!pcols.includes('is_diabetic')) db.exec("ALTER TABLE patients ADD COLUMN is_diabetic INTEGER DEFAULT 0");
if (!pcols.includes('risk_level')) db.exec("ALTER TABLE patients ADD COLUMN risk_level TEXT");
if (!pcols.includes('cpf')) db.exec("ALTER TABLE patients ADD COLUMN cpf TEXT");
// anamnese intake fields (2026-08-24)
const AN_FIELDS = ['assessment','shoe_type','shoe_size','sock_type','sports','sports_detail','pregnant','pregnant_weeks','hypertension','cancer','pacemaker','blood_pressure','oxygenation','temperature','pain_sensitivity','pain_detail','lower_limb_surgery','surgery_detail','leprosy','circulatory_disorder','heart_disease','hepatitis'];
AN_FIELDS.forEach(f => { if (!pcols.includes(f)) db.exec(`ALTER TABLE patients ADD COLUMN ${f} TEXT`); });
// patient chart visibility (2026-08-26): who may view this record ('private' default)
if (!pcols.includes('visibility')) db.exec("ALTER TABLE patients ADD COLUMN visibility TEXT DEFAULT 'private'");
// appointments: reason for visit
const acols = db.prepare("PRAGMA table_info(appointments)").all().map(c => c.name);
if (!acols.includes('reason')) db.exec("ALTER TABLE appointments ADD COLUMN reason TEXT");
// visits: checkout capture (retention + DME) + DME revenue value
if (!vcols.includes('next_step_booked')) db.exec("ALTER TABLE visits ADD COLUMN next_step_booked INTEGER DEFAULT 0");
if (!vcols.includes('next_step_reason')) db.exec("ALTER TABLE visits ADD COLUMN next_step_reason TEXT");
if (!vcols.includes('dme_dispensed')) db.exec("ALTER TABLE visits ADD COLUMN dme_dispensed TEXT");
if (!vcols.includes('dme_value')) db.exec("ALTER TABLE visits ADD COLUMN dme_value REAL");
if (!vcols.includes('dme_currency')) db.exec("ALTER TABLE visits ADD COLUMN dme_currency TEXT DEFAULT 'BRL'");
// claims: insurance billing + denial reasons + paid date (feeds days-to-paid)
db.exec(`CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  visit_id INTEGER,
  insurer TEXT,
  claim_status TEXT DEFAULT 'submitted',
  denial_reason TEXT,
  amount REAL DEFAULT 0,
  submitted_at TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
const ccols = db.prepare("PRAGMA table_info(claims)").all().map(c => c.name);
if (!ccols.includes('paid_at')) db.exec("ALTER TABLE claims ADD COLUMN paid_at TEXT");

// voice_notes — patient voice recordings (audio is PHI; files stored in the
// PRIVATE dir, never public/uploads). transcript_raw = verbatim whisper output,
// transcript_clean = filler-removed / formatted. signed read URLs expire.
db.exec(`CREATE TABLE IF NOT EXISTS voice_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  author_id INTEGER,
  storage_path TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  detected_language TEXT,
  transcript_clean TEXT,
  transcript_raw TEXT,
  title TEXT,
  tag TEXT,
  status TEXT DEFAULT 'saved',
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS voice_note_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER,
  user_id INTEGER,
  action TEXT,
  detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// Tier 2 (2026-08-18) — treatment plans + payments (practice management)
db.exec(`CREATE TABLE IF NOT EXISTS treatment_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  name TEXT DEFAULT 'Plano de tratamento',
  total_sessions INTEGER DEFAULT 0,
  done_sessions INTEGER DEFAULT 0,
  price REAL DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  start_date TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  plan_id INTEGER,
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  method TEXT,
  paid_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
// Payment → session coverage (2026-08-26): which plan session numbers a payment
// covers (JSON array, e.g. '[3]' or '[3,4,5]'). NULL/absent = no session mapping.
const paycols = db.prepare("PRAGMA table_info(payments)").all().map(c => c.name);
if (!paycols.includes('sessions')) db.exec("ALTER TABLE payments ADD COLUMN sessions TEXT");

// Tier 3 (2026-08-18) — home-care checklist per visit (product, frequency, instructions, alert signs)
db.exec(`CREATE TABLE IF NOT EXISTS homecare (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  visit_id INTEGER,
  product TEXT,
  frequency TEXT,
  instructions TEXT,
  alert_signs TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// voice_notes migrations — condition association (2026-08-18)
const vncols = db.prepare("PRAGMA table_info(voice_notes)").all().map(c => c.name);
if (!vncols.includes('condition_id')) db.exec("ALTER TABLE voice_notes ADD COLUMN condition_id INTEGER");
if (!ucols.includes('plan')) db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'Free'");
if (!ucols.includes('company')) db.exec("ALTER TABLE users ADD COLUMN company TEXT");
if (!ucols.includes('phone')) db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
if (!ucols.includes('address')) db.exec("ALTER TABLE users ADD COLUMN address TEXT");
if (!ucols.includes('last_login')) db.exec("ALTER TABLE users ADD COLUMN last_login TEXT");

// ── AI usage metering (2026-08-19) — per user per calendar month per kind.
// Kind: 'assessment' (pre-assessment/progress/projection/timeline) or 'chat' (bot).
// Plan caps live in server.js PLAN_LIMITS; this table just records usage.
db.exec(`CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  period TEXT NOT NULL,           -- 'YYYY-MM' (UTC)
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (user_id, kind, period)
)`);

// ── Billing scaffold (2026-08-19) — subscription records for wired payments.
// No gateway configured yet (STRIPE_SECRET_KEY/ASAAS_API_KEY unset) — rows are
// only created once a checkout/webhook path is active. Keeps admin visible.
db.exec(`CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  gateway TEXT,                   -- 'stripe' | 'asaas' | null (manual)
  gateway_sub TEXT,               -- external subscription/customer id
  status TEXT DEFAULT 'active',   -- active | past_due | canceled | trialing
  seats INTEGER DEFAULT 1,
  price_usd REAL,
  period_start TEXT,
  period_end TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);

// ── Booking & online scheduling (2026-08-26) — services, availability, appointment fields ──
// `services` = what patients can book (podology consulta, nail care, etc.)
db.exec(`CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  duration_min INTEGER DEFAULT 30,
  price_usd REAL DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
)`);
// `availability` = recurring weekly windows per professional (dow 0=Sunday..6=Saturday)
db.exec(`CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  professional TEXT NOT NULL,
  dow INTEGER NOT NULL,
  start_time TEXT NOT NULL,           -- HH:MM (24h)
  end_time TEXT NOT NULL,             -- HH:MM (24h)
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
)`);
// appointments gains booking/deposit/reminder fields for online self-booking
{
  const abcols = db.prepare("PRAGMA table_info(appointments)").all().map(c => c.name);
  if (!abcols.includes('service_id'))      db.exec("ALTER TABLE appointments ADD COLUMN service_id INTEGER");
  if (!abcols.includes('booking_token'))   db.exec("ALTER TABLE appointments ADD COLUMN booking_token TEXT");
  if (!abcols.includes('booking_name'))    db.exec("ALTER TABLE appointments ADD COLUMN booking_name TEXT");
  if (!abcols.includes('booking_phone'))   db.exec("ALTER TABLE appointments ADD COLUMN booking_phone TEXT");
  if (!abcols.includes('booking_email'))   db.exec("ALTER TABLE appointments ADD COLUMN booking_email TEXT");
  if (!abcols.includes('deposit_required'))db.exec("ALTER TABLE appointments ADD COLUMN deposit_required INTEGER DEFAULT 0");
  if (!abcols.includes('deposit_amount_usd')) db.exec("ALTER TABLE appointments ADD COLUMN deposit_amount_usd REAL");
  if (!abcols.includes('deposit_status'))  db.exec("ALTER TABLE appointments ADD COLUMN deposit_status TEXT DEFAULT 'none'");
  if (!abcols.includes('source'))          db.exec("ALTER TABLE appointments ADD COLUMN source TEXT DEFAULT 'staff'");
  if (!abcols.includes('reminder_sent'))   db.exec("ALTER TABLE appointments ADD COLUMN reminder_sent INTEGER DEFAULT 0");
}
// patients: last WhatsApp follow-up timestamp (spam guard for follow-up/recall sends)
{
  const pcols = db.prepare("PRAGMA table_info(patients)").all().map(c => c.name);
  if (!pcols.includes('followup_sent_at')) db.exec("ALTER TABLE patients ADD COLUMN followup_sent_at TEXT");
}

// ── Role-based permissions (2026-08-19) — extend users.role values.
// Now: 'user' (clinician), 'admin' (clinic manager), 'super_admin', 'front' (reception).
// Per-role permission map is enforced in server.js ROLE_PERMS.

// Ensure jason@velda.ai exists as super admin (owner account)
let owner = db.prepare('SELECT * FROM users WHERE email = ?').get('jason@velda.ai');
if (!owner) {
  const ph = db.prepare("SELECT value FROM settings WHERE key = 'owner_password'");
  // scrypt hash is computed in server.js; here we store a placeholder that login will reject
  // until the owner sets a real password via reset — but to keep it usable we generate a strong one.
  const crypto = require('crypto');
  const pw = 'Velda' + Math.random().toString(36).slice(2, 10) + '!';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  db.prepare('INSERT INTO users (full_name, email, password_hash, role, status, plan, company) VALUES (?,?,?,?,?,?,?)')
    .run('Jason Carpenter', 'jason@velda.ai', salt + ':' + hash, 'super_admin', 'active', 'Owner', 'Velda.AI');
  console.log('[db] Created owner jason@velda.ai — temporary password: ' + pw);
} else if (owner.role !== 'super_admin') {
  db.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(owner.id);
  console.log('[db] Promoted jason@velda.ai to super_admin');
}

// ── Seed: demo clinic data (only if empty) ──
const count = db.prepare('SELECT COUNT(*) c FROM patients').get().c;
if (count === 0) {
  const seed = db.transaction(() => {
    const p1 = db.prepare(`INSERT INTO patients (full_name, birth_date, sex, phone, email, medical_history, allergies, medications, status, engagement_score)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      'Maria Oliveira', '1985-03-12', 'F', '+55 11 98888-0001', 'maria.oliveira@email.com',
      'Diabetes tipo 2', 'Penicilina', 'Metformina', 'follow_up_due', 64);

    const p2 = db.prepare(`INSERT INTO patients (full_name, birth_date, sex, phone, email, status, engagement_score)
      VALUES (?,?,?,?,?,?,?)`).run('Carlos Pereira', '1978-07-25', 'M', '+55 11 97777-0002', 'carlos.pereira@email.com', 'active', 78);

    const p3 = db.prepare(`INSERT INTO patients (full_name, birth_date, sex, phone, status, engagement_score)
      VALUES (?,?,?,?,?,?)`).run('Ana Souza', '1992-11-02', 'F', '+55 11 96666-0003', 'overdue', 31);

    // Conditions
    const c1 = db.prepare(`INSERT INTO conditions (patient_id, type, foot, location, severity, status, details)
      VALUES (?,?,?,?,?,?,?)`).run(p1.lastInsertRowid, 'unha_encravada', 'right', 'hallux',
      'severe', 'needs_attention',
      JSON.stringify({ toe: 'hallux', pain: 7, inflammation: true, swelling: true, drainage: false, bleeding: false, granulation: true, infection_indicators: false, previous_treatment: 'conservador', current_treatment: 'curativo + orientação' }));

    const c2 = db.prepare(`INSERT INTO conditions (patient_id, type, foot, location, severity, status, details)
      VALUES (?,?,?,?,?,?,?)`).run(p2.lastInsertRowid, 'micose', 'both', 'nails',
      'moderate', 'improving',
      JSON.stringify({ affected_nails: 'right_hallux,left_hallux', involvement_pct: 45, nail_thickness: 2.1, discoloration: true, separation: true, skin_involvement: false, current_treatment: 'antifúngico tópico' }));

    const c3 = db.prepare(`INSERT INTO conditions (patient_id, type, foot, location, severity, status, details)
      VALUES (?,?,?,?,?,?,?)`).run(p3.lastInsertRowid, 'verruga', 'left', '3rd_toe',
      'mild', 'worsening',
      JSON.stringify({ size_mm: 6, number: 1, pain: 3, appearance: 'hiperceratose', previous_treatment: 'ácido salicílico' }));

    // Foot map points
    db.prepare(`INSERT INTO footmap_points (patient_id, condition_id, view, x, y, label) VALUES (?,?,?,?,?,?)`)
      .run(p1.lastInsertRowid, c1.lastInsertRowid, 'right_plantar', 0.52, 0.18, 'Unha encravada — hálux');
    db.prepare(`INSERT INTO footmap_points (patient_id, condition_id, view, x, y, label) VALUES (?,?,?,?,?,?)`)
      .run(p2.lastInsertRowid, c2.lastInsertRowid, 'right_dorsal', 0.55, 0.15, 'Micose ungueal');
    db.prepare(`INSERT INTO footmap_points (patient_id, condition_id, view, x, y, label) VALUES (?,?,?,?,?,?)`)
      .run(p3.lastInsertRowid, c3.lastInsertRowid, 'left_plantar', 0.45, 0.35, 'Verruga plantar');

    // Measurements (longitudinal for c1)
    db.prepare(`INSERT INTO measurements (patient_id, condition_id, type, value, unit, measured_at) VALUES (?,?,?,?,?,?)`)
      .run(p1.lastInsertRowid, c1.lastInsertRowid, 'pain', 8, 'scale_0_10', '2026-07-20 10:00:00');
    db.prepare(`INSERT INTO measurements (patient_id, condition_id, type, value, unit, measured_at) VALUES (?,?,?,?,?,?)`)
      .run(p1.lastInsertRowid, c1.lastInsertRowid, 'pain', 7, 'scale_0_10', '2026-07-27 10:00:00');
    db.prepare(`INSERT INTO measurements (patient_id, condition_id, type, value, unit, measured_at) VALUES (?,?,?,?,?,?)`)
      .run(p1.lastInsertRowid, c1.lastInsertRowid, 'pain', 5, 'scale_0_10', '2026-08-03 10:00:00');
    db.prepare(`INSERT INTO measurements (patient_id, condition_id, type, value, unit, measured_at) VALUES (?,?,?,?,?,?)`)
      .run(p2.lastInsertRowid, c2.lastInsertRowid, 'nail_involvement_pct', 60, 'pct', '2026-07-15 10:00:00');
    db.prepare(`INSERT INTO measurements (patient_id, condition_id, type, value, unit, measured_at) VALUES (?,?,?,?,?,?)`)
      .run(p2.lastInsertRowid, c2.lastInsertRowid, 'nail_involvement_pct', 45, 'pct', '2026-08-10 10:00:00');

    // Timeline
    const tl = db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail, event_date) VALUES (?,?,?,?,?)`);
    tl.run(p1.lastInsertRowid, 'intake', 'Avaliação inicial', 'Unha encravada em hálux direito, dor 8/10', '2026-07-20 10:00:00');
    tl.run(p1.lastInsertRowid, 'treatment', 'Tratamento conservador', 'Curativo + orientação de cuidados', '2026-07-20 10:15:00');
    tl.run(p1.lastInsertRowid, 'followup', 'Retorno', 'Dor 7/10, inflamação presente', '2026-07-27 10:00:00');
    tl.run(p1.lastInsertRowid, 'measurement', 'Medição registrada', 'Dor 5/10 — melhora documentada', '2026-08-03 10:00:00');
    tl.run(p2.lastInsertRowid, 'intake', 'Avaliação inicial', 'Micose ungueal bilateral, 60% envolvimento', '2026-07-15 10:00:00');
    tl.run(p2.lastInsertRowid, 'measurement', 'Medição registrada', 'Envolvimento ungueal 45% — melhora de 25%', '2026-08-10 10:00:00');
    tl.run(p3.lastInsertRowid, 'intake', 'Avaliação inicial', 'Verruga plantar em 3º pododáctilo esquerdo', '2026-08-01 10:00:00');

    // Appointments
    db.prepare(`INSERT INTO appointments (patient_id, start_at, end_at, type, status) VALUES (?,?,?,?,?)`)
      .run(p1.lastInsertRowid, '2026-08-17 09:30:00', '2026-08-17 10:00:00', 'retorno', 'confirmed');
    db.prepare(`INSERT INTO appointments (patient_id, start_at, end_at, type, status) VALUES (?,?,?,?,?)`)
      .run(p2.lastInsertRowid, '2026-08-18 11:00:00', '2026-08-18 11:30:00', 'retorno', 'confirmed');

    // Referrals
    db.prepare(`INSERT INTO referrals (patient_id, direction, partner_name, specialty, source, reason, status) VALUES (?,?,?,?,?,?,?)`)
      .run(p1.lastInsertRowid, 'outgoing', 'Dra. Beatriz Rocha', 'Dermatologia', 'professional', 'Avaliar componente infeccioso', 'open');

    // AI report sample
    db.prepare(`INSERT INTO ai_reports (patient_id, condition_id, kind, content, based_on, created_at) VALUES (?,?,?,?,?,?)`)
      .run(p1.lastInsertRowid, c1.lastInsertRowid, 'pre_assessment',
        JSON.stringify({
          sections: [
            { title: 'Considerações clínicas', body: 'Unha encravada em hálux direito com sinais de inflamação e tecido de granulação. Diabetes tipo 2 documentada — atenção redobrada ao risco de infecção.' },
            { title: 'Fatores de risco', body: 'Diabetes mellitus tipo 2; dor 7/10; granulação presente.' },
            { title: 'Informações ausentes', body: 'Exames laboratoriais recentes (glicemia/HbA1c) não documentados; fotografia inicial não anexada.' },
            { title: 'Sugestão de acompanhamento', body: 'Retorno em 7–14 dias para reavaliação.' },
            { title: 'Sinais de alerta', body: 'Drenagem purulenta, febre, aumento de calor local ou piora da dor — reavaliação imediata.' },
            { title: 'Possível encaminhamento', body: 'Dermatologia (avaliação de componente infeccioso) — considerar.' }
          ],
          disclaimer: 'Relatório gerado por IA como apoio à decisão clínica. Não substitui o julgamento profissional.'
        }),
        'Intake + 1 follow-up + 2 medições de dor', '2026-08-03 10:30:00');

    // Settings
    const set = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)`);
    set.run('clinic_name', 'Clínica Podológica Demo');
    set.run('professional', 'Dr(a). Exemplo');
    set.run('locale', 'pt');
  });
  seed();
  console.log('[podo360] Seeded demo data');
}

module.exports = db;
