# SubMind 2.4 — Model reliability, clustered Brain Map, Gmail setup

## NVIDIA provider and HTTP 410

Old SubMind used the retired hard-coded meta/llama-3.1-8b-instruct test model. It could return HTTP 410 even when the API key was valid.

New behaviour: retrieve the accessible chat model list using GET https://integrate.api.nvidia.com/v1/models; prefer current supported Nemotron agent models; send a minimal chat-completions test rather than assuming that listing proves inference works. HTTP 404, 410 and 422 from one model trigger the next available model. HTTP 401, 403 and 429 are authentication, permission and quota conditions and should be shown as actionable errors, not silently bypassed. Users can select Auto or a specific accessible model. NVIDIA free prototyping endpoints are quota-limited and availability depends on the account. An API key is still required.

## Gemini model selector

Filter Gemini API list to stable text generateContent models. Gemini 2.5, all preview/experimental models, "latest" aliases and image/audio-only models are excluded in the selector and in runtime validation. The model list comes from the API, not hard-coded retired versions. If no eligible models are accessible, show an explicit error and allow choosing Groq/NVIDIA.

## Brain Map

The previous random scattered graph is replaced with topic folders/expandable clusters. Similar saved tools appear inside a single cluster, with badges for accounts, plans, offers, links and research prompts. Current clusters cover AI chat/agents, AI video, images/design, app development, automation, learning/research, social/media, finance/plans, wellness and other tools. Names and descriptions are categorised on-device; never assume a tool exists until it is saved. Each item offers navigation to its workspace.

## Gmail Android OAuth — setup exactly once for the signing certificate

1. Open https://console.cloud.google.com and create/select a Google Cloud project. No extra paid subscription is needed for ordinary test-scale Gmail API usage.
2. Go to APIs & Services > Library, search Gmail API and select Enable.
3. Open Google Auth Platform (OAuth consent screen); set app name SubMind, your contact/support email, and **External** audience for ordinary personal Gmail addresses. While in Testing, add each of your Gmail addresses as a test user.
4. In Data Access add https://www.googleapis.com/auth/gmail.readonly. This is a restricted scope. Only request it if you understand the implications; a personal test application is not automatically verified for widespread production use.
5. In Clients / Credentials create an **Android** OAuth client with package name: com.submind.metro.
6. Supply the **SHA-1 fingerprint of the certificate signing the exact APK installed on your phone**. Example local command: keytool -list -v -keystore /path/to/your-signing-key.jks -alias your_alias. For a downloaded APK, use: apksigner verify --print-certs app-release.apk. Each APK signature has its own fingerprint; a different GitHub runner can create a different debug key. Do NOT register an arbitrary SHA-1 or copy a temporary CI fingerprint into production.
7. Save the OAuth client. If a project requires Google OAuth branding/scopes review, follow its console guidance. Keep client IDs, sensitive tokens and passwords out of public GitHub source. Android OAuth clients typically do not require embedding a client secret.
8. Build and install a test APK signed by that same key. Inside SubMind open Vault > Gmail Sync > Connect Google Account. Choose a Gmail test account and allow read-only access.
9. Tap Scan Gmail, choose 30 days / 6 months / 2 years, then open Review extracted records. Verify extracted subscriptions, account signups and offers before approving.
10. Repeat with Switch Account for a second or third mailbox. You only need one configured Android OAuth client for the same app package and signing key, not a separate OAuth client per email account.

Common errors:
- DEVELOPER_ERROR / error 10: package name, OAuth client type or SHA-1 mismatch; verify APK's **real** signing certificate, then reinstall the correctly signed APK.
- 403 after sign-in: Gmail API not enabled, user not in test list, missing scope, or Google policy/verification limitation.
- 401: expired permission or invalid access token; disconnect/reconnect account.
- 429: Google API quota hit.
- The initial temporary CI APK used Android Debug signing (as seen in its build logs). That certificate is not a durable production release key. Pin a stable keystore in build secrets before relying on OAuth across APK updates.

This release is local-first. Gmail scans run while the app is open. Continuous mailbox monitoring or automatic Make.com delivery needs an authenticated backend/channel and is NOT activated by configuring OAuth.
