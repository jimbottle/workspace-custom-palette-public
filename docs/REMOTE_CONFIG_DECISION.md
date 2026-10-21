# Decision brief: the remote-config hot-fix lever does not exist for store users

**Status: DECIDED 2026-08-19 — Option B.** Evan chose the route that keeps the
privacy stance as it is: `CONFIG_BASE` stays empty for store builds, remote
config is documented as an enterprise / self-hosted facility, and no code,
manifest, privacy or store copy changed. `CLAUDE.md` and `docs/plan.md` were
corrected so they no longer claim a lever store users do not have. Revisit if
and when a break is caused by Google changing their DOM rather than by one of
our own selector bugs (see Recommendation). Written 2026-08-17 for bd
`workspace-custom-palette-307`.

## The situation

The architecture rests on a promise stated in `CLAUDE.md` and `docs/plan.md`:

> A selector fix is therefore a data publish, not a code release - no Web Store
> round-trip.

For anyone who installs from the Chrome Web Store, that is **not currently
true**. `config/endpoints.js` ships `CONFIG_BASE = ""`, so shipped builds never
fetch remote selectors or palette; they run entirely on the packaged fallback.

This is not a bug and not an oversight. The empty default is what keeps
`host_permissions` down to the three `docs.google.com` surfaces and lets
`docs/PRIVACY.md` say, accurately, that "in a default install with no company
server configured, the extension makes no network requests at all." Those are
real assets, especially at Web Store review.

But it means the remediation half of the design - Phases 3, 5 and 7 of
`docs/plan.md`, the config service, the monitor, the remediation loop - only
pays off for deployments that override `CONFIG_BASE` themselves. For everyone
else the lever is not slow; it is absent.

## What it cost us already

The `r0k` incident is the worked example. Google's DOM had not even changed:
our own selector contract keyed on an English `aria-label`, so apply failed in
every non-English UI. The fix was one data file. It still required a full Web
Store release cycle, and in the meantime 0.1.5 and 0.1.6 users outside English
had a visibly broken feature with no path to a fix but an upload and a review
queue.

That is precisely the scenario the remote-config design was built to avoid, and
the design did not fire, because the lever is not connected for the people who
were affected.

## Option A: deploy the config service publicly and point store builds at it

Set `CONFIG_BASE` to a public origin and ship it in the store build.

What it actually costs, all of which must be accepted together:

- **Possibly a `host_permissions` addition** to `manifest.json` for the config
  origin, which triggers Web Store re-review and widens the permission surface
  that `CLAUDE.md` commits to keeping minimal.

  **But check this before weighing it.** The fetch happens from the MV3 service
  worker, where a cross-origin request without host permission is governed by
  ordinary CORS - and `service/app.py` already runs `CORSMiddleware` with
  `allow_origins=["*"]` for `GET`/`OPTIONS`. So there is a third variant:

  **A-lite - public origin serving `Access-Control-Allow-Origin: *`, no
  manifest change, no new permission warning.** It still carries every other
  cost below (hosting, privacy, abuse surface); it just may not carry this one.
  Note `service/app.py`'s own comment asserts the opposite ("host_permissions in
  the manifest let MV3 bypass CORS"), so this is an inherited assumption on both
  sides - **confirm the CORS path against a real store build before relying on
  it**, because the whole permission argument turns on it.
- **Privacy: bigger than a copy edit.** The request body carries no user data,
  but pointing every store install at a Raylytics-operated origin means the
  server receives an **IP address, timestamp and User-Agent from every installed
  copy every 6 hours** (`REFRESH_PERIOD_MINUTES`). That is a passive install
  count, active-user count and rough geography signal, collected by the
  extension's operator, whatever the payload says.

  That is not a rewording problem, it is the "No remote telemetry" commitment
  itself - the one `CLAUDE.md` lists as non-negotiable and
  `FUTURE_IMPROVEMENTS.md` records as explicitly rejected. Concretely it touches:
  `docs/PRIVACY.md`'s "No information about you, your documents, or your usage
  is sent in that request **or anywhere else**", which would need more than the
  "no network requests at all" sentence rewritten; the Web Store data-usage
  disclosure, which asks directly about IP and user-activity collection; and
  `STORE_LISTING.md`. `store-assets/privacy.{html,txt}` and the live raylytics.io
  page need the same edit (see bd `t28`, already in your queue for the URL).

  If Option A is taken, it needs an explicit log-retention commitment - no access
  logs, or immediate discard, or a CDN that terminates without retention - for
  the no-telemetry stance to survive it. Without that commitment, Option A
  quietly converts a claim we currently make absolutely into one with an
  asterisk.
- **An uptime obligation.** `docs/DEPLOY.md` puts `service/` on "your box (Pi 5
  / DigitalOcean)". Pointing every installed copy at it makes a hobby box a
  production dependency for a shipped product. The failure mode is benign by
  design (unreachable server means packaged fallback, which is exactly today's
  behavior), so this is an operational and reputational cost, not a correctness
  one.
- **A new abuse surface.** A public endpoint that ships selectors to every
  install is worth threat-modelling before it exists. `service/alerts.py`'s
  `is_valid_contract` publish gate is the right shape already, but "who can
  publish" becomes a security question rather than an internal one.

What it buys: a selector break, or a repeat of `r0k`, becomes a data publish
that reaches users within the refresh window (`REFRESH_PERIOD_MINUTES`, 6h)
instead of a release cycle. Given that all three field bugs to date were fixable
by data alone, this is not hypothetical value.

## Option B: keep `CONFIG_BASE` empty and call the lever enterprise-only

Accept that store users are served by releases, and that remote config is a
facility for organizations that force-install and run their own service.

- No permission change, no privacy rewrite, no hosting obligation, no new
  endpoint to defend. Today's posture, made explicit.
- The docs that currently overpromise get corrected: `CLAUDE.md`'s "no Web Store
  round-trip" and the equivalent claims in `docs/plan.md` would say plainly that
  the data-publish path applies to self-hosted and enterprise deployments, and
  that store users receive selector fixes through releases.
- The mitigation for store users then has to be **release speed**, not remote
  data: the artifact-drift guards added after `r0k` (`dev/package.sh` re-runs
  Tier 1 at cut time, refuses a dirty tree, and stamps version + commit +
  contract version) plus the new non-English monitor leg are what actually
  shorten the window, by catching the break before users do rather than fixing
  it faster afterwards.

## Recommendation

**Option B for now, deliberately and in writing - with one caveat.**

The reasoning: Option A's costs are front-loaded, permanent and outward-facing,
while its benefit is proportional to how often a *data-only* break reaches
shipped users.

Note the load-bearing cost is **not** the permission warning. If the A-lite
variant above holds, there may be no manifest change at all. What does not go
away under any variant is the privacy one: every install phoning a
Raylytics-operated origin every 6 hours hands us connection metadata we
currently do not receive, and "we collect nothing" is a claim that is either
absolute or worthless. Option A is therefore a decision about the no-telemetry
commitment, not about a permission string - which is a bigger decision than the
first draft of this brief implied, and belongs to you rather than to me.
The evidence base for that frequency is three incidents, all of which were our
own selector bugs rather than Google DOM changes, and all three are now covered
by automated tiers that did not exist when they happened - the pseudo-localized
Tier 1 fixture and the Danish monitor leg. The honest read is that we have been
fixing the *detection* gap, and detection is where the leverage has actually
been.

The caveat, and the thing that should flip this: the moment a break is caused by
**Google changing their DOM** rather than by us, the calculus changes. That
break arrives unannounced, affects every user at once, and cannot be prevented
by better tests - only detected faster and fixed faster. If the monitor ever
catches one of those in the wild, revisit Option A immediately; the work is
maybe a day, and the service already exists.

Whichever way you go, the docs should stop claiming a capability shipped users
do not have. That correction is worth making even if nothing else changes,
because the next person to read `CLAUDE.md` during an incident will otherwise
go looking for a lever that is not there - which is exactly what happened
during `r0k`.

## What I need from you

One line: A or B. On B I will correct `CLAUDE.md` and `docs/plan.md` and close
the issue. On A I will need the origin and hosting decision, plus a
log-retention position, before touching anything; the privacy-copy and any
`host_permissions` change should be their own reviewed commit given they touch
the store listing and the no-telemetry commitment.
