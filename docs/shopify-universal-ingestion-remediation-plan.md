# Universal Shopify Ingestion Remediation Plan

Status: temporary working plan
Created: 2026-07-26
Delete when: every accepted finding is fixed, regression-tested, verified at the
required fixture/local/shared-store/deployed/live level, and durable operating
truth has been folded into the owner plan or implementation runbook.

## Contract

This file tracks adversarial-review findings and their remediation. It is not a
new product specification and does not override:

- `docs/shopify-owner-workflow-plan.md`
- `docs/shopify-implementation-runbook.md`
- `CONTEXT.md`

Do not implement speculative fixes from this plan. Round 2 and Round 3 may
confirm, revise, split, merge, downgrade, or reject findings with evidence.
Preserve the owner-authored workflow-plan diff unchanged.

## Review sequence

### R1 — Architecture and contract fidelity

Status: complete

Evidence baseline:

- Branch: `main`
- Architecture anchor: `a35877f85a76c33a82f47713fce2b26cec84d2a4`
- Review range:
  `9c41f1f1c3a1f279b55ed3bf9285ad6025ff8de8...a35877f85a76c33a82f47713fce2b26cec84d2a4`
- Local checks: 52/52 tests passed; catalog validation and release audit passed;
  strict Shopify integration proof failed because no usable Storefront response
  was available.

### R2 — Concurrency and security

Status: complete

Evidence baseline:

- Branch and HEAD remained `main` at
  `a35877f85a76c33a82f47713fce2b26cec84d2a4`.
- The owner-plan diff SHA-256 remained
  `272c51ef583c3f631ae5f8f50f41045ed1b832ab6206cb0bcb7da98f637a95f6`.
- Deterministic no-write harnesses reproduced stale-owner overwrite, a newer
  dirty token with no deferred owner, null continuation acceptance,
  authenticated fallback misclassification, arbitrary cart GID admission, and
  persisted exact-line admission bypass.
- A malformed-header matrix rejected missing and wrong HMACs but accepted a
  valid digest with non-base64 junk, accepted the first value of a duplicated
  HMAC header, and accepted a prebuffered 1,048,577-byte raw body.
- `node --test test/*.test.js` passed 52/52; catalog validation, release audit,
  and `npm audit --omit=dev` passed. The strict Shopify validator still failed
  at the Storefront query boundary, so deployed/live behavior remains unproved.
- Official [Upstash REST](https://upstash.com/docs/redis/features/restapi) and
  [EVAL](https://upstash.com/docs/redis/sdks/py/commands/scripts/eval)
  documentation confirms that each script is a server-side Redis operation and
  REST replies expose the Redis result. This makes each script atomic, but does
  not add the missing lease fence or cross-script schedule handoff.
- Official [Vercel Functions](https://vercel.com/docs/functions) and
  [environment](https://vercel.com/docs/deployments/environments)
  documentation confirms that functions can reuse or scale multiple instances
  and that Preview and Production are distinct environments. Process memory is
  therefore not shared authority, and `VERCEL_ENV=preview` does not distinguish
  separate Preview deployments.

### R3 — Browser/runtime fallback and deployed-proof gaps

Status: skipped as a standalone review by owner decision on 2026-07-26

Disposition:

- Do not spend another review slice re-attacking the R1 browser findings before
  remediation.
- Preserve the unverified runtime questions; skipping R3 does not reject or
  close them.
- Address local browser behavior while implementing C5 and C6.
- Defer Vercel routing/CDN, deployed Preview, real Upstash, webhook, and live
  Shopify proof to C8 after the fixes are complete and the owner authorizes
  consequential external actions.

## Finding ledger

| ID | Severity | Axis | Status | Finding |
| --- | --- | --- | --- | --- |
| R1-01 | P1 | Standards | Accepted; C1 | Expired refresh leases allow an older refresh to overwrite a newer generation. |
| R1-02 | P1 | Standards | Accepted; C2 | Missing product/variant/media pagination continuations are silently accepted as complete. |
| R1-03 | P2 | Standards | Accepted; C1 | A webhook arriving during an active refresh, or a scheduled refresh colliding with an active lease, can remain dirty without another deferred refresh. |
| R1-04 | P2 | Standards | Accepted; C7 | README deployment guidance still describes the retired fallback/process-local architecture. |
| R1-05 | P1 | Specification | Accepted; C2 | Any authenticated Storefront failure downgrades to a classification-incomplete query that can expose tag-only drops as ordinary products. |
| R1-06 | P1 | Specification | Accepted; C6 | Existing static product files take filesystem precedence over the generic product rewrite. |
| R1-07 | P1 | Specification | Accepted; C4 | Cart creation accepts syntactically valid arbitrary parent/child GIDs, non-integral quantities, duplicate client configuration IDs, and client money without current catalog admission or rattle-relationship validation. |
| R1-08 | P1 | Specification | Accepted with R2 narrowing; C5 | Persisted exact-variant lines bypass current admission and remain locally checkout-enabled after quarantine or commerce changes; Shopify rejection after deletion/unpublication still requires live proof. |
| R1-09 | P1 | Specification | Accepted; C5 | Lossy Color/Weight normalization can collapse distinct option values and select the wrong variant. |
| R1-10 | P1 | Specification | Accepted; C5 | Generic option-state logic can make valid disconnected or diagonal combinations unreachable. |
| R1-11 | P2 | Specification | Accepted; C5 | Shop projection maps MediaImage IDs but variant assignments use nested Image IDs, causing wrong images. |
| R1-12 | P2 | Specification | Accepted; C6 | Products with no usable image are admitted despite the merchant validation contract. |
| R2-01 | P1 | Specification | Accepted; C3 | Cache namespace isolation is configuration-dependent: one explicit namespace can join Preview and Production, and all Preview deployments otherwise share one `preview` namespace. |
| R2-02 | P2 | Security | Accepted; C3 | Webhook parsing accepts ambiguous/noncanonical HMAC headers and bypasses the one-MiB limit for prebuffered raw bodies. |

## Round 2 finding evidence and regression contracts

### R1-01 — confirmed: refresh commit is not fenced

- **Implementation:** `lib/catalog-freshness.js:103-139`;
  `lib/catalog-durable-store.js:21-27,196-205`.
- **Violated invariant:** `docs/shopify-owner-workflow-plan.md:351-381`
  requires one durable, observable freshness state.
- **Interleaving:** A acquires lease L1 and stalls; L1 expires; B acquires L2 and
  commits generation B; A resumes and the unconditional commit script overwrites
  B with generation A. Compare-delete correctly prevents A from releasing L2,
  but it does not fence A's catalog write.
- **Why tests miss it:** the Map stores do not execute Redis TTL expiry during
  concurrent refreshes, and the Redis command-shape test returns success for
  every `EVAL`.
- **Smallest direction:** make the atomic commit conditional on the current
  lease token or a monotonic fencing revision. A lost owner must not write or
  clear dirty state.
- **Regression:** block refresh A, expire its lease, commit B, then resume A;
  assert B remains authoritative in both a deterministic store and real
  Upstash/Lua proof.

### R1-02 — confirmed: malformed continuations fail open

- **Implementation:** `lib/shopify-catalog.js:143-157,167-194`.
- **Violated invariant:** `docs/shopify-owner-workflow-plan.md:213-219,267-278`
  requires the complete eligible product, variant, and media connections.
- **Failure:** after `hasNextPage: true`, a null product or missing
  variant/media connection becomes `{}`; missing `pageInfo` is treated as
  terminal and the truncated catalog can commit.
- **Why tests miss it:** pagination fixtures provide only complete, consistent
  continuations.
- **Smallest direction:** validate connection, node/edge arrays, boolean
  `hasNextPage`, and cursor consistency on every page; fail refresh and retain
  the last-known-good envelope on any malformed continuation.
- **Regression:** independently remove the product, variant, and media
  continuation connection, nodes, pageInfo, boolean, and cursor; every case
  must reject without committing.

### R1-03 — confirmed and expanded: dirty state can lose execution ownership

- **Implementation:** `lib/catalog-durable-store.js:9-27`;
  `lib/catalog-freshness.js:223-290`; `lib/catalog-webhook.js:134-150`.
- **Violated invariant:** `docs/shopify-owner-workflow-plan.md:361-381`
  requires every valid event to trigger one debounced refresh and normally
  become visible within seconds.
- **Interleaving:** refresh S captures D1; event D2 atomically overwrites dirty
  but cannot claim the occupied schedule key; S preserves D2, releases its
  schedule, and exits without transferring ownership. The same stranded state
  occurs when the deferred refresh loses the lease or deferred execution fails.
- **Why tests miss it:** both invalidations occur before the test refresh
  captures dirty state; no test injects a newer event or lease collision while
  loading.
- **Smallest direction:** atomically complete a refresh by clearing the captured
  dirty value and transferring/rearming schedule ownership when a newer dirty
  value remains; give deferred failures a durable retry path.
- **Regression:** pause S after D1 capture, accept D2, complete S, and require
  exactly one second refresh. Repeat with S colliding with another lease and
  with deferred execution failure.

### R1-05 — confirmed: authenticated failures erase classification

- **Implementation:** `lib/shopify-catalog.js:529-556,591-609`.
- **Violated invariant:** `docs/shopify-owner-workflow-plan.md:299-302,317-335`
  requires tag-or-type drop classification and fail-closed upstream behavior.
- **Attack/failure:** any authenticated timeout, 429, 5xx, or GraphQL error
  retries the basic query. A tag-only limited drop then has no tags and is
  admitted as an ordinary product; the harness reproduced that projection.
- **Why tests miss it:** no test makes the authenticated request fail and the
  basic request succeed with classification-dependent data.
- **Smallest direction:** downgrade only on a narrowly proven field-permission
  error and keep classification-dependent products fail-closed; transient
  failures must retain the last-known-good envelope.
- **Regression:** a transient authenticated failure with a tag-only,
  timing-invalid drop must not commit; a separately modeled permission failure
  must not expose classification-incomplete products.

### R1-07 and R1-08 — confirmed, with R1-08 narrowed

- **Implementation:** `api/shopify-cart.js:47-95,118-170`;
  `assets/js/cart-checkout.js:35-51,159-235,312-361`.
- **Violated invariant:** `docs/shopify-owner-workflow-plan.md:255-265,299-302,
  319-335,507-509,605-611` requires exact admitted variants, one shared rattle
  dependency, authoritative Shopify money, and unavailable-state removal.
- **Attack:** the server accepts any syntactically valid parent and child
  ProductVariant GIDs. Duplicate client `configurationId` values make child
  lookup select the first matching parent; fractional quantity `2.7` passes;
  arbitrary client money passes validation. A persisted exact line reconstructs
  itself without consulting the current catalog and remains locally
  checkout-enabled.
- **Direct evidence:** a no-write probe admitted arbitrary GIDs, quantity `2.7`,
  duplicate configuration text, and `$0.01`; a browser harness with an empty
  current catalog reconstructed a stale exact line and enabled checkout.
- **Narrowing:** Shopify may reject a newly created cart for merchandise no
  longer visible to the Storefront token. That deletion/unpublication behavior
  was not tested live. Quarantined but still Storefront-visible merchandise and
  stale local presentation definitely bypass application admission.
- **Why tests miss it:** the only cart normalization test is one happy line;
  there is no handler-level catalog-admission, nested-parent ambiguity, or
  persisted-cart reconciliation test.
- **Smallest direction:** resolve every request against one current admitted
  generation; derive or validate exact money, integer quantity, eligibility,
  and the single admitted Rattle Add-on server-side; use unique server-owned
  configuration identity and reconcile persisted lines before checkout.
- **Regression:** unknown, hidden, quarantined, stale-generation, changed-price,
  sold-out, wrong-child, ineligible-rattle, duplicate-ID, fractional, NaN, and
  over-limit cases must fail before Shopify; admitted parent/child tuples must
  preserve exact quantity and relationship.

### R2-01 — new: cache namespace isolation can collapse environments

- **Implementation:** `lib/shopify-catalog.js:620-629`; `.env.example:11-18`.
- **Violated invariant:** `docs/shopify-owner-workflow-plan.md:204-219` makes
  the configured Headless publication the inclusion boundary, while
  `docs/shopify-implementation-runbook.md:120-148` uses one Redis service across
  Preview and Production.
- **Attack/interleaving:** the same explicit `CATALOG_CACHE_NAMESPACE` in both
  environments shares envelope, dirty, schedule, lease, and dedupe keys. Without
  an override, every Preview deployment still uses the same `preview`
  namespace, allowing different code revisions to read and overwrite each
  other's schema-compatible-looking state.
- **Why tests miss it:** sharing one namespace is the intended setup in current
  multi-instance tests; no test constructs distinct environment/store
  identities against one Redis database.
- **Smallest direction:** derive and validate namespace identity from shop,
  Vercel environment/deployment role, and schema version; reject an override
  that aliases trust domains.
- **Regression:** Production, two Preview deployments, and two shop identities
  sharing Redis must not read, dirty, dedupe, lease, or overwrite one another.

### R2-02 — new: webhook canonicalization and body limits are incomplete

- **Implementation:** `lib/catalog-webhook.js:21-53,103-126`.
- **Violated invariant:** `docs/shopify-owner-workflow-plan.md:368-371`
  requires unambiguous raw-body HMAC verification before idempotent processing.
- **Attack:** Node's permissive base64 decoder accepts a valid digest followed by
  non-base64 junk; array-valued duplicate headers silently use the first value;
  Buffer/string `rawBody` paths bypass the one-MiB stream limit. The harness
  accepted a junk-suffixed valid signature, a valid-first duplicate header, and
  a signed 1,048,577-byte prebuffered body.
- **Scope:** these forms still require knowledge of a valid HMAC, so this is
  parser ambiguity and resource-limit bypass, not a demonstrated signature
  forgery. The deployed Vercel adapter's prebuffered-body behavior is unproved.
- **Why tests miss it:** tests cover one canonical valid signature and one wrong
  signature; they omit duplicate, comma-joined, noncanonical, and oversized
  Buffer/string inputs.
- **Smallest direction:** require exactly one canonical base64 header value and
  enforce the same byte limit before every body return path.
- **Regression:** oversized Buffer, string, and stream inputs plus duplicated,
  reordered, comma-joined, whitespace/junk-suffixed, invalid-padding, and
  noncanonical HMAC values must fail before invalidation.

## Round 2 test-double and proof limitations

- `createMemoryCatalogStore` is synchronous and single-process; it cannot model
  REST failures, network delay, server-side Lua, Vercel instance loss, or
  deployment skew.
- The fake Redis servers do not implement PX expiry, true concurrent `EVAL`,
  Upstash error/result shapes, aborts, partial failures, or the complete
  invalidation script. One command-shape test returns success for any `EVAL`.
- The child-process test proves only that two processes can read one HTTP Map
  generation. It does not execute Redis, lease expiry, concurrent writers,
  webhook scheduling, or `waitUntil`.
- Local fixture and HTTP proof does not establish deployed Vercel raw-body
  behavior, Upstash atomic behavior, Preview/Production isolation, Shopify
  rejection after unpublication, or abuse/rate limits.

## Planned remediation slices

Implement these slices in order. Each C1-C7 slice is one repository-level
implementation boundary: use focused red-green tests, verify the complete
repository afterward, commit only that slice's owned paths, and relay to a fresh
session before starting the next slice. C8 is an acceptance phase, not an
implementation slice, and requires separate authorization for deployment or
Shopify mutation.

### C1 — Fence refreshes and preserve invalidation ownership

**Owns:** R1-01 and R1-03.

**Dependencies:** none.

**Implementation boundary:**

- Extend the durable-store commit operation so catalog publication succeeds
  only for the current lease owner or fencing revision.
- A refresh that lost ownership must not write the envelope or clear dirty
  state.
- Atomically complete a scheduled refresh by clearing only the captured dirty
  token and claiming a follow-up schedule when a newer dirty token remains.
- Preserve compare-delete lease release; it already protects a successor lease.
- Give lease-collision and deferred-refresh failure paths a bounded durable
  retry instead of relying only on later reads.

**Required tests:**

- A expires, B commits, A resumes; B remains authoritative.
- D2 arrives after D1 capture; exactly one follow-up refresh consumes D2.
- A scheduled refresh collides with another lease and is retried.
- Deferred execution fails after invalidation acceptance and remains recoverable.
- The same transition contract runs against the memory store and the serialized
  Redis command/Lua surface.

**Acceptance:** no stale owner can publish; every accepted dirty token is either
consumed by the current refresh or owns a later refresh.

### C2 — Make Shopify acquisition fail closed

**Owns:** R1-02 and R1-05.

**Dependencies:** C1, so a failed acquisition cannot be followed by a stale
owner commit.

**Implementation boundary:**

- Validate every product, variant, and media connection and pagination
  continuation before normalization.
- Reject missing connections, malformed pageInfo, invalid booleans, missing or
  repeated cursors, and internally inconsistent continuation results.
- Classify Storefront failures. Only a narrowly proven field-permission failure
  may use a reduced query.
- A timeout, 429, 5xx, transport error, or general GraphQL error must retain the
  last-known-good envelope.
- A reduced query must never admit a product whose drop/hidden-add-on
  classification is unavailable.

**Required tests:**

- Malformed product, variant, and media continuation matrices.
- Authenticated timeout, 429, 5xx, transport, and GraphQL failures.
- Explicit field-permission failure separated from transient failure.
- Tag-only drop and hidden add-on remain excluded when classification fields
  are unavailable.
- Failed acquisition leaves the prior generation and quarantine truth intact.

**Acceptance:** an incomplete or classification-blind Shopify read cannot
replace a validated generation.

### C3 — Isolate durable namespaces and canonicalize webhooks

**Owns:** R2-01 and R2-02.

**Dependencies:** C1, because namespace changes cover the same durable keys and
transition scripts.

**Implementation boundary:**

- Derive a namespace from schema version, validated Shopify shop identity, and
  deployment trust domain.
- Ensure Production cannot share catalog keys with Preview. Give distinct
  Preview deployments an intentional isolation rule rather than relying only
  on `VERCEL_ENV=preview`.
- Validate or reject manual namespace overrides that alias trust domains.
- Require exactly one canonical base64 HMAC header.
- Apply the same byte limit to Buffer, string, and streamed raw-body paths.
- Preserve exact shop/topic checks and generic, secret-free error responses.

**Required tests:**

- Production, two Preview identities, and two shop identities sharing one fake
  Redis service cannot read, dirty, dedupe, lease, or overwrite one another.
- Canonical valid HMAC succeeds; missing, wrong, duplicate, comma-joined,
  reordered, junk-suffixed, invalid-padding, and noncanonical forms fail.
- Oversized Buffer, string, and stream bodies fail before invalidation.
- Health and reconcile bearer behavior remains unchanged and secret-free.

**Acceptance:** durable state cannot cross a configured trust boundary, and
only one bounded, canonically signed webhook input reaches invalidation.

### C4 — Enforce server-side cart admission

**Owns:** R1-07.

**Dependencies:** C2, because cart admission depends on a complete,
classification-safe current generation.

**Implementation boundary:**

- Resolve every parent line against one current admitted catalog generation.
- Reject unknown, quarantined, hidden, sold-out, stale-generation, or
  price/currency-mismatched parent lines before calling Shopify.
- Accept only positive integer quantities within the chosen limit.
- Derive or verify the one admitted Rattle Add-on ID server-side and require an
  eligible parent.
- Replace ambiguous client-controlled parent lookup with a unique
  server-controlled configuration relationship.
- Keep Shopify as final inventory and checkout authority; do not calculate a
  substitute checkout price locally.

**Required tests:**

- Handler-level rejection matrix for arbitrary GIDs, hidden/quarantined/sold-out
  variants, stale generations, changed money, wrong currency, wrong child,
  ineligible rattle, duplicate configuration IDs, fractional/NaN/negative, and
  over-limit quantities.
- No rejected request reaches `storefrontRequest`.
- Valid ordinary and rattle-nested carts preserve exact admitted IDs,
  quantities, relationships, and Shopify-returned checkout URL.
- Missing Origin remains covered by an explicit public-endpoint abuse policy
  and request limits rather than being mistaken for authentication.

**Acceptance:** syntax alone can never authorize merchandise or a nested child.

### C5 — Reconcile browser commerce identity

**Owns:** R1-08, R1-09, R1-10, and R1-11.

**Dependencies:** C4, so the browser and server enforce the same admission
contract.

**Implementation boundary:**

- Reconcile persisted exact-variant cart lines after the current generation
  loads and before rendering or checkout.
- Remove or disable lines that are absent, quarantined, sold out, repriced, or
  otherwise changed; show a clear shopper-facing explanation.
- Use lossless Shopify option name/value identity rather than normalized keys
  for exact variant resolution.
- Make every valid arbitrary-option tuple reachable, including diagonal or
  disconnected availability shapes.
- Map variant-assigned Shopify Image IDs to the correct admitted media item and
  preserve the ordered gallery.

**Required tests:**

- Persisted-cart migration across deletion, quarantine, availability, price,
  currency, and generation changes.
- Collision fixtures such as punctuation, Unicode, spacing, and values that
  normalize to the same key.
- Diagonal/disconnected option matrices where every valid tuple remains
  reachable and invalid tuples remain disabled.
- Assigned image leads the gallery without discarding other media.
- Local browser checks at desktop and mobile sizes for selectors, cart notices,
  gallery, and checkout enablement.

**Acceptance:** browser display, stored cart, and server checkout resolve the
same admitted Shopify identity and money.

### C6 — Enforce generic routing and merchant image validation

**Owns:** R1-06 and R1-12.

**Dependencies:** C2 and C5.

**Implementation boundary:**

- Remove filesystem precedence that lets an existing static product shell
  bypass the handle-driven admission route.
- Preserve approved presentation and useful SEO content without allowing a
  static file to become independent commerce authority.
- Return real not-found or unavailable responses for absent, quarantined, and
  expired-stale products.
- Apply the authoritative merchant contract: a product with no usable image is
  product-blocking, while missing alt text remains warning-only.

**Required tests:**

- Established and novel handles traverse the same admission gate.
- Static-file names cannot bypass quarantine, deletion, or unavailable state.
- Missing-image products are quarantined; missing-alt products are admitted with
  a warning.
- Local HTTP and browser checks cover status, content type, visible unavailable
  state, and retained approved layout.

**Acceptance:** every product URL and customer surface is governed by the same
current admission result.

### C7 — Align documentation and release gates

**Owns:** R1-04 and final repository-level verification for C1-C6.

**Dependencies:** C1-C6.

**Implementation boundary:**

- Replace README fallback/process-local guidance with the implemented durable,
  admitted architecture.
- Update the existing runbook with configuration invariants and local proof;
  do not record deployed/live claims that have not occurred.
- Replace source-pattern assertions with behavioral tests where a runtime seam
  exists.
- Keep fixture, local unit, local HTTP/browser, shared-store, deployed Preview,
  and live Shopify evidence labeled separately.

**Required checks:**

- Full Node test suite, catalog validator, release audit, dependency audit, and
  strict Shopify validator.
- Stale-context search for retired fallback, process-local cache, old namespace,
  and static-route claims.
- Dirty-path and owner-plan hash verification.

**Acceptance:** repository documentation and release gates describe and test the
fixed behavior without claiming external proof.

### C8 — Deferred browser, deployed, and live acceptance

**Owns:** the runtime questions intentionally deferred when standalone R3 was
skipped. It does not own new production-code fixes; any failure creates a new
bounded remediation slice.

**Dependencies:** C1-C7 complete and committed.

**Authorization boundary:** deployment, environment changes, webhook
registration, Shopify product mutation, or live checkout requires explicit
owner authorization at the time of action.

**Required proof:**

- Real Upstash Lua/TTL/fencing and multi-instance behavior.
- Vercel Preview namespace isolation, `waitUntil`, routing precedence, clean
  URLs, CDN/cache behavior, and customer-visible HTTP status.
- Desktop/mobile browser behavior for option navigation, media, stale cart
  reconciliation, unavailable states, and checkout.
- Signed webhook create/update/publication/inventory invalidation.
- New ordinary product, price/media/inventory update, quarantine, unpublish or
  delete, exact cart, nested rattle, and checkout handoff against Shopify.

**Acceptance:** all owner-plan completion gates have deployed or live evidence;
fixture results are not substituted for external proof.

## Finding ownership check

| Slice | Findings | Count |
| --- | --- | ---: |
| C1 | R1-01, R1-03 | 2 |
| C2 | R1-02, R1-05 | 2 |
| C3 | R2-01, R2-02 | 2 |
| C4 | R1-07 | 1 |
| C5 | R1-08, R1-09, R1-10, R1-11 | 4 |
| C6 | R1-06, R1-12 | 2 |
| C7 | R1-04 | 1 |
| **Total** | **Every R1/R2 finding exactly once** | **14** |

## Post-C8 readiness implementation plan — 2026-07-27

This section owns the gaps found after C8-R2 and orders the remaining work so
one Production deployment can carry the complete repository state. It does not
reopen the skipped standalone R3 review or weaken the C8 authorization
boundary.

### Release outcome

The release is ready to push only when:

1. every local repository slice below is committed and all local gates pass;
2. Heartlander has the approved title and a valid owner-selected drop window in
   Shopify;
3. owner-supplied inventory is either entered or deliberately left at zero;
4. required Vercel Production values are configured without exposing them;
5. the exact release commit is known before the single push to `main`; and
6. the post-deployment C8 matrix has an evidence owner and rollback decision
   before the deployment starts.

The push itself is not a discovery step. Do not use the one Production
deployment to find repository defects that can be proven locally.

### Post-C8 gap ledger

| ID | Severity | Status | Gap | Owner |
| --- | --- | --- | --- | --- |
| C8-G01 | P2 | Accepted; C8-R3 | The homepage limited-drop gallery drops admitted `model-3d` media instead of preserving an accessible fallback. | Repository |
| C8-G02 | P2 | Accepted; C8-R3 | Homepage gallery tests cover projection and index arithmetic but not DOM mounting, keyboard navigation, video pause, zoom wiring, or accessible state. | Repository |
| C8-G03 | P1 | Accepted; O1 | Shopify still titles Heartlander `Limited Drop` and does not expose a valid `drop_ends_at`, so the fail-closed catalog will quarantine it. | Owner-authorized Shopify operation |
| C8-G04 | P1 | Accepted; O1 | Twelve new PeeWee Football variants and the shared Rattle Add-on still need owner-supplied inventory or an explicit zero-stock decision. | Owner-authorized Shopify operation |
| C8-G05 | P1 | Accepted; C8-R4 and O2 | Production/Preview readiness lacks a repeatable safe preflight, and the last inspection did not show `CATALOG_HEALTH_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, or `CRON_SECRET`. | Repository plus owner-authorized Vercel operation |
| C8-G06 | P2 | Accepted; O2 and C8-A1 | Contact delivery is not proven and the inspected Preview environment lacked `CONTACT_FROM_EMAIL` and `RESEND_API_KEY`; the mail-draft fallback is not delivery acceptance. | Owner-authorized Vercel/Resend operation |
| C8-G07 | P1 | Accepted; C8-A1 | Real Upstash fencing, Vercel routing/`waitUntil`, signed webhooks, live mutations, cart nesting, and checkout remain unproved. | Deployed acceptance |
| C8-G08 | P2 | Accepted; C8-R5 | The Phase 3 mobile owner guide and timed uncoached owner workflow have not been completed. | Repository plus owner usability session |

### Dependency order

```text
P0 plan anchor
  -> C8-R3 local rich-media and gallery regression hardening
  -> C8-R4 deterministic release-preflight gate
  -> O1 owner-authorized Shopify catalog readiness
  -> O2 owner-authorized Vercel/Resend configuration readiness
  -> C8-P1 exact release anchor and single push
  -> C8-A1 deployed/live acceptance
  -> C8-R5 owner guide, usability evidence, and durable closeout
```

`O1`, `O2`, `C8-P1`, and `C8-A1` are consequential operational gates, not
background worker tasks. They require explicit owner authorization at action
time. Slice Relay applies to the ordered repository slices `P0`, `C8-R3`,
`C8-R4`, and `C8-R5`; it must not silently convert an operational gate into a
write-capable repository successor.

### P0 — Anchor the post-C8 implementation plan

**Owns:** the ordered plan and handoff boundary for C8-G01 through C8-G08.

**Implementation boundary:**

- Extend this existing authority instead of creating another plan.
- Preserve all C1-C8 and C8-R2 evidence.
- Identify repository slices separately from Shopify, Vercel, Resend, push,
  deployment, and checkout actions.
- Do not stage or commit the existing C8-R2 implementation work.

**Required checks:**

- Every accepted gap has exactly one primary owner.
- Dependencies produce exactly one first repository slice: C8-R3.
- The plan contains no secret values or authorization by implication.
- `git diff --check` passes for this file.

**Acceptance:** a fresh successor can implement exactly C8-R3 without reading
the old conversation or touching later operational gates.

### C8-R3 — Preserve universal rich media and harden homepage gallery behavior

**Owns:** C8-G01 and C8-G02.

**Dependencies:** P0 committed.

**Editable boundary:**

- `assets/js/limited-drop-gallery.js`
- `test/homepage-limited-drop-gallery.test.js`
- the smallest directly affected fixture or test helper, only if required
- the C8-R3 evidence entry in `docs/shopify-implementation-runbook.md`

**Reference behavior:**

- `assets/js/generic-product-page.js` already preserves `model-3d` media and
  provides the product-page presentation precedent.
- `docs/shopify-owner-workflow-plan.md` classifies unsupported rich media as a
  warning requiring an accessible fallback, not silent removal.
- Preserve the approved card proportions and the current image, native video,
  external-video, zoom, counter, and wraparound behavior.

**Required implementation:**

- Preserve every admitted ordered media item. Render `model-3d` through a safe,
  accessible presentation or fallback without inventing commerce facts.
- Keep image zoom image-only; do not make video, external-video, or model
  fallbacks invoke the image lightbox.
- Mount one slide per preserved item and keep position labels/counter totals in
  the admitted order.
- Pause a native video when its slide becomes inactive.
- Keep previous/next buttons, left/right keyboard navigation, disabled
  single-item controls, and no-media fallback deterministic.
- Do not add a framework or production dependency solely for the tests.

**Required tests:**

- Ordered image, video, external-video, and model media projection.
- DOM mounting creates the correct count, accessible labels, and media element
  or fallback type.
- Previous/next and keyboard navigation wrap in both directions and update the
  counter/hidden state.
- Leaving a native-video slide calls pause.
- Zoom wiring exists only on image slides.
- Single-item and fallback-only states disable or hide unusable navigation
  without losing the product card.

**Verification:**

```bash
node --test test/homepage-limited-drop-gallery.test.js
node --test test/*.test.js
node scripts/validate-catalog.js
node scripts/audit-release.js
npm audit --omit=dev
git diff --check
```

Then run the existing Heartlander fixture on desktop and 375-pixel mobile:
advance through all five media items, wrap both directions, use the keyboard,
open/close image zoom, play then leave the video slide, and confirm no console
warning/error or horizontal overflow.

**Explicit non-goals:** Shopify mutation, Vercel configuration, Preview or
Production deployment, push, checkout, visual redesign, and Phase 3 guide work.

**Acceptance:** the homepage preserves the normalized media contract and its
critical interaction behavior is protected by deterministic tests plus fresh
desktop/mobile browser evidence.

### C8-R4 — Add a deterministic, secret-safe release preflight

**Owns:** the repository portion of C8-G05 and the pre-deployment detection
surface for C8-G03, C8-G04, and C8-G06.

**Dependencies:** C8-R3 committed.

**Implementation boundary:**

- Extend the existing release validation surface rather than adding a competing
  deployment workflow.
- Add one non-mutating preflight command that reports required configuration by
  variable name and evidence class without printing values.
- Check the current Hobby-compatible cron, canonical namespace policy, required
  Shopify/Redis/operational variables, optional contact-delivery variables, and
  exact Git release state.
- Distinguish `BLOCKED`, `READY_LOCAL`, and `READY_TO_PUSH`; local fixtures may
  never produce `READY_TO_PUSH` while an external gate is absent.
- Update the existing README/runbook command list and add focused tests.

**Required tests:**

- Missing required variables fail with names only and never reveal neighboring
  values.
- Placeholder, non-HTTPS durable URL, manual namespace alias, wrong cron, dirty
  release tree, and failed strict Shopify validation block readiness.
- Contact delivery reports separately from core commerce readiness.
- A complete synthetic environment reaches `READY_LOCAL` but not deployed/live
  acceptance.

**Verification:**

```bash
node --test test/*.test.js
node scripts/validate-catalog.js
node scripts/audit-release.js
npm audit --omit=dev
node scripts/validate-shopify-integration.js --strict
git diff --check
```

**Explicit non-goals:** storing or generating production secrets, reading secret
values into logs, changing Vercel or Shopify, deploying, pushing, or claiming
C8 acceptance.

**Acceptance:** one command fails closed before push and tells the owner exactly
which evidence class is still missing without exposing credentials.

### O1 — Owner-authorized Shopify catalog readiness

**Owns:** C8-G03 and C8-G04.

**Entry gate:** explicit authorization for the exact Shopify product and fields,
plus owner-provided title, end time, and inventory decisions. Do not invent an
expiration date or stock count.

**Actions:**

1. Re-read Heartlander and record the before-state without secrets.
2. Rename `Limited Drop` to the approved specific Heartlander title.
3. Set valid `bass_binge.drop_starts_at` and `bass_binge.drop_ends_at` values,
   with end strictly after start.
4. Confirm Active status and Bass Binge Headless publication.
5. Enter owner-supplied counts for the twelve new PeeWee Football variants and
   the shared Rattle Add-on, or record the explicit decision to leave them zero.
6. Re-read the public product and authorized Storefront result; verify price
   `$5.99`, exact variant identity, five media items, option tuple, and complete
   timing.

**Acceptance:** Heartlander is admissible without fixture substitution, and
inventory truth is explicit.

### O2 — Owner-authorized Vercel and contact-delivery readiness

**Owns:** the operational portion of C8-G05 and C8-G06.

**Entry gate:** explicit authorization for the exact Vercel project,
environments, and variable names. Obtain values through secure owner-controlled
flows; never place them in repository files, prompts, logs, or handoffs.

**Required Production and Preview configuration:**

- one Shopify Storefront token that passes the strict catalog query, plus shop
  identity
- one supported Upstash/KV REST URL/token pair
- `SHOPIFY_WEBHOOK_SECRET`
- `CATALOG_HEALTH_TOKEN`
- `CRON_SECRET`
- contact delivery values (`RESEND_API_KEY`, `CONTACT_FROM_EMAIL`,
  `CONTACT_TO_EMAIL`) when direct form delivery is part of this release

Leave `CATALOG_CACHE_NAMESPACE` unset unless it exactly matches the derived
canonical identity. Configure all values before the single deployment; changing
them afterward would require another deployment to affect that release.

**Acceptance:** the secret-safe preflight sees every required variable name in
both target environments, contact readiness is explicit, and no value is
exposed.

### C8-P1 — Exact release anchor and single push

**Owns:** the one-deployment release boundary.

**Dependencies:** C8-R3 and C8-R4 committed; O1 and O2 accepted; no unresolved
P0/P1 repository finding.

**Required pre-push evidence:**

- clean, understood worktree and exact `HEAD`
- all committed slices present and no unrelated file omitted
- full local suite, catalog validation, release audit, dependency audit, strict
  Shopify validation, and release preflight pass at their available evidence
  levels
- live read-only Heartlander admission facts match O1
- Vercel project, branch, domains, environment assignments, and automatic
  Production deployment behavior are confirmed
- a written C8-A1 checklist, observer, and rollback decision exist

After explicit owner authorization, push `main` exactly once. Record the commit
SHA and resulting Vercel deployment ID. Do not trigger a separate manual
redeploy.

**Acceptance:** the only Production deployment is traceable to the verified
release commit and no configuration discovery remains.

### C8-A1 — Deployed and live acceptance

**Owns:** C8-G07 and the deployed portion of C8-G06.

**Dependencies:** the C8-P1 deployment is READY.

**Run in this order and stop at the first broken boundary:**

1. Build/deployment state, canonical domains, clean URLs, route precedence, and
   customer-visible HTTP status.
2. Production namespace/health and real Upstash read/write/fencing behavior
   without exposing safe diagnostics or secrets.
3. Homepage, Shop, Heartlander route, ordered media, arbitrary options,
   unavailable states, stale-cart reconciliation, and no horizontal overflow
   on desktop/mobile.
4. Signed create/update/publication/inventory webhooks and protected missed-event
   reconciliation.
5. Ordinary-product publish, price/media/inventory update within the promised
   freshness window, quarantine, unpublish/delete, and direct-route removal.
6. Exact normal cart, nested Rattle Add-on, quantity/removal synchronization,
   Shopify Cart creation, and authorized test checkout.
7. Contact form delivery when O2 included it; otherwise verify and document the
   mail-draft fallback as the deliberate release behavior.

Record fixture, local, deployed, and live facts separately in
`docs/shopify-implementation-runbook.md`. If acceptance fails, do not spend a
second deployment automatically; record the exact boundary and create the next
bounded remediation slice.

**Acceptance:** every C8 proof item has deployed/live evidence or an explicitly
owner-accepted non-goal.

### C8-R5 — Owner guide, usability evidence, and durable closeout

**Owns:** C8-G08 and final documentation closure.

**Dependencies:** C8-A1 accepted.

**Implementation boundary:**

- Make the existing runbook's owner workflow mobile-first and screenshot-led
  instead of creating duplicate operating truth.
- Have the owner replace one normal color image and create one draft limited
  drop without coaching.
- Record elapsed time and each confusion point; simplify fields, saved views,
  and instructions from observed evidence.
- Require the owner-plan targets: image update under two minutes and complete
  scheduled drop under five minutes.
- Fold durable results into the owner plan/runbook, run stale-context checks,
  and delete this temporary remediation plan only when its closure gate is
  fully satisfied.

**Acceptance:** the owner can perform both workflows without developer help,
durable docs match production truth, and no unresolved ledger item remains.

## Closure and deletion gate

Delete this file only when:

1. R2 is complete, standalone R3 is explicitly skipped, and every accepted
   finding is closed through C1-C7.
2. Every accepted finding has a committed fix and focused regression test.
3. C8 required local-browser, shared-store, deployed Preview, and live Shopify
   evidence is recorded in the existing authoritative runbook.
4. No unresolved item remains in the ledger.
5. A stale-context search confirms no permanent document links to this temporary
   plan.
