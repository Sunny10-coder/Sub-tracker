# SubMind 2.6 — Claude functional-gap audit and integration log

Branch: `integration/claude-submind-capabilities-20261031`. Review against Claude PR #10 before merging. This document is a code-level audit, **not** an assertion that Android device tests passed.

## Non-negotiable compatibility
- Preserve Claude's existing Lumia/Windows Phone home, app bar, tile animation, color theme, card layout, email parser, link inspection and duplicate-review design.
- Avoid replacing Claude's FastAPI server functionality. Keep optional server data reachable, while privately imported plans and Gmail findings remain in the Android local vault. Records route updates to their owning store.
- Do not commit email bodies, OAuth tokens, API keys, preloaded personal account data, passwords or recovery secrets to this **public GitHub repository**.
- Gmail restricted OAuth scope stays read-only, and its installed Android package **and signing SHA-1** must match registered Google OAuth credentials.

## Actual code fixes

| Screen / action | Gap found in Claude version | Integration change |
|---|---|---|
| More tools / actions | Earlier Gmail, Model Manager, Brain and vault utilities not navigable | Restored tools hub from original action sheet, retaining Claude tile UI |
| Settings | No direct launch actions for restored capabilities | Added Gmail, AI keys, import/export, Brain Map and review shortcuts |
| Accounts list | Missing `/accounts` implementation; account-hub was a broken re-export | Added searchable, filterable list with linked-plan counts and Add button |
| Add account | Missing screen | Added account form with optional sign-in email and no fake status |
| Account detail | Missing route and CRUD actions | Added editable provider/mail/status/notes, copy email, linked plans, delete confirmation |
| My Memory | Local vault response lacked `missing[].missing`, `dont_forget`, grouped totals, promo metadata | Added full Claude UI-compatible local response |
| Subscriptions | Private imported records invisible when server configured | Added hybrid backend+private reads and source-aware local/server updates |
| Add subscription | Could duplicate a local imported plan when backend configured | Added provider+plan+sign-in email identity check and visible failure message |
| Payment button | Sent empty POST; might imply unverified charge | Added amount/currency/date form and duplicate guard, no invented payments |
| Delete subscription/link/account | Irreversible operation without warning | Added confirmations and clarified deletion is NOT cancellation at provider |
| AI chat | Only server chat; older Gemini/Groq/NVIDIA selection absent | Added provider and selectable-model controls within Claude chat, goal follow-ups and actual error reasons |
| Paid Gemini | Hidden/remembered paid model risk | Paid badge + confirmation each message; Auto never reuses remembered paid model |
| Voice mic | Server-only speech transcription; no-server mode hit invalid URL | Added Groq Whisper fallback only when user has Groq key, with explicit errors |
| Screenshot camera | No-server mode failed | Gemini Flash/Lite extractor to local review, with no automatically confirmed plans |
| Paste email | No-server mode had no action | Restricted manual-email extraction + review; excludes verification-code emails |
| Add note | No-server mode lacked ingestion | Saved as manually reviewable local note |
| Inbox filters / review actions | Local Gmail review could not use Claude's account/plan/link/ignore buttons | Added local entry lookup, deterministic rescan, idempotent account/watchlist/link actions and source evidence |
| Link Vault | Tags, opened count and reminders unsupported offline | Local routes for tag counts, open, reminders, canonical duplicate link handling |
| Watchlist Compare | Button returned no analysis without backend | Evidence-only side-by-side local comparison; no invented benefits or FX comparisons |
| Watchlist Move | “Subscribe” implied payment had been activated | Label updated to “Move to plans”; status stays unconfirmed |
| Private import | Prior Excel-derived record set was disconnected from Claude UI | Restored private JSON import and stable dedup across repeated imports and changing renewal dates |
| Export | User could not back up complete private local data | Restored local JSON export excluding stored API credentials |
| Gmail daily scan | No native three-mailbox reader in Claude branch | Restored read-only Google sign-in, scoped 7-day scans, account-id verification, reconciliation and review |
| Android app identity | Claude package differed from previous Gmail OAuth package | Set `com.submind.metro` to match previously configured Google client; signing SHA-1 still needs final verification |

## Honest limitations and acceptance tests
1. **Native build / TypeScript**: the one-shot integration workflow runs `tsc`, Android JS bundle, prebuild, assembleRelease and APK signature inspection. Do not claim pass without confirmed workflow results.
2. **OAuth**: restricted Gmail permission requires Gmail API enabled, relevant test users, SHA-1 for the installed signer and Google approval as applicable. Only one Google Sign-In session can be active; registered mailboxes that cannot silently restore are flagged for interactive reconnection, never read as another identity.
3. **Background synchronization**: daily scanning is best-effort **on app open**, not guaranteed while Android has terminated the app. A separate approved backend/Make schedule would be needed for truly closed-app scanning.
4. **Preloaded personal records**: private workbook-derived JSON must be imported on the device. Never embed the private JSON in a public source repo or APK.
5. **Provider access**: Gemini, Groq, NVIDIA and Brave require user-owned keys, internet access, actual model availability and quotas; we do not assert free usage or guaranteed model availability.
6. **Claude backend**: if an existing backend is configured, its data can be displayed along with locally imported records; writes stay with the source record. Native QA should test a backend failure, app restart and no-network modes.
7. **Risk rules**: one email message ID per Gmail mailbox must not create duplicate plans. Account registrations and offers do not prove payment; cancellation notices must not create a new plan; trial reminders are not charges.
8. **UI QA**: verify every button on Android: add/detail/back/copy/edit/delete, plan compare, record-payment form, scan screenshot, microphone, model switch, Gmail connect/scan/review, Brain goal search, promo codes, link reminders, import/export, Settings.
9. **Paid models**: Gemini Argon and other potentially paid models may be used only following an explicit per-message confirmation in the UI; automatic provider selection must not silently spend paid credits.
10. **Data safety**: old data must remain intact across updates and duplicate imports; check that deleting an app may remove local data, and save an encrypted personal backup separately.

## Deployment instructions
Keep PR #11 **draft** until typecheck + Android release bundle + signature verification pass. Inspect the generated APK on a device before updating an existing installation; Android package identity and signing certificate affect both upgrades and Gmail OAuth. Do not merge automatically into Claude PR #10 or main.
