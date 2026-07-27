# Internet Identity Integration Specification

> **Source:** DFINITY Internet Computer Official Skills (`https://skills.internetcomputer.org/skills/internet-identity/`)

## Well-Known Canisters

| Canister | ID | Purpose |
|---|---|---|
| **Internet Identity (Backend)** | `rdmx6-jaaaa-aaaaa-aaadq-cai` | Manages user keys and authentication logic |
| **Internet Identity (Frontend)** | `uqzsh-gqaaa-aaaaq-qaada-cai` | Serves the II web application |

Mainnet Identity Provider URL: `https://id.ai/authorize`

---

## Key Rules & Mistakes to Avoid

1. **Always Include `/authorize` in Provider URL**: The identity provider URL must point to `https://id.ai/authorize`. Omitting `/authorize` causes the login popup to land on the II homepage and never return a delegation.
2. **Delegation Expiry Limits**: Maximum delegation expiry is 30 days (`2_592_000_000_000_000` nanoseconds). Standard session length should be set to 8 hours.
3. **Await Sign-In**: Always `await authClient.signIn()` inside a `try/catch` block to handle user popup cancellation.
4. **Anonymous Principal Check**: If `getIdentity().getPrincipal().toText()` returns `2vxsx-fae`, authentication failed or was cancelled.
