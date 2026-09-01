# Podo360 — AI Cost Model (per patient)

> Last updated: 2026-08-19 · Prices verified Aug 2026 (DeepSeek official docs, Gemini 2.5 Flash)
> Baseline: **20 visits/yr · 5 photos/visit (100 photos/yr) · 20,000 chat tokens/yr per patient**

---

## TL;DR

| Item | Per patient / year |
|---|---|
| 📸 Photo analysis (100 photos, Gemini 2.5 Flash) | **~$0.11** |
| 💬 Chat (20,000 tokens, DeepSeek V4 Flash) | **~$0.008** |
| 💾 Storage (100 photos ≈ 300 MB raw / 50 MB compressed) | **~$0.08** |
| **TOTAL** | **~$0.20 / patient / year** (≈ 1.7¢/month) |

- **Per visit:** ~**half a cent** (5 photos ≈ $0.0055 + a few chat tokens)
- **Per patient added (onboarding + first visit):** ~**2–5¢**
- **Stress case** ("20,000 messages" ≈ 8M tokens): ~**$4.60/yr** — still nothing

**AI cost is never the constraint on Podo360 pricing.** At 10,000 patients → ~$2K/yr total.

---

## 📸 Photo analysis (vision)

Model: **Gemini 2.5 Flash** ($0.30 / 1M input tokens, $2.50 / 1M output tokens) — cheapest capable vision model.

Per photo:
- ~1,200 input tokens (image ~1,000 + prompt ~200)
- ~300 output tokens (structured findings)
- Cost: `1200 × $0.30/M + 300 × $2.50/M` ≈ **$0.0011 / photo**

| Volume | Cost |
|---|---|
| 1 photo | $0.0011 |
| 5 photos (1 visit) | $0.0055 |
| 100 photos (1 patient/yr) | **$0.11** |
| 1,000,000 photos | $1,100 |

**Free tier:** Gemini API free tier = 1M tokens/day ≈ **~800 photos/day at $0**. Early-stage photo load (a clinic's whole day is dozens, not hundreds) can run entirely free.

---

## 💬 Chat assistant

Model: **DeepSeek V4 Flash** (already the live engine in `assistant.js` — `deepseek-chat`, temp 0.3, max_tokens 600).
Official rates (off-peak; peak = ×2):

| | Input (cache miss) | Output |
|---|---|---|
| Off-peak | $0.22 / 1M | $0.66 / 1M |
| Peak (01:00–04:00, 06:00–10:00 UTC) | $0.44 / 1M | $1.32 / 1M |

20,000 tokens/yr split 60/40 in/out (12K in, 8K out):

`12,000 × $0.22/M + 8,000 × $0.66/M` ≈ **$0.0079 / patient / yr** → round to **$0.008**

- ~7.5¢ per 1M chat tokens — a patient would have to chat for hours to cost a dime.
- **Stress case (20,000 messages ≈ 8M tokens):** ≈ **$4.40/yr** per patient.
- Context caching (system prompt + patient history) drops input cost further.

---

## 💾 Storage

- 100 photos × ~3 MB (phone camera) = 300 MB raw; ~50 MB if compressed/re-encoded
- Object storage (S3/Backblaze/R2): **~$0.02–0.06 per GB/mo** → 300 MB ≈ **~$0.08/yr** per patient
- (Compressed: ~1.5¢/yr. Negligible either way.)

---

## Assumptions & knobs

| Assumption | Value | Effect if changed |
|---|---|---|
| Image tokens | ~1,000/photo | Hi-res phone photos can hit ~1,500 → cost ×1.5 |
| Prompt per photo | ~200 tokens | Longer prompts add ~$0.00006/photo |
| DeepSeek rate | Off-peak | Peak hours double chat cost (still trivial) |
| Photos stored | Raw 3 MB | Re-encode → storage ÷ 6 |
| Vision model | Gemini 2.5 Flash | Upgrading to Pro-class ≈ ×4–10 (not needed for wound/lesion measurement) |

---

## Notes for the future

- **Vision is not yet live** — `ai.js` is rule-based today (pre-assessment, progress, projection). This is the cost model for when real vision lands (e.g. Gemini API in a new photo-analysis endpoint).
- **On-device option:** a lightweight classifier (TensorFlow Lite / sherpa-style local models already in the repo) can run photo triage at $0 — reserve API vision for complex cases.
- **Batching:** Gemini batch API = 50% off — irrelevant at this scale, useful at 100k+ photos.
- **The expensive part of Podo360 is never the AI** — it's compliance (BAA/HIPAA posture per ComplyZero) and human support. Price the product on value, not token cost.
