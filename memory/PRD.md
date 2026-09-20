# SubMind — Product Requirements Document

## Original Problem Statement
Build **SubMind**, a smart personal **Subscription Manager + AI Link Memory + Reminder Assistant**. Any input (subscription, screenshot, shared link, plan/offer/trial, manual note) flows through one intelligent pipeline: **extract → classify → normalize → dedupe → AI confidence → destination → store → reminder**. Destinations: Subscription, Trial, Plan Watchlist, Link Vault, Reminder, Payment Event, Smart Inbox/Needs Review. The user should rarely fill forms and can ask natural-language questions about everything stored.

## Platform Adaptation (agreed with user)
The original spec targeted native Android (Kotlin/Jetpack Compose) + Cloudflare (Workers/D1/R2). This build adapts the same product to the platform stack:
- **Frontend:** Expo (React Native) + Expo Router
- **Backend:** FastAPI
- **DB:** MongoDB (motor)
- **AI:** Gemini via Emergent universal key (gemini-3.1-pro-preview for vision/complex extraction, gemini-3-flash-preview for fast tasks) — replaces Groq/NVIDIA/Cerebras
- **STT:** Emergent-managed Speech-to-Text (voice input on Ask AI)
- **Auth:** none (single local user, backend id `local`)
- **Deferred (native build only):** Android NotificationListenerService, on-device ML Kit OCR, native Share Sheet. Screenshots handled via photo picker + camera + AI (Gemini vision) OCR.

## User Personas
- **The subscription juggler** — many streaming/AI/SaaS subscriptions, wants renewals + spend at a glance, fears surprise charges and forgotten trials.
- **The saver/researcher** — saves plans and links (Instagram/YouTube/web) to decide later, wants them remembered, summarized, and searchable.

## Architecture
- `backend/server.py` — AI Router (Gemini text+vision, graceful pro→flash fallback), ingest pipeline (text/image/link/notification), CRUD (subscriptions, links, watchlist, reminders, inbox), insights, search, knowledge graph, chat, compare, settings, STT. Card/number masking before AI. Soft deletes. UUID ids, no raw ObjectId returned.
- `frontend/app` — Expo Router. Tabs: Home, Subscriptions, center **+**, Inbox, AI. Secondary: Link Vault, Watchlist, Reminders, Insights, Brain Map (graph), Search, Settings, detail + add flows, scan, actions modal.
- `frontend/src/theme.ts` — light + dark tokens, bright accent palette + `accentFor()` for color-block cards.
- Design: playful bright color-blocks, dark expressive hero, folder-style saved cards, speech-bubble inbox, floating dark pill nav.

## Implemented (2026-09-20)
- Onboarding (3 slides) + first-run flag.
- Home dashboard: dark spend hero (narrative + highlighted figures), monthly/yearly spend, renewals-30d + trials, quick actions (Scan/Paste/Ask AI/Add), shortcut chips, upcoming renewals, recent links.
- Subscriptions: list + status filter chips, detail (status change, record payment, price/payment history, related links, delete), manual add.
- Central + actions bottom sheet with 8 actions.
- Smart Inbox: tabs All/Needs Review/Auto Added/Duplicates + triage (Add/Edit/Merge/Ignore/Watchlist) with confidence badges.
- Screenshot import (camera + library) with permission handling → Gemini vision extraction → inbox.
- Paste Link / Add Note ingest (resilient save + AI enrichment).
- Link Vault: source filter + search, folder-style colored grid, link detail (open, summary, tags, note, reminder, delete).
- Plan Watchlist: statuses, compare (AI), convert to subscription, delete.
- Reminders: presets + custom date, local notification scheduling, complete/delete.
- Ask SubMind AI: chat grounded on stored data + voice input (STT). Insights screen (spend, category breakdown, overlaps, price increases, trials, renewals).
- Knowledge Graph / Brain Map: SVG node graph connecting subscriptions/links/plans/tags/categories.
- Universal search + Settings (currency, AI toggle, thresholds, screenshot storage, price monitoring, theme, privacy note, reset onboarding).
- Full dark-mode support. 18/18 backend tests passing; all frontend routes verified.

## Backlog
### P1
- Real webpage enrichment via Jina Reader + Firecrawl fallback (user to provide keys) for link/plan metadata + price snapshots.
- Plan price monitoring scheduler (daily) with change detection + events.
- Edit-subscription screen (full field editing beyond status).
- Semantic (embedding) search + graph edges from semantic similarity.
### P2 (native build required)
- Android NotificationListenerService renewal/trial detection.
- On-device ML Kit OCR (offline screenshot text) as stage-1 before AI.
- Native Android Share Sheet as a SubMind share destination.
- Offline queue + background sync (WorkManager-style).

## Next Tasks
- Wire Jina/Firecrawl once keys provided; add watchlist price-change events + notifications.
- Add full edit-subscription flow and merge-into-existing UI for duplicates.
