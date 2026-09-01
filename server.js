// Podo360 — API server
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const db = require('./db');
const ai = require('./ai');
const assistant = require('./assistant');
const { DOCS, DOC_MAP } = require('./documents');

// Anamnese intake fields (2026-08-24) — shared by INSERT/UPDATE/documents
const AN_FIELDS = ['assessment','shoe_type','shoe_size','sock_type','sports','sports_detail','pregnant','pregnant_weeks','hypertension','cancer','pacemaker','blood_pressure','oxygenation','temperature','pain_sensitivity','pain_detail','lower_limb_surgery','surgery_detail','leprosy','circulatory_disorder','heart_disease','hepatitis'];

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '30mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(require('cookie-parser')());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }
  }
}));

/* ── i18n error helper: localize user-facing errors by x-lang (default pt) ── */
const ERR = {
  unauth:      { pt: 'Não autenticado',                              es: 'No autenticado',                                en: 'Not authenticated' },
  paused:      { pt: 'Conta pausada. Contate o administrador.',      es: 'Cuenta pausada. Contacte al administrador.',     en: 'Account paused. Contact the administrator.' },
  adminOnly:   { pt: 'Acesso restrito a administradores',            es: 'Acceso restringido a administradores',          en: 'Restricted to administrators' },
  regRequired: { pt: 'full_name, email e password são obrigatórios', es: 'full_name, email y password son obligatorios',   en: 'full_name, email and password are required' },
  pwShort:     { pt: 'A senha deve ter pelo menos 6 caracteres',     es: 'La contraseña debe tener al menos 6 caracteres', en: 'Password must be at least 6 characters' },
  emailExists: { pt: 'Já existe uma conta com este e-mail',          es: 'Ya existe una cuenta con este correo',           en: 'An account with this email already exists' },
  loginReq:    { pt: 'E-mail e senha são obrigatórios',              es: 'Correo y contraseña son obligatorios',          en: 'Email and password are required' },
  badLogin:    { pt: 'E-mail ou senha incorretos',                   es: 'Correo o contraseña incorrectos',               en: 'Incorrect email or password' },
  googleNotCfg:{ pt: 'Login Google não configurado neste servidor',  es: 'Inicio de sesión de Google no configurado',      en: 'Google login not configured on this server' },
  credMissing: { pt: 'credential ausente',                           es: 'credential faltante',                           en: 'credential missing' },
  googleBad:   { pt: 'Credencial Google inválida: ',                 es: 'Credencial de Google inválida: ',               en: 'Invalid Google credential: ' },
  nameEmpty:   { pt: 'Nome não pode ser vazio',                      es: 'El nombre no puede estar vacío',                en: 'Name cannot be empty' },
  emailBad:    { pt: 'E-mail inválido',                              es: 'Correo inválido',                               en: 'Invalid email' },
  emailTaken:  { pt: 'E-mail já está em uso por outra conta',        es: 'El correo ya está en uso por otra cuenta',      en: 'Email already in use by another account' },
  pwWrong:     { pt: 'Senha atual incorreta',                        es: 'Contraseña actual incorrecta',                  en: 'Current password is incorrect' },
  userNotFound:{ pt: 'Usuário não encontrado',                       es: 'Usuario no encontrado',                         en: 'User not found' },
  selfDemote:  { pt: 'Você não pode rebaixar a si mesmo',            es: 'No puedes degradarte a ti mismo',               en: 'You cannot demote yourself' },
  selfPause:   { pt: 'Você não pode pausar a si mesmo',              es: 'No puedes pausarte a ti mismo',                 en: 'You cannot pause yourself' },
  lastAdmin:   { pt: 'Não é possível remover o último administrador',es: 'No se puede eliminar al último administrador',  en: 'Cannot remove the last administrator' },
  pendingApproval: { pt: 'Conta aguardando aprovação do administrador.', es: 'Cuenta pendiente de aprobación del administrador.', en: 'Account awaiting administrator approval.' },
  rejectedAccount:{ pt: 'Conta rejeitada. Contate o administrador.',    es: 'Cuenta rechazada. Contacte al administrador.',     en: 'Account rejected. Contact the administrator.' },
};
function L(req, key){
  const lang = (req.get('x-lang') || 'pt');
  const m = ERR[key];
  if (!m) return key;
  return m[lang] || m.pt;
}

/* ── Plan limits & entitlements (2026-08-19) ──
 * Single source of truth for what each plan actually gets. Marketing page
 * must stay in sync. Unlimited = admin/test tier, never user-selectable.
 * aiAssessments: monthly cap on AI report endpoints (pre-assessment, progress,
 *   projection, timeline). aiChat: monthly cap on bot messages. -1 = unlimited.
 * seats: max active users a plan may have (Clinic = 5, +extra billed later). */
const PLAN_LIMITS = {
  'Essencial':    { aiAssessments: 15,  aiChat: 30,   seats: 1 },
  'Professional': { aiAssessments: 150, aiChat: 300,  seats: 1 },
  'Clinic':       { aiAssessments: 600, aiChat: 1200, seats: 5 },
  'Unlimited':    { aiAssessments: -1,  aiChat: -1,   seats: -1 }
};
const DEFAULT_PLAN = 'Professional';
function planLimits(userPlan) {
  return PLAN_LIMITS[userPlan] || PLAN_LIMITS[DEFAULT_PLAN];
}
function currentPeriod() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
// Returns { ok:true } or { ok:false, used, limit, error }
function checkAiQuota(userId, userPlan, kind) {
  const key = kind === 'assessment' ? 'aiAssessments' : kind === 'chat' ? 'aiChat' : kind;
  const lim = planLimits(userPlan)[key];
  if (lim === undefined) return { ok: true };
  if (lim === -1) return { ok: true };
  const period = currentPeriod();
  const row = db.prepare('SELECT count FROM ai_usage WHERE user_id=? AND kind=? AND period=?')
    .get(userId, kind, period);
  const used = row ? row.count : 0;
  if (used >= lim) return { ok: false, used, limit: lim, error: 'aiQuotaExceeded' };
  return { ok: true, used, limit: lim };
}
function bumpAiUsage(userId, kind) {
  const period = currentPeriod();
  db.prepare(`INSERT INTO ai_usage (user_id, kind, period, count) VALUES (?,?,?,1)
    ON CONFLICT(user_id, kind, period) DO UPDATE SET count = count + 1, updated_at = datetime('now')`)
    .run(userId, kind, period);
}
// Middleware: enforces the monthly AI cap for a kind, then records usage.
function aiQuota(kind) {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return next(); // auth gate already ran; belt & suspenders
    const q = checkAiQuota(u.id, u.plan || DEFAULT_PLAN, kind);
    if (!q.ok) {
      const lang = req.get('x-lang') || 'pt';
      const msg = {
        pt: `Limite de IA do seu plano atingido (${q.limit}/mês). Faça upgrade para continuar.`,
        es: `Límite de IA de tu plan alcanzado (${q.limit}/mes). Actualiza para continuar.`,
        en: `Your plan's AI limit reached (${q.limit}/month). Upgrade to continue.`
      }[lang] || 'AI limit reached';
      return res.status(429).json({ error: msg, quota: { used: q.used, limit: q.limit } });
    }
    bumpAiUsage(u.id, kind);
    next();
  };
}

/* ── Role-based permissions (2026-08-19) ──
 * Roles: 'user' (clinician), 'admin' (clinic manager — sees analytics, manages
 * non-admin users), 'super_admin' (platform owner), 'front' (reception — read /
 * schedule only, no AI, no financials, no settings).
 * PERMS map: feature → roles allowed. Check with canRole(role, 'feature'). */
const ROLE_PERMS = {
  'super_admin': ['analytics', 'users', 'financials', 'ai', 'settings', 'write', 'voice'],
  'admin':       ['analytics', 'users', 'financials', 'ai', 'settings', 'write', 'voice'],
  'user':        ['financials', 'ai', 'settings', 'write', 'voice'],
  'front':       ['write', 'voice']
};
const ALL_ROLES = ['user', 'admin', 'super_admin', 'front'];
function canRole(role, perm) {
  const perms = ROLE_PERMS[role] || ROLE_PERMS.user;
  return perms.includes(perm);
}
function requirePerm(perm) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!canRole(req.user.role, perm)) return res.status(403).json({ error: L(req, 'adminOnly') });
      next();
    });
  };
}
// Seats: count ACTIVE users on a plan (seat checks apply to Clinic; others cap at 1).
function countPlanUsers(plan) {
  return db.prepare("SELECT COUNT(*) c FROM users WHERE plan = ? AND status = 'active'").get(plan).c;
}
function seatErrorMsg(req) {
  const lang = req.get('x-lang') || 'pt';
  return {
    pt: 'Limite de profissionais do plano Clinic atingido (5). Adicione assentos ou fale conosco.',
    es: 'Límite de profesionales del plan Clinic alcanzado (5). Añade asientos o contáctanos.',
    en: 'Clinic plan professional limit reached (5). Add seats or contact us.'
  }[lang];
}

// ── Health ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'podo360', version: '0.2.1', time: new Date().toISOString() });
});

// ── Public contact / quote form (landing page) ──
// Defined BEFORE authGate so anonymous visitors can submit. Emails jason@velda.ai.
const { sendContact } = require('./contact-mailer');
const vn = require('./voice-notes');
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, clinic, message } = req.body || {};
  const em = String(email || '').trim().toLowerCase();
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
    return res.status(400).json({ error: L(req, 'emailBad') });
  }
  if (!String(message || '').trim() || String(message).trim().length < 5) {
    return res.status(400).json({ error: { pt: 'Escreva uma mensagem (mínimo 5 caracteres)', es: 'Escribe un mensaje (mínimo 5 caracteres)', en: 'Write a message (at least 5 characters)' }[req.get('x-lang') || 'pt'] });
  }
  try {
    await sendContact({ name, email: em, phone, clinic, message });
    res.json({ ok: true, message: { pt: 'Mensagem enviada! Retornaremos em breve.', es: '¡Mensaje enviado! Te responderemos pronto.', en: 'Message sent! We will get back to you soon.' }[req.get('x-lang') || 'pt'] });
  } catch (e) {
    console.error('contact send failed:', e.message);
    res.status(500).json({ error: { pt: 'Falha ao enviar. Tente novamente ou escreva para service@velda.ai', es: 'Error al enviar. Inténtalo de nuevo o escribe a service@velda.ai', en: 'Failed to send. Try again or email service@velda.ai' }[req.get('x-lang') || 'pt'] });
  }
});

// ── AUTH GATE ──
// Every /api route below this point requires a valid, active login — except the
// explicit auth endpoints (register/login/etc) and health. This kills anonymous/demo
// access: no token, no data. New registrations get status='pending' and are blocked
// by requireAuth until a super admin approves them.
function authGate(req, res, next) {
  if (req.path === '/health' || req.path.startsWith('/auth/') || req.path.startsWith('/pub/')) return next();
  return requireAuth(req, res, next);
}
app.use('/api', authGate);

// ── Dashboard ──
app.get('/api/dashboard', (req, res) => {
  const lang = req.get('x-lang') || 'pt';
  // keep every patient's status in sync with real appointment/visit data
  db.prepare('SELECT id FROM patients').all().forEach(r => reconcileVisits(r.id));
  res.json({ stats: ai.dashboardStats(), alerts: ai.dashboardAlerts(lang) });
});

// ── Analytics (role-based: super_admin + admin see all; others need analytics_access flag) ──
app.get('/api/analytics', requireAuth, (req, res) => {
  const u = req.user;
  if (!(u.analytics_access || u.role === 'super_admin' || u.role === 'admin')) return res.status(403).json({ error: 'Analytics access not granted' });
  const isAdmin = u.role === 'super_admin' || u.role === 'admin';
  // Scope: super_admin sees everything; others only patients they own (owner_id).
  const scope = isAdmin ? '' : ' AND p.owner_id = ' + Number(u.id);
  const scopeJoin = isAdmin ? '' : ' AND p.owner_id = ' + Number(u.id);
  const num = v => v === null || v === undefined ? 0 : Number(v);
  const pct = (a, b) => b > 0 ? Math.round((a / b) * 1000) / 10 : 0;

  // 1) No-show + late-cancellation rate (statuses no_show / cancelled)
  const appts = db.prepare(`SELECT a.status, a.type FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE 1=1${scopeJoin}`).all();
  const totalAppts = appts.length;
  const noShow = appts.filter(a => a.status === 'no_show').length;
  const cancelled = appts.filter(a => a.status === 'cancelled').length;
  const attended = appts.filter(a => a.status === 'confirmed').length;
  // 2) Slot utilisation: attended minutes / scheduled minutes (confirmed slots with start+end)
  const slots = db.prepare(`SELECT a.start_at, a.end_at, a.status FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE 1=1${scopeJoin} AND a.end_at IS NOT NULL`).all();
  let schedMin = 0, usedMin = 0;
  for (const s of slots) {
    const st = new Date(String(s.start_at).replace(' ', 'T') + 'Z').getTime();
    const en = new Date(String(s.end_at).replace(' ', 'T') + 'Z').getTime();
    if (!isNaN(st) && !isNaN(en) && en > st) { schedMin += (en - st) / 60000; if (s.status === 'confirmed') usedMin += (en - st) / 60000; }
  }
  // 2b) Wait time: avg days between booking (created_at) and appointment (start_at)
  const waitTimes = db.prepare(`SELECT a.start_at, a.created_at FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE 1=1${scopeJoin} AND a.created_at IS NOT NULL AND a.start_at IS NOT NULL`).all();
  let waitDays = 0, waitN = 0;
  for (const w of waitTimes) {
    const bk = new Date(String(w.created_at).replace(' ', 'T') + 'Z').getTime();
    const st = new Date(String(w.start_at).replace(' ', 'T') + 'Z').getTime();
    if (!isNaN(bk) && !isNaN(st) && st >= bk) { waitDays += (st - bk) / 86400000; waitN++; }
  }
  const waitTimeDays = waitN ? Math.round((waitDays / waitN) * 10) / 10 : null;
  // 3) Revenue per visit — from payments + visits (patient-scoped)
  const rev = db.prepare(`SELECT COALESCE(SUM(pay.amount),0) s FROM payments pay JOIN treatment_plans pl ON pl.id = pay.plan_id JOIN patients p ON p.id = pl.patient_id WHERE 1=1${scope}`).get().s || 0;
  const visitsCount = db.prepare(`SELECT COUNT(*) c FROM visits v JOIN patients p ON p.id = v.patient_id WHERE 1=1${scope}`).get().c || 0;
  // 5) Referral source mix — patients.referral_source (captured at intake) + referrals table
  const refs = db.prepare(`SELECT r.source, r.direction, COUNT(*) c FROM referrals r JOIN patients p ON p.id = r.patient_id WHERE 1=1${scope} GROUP BY r.source, r.direction ORDER BY c DESC`).all();
  const incomingRefs = refs.filter(r => r.direction === 'incoming');
  const totalIncoming = incomingRefs.reduce((s, r) => s + r.c, 0);
  const patRefSources = db.prepare(`SELECT p.referral_source, COUNT(*) c FROM patients p WHERE 1=1${scope} AND p.referral_source IS NOT NULL AND p.referral_source != '' GROUP BY p.referral_source ORDER BY c DESC`).all();
  const totalPatRefs = patRefSources.reduce((s, r) => s + r.c, 0);
  // Patient panel
  const patients = db.prepare(`SELECT p.id, p.medical_history, p.relevant_conditions, p.status, p.created_at, p.is_diabetic, p.risk_level FROM patients p WHERE 1=1${scope}`).all();
  const totalPatients = patients.length;
  const new30 = patients.filter(p => p.created_at && Date.now() - new Date(String(p.created_at).replace(' ', 'T') + 'Z').getTime() < 30 * 86400000).length;
  const diabetic = patients.filter(p => p.is_diabetic || /diabet|diabético|diabetes/i.test((p.medical_history || '') + ' ' + (p.relevant_conditions || ''))).length;
  const highRisk = patients.filter(p => p.risk_level === 'high' || p.risk_level === 'alto').length;
  // Claims — denial rate + days-to-paid (captured via /api/patients/:id/claims)
  const claims = db.prepare(`SELECT c.claim_status, c.denial_reason, c.amount, c.submitted_at, c.paid_at FROM claims c JOIN patients p ON p.id = c.patient_id WHERE 1=1${scope}`).all();
  const totalClaims = claims.length;
  const deniedClaims = claims.filter(c => c.claim_status === 'denied').length;
  const denialReasons = {};
  claims.filter(c => c.claim_status === 'denied' && c.denial_reason).forEach(c => { denialReasons[c.denial_reason] = (denialReasons[c.denial_reason] || 0) + 1; });
  let daysToPaid = null;
  const paidClaims = claims.filter(c => c.claim_status === 'paid' && c.submitted_at && c.paid_at);
  if (paidClaims.length) {
    let sum = 0, n = 0;
    for (const c of paidClaims) {
      const s = new Date(String(c.submitted_at).replace(' ', 'T') + 'Z').getTime();
      const p = new Date(String(c.paid_at).replace(' ', 'T') + 'Z').getTime();
      if (!isNaN(s) && !isNaN(p) && p >= s) { sum += (p - s) / 86400000; n++; }
    }
    if (n) daysToPaid = Math.round((sum / n) * 10) / 10;
  }
  // 6) Net collection rate — paid claim value ÷ total billed value (insurer billing)
  const netCollected = claims.filter(c => c.claim_status === 'paid').reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalBilled = claims.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const netCollection = totalBilled > 0 ? pct(netCollected, totalBilled) : null;
  // 7) Patients per provider — distinct patients per appointment.professional
  const provRows = db.prepare(`SELECT a.professional, COUNT(DISTINCT a.patient_id) c FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE 1=1${scopeJoin} AND a.professional IS NOT NULL AND a.professional != '' GROUP BY a.professional ORDER BY c DESC`).all();
  const providers = provRows.map(r => ({ professional: r.professional, count: r.c, share: pct(r.c, totalPatients) }));
  // Visits — retention (next step booked) + DME (visits + revenue value)
  // dme_value can be entered in any currency (vstDmeCur); normalize to BRL for the revenue stat.
  const visitsData = db.prepare(`SELECT v.next_step_booked, v.next_step_reason, v.dme_dispensed, v.dme_value, v.dme_currency FROM visits v JOIN patients p ON p.id = v.patient_id WHERE 1=1${scope}`).all();
  const visitsWithNext = visitsData.length;
  const nextBooked = visitsData.filter(v => v.next_step_booked).length;
  const dmeVisits = visitsData.filter(v => v.dme_dispensed && String(v.dme_dispensed).trim()).length;
  const DME_FX = { BRL: 1, USD: 0.18, EUR: 0.165, GBP: 0.14, ARS: 170 }; // BRL→X, mirror of marketing FALLBACK_RATES
  const dmeRevenue = visitsData.reduce((s, v) => {
    const rate = DME_FX[String(v.dme_currency || 'BRL').toUpperCase()] || 1;
    return s + ((Number(v.dme_value) || 0) / rate);
  }, 0);
  // Conditions by status
  const conds = db.prepare(`SELECT c.status, c.type, COUNT(*) c FROM conditions c JOIN patients p ON p.id = c.patient_id WHERE 1=1${scope} GROUP BY c.status, c.type ORDER BY c DESC`).all();
  const activeConds = conds.filter(c => c.status === 'needs_attention' || c.status === 'worsening').reduce((s, c) => s + c.c, 0);
  // Revenue by payment method
  const revByMethod = db.prepare(`SELECT pay.method, COALESCE(SUM(pay.amount),0) s FROM payments pay JOIN treatment_plans pl ON pl.id = pay.plan_id JOIN patients p ON p.id = pl.patient_id WHERE 1=1${scope} GROUP BY pay.method`).all();
  // Appointment type mix
  const typeMix = {};
  for (const a of appts) typeMix[a.type || 'consulta'] = (typeMix[a.type || 'consulta'] || 0) + 1;
  // ── Team / clinic dashboard (super_admin + admin only) ──
  // Per-professional real stats: patients owned, revenue from their patients,
  // active conditions, visits, last login, plan + role. Powers the Clinic-tier
  // "multi-professional management" view.
  const team = [];
  if (isAdmin) {
    const members = db.prepare("SELECT id, full_name, email, role, plan, status, last_login FROM users WHERE status = 'active' ORDER BY full_name").all();
    for (const m of members) {
      const own = ' AND p.owner_id = ' + Number(m.id);
      const teamPatients = db.prepare(`SELECT COUNT(*) c FROM patients p WHERE 1=1${own}`).get().c;
      const teamRev = db.prepare(`SELECT COALESCE(SUM(pay.amount),0) s FROM payments pay JOIN treatment_plans pl ON pl.id = pay.plan_id JOIN patients p ON p.id = pl.patient_id WHERE 1=1${own}`).get().s || 0;
      const teamVisits = db.prepare(`SELECT COUNT(*) c FROM visits v JOIN patients p ON p.id = v.patient_id WHERE 1=1${own}`).get().c || 0;
      const teamActiveConds = db.prepare(`SELECT COUNT(*) c FROM conditions c JOIN patients p ON p.id = c.patient_id WHERE (c.status = 'needs_attention' OR c.status = 'worsening') AND 1=1${own}`).get().c || 0;
      const teamAppts = db.prepare(`SELECT COUNT(*) c FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE 1=1${own}`).get().c || 0;
      team.push({
        id: m.id, full_name: m.full_name, email: m.email, role: m.role || 'user',
        plan: m.plan || 'Professional', last_login: m.last_login || null,
        patients: teamPatients, revenue: Math.round(teamRev * 100) / 100,
        visits: teamVisits, activeConditions: teamActiveConds, appointments: teamAppts
      });
    }
    team.sort((a, b) => b.patients - a.patients);
  }
  res.json({
    scope: isAdmin ? 'all' : 'own',
    patients: { total: totalPatients, new30, diabetic, highRisk, activeConditions: activeConds },
    appointments: { total: totalAppts, attended, noShow, cancelled, noShowRate: pct(noShow, totalAppts), cancellationRate: pct(cancelled, totalAppts), noShowCancellationRate: pct(noShow + cancelled, totalAppts), slotUtilisation: pct(usedMin, schedMin), scheduledMinutes: Math.round(schedMin), usedMinutes: Math.round(usedMin), typeMix, waitTimeDays },
    revenue: { total: rev, perVisit: visitsCount > 0 ? Math.round((rev / visitsCount) * 100) / 100 : 0, visits: visitsCount, byMethod: revByMethod },
    referrals: { incoming: incomingRefs.map(r => ({ source: r.source, count: r.c, share: pct(r.c, totalIncoming) })), totalIncoming, outgoing: refs.filter(r => r.direction === 'outgoing').reduce((s, r) => s + r.c, 0), byPatientSource: patRefSources.map(r => ({ source: r.referral_source, count: r.c, share: pct(r.c, totalPatRefs) })), totalPatientSource: totalPatRefs },
    claims: { total: totalClaims, denied: deniedClaims, denialRate: pct(deniedClaims, totalClaims), denialReasons, daysToPaid, netCollection, netCollected, totalBilled },
    retention: { visits: visitsWithNext, nextBooked, retentionRate: pct(nextBooked, visitsWithNext), dmeVisits, dmeRevenue },
    conditions: conds,
    providers,
    team,
    notCaptured: []
  });
});

// ── Patients ──
app.get('/api/patients', (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : '%';
  const rows = db.prepare(`SELECT p.id, p.full_name, p.birth_date, p.sex, p.phone, p.email, p.status, p.engagement_score, p.created_at,
    (SELECT c.label || '' FROM conditions c WHERE c.patient_id = p.id ORDER BY c.opened_at DESC LIMIT 1) AS main_condition_label,
    (SELECT c.type FROM conditions c WHERE c.patient_id = p.id ORDER BY c.opened_at DESC LIMIT 1) AS main_condition_type,
    (SELECT MAX(v.visit_date) FROM visits v WHERE v.patient_id = p.id) AS last_visit,
    (SELECT a.start_at FROM appointments a WHERE a.patient_id = p.id AND a.start_at > datetime('now') AND a.status = 'confirmed' ORDER BY a.start_at ASC LIMIT 1) AS next_return
    FROM patients p WHERE p.full_name LIKE ? OR p.phone LIKE ? OR p.email LIKE ? ORDER BY p.created_at DESC LIMIT 200`)
    .all(q, q, q);
  res.json(rows);
});

app.get('/api/patients/:id', (req, res) => {
  reconcileVisits(Number(req.params.id)); // lazy: auto-record visits from passed appts + same-day activity, mark no-shows, recompute status
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id); // re-read AFTER reconcile so status is fresh
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  p.conditions = db.prepare('SELECT * FROM conditions WHERE patient_id = ? ORDER BY opened_at DESC').all(p.id);
  p.footmap_points = db.prepare('SELECT * FROM footmap_points WHERE patient_id = ?').all(p.id);
  p.measurements = db.prepare('SELECT * FROM measurements WHERE patient_id = ? ORDER BY measured_at DESC').all(p.id);
  p.measurements = decorateMeasurements(p.measurements);
  p.timeline = db.prepare('SELECT * FROM timeline_events WHERE patient_id = ? ORDER BY event_date DESC, id DESC LIMIT 100').all(p.id);
  // Lightweight image rows: heavy base64 fields (ai_overlay, align_*) are lazy-loaded
  // per image via GET /api/patients/:id/images/:imageId/full — keeps this payload ~KB.
  p.images = db.prepare(`SELECT id, patient_id, condition_id, point_id, visit_id, file_path, taken_at, notes, created_at,
      tissue_json, ai_w, ai_h, align_before_id, align_meta,
      CASE WHEN ai_overlay IS NOT NULL AND ai_overlay != '' THEN 1 ELSE 0 END AS has_overlay,
      CASE WHEN align_after_b64 IS NOT NULL AND align_after_b64 != '' THEN 1 ELSE 0 END AS has_align
    FROM images WHERE patient_id = ? ORDER BY taken_at DESC`).all(p.id);
  p.exams = db.prepare('SELECT * FROM exams WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  p.consents = db.prepare('SELECT * FROM consents WHERE patient_id = ?').all(p.id);
  p.pdocuments = db.prepare('SELECT * FROM patient_documents WHERE patient_id = ? ORDER BY id DESC').all(p.id);
  p.appointments = db.prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY start_at DESC').all(p.id);
  p.visits = db.prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC').all(p.id);
  p.visits = p.visits.map(v => ({ ...v,
    exams: db.prepare('SELECT * FROM visit_exams WHERE visit_id = ? ORDER BY id').all(v.id),
    procedures: db.prepare('SELECT * FROM visit_procedures WHERE visit_id = ? ORDER BY id').all(v.id),
    homecare: db.prepare('SELECT * FROM homecare WHERE visit_id = ?').all(v.id),
    photos: db.prepare('SELECT id, file_path, taken_at, notes FROM images WHERE visit_id = ? ORDER BY taken_at').all(v.id)
  }));
  p.referrals = db.prepare('SELECT * FROM referrals WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  p.claims = db.prepare('SELECT * FROM claims WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  p.plans = db.prepare('SELECT * FROM treatment_plans WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  p.plans = p.plans.map(pl => ({ ...pl,
    payments: db.prepare('SELECT * FROM payments WHERE plan_id = ? ORDER BY paid_at DESC, id DESC').all(pl.id).map(pay => ({ ...pay, sessions: paysessArr(pay) })),
    paid_total: (db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE plan_id = ?').get(pl.id) || {}).s || 0
  }));
  p.ai_reports = db.prepare('SELECT id, kind, created_at FROM ai_reports WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  // REAL next return: only confirmed + future, earliest first (was appointments[0] — bug, could be cancelled/past)
  p.next_return = db.prepare(`SELECT start_at FROM appointments WHERE patient_id = ? AND start_at > datetime('now') AND status = 'confirmed' ORDER BY start_at ASC LIMIT 1`).get(p.id)?.start_at || null;
  // REAL last visit: from the visits table (was derived from photos/timeline)
  p.last_visit = p.visits[0]?.visit_date || null;
  res.json(p);
});

// Full image row incl. heavy base64 (ai_overlay / align_*) — lazy endpoint for the
// before/after compare view. Only called when the user actually opens it.
app.get('/api/patients/:id/images/:imageId/full', (req, res) => {
  const row = db.prepare('SELECT * FROM images WHERE id = ? AND patient_id = ?').get(req.params.imageId, req.params.id);
  if (!row) return res.status(404).json({ error: 'Image not found' });
  res.json(row);
});

// ── Visits lifecycle ──
// 1) confirmed appointments in the past auto-record a `visits` row when the
//    patient has clinical activity (photo/measurement/exam/voice note) on that
//    day; 2) past confirmed appts with NO activity and older than 1 day become
//    `no_show` (same-day grace so today's appts aren't flagged); 3) patient
//    status is recomputed from data, not static seed.
function nextVisitNumber(pid) {
  return (db.prepare('SELECT COALESCE(MAX(visit_number),0) n FROM visits WHERE patient_id=?').get(pid).n) + 1;
}
function reconcileVisits(patientId) {
  const pastAppts = db.prepare(`SELECT * FROM appointments WHERE patient_id = ? AND status = 'confirmed' AND start_at <= datetime('now')`).all(patientId);
  for (const a of pastAppts) {
    const apptDate = String(a.start_at || '').slice(0, 10);
    const hasVisit = db.prepare(`SELECT 1 FROM visits WHERE patient_id=? AND date(visit_date)=? LIMIT 1`).get(patientId, apptDate);
    if (hasVisit) continue;
    const act = db.prepare(`
      SELECT (SELECT COUNT(*) FROM images WHERE patient_id=? AND date(taken_at)=?) +
             (SELECT COUNT(*) FROM measurements WHERE patient_id=? AND date(measured_at)=?) +
             (SELECT COUNT(*) FROM exams WHERE patient_id=? AND date(created_at)=?) +
             (SELECT COUNT(*) FROM voice_notes WHERE patient_id=? AND date(created_at)=?) AS n`).get(
      patientId, apptDate, patientId, apptDate, patientId, apptDate, patientId, apptDate);
    if (act.n > 0) {
      const r = db.prepare(`INSERT INTO visits (patient_id, visit_number, visit_date, notes) VALUES (?,?,?,?)`)
        .run(patientId, nextVisitNumber(patientId), `${apptDate} 00:00:00`, 'Registro automático (atividade clínica no dia do retorno)');
      linkVisitPhotos(patientId, apptDate, r.lastInsertRowid);
      db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
        .run(patientId, 'followup', 'Consulta registrada', `Retorno de ${apptDate} confirmado por atividade clínica`);
    } else {
      const missedFor = Date.now() - new Date(a.start_at).getTime();
      if (missedFor > 86400000) { // >1 day past → genuine no-show
        db.prepare(`UPDATE appointments SET status='no_show' WHERE id=?`).run(a.id);
      }
    }
  }
  recomputePatientStatus(patientId);
}
function recomputePatientStatus(patientId) {
  const hasFuture = db.prepare(`SELECT 1 FROM appointments WHERE patient_id=? AND start_at > datetime('now') AND status='confirmed' LIMIT 1`).get(patientId);
  const hasNoShow = db.prepare(`SELECT 1 FROM appointments WHERE patient_id=? AND status='no_show' LIMIT 1`).get(patientId);
  let status = 'active';
  if (!hasFuture) status = hasNoShow ? 'overdue' : 'follow_up_due';
  else if (hasNoShow) status = 'overdue';
  db.prepare(`UPDATE patients SET status=? WHERE id=?`).run(status, patientId);
  return status;
}
app.post('/api/patients/:id/visits', (req, res) => {
  const b = req.body || {};
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const visitDate = b.visit_date || new Date().toISOString();
  const r = db.prepare(`INSERT INTO visits (patient_id, visit_number, visit_date, complaint, treatment, notes,
    pain_score, systolic_bp, diastolic_bp, heart_rate, temperature, spo2, glycemia,
    dme_dispensed, dme_value, dme_currency, next_step_booked, next_step_reason)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(p.id, nextVisitNumber(p.id), visitDate, b.complaint || null, b.treatment || null, b.notes || null,
      b.pain_score ?? null, b.systolic_bp ?? null, b.diastolic_bp ?? null, b.heart_rate ?? null,
      b.temperature ?? null, b.spo2 ?? null, b.glycemia ?? null,
      b.dme_dispensed || null, b.dme_value ?? null, (b.dme_currency || 'BRL'), b.next_step_booked ? 1 : 0, b.next_step_reason || null);
  const vid = r.lastInsertRowid;
  // structured exams (diabetic foot: monofilament, tuning fork, pulses, doppler, temp diff, risk class)
  (b.exams || []).forEach(ex => {
    db.prepare(`INSERT INTO visit_exams (visit_id, exam_type, result, notes) VALUES (?,?,?,?)`)
      .run(vid, ex.exam_type, ex.result || null, ex.notes || null);
  });
  // structured procedures per session (modality, equipment, parameters, duration, reaction, skin before/after)
  (b.procedures || []).forEach(pr => {
    db.prepare(`INSERT INTO visit_procedures (visit_id, modality, equipment, parameters, duration_sec, reaction, skin_before, skin_after, notes) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(vid, pr.modality, pr.equipment || null, pr.parameters || null, pr.duration_sec ?? null,
        pr.reaction || null, pr.skin_before || null, pr.skin_after || null, pr.notes || null);
  });
  // Tier 3: link photos taken on the visit date to this visit + home-care checklist
  linkVisitPhotos(p.id, String(visitDate).slice(0, 10), vid);
  saveHomecare(p.id, vid, b.homecare);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(p.id, 'followup', 'Consulta registrada', b.complaint ? `Queixa: ${b.complaint}` : (b.notes || null));
  recomputePatientStatus(p.id);
  res.json({ id: vid });
});
// Tier 3 helpers: link a visit's date-matched photos (images.visit_id) + upsert home-care
function linkVisitPhotos(patientId, dateStr, vid) {
  if (!dateStr || !vid) return;
  db.prepare(`UPDATE images SET visit_id = ? WHERE patient_id = ? AND date(taken_at) = ?`).run(vid, patientId, dateStr);
}
function saveHomecare(patientId, vid, hc) {
  if (!hc) return;
  db.prepare('DELETE FROM homecare WHERE visit_id = ?').run(vid);
  if (hc.product || hc.frequency || hc.instructions || hc.alert_signs)
    db.prepare(`INSERT INTO homecare (patient_id, visit_id, product, frequency, instructions, alert_signs) VALUES (?,?,?,?,?,?)`)
      .run(patientId, vid, hc.product || null, hc.frequency || null, hc.instructions || null, hc.alert_signs || null);
}

// Edit a visit (v35). Exams/procedures are replaced wholesale (delete + re-insert).
// `val(k, def)` = incoming when the key is PRESENT (even null → clears), else current.
app.put('/api/patients/:id/visits/:visitId', (req, res) => {
  const b = req.body || {};
  const vid = Number(req.params.visitId);
  const v = db.prepare('SELECT * FROM visits WHERE id = ? AND patient_id = ?').get(vid, Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'Visit not found' });
  const val = (k, def) => (b[k] === undefined ? def : b[k]);
  db.prepare(`UPDATE visits SET visit_date=?, complaint=?, treatment=?, notes=?,
      pain_score=?, systolic_bp=?, diastolic_bp=?, heart_rate=?, temperature=?, spo2=?, glycemia=?,
      dme_dispensed=?, dme_value=?, dme_currency=?, next_step_booked=?, next_step_reason=?
    WHERE id=?`).run(
    val('visit_date', v.visit_date), val('complaint', v.complaint), val('treatment', v.treatment), val('notes', v.notes),
    val('pain_score', v.pain_score), val('systolic_bp', v.systolic_bp), val('diastolic_bp', v.diastolic_bp),
    val('heart_rate', v.heart_rate), val('temperature', v.temperature), val('spo2', v.spo2), val('glycemia', v.glycemia),
    val('dme_dispensed', v.dme_dispensed), val('dme_value', v.dme_value), val('dme_currency', v.dme_currency || 'BRL'),
    b.next_step_booked !== undefined ? (b.next_step_booked ? 1 : 0) : v.next_step_booked,
    val('next_step_reason', v.next_step_reason), vid);
  db.prepare('DELETE FROM visit_exams WHERE visit_id = ?').run(vid);
  db.prepare('DELETE FROM visit_procedures WHERE visit_id = ?').run(vid);
  (b.exams || []).forEach(ex => {
    db.prepare(`INSERT INTO visit_exams (visit_id, exam_type, result, notes) VALUES (?,?,?,?)`)
      .run(vid, ex.exam_type, ex.result || null, ex.notes || null);
  });
  (b.procedures || []).forEach(pr => {
    db.prepare(`INSERT INTO visit_procedures (visit_id, modality, equipment, parameters, duration_sec, reaction, skin_before, skin_after, notes) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(vid, pr.modality, pr.equipment || null, pr.parameters || null, pr.duration_sec ?? null,
        pr.reaction || null, pr.skin_before || null, pr.skin_after || null, pr.notes || null);
  });
  linkVisitPhotos(v.patient_id, String(val('visit_date', v.visit_date)).slice(0, 10), vid);
  saveHomecare(v.patient_id, vid, b.homecare);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(v.patient_id, 'followup', 'Consulta atualizada', b.complaint ? `Queixa: ${b.complaint}` : (b.notes || null));
  recomputePatientStatus(v.patient_id);
  res.json({ ok: true, id: vid });
});

// ── Tier 2: treatment plans ──
app.post('/api/patients/:id/plans', (req, res) => {
  const b = req.body || {};
  const pid = Number(req.params.id);
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(pid);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const r = db.prepare(`INSERT INTO treatment_plans (patient_id, name, total_sessions, done_sessions, price, currency, start_date, notes, status)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    pid, b.name || 'Plano de tratamento', b.total_sessions ?? 0, b.done_sessions ?? 0,
    b.price ?? 0, b.currency || 'BRL', b.start_date || null, b.notes || null, b.status || 'active');
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(pid, 'treatment', 'Plano criado', `${b.name || 'Plano de tratamento'} — ${b.total_sessions ?? 0} sessões · R$ ${Number(b.price ?? 0).toFixed(2)}`);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/plans/:id', (req, res) => {
  const b = req.body || {};
  const pl = db.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Plan not found' });
  const val = (k, def) => (b[k] === undefined ? def : b[k]);
  db.prepare(`UPDATE treatment_plans SET name=?, total_sessions=?, done_sessions=?, price=?, currency=?, start_date=?, notes=?, status=? WHERE id=?`).run(
    val('name', pl.name), val('total_sessions', pl.total_sessions), val('done_sessions', pl.done_sessions),
    val('price', pl.price), val('currency', pl.currency), val('start_date', pl.start_date),
    val('notes', pl.notes), val('status', pl.status), pl.id);
  if (b.done_sessions !== undefined && b.done_sessions !== pl.done_sessions)
    db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
      .run(pl.patient_id, 'treatment', 'Sessão concluída', `${pl.name} — sessão ${b.done_sessions}/${val('total_sessions', pl.total_sessions)}`);
  else
    db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
      .run(pl.patient_id, 'treatment', 'Plano atualizado', pl.name);
  res.json({ ok: true, id: pl.id });
});
app.delete('/api/plans/:id', (req, res) => {
  const pl = db.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(req.params.id);
  if (!pl) return res.status(404).json({ error: 'Plan not found' });
  db.prepare('DELETE FROM payments WHERE plan_id = ?').run(pl.id);
  db.prepare('DELETE FROM treatment_plans WHERE id = ?').run(pl.id);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(pl.patient_id, 'treatment', 'Plano removido', pl.name);
  res.json({ ok: true });
});

// ── Tier 2: payments ──
// Parse stored payment session coverage ("[1,2]" or null) → sorted number array
const paysessArr = pay => {
  try {
    const a = JSON.parse((pay && pay.sessions) || '[]');
    return Array.isArray(a) ? a.map(Number).filter(n => Number.isFinite(n) && n > 0).sort((x, y) => x - y) : [];
  } catch (e) { return []; }
};
// "sessão 3" / "sessões 3–5" (PT timeline detail; UI localizes its own copy)
const paysessTxt = arr => {
  const a = Array.isArray(arr) ? arr.map(Number).filter(n => Number.isFinite(n) && n > 0).sort((x, y) => x - y) : [];
  if (!a.length) return '';
  const runs = [];
  let s = a[0], p = a[0];
  for (let i = 1; i <= a.length; i++) {
    if (i === a.length || a[i] !== p + 1) { runs.push(s === p ? String(s) : `${s}–${p}`); s = a[i]; }
    p = a[i];
  }
  return (a.length > 1 ? 'sessões ' : 'sessão ') + runs.join(', ');
};
const paysessJson = arr => Array.isArray(arr) ? JSON.stringify(arr.map(Number).filter(n => Number.isFinite(n) && n > 0)) : null;
app.post('/api/patients/:id/payments', (req, res) => {
  const b = req.body || {};
  const pid = Number(req.params.id);
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(pid);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const r = db.prepare(`INSERT INTO payments (patient_id, plan_id, amount, currency, method, paid_at, notes, sessions)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    pid, b.plan_id ?? null, b.amount ?? 0, b.currency || 'BRL', b.method || null,
    b.paid_at || new Date().toISOString(), b.notes || null, paysessJson(b.sessions));
  const pl = b.plan_id ? db.prepare('SELECT * FROM treatment_plans WHERE id = ?').get(b.plan_id) : null;
  const sessTxt = paysessTxt(b.sessions);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(pid, 'treatment', 'Pagamento registrado', `${pl ? pl.name + ' — ' : ''}R$ ${Number(b.amount ?? 0).toFixed(2)} (${b.method || '—'})${sessTxt ? ' · ' + sessTxt : ''}`);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/payments/:id', (req, res) => {
  const b = req.body || {};
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!pay) return res.status(404).json({ error: 'Payment not found' });
  const val = (k, def) => (b[k] === undefined ? def : b[k]);
  const sess = b.sessions === undefined ? (pay.sessions || null) : paysessJson(b.sessions);
  db.prepare(`UPDATE payments SET plan_id=?, amount=?, currency=?, method=?, paid_at=?, notes=?, sessions=? WHERE id=?`).run(
    val('plan_id', pay.plan_id), val('amount', pay.amount), val('currency', pay.currency),
    val('method', pay.method), val('paid_at', pay.paid_at), val('notes', pay.notes), sess, pay.id);
  res.json({ ok: true, id: pay.id });
});
app.delete('/api/payments/:id', (req, res) => {
  const pay = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!pay) return res.status(404).json({ error: 'Payment not found' });
  db.prepare('DELETE FROM payments WHERE id = ?').run(pay.id);
  res.json({ ok: true });
});

// ── Tier 2: consents ──
app.post('/api/patients/:id/consents', (req, res) => {
  const b = req.body || {};
  const pid = Number(req.params.id);
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(pid);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const r = db.prepare(`INSERT INTO consents (patient_id, type, version, signed_at, signature, professional, content)
    VALUES (?,?,?,?,?,?,?)`).run(
    pid, b.type || 'treatment', b.version || '1.0', b.signed_at || new Date().toISOString(),
    b.signature || null, b.professional || null, b.content || null);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(pid, 'consent', 'Consentimento assinado: ' + (b.type || 'treatment'), `${b.professional || ''}${b.signature ? ' — ' + (b.signature.startsWith('data:') ? 'assinatura digital' : b.signature) : ''}`);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/consents/:id', (req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM consents WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Consent not found' });
  const val = (k, def) => (b[k] === undefined ? def : b[k]);
  db.prepare(`UPDATE consents SET type=?, version=?, signed_at=?, signature=?, professional=?, content=? WHERE id=?`).run(
    val('type', c.type), val('version', c.version), val('signed_at', c.signed_at),
    val('signature', c.signature), val('professional', c.professional), val('content', c.content), c.id);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(c.patient_id, 'consent', 'Consentimento atualizado', `${val('type', c.type)} v${val('version', c.version)}`);
  res.json({ ok: true, id: c.id });
});
app.delete('/api/consents/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM consents WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Consent not found' });
  db.prepare('DELETE FROM consents WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

// ── Tier 2: referrals ──
app.post('/api/patients/:id/referrals', (req, res) => {
  const b = req.body || {};
  const pid = Number(req.params.id);
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(pid);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const r = db.prepare(`INSERT INTO referrals (patient_id, direction, partner_name, specialty, clinic, phone, email, location, website, source, reason, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    pid, b.direction || 'outgoing', b.partner_name || null, b.specialty || null, b.clinic || null,
    b.phone || null, b.email || null, b.location || null, b.website || null,
    b.source || 'professional', b.reason || null, b.status || 'open', b.notes || null);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(pid, 'referral', 'Encaminhamento registrado', `${b.partner_name || ''} ${b.specialty ? '· ' + b.specialty : ''} ${b.reason ? '— ' + b.reason : ''}`);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/referrals/:id', (req, res) => {
  const b = req.body || {};
  const rf = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
  if (!rf) return res.status(404).json({ error: 'Referral not found' });
  const val = (k, def) => (b[k] === undefined ? def : b[k]);
  db.prepare(`UPDATE referrals SET direction=?, partner_name=?, specialty=?, clinic=?, phone=?, email=?, location=?, website=?, source=?, reason=?, status=?, notes=? WHERE id=?`).run(
    val('direction', rf.direction), val('partner_name', rf.partner_name), val('specialty', rf.specialty),
    val('clinic', rf.clinic), val('phone', rf.phone), val('email', rf.email), val('location', rf.location),
    val('website', rf.website), val('source', rf.source), val('reason', rf.reason),
    val('status', rf.status), val('notes', rf.notes), rf.id);
  res.json({ ok: true, id: rf.id });
});
app.delete('/api/referrals/:id', (req, res) => {
  const rf = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
  if (!rf) return res.status(404).json({ error: 'Referral not found' });
  db.prepare('DELETE FROM referrals WHERE id = ?').run(rf.id);
  res.json({ ok: true });
});

// ── Tier 3: home-care checklist (per visit) ──
app.post('/api/patients/:id/homecare', (req, res) => {
  const b = req.body || {};
  const pid = Number(req.params.id);
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(pid);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const r = db.prepare(`INSERT INTO homecare (patient_id, visit_id, product, frequency, instructions, alert_signs)
    VALUES (?,?,?,?,?,?)`).run(
    pid, b.visit_id ?? null, b.product || null, b.frequency || null,
    b.instructions || null, b.alert_signs || null);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(pid, 'treatment', 'Orientações de cuidados em casa', `${b.product || ''} ${b.frequency ? '· ' + b.frequency : ''}`);
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/homecare/:id', (req, res) => {
  const b = req.body || {};
  const hc = db.prepare('SELECT * FROM homecare WHERE id = ?').get(req.params.id);
  if (!hc) return res.status(404).json({ error: 'Homecare not found' });
  const val = (k, def) => (b[k] === undefined ? def : b[k]);
  db.prepare(`UPDATE homecare SET visit_id=?, product=?, frequency=?, instructions=?, alert_signs=? WHERE id=?`).run(
    val('visit_id', hc.visit_id), val('product', hc.product), val('frequency', hc.frequency),
    val('instructions', hc.instructions), val('alert_signs', hc.alert_signs), hc.id);
  res.json({ ok: true, id: hc.id });
});
app.delete('/api/homecare/:id', (req, res) => {
  const hc = db.prepare('SELECT * FROM homecare WHERE id = ?').get(req.params.id);
  if (!hc) return res.status(404).json({ error: 'Homecare not found' });
  db.prepare('DELETE FROM homecare WHERE id = ?').run(hc.id);
  res.json({ ok: true });
});

app.post('/api/patients', (req, res) => {
  const b = req.body || {};
  if (!b.full_name) return res.status(400).json({ error: 'full_name required' });
  const r = db.prepare(`INSERT INTO patients (full_name, birth_date, sex, cpf, phone, email, address, emergency_contact,
    medical_history, allergies, medications, relevant_conditions, previous_foot_problems, previous_treatment, surgical_history, clinical_notes, ${AN_FIELDS.join(', ')}, owner_id,
    referral_source, is_diabetic, risk_level, visibility)
    VALUES (${Array(21 + AN_FIELDS.length).fill('?').join(',')})`).run(
    b.full_name, b.birth_date || null, b.sex || null, b.cpf || null, b.phone || null, b.email || null, b.address || null, b.emergency_contact || null,
    b.medical_history || null, b.allergies || null, b.medications || null, b.relevant_conditions || null,
    b.previous_foot_problems || null, b.previous_treatment || null, b.surgical_history || null, b.clinical_notes || null,
    ...AN_FIELDS.map(f => b[f] || null),
    req.user ? req.user.id : null,
    b.referral_source || null, b.is_diabetic ? 1 : 0, b.risk_level || null, b.visibility || 'private');
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(r.lastInsertRowid, 'intake', 'Paciente cadastrado', 'Registro inicial criado');
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/patients/:id', (req, res) => {
  const b = req.body || {};
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  db.prepare(`UPDATE patients SET full_name=?, birth_date=?, sex=?, cpf=?, phone=?, email=?, address=?, emergency_contact=?,
    medical_history=?, allergies=?, medications=?, relevant_conditions=?, previous_foot_problems=?, previous_treatment=?,
    surgical_history=?, clinical_notes=?, ${AN_FIELDS.map(f => f + '=?').join(', ')}, status=?, referral_source=?, is_diabetic=?, risk_level=?, visibility=?, updated_at=datetime('now') WHERE id=?`).run(
    b.full_name ?? p.full_name, b.birth_date ?? p.birth_date, b.sex ?? p.sex, b.cpf ?? p.cpf, b.phone ?? p.phone, b.email ?? p.email,
    b.address ?? p.address, b.emergency_contact ?? p.emergency_contact, b.medical_history ?? p.medical_history,
    b.allergies ?? p.allergies, b.medications ?? p.medications, b.relevant_conditions ?? p.relevant_conditions,
    b.previous_foot_problems ?? p.previous_foot_problems, b.previous_treatment ?? p.previous_treatment,
    b.surgical_history ?? p.surgical_history, b.clinical_notes ?? p.clinical_notes,
    ...AN_FIELDS.map(f => b[f] ?? p[f]),
    b.status ?? p.status,
    b.referral_source ?? p.referral_source, b.is_diabetic !== undefined ? (b.is_diabetic ? 1 : 0) : p.is_diabetic,
    b.risk_level ?? p.risk_level, b.visibility ?? p.visibility, p.id);
  res.json({ ok: true });
});

// ── Digital consent documents (2026-08-24) ──
// Doctor sends one or more treatment consent templates (or the anamnesis intake)
// → a public signing session is created → patient signs on /sign/:token →
// signature + content hash stored, PDF generated on demand via wkhtmltopdf.
const pdocFill = (tpl, p, opts) => String(tpl || '').replace(/\{\{(\w+)\}\}/g, (m, k) => {
  const v = { patient_name: p.full_name, birth_date: p.birth_date || '', cpf: p.cpf || '',
    phone: p.phone || '', city: opts.city || '', date: opts.date || '', treatment: opts.treatment || '',
    professional: opts.professional || '', guardian_name: opts.guardian_name || '' }[k];
  return v != null ? v : '';
});
const renderDocBody = (doc, p, lang, opts) => {
  const L = lang === 'en' ? 'en' : lang === 'es' ? 'es' : 'pt';
  return doc.sections.map(s => {
    const h = s.h ? `<h4>${esc(pdocFill(s.h[L], p, opts))}</h4>` : '';
    return `<div class="doc-sec">${h}<p>${esc(pdocFill(s.body[L], p, opts))}</p></div>`;
  }).join('');
};
// Anamnesis Q&A labels for the intake document (pt / es / en)
const AN_Q = {
  assessment: ['Avaliação', 'Evaluación', 'Assessment'],
  shoe_type: ['Tipo de calçado mais utilizado', 'Tipo de calzado más utilizado', 'Most used footwear type'],
  shoe_size: ['Nº do calçado', 'Nº de calzado', 'Shoe size'],
  sock_type: ['Tipo de meia usada', 'Tipo de media usada', 'Sock type'],
  sports: ['Pratica esportes?', '¿Practica deportes?', 'Plays sports?'],
  pregnant: ['Gestante?', '¿Embarazada?', 'Pregnant?'],
  hypertension: ['Tem hipo/hipertensão arterial?', '¿Tiene hipo/hipertensión arterial?', 'Has hypo/hypertension?'],
  cancer: ['Algum tipo de câncer?', '¿Algún tipo de cáncer?', 'Any type of cancer?'],
  pacemaker: ['Portador de marcapasso/pinos?', '¿Portador de marcapasos/clavos?', 'Has pacemaker/pins?'],
  blood_pressure: ['Pressão arterial', 'Presión arterial', 'Blood pressure'],
  oxygenation: ['Oxigenação', 'Oxigenación', 'Oxygenation'],
  temperature: ['Temperatura', 'Temperatura', 'Temperature'],
  pain_sensitivity: ['Sensibilidade a dor?', '¿Sensibilidad al dolor?', 'Pain sensitivity?'],
  lower_limb_surgery: ['Cirurgia nos membros inferiores?', '¿Cirugía en miembros inferiores?', 'Lower limb surgery?'],
  leprosy: ['Hanseníase?', '¿Lepra (hanseniasis)?', 'Leprosy (hanseniasis)?'],
  circulatory_disorder: ['Distúrbio circulatório?', '¿Trastorno circulatorio?', 'Circulatory disorder?'],
  heart_disease: ['Cardiopatia?', '¿Cardiopatía?', 'Heart disease?'],
  hepatitis: ['Hepatite?', '¿Hepatitis?', 'Hepatitis?']
};
const AN_DETAIL = { sports: 'sports_detail', pregnant: 'pregnant_weeks', pain_sensitivity: 'pain_detail', lower_limb_surgery: 'surgery_detail' };
const anQaRow = (p, key, L) => {
  const label = AN_Q[key][L];
  let val = p[key] == null || p[key] === '' ? '—' : (p[key] === 'sim' ? ['Sim', 'Sí', 'Yes'][L] : p[key] === 'nao' ? ['Não', 'No', 'No'][L] : p[key]);
  const detailKey = AN_DETAIL[key];
  if (detailKey && p[detailKey]) val += ` — ${p[detailKey]}`;
  return `<tr><td>${esc(label)}</td><td>${esc(val)}</td></tr>`;
};
function buildIntakeContent(p) {
  const L = [0, 1, 2].map(i => {
    const rows = AN_FIELDS.filter(f => AN_Q[f]).map(f => anQaRow(p, f, i)).join('');
    const med = p.medications ? `<tr><td>${['Medicações em uso', 'Medicamentos en uso', 'Medications in use'][i]}</td><td>${esc(p.medications)}</td></tr>` : '';
    const alg = p.allergies ? `<tr><td>${['Alergias', 'Alergias', 'Allergies'][i]}</td><td>${esc(p.allergies)}</td></tr>` : '';
    const dia = p.is_diabetic ? `<tr><td>${['Diabetes?', '¿Diabetes?', 'Diabetes?'][i]}</td><td>${['Sim', 'Sí', 'Yes'][i]}</td></tr>` : '';
    const decl = ['As declarações acima são verdadeiras, não cabendo ao profissional a responsabilidade por informações omitidas nesta avaliação. Estou ciente e de acordo com os procedimentos envolvidos.',
      'Las declaraciones anteriores son verdaderas, no correspondiendo al profesional la responsabilidad por información omitida en esta evaluación. Estoy consciente y de acuerdo con los procedimientos involucrados.',
      'The statements above are true, and the professional is not responsible for information omitted in this assessment. I am aware of and agree with the procedures involved.'][i];
    return `<div class="doc-sec"><h4>${['DADOS DO PACIENTE', 'DATOS DEL PACIENTE', 'PATIENT DATA'][i]}</h4>
      <table class="qa"><tr><td>${['Nome', 'Nombre', 'Name'][i]}</td><td>${esc(p.full_name)}</td></tr>
      <tr><td>${['Nascimento', 'Fecha de nacimiento', 'Date of birth'][i]}</td><td>${esc(p.birth_date || '—')}</td></tr>
      <tr><td>CPF</td><td>${esc(p.cpf || '—')}</td></tr></table></div>
      <div class="doc-sec"><h4>${['AVALIAÇÃO / ANAMNESE', 'EVALUACIÓN / ANAMNESIS', 'ASSESSMENT / ANAMNESIS'][i]}</h4>
      <table class="qa">${rows}${dia}${med}${alg}</table></div>
      <div class="doc-sec"><p>${decl}</p></div>`;
  });
  return { pt: L[0], es: L[1], en: L[2] };
}

// Template list for the doctor UI
app.get('/api/documents', (req, res) => {
  res.json(DOCS.map(d => ({ key: d.key, signer: d.signer, title: d.title })));
});

// Documents sent to a patient (with signing token per session for link copy)
app.get('/api/patients/:id/documents', (req, res) => {
  const p = db.prepare('SELECT id FROM patients WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  res.json(db.prepare(`SELECT pd.id, pd.doc_key, pd.title_pt, pd.title_es, pd.title_en, pd.status, pd.signer_name, pd.signed_at, pd.created_at, pd.session_id, ss.token
    FROM patient_documents pd LEFT JOIN signing_sessions ss ON ss.id = pd.session_id
    WHERE pd.patient_id = ? ORDER BY pd.id DESC`).all(p.id));
});

// Send documents for signature → creates a public signing session
app.post('/api/patients/:id/documents', (req, res) => {
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const slugs = Array.isArray(req.body.slugs) ? req.body.slugs : [];
  if (!slugs.length) return res.status(400).json({ error: 'No documents selected' });
  const token = crypto.randomBytes(24).toString('hex');
  const ss = db.prepare('INSERT INTO signing_sessions (token, patient_id) VALUES (?,?)').run(token, p.id);
  const opts = {
    treatment: String(req.body.treatment || '').trim(),
    professional: req.user ? (req.user.full_name || '') : '',
    date: new Date().toISOString().slice(0, 10)
  };
  const ins = db.prepare(`INSERT INTO patient_documents (patient_id, session_id, doc_key, title_pt, title_es, title_en, content_pt, content_es, content_en) VALUES (?,?,?,?,?,?,?,?,?)`);
  const created = [];
  for (const slug of slugs) {
    if (slug === 'intake') {
      const c = buildIntakeContent(p);
      ins.run(p.id, ss.lastInsertRowid, 'intake', 'Ficha de Anamnese', 'Ficha de Anamnesis', 'Intake Form', c.pt, c.es, c.en);
    } else {
      const d = DOC_MAP[slug];
      if (!d) continue;
      ins.run(p.id, ss.lastInsertRowid, slug, d.title.pt, d.title.es, d.title.en,
        renderDocBody(d, p, 'pt', opts), renderDocBody(d, p, 'es', opts), renderDocBody(d, p, 'en', opts));
    }
    created.push(slug);
  }
  if (!created.length) { db.prepare('DELETE FROM signing_sessions WHERE id = ?').run(ss.lastInsertRowid); return res.status(400).json({ error: 'No valid documents' }); }
  const link = `${req.protocol}://${req.get('host')}/sign/${token}`;
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(p.id, 'consent', 'Documentos enviados para assinatura', `${created.length} documento(s) · ${opts.treatment || '—'}`);
  res.json({ ok: true, session_id: ss.lastInsertRowid, token, link, count: created.length });
});

// Preview documents before sending — renders exactly what the patient will see,
// WITHOUT creating a signing session or persisting anything. Accepts an inline
// `patient` object for the new-patient flow (pre-save), otherwise loads by id.
app.post('/api/patients/:id/documents/preview', (req, res) => {
  let p = (req.body.patient && req.body.patient.full_name) ? req.body.patient : db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const slugs = Array.isArray(req.body.slugs) ? req.body.slugs : [];
  if (!slugs.length) return res.status(400).json({ error: 'No documents selected' });
  const opts = {
    treatment: String(req.body.treatment || '').trim(),
    professional: req.user ? (req.user.full_name || '') : '',
    date: new Date().toISOString().slice(0, 10)
  };
  const docs = [];
  for (const slug of slugs) {
    if (slug === 'intake') {
      const c = buildIntakeContent(p);
      docs.push({ key: 'intake', title_pt: 'Ficha de Anamnese', title_es: 'Ficha de Anamnesis', title_en: 'Intake Form', content_pt: c.pt, content_es: c.es, content_en: c.en });
    } else {
      const d = DOC_MAP[slug];
      if (!d) continue;
      docs.push({ key: slug, title_pt: d.title.pt, title_es: d.title.es, title_en: d.title.en,
        content_pt: renderDocBody(d, p, 'pt', opts), content_es: renderDocBody(d, p, 'es', opts), content_en: renderDocBody(d, p, 'en', opts) });
    }
  }
  if (!docs.length) return res.status(400).json({ error: 'No valid documents' });
  res.json({ ok: true, patient: { full_name: p.full_name || '', birth_date: p.birth_date || '', cpf: p.cpf || '' }, docs });
});

// Void a pending document
app.delete('/api/patient-documents/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM patient_documents WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Document not found' });
  if (d.status === 'signed') return res.status(400).json({ error: 'Signed documents cannot be deleted' });
  db.prepare('DELETE FROM patient_documents WHERE id = ?').run(d.id);
  res.json({ ok: true });
});

// Signed consent PDF (authenticated doctor view)
app.get('/api/patient-documents/:id/pdf', async (req, res) => {
  try {
    const d = db.prepare('SELECT * FROM patient_documents WHERE id = ?').get(req.params.id);
    if (!d) return res.status(404).json({ error: 'Document not found' });
    const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(d.patient_id);
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    const lang = req.query.lang || 'pt';
    const pdf = await renderConsentPdf(p, d, lang);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="consent-${d.id}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('Consent PDF error:', e.message);
    res.status(500).json({ error: 'PDF generation failed: ' + e.message });
  }
});

// ── PUBLIC signing endpoints (authGate exempts /api/pub/*) ──
app.get('/api/pub/sign/:token', (req, res) => {
  const ss = db.prepare('SELECT * FROM signing_sessions WHERE token = ?').get(req.params.token);
  if (!ss) return res.status(404).json({ error: 'Link inválido' });
  const p = db.prepare('SELECT id, full_name, birth_date, cpf, phone, address FROM patients WHERE id = ?').get(ss.patient_id);
  if (!p) return res.status(404).json({ error: 'Paciente não encontrado' });
  const docs = db.prepare('SELECT id, doc_key, title_pt, title_es, title_en, content_pt, content_es, content_en, status FROM patient_documents WHERE session_id = ? AND patient_id = ? ORDER BY id').all(ss.id, p.id);
  res.json({ patient: p, docs, session: { created_at: ss.created_at } });
});

app.post('/api/pub/sign/:token', (req, res) => {
  const ss = db.prepare('SELECT * FROM signing_sessions WHERE token = ?').get(req.params.token);
  if (!ss) return res.status(404).json({ error: 'Link inválido' });
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(ss.patient_id);
  if (!p) return res.status(404).json({ error: 'Paciente não encontrado' });
  const body = req.body || {};
  const items = Array.isArray(body.docs) ? body.docs : [];
  if (!items.length) return res.status(400).json({ error: 'Nenhum documento para assinar' });
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = new Date().toISOString();
  const upd = db.prepare(`UPDATE patient_documents SET status='signed', signature=?, signer_name=?, signer_cpf=?, signer_role=?, signed_at=?, ip=?, content_hash=? WHERE id=? AND patient_id=? AND status='pending'`);
  const signed = [];
  for (const it of items) {
    let d = db.prepare('SELECT * FROM patient_documents WHERE id = ? AND patient_id = ? AND status = \'pending\'').get(Number(it.id), p.id);
    if (!d) continue;
    const sig = String(it.signature || '').trim();
    if (!sig || !sig.startsWith('data:image/png')) continue;
    const signerName = String(it.signer_name || p.full_name || '').trim() || p.full_name;
    const signerCpf = String(it.signer_cpf || '').trim() || p.cpf || '';
    const lang = body.lang === 'es' ? 'es' : body.lang === 'en' ? 'en' : 'pt';
    // Guardian-signed docs (pediatric): fill the guardian name into the snapshot
    if (d.doc_key === 'paroniquia-infantil') {
      const tpl = DOC_MAP['paroniquia-infantil'];
      const opts = { treatment: '', professional: '', date: (d.signed_at || now).slice(0, 10), guardian_name: signerName };
      db.prepare(`UPDATE patient_documents SET content_pt=?, content_es=?, content_en=? WHERE id=?`)
        .run(renderDocBody(tpl, p, 'pt', opts), renderDocBody(tpl, p, 'es', opts), renderDocBody(tpl, p, 'en', opts), d.id);
      d = db.prepare('SELECT * FROM patient_documents WHERE id = ?').get(d.id);
    }
    const content = d['content_' + lang] || d.content_pt;
    const hash = crypto.createHash('sha256').update(content + sig + signerName + signerCpf + now).digest('hex');
    upd.run(sig, signerName, signerCpf, d.doc_key === 'paroniquia-infantil' ? 'guardian' : 'patient', now, ip, hash, d.id, p.id);
    const titlePt = d.title_pt;
    db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
      .run(p.id, 'consent', 'Consentimento assinado: ' + titlePt, 'Assinatura digital · ' + signerName + ' · ' + now.slice(0, 10));
    signed.push({ id: d.id, titlePt });
  }
  if (!signed.length) return res.status(400).json({ error: 'Nenhum documento válido para assinar' });
  res.json({ ok: true, signed, count: signed.length });
});

app.get('/api/pub/sign/:token/pdf/:docId', async (req, res) => {
  try {
    const ss = db.prepare('SELECT * FROM signing_sessions WHERE token = ?').get(req.params.token);
    if (!ss) return res.status(404).json({ error: 'Link inválido' });
    const d = db.prepare('SELECT * FROM patient_documents WHERE id = ? AND session_id = ?').get(req.params.docId, ss.id);
    if (!d || d.status !== 'signed') return res.status(404).json({ error: 'Documento não encontrado' });
    const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(d.patient_id);
    const lang = req.query.lang || 'pt';
    const pdf = await renderConsentPdf(p, d, lang);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="consent-${d.id}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('Consent PDF error:', e.message);
    res.status(500).json({ error: 'PDF generation failed: ' + e.message });
  }
});

// Render a consent/intake document to PDF (wkhtmltopdf, teal Podo360 style)
async function renderConsentPdf(p, d, lang) {
  const { execFile } = require('child_process');
  const L = lang === 'en' ? 'en' : lang === 'es' ? 'es' : 'pt';
  const title = d['title_' + L] || d.title_pt;
  const content = d['content_' + L] || d.content_pt;
  const clinic = ['Centro de Podologia — Documento digital', 'Centro de Podología — Documento digital', 'Podology Center — Digital document'][lang === 'en' ? 2 : lang === 'es' ? 1 : 0];
  const sigBlock = d.status === 'signed' ? `
    <div class="sig-box">
      <div class="sig-img"><img src="${d.signature}" alt="assinatura"></div>
      <div class="sig-name">${esc(d.signer_name || '')}</div>
      <div class="sig-meta">${['CPF', 'CPF', 'CPF'][L === 'en' ? 2 : L === 'es' ? 1 : 0]}: ${esc(d.signer_cpf || '—')}</div>
      <div class="sig-meta">${['Assinado digitalmente em', 'Firmado digitalmente el', 'Digitally signed on'][L === 'en' ? 2 : L === 'es' ? 1 : 0]} ${esc((d.signed_at || '').slice(0, 19).replace('T', ' '))} · IP ${esc(d.ip || '—')}</div>
      <div class="sig-meta">SHA-256: ${esc((d.content_hash || '').slice(0, 24))}…</div>
    </div>` : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; font-size: 10.5pt; }
    .pdf-header { border-bottom: 3px solid #00BFA6; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
    .pdf-header h1 { font-size: 16pt; color: #00BFA6; margin: 0; }
    .pdf-header .sub { font-size: 8.5pt; color: #666; margin-top: 2px; }
    .pdf-header .meta { text-align: right; font-size: 9pt; color: #333; }
    .doc-sec { margin-bottom: 10px; }
    .doc-sec h4 { font-size: 10pt; color: #0d9488; margin: 10px 0 4px; border-left: 3px solid #00BFA6; padding-left: 8px; }
    .doc-sec p { margin: 4px 0; text-align: justify; line-height: 1.45; }
    table.qa { width: 100%; border-collapse: collapse; font-size: 9pt; }
    table.qa td { padding: 3px 6px; border-bottom: 1px solid #e5e7eb; }
    table.qa td:first-child { width: 45%; font-weight: 600; background: #f6fbf9; }
    .sig-box { margin-top: 26px; border: 1px dashed #94a3b8; border-radius: 8px; padding: 14px; text-align: center; background: #fbfefd; }
    .sig-img img { height: 64px; }
    .sig-name { font-weight: 700; font-size: 11pt; margin-top: 4px; }
    .sig-meta { font-size: 8pt; color: #64748b; margin-top: 2px; }
    .pdf-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 7.5pt; color: #999; border-top: 1px solid #ddd; padding-top: 4px; }
  </style></head><body>
    <div class="pdf-header">
      <div><h1>${esc(title)}</h1><div class="sub">${clinic}</div></div>
      <div class="meta">${esc(p.full_name || '')}<br>${esc(new Date().toISOString().slice(0, 10))}</div>
    </div>
    <div class="pdf-content">${content}${sigBlock}</div>
    <div class="pdf-footer">${clinic} · ${esc(new Date().toISOString().slice(0, 10))}</div>
  </body></html>`;
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const ts = Date.now();
  const htmlPath = path.join(tempDir, `cons_${ts}.html`);
  const outPath = path.join(tempDir, `cons_${ts}.pdf`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  try {
    await new Promise((resolve, reject) => {
      execFile('/usr/bin/wkhtmltopdf', ['--encoding', 'utf-8', '--page-size', 'A4', '--margin-top', '8mm', '--margin-bottom', '12mm', '--margin-left', '6mm', '--margin-right', '6mm', '--enable-local-file-access', htmlPath, outPath], (err) => err ? reject(err) : resolve());
    });
    return fs.readFileSync(outPath);
  } finally {
    try { fs.unlinkSync(htmlPath); fs.unlinkSync(outPath); } catch (e) { /* best effort */ }
  }
}

// ── Conditions ──
app.post('/api/conditions', (req, res) => {
  const b = req.body || {};
  if (!b.patient_id || !b.type) return res.status(400).json({ error: 'patient_id and type required' });
  const r = db.prepare(`INSERT INTO conditions (patient_id, type, label, foot, location, severity, status, details)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    b.patient_id, b.type, b.label || null, b.foot || null, b.location || null,
    b.severity || 'moderate', b.status || 'needs_attention', JSON.stringify(b.details || {}));
  const names = { unha_encravada: 'Unha encravada', verruga: 'Verruga', granuloma: 'Granuloma', calosidade: 'Calosidade', fissura: 'Fissura', micose: 'Micose', lesoes: 'Lesão', outro: b.label || 'Outra condição' };
  db.prepare(`INSERT INTO timeline_events (patient_id, condition_id, kind, title, detail) VALUES (?,?,?,?,?)`)
    .run(b.patient_id, r.lastInsertRowid, 'condition', `Condição registrada: ${names[b.type] || b.type}`, b.location ? `Local: ${b.location} (${b.foot || ''})` : null);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/conditions/:id', (req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM conditions WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Condition not found' });
  db.prepare(`UPDATE conditions SET severity=?, status=?, details=?, foot=?, location=?, closed_at=CASE WHEN ?='resolved' THEN datetime('now') ELSE closed_at END, updated_at=datetime('now') WHERE id=?`)
    .run(b.severity ?? c.severity, b.status ?? c.status, JSON.stringify(b.details ?? JSON.parse(c.details || '{}')), b.foot ?? c.foot, b.location ?? c.location, b.status ?? c.status, c.id);
  if (b.status === 'resolved') {
    db.prepare(`INSERT INTO timeline_events (patient_id, condition_id, kind, title, detail) VALUES (?,?,?,?,?)`)
      .run(c.patient_id, c.id, 'treatment', 'Condição resolvida', 'Marcada como resolvida pelo profissional');
  }
  res.json({ ok: true });
});

// ── Foot map ──
app.post('/api/footmap', (req, res) => {
  const b = req.body || {};
  if (!b.patient_id || b.x === undefined || b.y === undefined) return res.status(400).json({ error: 'patient_id, x, y required' });
  const r = db.prepare(`INSERT INTO footmap_points (patient_id, condition_id, view, x, y, status, label, description) VALUES (?,?,?,?,?,?,?,?)`)
    .run(b.patient_id, b.condition_id || null, b.view || 'right_plantar', b.x, b.y, b.status || 0, b.label || null, b.description || null);
  res.json({ id: r.lastInsertRowid });
});

app.patch('/api/footmap/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM footmap_points WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE footmap_points SET status=?, x=?, y=?, label=?, description=? WHERE id=?`)
    .run(b.status !== undefined ? b.status : cur.status, b.x !== undefined ? b.x : cur.x, b.y !== undefined ? b.y : cur.y, b.label !== undefined ? b.label : cur.label, b.description !== undefined ? b.description : cur.description, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/footmap/:id', (req, res) => {
  db.prepare('DELETE FROM footmap_points WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// AI: treatment-course suggestion for a marked foot point (rule-based local algo)
app.post('/api/footmap/suggest', requirePerm('ai'), aiQuota('assessment'), (req, res) => {
  const b = req.body || {};
  const lang = (req.headers['x-lang'] || 'pt') === 'en' ? 'en' : (req.headers['x-lang'] || 'pt') === 'es' ? 'es' : 'pt';
  res.json(ai.footMapSuggestion(String(b.description || ''), b.status, String(b.view || ''), lang));
});

// ── Measurements ──
// Attach recorder names to measurements (vitals history shows who took them).
function decorateMeasurements(list){
  if (!list || !list.length) return list;
  const names = {};
  db.prepare('SELECT id, full_name FROM users').all().forEach(u => names[u.id] = u.full_name);
  return list.map(m => ({ ...m, user_name: m.user_id ? (names[m.user_id] || null) : null }));
}
app.post('/api/measurements', (req, res) => {
  const b = req.body || {};
  if (!b.patient_id || !b.type || b.value === undefined) return res.status(400).json({ error: 'patient_id, type, value required' });
  const src = b.source === 'ai' ? 'ai' : 'manual';
  const notes = b.notes || (src === 'manual' ? 'Manual' : null);
  const uid = (userFromToken(tokenFromReq(req)) || {}).id || null;
  const r = db.prepare(`INSERT INTO measurements (patient_id, condition_id, image_id, type, value, unit, measured_at, notes, source, user_id, vitals_batch)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.patient_id, b.condition_id || null, b.image_id || null, b.type, b.value, b.unit || 'mm', b.measured_at || null, notes, src, uid, b.vitals_batch || null);
  db.prepare(`INSERT INTO timeline_events (patient_id, condition_id, kind, title, detail) VALUES (?,?,?,?,?)`)
    .run(b.patient_id, b.condition_id || null, 'measurement', `Medição registrada (${b.type})`, `${b.value} ${b.unit || ''}`);
  // Vitals visit marker: one timeline event per batch, deduped by batch id.
  if (b.vitals_batch) {
    const uname = (userFromToken(tokenFromReq(req)) || {}).full_name || '';
    db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail, data)
      SELECT ?, 'vitals', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM timeline_events WHERE kind = 'vitals' AND data = ?)`)
      .run(b.patient_id, 'Sinais vitais registrados', uname, b.vitals_batch, b.vitals_batch);
  }
  res.json({ id: r.lastInsertRowid });
});

// Edit a measurement (v34). Any edit flips source → 'manual': the user is
// overriding the AI's own measurement, so it must be noted as manual.
app.put('/api/measurements/:id', (req, res) => {
  const b = req.body || {};
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM measurements WHERE id = ?').get(id);
  if (!cur) return res.status(404).json({ error: 'measurement not found' });
  const type = b.type || cur.type;
  const value = b.value !== undefined ? Number(b.value) : cur.value;
  const unit = b.unit || cur.unit || 'mm';
  const measured_at = b.measured_at || cur.measured_at;
  const notes = 'Manual';
  db.prepare(`UPDATE measurements SET type=?, value=?, unit=?, measured_at=?, notes=?, source='manual' WHERE id=?`)
    .run(type, value, unit, measured_at, notes, id);
  db.prepare(`INSERT INTO timeline_events (patient_id, condition_id, kind, title, detail) VALUES (?,?,?,?,?)`)
    .run(cur.patient_id, cur.condition_id, 'measurement', `Medição atualizada (${type})`, `${value} ${unit}`);
  res.json({ ok: true, id });
});

// ── Timeline ──
app.post('/api/timeline', (req, res) => {
  const b = req.body || {};
  if (!b.patient_id || !b.title) return res.status(400).json({ error: 'patient_id and title required' });
  const r = db.prepare(`INSERT INTO timeline_events (patient_id, condition_id, kind, title, detail, event_date) VALUES (?,?,?,?,?,?)`)
    .run(b.patient_id, b.condition_id || null, b.kind || 'treatment', b.title, b.detail || null, b.event_date || null);
  res.json({ id: r.lastInsertRowid });
});

// ── Exams ──
app.post('/api/exams', (req, res) => {
  const b = req.body || {};
  if (!b.patient_id) return res.status(400).json({ error: 'patient_id required' });
  const r = db.prepare(`INSERT INTO exams (patient_id, condition_id, type, title, exam_date, description, ai_extracted, ai_confirmed)
    VALUES (?,?,?,?,?,?,?,0)`).run(
    b.patient_id, b.condition_id || null, b.type || 'other', b.title || 'Documento', b.exam_date || null, b.description || null,
    b.ai_extracted ? JSON.stringify(b.ai_extracted) : null);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(b.patient_id, 'exam', 'Exame/documento anexado', b.title || 'Documento clínico');
  res.json({ id: r.lastInsertRowid });
});

app.post('/api/exams/:id/confirm-ai', (req, res) => {
  const b = req.body || {};
  const row = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  // The user may have ADDED/EDITED the AI summary in the preview pane before
  // confirming — persist that final text (as {summary: ...} so the frontend
  // parser reads it the same way), then flag confirmed + attach to timeline.
  const summary = typeof b.summary === 'string' && b.summary.trim() ? b.summary.trim() : null;
  if (summary) {
    db.prepare(`UPDATE exams SET ai_confirmed = 1, ai_extracted = ? WHERE id = ?`)
      .run(JSON.stringify({ summary }), req.params.id);
    db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
      .run(row.patient_id, 'exam', 'Resumo IA confirmado', summary.slice(0, 300));
  } else {
    db.prepare(`UPDATE exams SET ai_confirmed = 1 WHERE id = ?`).run(req.params.id);
  }
  res.json({ ok: true });
});

// ── File uploads (photos + documents) — real files, saved under public/uploads ──
const UPLOAD_ROOT = path.join(__dirname, 'public', 'uploads');
function removeUpload(relPath){
  if (!relPath) return;
  try {
    const fp = path.join(__dirname, 'public', String(relPath).replace(/^\//, ''));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (e) {}
}
app.post('/api/upload', (req, res) => {
  const b = req.body || {};
  if (!b.patient_id) return res.status(400).json({ error: 'patient_id required' });
  if (!b.dataUrl || !b.fileName) return res.status(400).json({ error: 'dataUrl and fileName required' });
  const kind = b.kind === 'image' ? 'image' : 'document';
  const m = /^data:([^;]+);base64,(.+)$/.exec(b.dataUrl);
  if (!m) return res.status(400).json({ error: 'invalid dataUrl' });
  const mime = m[1];
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'file too large (>25MB)' });
  const dir = path.join(UPLOAD_ROOT, String(b.patient_id));
  fs.mkdirSync(dir, { recursive: true });
  const ext = String(b.fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin';
  const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const rel = `/uploads/${b.patient_id}/${fname}`;
  fs.writeFileSync(path.join(dir, fname), buf);
  if (kind === 'image') {
    const r = db.prepare(`INSERT INTO images (patient_id, file_path, notes, taken_at) VALUES (?,?,?,?)`)
      .run(b.patient_id, rel, b.notes || null, b.taken_at || new Date().toISOString());
    db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
      .run(b.patient_id, 'photo', 'Foto adicionada', b.notes || 'Foto clínica');
    return res.json({ id: r.lastInsertRowid, file_path: rel, kind });
  }
  const r = db.prepare(`INSERT INTO exams (patient_id, type, title, file_path, exam_date, description) VALUES (?,?,?,?,?,?)`)
    .run(b.patient_id, b.type || 'other', b.title || String(b.fileName).replace(/\.[^.]+$/, ''), rel, b.exam_date || new Date().toISOString(), b.description || mime);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(b.patient_id, 'exam', 'Exame/documento anexado', b.title || 'Documento clínico');
  res.json({ id: r.lastInsertRowid, file_path: rel, kind });
});
app.delete('/api/images/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  removeUpload(row.file_path);
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
app.delete('/api/exams/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  removeUpload(row.file_path);
  db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
app.put('/api/exams/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'not found' });
  db.prepare(`UPDATE exams SET title=?, description=?, type=?, exam_date=? WHERE id=?`)
    .run(b.title ?? cur.title, b.description ?? cur.description, b.type ?? cur.type, b.exam_date ?? cur.exam_date, cur.id);
  res.json({ ok: true, id: cur.id });
});
// ── Document preview: render the FIRST PAGE of a PDF to a PNG so the
//    preview pane shows the actual document (not just a download link).
//    Caches in temp/ keyed by exam id + file mtime; images pass through.
app.get('/api/exams/:id/preview', (req, res) => {
  const row = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!row || !row.file_path) return res.status(404).json({ success: false, error: 'not found' });
  const abs = path.join(__dirname, 'public', String(row.file_path).replace(/^\//, ''));
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, error: 'file missing' });
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(row.file_path)) {
    return res.json({ success: true, kind: 'image', file_path: row.file_path });
  }
  if (!/\.pdf$/i.test(row.file_path)) {
    return res.json({ success: false, error: 'unsupported-type' });
  }
  try {
    const st = fs.statSync(abs);
    const cacheKey = `${row.id}-${st.mtimeMs.toFixed(0)}-${st.size}`;
    const cachePath = path.join(__dirname, 'temp', `exam-prev-${cacheKey}.png`);
    const render = (cb) => {
      const { execFile } = require('child_process');
      execFile('pdftoppm', ['-png', '-f', '1', '-l', '1', '-r', '90', '-singlefile', abs, path.join(__dirname, 'temp', `exam-prev-${cacheKey}`)],
        { timeout: 15000 }, (err) => cb(err));
    };
    const send = () => {
      const buf = fs.readFileSync(cachePath);
      res.json({ success: true, kind: 'pdf-page', dataUrl: 'data:image/png;base64,' + buf.toString('base64') });
    };
    if (fs.existsSync(cachePath)) return send();
    render((err) => {
      if (err) return res.json({ success: false, error: 'render-failed', detail: String(err.message || err).slice(0, 200) });
      if (!fs.existsSync(cachePath)) return res.json({ success: false, error: 'render-failed' });
      send();
    });
  } catch (e) {
    res.json({ success: false, error: 'render-failed', detail: String(e.message).slice(0, 200) });
  }
});

// ── Voice notes (PHI audio) ────────────────────────────────────────────────
// Partial + final transcription: raw audio → LOCAL whisper (:8001) → raw text
// → DeepSeek clean pass (existing AI provider). Audio never leaves the box.
app.post('/api/voice-notes/transcribe', async (req, res) => {
  const b = req.body || {};
  const buf = b.audio_b64 ? Buffer.from(String(b.audio_b64), 'base64') : null;
  if (!buf || !buf.length) return res.status(400).json({ success: false, error: 'no-audio' });
  const partial = !!b.partial;
  const raw = await vn.transcribeRaw(buf, partial);
  if (!raw.ok) return res.json({ success: false, error: raw.error || 'transcribe-failed' });
  const lang = raw.language || 'pt';
  // Partials return RAW immediately — the DeepSeek clean pass only runs on the
  // final stop, so the live transcript isn't gated on LLM latency.
  const cleaned = partial ? { clean: raw.text } : await vn.cleanTranscript(raw.text, lang);
  res.json({
    success: true,
    partial,
    raw: raw.text,
    clean: cleaned.clean,
    language: lang,
    language_probability: raw.language_probability,
    duration_s: raw.duration_s,
    segments: raw.segments || [],
  });
});

// Save a voice note: audio file (private dir) + transcripts + metadata.
app.post('/api/voice-notes', async (req, res) => {
  const b = req.body || {};
  const patientId = Number(b.patient_id);
  if (!patientId) return res.status(400).json({ error: 'patient_id required' });
  const buf = b.audio_b64 ? Buffer.from(String(b.audio_b64), 'base64') : null;
  if (!buf || !buf.length) return res.status(400).json({ error: 'audio required' });
  try {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
    if (!patient) return res.status(404).json({ error: 'patient not found' });
    const dir = path.join(vn.VOICE_DIR, String(patientId));
    fs.mkdirSync(dir, { recursive: true });
    const id = crypto.randomUUID().slice(0, 8);
    // timestamped filename: nota-YYYYMMDD-HHMM-<id>.webm (user directive 2026-08-18)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    const fname = `nota-${stamp}-${id}.webm`;
    const storagePath = path.join(String(patientId), fname);
    fs.writeFileSync(path.join(dir, fname), buf);
    const status = (b.status === 'final' || b.status === 'draft') ? b.status : 'draft';
    const r = db.prepare(`INSERT INTO voice_notes
      (patient_id, author_id, storage_path, duration_ms, detected_language,
       transcript_clean, transcript_raw, title, tag, status, condition_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      patientId, req.user?.id || null, storagePath,
      Math.round(Number(b.duration_ms) || 0), b.language || null,
      b.transcript_clean || null, b.transcript_raw || null,
      b.title || null, b.tag || null, status,
      b.condition_id ? Number(b.condition_id) : null);
    vn.audit(r.lastInsertRowid, req.user?.id, 'create', b.title || null);
    // timeline event so it shows in the patient's clinical timeline
    db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
      .run(patientId, 'exam', 'Nota de voz adicionada', (b.title || 'Nota de voz') + (b.tag ? ' · ' + b.tag : ''));
    res.json({ id: r.lastInsertRowid, storage_path: storagePath });
  } catch (e) {
    res.status(500).json({ error: 'save-failed', detail: String(e.message).slice(0, 200) });
  }
});

// Rename / update a voice note (title, tag, status, condition, transcript).
app.put('/api/voice-notes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM voice_notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  try {
    const status = (b.status === 'final' || b.status === 'draft') ? b.status : (row.status || 'draft');
    db.prepare(`UPDATE voice_notes SET title=?, tag=?, status=?, condition_id=?, transcript_clean=?, transcript_raw=? WHERE id=?`)
      .run(
        b.title != null ? String(b.title).slice(0, 120) : row.title,
        b.tag != null ? String(b.tag).slice(0, 40) : row.tag,
        status,
        b.condition_id != null ? (Number(b.condition_id) || null) : row.condition_id,
        b.transcript_clean != null ? String(b.transcript_clean) : row.transcript_clean,
        b.transcript_raw != null ? String(b.transcript_raw) : row.transcript_raw,
        row.id);
    vn.audit(row.id, req.user?.id, 'update', b.title || null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'update-failed', detail: String(e.message).slice(0, 200) });
  }
});

// Save a copy of the note INTO the patient's Documents (transcript + recording).
// Independent copy: editing/deleting the docs entry never touches the voice note.
app.post('/api/voice-notes/:id/to-docs', (req, res) => {
  const row = db.prepare('SELECT * FROM voice_notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const patientId = Number(row.patient_id);
  try {
    const src = path.join(vn.VOICE_DIR, String(row.storage_path).replace(/^\//, ''));
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'audio missing' });
    // copy audio into public/uploads so the docs preview/download works
    const dir = path.join(UPLOAD_ROOT, String(patientId));
    fs.mkdirSync(dir, { recursive: true });
    const fname = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webm`;
    const rel = `/uploads/${patientId}/${fname}`;
    fs.copyFileSync(src, path.join(dir, fname));
    const title = row.title || 'Nota de voz';
    const r = db.prepare(`INSERT INTO exams (patient_id, type, title, file_path, exam_date, description) VALUES (?,?,?,?,?,?)`)
      .run(patientId, 'voice', title, rel, row.created_at || new Date().toISOString(), row.transcript_clean || row.transcript_raw || '');
    db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
      .run(patientId, 'exam', 'Exame/documento anexado', title + ' (nota de voz → documentos)');
    res.json({ id: r.lastInsertRowid, file_path: rel });
  } catch (e) {
    res.status(500).json({ error: 'to-docs-failed', detail: String(e.message).slice(0, 200) });
  }
});

// List voice notes for a patient (metadata only — audio served via signed URL).
app.get('/api/voice-notes', (req, res) => {
  const patientId = Number(req.query.patient_id);
  if (!patientId) return res.status(400).json({ error: 'patient_id required' });
  const rows = db.prepare(`SELECT v.id, v.patient_id, v.author_id, v.duration_ms, v.detected_language,
    v.transcript_clean, v.transcript_raw, v.title, v.tag, v.status, v.condition_id, v.created_at,
    u.full_name AS author_name
    FROM voice_notes v LEFT JOIN users u ON u.id = v.author_id
    WHERE v.patient_id = ? ORDER BY v.created_at DESC`).all(patientId);
  const signed = rows.map(r => ({ ...r, audio_url: '/api/voice-notes/' + r.id + '/audio?token=' + vn.signUrl(r.id) }));
  signed.forEach(r => vn.audit(r.id, req.user?.id, 'list', null));
  res.json(signed);
});

// Audio playback via short-lived signed URL (5 min). Audit every read.
app.get('/api/voice-notes/:id/audio', (req, res) => {
  const noteId = vn.verifyUrl(req.query.token);
  if (!noteId) return res.status(403).json({ error: 'invalid or expired token' });
  const row = db.prepare('SELECT * FROM voice_notes WHERE id = ?').get(noteId);
  if (!row) return res.status(404).json({ error: 'not found' });
  const abs = path.join(vn.VOICE_DIR, String(row.storage_path).replace(/^\/+/, ''));
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'file missing' });
  vn.audit(noteId, req.user?.id, 'read', null);
  res.setHeader('Content-Type', 'audio/webm');
  res.setHeader('Content-Length', fs.statSync(abs).size);
  res.setHeader('Accept-Ranges', 'bytes');
  fs.createReadStream(abs).pipe(res);
});

// Delete a voice note (audio file + row + audit).
app.delete('/api/voice-notes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM voice_notes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  try {
    const abs = path.join(vn.VOICE_DIR, String(row.storage_path).replace(/^\/+/, ''));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) {}
  db.prepare('DELETE FROM voice_notes WHERE id = ?').run(req.params.id);
  vn.audit(req.params.id, req.user?.id, 'delete', null);
  res.json({ ok: true });
});

// ── Auto-measurement: proxy photo to Reviva's wound-segmentation inference
//    server (127.0.0.1:8000, same box) and store mm²/mm results. Gracefully
//    degrades when the inference service is down (photo still uploads fine).
const REVIVA_INFER = process.env.REVIVA_INFER_URL || 'http://127.0.0.1:8000';
app.post('/api/auto-measure', async (req, res) => {
  const b = req.body || {};
  const imgId = Number(b.image_id);
  const row = imgId ? db.prepare('SELECT * FROM images WHERE id = ?').get(imgId) : null;
  if (!row || !row.file_path) return res.status(404).json({ error: 'image not found' });
  const abs = path.join(__dirname, 'public', String(row.file_path).replace(/^\//, ''));
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'image file missing' });
  try {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(abs)], { type: 'image/jpeg' }), 'photo.jpg');
    // Calibration (from phone EXIF via frontend; server falls back to estimate)
    if (b.focal_mm) fd.append('focal_mm', String(b.focal_mm));
    if (b.distance_m) fd.append('distance_m', String(b.distance_m));
    if (b.sensor_width) fd.append('sensor_width', String(b.sensor_width));
    if (b.camera) fd.append('camera', String(b.camera));
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 30000);
    const r = await fetch(REVIVA_INFER + '/analyze', { method: 'POST', body: fd, signal: ctrl.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error('inference HTTP ' + r.status);
    const ai = await r.json();
    if (!ai.success) return res.json({ success: false, reason: 'no-analysis' });
    const meas = ai.measurement || {};
    const areaMm2 = Math.round((meas.area_cm2 || 0) * 100 * 10) / 10;   // cm² → mm²
    const lenMm = Math.round((meas.length_cm || 0) * 100) / 10;          // cm → mm
    const widMm = Math.round((meas.width_cm || 0) * 100) / 10;
    const now = new Date().toISOString();
    const aiIns = db.prepare(`INSERT INTO measurements (patient_id, image_id, type, value, unit, measured_at, notes, source) VALUES (?,?,?,?,?,?,?,?)`);
    if (areaMm2 > 0) {
      aiIns.run(row.patient_id, row.id, 'area', areaMm2, 'mm', now, 'Auto (IA)', 'ai');
    }
    if (lenMm > 0) {
      aiIns.run(row.patient_id, row.id, 'length', lenMm, 'mm', now, 'Auto (IA)', 'ai');
    }
    if (widMm > 0) {
      aiIns.run(row.patient_id, row.id, 'width', widMm, 'mm', now, 'Auto (IA)', 'ai');
    }
    const tissue = ai.tissue_composition || {};
    // Persist AI analysis artifacts on the image row (mask overlay + tissue % +
    // mask dimensions) so Before/After + overlay/blend views can render them
    // without re-running inference.
    if (ai.overlay_b64 || Object.keys(tissue).length) {
      db.prepare(`UPDATE images SET ai_overlay = ?, tissue_json = ?, ai_w = ?, ai_h = ? WHERE id = ?`)
        .run(ai.overlay_b64 || null, JSON.stringify(tissue), ai.image_size?.width || null, ai.image_size?.height || null, row.id);
    }
    // AUTO-ALIGN at upload: the customer ALWAYS wants the before/after pair
    // lined up, so compute + persist it here (no view-time request). Align
    // this new photo against the patient's earliest photo (prefer one that
    // already has measurements, matching the Before/After view's selection).
    try {
      const withMeas = db.prepare(`SELECT DISTINCT i.* FROM images i JOIN measurements m ON m.image_id = i.id WHERE i.patient_id = ? AND i.id != ? ORDER BY i.taken_at ASC LIMIT 1`).get(row.patient_id, row.id);
      const beforeRow = withMeas || db.prepare(`SELECT * FROM images WHERE patient_id = ? AND id != ? ORDER BY taken_at ASC LIMIT 1`).get(row.patient_id, row.id);
      if (beforeRow) {
        const ad = await runAlignPair(beforeRow, row);
        if (ad) storeAlign(row, { ...ad, before_id: beforeRow.id });
      }
    } catch (e) { /* alignment is best-effort; upload still succeeded */ }
    res.json({
      success: true,
      wound_detected: !!ai.wound_detected,
      area_mm2: areaMm2, length_mm: lenMm, width_mm: widMm,
      method: ai.calibration_method || 'estimate',
      tissue: { granulation: tissue.granulation ?? 0, slough: tissue.slough ?? 0, eschar: tissue.eschar ?? 0, epithelial: tissue.epithelial ?? 0 },
    });
  } catch (e) {
    res.json({ success: false, reason: 'inference-unavailable', error: e.message });
  }
});
// ── AI photo alignment: center the wound 0-point in BOTH photos on a
//    common canvas so blend overlays line up (mask-centroid alignment +
//    ORB feature fallback). Uses align.py (cv2) via child_process; returns
//    aligned before+after data URLs plus transform params. Any image
//    missing an AI mask gets one by running inference (so ANY uploaded
//    photo can be aligned, not just auto-measured ones).
//    runAlignPair(beforeRow, afterRow) → result object or null. Persists
//    nothing itself; callers decide (the upload pipeline stores it so the
//    Before/After view needs NO request at view time).
async function runAlignPair(before, after) {
  if (!before || !after || !before.file_path || !after.file_path) return null;
  const abs = (fp) => path.join(__dirname, 'public', String(fp).replace(/^\//, ''));
  const bp = abs(before.file_path), ap = abs(after.file_path);
  if (!fs.existsSync(bp) || !fs.existsSync(ap)) return null;
  // Ensure both images have an AI mask (run inference on any that don't).
  const ensureMask = async (row) => {
    if (row.ai_overlay) return row.ai_overlay;
    try {
      const fd = new FormData();
      fd.append('file', new Blob([fs.readFileSync(abs(row.file_path))], { type: 'image/jpeg' }), 'photo.jpg');
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(REVIVA_INFER + '/analyze', { method: 'POST', body: fd, signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) return null;
      const ai = await r.json();
      if (!ai.success || !ai.overlay_b64) return null;
      const tissue = ai.tissue_composition || {};
      db.prepare(`UPDATE images SET ai_overlay = ?, tissue_json = ?, ai_w = ?, ai_h = ? WHERE id = ?`)
        .run(ai.overlay_b64, JSON.stringify(tissue), ai.image_size?.width || null, ai.image_size?.height || null, row.id);
      return ai.overlay_b64;
    } catch (e) { return null; }
  };
  try {
    const bm64 = await ensureMask(before);
    const am64 = await ensureMask(after);
    const maskPath = (row, b64) => {
      if (!b64) return null;
      const tmp = path.join(__dirname, 'temp', `align-mask-${row.id}-${Date.now()}-${Math.random().toString(36).slice(2,6)}.png`);
      fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
      return tmp;
    };
    const bm = maskPath(before, bm64), am = maskPath(after, am64);
    const cfg = { before: bp, after: ap, before_mask: bm, after_mask: am, max_dim: 900 };
    const { execFile } = require('child_process');
    return await new Promise((resolve) => {
      execFile(process.env.PYTHON || 'python3', [path.join(__dirname, 'align.py'), JSON.stringify(cfg)],
        { timeout: 25000 }, (err, stdout) => {
          if (bm) try { fs.unlinkSync(bm); } catch(e){}
          if (am) try { fs.unlinkSync(am); } catch(e){}
          if (err) return resolve(null);
          try {
            const d = JSON.parse(stdout);
            resolve(d.ok ? d : null);
          } catch (e) { resolve(null); }
        });
    });
  } catch (e) { return null; }
}
// Persist a computed align result on the AFTER row (used at upload time so
// the Before/After view reads stored alignment — no request on view).
function storeAlign(afterRow, d) {
  if (!afterRow || !d) return;
  try {
    db.prepare(`UPDATE images SET align_before_id = ?, align_before_b64 = ?, align_after_b64 = ?, align_meta = ? WHERE id = ?`)
      .run(d.before_id ?? null, d.aligned_before_b64 || null, d.aligned_after_b64 || null,
           JSON.stringify({ method: d.method, conf: d.conf, canvas_size: d.canvas_size, before_center: d.before_center, after_center: d.after_center, scale: d.scale, angle: d.angle, ts: Date.now() }),
           afterRow.id);
  } catch (e) {}
}
app.post('/api/align', async (req, res) => {
  const b = req.body || {};
  const getImg = (id) => id ? db.prepare('SELECT * FROM images WHERE id = ?').get(id) : null;
  const before = getImg(Number(b.before_id));
  const after = getImg(Number(b.after_id));
  if (!before || !after) return res.status(404).json({ success: false, error: 'image not found' });
  const d = await runAlignPair(before, after);
  if (!d) return res.json({ success: false, error: 'align-failed' });
  storeAlign(after, { ...d, before_id: before.id });
  res.json({ success: true, ...d });
});
// ── Export patient record (PDF / DOCX — everything, localized) ──
function patientBundle(id) {
  const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  if (!p) return null;
  p.conditions = db.prepare('SELECT * FROM conditions WHERE patient_id = ? ORDER BY opened_at DESC').all(p.id);
  p.footmap_points = db.prepare('SELECT * FROM footmap_points WHERE patient_id = ?').all(p.id);
  p.measurements = db.prepare('SELECT * FROM measurements WHERE patient_id = ? ORDER BY measured_at DESC').all(p.id);
  p.measurements = decorateMeasurements(p.measurements);
  p.timeline = db.prepare('SELECT * FROM timeline_events WHERE patient_id = ? ORDER BY event_date DESC, id DESC LIMIT 500').all(p.id);
  p.images = db.prepare('SELECT * FROM images WHERE patient_id = ? ORDER BY taken_at DESC').all(p.id);
  p.exams = db.prepare('SELECT * FROM exams WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  p.consents = db.prepare('SELECT * FROM consents WHERE patient_id = ?').all(p.id);
  p.pdocuments = db.prepare('SELECT * FROM patient_documents WHERE patient_id = ? ORDER BY id DESC').all(p.id);
  p.appointments = db.prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY start_at DESC').all(p.id);
  p.visits = db.prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC').all(p.id);
  p.visits = p.visits.map(v => ({ ...v,
    exams: db.prepare('SELECT * FROM visit_exams WHERE visit_id = ? ORDER BY id').all(v.id),
    procedures: db.prepare('SELECT * FROM visit_procedures WHERE visit_id = ? ORDER BY id').all(v.id),
    homecare: db.prepare('SELECT * FROM homecare WHERE visit_id = ?').all(v.id),
    photos: db.prepare('SELECT id, file_path, taken_at, notes FROM images WHERE visit_id = ? ORDER BY taken_at').all(v.id)
  }));
  p.referrals = db.prepare('SELECT * FROM referrals WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  p.claims = db.prepare('SELECT * FROM claims WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  p.plans = db.prepare('SELECT * FROM treatment_plans WHERE patient_id = ? ORDER BY created_at DESC').all(p.id);
  p.plans = p.plans.map(pl => ({ ...pl,
    payments: db.prepare('SELECT * FROM payments WHERE plan_id = ? ORDER BY paid_at DESC, id DESC').all(pl.id).map(pay => ({ ...pay, sessions: paysessArr(pay) })),
    paid_total: (db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE plan_id = ?').get(pl.id) || {}).s || 0
  }));
  return p;
}
function safeFileName(p) {
  return String(p.full_name || 'paciente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtMoney(v, cur) {
  const n = Number(v || 0);
  try { return (cur === 'USD' ? '$' : cur === 'EUR' ? '€' : 'R$') + ' ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch(e) { return (cur === 'USD' ? '$' : cur === 'EUR' ? '€' : 'R$') + ' ' + n.toFixed(2); }
}
const fmtDate = (s) => s ? String(s).slice(0, 10) : '—';
// Human-readable condition type — DB stores PT keys (unha_encravada, micose, ...)
// keep old EN keys as aliases for any legacy rows
const COND_NAME = { unha_encravada: 'Unha encravada', verruga: 'Verruga plantar', granuloma: 'Granuloma', calosidade: 'Calosidade', fissura: 'Fissura', micose: 'Onicomicose', lesoes: 'Lesões', outro: 'Outro', ingrown: 'Unha encravada', fissure: 'Fissura', callus: 'Calo', ulcer: 'Úlcera', verruca: 'Verruga', onychomycosis: 'Onicomicose', other: 'Outro' };
const COND_NAME_ES = { unha_encravada: 'Uña encarnada', verruga: 'Verruga plantar', granuloma: 'Granuloma', calosidade: 'Callosidad', fissura: 'Fisura', micose: 'Onicomicosis', lesoes: 'Lesiones', outro: 'Otro', ingrown: 'Uña encarnada', fissure: 'Fisura', callus: 'Callo', ulcer: 'Úlcera', verruca: 'Verruga', onychomycosis: 'Onicomicosis', other: 'Otro' };
const COND_NAME_EN = { unha_encravada: 'Ingrown toenail', verruga: 'Plantar wart', granuloma: 'Granuloma', calosidade: 'Callus', fissura: 'Fissure', micose: 'Onychomycosis', lesoes: 'Lesions', outro: 'Other', ingrown: 'Ingrown toenail', fissure: 'Fissure', callus: 'Callus', ulcer: 'Ulcer', verruca: 'Verruca', onychomycosis: 'Onychomycosis', other: 'Other' };
const condName = (t, lang) => {
  const d = lang === 'en' ? COND_NAME_EN : lang === 'es' ? COND_NAME_ES : COND_NAME;
  return d[t] || t || '—';
};
// Value dictionaries for raw DB keys (pt / es / en) — measurement types, statuses, etc.
const REP_V = {
  // measurement types
  pain: ['Dor', 'Dolor', 'Pain'], area: ['Área', 'Área', 'Area'], length: ['Comprimento', 'Longitud', 'Length'],
  width: ['Largura', 'Ancho', 'Width'], depth: ['Profundidade', 'Profundidad', 'Depth'],
  elevation: ['Elevação', 'Elevación', 'Elevation'], dark_points: ['Pontos escuros', 'Puntos oscuros', 'Dark points'],
  severity: ['Severidade', 'Severidad', 'Severity'],
  nail_involvement_pct: ['Envolvimento ungueal', 'Afectación ungueal', 'Nail involvement'],
  // measurement units
  scale_0_10: ['Escala 0–10', 'Escala 0–10', 'Scale 0–10'], '0-10': ['0–10', '0–10', '0–10'],
  mm: ['mm', 'mm', 'mm'], pct: ['%', '%', '%'],
  // condition status
  improving: ['Melhorando', 'Mejorando', 'Improving'], stable: ['Estável', 'Estable', 'Stable'],
  needs_attention: ['Necessita atenção', 'Requiere atención', 'Needs attention'],
  worsening: ['Piorando', 'Empeorando', 'Worsening'], resolved: ['Resolvido', 'Resuelto', 'Resolved'],
  // appointment types
  retorno: ['Retorno', 'Retorno', 'Follow-up'], consulta: ['Consulta', 'Consulta', 'Consultation'],
  avaliacao: ['Avaliação', 'Evaluación', 'Evaluation'], urgente: ['Urgente', 'Urgente', 'Urgent'],
  rotina: ['Rotina', 'Rutina', 'Routine'],
  // plan + payment status/methods (Tier 2)
  active: ['Ativo', 'Activo', 'Active'], completed: ['Concluído', 'Completado', 'Completed'],
  pix: ['Pix', 'Pix', 'Pix'], cash: ['Dinheiro', 'Efectivo', 'Cash'], card: ['Cartão', 'Tarjeta', 'Card'],
  transfer: ['Transferência', 'Transferencia', 'Transfer'],
  // appointment status
  confirmed: ['Confirmado', 'Confirmado', 'Confirmed'], cancelled: ['Cancelado', 'Cancelado', 'Cancelled'],
  pending: ['Pendente', 'Pendiente', 'Pending'], done: ['Realizado', 'Realizado', 'Done'],
  // referral status
  open: ['Aberto', 'Abierto', 'Open'], contacted: ['Contatado', 'Contactado', 'Contacted'],
  converted: ['Convertido', 'Convertido', 'Converted'], closed: ['Fechado', 'Cerrado', 'Closed'],
  // referral direction
  incoming: ['Entrada', 'Entrante', 'Incoming'], outgoing: ['Saída', 'Saliente', 'Outgoing'],
  // exam types
  report: ['Relatório', 'Informe', 'Report'], imaging: ['Imagem', 'Imagen', 'Imaging'],
  culture_fungal: ['Cultura fúngica', 'Cultivo fúngico', 'Fungal culture'],
  other: ['Outro', 'Otro', 'Other'],
  // consent types
  treatment: ['Tratamento', 'Tratamiento', 'Treatment'],
  // sex
  F: ['Feminino', 'Femenino', 'Female'], M: ['Masculino', 'Masculino', 'Male']
};
const repVal = (k, lang) => {
  const a = REP_V[k] || (k ? [k, k, k] : ['—', '—', '—']);
  return a[lang === 'en' ? 2 : lang === 'es' ? 1 : 0] || a[0];
};
// Diabetic-foot exam names + procedure modalities (v32)
const REP_EXAM = {
  monofilament: ['Monofilamento', 'Monofilamento', 'Monofilament'],
  tuning_fork: ['Diapasão (sensib. vibratória)', 'Diapasón (sensib. vibratoria)', 'Tuning fork (vibratory)'],
  pulses: ['Pulsos', 'Pulsos', 'Pulses'],
  doppler: ['Doppler vascular', 'Doppler vascular', 'Vascular Doppler'],
  temp_diff: ['Diferença de temperatura', 'Diferencia de temperatura', 'Temperature difference'],
  risk_class: ['Classificação de risco', 'Clasificación de riesgo', 'Risk classification']
};
const REP_PROC = {
  laser: ['Laserterapia', 'Laserterapia', 'Laser therapy'],
  high_frequency: ['Alta frequência', 'Alta frecuencia', 'High frequency'],
  plasma: ['Jato de plasma', 'Chorro de plasma', 'Plasma jet'],
  acid: ['Aplicação de ácido', 'Aplicación de ácido', 'Acid application'],
  cryo: ['Crioterapia', 'Crioterapia', 'Cryotherapy'],
  cauterization: ['Cauterização', 'Cauterización', 'Cauterization'],
  dressing: ['Curativo', 'Curativo', 'Dressing'],
  spiculactomy: ['Espiculaectomia', 'Espiculaectomía', 'Spiculactomy'],
  nail_correction: ['Acerto da unha', 'Corrección de uña', 'Nail correction'],
  orthonyx: ['Órtese ungueal', 'Órtesis ungueal', 'Nail orthosis'],
  debridement: ['Desbridamento', 'Desbridamiento', 'Debridement'],
  other: ['Outro', 'Otro', 'Other']
};
const repExam = (k, lang) => { const a = REP_EXAM[k] || [k, k, k]; return a[lang === 'en' ? 2 : lang === 'es' ? 1 : 0] || a[0]; };
const repProc = (k, lang) => { const a = REP_PROC[k] || [k, k, k]; return a[lang === 'en' ? 2 : lang === 'es' ? 1 : 0] || a[0]; };
// Foot map view keys: 'right_plantar' | 'left_plantar' | 'right_dorsal' | 'dorsal_right' ...
const FM_SIDE = { right: ['Direito', 'Derecho', 'Right'], left: ['Esquerdo', 'Izquierdo', 'Left'] };
const FM_VIEW = { plantar: ['Plantar', 'Plantar', 'Plantar'], dorsal: ['Dorsal', 'Dorsal', 'Dorsal'], medial: ['Medial', 'Medial', 'Medial'], lateral: ['Lateral', 'Lateral', 'Lateral'], anterior: ['Anterior', 'Anterior', 'Anterior'], posterior: ['Posterior', 'Posterior', 'Posterior'] };
const repFootView = (v, lang) => {
  if (!v) return '—';
  const parts = String(v).toLowerCase().split('_');
  let side = null, view = null;
  for (const p of parts) { if (FM_SIDE[p]) side = p; if (FM_VIEW[p]) view = p; }
  if (!view) return v;
  const vs = FM_VIEW[view][lang === 'en' ? 2 : lang === 'es' ? 1 : 0];
  if (!side) return vs;
  const ss = FM_SIDE[side][lang === 'en' ? 2 : lang === 'es' ? 1 : 0];
  return `${vs} ${ss}`;
};
// Timeline titles are stored as PT strings, some with embedded raw keys —
// localize known system titles so the export is fully in the target language.
const REP_TITLE = {
  'Avaliação inicial': ['Avaliação inicial', 'Evaluación inicial', 'Initial assessment'],
  'Paciente cadastrado': ['Paciente cadastrado', 'Paciente registrado', 'Patient registered'],
  'Exame/documento anexado': ['Exame/documento anexado', 'Examen/documento adjunto', 'Exam/document attached'],
  'Retorno': ['Retorno', 'Retorno', 'Follow-up'],
  'Foto adicionada': ['Foto adicionada', 'Foto añadida', 'Photo added'],
  'Encaminhamento recebido': ['Encaminhamento recebido', 'Derivación recibida', 'Referral received'],
  'Tratamento conservador': ['Tratamento conservador', 'Tratamiento conservador', 'Conservative treatment'],
  'Medição registrada': ['Medição registrada', 'Medición registrada', 'Measurement recorded'],
  'Condição resolvida': ['Condição resolvida', 'Condición resuelta', 'Condition resolved'],
  'Exame/documento anexado': ['Exame/documento anexado', 'Examen/documento adjunto', 'Exam/document attached']
};
const repTimeline = (t, lang) => {
  const L = lang === 'en' ? 2 : lang === 'es' ? 1 : 0;
  const title = String(t.title || '');
  // exact match
  const exact = REP_TITLE[title];
  if (exact) return exact[L];
  // "Medição registrada (pain)" → localize the embedded measurement key
  const mMeas = title.match(/^Medição registrada \((.*)\)$/);
  if (mMeas) {
    const base = L === 0 ? 'Medição registrada' : L === 1 ? 'Medición registrada' : 'Measurement recorded';
    return `${base} (${repVal(mMeas[1], lang)})`;
  }
  // "Consentimento assinado: treatment" → localize the consent key
  const mConsent = title.match(/^Consentimento assinado: (.*)$/);
  if (mConsent) return `${L === 0 ? 'Consentimento assinado' : L === 1 ? 'Consentimiento firmado' : 'Consent signed'}: ${repVal(mConsent[1], lang)}`;
  // "Condição registrada: Unha encravada" → localize the condition name (reverse-map PT → key)
  const mCond = title.match(/^Condição registrada: (.*)$/);
  if (mCond) {
    const rev = { 'Unha encravada': 'unha_encravada', 'Verruga': 'verruga', 'Verruga plantar': 'verruga', 'Granuloma': 'granuloma', 'Calosidade': 'calosidade', 'Fissura': 'fissura', 'Micose': 'micose', 'Onicomicose': 'micose', 'Lesão': 'lesoes', 'Lesões': 'lesoes', 'Outra condição': 'outro', 'Outro': 'outro' };
    const key = rev[mCond[1]] || mCond[1];
    return `${L === 0 ? 'Condição registrada' : L === 1 ? 'Condición registrada' : 'Condition registered'}: ${condName(key, lang)}`;
  }
  return title;
};
// Report section labels (pt / es / en)
const REP_L = {
  title: ['Podo360 — Prontuário do Paciente', 'Podo360 — Historial del Paciente', 'Podo360 — Patient Record'],
  sub: ['Inteligência Clínica para a Saúde dos Pés', 'Inteligencia Clínica para la Salud de los Pies', 'Clinical Intelligence for Foot Health'],
  personal: ['Dados Pessoais', 'Datos Personales', 'Personal Data'],
  name: ['Nome', 'Nombre', 'Name'], birth: ['Nascimento', 'Fecha de nacimiento', 'Date of Birth'],
  cpf: ['CPF', 'CPF', 'CPF'],
  sex: ['Sexo', 'Sexo', 'Sex'], phone: ['Telefone', 'Teléfono', 'Phone'],
  email: ['E-mail', 'Correo', 'Email'], address: ['Endereço', 'Dirección', 'Address'],
  medHist: ['Histórico médico', 'Historial médico', 'Medical history'], allergies: ['Alergias', 'Alergias', 'Allergies'],
  meds: ['Medicações', 'Medicamentos', 'Medications'],
  conditions: ['Condições Clínicas', 'Condiciones Clínicas', 'Clinical Conditions'],
  type: ['Tipo', 'Tipo', 'Type'], desc: ['Descrição', 'Descripción', 'Description'], status: ['Status', 'Estado', 'Status'], opened: ['Abertura', 'Apertura', 'Opened'],
  none: ['Nenhum registro.', 'Sin registros.', 'None on record.'],
  plans: ['Planos de Tratamento', 'Planes de Tratamiento', 'Treatment Plans'],
  plan: ['Plano', 'Plan', 'Plan'], sessions: ['Sessões', 'Sesiones', 'Sessions'],
  price: ['Valor', 'Valor', 'Price'], paid: ['Pago', 'Pagado', 'Paid'], balance: ['Saldo', 'Saldo', 'Balance'],
  payments: ['Pagamentos', 'Pagos', 'Payments'], method: ['Método', 'Método', 'Method'],
  professional: ['Profissional', 'Profesional', 'Professional'], signature: ['Assinatura', 'Firma', 'Signature'],
  homecare: ['Orientações de cuidados em casa', 'Cuidados en casa', 'Home-care instructions'],
  freq: ['Frequência', 'Frecuencia', 'Frequency'], alertSigns: ['Sinais de alerta', 'Señales de alerta', 'Alert signs'],
  footmap: ['Mapa dos Pés — Pontos Rastreados', 'Mapa de los Pies — Puntos Rastreados', 'Foot Map — Tracked Points'],
  location: ['Local', 'Ubicación', 'Location'], label: ['Rótulo', 'Etiqueta', 'Label'], severity: ['Severidade', 'Severidad', 'Severity'], date: ['Data', 'Fecha', 'Date'],
  meas: ['Medições', 'Mediciones', 'Measurements'], value: ['Valor', 'Valor', 'Value'], notes: ['Notas', 'Notas', 'Notes'],
  timeline: ['Linha do Tempo Clínica', 'Línea de Tiempo Clínica', 'Clinical Timeline'], event: ['Evento', 'Evento', 'Event'],
  exams: ['Exames / Documentos', 'Exámenes / Documentos', 'Exams / Documents'],
  photos: ['Fotos', 'Fotos', 'Photos'], file: ['Arquivo', 'Archivo', 'File'],
  consents: ['Consentimentos', 'Consentimientos', 'Consents'], version: ['Versão', 'Versión', 'Version'],
  appts: ['Consultas / Agendamentos', 'Consultas / Citas', 'Appointments'],
  visits: ['Consultas realizadas', 'Consultas realizadas', 'Visits'],
  complaint: ['Queixa', 'Queja', 'Complaint'], treatment: ['Tratamento', 'Tratamiento', 'Treatment'],
  reaction: ['Reação', 'Reacción', 'Reaction'], pain: ['Dor', 'Dolor', 'Pain'],
  referrals: ['Encaminhamentos', 'Derivaciones', 'Referrals'], dest: ['Destino', 'Destino', 'Destination'],
  footer: ['Podo360™ by Velda.AI — gerado em', 'Podo360™ by Velda.AI — generado el', 'Podo360™ by Velda.AI — generated on'],
  imgData: ['Imagem', 'Imagen', 'Image']
};
const repL = (k, lang, i) => { const a = REP_L[k] || [k, k, k]; return a[lang === 'en' ? 2 : lang === 'es' ? 1 : 0] || a[0]; };

// Shared HTML body for PDF + DOCX exports — contains EVERY section of the record + real images
function patientReportHtml(p, lang) {
  const L = lang === 'en' ? 2 : lang === 'es' ? 1 : 0;
  const imgAbs = (fp) => {
    if (!fp) return null;
    const pth = path.join(__dirname, 'public', fp.replace(/^\//, ''));
    return fs.existsSync(pth) ? pth : null;
  };
  const conds = (p.conditions || []).map(c =>
    `<tr><td>${esc(condName(c.type, lang))}</td><td>${esc(c.label || '—')}</td><td>${esc(repVal(c.status, lang))}</td><td>${fmtDate(c.opened_at)}</td></tr>`).join('');
  const measRows = (p.measurements || []).map(m =>
    `<tr><td>${fmtDate(m.measured_at || m.created_at)}</td><td>${esc(repVal(m.type, lang))}</td><td>${esc(m.value)} ${esc(repVal(m.unit, lang))}</td><td>${esc(m.notes || '—')}</td></tr>`).join('');
  const timelineRows = (p.timeline || []).map(t =>
    `<tr><td>${fmtDate(t.event_date)}</td><td>${esc(repTimeline(t, lang))}</td></tr>`).join('');
  const examRows = (p.exams || []).map(e =>
    `<tr><td>${fmtDate(e.exam_date || e.created_at)}</td><td>${esc(e.title || '—')}</td><td>${esc(repVal(e.type, lang))}</td></tr>`).join('');
  const consentRows = (p.consents || []).map(c => {
    const sig = c.signature && c.signature.startsWith('data:image')
      ? `<img src="${c.signature}" style="max-width:40mm;max-height:14mm;border:1px solid #ddd;border-radius:3px">`
      : esc(c.signature || '—');
    return `<tr><td>${fmtDate(c.signed_at)}</td><td>${esc(repVal(c.type, lang))} v${esc(c.version || '1.0')}</td><td>${esc(c.professional || '—')}</td><td>${sig}</td></tr>`;
  }).join('');
  const planRows = (p.plans || []).map(pl =>
    `<tr><td>${esc(pl.name || '—')}</td><td>${pl.done_sessions ?? 0}/${pl.total_sessions ?? 0}</td><td>${repL('price', lang, L)}: ${fmtMoney(pl.price, pl.currency)}</td><td>${repL('paid', lang, L)}: ${fmtMoney(pl.paid_total ?? 0, pl.currency)} · ${repL('balance', lang, L)}: ${fmtMoney(Math.max(0, (pl.price ?? 0) - (pl.paid_total ?? 0)), pl.currency)}</td><td>${esc(repVal(pl.status, lang))}</td></tr>`).join('');
  const payRows = (p.plans || []).flatMap(pl => (pl.payments || []).map(pay =>
    `<tr><td>${fmtDate(pay.paid_at)}</td><td>${esc(pl.name || '—')}</td><td>${fmtMoney(pay.amount, pay.currency || pl.currency)}</td><td>${esc(repVal(pay.method, lang))}</td><td>${esc(pay.notes || '—')}</td></tr>`)).join('');
  const apptRows = (p.appointments || []).map(a =>
    `<tr><td>${fmtDate(a.start_at)}</td><td>${esc(repVal(a.type, lang))}</td><td>${esc(repVal(a.status, lang))}</td><td>${esc(a.notes || '—')}</td></tr>`).join('');
  const visitRows = (p.visits || []).map(v => {
    const vitals = [
      v.pain_score != null ? `${repL('pain', lang, L)}: ${v.pain_score}/10` : null,
      v.systolic_bp != null ? `PA: ${v.systolic_bp}/${v.diastolic_bp ?? '—'}` : null,
      v.heart_rate != null ? `FC: ${v.heart_rate}` : null,
      v.temperature != null ? `T: ${v.temperature}°C` : null,
      v.spo2 != null ? `SatO2: ${v.spo2}%` : null,
      v.glycemia != null ? `Glicemia: ${v.glycemia}` : null
    ].filter(Boolean).join(' · ');
    const exams = (v.exams || []).map(e => `<div style="font-size:11px;color:#5B6B84">• ${esc(repExam(e.exam_type, lang))}: ${esc(e.result || '—')}</div>`).join('');
    const procs = (v.procedures || []).map(pr => {
      const bits = [
        repProc(pr.modality, lang),
        pr.equipment, pr.parameters,
        pr.duration_sec != null ? `${pr.duration_sec}s` : null,
        pr.reaction ? `${repL('reaction', lang, L)}: ${pr.reaction}` : null
      ].filter(Boolean).join(' — ');
      return `<div style="font-size:11px;color:#0B1220">• ${esc(bits)}</div>`;
    }).join('');
    const hc = (v.homecare || [])[0];
    const hcHtml = hc ? `<div style="font-size:11px;color:#0B1220;margin-top:4px"><b>🧴 ${repL('homecare', lang, L)}:</b> ${
      [hc.product, hc.frequency ? `${repL('freq', lang, L)}: ${hc.frequency}` : null].filter(Boolean).join(' · ')
    }${hc.instructions ? `<div>• ${esc(hc.instructions)}</div>` : ''}${
      hc.alert_signs ? `<div style="color:#B91C1C">• ${repL('alertSigns', lang, L)}: ${esc(hc.alert_signs)}</div>` : ''}</div>` : '';
    const sessPhotos = (v.photos || []).map(ph => {
      const abs = imgAbs(ph.file_path);
      if (!abs) return '';
      return `<img src="${abs.replace(/\\/g, '/')}" style="max-width:26mm;max-height:20mm;border:1px solid #ddd;border-radius:3px;margin:2px">`;
    }).join('');
    return `<tr><td>${fmtDate(v.visit_date)}</td><td>${esc(v.complaint || '—')}</td><td>${esc(v.treatment || '—')}</td>
      <td>${esc(v.notes || '')}${vitals ? `<div style="font-size:11px;color:#5B6B84">${esc(vitals)}</div>` : ''}${exams}${procs}${hcHtml}${sessPhotos ? `<div style="margin-top:4px">${sessPhotos}</div>` : ''}</td></tr>`;
  }).join('');
  const refRows = (p.referrals || []).map(r =>
    `<tr><td>${fmtDate(r.created_at)}</td><td>${esc(r.partner_name || r.specialty || r.clinic || '—')}</td><td>${esc(repVal(r.status, lang))}</td><td>${esc(r.notes || '—')}</td></tr>`).join('');
  const fmRows = (p.footmap_points || []).map(f =>
    `<tr><td>${esc(repFootView(f.view, lang))}</td><td>${esc(f.label || '—')}</td><td>${esc(repVal(f.severity, lang))}</td><td>${fmtDate(f.created_at || f.opened_at)}</td></tr>`).join('');
  // Real embedded color photos (existing files only) + fallback list rows for missing files
  const photoImgs = (p.images || []).map(i => {
    const abs = imgAbs(i.file_path);
    const cap = `${fmtDate(i.taken_at)}${i.notes ? ' — ' + esc(i.notes) : ''}`;
    if (!abs) return `<p style="font-size:8.5pt;color:#666">${repL('imgData', lang, L)}: ${esc(i.file_path || '—')} (${fmtDate(i.taken_at)})</p>`;
    return `<figure style="margin:6px 0 10px"><img src="${abs.replace(/\\/g, '/')}" style="max-width:110mm;max-height:90mm;border:1px solid #ddd;border-radius:4px"><figcaption style="font-size:8pt;color:#666;margin-top:3px">${cap}</figcaption></figure>`;
  }).join('');
  const empty = repL('none', lang, L);
  return `
    <div class="pdf-header">
      <div><h1>${repL('title', lang, L)}</h1>
      <div class="sub">${repL('sub', lang, L)} · ${new Date().toISOString().slice(0, 10)}</div></div>
      <div class="meta"><strong>${esc(p.full_name || '')}</strong><br>${esc(p.company || '')}</div>
    </div>
    <div class="pdf-content">
      <h3>${repL('personal', lang, L)}</h3>
      <table><tr><th>${repL('name', lang, L)}</th><td>${esc(p.full_name || '—')}</td><th>${repL('birth', lang, L)}</th><td>${fmtDate(p.birth_date)}</td></tr>
      <tr><th>${repL('sex', lang, L)}</th><td>${esc(repVal(p.sex, lang))}</td><th>${repL('phone', lang, L)}</th><td>${esc(p.phone || '—')}</td></tr>
      <tr><th>${repL('email', lang, L)}</th><td>${esc(p.email || '—')}</td><th>${repL('address', lang, L)}</th><td>${esc(p.address || '—')}</td></tr>
      <tr><th>${repL('cpf', lang, L)}</th><td colspan="3">${esc(p.cpf || '—')}</td></tr>
      <tr><th>${repL('medHist', lang, L)}</th><td colspan="3">${esc(p.medical_history || '—')}</td></tr>
      <tr><th>${repL('allergies', lang, L)}</th><td colspan="3">${esc(p.allergies || '—')}</td></tr>
      <tr><th>${repL('meds', lang, L)}</th><td colspan="3">${esc(p.medications || '—')}</td></tr></table>

      <h3>${repL('conditions', lang, L)}</h3>
      <table><tr><th>${repL('type', lang, L)}</th><th>${repL('desc', lang, L)}</th><th>${repL('status', lang, L)}</th><th>${repL('opened', lang, L)}</th></tr>
      ${conds || `<tr><td colspan="4">${empty}</td></tr>`}</table>

      <h3>${repL('footmap', lang, L)}</h3>
      <table><tr><th>${repL('location', lang, L)}</th><th>${repL('label', lang, L)}</th><th>${repL('severity', lang, L)}</th><th>${repL('date', lang, L)}</th></tr>
      ${fmRows || `<tr><td colspan="4">${empty}</td></tr>`}</table>

      <h3>${repL('meas', lang, L)}</h3>
      <table><tr><th>${repL('date', lang, L)}</th><th>${repL('type', lang, L)}</th><th>${repL('value', lang, L)}</th><th>${repL('notes', lang, L)}</th></tr>
      ${measRows || `<tr><td colspan="4">${empty}</td></tr>`}</table>

      <h3>${repL('timeline', lang, L)}</h3>
      <table><tr><th>${repL('date', lang, L)}</th><th>${repL('event', lang, L)}</th></tr>
      ${timelineRows || `<tr><td colspan="2">${empty}</td></tr>`}</table>

      <h3>${repL('exams', lang, L)}</h3>
      <table><tr><th>${repL('date', lang, L)}</th><th>${repL('desc', lang, L)}</th><th>${repL('type', lang, L)}</th></tr>
      ${examRows || `<tr><td colspan="3">${empty}</td></tr>`}</table>

      <h3>${repL('photos', lang, L)}</h3>
      ${photoImgs || `<p style="font-size:8.5pt;color:#666">${empty}</p>`}

      <h3>${repL('consents', lang, L)}</h3>
      <table><tr><th>${repL('date', lang, L)}</th><th>${repL('type', lang, L)}</th><th>${repL('professional', lang, L)}</th><th>${repL('signature', lang, L)}</th></tr>
      ${consentRows || `<tr><td colspan="4">${empty}</td></tr>`}</table>

      <h3>${repL('appts', lang, L)}</h3>
      <table><tr><th>${repL('date', lang, L)}</th><th>${repL('type', lang, L)}</th><th>${repL('status', lang, L)}</th><th>${repL('notes', lang, L)}</th></tr>
      ${apptRows || `<tr><td colspan="4">${empty}</td></tr>`}</table>

      <h3>${repL('plans', lang, L)}</h3>
      <table><tr><th>${repL('plan', lang, L)}</th><th>${repL('sessions', lang, L)}</th><th>${repL('price', lang, L)}</th><th>${repL('payments', lang, L)}</th><th>${repL('status', lang, L)}</th></tr>
      ${planRows || `<tr><td colspan="5">${empty}</td></tr>`}</table>

      <h3>${repL('payments', lang, L)}</h3>
      <table><tr><th>${repL('date', lang, L)}</th><th>${repL('plan', lang, L)}</th><th>${repL('value', lang, L)}</th><th>${repL('method', lang, L)}</th><th>${repL('notes', lang, L)}</th></tr>
      ${payRows || `<tr><td colspan="5">${empty}</td></tr>`}</table>

      <h3>${repL('visits', lang, L)}</h3>
      <table><tr><th>${repL('date', lang, L)}</th><th>${repL('complaint', lang, L)}</th><th>${repL('treatment', lang, L)}</th><th>${repL('notes', lang, L)}</th></tr>
      ${visitRows || `<tr><td colspan="4">${empty}</td></tr>`}</table>

      <h3>${repL('referrals', lang, L)}</h3>
      <table><tr><th>${repL('date', lang, L)}</th><th>${repL('dest', lang, L)}</th><th>${repL('status', lang, L)}</th><th>${repL('notes', lang, L)}</th></tr>
      ${refRows || `<tr><td colspan="4">${empty}</td></tr>`}</table>
    </div>
    <div class="pdf-footer">${repL('footer', lang, L)} ${new Date().toISOString().slice(0, 10)}</div>`;
}

// PDF export via wkhtmltopdf
app.get('/api/export/patient/:id/pdf', async (req, res) => {
  const p = patientBundle(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const lang = ['pt', 'es', 'en'].includes(req.query.lang) ? req.query.lang : 'pt';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { margin: 16mm 14mm 18mm 14mm; }
    body { font-family: Helvetica, Arial, sans-serif; color: #1a1a2e; font-size: 10pt; }
    .pdf-header { border-bottom: 3px solid #00BFA6; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
    .pdf-header h1 { font-size: 17pt; color: #00BFA6; margin: 0; }
    .pdf-header .sub { font-size: 8.5pt; color: #666; margin-top: 2px; }
    .pdf-header .meta { text-align: right; font-size: 9pt; color: #333; }
    .pdf-content h3 { font-size: 11pt; color: #0d9488; margin: 14px 0 6px; border-left: 3px solid #00BFA6; padding-left: 8px; }
    .pdf-content table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 8.5pt; }
    .pdf-content th { background: #e6fbf7; padding: 4px 6px; text-align: left; font-weight: 700; }
    .pdf-content td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
    .pdf-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 7.5pt; color: #999; border-top: 1px solid #ddd; padding-top: 4px; }
  </style></head><body>${patientReportHtml(p, lang)}</body></html>`;
  try {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ts = Date.now();
    const htmlPath = path.join(tempDir, `exp_${ts}.html`);
    const outPath = path.join(tempDir, `exp_${ts}.pdf`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    await execAsync(`/usr/bin/wkhtmltopdf --encoding utf-8 --page-size A4 --margin-top 5mm --margin-bottom 10mm --margin-left 5mm --margin-right 5mm --enable-local-file-access "${htmlPath}" "${outPath}"`);
    const buf = fs.readFileSync(outPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="podo360-${p.id}-${safeFileName(p)}.pdf"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
    setTimeout(() => { try { fs.unlinkSync(htmlPath); fs.unlinkSync(outPath); } catch(e){} }, 3000);
  } catch (e) {
    console.error('PDF export error:', e.message);
    res.status(500).json({ error: 'PDF generation failed: ' + e.message });
  }
});

// DOCX export via pandoc (HTML → .docx)
app.get('/api/export/patient/:id/doc', async (req, res) => {
  const p = patientBundle(req.params.id);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const lang = ['pt', 'es', 'en'].includes(req.query.lang) ? req.query.lang : 'pt';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${patientReportHtml(p, lang)}</body></html>`;
  try {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ts = Date.now();
    const htmlPath = path.join(tempDir, `exp_${ts}.html`);
    const outPath = path.join(tempDir, `exp_${ts}.docx`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    await execAsync(`pandoc "${htmlPath}" -o "${outPath}"`);
    const buf = fs.readFileSync(outPath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="podo360-${p.id}-${safeFileName(p)}.docx"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
    setTimeout(() => { try { fs.unlinkSync(htmlPath); fs.unlinkSync(outPath); } catch(e){} }, 3000);
  } catch (e) {
    console.error('DOCX export error:', e.message);
    res.status(500).json({ error: 'DOCX generation failed: ' + e.message });
  }
});

// ── Consents ──
app.post('/api/consents', (req, res) => {
  const b = req.body || {};
  if (!b.patient_id || !b.type) return res.status(400).json({ error: 'patient_id and type required' });
  const r = db.prepare(`INSERT INTO consents (patient_id, type, version, signed_at, signature, professional, content)
    VALUES (?,?,?,?,?,?,?)`).run(
    b.patient_id, b.type, b.version || '1.0', b.signed_at || new Date().toISOString(), b.signature || null, b.professional || null, b.content || null);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title) VALUES (?,?,?)`)
    .run(b.patient_id, 'consent', `Consentimento assinado: ${b.type}`);
  res.json({ id: r.lastInsertRowid });
});

// ── Appointments ──
app.get('/api/appointments', (req, res) => {
  const { professional, from, to } = req.query;
  let sql = `SELECT a.*, p.full_name FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id WHERE 1=1`;
  const args = [];
  if (professional) { sql += ` AND a.professional = ?`; args.push(professional); }
  if (from) { sql += ` AND a.start_at >= ?`; args.push(from); }
  if (to) { sql += ` AND a.start_at < ?`; args.push(to); }
  sql += ` ORDER BY a.start_at ASC LIMIT 500`;
  const rows = db.prepare(sql).all(...args);
  res.json(rows);
});
app.post('/api/appointments', (req, res) => {
  const b = req.body || {};
  if (!b.start_at) return res.status(400).json({ error: 'start_at required' });
  // Conflict check — skip when force=true (admin double-book confirmation)
  if (!b.force) {
    const conflict = db.prepare(`SELECT a.id, a.start_at, a.end_at, p.full_name
      FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.professional=? AND a.start_at=? AND a.status NOT IN ('cancelled')
      LIMIT 1`).get(b.professional, b.start_at);
    if (conflict) return res.status(409).json({
      conflict: true, message: 'Já existe um agendamento neste horário.',
      appointment: conflict
    });
  }
  const r = db.prepare(`INSERT INTO appointments (patient_id, professional, room, start_at, end_at, type, status, notes, reason, service_id, booking_name, booking_phone, booking_email, deposit_required, deposit_amount_usd, deposit_status, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.patient_id || null, b.professional || null, b.room || null, b.start_at,
    b.end_at || null, b.type || 'consulta', b.status || 'confirmed', b.notes || null, b.reason || null,
    b.service_id || null, b.booking_name || null, b.booking_phone || null, b.booking_email || null,
    b.deposit_required ? 1 : 0, b.deposit_amount_usd || null, b.deposit_status || 'none', b.source || 'staff');
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/appointments/:id', (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  // Conflict check — skip when force=true
  if (!b.force) {
    const start_at = b.start_at || cur.start_at;
    const conflict = db.prepare(`SELECT a.id, a.start_at, a.end_at, p.full_name
      FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.id!=? AND a.professional=? AND a.start_at=? AND a.status NOT IN ('cancelled')
      LIMIT 1`).get(req.params.id, b.professional || cur.professional, start_at);
    if (conflict) return res.status(409).json({
      conflict: true, message: 'Já existe um agendamento neste horário.',
      appointment: conflict
    });
  }
  db.prepare(`UPDATE appointments SET status=?, notes=?, start_at=?, end_at=?, type=?, professional=?, service_id=?, deposit_status=?, deposit_required=?, deposit_amount_usd=? WHERE id=?`)
    .run(b.status || cur.status, b.notes !== undefined ? b.notes : cur.notes,
      b.start_at || cur.start_at, b.end_at !== undefined ? b.end_at : cur.end_at,
      b.type !== undefined ? b.type : cur.type, b.professional !== undefined ? b.professional : cur.professional,
      b.service_id !== undefined ? b.service_id : cur.service_id,
      b.deposit_status || cur.deposit_status || 'none',
      b.deposit_required !== undefined ? (b.deposit_required ? 1 : 0) : (cur.deposit_required || 0),
      b.deposit_amount_usd !== undefined ? b.deposit_amount_usd : cur.deposit_amount_usd,
      req.params.id);
  res.json({ ok: true });
});
app.delete('/api/appointments/:id', (req, res) => {
  db.prepare('DELETE FROM appointments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Services (what patients can book) ──
app.get('/api/services', requirePerm('settings'), (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY active DESC, name').all());
});
app.post('/api/services', requirePerm('settings'), (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare('INSERT INTO services (name, duration_min, price_usd, active) VALUES (?,?,?,?)')
    .run(b.name, Number(b.duration_min) || 30, Number(b.price_usd) || 0, b.active === undefined ? 1 : (b.active ? 1 : 0));
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/services/:id', requirePerm('settings'), (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM services WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE services SET name=?, duration_min=?, price_usd=?, active=? WHERE id=?').run(
    b.name || cur.name, Number(b.duration_min) || cur.duration_min, Number(b.price_usd) || cur.price_usd,
    b.active === undefined ? cur.active : (b.active ? 1 : 0), req.params.id);
  res.json({ ok: true });
});
app.delete('/api/services/:id', requirePerm('settings'), (req, res) => {
  db.prepare('DELETE FROM services WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Availability (recurring weekly windows per professional) ──
app.get('/api/availability', requirePerm('settings'), (req, res) => {
  res.json(db.prepare('SELECT * FROM availability ORDER BY professional, dow, start_time').all());
});
app.post('/api/availability', requirePerm('settings'), (req, res) => {
  const b = req.body || {};
  if (b.professional === undefined || b.professional === null || b.professional === '' || b.dow === undefined || !b.start_time || !b.end_time)
    return res.status(400).json({ error: 'professional, dow, start_time, end_time required' });
  const r = db.prepare('INSERT INTO availability (professional, dow, start_time, end_time, active) VALUES (?,?,?,?,?)')
    .run(String(b.professional), Number(b.dow), b.start_time, b.end_time, b.active === undefined ? 1 : (b.active ? 1 : 0));
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/availability/:id', requirePerm('settings'), (req, res) => {
  const b = req.body || {};
  const cur = db.prepare('SELECT * FROM availability WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE availability SET professional=?, dow=?, start_time=?, end_time=?, active=? WHERE id=?').run(
    b.professional !== undefined ? String(b.professional) : cur.professional,
    b.dow !== undefined ? Number(b.dow) : cur.dow,
    b.start_time || cur.start_time, b.end_time || cur.end_time,
    b.active === undefined ? cur.active : (b.active ? 1 : 0), req.params.id);
  res.json({ ok: true });
});
app.delete('/api/availability/:id', requirePerm('settings'), (req, res) => {
  db.prepare('DELETE FROM availability WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Booking settings (single-clinic config stored in settings table) ──
function bookingCfg() {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('booking_%');
  const c = { enabled: 0, clinic_name: '', deposit_usd: 0, reminder_hours: 24, lead_minutes: 60 };
  for (const r of rows) {
    if (r.key === 'booking_enabled') c.enabled = r.value === '1' ? 1 : 0;
    if (r.key === 'booking_clinic_name') c.clinic_name = r.value || '';
    if (r.key === 'booking_deposit_usd') c.deposit_usd = Number(r.value) || 0;
    if (r.key === 'booking_reminder_hours') c.reminder_hours = Number(r.value) || 24;
    if (r.key === 'booking_lead_minutes') c.lead_minutes = Number(r.value) || 60;
  }
  if (!c.clinic_name) { // single source: fall back to the owner's profile company (My Profile → Clínica/Empresa)
    const owner = db.prepare("SELECT company FROM users WHERE role='super_admin' AND status='active' ORDER BY id ASC LIMIT 1").get();
    c.clinic_name = (owner && owner.company) || '';
  }
  return c;
}
function setSetting(key, val) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(val));
}
app.get('/api/booking/config', requirePerm('settings'), (req, res) => {
  res.json(bookingCfg());
});
app.post('/api/booking/config', requirePerm('settings'), (req, res) => {
  const b = req.body || {};
  if (b.enabled !== undefined) setSetting('booking_enabled', b.enabled ? '1' : '0');
  if (b.clinic_name !== undefined) setSetting('booking_clinic_name', String(b.clinic_name).slice(0, 120));
  if (b.deposit_usd !== undefined) setSetting('booking_deposit_usd', Math.max(0, Number(b.deposit_usd) || 0));
  if (b.reminder_hours !== undefined) setSetting('booking_reminder_hours', Math.max(1, Number(b.reminder_hours) || 24));
  if (b.lead_minutes !== undefined) setSetting('booking_lead_minutes', Math.max(0, Number(b.lead_minutes) || 0));
  res.json(bookingCfg());
});

// ── PUBLIC booking (authGate exempts /api/pub/*) ──
function pubProfessionals() {
  // active users with at least one active availability window OR staff-created appointments
  const rows = db.prepare(`SELECT DISTINCT professional FROM availability WHERE active = 1`).all();
  const names = rows.map(r => r.professional).filter(Boolean);
  if (!names.length) return [];
  const q = names.map(() => '?').join(',');
  return db.prepare(`SELECT id, full_name FROM users WHERE status='active' AND full_name IN (${q}) ORDER BY full_name`).all(...names);
}
function pubServices() {
  return db.prepare('SELECT id, name, duration_min, price_usd FROM services WHERE active = 1 ORDER BY name').all();
}
function toLocalSlot(dateStr, hm) {
  // dateStr YYYY-MM-DD (server local), hm HH:MM → local Date
  return new Date(dateStr + 'T' + hm + ':00');
}
function slotKey(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function computeSlots(professional, dateStr, serviceId) {
  const cfg = bookingCfg();
  const date = new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) return [];
  const dow = date.getDay();
  const wins = db.prepare("SELECT * FROM availability WHERE professional = ? AND dow = ? AND active = 1 ORDER BY start_time").all(professional, dow);
  if (!wins.length) return [];
  const svc = serviceId ? db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId) : null;
  const dur = (svc && svc.duration_min) ? svc.duration_min : 30;
  // booked slots that overlap this day
  const dayStart = dateStr + 'T00:00';
  const dayEnd = dateStr + 'T23:59';
  const booked = db.prepare(`SELECT start_at, end_at FROM appointments WHERE professional = ? AND start_at >= ? AND start_at <= ? AND status NOT IN ('cancelled')`).all(professional, dayStart, dayEnd);
  const busy = booked.map(b => [b.start_at, b.end_at || b.start_at]);
  const now = new Date();
  const leadMs = (cfg.lead_minutes || 0) * 60000;
  const out = [];
  for (const w of wins) {
    const [sh, sm] = w.start_time.split(':').map(Number);
    const [eh, em] = w.end_time.split(':').map(Number);
    let cur = new Date(date); cur.setHours(sh, sm, 0, 0);
    const end = new Date(date); end.setHours(eh, em, 0, 0);
    while (cur.getTime() + dur * 60000 <= end.getTime()) {
      const s = slotKey(cur);
      const e = new Date(cur.getTime() + dur * 60000);
      const ek = slotKey(e);
      const overlaps = busy.some(([bs, be]) => s < (be || bs) && (ek) > bs);
      const inPast = cur.getTime() <= now.getTime() + leadMs;
      out.push({ start: s, end: ek, available: !overlaps && !inPast });
      cur = new Date(cur.getTime() + dur * 60000);
    }
  }
  return out;
}
function dateSummary(professional, serviceId, days, startDate) {
  const d = startDate ? new Date(startDate) : new Date();
  d.setHours(0, 0, 0, 0);
  const p2 = n => String(n).padStart(2, '0');
  const key = dd => dd.getFullYear() + '-' + p2(dd.getMonth() + 1) + '-' + p2(dd.getDate());
  const out = [];
  for (let i = 0; i < days; i++) {
    const dd = new Date(d); dd.setDate(d.getDate() + i);
    const k = key(dd);
    const slots = computeSlots(professional, k, serviceId);
    out.push({ date: k, has_slots: slots.length > 0, available_count: slots.filter(s => s.available).length, total_slots: slots.length });
  }
  return out;
}
app.get('/api/pub/booking', (req, res) => {
  const cfg = bookingCfg();
  if (!cfg.enabled) return res.json({ enabled: 0 });
  res.json({
    enabled: 1,
    clinic_name: cfg.clinic_name || 'Podo360',
    deposit_usd: cfg.deposit_usd || 0,
    deposit_required: !!(cfg.deposit_usd > 0 && BILLING_GATEWAY),
    professionals: pubProfessionals(),
    services: pubServices()
  });
});
app.get('/api/pub/booking/slots', (req, res) => {
  const cfg = bookingCfg();
  if (!cfg.enabled) return res.status(403).json({ error: 'Booking disabled' });
  const { professional, date, service_id } = req.query;
  if (!professional || !date) return res.status(400).json({ error: 'professional + date required' });
  const slots = computeSlots(String(professional), String(date), service_id ? Number(service_id) : null);
  res.json({ slots });
});
// 14-day availability summary — lets the public page gray out dates with no availability
app.get('/api/pub/booking/summary', (req, res) => {
  const cfg = bookingCfg();
  if (!cfg.enabled) return res.status(403).json({ error: 'Booking disabled' });
  const { professional, service_id, days, start } = req.query;
  if (!professional) return res.status(400).json({ error: 'professional required' });
  const n = Math.min(31, Math.max(1, Number(days) || 14));
  res.json({ days: dateSummary(String(professional), service_id ? Number(service_id) : null, n, start) });
});
app.post('/api/pub/booking', async (req, res) => {
  const cfg = bookingCfg();
  if (!cfg.enabled) return res.status(403).json({ error: 'Booking disabled' });
  const b = req.body || {};
  const { professional, service_id, start_at, name, phone, email } = b;
  if (!professional || !start_at || !name) return res.status(400).json({ error: 'professional, start_at, name required' });
  const svc = service_id ? db.prepare('SELECT * FROM services WHERE id=?').get(service_id) : null;
  const dur = (svc && svc.duration_min) ? svc.duration_min : 30;
  const end = new Date(new Date(start_at).getTime() + dur * 60000);
  // re-verify the slot is still free
  const clash = db.prepare(`SELECT 1 FROM appointments WHERE professional=? AND start_at=? AND status NOT IN ('cancelled') LIMIT 1`).get(professional, start_at);
  if (clash) return res.status(409).json({ error: 'Slot already taken' });
  // Link or create the patient record — online booking serves BOTH new and current patients.
  // Match by phone (digits-only, tolerant of +55/()/- formatting) then by email (case-insensitive).
  let patientId = null, isNewPatient = false;
  const phoneDigits = (phone || '').replace(/\D/g, '');
  const emailLc = (email || '').trim().toLowerCase();
  if (phoneDigits) {
    const cand = db.prepare('SELECT id, phone FROM patients WHERE phone IS NOT NULL AND phone != \'\'').all().find(p => (p.phone || '').replace(/\D/g, '') === phoneDigits);
    if (cand) patientId = cand.id;
  }
  if (!patientId && emailLc) {
    const cand = db.prepare('SELECT id FROM patients WHERE LOWER(email) = ?').get(emailLc);
    if (cand) patientId = cand.id;
  }
  if (!patientId) {
    const pr = db.prepare(`INSERT INTO patients (full_name, phone, email, status) VALUES (?,?,?, 'active')`)
      .run(String(name).slice(0, 200), phone || null, emailLc || null);
    patientId = Number(pr.lastInsertRowid);
    isNewPatient = true;
  }
  const token = require('crypto').randomBytes(12).toString('hex');
  const deposit = cfg.deposit_usd > 0 && BILLING_GATEWAY;
  const status = deposit ? 'waitlist' : 'confirmed';
  const r = db.prepare(`INSERT INTO appointments (patient_id, professional, start_at, end_at, type, status, notes, service_id, booking_token, booking_name, booking_phone, booking_email, deposit_required, deposit_amount_usd, deposit_status, source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    patientId, String(professional), start_at, slotKey(end), svc ? svc.name : 'consulta', status,
    `Agendamento online · ${name}${phone ? ' · ' + phone : ''}`, service_id || null,
    token, name, phone || null, emailLc || null,
    deposit ? 1 : 0, deposit ? cfg.deposit_usd : null, deposit ? 'pending' : 'none', 'online');
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(patientId, 'followup', 'Agendamento online', `${name}${phone ? ' · ' + phone : ''} — ${start_at}`);
  // notify via WhatsApp if configured (confirmation to patient happens after deposit or immediately)
  if (status === 'confirmed') {
    const wa = whatsappCfg();
    if (wa.enabled && wa.template_confirm && phone) {
      try {
        await waSend(wa, phone, wa.template_confirm, [{ type: 'text', text: name }]);
      } catch (e) { console.error('[wa] confirm send failed:', e.message); }
    }
  }
  res.json({ token, id: r.lastInsertRowid, status, patient_id: patientId, is_new_patient: isNewPatient, deposit_required: deposit, deposit_usd: deposit ? cfg.deposit_usd : 0 });
});
app.get('/api/pub/booking/:token', (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE booking_token = ?').get(req.params.token);
  if (!a) return res.status(404).json({ error: 'Booking not found' });
  res.json({
    id: a.id, status: a.status, start_at: a.start_at, end_at: a.end_at,
    professional: a.professional, type: a.type, booking_name: a.booking_name,
    patient_id: a.patient_id,
    deposit_required: !!a.deposit_required, deposit_status: a.deposit_status, deposit_usd: a.deposit_amount_usd,
    deposit_payable: !!a.deposit_required && a.deposit_status === 'pending' && BILLING_GATEWAY === 'stripe'
  });
});
app.post('/api/pub/booking/:token/cancel', (req, res) => {
  const a = db.prepare('SELECT * FROM appointments WHERE booking_token = ?').get(req.params.token);
  if (!a) return res.status(404).json({ error: 'Booking not found' });
  db.prepare(`UPDATE appointments SET status='cancelled' WHERE id=?`).run(a.id);
  res.json({ ok: true, status: 'cancelled' });
});
// .ics calendar export — download appointment as iCal file
app.get('/api/pub/booking/:token/ics', (req, res) => {
  const a = db.prepare(`SELECT a.*, p.full_name AS patient_name, s.name AS service_name
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.booking_token = ?`).get(req.params.token);
  if (!a) return res.status(404).json({ error: 'Booking not found' });
  const cfg = bookingCfg();
  const clinicName = cfg.clinic_name || 'Podo360';
  const start = new Date(a.start_at);
  const end = new Date(a.end_at || a.start_at);
  const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const summary = (a.service_name || 'Consulta') + ' - ' + clinicName;
  const desc = (a.booking_name || a.patient_name || 'Paciente') + (a.professional ? ' com ' + a.professional : '');
  const uid = 'podo360-' + a.id + '@' + (cfg.clinic_name || 'podo360').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Podo360//Booking//' + (cfg.locale || 'PT'),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + uid,
    'DTSTART:' + fmt(start),
    'DTEND:' + fmt(end),
    'SUMMARY:' + summary,
    'DESCRIPTION:' + desc,
    'LOCATION:' + clinicName,
    'STATUS:' + (a.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'),
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="consulta-podo360.ics"');
  res.send(ics);
});
// Deposit payment (Stripe PaymentIntent, USD) — config-gated
app.post('/api/pub/booking/:token/pay', async (req, res) => {
  if (BILLING_GATEWAY !== 'stripe') return res.status(503).json({ error: 'Online payment not configured' });
  const a = db.prepare('SELECT * FROM appointments WHERE booking_token = ?').get(req.params.token);
  if (!a) return res.status(404).json({ error: 'Booking not found' });
  if (!a.deposit_required || a.deposit_status === 'paid') return res.status(400).json({ error: 'No deposit due' });
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const pi = await stripe.paymentIntents.create({
      amount: Math.round((a.deposit_amount_usd || 0) * 100),
      currency: 'usd',
      metadata: { appt_id: String(a.id), booking_token: a.booking_token, kind: 'podo360_booking_deposit' },
      automatic_payment_methods: { enabled: true }
    });
    res.json({ client_secret: pi.client_secret, amount_usd: a.deposit_amount_usd });
  } catch (e) {
    res.status(500).json({ error: 'Payment init failed: ' + e.message });
  }
});
// Stripe webhook (public — verifies signature when key set)
app.post('/api/stripe/webhook', async (req, res) => {
  if (BILLING_GATEWAY !== 'stripe') return res.status(503).json({ error: 'Not configured' });
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const evt = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
    if (evt.type === 'payment_intent.succeeded') {
      const meta = (evt.data.object.metadata) || {};
      if (meta.kind === 'podo360_booking_deposit' && meta.appt_id) {
        db.prepare(`UPDATE appointments SET deposit_status='paid', status='confirmed' WHERE id=?`).run(Number(meta.appt_id));
        const a = db.prepare('SELECT * FROM appointments WHERE id=?').get(Number(meta.appt_id));
        if (a && a.booking_phone) {
          const wa = whatsappCfg();
          if (wa.enabled && wa.template_confirm) {
            try { await waSend(wa, a.booking_phone, wa.template_confirm, [{ type: 'text', text: a.booking_name || '' }]); } catch (e) { console.error('[wa] confirm failed:', e.message); }
          }
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ error: 'Webhook error: ' + e.message });
  }
});

// ── WhatsApp (Meta Cloud API) — config-gated, official API ──
function whatsappCfg() {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('whatsapp_%');
  const c = { enabled: 0, token: '', phone_id: '', reminder_hours: 24, template_reminder: '', template_confirm: '', test_to: '', followup_days: 7, followup_cooldown: 14, template_followup: '', template_recall: '' };
  for (const r of rows) {
    if (r.key === 'whatsapp_enabled') c.enabled = r.value === '1' ? 1 : 0;
    if (r.key === 'whatsapp_token') c.token = r.value || '';
    if (r.key === 'whatsapp_phone_id') c.phone_id = r.value || '';
    if (r.key === 'whatsapp_reminder_hours') c.reminder_hours = Number(r.value) || 24;
    if (r.key === 'whatsapp_template_reminder') c.template_reminder = r.value || '';
    if (r.key === 'whatsapp_template_confirm') c.template_confirm = r.value || '';
    if (r.key === 'whatsapp_test_to') c.test_to = r.value || '';
    if (r.key === 'whatsapp_followup_days') c.followup_days = Number(r.value) || 7;
    if (r.key === 'whatsapp_followup_cooldown') c.followup_cooldown = Number(r.value) || 14;
    if (r.key === 'whatsapp_template_followup') c.template_followup = r.value || '';
    if (r.key === 'whatsapp_template_recall') c.template_recall = r.value || '';
  }
  return c;
}
async function waSend(cfg, to, templateName, components) {
  const url = `https://graph.facebook.com/v21.0/${cfg.phone_id}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: String(to).replace(/[^\d]/g, ''),
    type: 'template',
    template: { name: templateName, language: { code: 'pt_BR' }, components: components && components.length ? [{ type: 'body', parameters: components }] : undefined }
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Meta ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r.json();
}
async function runWhatsAppReminders() {
  const cfg = whatsappCfg();
  if (!cfg.enabled || !cfg.token || !cfg.phone_id || !cfg.template_reminder) return { sent: 0, skipped: 'not configured' };
  const now = new Date();
  const until = new Date(now.getTime() + (cfg.reminder_hours || 24) * 3600000);
  const rows = db.prepare(`SELECT * FROM appointments WHERE status='confirmed' AND reminder_sent=0 AND booking_phone IS NOT NULL AND booking_phone != '' AND start_at > ? AND start_at <= ?`).all(
    now.toISOString(), until.toISOString());
  let sent = 0;
  for (const a of rows) {
    const when = new Date(a.start_at);
    const d = when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const t = when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    try {
      await waSend(cfg, a.booking_phone, cfg.template_reminder, [
        { type: 'text', text: a.booking_name || '' },
        { type: 'text', text: `${d} às ${t}` }
      ]);
      db.prepare(`UPDATE appointments SET reminder_sent=1 WHERE id=?`).run(a.id);
      sent++;
    } catch (e) {
      console.error('[wa] reminder failed for appt ' + a.id + ':', e.message);
    }
  }
  return { sent };
}
async function runWhatsAppFollowUps() {
  const cfg = whatsappCfg();
  if (!cfg.enabled || !cfg.token || !cfg.phone_id) return { sent: 0, skipped: 'not configured' };
  const cooldown = cfg.followup_cooldown || 14;
  const cutoff = new Date(Date.now() - cooldown * 864e5).toISOString();
  const quiet = `(p.followup_sent_at IS NULL OR p.followup_sent_at < ?)`;
  let sent = 0;
  // 1) Post-visit follow-ups: patient had a visit in the last N days → check-in template
  if (cfg.template_followup) {
    const since = new Date(Date.now() - (cfg.followup_days || 7) * 864e5).toISOString().slice(0, 10);
    const rows = db.prepare(`SELECT DISTINCT p.id, p.full_name, p.phone FROM patients p
      JOIN visits v ON v.patient_id = p.id
      WHERE p.phone IS NOT NULL AND p.phone != '' AND v.visit_date >= ? AND ${quiet}`).all(since, cutoff);
    for (const p of rows) {
      try {
        await waSend(cfg, p.phone, cfg.template_followup, [{ type: 'text', text: p.full_name || '' }]);
        db.prepare('UPDATE patients SET followup_sent_at = ? WHERE id = ?').run(new Date().toISOString(), p.id);
        sent++;
      } catch (e) { console.error('[wa] followup failed for patient ' + p.id + ':', e.message); }
    }
  }
  // 2) Overdue recalls: patient is overdue / follow-up due → return-visit template
  if (cfg.template_recall) {
    const rows = db.prepare(`SELECT p.id, p.full_name, p.phone FROM patients p
      WHERE p.status IN ('overdue','follow_up_due') AND p.phone IS NOT NULL AND p.phone != '' AND ${quiet}`).all(cutoff);
    for (const p of rows) {
      try {
        await waSend(cfg, p.phone, cfg.template_recall, [{ type: 'text', text: p.full_name || '' }]);
        db.prepare('UPDATE patients SET followup_sent_at = ? WHERE id = ?').run(new Date().toISOString(), p.id);
        sent++;
      } catch (e) { console.error('[wa] recall failed for patient ' + p.id + ':', e.message); }
    }
  }
  return { sent };
}
async function runWhatsAppAll() {
  const reminders = await runWhatsAppReminders();
  const followups = await runWhatsAppFollowUps();
  return { reminders, followups };
}
app.get('/api/whatsapp/config', requirePerm('settings'), (req, res) => {
  res.json({ ...whatsappCfg(), token: whatsappCfg().token ? '•••' + whatsappCfg().token.slice(-4) : '', token_set: !!whatsappCfg().token });
});
app.post('/api/whatsapp/config', requirePerm('settings'), (req, res) => {
  const b = req.body || {};
  const cur = whatsappCfg();
  if (b.enabled !== undefined) setSetting('whatsapp_enabled', b.enabled ? '1' : '0');
  if (b.token !== undefined) setSetting('whatsapp_token', b.token ? String(b.token).trim() : cur.token);
  if (b.phone_id !== undefined) setSetting('whatsapp_phone_id', String(b.phone_id).trim());
  if (b.reminder_hours !== undefined) setSetting('whatsapp_reminder_hours', Math.max(1, Number(b.reminder_hours) || 24));
  if (b.template_reminder !== undefined) setSetting('whatsapp_template_reminder', String(b.template_reminder).trim());
  if (b.template_confirm !== undefined) setSetting('whatsapp_template_confirm', String(b.template_confirm).trim());
  if (b.test_to !== undefined) setSetting('whatsapp_test_to', String(b.test_to).trim());
  if (b.followup_days !== undefined) setSetting('whatsapp_followup_days', Math.max(1, Number(b.followup_days) || 7));
  if (b.followup_cooldown !== undefined) setSetting('whatsapp_followup_cooldown', Math.max(1, Number(b.followup_cooldown) || 14));
  if (b.template_followup !== undefined) setSetting('whatsapp_template_followup', String(b.template_followup).trim());
  if (b.template_recall !== undefined) setSetting('whatsapp_template_recall', String(b.template_recall).trim());
  res.json({ ok: true });
});
app.post('/api/whatsapp/test', requirePerm('settings'), async (req, res) => {
  const cfg = whatsappCfg();
  if (!cfg.enabled || !cfg.token || !cfg.phone_id) return res.status(400).json({ error: 'WhatsApp not configured' });
  const to = req.body?.to || cfg.test_to;
  if (!to) return res.status(400).json({ error: 'test_to not set' });
  if (!cfg.template_confirm) return res.status(400).json({ error: 'template_confirm not set' });
  try {
    await waSend(cfg, to, cfg.template_confirm, [{ type: 'text', text: 'Teste Podo360' }]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/whatsapp/run', requirePerm('settings'), async (req, res) => {
  const r = await runWhatsAppAll();
  res.json(r);
});
// Meta webhook verification (GET) + delivery events (POST)
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const vtok = db.prepare("SELECT value FROM settings WHERE key='whatsapp_verify_token'").get()?.value;
  if (mode === 'subscribe' && vtok && token === vtok) return res.send(challenge);
  return res.status(403).send('Forbidden');
});
app.post('/api/whatsapp/webhook', (req, res) => {
  res.json({ received: true }); // delivery receipts logged elsewhere; templates are business-initiated
});
// Reminder + follow-up loop — every 5 minutes, cheap no-op when disabled
setInterval(() => { runWhatsAppAll().catch(() => {}); }, 5 * 60000).unref();

// ── Professionals (active users) — for the booking dropdown + patients-per-provider ──
app.get('/api/professionals', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT id, full_name FROM users WHERE status = 'active' ORDER BY full_name`).all();
  res.json(rows);
});

// ── Claims (insurance / convênio) — capture denial reasons at the source ──
app.get('/api/patients/:id/claims', (req, res) => {
  const rows = db.prepare('SELECT * FROM claims WHERE patient_id = ? ORDER BY created_at DESC').all(Number(req.params.id));
  res.json(rows);
});
app.post('/api/patients/:id/claims', (req, res) => {
  const b = req.body || {};
  const pid = Number(req.params.id);
  const p = db.prepare('SELECT id FROM patients WHERE id = ?').get(pid);
  if (!p) return res.status(404).json({ error: 'Patient not found' });
  const paidAt = b.paid_at || (b.claim_status === 'paid' ? new Date().toISOString().slice(0, 10) : null);
  const r = db.prepare(`INSERT INTO claims (patient_id, visit_id, insurer, claim_status, denial_reason, amount, submitted_at, paid_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    pid, b.visit_id || null, b.insurer || null, b.claim_status || 'submitted',
    b.denial_reason || null, Number(b.amount) || 0, b.submitted_at || new Date().toISOString().slice(0, 10), paidAt);
  db.prepare(`INSERT INTO timeline_events (patient_id, kind, title, detail) VALUES (?,?,?,?)`)
    .run(pid, 'followup', 'Faturamento registrado', b.insurer ? `Convênio: ${b.insurer} (${b.claim_status || 'submitted'})` : 'Registro de faturamento');
  res.json({ id: r.lastInsertRowid });
});
app.put('/api/claims/:id', (req, res) => {
  const b = req.body || {};
  const c = db.prepare('SELECT * FROM claims WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Claim not found' });
  let paidAt = b.paid_at !== undefined ? b.paid_at : c.paid_at;
  if (b.claim_status === 'paid' && !paidAt) paidAt = new Date().toISOString().slice(0, 10);
  db.prepare(`UPDATE claims SET claim_status=?, denial_reason=?, amount=?, paid_at=? WHERE id=?`).run(
    b.claim_status || c.claim_status, b.denial_reason !== undefined ? b.denial_reason : c.denial_reason,
    b.amount !== undefined ? (Number(b.amount) || 0) : c.amount, paidAt, c.id);
  res.json({ ok: true });
});
app.delete('/api/claims/:id', (req, res) => {
  db.prepare('DELETE FROM claims WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── AI endpoints ──
// requirePerm('ai') blocks front-desk users (reception has no AI access);
// aiQuota('assessment') enforces the monthly cap (marketing: "10–15 avaliações/mês"
// for Essencial). Deterministic local algorithms — free to run, but the cap is
// the product's tier promise.
app.get('/api/ai/:patientId/pre-assessment', requirePerm('ai'), aiQuota('assessment'), (req, res) => {
  const r = ai.preAssessment(req.params.patientId, req.query.lang || 'pt');
  if (!r) return res.status(404).json({ error: 'Patient not found' });
  const content = JSON.stringify(r);
  // Only persist when the report actually changed — viewing must not duplicate rows.
  const latest = db.prepare('SELECT content FROM ai_reports WHERE patient_id=? AND kind=? ORDER BY id DESC LIMIT 1')
    .get(req.params.patientId, 'pre_assessment');
  if (!latest || latest.content !== content) {
    db.prepare(`INSERT INTO ai_reports (patient_id, kind, content, based_on) VALUES (?,?,?,?)`)
      .run(req.params.patientId, 'pre_assessment', content, 'Dados documentados do paciente');
  }
  res.json(r);
});
app.get('/api/ai/:patientId/progress', requirePerm('ai'), aiQuota('assessment'), (req, res) => {
  const r = ai.progressAnalysis(req.params.patientId, req.query.condition_id, req.query.lang || 'pt');
  if (!r) return res.status(404).json({ error: 'Patient not found' });
  res.json(r);
});
app.get('/api/ai/:patientId/projection', requirePerm('ai'), aiQuota('assessment'), (req, res) => {
  const r = ai.projection(req.params.patientId, req.query.condition_id, req.query.lang || 'pt');
  if (!r) return res.status(404).json({ error: 'Patient not found' });
  res.json(r);
});
app.get('/api/ai/:patientId/timeline', requirePerm('ai'), aiQuota('assessment'), (req, res) => {
  const r = ai.clinicalTimeline(req.params.patientId, req.query.lang || 'pt');
  if (!r) return res.status(404).json({ error: 'Patient not found' });
  res.json(r);
});
// Full-patient AI course of treatment — reviews conditions, vitals, visits,
// exams and foot-map pins + descriptions, then proposes a consolidated course.
app.get('/api/ai/:patientId/treatment-course', requirePerm('ai'), aiQuota('assessment'), (req, res) => {
  const lang = (req.headers['x-lang'] || req.query.lang || 'pt') === 'en' ? 'en' : (req.headers['x-lang'] || req.query.lang || 'pt') === 'es' ? 'es' : 'pt';
  const r = ai.treatmentCourse(req.params.patientId, lang);
  if (!r) return res.status(404).json({ error: 'Patient not found' });
  res.json(r);
});

// ── Bot FAQ (chatbot §37 — real DeepSeek with FAQ fallback) ──
// requirePerm('ai') + aiQuota('chat') caps real LLM spend per month per plan.
app.post('/api/bot', requirePerm('ai'), aiQuota('chat'), async (req, res) => {
  const r = await assistant.chat(req.body || {});
  res.json(r);
});

// Assistant config status (frontend badge)
app.get('/api/assistant/status', (req, res) => {
  res.json({ connected: !!process.env.DEEPSEEK_API_KEY, provider: 'deepseek', model: 'deepseek-chat' });
});

// ── Foot model upload (replaces public/foot-right.gltf) ──
const FOOT_TOKEN = process.env.FOOT_TOKEN || 'podofoot';
app.post('/api/upload-foot', express.raw({ type: ['application/octet-stream', 'application/json'], limit: '10mb' }), (req, res) => {
  if (req.get('x-foot-token') !== FOOT_TOKEN) return res.status(401).json({ error: 'bad token' });
  try {
    const gltf = JSON.parse(req.body.toString('utf8'));
    if (!gltf || gltf.asset?.version !== '2.0' || !Array.isArray(gltf.meshes) || !Array.isArray(gltf.buffers))
      return res.status(400).json({ error: 'not a valid glTF 2.0 document' });
    const regions = gltf.meshes.flatMap(m => m.primitives?.map(p => p.extras?.region)).filter(Boolean);
    const missing = ['hallux', 'lesser_toes', 'metatarsal_heads', 'dorsum_forefoot', 'medial_arch', 'medial_border', 'lateral_border', 'dorsum_midfoot', 'heel_plantar', 'achilles_heel', 'medial_malleolus', 'lateral_malleolus', 'ankle_anterior', 'lower_leg'].filter(r => !regions.includes(r));
    if (missing.length) return res.status(400).json({ error: 'missing regions: ' + missing.join(', ') });
    const target = path.join(__dirname, 'public', 'foot-right.gltf');
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(gltf));
    fs.renameSync(tmp, target);
    res.json({ ok: true, regions: regions.length, bytes: Buffer.byteLength(JSON.stringify(gltf)), note: 'model replaced — refresh foot-model.html' });
  } catch (e) {
    res.status(400).json({ error: 'parse failed: ' + e.message });
  }
});

// ── Settings ──
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

// ── Auth (login / register / Google) ──
const SESSION_DAYS = 30;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}
function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token);
  return row || null;
}
const SESSION_COOKIE = 'podo360_session';
function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: SESSION_DAYS * 864e5, path: '/' });
}
function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
function tokenFromReq(req) {
  return (req.headers.authorization || '').replace('Bearer ', '') || (req.cookies && req.cookies[SESSION_COOKIE]) || '';
}
function publicUser(u) {
  if (!u) return null;
  return { id: u.id, full_name: u.full_name, email: u.email, avatar: u.avatar || null, google: !!u.google_sub, role: u.role || 'user', status: u.status || 'active', plan: u.plan || 'Professional', analytics_access: !!u.analytics_access, company: u.company || null, phone: u.phone || null, created_at: u.created_at, last_login: u.last_login || null };
}

function requireAuth(req, res, next) {
  const u = userFromToken(tokenFromReq(req));
  if (!u) return res.status(401).json({ error: L(req, 'unauth') });
  if (u.status && u.status === 'pending') return res.status(403).json({ error: L(req, 'pendingApproval') });
  if (u.status && u.status === 'rejected') return res.status(403).json({ error: L(req, 'rejectedAccount') });
  if (u.status && u.status !== 'active') return res.status(403).json({ error: L(req, 'paused') });
  req.user = u;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: L(req, 'adminOnly') });
    next();
  });
}
// User management access: super_admin (everything) + admin (clinic manager).
// The HANDLERS still restrict what an admin may do (no creating/promoting
// admins or super_admins, no touching other admin accounts).
function requireUserManager(req, res, next) {
  requireAuth(req, res, () => {
    if (!canRole(req.user.role, 'users')) return res.status(403).json({ error: L(req, 'adminOnly') });
    next();
  });
}
// An admin-role actor may only touch non-admin users; super_admin may touch all.
function canManageTarget(actor, target) {
  if (actor.role === 'super_admin') return true;
  return !['super_admin', 'admin'].includes(target.role);
}
function recordLogin(userId, req, method) {
  try {
    db.prepare('INSERT INTO login_history (user_id, ip, user_agent, method) VALUES (?,?,?,?)')
      .run(userId, (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), String(req.headers['user-agent'] || '').slice(0, 300), method);
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId);
  } catch (e) { /* non-fatal */ }
}

// Register: full_name, email, password (min 6 chars)
// New accounts are created with status='pending' — they cannot log in until a
// super admin approves them from the Users panel.
app.post('/api/auth/register', (req, res) => {
  const { full_name, email, password } = req.body || {};
  if (!full_name || !email || !password) return res.status(400).json({ error: L(req, 'regRequired') });
  if (String(password).length < 6) return res.status(400).json({ error: L(req, 'pwShort') });
  const em = String(email).trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(em);
  if (exists) return res.status(409).json({ error: L(req, 'emailExists') });
  const info = db.prepare('INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?,?,?,?,?)')
    .run(String(full_name).trim(), em, hashPassword(String(password)), 'user', 'pending');
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  // No session issued — account must be approved first.
  res.json({ pending: true, message: L(req, 'pendingApproval'), user: publicUser(u) });
});

// Login: email + password
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: L(req, 'loginReq') });
  const em = String(email).trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(em);
  if (!u || !verifyPassword(String(password), u.password_hash)) {
    return res.status(401).json({ error: L(req, 'badLogin') });
  }
  if (u.status && u.status === 'pending') return res.status(403).json({ error: L(req, 'pendingApproval') });
  if (u.status && u.status === 'rejected') return res.status(403).json({ error: L(req, 'rejectedAccount') });
  if (u.status && u.status !== 'active') return res.status(403).json({ error: L(req, 'paused') });
  const token = createSession(u.id);
  recordLogin(u.id, req, 'password');
  setSessionCookie(res, token);
  res.json({ token, user: publicUser(u) });
});

// Validate token → current user (Bearer header OR session cookie)
app.get('/api/auth/me', (req, res) => {
  const u = userFromToken(tokenFromReq(req));
  if (!u) return res.status(401).json({ error: L(req, 'unauth') });
  // token echoed back so the client can persist it after a cookie-authenticated reload
  res.json({ user: publicUser(u), token: tokenFromReq(req) });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = tokenFromReq(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Google login config status (client id present = flow available)
app.get('/api/auth/google-config', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null, configured: !!process.env.GOOGLE_CLIENT_ID });
});

// Google credential exchange (token from Google Identity Services)
// Verifies the JWT signature/issuer offline with built-in crypto (no SDK deps).
app.post('/api/auth/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(501).json({ error: L(req, 'googleNotCfg') });
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: L(req, 'credMissing') });
  try {
    const [h, p, s] = credential.split('.');
    if (!h || !p || !s) throw new Error('malformed');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (payload.aud !== clientId) throw new Error('aud mismatch');
    if (payload.exp * 1000 < Date.now()) throw new Error('expired');
    if (header.alg !== 'RS256') throw new Error('alg');
    // Google JWKS verification via fetch (cached 1h)
    const jwks = await (global.__googleJwks || (global.__googleJwks = fetch('https://www.googleapis.com/oauth2/v3/certs').then(r => r.json())));
    const key = jwks.keys.find(k => k.kid === header.kid);
    if (!key) throw new Error('kid not found');
    // Build the public key directly from JWK (native Node support) — no manual PEM
    const publicKey = crypto.createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.write(h + '.' + p);
    verifier.end();
    const ok = verifier.verify(publicKey, Buffer.from(s, 'base64url'));
    if (!ok) throw new Error('bad signature');
    let email = payload.email, name = payload.name || email.split('@')[0], sub = payload.sub;
    let u = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub);
    if (!u) {
      u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (u) { db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(sub, u.id); }
      else {
        const info = db.prepare('INSERT INTO users (full_name, email, google_sub, role, status) VALUES (?,?,?,?,?)').run(name, email, sub, 'user', 'pending');
        u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
      }
    }
    if (u.status && u.status === 'pending') return res.status(403).json({ error: L(req, 'pendingApproval') });
    if (u.status && u.status === 'rejected') return res.status(403).json({ error: L(req, 'rejectedAccount') });
    if (u.status && u.status !== 'active') return res.status(403).json({ error: L(req, 'paused') });
    const token = createSession(u.id);
    recordLogin(u.id, req, 'google');
    setSessionCookie(res, token);
    res.json({ token, user: publicUser(u) });
  } catch (e) {
    res.status(401).json({ error: L(req, 'googleBad') + e.message });
  }
});

// ── Self profile: edit own data + change password ──
// Plan upgrade REQUEST: emails jason@velda.ai (customer wants a different
// plan). Does NOT change the plan — approval happens in the admin Users panel.
app.post('/api/profile/plan-request', requireAuth, async (req, res) => {
  const u = req.user;
  const b = req.body || {};
  const want = String(b.plan || '').trim();
  const PUBLIC_PLANS = ['Essencial', 'Professional', 'Clinic'];
  if (!PUBLIC_PLANS.includes(want)) return res.status(400).json({ error: 'invalid plan' });
  try {
    const { sendPlanRequest } = require('./contact-mailer');
    await sendPlanRequest({
      name: u.full_name, email: u.email, company: u.company,
      currentPlan: u.plan || 'Professional', requestedPlan: want
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'mail-failed', detail: String(e.message).slice(0, 200) });
  }
});

// ── Billing (2026-08-19 scaffold) ──
// No gateway is wired yet (STRIPE_SECRET_KEY / ASAAS_API_KEY unset). This
// exposes status + checkout/webhook plumbing so the moment keys exist the
// product is live; frontend CTA checks /api/billing/status first.
const BILLING_GATEWAY = process.env.STRIPE_SECRET_KEY ? 'stripe'
  : process.env.ASAAS_API_KEY ? 'asaas' : null;

app.get('/api/billing/status', requireAuth, (req, res) => {
  const u = req.user;
  const limits = planLimits(u.plan || DEFAULT_PLAN);
  const period = currentPeriod();
  const usageRow = db.prepare('SELECT kind, count FROM ai_usage WHERE user_id=? AND period=?').all(u.id, period);
  const usage = { assessment: 0, chat: 0 };
  usageRow.forEach(r => { usage[r.kind] = r.count; });
  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id=? ORDER BY id DESC LIMIT 1').get(u.id);
  res.json({
    configured: !!BILLING_GATEWAY,
    gateway: BILLING_GATEWAY,
    plan: u.plan || DEFAULT_PLAN,
    limits,
    usage,
    subscription: sub || null,
    prices: { Essencial: 29.99, Professional: 49.99, Clinic: 99.99, extraSeat: 14.99 }
  });
});

// Create a checkout/signup intent. With no gateway configured, returns a
// clear 503 so the UI can route to the contact/quote form instead of failing.
app.post('/api/billing/checkout', requireAuth, async (req, res) => {
  const u = req.user;
  const b = req.body || {};
  const want = String(b.plan || '').trim();
  const PUBLIC_PLANS = ['Essencial', 'Professional', 'Clinic'];
  if (!PUBLIC_PLANS.includes(want)) return res.status(400).json({ error: 'invalid plan' });
  const price = { Essencial: 29.99, Professional: 49.99, Clinic: 99.99 }[want];
  const seats = Number(b.seats) || 1;
  const extraSeats = want === 'Clinic' ? Math.max(0, seats - 1) : 0;
  const totalUsd = price + extraSeats * 14.99;
  if (!BILLING_GATEWAY) {
    return res.status(503).json({
      error: 'billing-not-configured',
      message: { pt: 'Pagamento online em breve — use o formulário de contato para assinar.', es: 'Pago en línea próximamente — usa el formulario de contacto.', en: 'Online payment coming soon — use the contact form to subscribe.' }[req.get('x-lang') || 'pt'],
      requestedPlan: want, priceUsd: totalUsd
    });
  }
  // Stripe checkout (guarded — only reachable when STRIPE_SECRET_KEY set).
  try {
    if (BILLING_GATEWAY === 'stripe') {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: u.email,
        line_items: [{ price_data: { currency: 'usd', unit_amount: Math.round(totalUsd * 100), recurring: { interval: 'month' } }, quantity: 1 }],
        metadata: { userId: String(u.id), plan: want, seats: String(seats) },
        success_url: process.env.APP_BASE_URL + '/app?billing=success',
        cancel_url: process.env.APP_BASE_URL + '/app?billing=cancel'
      });
      return res.json({ ok: true, checkoutUrl: session.url, gateway: 'stripe' });
    }
    if (BILLING_GATEWAY === 'asaas') {
      // Asaas subscription creation — implement when API key is set.
      return res.status(501).json({ error: 'asaas-not-implemented' });
    }
    res.status(503).json({ error: 'billing-not-configured' });
  } catch (e) {
    res.status(500).json({ error: 'checkout-failed', detail: String(e.message).slice(0, 200) });
  }
});

// Webhook receiver (stripe + asaas share this path; verify per gateway).
// With no gateway configured we never register webhooks, so this is dormant.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!BILLING_GATEWAY) return res.status(400).json({ error: 'billing-not-configured' });
  res.status(501).json({ error: 'webhook-handler-not-implemented' });
});

// Manual subscription record — used by admins when a customer pays offline
// (PIX/transfer) or when Jason manually grants a plan. Keeps the billing
// picture honest until the gateway is live.
app.post('/api/billing/subscriptions', requireUserManager, (req, res) => {
  const b = req.body || {};
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(b.user_id));
  if (!target) return res.status(404).json({ error: L(req, 'userNotFound') });
  if (!canManageTarget(req.user, target)) return res.status(403).json({ error: L(req, 'adminOnly') });
  const plan = ['Essencial', 'Professional', 'Clinic'].includes(b.plan) ? b.plan : null;
  if (!plan) return res.status(400).json({ error: 'invalid plan' });
  const seats = Math.max(1, Number(b.seats) || 1);
  const r = db.prepare(`INSERT INTO subscriptions (user_id, plan, gateway, gateway_sub, status, seats, price_usd, period_start, period_end)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
      target.id, plan, b.gateway || 'manual', b.gateway_sub || null,
      ['active', 'past_due', 'canceled', 'trialing'].includes(b.status) ? b.status : 'active',
      seats, Number(b.price_usd) || null,
      b.period_start || null, b.period_end || null
    );
  // Applying a manual subscription updates the user's plan + seat allowance.
  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, target.id);
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.put('/api/auth/profile', requireAuth, (req, res) => {
  const u = req.user;
  const { full_name, email, phone, company, address, old_password, new_password } = req.body || {};
  try {
    if (full_name !== undefined) {
      if (!String(full_name).trim()) return res.status(400).json({ error: L(req, 'nameEmpty') });
      db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(String(full_name).trim(), u.id);
    }
    if (email !== undefined) {
      const em = String(email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return res.status(400).json({ error: L(req, 'emailBad') });
      const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(em, u.id);
      if (dup) return res.status(409).json({ error: L(req, 'emailTaken') });
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(em, u.id);
    }
    if (phone !== undefined) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(String(phone).trim() || null, u.id);
    if (company !== undefined) db.prepare('UPDATE users SET company = ? WHERE id = ?').run(String(company).trim() || null, u.id);
    if (address !== undefined) db.prepare('UPDATE users SET address = ? WHERE id = ?').run(String(address).trim() || null, u.id);
    if (new_password) {
      if (!old_password || !verifyPassword(String(old_password), u.password_hash)) {
        return res.status(400).json({ error: L(req, 'pwWrong') });
      }
      if (String(new_password).length < 6) return res.status(400).json({ error: L(req, 'pwShort') });
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(new_password)), u.id);
      // revoke other sessions so the password change is felt everywhere
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(u.id, (req.headers.authorization || '').replace('Bearer ', ''));
    }
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    res.json({ user: publicUser(fresh) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin: user management (super_admin + admin; admin constrained to non-admin targets) ──
app.get('/api/admin/users', requireUserManager, (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db.prepare(`SELECT * FROM users WHERE full_name LIKE ? OR email LIKE ? OR company LIKE ? ORDER BY id DESC LIMIT 200`)
      .all('%' + q + '%', '%' + q + '%', '%' + q + '%');
  } else {
    rows = db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT 200').all();
  }
  // Non-super admins see only non-admin users (can't manage other admins).
  if (req.user.role !== 'super_admin') rows = rows.filter(u => !['super_admin', 'admin'].includes(u.role));
  res.json({ users: rows.map(publicUser) });
});

// Admin: create user (super_admin + admin; admin may only create user/front roles)
app.post('/api/admin/users', requireUserManager, (req, res) => {
  const { full_name, email, password, role, plan, company, phone } = req.body || {};
  if (!full_name || !String(full_name).trim()) return res.status(400).json({ error: L(req, 'regRequired') });
  if (!email || !String(email).trim()) return res.status(400).json({ error: L(req, 'regRequired') });
  if (!password || String(password).length < 6) return res.status(400).json({ error: L(req, 'pwShort') });
  const em = String(email).trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(em);
  if (exists) return res.status(409).json({ error: L(req, 'emailExists') });
  // Admins (clinic managers) cannot mint other admins or super_admins.
  const allowedRoles = req.user.role === 'super_admin' ? ALL_ROLES : ['user', 'front'];
  const r = allowedRoles.includes(role) ? role : 'user';
  const p = ['Essencial', 'Professional', 'Clinic', 'Unlimited'].includes(plan) ? plan : 'Professional';
  // Seat enforcement (Clinic = 5 active pros; other plans seat cap handled by plan logic)
  if (p === 'Clinic') {
    const seats = planLimits('Clinic').seats;
    if (seats !== -1 && countPlanUsers('Clinic') >= seats) {
      return res.status(403).json({ error: seatErrorMsg(req) });
    }
  }
  const aa = req.body && req.body.analytics_access ? 1 : 0;
  const info = db.prepare('INSERT INTO users (full_name, email, password_hash, role, status, plan, company, phone, analytics_access) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(String(full_name).trim(), em, hashPassword(String(password)), r, 'active', p, String(company || '').trim() || null, String(phone || '').trim() || null, aa);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ user: publicUser(u) });
});


app.get('/api/admin/users/:id', requireUserManager, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: L(req, 'userNotFound') });
  if (!canManageTarget(req.user, u)) return res.status(403).json({ error: L(req, 'adminOnly') });
  const history = db.prepare('SELECT id, ip, user_agent, method, created_at FROM login_history WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(u.id);
  const sessionCount = db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = ?').get(u.id).c;
  res.json({ user: publicUser(u), login_history: history, active_sessions: sessionCount });
});

app.put('/api/admin/users/:id', requireUserManager, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: L(req, 'userNotFound') });
  if (!canManageTarget(req.user, target)) return res.status(403).json({ error: L(req, 'adminOnly') });
  const { full_name, email, phone, company, address, plan, role, status } = req.body || {};
  // safety: cannot demote the last super_admin, cannot demote/pause yourself
  if (target.id === req.user.id) {
    if (role && role !== 'super_admin') return res.status(400).json({ error: L(req, 'selfDemote') });
    if (status && status !== 'active') return res.status(400).json({ error: L(req, 'selfPause') });
  }
  if (role && role !== 'super_admin' && target.role === 'super_admin') {
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'super_admin' AND status = 'active'").get().c;
    if (admins <= 1) return res.status(400).json({ error: L(req, 'lastAdmin') });
  }
  // Admins cannot promote anyone to admin/super_admin.
  if (req.user.role !== 'super_admin' && role !== undefined && ['admin', 'super_admin'].includes(role)) {
    return res.status(403).json({ error: L(req, 'adminOnly') });
  }
  try {
    if (full_name !== undefined && String(full_name).trim()) db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(String(full_name).trim(), target.id);
    if (email !== undefined) {
      const em = String(email).trim().toLowerCase();
      const dup = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(em, target.id);
      if (dup) return res.status(409).json({ error: L(req, 'emailTaken') });
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(em, target.id);
    }
    if (phone !== undefined) db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(String(phone).trim() || null, target.id);
    if (company !== undefined) db.prepare('UPDATE users SET company = ? WHERE id = ?').run(String(company).trim() || null, target.id);
    if (address !== undefined) db.prepare('UPDATE users SET address = ? WHERE id = ?').run(String(address).trim() || null, target.id);
    if (plan !== undefined) {
      const p = String(plan).trim();
      if (['Essencial', 'Professional', 'Clinic', 'Unlimited'].includes(p)) {
        // Seat check: only when the NEW plan is Clinic and the user isn't already Clinic
        if (p === 'Clinic' && target.plan !== 'Clinic') {
          const seats = planLimits('Clinic').seats;
          if (seats !== -1 && countPlanUsers('Clinic') >= seats) {
            return res.status(403).json({ error: seatErrorMsg(req) });
          }
        }
        db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(p, target.id);
      }
    }
    if (req.body && req.body.analytics_access !== undefined) db.prepare('UPDATE users SET analytics_access = ? WHERE id = ?').run(req.body.analytics_access ? 1 : 0, target.id);
    if (role !== undefined && ALL_ROLES.includes(role)) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, target.id);
    if (status !== undefined && ['active', 'paused', 'pending', 'rejected'].includes(status)) {
      db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, target.id);
      if (status === 'paused') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id); // kick all sessions
    }
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id);
    res.json({ user: publicUser(fresh) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/users/:id/reset-password', requireUserManager, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: L(req, 'userNotFound') });
  if (!canManageTarget(req.user, target)) return res.status(403).json({ error: L(req, 'adminOnly') });
  const { new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(new_password)), target.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id); // force re-login
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', requireUserManager, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: L(req, 'userNotFound') });
  if (!canManageTarget(req.user, target)) return res.status(403).json({ error: L(req, 'adminOnly') });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });
  if (target.role === 'super_admin') {
    const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'super_admin'").get().c;
    if (admins <= 1) return res.status(400).json({ error: 'Não é possível excluir o último administrador' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id); // cascade sessions + login_history
  res.json({ ok: true });
});

// JSON 404 for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

// Error handler — JSON always
app.use((err, req, res, next) => {
  console.error('[podo360]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// App shell
app.get('/app', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile('app.html', { root: path.join(__dirname, 'public') });
});

// Public digital-signing page (patient-facing, token in URL)
app.get('/sign/:token', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile('sign.html', { root: path.join(__dirname, 'public') });
});

// SPA fallback
app.use((req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

app.listen(PORT, () => {
  console.log(`Podo360 v0.2.0 running on :${PORT}`);
});
