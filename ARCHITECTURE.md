# PODO360 — BUILD ARCHITECTURE (Source of Truth)

> **Status:** This document is the authoritative build architecture for Podo360™ by Velda.AI.
> **Mandate:** Jason (Aug 15 2026): "Use this as the build architecture."
> **Source:** Consolidated product prompt (53 sections) — clinical intelligence platform for foot health.
> **Positioning:** Measure → Monitor → Analyze → Project. *"Não é apenas um sistema de agenda."*

---

## 1. Product Identity
- **Name:** Podo360™ by Velda.AI
- **Tagline (PT):** Inteligência clínica para a saúde dos pés.
- **Pillars:** Documente • Monitore • Entenda • Antecipe
- **Languages:** PT (primary), ES, EN — full coverage (UI, forms, AI, reports, errors, empty states, chatbot)
- **Target:** Brazil → Spanish-speaking LatAm → Hispanic professionals internationally

## 2. Architecture — Six Core Areas (§6)
The application is organized into 6 major modules:

| # | Area | Modules | MVP (§43) | Phase |
|---|------|---------|-----------|-------|
| 1 | **CLINIC** | Patients, Intake, Prontuário, Conditions, Foot Map, Images, Measurements, Exams, Consent, Clinical Timeline | ✅ | 1 |
| 2 | **MANAGEMENT** | Calendar, Online booking, WhatsApp, Financials, Inventory, Services, Team, Multi-location | Agenda only | 2 |
| 3 | **INTELLIGENCE** | AI Pre-Assessment, AI Timeline, AI Progress, Projection, Alerts, Summaries, Chatbot | Pre-assessment + progress + projection + chatbot | 1 |
| 4 | **EVOLUTION** | Before/After, Graphs, Measurements, Photos, Mycosis Tracker, Treatment history, Reports | Graphs + measurements | 1 (reports 2) |
| 5 | **NETWORK** | Incoming/Outgoing referrals, Partners, Specialists, Referral analytics | Basic referrals | 1 |
| 6 | **PATIENT CARE** | Portal, Education, Follow-up, Reminders, Care instructions, Communication | — | 3 |

## 3. Core Clinical Workflow (§53)
New Patient → Pre-Intake → Clinical Assessment → Select Condition → Foot Map → Photograph → Measure → AI Pre-Assessment → Treatment Plan → Follow-up → New Photograph → New Measurement → AI Progress Analysis → Graph → Treatment Projection → Clinical Timeline → Resolution / Referral / Continued Treatment

## 4. MVP Scope (§43) — locked for v1
Patient registration · Clinical intake · Conditions (8 types, dynamic fields §11) · Foot/Ankle Body Map (§12) · Photographs (§13) · Measurements (§14) · Clinical timeline · Exams/PDF (§22) · Follow-up · AI Pre-Assessment (§20) · Graphs (§16) · Treatment Projection (§17) · Digital consent (§23) · Agenda (§24 basic) · Basic referral management (§32) · PT/ES/EN · AI chatbot (§37)

## 5. Data Model
14 tables (SQLite, `db.js`): patients · conditions (JSON details per type) · footmap_points · visits · images · measurements · timeline_events · exams (ai_extracted + ai_confirmed) · consents · appointments · referrals · ai_reports · settings. Canonical DB values are codes; UI translates per language.

## 6. AI Safety (§41) — NON-NEGOTIABLE
- Never fabricate clinical data, exams, measurements, or history
- AI output always labeled; uncertainty explicit; professional confirms AI-extracted data
- Projections are estimates, never guarantees; AI = decision support, never replacement

## 7. Security & LGPD (§40)
Encryption, role-based access (Phase 2), audit logs, consent management, secure image/doc storage, secure deletion, minimal data exposure. Consent module live (§23).

## 8. Pricing (§46-52) — marketing pages
Essencial R$99,90 · **Professional R$179,90 ⭐** (annual R$1.799 ≈ R$149,92/mo, 12x) · Clinic R$349,90 (+R$49,90/pro) · Founding Members R$129,90/mo or R$1.299/yr (first 100-200). PIX + card + installments.

## 9. Differentiation (§42) — marketing emphasis
Podo360 Foot Map™ · AI Clinical Timeline™ · Mycosis Tracker · Quantitative treatment evolution · AI Progress Analysis · Treatment Projection · Image comparison · Clinical measurements · Patient Education

## 10. Deploy
- Port 3000 (systemd `podo360`) — live at http://82.25.91.25:3000 (+ /app)
- Target: podo360.velda.ai (nginx + LE after Jason adds DNS A record)
- Domains: podo360.com ✅ available, podo360.com.br ✅ available
