# SubMind: Metro live tiles and connected subscription lifecycle

This change keeps the approved **Lumia-inspired** design: saturated square Metro tiles, large light typography, flat zero-radius surfaces, and flip animations. It deliberately does **not** replace the home screen with rounded dashboard cards.

## Home

- Large live tiles: **My memory**, **Saved links**, **Subscriptions**, **Accounts**, **Reminders** (wide), **Offers**, **Inbox**.
- Small shortcuts: Search, Scan, Save link, More tools. Less-used modules remain available in **More tools**.
- Tile faces show source-backed counts, items requiring attention, upcoming dates, and, where available, selected-currency spend. Tiles flip only while Start is foregrounded, with reduced-motion support.
- Navigation: Start, Plans, Add, Inbox, Ask AI. The tab previously marked `accounts` while opening subscriptions is correctly called `plans`.

## Subscription and account lifecycle

- Subscription record ID is retained. Cancellation/expiry changes **visibility**, not physical ownership of a record. It remains in **Accounts → Cancelled / expired** and any linked account.
- A new subscription with a known provider/email links to an existing matching account or creates an account record needing verification. A subscription's `account_id` is the primary link; the legacy provider/email pair remains a fallback.
- Account edits update locally linked subscriptions; removing an account clears `account_id` but does not delete the subscriptions.
- **Cancelled** is selected only after the user confirms cancellation with the external provider. SubMind cannot cancel the provider's service. **Expired** also requires confirmation.
- Historical payments and plan details remain. Billing-generated reminders are completed or rescheduled as subscription status, renewal dates, or confirmed auto-renew settings change.
- Reactivation does **not** assume the provider has resumed auto-renewing. Use the separate confirmation control in subscription detail to record the verified provider setting.
- Existing imported data is not purged. Older records can associate through provider/email when both are present, without guessing unknown identities.
- Watchlist → subscription conversion links the original plan to the resulting subscription ID; repeated sequential conversion requests return the existing record and the converted plan disappears from the active watchlist. It does **not** assert a paid subscription without user verification.

## Financial handling

- Monthly subscriptions are grouped by **currency**. A selected-currency monthly amount is not a foreign-exchange-converted global total. The dashboard flags that other currencies exist.
- Unverified free trials, manually unconfirmed offers, cancelled/expired plans and paused plans are not counted as confirmed monthly charges.

## Verification

A one-shot GitHub Actions workflow checks Python compilation and offline backend tests, plus a TypeScript check on Expo React Native. Regression tests cover cancellation history/reminders, watchlist conversion idempotence, multiple accounts at one provider, and multi-currency aggregation.

## Limitations and release checklist

- This is a code-change review branch. Do not overwrite or uninstall an existing APK without exporting/backing up the device-only SubMind vault. No migration destroys prior data.
- Not yet a full publicly hosted multi-user product: the optional FastAPI backend needs production authentication, access control, rate limits, and security review **before** internet exposure.
- Provider cancellation and renewal status still require user verification. Notifications require device permissions, and Android device QA is necessary for background timing.
- Multiple requests racing simultaneously from different devices still require a database-level unique/transactional guard; sequential repeat conversion is handled.
- Backend multi-currency summary is currency-separated, not a live FX-converted total.
- No production deploy or APK release is part of this branch. Run CI, device QA, backup/restore test, and review the PR before merging/deploying.
