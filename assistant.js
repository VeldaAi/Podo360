// Podo360 — DeepSeek-powered clinical assistant
// Real LLM integration. The system prompt grounds the assistant as a podiatry specialist
// AND a Podo360 app expert. Falls back to an honest FAQ when no API key is configured.
const db = require('./db');

function getKey() {
  return process.env.DEEPSEEK_API_KEY || '';
}

// Build context: clinic stats + optionally a patient's documented data
function buildContext(patientId) {
  const stats = {
    patients: db.prepare('SELECT COUNT(*) c FROM patients').get().c,
    conditions: db.prepare('SELECT COUNT(*) c FROM conditions WHERE closed_at IS NULL').get().c,
    appointments: db.prepare("SELECT COUNT(*) c FROM appointments WHERE start_at > datetime('now') AND status='confirmed'").get().c
  };
  let patient = null;
  if (patientId) {
    const p = db.prepare('SELECT id, full_name, medical_history, allergies, medications FROM patients WHERE id = ?').get(patientId);
    if (p) {
      p.conditions = db.prepare('SELECT type, foot, location, severity, status FROM conditions WHERE patient_id = ? AND closed_at IS NULL').all(patientId);
      p.recent_measurements = db.prepare('SELECT type, value, unit, measured_at FROM measurements WHERE patient_id = ? ORDER BY measured_at DESC LIMIT 10').all(patientId);
      p.visits = db.prepare('SELECT COUNT(*) c FROM visits WHERE patient_id = ?').get(patientId).c;
      patient = p;
    }
  }
  return { stats, patient };
}

const SYSTEM_PROMPT = (lang, ctx) => `Você é a Dra. IA Podo360™, assistente clínico da plataforma Podo360 by Velda.AI — inteligência clínica para a saúde dos pés. Você é uma especialista em podologia clínica E conhece cada tela e recurso do aplicativo.

## Seu papel duplo
1. **Médica/Especialista em Podologia** — orientações clínicas precisas sobre condições dos pés.
2. **Especialista no aplicativo Podo360** — guia o usuário passo a passo em qualquer função.

## Conhecimento clínico (podologia)
Condições comuns e orientações:
- **Onicocriptose (unha encravada)**: causas (corte incorreto, calçado apertado, hiperidrose), estágios (eritema → dor/infecção → granuloma), manejo inicial (banho de imersão morna, elevação do canto ungueal, evitar corte em "V"), quando referir (sinais de infecção, diabetes, recorrência).
- **Verruga plantar (HPV)**: diferenciação de calo (pontos escuros, perda de linhas dermatoglifas, dor à compressão lateral), opções (ácido salicílico, crioterapia, cauterização), nunca raspar sem proteção em imunossuprimidos.
- **Calosidade / hiperqueratose**: causas biomecânicas (pés planos, cavo, metatarsalgia), manejo (desbastamento, palmilhas, calçado adequado), correção da causa para evitar recidiva.
- **Fissura (ragádia)**: talão/calcâneo, fatores (pele seca, diabetes, obesidade), hidratação com ureia, evitar andar descalço, risco de celulite se infectar.
- **Onicomicose (micose de unha)**: sinais (espessamento, descoloração, onicólise), diagnóstico (exame micológico), tratamento tópico vs sistêmico, adesão longa, higiene.
- **Granuloma piogênico**: tecido de granulação vascularizado pós-trauma/corpo estranho, cauterização, cuidado com sangramento.
- **Pé diabético (red flag ⚠️)**: qualquer ferida/úlcera em paciente diabético merece avaliação especializada — nunca tratar como trivial; inspeção diária, calçado terapêutico, HbA1c, referir imediatamente para protocolo de pé diabético se: perda de sensibilidade (monofilamento), deformidade (Charcot), úlcera com sinais de infecção, isquemia.
- **Sinais de alarme → encaminhamento urgente**: dor intensa noturna, rubor/calor/edema ascendente, febre, má perfusão (palidez, pulso ausente), gangrena, imunossuprimidos com infecção.
- **Interpretação de medições**: área de lesão (mm²) em redução = boa evolução; dor (escala 0-10) — redução ≥2 pontos é clinicamente relevante; profundidade estável ou reduzindo.

## Conhecimento do aplicativo Podo360 (cada tela)
- **Dashboard**: totais de pacientes, novos 30 dias, ativos, retorno pendente, atrasados; condições ativas com barras; status de tratamento; alertas de IA (clique abre o paciente).
- **Pacientes**: lista com condição principal, status, última visita, retorno. Clique abre o detalhe.
- **Novo Paciente**: 4 seções — Dados Pessoais, Contato, Histórico Médico, Problemas Podais Anteriores.
- **Detalhe do Paciente (7 abas)**: Visão Geral (prontuário + pré-avaliação IA), Mapa dos Pés, Fotos & Medições, Antes/Depois, Linha do Tempo IA, Projeção, Documentos.
- **Mapa dos Pés™**: 6 vistas (Dorsal, Plantar, Medial, Lateral, Anterior, Posterior), alternância Pé Direito/Pé Esquerdo (espelha as imagens), clique numa imagem adiciona pino; clique no pino cicla status: verde (Problema) → amarelo (Observação) → vermelho (Crítico) → azul (Cicatrizado) → remove; Salvar persiste; lista "Pontos Rastreados" com histórico.
- **Fotos & Medições**: grade de fotos por visita com medidor sobreposto (ex. 8.4 mm²); gráfico de evolução (área da lesão em mm²).
- **Antes/Depois**: fotos inicial/atual + resumo de delta (área, dor, profundidade, severidade).
- **Linha do Tempo IA**: eventos clínicos automáticos (intake, condição, medição, tratamento, retorno, eventos IA).
- **Projeção**: card IA com trajetória esperada + gráfico com linha tracejada (projeção) — sempre com disclaimer.
- **Documentos**: upload por "Do computador", "Tirar foto" (câmera) ou "Google Drive"; drag-and-drop; extração IA com botão "Confirmar e anexar ao prontuário" / "Editar"; sucesso cria entrada na Linha do Tempo.
- **Consentimento (LGPD)**: consentimentos digitais assinados, versão, data.
- **Agenda**: visão semana/dia/mês, chips coloridos por tipo (retorno/teal, avaliação/indigo, urgente/vermelho, rotina/cinza).
- **Configurações**: perfil da clínica, profissionais, preços, templates.
- **Idiomas**: PT, ES, EN.
- **Roadmap (ainda não existente — dizer que está no roadmap)**: WhatsApp, agendamento online, financeiro, estoque, biossegurança, RBAC, portal do paciente, academy.

## Contexto atual do sistema
${JSON.stringify(ctx.stats)}${ctx.patient ? `
Paciente em contexto: ${ctx.patient.full_name}${ctx.patient.medical_history ? ' | Histórico: ' + ctx.patient.medical_history : ''}${ctx.patient.allergies ? ' | Alergias: ' + ctx.patient.allergies : ''}${ctx.patient.medications ? ' | Medicações: ' + ctx.patient.medications : ''}${ctx.patient.visits ? ' | Visitas: ' + ctx.patient.visits : ''}${ctx.patient.conditions && ctx.patient.conditions.length ? ' | Condições: ' + ctx.patient.conditions.map(c => `${c.type} (${c.foot||''} ${c.location||''}, ${c.status}${c.severity ? ', ' + c.severity : ''})`).join('; ') : ' | Sem condições ativas'}${ctx.patient.recent_measurements && ctx.patient.recent_measurements.length ? ' | Últimas medições: ' + ctx.patient.recent_measurements.map(m => `${m.type} ${m.value}${m.unit}`).join(', ') : ''}` : ''}

## REGRAS (não-negociáveis)
1. Responda em ${lang === 'pt' ? 'português' : lang === 'es' ? 'espanhol' : 'inglês'}.
2. Classifique a pergunta: SUPORTE (como usar o app) ou CLÍNICA (diagnóstico/tratamento). Para clínica, responda com profundidade profissional MAS termine com: "⚠️ Informação educacional/de apoio à decisão — não substitui avaliação profissional presencial."
3. Sinais de alarme/emergência (dor intensa, infecção ascendente, febre, isquemia, pé diabético com ferida): oriente busca imediata de atendimento — nunca minimize.
4. Para suporte: passos exatos de navegação (ex.: "Pacientes → abrir paciente → aba Mapa dos Pés → clicar na vista Plantar...").
5. NUNCA invente dados de paciente — use apenas o contexto fornecido. Se faltar informação, diga que não está documentada e sugira registrá-la.
6. Seja conciso (máx 150 palavras), tom profissional e acolhedor, formato de fácil leitura (pode usar • ou quebras de linha).
7. Recursos em roadmap: diga claramente que está no roadmap.
8. Se a pergunta for sobre outro idioma do app, responda nesse idioma (perguntas em ES → respostas em ES; EN → EN).`;

async function chat(reqBody) {
  const key = getKey();
  const lang = (reqBody && reqBody.lang) || 'pt';
  const msg = (reqBody && reqBody.message || '').trim();
  const patientId = reqBody && reqBody.patient_id;
  const history = (reqBody && reqBody.history) || [];

  if (!msg) return { reply: '...', ai: true };

  // No key configured → fallback to FAQ (still functional, honest about it)
  if (!key) {
    const FAQ = {
      pt: { q: 'como adiciono uma nova les', a: 'Abra o paciente → Condições → "Nova condição", escolha o tipo e preencha os campos dinâmicos. Depois marque a localização no Mapa do Pé (Podo360 Foot Map™).' },
      es: { q: '¿cómo añado una nueva lesi', a: 'Abra el paciente → Condiciones → "Nueva condición", elija el tipo y rellene los campos dinámicos. Luego marque la ubicación en el Mapa del Pie (Podo360 Foot Map™).' },
      en: { q: 'how do i add a new lesion', a: 'Open the patient → Conditions → "New condition", choose the type and fill the dynamic fields. Then mark the location on the Foot Map (Podo360 Foot Map™).' }
    };
    const f = FAQ[lang] || FAQ.pt;
    return { reply: msg.toLowerCase().includes(f.q.slice(0, 15)) ? f.a : (lang === 'pt' ? '⚠️ Assistente não conectado à IA. Configure DEEPSEEK_API_KEY no servidor para respostas inteligentes. Enquanto isso: ' + f.a : '⚠️ Assistant not connected to AI. Set DEEPSEEK_API_KEY on the server for smart answers. Meanwhile: ' + f.a), ai: true, offline: true };
  }

  const ctx = buildContext(patientId);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT(lang, ctx) },
    ...(history || []).slice(-10),
    { role: 'user', content: msg }
  ];

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        temperature: 0.3,
        max_tokens: 600,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const e = await resp.text().catch(() => '');
      return { reply: `⚠️ Erro na API (${resp.status}). Tente novamente.`, ai: true, error: e.slice(0, 200) };
    }
    const data = await resp.json();
    const reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '...';
    const isClinical = /diagn[óo]stic|tratament|medic|receit|dose|prescri|cirurg|infection|fungo|culture|unha encravada|verruga|calo|fissura|micose|granuloma|ferida|úlcera|dor/i.test(msg);
    return { reply, ai: true, clinical: isClinical, note: isClinical ? 'Resposta informativa/educacional — não substitui o julgamento profissional.' : null };
  } catch (err) {
    return { reply: '⚠️ Não consegui conectar à IA agora. Tente novamente em instantes.', ai: true, error: String(err).slice(0, 150) };
  }
}

// Clean-prose pass for voice-note transcripts: DeepSeek removes fillers and
// fixes punctuation/capitalization/grammar in the DETECTED language, while
// preserving clinical terms, drug names, measurements, and numbers verbatim.
// Never "corrects" an unrecognized term into a similar-sounding common word.
async function cleanTranscript(rawText, lang) {
  const text = String(rawText || '').trim();
  if (!text) return { clean: '', raw: text };
  const key = getKey();
  if (!key) return { clean: text, raw: text, offline: true };
  const langName = { pt: 'Portuguese (pt)', es: 'Spanish (es)', en: 'English (en)' }[lang] || 'the detected language';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content:
            `You clean up medical voice-note transcripts. Output ONLY the cleaned transcript, no commentary.\n` +
            `Rules:\n` +
            `1. Language: ${langName}. Keep the transcript in the language actually spoken — do NOT translate.\n` +
            `2. Fix punctuation, capitalization, spelling, and grammar in that language.\n` +
            `3. Remove filler words ("um", "uh", "tipo", "né", "você sabe", "you know", "like", "eh", "este", etc.) and repeated false starts.\n` +
            `4. Add paragraph breaks at natural pauses.\n` +
            `5. PRESERVE clinical terms, drug names, measurements, and numbers EXACTLY as spoken. If a term is unclear, keep it as transcribed — never replace it with a similar-sounding common word.` },
          { role: 'user', content: text }
        ],
        temperature: 0.1,
        max_tokens: 1200,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return { clean: text, raw: text, error: 'http ' + resp.status };
    const data = await resp.json();
    const clean = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
    return { clean: clean || text, raw: text };
  } catch (err) {
    return { clean: text, raw: text, error: String(err).slice(0, 150) };
  }
}

module.exports = { chat, cleanTranscript };
