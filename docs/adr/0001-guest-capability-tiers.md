# Guests can do everything except mint links

Anonymous (guest) sessions power the share → clone → sign-up growth loop, so guests get nearly full API access: clone, build, and log workouts, edit their profile, and *accept* friend links. The one carve-out is minting: creating share links and friend links requires a registered account. The API expresses this as three middleware tiers — `public` (no session), `authed` (any session, anonymous included), `registered` (non-anonymous).

Rationale: links minted by a guest would dangle when the 90-day guest purge deletes their owner, and "sign up to share" is the natural, well-earned upgrade prompt — it triggers exactly when the user has something worth sharing. The rejected alternative (guests mint links too) maximizes virality but ships purgeable link owners; the stricter alternative (guests clone-only) breaks the MVP promise that a recipient can use a shared workout without signing up.
