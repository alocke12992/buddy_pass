# FORBIDDEN for inaccessible, NOT_FOUND for nonexistent

The API distinguishes "exists but you can't access it" (`FORBIDDEN`: private workout, non-friend's data, revoked link) from "does not exist" (`NOT_FOUND`: unknown id or token). Many privacy-minded APIs collapse both into `NOT_FOUND` to avoid confirming that private data exists; we deliberately do not.

Rationale: workout ids are UUIDv7 and link tokens are ~12-char nanoids — neither is enumerable or guessable, so the existence "leak" requires already possessing the identifier, at which point existence is hardly a secret. In exchange, the UX can be honest and actionable: "this workout is private" and "this link was revoked" are distinct states with distinct copy, instead of a misleading dead end. Future clients must not "fix" this by collapsing the codes; conversely, if ids ever become enumerable (short slugs, sequential ids), revisit this decision.
