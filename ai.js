// Podo360 — AI decision-support engine (rule-based v1)
// SAFETY (§41): only documented data, always flagged, never fabricates.
const db = require('./db');

// Localization helper: L(pt, es, en, lang) — mirrors server REP_L tuples.
const L = (pt, es, en, lang) => (lang === 'en' ? en : lang === 'es' ? es : pt);

const DISCLAIMER = 'Gerado por IA como apoio à decisão clínica. Não substitui o julgamento profissional. Verifique contraindicações, alergias, escopo de prática e normas locais.';

function getPatientData(patientId) {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return null;
  const conditions = db.prepare('SELECT * FROM conditions WHERE patient_id = ? ORDER BY opened_at').all(patientId);
  const measurements = db.prepare('SELECT * FROM measurements WHERE patient_id = ? ORDER BY measured_at').all(patientId);
  const timeline = db.prepare('SELECT * FROM timeline_events WHERE patient_id = ? ORDER BY event_date').all(patientId);
  const exams = db.prepare('SELECT * FROM exams WHERE patient_id = ?').all(patientId);
  // attach recorder names so vitals history can show who took each measurement
  const names = {};
  db.prepare('SELECT id, full_name FROM users').all().forEach(u => names[u.id] = u.full_name);
  measurements.forEach(m => { m.user_name = m.user_id ? (names[m.user_id] || null) : null; });
  return { patient, conditions, measurements, timeline, exams };
}

function fmt(n) { return Math.round(n * 10) / 10; }

// ── §20 AI Pre-Assessment ──
function preAssessment(patientId, lang) {
  const d = getPatientData(patientId);
  if (!d) return null;
  const sections = [];
  const condNames = {
    unha_encravada: L('unha encravada', 'uña encarnada', 'ingrown toenail', lang),
    verruga: L('verruga', 'verruga', 'wart', lang),
    granuloma: L('granuloma', 'granuloma', 'granuloma', lang),
    calosidade: L('calosidade', 'callosidad', 'callus', lang),
    fissura: L('fissura', 'fisura', 'fissure', lang),
    micose: L('micose', 'micosis', 'fungal infection', lang),
    lesoes: L('lesão', 'lesión', 'lesion', lang),
    outro: L('outra condição', 'otra condición', 'other condition', lang)
  };
  const list = d.conditions.map(c => condNames[c.type] || c.label || c.type).join(', ') || L('nenhuma condição documentada', 'ninguna condición documentada', 'no documented condition', lang);
  sections.push({ title: L('Condições documentadas', 'Condiciones documentadas', 'Documented conditions', lang), body: `${L('Paciente apresenta', 'El paciente presenta', 'Patient presents with', lang)}: ${list}.` });

  const risk = [];
  if (/diabet/i.test(d.patient.medical_history || '')) risk.push(L('Diabetes documentada — risco elevado de complicações em extremidades.', 'Diabetes documentada: riesgo elevado de complicaciones en extremidades.', 'Documented diabetes — elevated risk of extremity complications.', lang));
  if (d.patient.allergies) risk.push(`${L('Alergia documentada', 'Alergia documentada', 'Documented allergy', lang)}: ${d.patient.allergies}.`);
  if (d.conditions.some(c => c.type === 'unha_encravada' && JSON.parse(c.details || '{}').infection_indicators)) risk.push(L('Indicadores de infecção presentes na unha encravada.', 'Indicadores de infección presentes en la uña encarnada.', 'Infection indicators present in the ingrown toenail.', lang));
  sections.push({ title: L('Fatores de risco', 'Factores de riesgo', 'Risk factors', lang), body: risk.length ? risk.join(' ') : L('Nenhum fator de risco adicional documentado.', 'Ningún factor de riesgo adicional documentado.', 'No additional documented risk factors.', lang) });

  const missing = [];
  if (!d.conditions.some(c => JSON.parse(c.details || '{}').size_mm || JSON.parse(c.details || '{}').involvement_pct)) missing.push(L('Dimensões/medições objetivas não documentadas.', 'Dimensiones/mediciones objetivas no documentadas.', 'Objective dimensions/measurements not documented.', lang));
  if (!d.measurements.length) missing.push(L('Nenhuma medição longitudinal registrada.', 'Ninguna medición longitudinal registrada.', 'No longitudinal measurements recorded.', lang));
  if (!d.exams.length && d.patient.medical_history) missing.push(L('Exames laboratoriais recentes não anexados (relevante para o histórico documentado).', 'Exámenes de laboratorio recientes no adjuntados (relevante para el historial documentado).', 'Recent lab exams not attached (relevant to the documented history).', lang));
  sections.push({ title: L('Informações ausentes', 'Información faltante', 'Missing information', lang), body: missing.length ? missing.join(' ') : L('Nenhuma lacuna crítica identificada.', 'Ninguna brecha crítica identificada.', 'No critical gaps identified.', lang) });

  sections.push({
    title: L('Sugestão de acompanhamento', 'Sugerencia de seguimiento', 'Follow-up suggestion', lang),
    body: d.conditions.some(c => c.status === 'worsening' || c.status === 'needs_attention')
      ? L('Condição em atenção: retorno recomendado em 7–14 dias para reavaliação.', 'Condición en atención: retorno recomendado en 7–14 días para reevaluación.', 'Condition requiring attention: follow-up recommended in 7–14 days for reassessment.', lang)
      : L('Condição estável ou em melhora: retorno em 30–60 dias conforme protocolo clínico.', 'Condición estable o en mejora: retorno en 30–60 días según protocolo clínico.', 'Stable or improving condition: follow-up in 30–60 days per clinical protocol.', lang)
  });

  const warnings = [];
  if (/diabet/i.test(d.patient.medical_history || '')) warnings.push(L('Paciente diabético: observar sinais de infecção, má perfusão e neuropatia.', 'Paciente diabético: observar signos de infección, mala perfusión y neuropatía.', 'Diabetic patient: watch for signs of infection, poor perfusion, and neuropathy.', lang));
  if (d.conditions.some(c => JSON.parse(c.details || '{}').drainage)) warnings.push(L('Drenagem documentada — avaliar sinais de infecção ativa.', 'Drenaje documentado: evaluar signos de infección activa.', 'Documented drainage — assess for signs of active infection.', lang));
  sections.push({ title: L('Sinais de alerta', 'Señales de alerta', 'Warning signs', lang), body: warnings.length ? warnings.join(' ') : L('Nenhum sinal de alerta documentado.', 'Ninguna señal de alerta documentada.', 'No documented warning signs.', lang) });

  const refs = [];
  if (/diabet/i.test(d.patient.medical_history || '')) refs.push(L('Endocrinologia — otimização do controle glicêmico pode favorecer a evolução.', 'Endocrinología: optimizar el control glucémico puede favorecer la evolución.', 'Endocrinology — optimizing glycemic control may improve outcomes.', lang));
  if (d.conditions.some(c => c.type === 'verruga' || c.type === 'micose')) refs.push(L('Dermatologia — avaliação complementar da lesão de pele/ungueal.', 'Dermatología: evaluación complementaria de la lesión de piel/ungueal.', 'Dermatology — further evaluation of the skin/nail lesion.', lang));
  sections.push({ title: L('Possível encaminhamento', 'Posible derivación', 'Possible referral', lang), body: refs.length ? refs.join(' ') : L('Nenhum encaminhamento indicado com base nos dados documentados.', 'Ninguna derivación indicada según los datos documentados.', 'No referral indicated based on documented data.', lang) });

  return { kind: 'pre_assessment', sections, disclaimer: DISCLAIMER, ai: true };
}

// ── §19 AI Progress Analysis ──
function progressAnalysis(patientId, conditionId, lang) {
  const d = getPatientData(patientId);
  if (!d) return null;
  let cond = d.conditions.find(c => c.id === Number(conditionId));
  if (!cond && d.conditions.length) cond = d.conditions[0];
  if (!cond) return { kind: 'progress', sections: [{ title: L('Sem dados', 'Sin datos', 'No data', lang), body: L('Nenhuma condição documentada para análise.', 'Ninguna condición documentada para el análisis.', 'No documented condition to analyze.', lang) }], disclaimer: DISCLAIMER, ai: true };

  const ms = d.measurements.filter(m => !conditionId || m.condition_id === Number(conditionId));
  const findings = [];
  const series = {};
  for (const m of ms) series[m.type] = series[m.type] || [];
  for (const m of ms) series[m.type].push(m);

  const names = {
    pain: L('dor', 'dolor', 'pain', lang),
    nail_involvement_pct: L('envolvimento ungueal', 'afectación ungueal', 'nail involvement', lang),
    length: L('comprimento', 'longitud', 'length', lang),
    width: L('largura', 'ancho', 'width', lang),
    area: L('área', 'área', 'area', lang),
    depth: L('profundidade', 'profundidad', 'depth', lang),
    fissure_length: L('comprimento da fissura', 'longitud de la fisura', 'fissure length', lang),
    severity: L('severidade', 'severidad', 'severity', lang)
  };
  for (const [type, arr] of Object.entries(series)) {
    arr.sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    if (arr.length >= 2) {
      const first = arr[0].value, last = arr[arr.length - 1].value;
      const delta = fmt(((last - first) / (first || 1)) * 100);
      const label = names[type] || type;
      if (Math.abs(delta) < 3) findings.push(`${label}: ${L('estável', 'estable', 'stable', lang)} (${first} → ${last} ${arr[0].unit}).`);
      else if (delta < 0) findings.push(`${label}: ${L('redução de aproximadamente', 'reducción de aproximadamente', 'reduction of approximately', lang)} ${Math.abs(delta)}% ${L('em relação à medição inicial', 'en relación con la medición inicial', 'relative to the initial measurement', lang)} (${first} → ${last} ${arr[0].unit}).`);
      else findings.push(`${label}: ${L('aumento de aproximadamente', 'aumento de aproximadamente', 'increase of approximately', lang)} ${delta}% ${L('em relação à medição inicial', 'en relación con la medición inicial', 'relative to the initial measurement', lang)} (${first} → ${last} ${arr[0].unit}).`);
    }
  }

  const improved = findings.some(f => /redução|reducción|reduction/.test(f));
  const worsened = findings.some(f => /aumento|increase/.test(f));
  const trend = worsened ? 'worsening' : improved ? 'improving' : 'stable';
  const trendWord = trend === 'worsening' ? L('piora', 'empeoramiento', 'worsening', lang) : trend === 'improving' ? L('melhora', 'mejora', 'improvement', lang) : L('estabilidade', 'estabilidad', 'stability', lang);
  findings.push(`${L('Tendência geral documentada', 'Tendencia general documentada', 'Overall documented trend', lang)}: ${trendWord}.`);

  const tl = d.timeline.filter(t => t.patient_id === patientId);
  const lastVisit = tl.length ? tl[tl.length - 1] : null;
  if (lastVisit && /retorno|follow/i.test(lastVisit.kind + lastVisit.title)) {
    // follow-up adherence check
  }
  const appts = db.prepare('SELECT * FROM appointments WHERE patient_id = ? AND start_at > datetime(\'now\')').all(patientId);
  if (cond.status === 'needs_attention' && !appts.length) {
    findings.push(L('⚠️ Follow-up recomendado pendente: o paciente não possui retorno agendado.', '⚠️ Seguimiento recomendado pendiente: el paciente no tiene retorno programado.', '⚠️ Recommended follow-up pending: patient has no scheduled return.', lang));
  }

  return { kind: 'progress', condition_id: cond.id, sections: [{ title: L('Análise de progresso', 'Análisis de progreso', 'Progress analysis', lang), body: findings.join(' ') }], disclaimer: DISCLAIMER, ai: true };
}

// ── §17 Treatment Projection ──
// v2 (2026-08-18): linear regression over ALL measurements of the dominant
// type (pain if present, else area, else the first documented type) — no more
// first-vs-last-only. Returns `meta` (slope/intercept/points/projected) so the
// frontend chart draws the REAL trend line, not a hardcoded decay.
function linReg(pts) {
  // pts: [{x: daysSinceFirst, y: value}]
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  pts.forEach(p => { num += (p.x - mx) * (p.y - my); den += (p.x - mx) * (p.x - mx); });
  const slope = den ? num / den : 0;      // per-day change
  const intercept = my - slope * mx;       // value at day 0
  return { slope, intercept };
}
function projection(patientId, conditionId, lang) {
  const d = getPatientData(patientId);
  if (!d) return null;
  let cond = d.conditions.find(c => c.id === Number(conditionId));
  if (!cond && d.conditions.length) cond = d.conditions[0];
  if (!cond) return { kind: 'projection', sections: [{ title: L('Sem dados', 'Sin datos', 'No data', lang), body: L('Sem condição para projetar.', 'Sin condición para proyectar.', 'No condition to project.', lang) }], disclaimer: DISCLAIMER, ai: true };

  const TYPE_NAMES = {
    pain: ['dor', 'dolor', 'pain'],
    area: ['área', 'área', 'area'],
    length: ['comprimento', 'longitud', 'length'],
    width: ['largura', 'ancho', 'width'],
    depth: ['profundidade', 'profundidad', 'depth'],
    nail_involvement_pct: ['envolvimento ungueal', 'afectación ungueal', 'nail involvement']
  };
  const all = d.measurements.filter(m => m.condition_id === cond.id).sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  // dominant type: pain > area > most common
  const byType = {};
  all.forEach(m => { byType[m.type] = byType[m.type] || []; byType[m.type].push(m); });
  let type = Object.keys(byType).sort((a, b) =>
    (b === 'pain') - (a === 'pain') || (b === 'area') - (a === 'area') || byType[b].length - byType[a].length)[0];
  const ms = byType[type] || [];
  const typeName = (TYPE_NAMES[type] || [type, type, type])[lang === 'en' ? 2 : lang === 'es' ? 1 : 0];

  let body, meta = null;
  if (ms.length >= 2) {
    const t0 = new Date(ms[0].measured_at).getTime();
    const pts = ms.map(m => ({ x: (new Date(m.measured_at).getTime() - t0) / 86400000, y: m.value }));
    const { slope, intercept } = linReg(pts);
    const last = ms[ms.length - 1].value;
    const perDay = slope;
    const daysToResolve = perDay < 0 ? Math.round(last / Math.abs(perDay)) : null;
    // projected points: extend the regression line 3 steps (7 days each)
    const lastX = pts[pts.length - 1].x;
    const projected = [];
    for (let i = 1; i <= 3; i++) {
      const x = lastX + i * 7;
      projected.push({ x, y: Math.max(0, Math.round((intercept + slope * x) * 10) / 10) });
    }
    meta = { type, slope, intercept, perDay, daysToResolve, points: pts, projected };
    body = daysToResolve !== null
      ? `${L('Com base na tendência documentada', 'Con base en la tendencia documentada', 'Based on the documented trend', lang)} (${typeName}: ${ms[0].value} → ${last}, ${ms.length} ${L('medições', 'mediciones', 'measurements', lang)}), ${L('a condição mostra trajetória favorável. Projeção estimada de resolução em aproximadamente', 'la condición muestra trayectoria favorable. Proyección estimada de resolución en aproximadamente', 'the condition shows a favorable trajectory. Estimated resolution in approximately', lang)} ${daysToResolve} ${L('dias, mantido o ritmo atual. ESTIMATIVA — não é garantia de resultado clínico.', 'días, manteniendo el ritmo actual. ESTIMACIÓN: no es garantía de resultado clínico.', 'days, at the current pace. ESTIMATE — not a guarantee of clinical outcome.', lang)}`
      : L('A tendência documentada não indica redução consistente. Projeção incerta — recomenda-se reavaliação clínica.', 'La tendencia documentada no indica reducción consistente. Proyección incierta: se recomienda reevaluación clínica.', 'The documented trend does not show consistent reduction. Projection uncertain — clinical reassessment recommended.', lang);
  } else {
    body = L('Dados insuficientes para projeção (mínimo de 2 medições ao longo do tempo). Registre novas medições em retornos para habilitar projeção.', 'Datos insuficientes para la proyección (mínimo de 2 mediciones a lo largo del tiempo). Registre nuevas mediciones en retornos para habilitar la proyección.', 'Insufficient data for projection (minimum of 2 measurements over time). Record new measurements at follow-ups to enable projection.', lang);
  }
  return { kind: 'projection', condition_id: cond.id, meta, sections: [{ title: L('Projeção de tratamento', 'Proyección de tratamiento', 'Treatment projection', lang), body }], disclaimer: DISCLAIMER, ai: true };
}

// ── §18 AI Clinical Timeline ──
function clinicalTimeline(patientId, lang) {
  const d = getPatientData(patientId);
  if (!d) return null;
  const events = d.timeline.map(t => `${String(t.event_date || '').slice(0, 10)} — ${t.title}${t.detail ? ': ' + t.detail : ''}`);
  const body = events.length
    ? events.join('\n')
    : L('Nenhum evento clínico documentado.', 'Ningún evento clínico documentado.', 'No documented clinical events.', lang);
  return { kind: 'timeline', sections: [{ title: L('Linha do tempo clínica', 'Línea de tiempo clínica', 'Clinical timeline', lang), body }], disclaimer: DISCLAIMER, ai: true };
}

// ── Dashboard AI alerts (§7) ──
function dashboardAlerts(lang) {
  const alerts = [];
  const overdue = db.prepare(`SELECT id, full_name FROM patients WHERE status = 'overdue'`).all();
  overdue.forEach(p => alerts.push({ level: 'high', text: (lang === 'en' ? 'Follow-up overdue: ' : lang === 'es' ? 'Seguimiento vencido: ' : 'Follow-up em atraso: ') + p.full_name, patient_id: p.id }));

  const worsening = db.prepare(`SELECT c.id, c.patient_id, p.full_name FROM conditions c JOIN patients p ON p.id = c.patient_id WHERE c.status = 'worsening'`).all();
  worsening.forEach(c => alerts.push({ level: 'high', text: (lang === 'en' ? 'Unexpected progression: ' : lang === 'es' ? 'Progresión inesperada: ' : 'Progressão inesperada: ') + c.full_name + ' (' + c.id + ')', patient_id: c.patient_id }));

  const noReturn = db.prepare(`
    SELECT p.id, p.full_name FROM patients p
    WHERE p.status IN ('active','follow_up_due','overdue')
    AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.start_at > datetime('now') AND a.status = 'confirmed')`).all();
  noReturn.forEach(p => alerts.push({ level: 'medium', text: (lang === 'en' ? 'No return scheduled: ' : lang === 'es' ? 'Sin retorno programado: ' : 'Sem retorno agendado: ') + p.full_name, patient_id: p.id }));

  const recentExams = db.prepare(`SELECT p.id, p.full_name FROM exams e JOIN patients p ON p.id = e.patient_id WHERE e.created_at > datetime('now','-7 days')`).all();
  recentExams.forEach(p => alerts.push({ level: 'low', text: (lang === 'en' ? 'New exam attached: ' : lang === 'es' ? 'Nuevo examen adjuntado: ' : 'Novo exame anexado: ') + p.full_name, patient_id: p.id }));

  return alerts;
}

// ── Dashboard stats (§7) ──
function dashboardStats() {
  const total = db.prepare(`SELECT COUNT(*) c FROM patients`).get().c;
  const newThisMonth = db.prepare(`SELECT COUNT(*) c FROM patients WHERE created_at > datetime('now','start of month')`).get().c;
  const followUpDue = db.prepare(`SELECT COUNT(*) c FROM patients WHERE status = 'follow_up_due'`).get().c;
  const overdue = db.prepare(`SELECT COUNT(*) c FROM patients WHERE status = 'overdue'`).get().c;
  const active = db.prepare(`SELECT COUNT(*) c FROM patients WHERE status = 'active'`).get().c;

  const condByType = db.prepare(`SELECT type, COUNT(*) c FROM conditions WHERE closed_at IS NULL GROUP BY type`).all();
  const condByStatus = db.prepare(`SELECT status, COUNT(*) c FROM conditions WHERE closed_at IS NULL GROUP BY status`).all();

  return { patients: { total, newThisMonth, active, followUpDue, overdue }, conditions: { byType: condByType, byStatus: condByStatus } };
}

// ── §Foot-map marker: treatment course suggestion (2026-08-26) ──
// Keyword-based protocol matching for a marked point's free-text description.
// Local algo v1 — no LLM calls, deterministic, localized, always disclaimed.
const norm = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// protocol entries: { keys:[...], name:[pt,es,en], course:[pt,es,en][], redflags:[pt,es,en][] }
const T = (pt, es, en) => [pt, es, en];
const pick = (t, lang) => (lang === 'en' ? t[2] : lang === 'es' ? t[1] : t[0]);
const FOOT_PROTOCOLS = [
  { keys: ['verrug', 'verruga', 'papiloma', 'vph', 'wart'],
    name: T('Verruga plantar', 'Verruga plantar', 'Plantar wart'),
    course: [T('Avaliar com lâmina a área hiperceratótica e identificar trombos capilares (pontos escuros).', 'Evaluar con bisturí el área hiperqueratósica e identificar trombos capilares (puntos oscuros).', 'Debride hyperkeratotic area with a blade and identify capillary thrombi (dark dots).'),
      T('Curetagem + acidificação progressiva (ácido salicílico 40–60%) com proteção da pele sadia, 1x/semana.', 'Curetaje + acidificación progresiva (ácido salicílico 40–60%) protegiendo la piel sana, 1x/semana.', 'Curettage + progressive acidification (40–60% salicylic acid) protecting healthy skin, weekly.'),
      T('Reavaliar em 4–6 semanas; considerar crioterapia se ausência de resposta.', 'Reevaluar en 4–6 semanas; considerar crioterapia si no hay respuesta.', 'Reassess in 4–6 weeks; consider cryotherapy if no response.')],
    redflags: [T('Lesão dolorosa, sangrante ou de crescimento rápido → avaliar encaminhamento dermatológico.', 'Lesión dolorosa, sangrante o de crecimiento rápido → evaluar derivación a dermatología.', 'Painful, bleeding, or fast-growing lesion → consider dermatology referral.')] },
  { keys: ['unha encravada', 'encravad', 'onicocriptose', 'unha que encrav', 'ingrown', 'encarnad'],
    name: T('Unha encravada (onicocriptose)', 'Uña encarnada (onicocriptose)', 'Ingrown toenail (onychocryptosis)'),
    course: [T('Banho de imersão morna + antissepsia; afastar o canto ungueal com mecha ou espátula.', 'Baño de inmersión tibia + antisepsia; separar el borde ungueal con mecha o espátula.', 'Warm soak + antisepsis; lift the nail corner with a wisp or spatula.'),
      T('Podoplastia/órtese ungueal para corrigir a curvatura, ou cantoplastia se hipergranulação.', 'Podoplastia/ortesis ungueal para corregir la curvatura, o cantoplastia si hay hipergranulación.', 'Nail brace/spicule removal to correct curvature, or nail edge avulsion if hypergranulation.'),
      T('Orientar corte reto, calçado de bico largo e evitar automanipulação.', 'Orientar corte recto, calzado de puntera ancha y evitar la automanipulación.', 'Advise straight nail cutting, wide-toe footwear, and no self-manipulation.')],
    redflags: [T('Sinais de infecção (eritema, drenagem purulenta, dor pulsátil) → avaliar antibioticoterapia/encaminhamento.', 'Signos de infección (eritema, drenaje purulento, dolor pulsátil) → evaluar antibióticos/derivación.', 'Signs of infection (erythema, purulent drainage, throbbing pain) → evaluate antibiotics/referral.')] },
  { keys: ['onicomicose', 'micose', 'fungo', 'unha grossa', 'unha amarel', 'onychomycosis', 'fungus', 'nail fungus', 'micosis'],
    name: T('Onicomicose', 'Onicomicosis', 'Onychomycosis'),
    course: [T('Coleta de amostra para exame micológico direto antes de instituir terapia.', 'Toma de muestra para examen micológico directo antes de iniciar terapia.', 'Collect sample for direct mycological exam before starting therapy.'),
      T('Desgaste mecânico da lâmina + antifúngico tópico (amorolfina/ciclopirox) 1x/semana.', 'Desgaste mecánico de la lámina + antifúngico tópico (amorolfina/ciclopirox) 1x/semana.', 'Mechanical nail thinning + topical antifungal (amorolfine/ciclopirox) weekly.'),
      T('Reavaliar em 8–12 semanas; casos extensos → avaliar antifúngico oral com supervisão médica.', 'Reevaluar en 8–12 semanas; casos extensos → evaluar antifúngico oral con supervisión médica.', 'Reassess in 8–12 weeks; extensive cases → consider oral antifungal under medical supervision.')],
    redflags: [T('Paciente diabético ou imunossuprimido: risco de celulite — reforçar avaliação médica.', 'Paciente diabético o inmunosuprimido: riesgo de celulitis — reforzar evaluación médica.', 'Diabetic or immunocompromised patient: cellulitis risk — reinforce medical evaluation.')] },
  { keys: ['calo', 'calos', 'hiperqueratos', 'calosidade', 'callus', 'callo', 'hyperkerat'],
    name: T('Calosidade / hiperceratose', 'Callosidad / hiperqueratosis', 'Callus / hyperkeratosis'),
    course: [T('Desbaste com lâmina (curetagem) respeitando a derme, em sessões seriadas.', 'Desbastado con bisturí (curetaje) respetando la dermis, en sesiones seriadas.', 'Blade debridement respecting the dermis, in serial sessions.'),
      T('Avaliar calçado, padrão de marcha e pontos de pressão; indicar palmilhas de descarga.', 'Evaluar calzado, patrón de marcha y puntos de presión; indicar plantillas de descarga.', 'Assess footwear, gait pattern, and pressure points; recommend offloading insoles.'),
      T('Hidratação com ureia 10–30% + orientação de prevenção.', 'Hidratación con urea 10–30% + orientación de prevención.', 'Moisturize with 10–30% urea + prevention guidance.')],
    redflags: [T('Dor à palpação profunda ou núcleo central → descartar verruga plantar/calo plantar.', 'Dolor a la palpación profunda o núcleo central → descartar verruga plantar/callo plantar.', 'Deep palpation pain or central core → rule out plantar wart/plantar callus.')] },
  { keys: ['fissura', 'rachad', 'ressecament', 'fissure', 'fisura', 'cracked', 'crack'],
    name: T('Fissura / ressecamento', 'Fisura / resequedad', 'Fissure / dryness'),
    course: [T('Limpeza + antisséptico; desbridar bordas hiperceratóticas da fissura.', 'Limpieza + antiséptico; desbridar bordes hiperqueratósicos de la fisura.', 'Clean + antiseptic; debride hyperkeratotic edges of the fissure.'),
      T('Emoliente com ureia 10–20% 2x/dia + curativo oclusivo se fissura profunda.', 'Emoliente con urea 10–20% 2x/día + apósito oclusivo si fisura profunda.', '10–20% urea emollient twice daily + occlusive dressing if deep fissure.'),
      T('Investigação etiológica: micose interdigital, ressecamento, sobrecarga mecânica.', 'Investigación etiológica: micosis interdigital, resequedad, sobrecarga mecánica.', 'Investigate etiology: interdigital fungal infection, dryness, mechanical overload.')],
    redflags: [T('Fissura profunda com drenagem ou eritema peri-lesional → avaliar infecção.', 'Fisura profunda con drenaje o eritema perilesional → evaluar infección.', 'Deep fissure with drainage or peri-lesional erythema → evaluate infection.')] },
  { keys: ['bolha', 'ampola', 'fricca', 'blister', 'friction'],
    name: T('Bolha / lesão por fricção', 'Ampolla / lesión por fricción', 'Blister / friction lesion'),
    course: [T('Antissepsia; punção com material estéril apenas se tensa e dolorosa, preservando o teto.', 'Antisepsia; punción con material estéril solo si está tensa y dolorosa, preservando el techo.', 'Antisepsis; puncture with sterile material only if tense and painful, preserving the roof.'),
      T('Curativo protetor + redução do atrito (meias adequadas, calçado).', 'Apósito protector + reducción de la fricción (medias adecuadas, calzado).', 'Protective dressing + friction reduction (proper socks, footwear).')],
    redflags: [T('Sinais de infecção secundária (conteúdo purulento, celulite) → avaliar antibiótico.', 'Signos de infección secundaria (contenido purulento, celulitis) → evaluar antibiótico.', 'Secondary infection signs (purulent content, cellulitis) → evaluate antibiotics.')] },
  { keys: ['joanete', 'hallux valgus', 'halux valgo', 'bunion', 'juanete'],
    name: T('Joanete (hallux valgus)', 'Juanete (hallux valgus)', 'Bunion (hallux valgus)'),
    course: [T('Avaliar angulação e dor; indicar calçado largo e órtese/separador digital.', 'Evaluar angulación y dolor; indicar calzado ancho y órtesis/separador digital.', 'Assess angulation and pain; recommend wide footwear and toe spacer/orthosis.'),
      T('Fortalecimento + alongamento; avaliar palmilha com suporte de arco.', 'Fortalecimiento + estiramiento; evaluar plantilla con soporte de arco.', 'Strengthening + stretching; consider arch-support insole.')],
    redflags: [T('Dor intensa ou deformidade progressiva → avaliar encaminhamento ortopédico.', 'Dolor intenso o deformidad progresiva → evaluar derivación ortopédica.', 'Severe pain or progressive deformity → consider orthopedic referral.')] },
  { keys: ['dor', 'dolor', 'sensibilidad', 'pain', 'hurt'],
    name: T('Dor localizada', 'Dolor localizado', 'Localized pain'),
    course: [T('Anamnese dirigida + palpação para identificar estrutura (pele, unha, osso, articulação).', 'Anamnesis dirigida + palpación para identificar estructura (piel, uña, hueso, articulación).', 'Targeted history + palpation to identify structure (skin, nail, bone, joint).'),
      T('Tratamento conforme causa: desbaste, descarga, órtese ou encaminhamento.', 'Tratamiento según causa: desbaste, descarga, órtesis o derivación.', 'Treat per cause: debridement, offloading, orthosis, or referral.')],
    redflags: [T('Dor em repouso, noturna ou com sinais inflamatórios → avaliar causas vasculares/infecciosas.', 'Dolor en reposo, nocturno o con signos inflamatorios → evaluar causas vasculares/infecciosas.', 'Rest pain, night pain, or inflammatory signs → evaluate vascular/infectious causes.')] },
  { keys: ['granuloma', 'hipergranulacao', 'carne espont', 'hypergranul'],
    name: T('Granuloma / hipergranulação', 'Granuloma / hipergranulación', 'Granuloma / hypergranulation'),
    course: [T('Cauterização química (nitrato de prata) + antissepsia local.', 'Cauterización química (nitrato de plata) + antisepsia local.', 'Chemical cautery (silver nitrate) + local antisepsis.'),
      T('Remover fator causal (ex.: canto ungueal, corpo estranho) para evitar recidiva.', 'Eliminar factor causal (ej.: borde ungueal, cuerpo extraño) para evitar recidiva.', 'Remove causative factor (e.g., nail spicule, foreign body) to prevent recurrence.')],
    redflags: [T('Sangramento fácil ou crescimento rápido → descartar lesão neoplásica.', 'Sangrado fácil o crecimiento rápido → descartar lesión neoplásica.', 'Easy bleeding or rapid growth → rule out neoplastic lesion.')] }
];

// view label helper
const VIEW_LBL = (view, lang) => {
  const v = String(view || '');
  const side = v.startsWith('left') ? L('pé esquerdo', 'pie izquierdo', 'left foot', lang) : L('pé direito', 'pie derecho', 'right foot', lang);
  const region = v.includes('dorsal') ? L('região dorsal', 'región dorsal', 'dorsal region', lang)
    : v.includes('plantar') ? L('região plantar', 'región plantar', 'plantar region', lang)
    : v.includes('hallux') || v.includes('halux') ? L('hálux', 'hallux', 'hallux', lang)
    : v.includes('heel') || v.includes('calcaneo') ? L('calcâneo', 'calcáneo', 'heel', lang)
    : v.includes('nail') || v.includes('unha') ? L('unha', 'uña', 'nail', lang)
    : L('ponto marcado', 'punto marcado', 'marked point', lang);
  return `${region} — ${side}`;
};

function footMapSuggestion(description, status, view, lang) {
  const text = norm(description);
  const matched = FOOT_PROTOCOLS.find(p => p.keys.some(k => text.includes(norm(k)))) || null;
  const crit = Number(status) === 2;
  const sections = [];

  sections.push({
    title: L('Ponto marcado', 'Punto marcado', 'Marked point', lang),
    body: `${VIEW_LBL(view, lang)}. ${L('Relato', 'Relato', 'Report', lang)}: ${String(description || '').trim() || L('sem descrição informada', 'sin descripción informada', 'no description provided', lang)}.`
  });

  if (matched) {
    sections.push({
      title: L('Conduta sugerida', 'Conducta sugerida', 'Suggested course', lang),
      body: `<b>${pick(matched.name, lang)}</b> — ` + matched.course.map(c => pick(c, lang)).join(' ')
    });
    if (matched.redflags.length) sections.push({
      title: L('Sinais de alerta', 'Señales de alerta', 'Warning signs', lang),
      body: matched.redflags.map(r => pick(r, lang)).join(' ')
    });
  } else {
    sections.push({
      title: L('Conduta sugerida', 'Conducta sugerida', 'Suggested course', lang),
      body: L('Não foi possível classificar automaticamente o relato. Sugere-se anamnese dirigida, inspeção e palpação do ponto, registro fotográfico e conduta conforme achados clínicos.',
        'No fue posible clasificar automáticamente el relato. Se sugiere anamnesis dirigida, inspección y palpación del punto, registro fotográfico y conducta según hallazgos clínicos.',
        'Unable to auto-classify the report. Recommend targeted history, inspection and palpation of the point, photographic record, and treatment per clinical findings.', lang)
    });
  }

  if (crit) sections.push({
    title: L('Prioridade', 'Prioridad', 'Priority', lang),
    body: L('Marcador classificado como CRÍTICO: priorizar avaliação e considerar encaminhamento médico se sinais sistêmicos.',
      'Marcador clasificado como CRÍTICO: priorizar evaluación y considerar derivación médica si hay signos sistémicos.',
      'Marker classified CRITICAL: prioritize evaluation and consider medical referral if systemic signs are present.', lang)
  });

  return { kind: 'footmap_suggest', sections, disclaimer: DISCLAIMER, ai: true };
}

// ── §Full-patient AI course of treatment (2026-08-26) ──
// Reviews EVERYTHING documented (conditions, vitals, visits, exams, foot-map
// pins + descriptions, plans, photo record) and produces a consolidated
// treatment course. Rule-based v1, localized, always disclaimed.
const COND_STATUS = {
  active: T('Ativa', 'Activa', 'Active'),
  improving: T('Melhorando', 'Mejorando', 'Improving'),
  needs_attention: T('Necessita atenção', 'Necesita atención', 'Needs attention'),
  stable: T('Estável', 'Estable', 'Stable'),
  worsening: T('Piorando', 'Empeorando', 'Worsening'),
  resolved: T('Resolvida', 'Resuelta', 'Resolved')
};
const COND_TO_KEY = { unha_encravada: 'encravad', verruga: 'verrug', granuloma: 'granuloma', calosidade: 'calos', fissura: 'fissura', micose: 'onicomicose' };
const findProtocol = text => FOOT_PROTOCOLS.find(p => p.keys.some(k => norm(text).includes(norm(k)))) || null;
const AGE = p => {
  if (!p.birth_date) return '';
  const b = new Date(String(p.birth_date).slice(0, 10));
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a >= 0 ? String(a) : '';
};

function treatmentCourse(patientId, lang) {
  const d = getPatientData(patientId);
  if (!d) return null;
  const p = d.patient;
  const footmap = db.prepare('SELECT * FROM footmap_points WHERE patient_id = ? ORDER BY id').all(patientId);
  const visits = db.prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY visit_date DESC').all(patientId);
  const imgCount = (db.prepare('SELECT COUNT(*) c FROM images WHERE patient_id = ?').get(patientId) || {}).c || 0;
  const latestMeas = {};
  db.prepare('SELECT * FROM measurements WHERE patient_id = ? ORDER BY measured_at DESC').all(patientId).forEach(m => { if (latestMeas[m.type] === undefined) latestMeas[m.type] = m.value; });
  const sections = [];
  const warn = [];
  const refs = [];

  // 1 — overview
  const condNames = { unha_encravada: L('unha encravada', 'uña encarnada', 'ingrown toenail', lang), verruga: L('verruga', 'verruga', 'wart', lang), granuloma: L('granuloma', 'granuloma', 'granuloma', lang), calosidade: L('calosidade', 'callosidad', 'callus', lang), fissura: L('fissura', 'fisura', 'fissure', lang), micose: L('micose', 'micosis', 'fungal infection', lang), lesoes: L('lesão', 'lesión', 'lesion', lang), outro: L('outra condição', 'otra condición', 'other condition', lang) };
  const condList = d.conditions.map(c => condNames[c.type] || c.label || c.type).join(', ') || L('nenhuma condição documentada', 'ninguna condición documentada', 'no documented condition', lang);
  const age = AGE(p);
  sections.push({ title: L('Visão geral', 'Resumen general', 'Overview', lang), body:
    `${esc0(p.full_name)}${age ? ` · ${age} ${L('anos', 'años', 'y/o', lang)}` : ''}${p.sex ? ' · ' + p.sex : ''}. ` +
    L('Condições documentadas', 'Condiciones documentadas', 'Documented conditions', lang) + `: ${condList}. ` +
    (visits.length ? L('Consultas registradas', 'Consultas registradas', 'Recorded visits', lang) + `: ${visits.length}. ` : '') +
    (imgCount ? L('Registro fotográfico', 'Registro fotográfico', 'Photo record', lang) + `: ${imgCount}.` : '')
  });

  // 2 — conditions with protocols
  const condSteps = [];
  const activeConds = d.conditions.filter(c => c.status !== 'resolved');
  activeConds.forEach(c => {
    const proto = findProtocol((condNames[c.type] || '') + ' ' + (c.label || ''));
    const st = pick(COND_STATUS[c.status] || COND_STATUS.active, lang);
    if (proto) {
      condSteps.push(`${esc0(condNames[c.type] || c.label || c.type)} (${st}): ${proto.course.map(x => pick(x, lang)).join(' ')}`);
      (proto.redflags || []).forEach(r => warn.push(pick(r, lang)));
      if (c.type === 'verruga' || c.type === 'micose') refs.push(L('Dermatologia — avaliação complementar da lesão.', 'Dermatología: evaluación complementaria de la lesión.', 'Dermatology — further evaluation of the lesion.', lang));
    } else {
      condSteps.push(`${esc0(condNames[c.type] || c.label || c.type)} (${st}): ${L('anamnese dirigida, inspeção e conduta conforme achados.', 'anamnesis dirigida, inspección y conducta según hallazgos.', 'targeted history, inspection, and treatment per findings.', lang)}`);
    }
    if (c.status === 'worsening' || c.status === 'needs_attention') warn.push(L('Condição em atenção ou piorando — priorizar reavaliação.', 'Condición en atención o empeorando — priorizar reevaluación.', 'Condition worsening or requiring attention — prioritize reassessment.', lang));
    if (c.type === 'unha_encravada' && JSON.parse(c.details || '{}').infection_indicators) warn.push(L('Indicadores de infecção na unha encravada.', 'Indicadores de infección en la uña encarnada.', 'Infection indicators in the ingrown toenail.', lang));
  });
  if (condSteps.length) sections.push({ title: L('Condições e condutas', 'Condiciones y conductas', 'Conditions & courses', lang), body: condSteps.join('<br>') });

  // 3 — foot-map points
  if (footmap.length) {
    const pinRows = footmap.map(fm => {
      const proto = fm.description ? findProtocol(fm.description) : null;
      const lbl = Number(fm.status) === 2 ? L('CRÍTICO', 'CRÍTICO', 'CRITICAL', lang) : (PIN_LBL_T[fm.status] ? pick(PIN_LBL_T[fm.status], lang) : '');
      const base = `${esc0(fm.description || L('ponto sem descrição', 'punto sin descripción', 'point without description', lang))} (${lbl})`;
      if (proto) {
        if (Number(fm.status) === 2) warn.push(L('Ponto crítico no mapa: ', 'Punto crítico en el mapa: ', 'Critical map point: ', lang) + (fm.description || ''));
        return base + ' → ' + proto.course.map(x => pick(x, lang)).join(' ');
      }
      return base;
    });
    sections.push({ title: L('Pontos marcados no mapa dos pés', 'Puntos marcados en el mapa de los pies', 'Foot-map marked points', lang), body: pinRows.join('<br>') });
  }

  // 4 — vitals snapshot + per-visit history (date, time, recorder)
  const vitRows = [];
  const VITAL_DEF = [['weight', L('Peso', 'Peso', 'Weight', lang), 'kg', [0, 300]], ['height', L('Altura', 'Altura', 'Height', lang), 'cm', [0, 250]], ['temperature', L('Temperatura', 'Temperatura', 'Temperature', lang), '°C', [35, 42]], ['heart_rate', L('FC', 'FC', 'HR', lang), 'bpm', [40, 120]], ['respiratory_rate', L('FR', 'FR', 'RR', lang), 'rpm', [8, 24]], ['systolic_bp', L('PA sistólica', 'PA sistólica', 'Systolic BP', lang), 'mmHg', [80, 140]], ['diastolic_bp', L('PA diastólica', 'PA diastólica', 'Diastolic BP', lang), 'mmHg', [50, 90]], ['glycemia', L('Hemoglucoteste', 'Hemoglucotest', 'Blood glucose', lang), 'mg/dL', [60, 126]]];
  const vitName = type => { const f = VITAL_DEF.find(v => v[0] === type); return f ? f[1] : type; };
  const fmtVit = (type, v) => {
    const f = VITAL_DEF.find(x => x[0] === type);
    const flag = f && (v < f[3][0] || v > f[3][1]) ? ' ⚠' : '';
    return `${vitName(type)}: ${v} ${f ? f[2] : ''}${flag}`;
  };
  // latest snapshot (unchanged behavior)
  VITAL_DEF.forEach(([type, label, unit, range]) => {
    if (latestMeas[type] === undefined) return;
    const v = latestMeas[type];
    const flag = (v < range[0] || v > range[1]) ? ' ⚠' : '';
    vitRows.push(`${label}: ${v} ${unit}${flag}`);
    if (type === 'glycemia' && v > 126) warn.push(L('Hemoglucoteste elevado — avaliar controle glicêmico.', 'Hemoglucotest elevado — evaluar control glucémico.', 'Elevated blood glucose — assess glycemic control.', lang));
    if (type === 'systolic_bp' && v > 140) warn.push(L('PA sistólica elevada — acompanhar.', 'PA sistólica elevada — dar seguimiento.', 'Elevated systolic BP — monitor.', lang));
    if (type === 'temperature' && v > 37.8) warn.push(L('Temperatura elevada — avaliar processo infeccioso.', 'Temperatura elevada — evaluar proceso infeccioso.', 'Elevated temperature — assess for infection.', lang));
  });
  if (vitRows.length) sections.push({ title: L('Sinais vitais recentes', 'Signos vitales recientes', 'Recent vitals', lang), body: vitRows.join(' · ') });

  // per-batch vitals history — each save = one marked visit with date/time/user
  const batches = new Map();
  d.measurements.forEach(m => { if (m.vitals_batch) { if (!batches.has(m.vitals_batch)) batches.set(m.vitals_batch, []); batches.get(m.vitals_batch).push(m); } });
  if (batches.size) {
    const hist = [...batches.entries()].sort((a, b) => String(b[1][0].measured_at || '').localeCompare(String(a[1][0].measured_at || ''))).map(([bid, ms]) => {
      const first = ms[0];
      const when = String(first.measured_at || '').replace('T', ' ').slice(0, 16);
      const who = first.user_name || L('—', '—', '—', lang);
      const vals = ms.map(m => fmtVit(m.type, m.value)).join(' · ');
      return `${when} · ${L('por', 'por', 'by', lang)} ${esc0(who)} — ${vals}`;
    });
    sections.push({ title: L('Histórico de sinais vitais (por coleta)', 'Historial de signos vitales (por toma)', 'Vitals history (per collection)', lang), body: hist.join('<br>') });
  }

  // 4b — visits (each recorded consultation)
  if (visits.length) {
    const visitRows = visits.map(v => {
      const when = String(v.visit_date || '').replace('T', ' ').slice(0, 16);
      const comp = v.complaint ? ` — ${esc0(v.complaint)}` : '';
      const treat = v.treatment ? ` → ${esc0(v.treatment)}` : '';
      return `${when}${comp}${treat}`;
    });
    sections.push({ title: L('Consultas registradas', 'Consultas registradas', 'Recorded visits', lang), body: visitRows.join('<br>') });
  }

  // 5 — consolidated treatment course
  const steps = [];
  steps.push(L('1. Cuidados gerais: higiene, inspeção diária dos pés, hidratação da pele.', '1. Cuidados generales: higiene, inspección diaria de los pies, hidratación de la piel.', '1. General care: hygiene, daily foot inspection, skin moisturizing.', lang));
  steps.push(L('2. Tratamento das condições ativas conforme protocolos acima (desbaste, medicamentos tópicos, órteses).', '2. Tratamiento de las condiciones activas según protocolos anteriores (desbaste, medicamentos tópicos, órtesis).', '2. Treat active conditions per protocols above (debridement, topical agents, orthoses).', lang));
  if (footmap.some(f => Number(f.status) === 2)) steps.push(L('3. Priorizar o(s) ponto(s) CRÍTICO(s) do mapa dos pés na próxima sessão.', '3. Priorizar el/los punto(s) CRÍTICO(s) del mapa de los pies en la próxima sesión.', '3. Prioritize CRITICAL foot-map point(s) at the next session.', lang));
  if (/diabet/i.test(p.medical_history || '')) steps.push(L('4. Paciente diabético: reforçar prevenção de úlceras, calçado adequado e controle glicêmico.', '4. Paciente diabético: reforzar prevención de úlceras, calzado adecuado y control glucémico.', '4. Diabetic patient: reinforce ulcer prevention, proper footwear, and glycemic control.', lang));
  if (visits.length >= 4) steps.push(L('5. Reavaliar resposta ao tratamento comparando registros fotográficos e medições.', '5. Reevaluar respuesta al tratamiento comparando registros fotográficos y mediciones.', '5. Reassess treatment response by comparing photo records and measurements.', lang));
  sections.push({ title: L('Curso de tratamento sugerido', 'Curso de tratamiento sugerido', 'Suggested treatment course', lang), body: steps.join('<br>') });

  // 6 — follow-up cadence
  const hasCritical = footmap.some(f => Number(f.status) === 2) || d.conditions.some(c => c.status === 'worsening' || c.status === 'needs_attention');
  sections.push({ title: L('Acompanhamento', 'Seguimiento', 'Follow-up', lang), body: hasCritical
    ? L('Retorno recomendado em 7–14 dias para reavaliação dos pontos de atenção.', 'Retorno recomendado en 7–14 días para reevaluación de los puntos de atención.', 'Follow-up recommended in 7–14 days to reassess points of concern.', lang)
    : L('Condições estáveis: retorno em 30–60 dias conforme protocolo clínico.', 'Condiciones estables: retorno en 30–60 días según protocolo clínico.', 'Stable conditions: follow-up in 30–60 days per clinical protocol.', lang) });

  // 7 — warnings
  if (/diabet/i.test(p.medical_history || '')) warn.push(L('Diabetes documentada — risco elevado de complicações em extremidades.', 'Diabetes documentada: riesgo elevado de complicaciones en extremidades.', 'Documented diabetes — elevated risk of extremity complications.', lang));
  if (warn.length) sections.push({ title: L('Sinais de alerta', 'Señales de alerta', 'Warning signs', lang), body: warn.filter((v, i, a) => a.indexOf(v) === i).join('<br>') });

  // 8 — referrals
  if (/diabet/i.test(p.medical_history || '')) refs.push(L('Endocrinologia — otimização do controle glicêmico.', 'Endocrinología: optimizar el control glucémico.', 'Endocrinology — optimize glycemic control.', lang));
  if (footmap.some(f => Number(f.status) === 2)) refs.push(L('Avaliação médica para ponto crítico no mapa dos pés.', 'Evaluación médica para punto crítico en el mapa de los pies.', 'Medical evaluation for critical foot-map point.', lang));
  sections.push({ title: L('Possíveis encaminhamentos', 'Posibles derivaciones', 'Possible referrals', lang), body: refs.length ? refs.filter((v, i, a) => a.indexOf(v) === i).join('<br>') : L('Nenhum encaminhamento indicado com base nos dados documentados.', 'Ninguna derivación indicada según los datos documentados.', 'No referral indicated based on documented data.', lang) });

  return { kind: 'treatment_course', sections, disclaimer: DISCLAIMER, ai: true };
}
const esc0 = s => String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
const PIN_LBL_T = [T('Issue', 'Problema', 'Issue'), T('Observação', 'Observación', 'Observation'), T('Crítico', 'Crítico', 'Critical'), T('Cicatrizado', 'Cicatrizado', 'Healed')];

module.exports = { preAssessment, progressAnalysis, projection, clinicalTimeline, dashboardAlerts, dashboardStats, getPatientData, footMapSuggestion, treatmentCourse, DISCLAIMER };
