# SubMind 2.3 — Unified Metro Vault (Android)

## Features

The existing Expo/React Native app is updated in a separate development branch, not merged into the previous working branch.

Five primary bottom-navigation hubs:
1. **Accounts** — login identities, linked subscriptions, expired plans and Gmail account discovery.
2. **Plans** — subscriptions, trials, renewals, currency-specific spending estimates and screenshot/Gmail capture.
3. **Prompts** — search, create, edit, copy, delete; local tags and relationships with saved research links.
4. **Vault** — Promo Vault, Link Vault, Gmail, AI, monitoring, import/export and important shortcuts.
5. **Brain Map** — interactive graph of services, accounts, subscriptions, prompts, links, tags, offers and watchlist entries.

Promo Vault allows user-selected sources/keywords, on-demand Brave web searches, persistent source URLs, and explicit expiry only where mentioned. All results stay unverified until checked. Link Vault accepts Android Share → SubMind and classifies shared URLs on-device. Gemini enrichment is optional and requires a separate action.

The local data engine uses the existing submind-import-v1 JSON schema. Existing imported accounts and subscriptions remain intact.

## Build prerequisites

Directory: frontend
Stack: Expo SDK 57, React Native, Expo Router, Android.
Native packages: @react-native-google-signin/google-signin 16.1.5 and expo-sharing ~57.0.19.

The native integrations require an APK; they are not available in Expo Go.

Development build commands:
- cd frontend
- yarn install
- npx expo prebuild --platform android --clean
- cd android
- ./gradlew :app:assembleDebug

For a release APK, configure a persistent Android signing keystore. An APK signed with a different certificate is a different Android OAuth identity; it may also fail to update the currently installed app.

## REQUIRED Gmail OAuth setup

1. Create/select a Google Cloud project in https://console.cloud.google.com/.
2. Enable Gmail API, and configure the Google Auth Platform consent screen and app support information.
3. For personal development, set a testing audience and register the Gmail addresses of testers. Production usage of restricted Gmail scopes has additional Google verification considerations.
4. Create OAuth credential of type Android for the exact Android package: **com.submind.metro**.
5. Register the SHA-1 fingerprint of the certificate used to sign the **installed APK**. Find it with keytool -list -v -keystore YOUR_KEYSTORE -alias YOUR_ALIAS. Do not copy an unrelated keystore fingerprint.
6. Enable permission scope: https://www.googleapis.com/auth/gmail.readonly. This is a restricted Google OAuth scope. Follow Google's consent and verification requirements before wider distribution.
7. Install the freshly built APK. Go to Vault → Gmail Sync → Connect Google Account. Authorise access, scan, and manually review the extracted items.
8. Switch Google accounts to scan second or third mailboxes. Only one account is authorised at a time.

A Gemini API key cannot authorise Gmail. No Gmail messages will be accessible until you complete Google OAuth and grant consent on the Android device.

### Gmail privacy and behaviour

- The app fetches matching emails into Android memory and parses them on-device, without sending email bodies to the app backend.
- Extracted fields, message ID, sender, date and subject are stored locally for review; full message bodies are not saved in the vault.
- Google access tokens are managed through the native Google sign-in SDK rather than copied into JSON.
- Review queue dedupes by mailbox + message ID + candidate type. No Gmail-derived subscription is silently declared active or billed.
- Scans run while the app is open and you request a scan. There is **no closed-app background Gmail polling** in this local release.

## Promo Vault setup

1. In Settings → API Keys, save and test a personal Brave Search API key.
2. In Promo Vault → Monitor, add provider names and optional keywords such as a service name, coupon, student offer or giveaway.
3. Tap Scan for a source or Scan All (up to six). Snippets relating to promotions are saved as unverified findings with source URLs.
4. Read and verify the original offer, including expiry, eligibility, renewal charges and whether any coupon works.

Scanning is on-demand. With Make.com Pro, scheduled off-device scanning requires an authenticated cloud endpoint or private cloud file delivery and a separate approved integration; a standalone phone cannot accept inbound Make webhooks reliably while offline.

## Link Vault and AI

- Android Share accepts plain text and URLs, canonicalises known tracking parameters, dedupes by URL, and stores local tags and categories.
- Open a saved link and tap Enhance tags using Gemini AI to give explicit consent to send that URL, title and optional note to the configured Google Gemini API.
- Gemini does not open the target web page as part of this action. It cannot assert page contents from the URL alone.
- Prompts can link to research URLs; matching tags and services appear as graph relationships.

## Local JSON backup

In Settings → Your data, choose Export complete private JSON backup. The Android share sheet lets you choose where to save it.

The export includes accounts, subscriptions, prompts, links, tags, mail review history, monitored sources, findings, benefits and settings. API keys are deliberately excluded and stored separately in Android secure storage.

JSON **is not encrypted**; it can contain account emails and extracted email subjects. Save it in a protected private folder and do not push it to public GitHub.

Restore through Import private JSON. The supported schema is submind-import-v1 and its required keys are subscriptions and accounts arrays; other collections are optional.

## Known limitations and release checks

- Older backend-only routes (such as voice transcription) may still require a server.
- Search snippets and Gmail keyword detection generate candidates, not proof of subscription status, coupon redemption or real expiry.
- Build and native OAuth must be verified using an actual APK and the signing certificate SHA-1 before Gmail is declared functional.
- Verify legacy prompt migration, Android Share receipt, private import/export round trip, Gmail review, promo sources, and Gemini opt-in enhancement on a real Samsung Android device.
- No Make or Google account secrets should be committed to GitHub.
