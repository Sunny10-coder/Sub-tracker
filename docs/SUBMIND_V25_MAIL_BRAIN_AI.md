# SubMind v2.5 — Three Gmail accounts, daily scans, Brain Map goals and model cost controls

## Gmail: three accounts, one local vault

SubMind can register up to **three Android Google Sign-In accounts** in the same installation. Authorise them from **Vault → Gmail Sync → Authorise another Gmail**, choosing each address and granting Gmail Readonly permission. The current native Google Sign-In implementation keeps one active Google session; SubMind attempts to select authorised accounts sequentially with accountName and silent sign-in. Each Gmail API profile and Google identity must match the intended mailbox **before** any messages are read. If silent switching is not supported on a particular device/Google Play Services configuration, the mailbox is flagged **Reconnect needed** rather than being silently skipped or mixed with another account.

No additional Google OAuth credential is required per mailbox if all use the same Android app package and signing certificate. Each Gmail account must be allowed under the Google OAuth Testing audience.

Gmail scope: https://www.googleapis.com/auth/gmail.readonly

Android package: com.submind.metro

The APK must be signed by the certificate whose SHA-1 is registered in the Google Cloud project's Android OAuth client. A GitHub Actions debug APK may be signed with a **different** key; do not assume an existing OAuth registration works for every APK. Use a stable production keystore for installed updates.

## Scanning cadence

- **First setup:** automatically scan the most recent **7 days** per authorised mailbox.
- **Normal use:** a daily scan occurs when SubMind is opened. A successful result creates a per-mailbox 24-hour checkpoint.
- **Catch-up:** after missed days, the scanner automatically extends coverage based on the last checkpoint, up to 30 days. A manual 30-day catch-up action is available.
- **Overlap:** 7-day rolling windows intentionally overlap; mailbox + Gmail message ID + candidate type prevents duplicate processing.
- **Partial fetch:** when the per-mailbox Gmail query hits the scan cap, previously fetched results are preserved but the complete-scan checkpoint is not advanced.
- **Closed app:** no guaranteed daily scan when the Android app is closed. It requires an approved scheduled backend/Make.com integration, not just a phone-local database.

## Smart auto-reconciliation

Mailboxes feed one shared local JSON vault. Each finding is matched against user-created records and previous Gmail discoveries using the provider, plan, account email, source IDs and known aliases. Source message IDs, processing history and canonical provider/plan comparisons prevent duplication.

**Auto-save:** clear account registrations, explicit plan activations, confirmed renewals, appropriately evidenced recurring charges, trials and source-backed promo codes. Strong matching emails update the existing record instead of creating a duplicate.

**Not a payment confirmation:** a generic shopping receipt, a trial offer, login OTP or newsletter. Gmail-only plans with unconfirmed payment are excluded from spending calculations. An activation email may establish Active without establishing a paid charge.

**Review when free:** a conflicting subscription amount, ambiguous plan match, an unconfirmed payment, a generic expiry reminder without a known plan, a verification-only sign-up or a promotion without a definite code. These remain in the optional review inbox, filterable by Today, Last 7 Days or All History and grouped by the email date. Approving a finding still checks for an existing plan.

**Deadlines:** renewal_date, trial_end, access_end and expiry_date are saved separately when present. The Subscriptions page shows the next relevant date and the daily summary uses the correct trial/renewal/expiry candidate. The email's apparent price never becomes a verified transaction without explicit evidence.

## Brain Map

Interactive radial graph with a central SubMind hub, related functional clusters (AI Chat, Video, Images, Development, Automation, Research, Social, Finance, Lifestyle) and tool nodes. Tap a cluster to inspect saved services; tap a tool to navigate to its vault. Zoom or search by service.

The **Find tools I already have** field accepts goals like "I want to make a safety induction video" or "I need to deploy an Android app" and ranks only accounts, subscriptions, prompts and links actually saved in SubMind. It produces tool matches, a short workflow and an optional follow-up into AI Chat. This matcher runs offline without paid API requests. It must not invent subscriptions or claim plan features it has not verified.

In Ask SubMind Chat, goals such as "I want to build..." trigger the same local tool matcher, including suggested follow-up questions. Other questions can use the configured LLM provider, with private records passed as previously configured.

## Gemini 4 Argon cost guard

Gemini 2.5 and preview models remain hidden. Stable Gemini API models are dynamically listed. SubMind prioritizes Flash/Lite models and **never chooses paid Argon automatically**. The chosen provider and model persist in Android app storage. Gemini 4 Argon appears as PAID and requires confirmation **for every API call**. The paid model is limited to a smaller output cap and low thinking level. The app's model selector does not itself charge for inference.

Google's Gemini 4 Argon API is a paid-only model at its introductory pricing through Nov 30, 2026 (see official Google docs), with reasoning/output tokens billed. For safety, model cost estimates and available credits are not invented by SubMind.

## Validation

- Node synthetic regression tests for Gmail noise and account/payment/expiry deduplication.
- TypeScript noEmit validation.
- Expo Android configuration and JavaScript bundle.
- Native APK must still be compiled and checked against the exact installed signing SHA-1.
- Real three-account Gmail switching must be tested on your Samsung Android phone; silent sign-in behavior varies by Google Play Services state.

No email bodies or Google access tokens are exported in SubMind JSON. OAuth sign-in still requires explicit Google consent for each address. No Make.com key is required for the on-device features above.
