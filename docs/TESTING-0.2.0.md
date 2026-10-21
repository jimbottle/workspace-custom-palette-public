# Testing 0.2.0

What ships: multiple named palettes with a switcher, organization palettes an admin can publish and optionally enforce, and per-palette sync storage. You need this repo, Chrome, and admin sign-in for the example.org Google Admin console.

**Budget about an hour**, and know where it goes: sections A-B are quick (most of them are machine-checked already, see below), and sections C-F are the hour. Each of the nine console saves in C-F is followed by a cloud propagation wait - Save, then `chrome://policy`, then Reload policies, and sometimes a minute of nothing before the key appears. That waiting is the test exercising the real delivery path, not a delay to route around.

**The one concept that changed during development:** enforcement makes the organization's palette *the one you start on* and *uneditable*. And since the 2026-08-23 ruling, org colors *replace* your default palette outright: while they are all you have, settings offers no Palette selector and no **New palette** button. Building something of your own starts at checking **Multiple palettes** in settings; after that you can create palettes, switch between them, and always switch back to Organization palette — enforcement never blocks creation and never deletes anything of yours. If a step below seems to contradict "enforced means frozen", the step is right.

**Who sets org colors, and how this test sets them:** a Workspace admin, in Google's Admin console — and that is exactly how sections C–F set them here, through the console UI, because a release test must exercise the production delivery path. **Every step below is something you click or type in a browser** — Chrome's own pages (`chrome://extensions`, `chrome://policy`) or the Admin console web UI — with one file you double-click in Finder (NEW-3), which is how the person that page is built for would meet it too. Nothing anywhere in this document runs in a terminal — and that explicitly includes `npm run` commands, which have twice crept in here and been removed (2026-08-22, 2026-08-26). If any step seems to require a terminal, that is a bug in THIS DOCUMENT, not something to work around: stop and report it. Commands that appear below are always labelled as something a machine has already run on your behalf, never as a step.

**Two profiles, used deliberately:**
- Sections A–B: the **personal@example.com** profile (a personal Google account, not in any Workspace org: personal palettes, no org policy can reach it).
- Sections C–F: the **dev@example.org** profile — a real managed account, driven from that org's Admin console.

## Where to pick up

**Round 7 (2026-08-25) passed C1, C2, C3, C4, D1, D2, D3, F1, F2, F3, F4 and failed D4, D5, E1.** All three failures are resolved, two of them in the build and one in this document, so none of them needs re-deriving — but the fixes have not been seen by a person, which is what the next sitting is for.

**What changed since that pass, and the step that checks it:**

| Change | Check it at |
| --- | --- |
| A palette created by SAVING is now `My colors`, not `Default`. This was D4's phantom Default: C3's detach created it, holding the ORG colors. | **C3**, then **D4** |
| The first palette you create is `Palette 1`, not `Palette 2`. **Confirmed working in the field already** — no need to re-check. | — |
| One adaptive brand mark: the settings header, the popup header and the browser tab icon now wear the live palette, vertical stripes, matching the toolbar icon. | **NEW-1** below |
| The toolbar icon repaints when the ADMIN changes the policy. It used to keep the previous org colors indefinitely. | **NEW-2** below |
| The policy builder ships with enforcement TICKED and recommended. | **NEW-3** below |
| D5 and E1 now say to judge from when `chrome://policy` updates, not from the console Save. What was measured was Chrome's propagation. | **D5**, **E1** |
| F1/F2/F3 each got a positive signal, because all three correctly end on a screen that looks unmanaged. | **F1–F3** |

**After each console Save, you can ask for a state read-out instead of guessing.** There is an agent-side check that reads what policy actually arrived, what the extension stored in response, and what the pickers should therefore be showing — computed with the shipping resolver. You do not run it; say "check the state" after a Save and it comes back as a list of hexes to compare against what is on your screen. That is the split the owner asked for: you drive the console and the extension's own UI, the machine reads the state.

### The three new checks

**NEW-1. The brand mark wears your colors.**
DO: open settings and look at the small striped mark left of "Custom Color Palette"; look at the same mark in the popup; look at the icon on the browser TAB for the settings page.
EXPECT: all three show YOUR current palette's leading colors as VERTICAL stripes, and they match the toolbar icon. Change a color and Save: all four follow.
IF NOT (any of them shows a fixed warm cream/orange set that has nothing to do with your palette, or stripes run horizontally): report — that is the packaged fallback, meaning the live palette never reached it.

**NEW-2. The toolbar icon follows an ADMIN change.** This is the one you reported.
DO [YOU]: with a palette published, note the toolbar icon's colors. [ADMIN] In the admin window, publish a visibly different palette and run the delivery ritual [AGENT].
EXPECT [YOU]: once the read-out shows the new value, the toolbar icon repaints to the new colors without you touching anything.
IF NOT: report. The old failure was the icon keeping the previous org palette indefinitely, because a user sitting on the org palette has an empty mirror and the change fired none of the events the icon was listening to.

**NEW-3. The policy builder recommends enforcement.**
DO: on the settings page, scroll to **Administrators** and click **Build organization palette**. It opens in a new tab.
NOTE: that is the route a real administrator takes — the builder now ships inside the extension, so an admin who has it installed needs nothing else. It still needs no server and no build step, so it can equally be sent to an admin who does not have the extension: that is the page plus its script (`options/policy-builder.html` and `options/policy-builder.js`, which must sit beside each other). It was one file until MV3's CSP forced the script out of the page.
EXPECT: a page titled "Organization palette: policy builder", with **"Staff cannot change these colors (recommended)" already ticked**, and the JSON under the "Paste this into “Policy for extensions” based on the directions below." heading containing `"paletteLocked": { "Value": true }` alongside the palette.
DO: untick that box.
EXPECT: the `paletteLocked` key disappears from the JSON entirely rather than becoming `false` — an admin who opts out publishes a payload with nothing to enforce, not one that says enforcement is off.
DO: still on the builder, look at the striped mark left of the "Organization palette: policy builder" heading, then change one of the color values you are building.
EXPECT: the mark repaints to the colors you are publishing, so you can see the set before any staff member does. It shows EVERY usable color, not just the leading few the toolbar icon has room for. With several palettes it previews the FIRST one and says so underneath, since that is the palette staff start on.
IF it stays a fixed warm cream/orange set regardless of what you type: report — that is the packaged fallback, meaning your colors never reached it.
IF NOT (the box starts unticked, or unticking leaves `"Value": false` behind): report.

### The order for the next sitting

1. **NEW-1** and **NEW-3** — no policy needed, two minutes.
2. **C1 → C4**, watching for `My colors` at C3.
3. **D1 → D6**, with **D4** the one that failed last time and should now pass.
4. **NEW-2**, then **E1, E2**.
5. **F1 → F4**.

**What a machine ALREADY RAN, so you are not re-deriving it** (nothing here is a step for you). The page smoke loads this build into a real Chromium and walks A2, A3, B1 (including that opting out suppresses palettes without deleting them), B2, B2b, B6 (the settings half), B6b, B6c, B6e and B6f: **39 checks, all green on the current tree**, including both ways an edit settles (a real Enter keypress and a real blur) with a no-write check before each. It runs the real engine, so unlike the jsdom tests it sees CSS - which is the A3 failure class. Walk the steps anyway if you have the time; the automation only knows the cases someone wrote down. But if one of them fails, that is news, not a known state.

What no scripted automation here can reach, and what this document exists for: the Admin console (enterprise policy is delivered by the console to a managed account, which is the production path a release test has to exercise) and the extension's own pages in the managed profile. Two things the machine CAN do on request, interactively, once you are in C–F: read the delivered policy and stored state ("check the state") and confirm the Brand row inside Docs, Sheets and Slides ("check the surfaces"). The legend at the top of section C says which lines are yours.

Each step is **DO / EXPECT / IF NOT**. Stop where an IF NOT says stop.

## A. Setup

**A0. One copy, right profile — skipping this produced a day of false failures, and now matters more than it used to.**
DO: for sections A–B use the **personal@example.com** profile (no org policy can reach it; the org profile is used deliberately later, in C–F). In whichever profile you are in, open `chrome://extensions` and confirm there is
**exactly one** copy of this extension: the unpacked card whose Details shows this repo's path. If a Web Store copy is also installed (v0.1.7), **Remove** it — its storage is separate and nothing of the dev build is lost.
NEW THIS ROUND: the unpacked build now loads with the SAME ID as the store build (`hchpnnppgakgmobkbldgkohmplkcahjl`), which is what makes section C possible at all — see "Why this section failed the last three times" before C0. The two can no longer coexist, so removing the store copy is no longer just tidiness.

**REMOVING THE EXTENSION WIPES ITS STORAGE.** Chrome deletes an extension's data when you Remove it, so every palette you made in an earlier pass is gone and the profile is back to a clean slate. That is unavoidable whenever the build's identity changes (Reload cannot adopt a new ID), and it is not a bug — a real user never changes ID. It matters for the walkthrough in one place: **D6 needs a palette created before the lock**, so create it during D2/D6 rather than assuming one from a previous sitting is still there. Verified on 2026-08-25, when a Remove-and-reload left the store recreated from empty.
EXPECT: one card.
IF NOT: two copies means two identical toolbar icons and two identically-named sections in `chrome://policy`; grading the store copy is how "missing version number" and "the toggle was never removed" happen while both are fine in the dev build.

**A1.** DO: `chrome://extensions` → Developer mode on → Load unpacked → this repo's root (or hit Reload on the existing card).
EXPECT: the card shows no errors.
IF NOT: stop — the build is broken; report the card's error text.

**A2.** DO: on the card, Details → Extension options.
EXPECT: footer reads `Send feedback · Report a bug · Version 0.2.0`.
IF NOT: you are on a stale build; reload the extension and re-open.

**A3. The one that was broken three times — check it carefully.**
EXPECT on that settings page, with no policy set: **no Palette selector**, and **nothing CLAIMING your organization provides or sets your colors**. An **Administrators** section near the bottom offering "Build organization palette" is expected and is not that claim — it is a tool for setting a policy up, shown to everyone because an admin doing this for the first time has no policy yet to reveal it. There is no on/off switch on this page any more; if you see one, you are on a stale build.
IF NOT (org wording or a selector with no policy): stop — screenshot it and report. This failed three times running for a reason worth knowing: the code was correctly setting `hidden` on both elements the whole time, but each one also had a CSS `display` rule, and an author `display` rule beats the browser's `[hidden]` rule no matter how specific — so `hidden` did nothing on screen. No jsdom test can see that (jsdom does not apply CSS to hidden semantics), which is why 400+ green tests missed it. Fixed by a `[hidden] { display: none !important; }` guard on every page, pinned by a static test and, since this round, by the page smoke, which drives these pages in a real Chromium and so actually computes CSS. That run is green on this build, which means a failure HERE would be something new rather than the old bug returning. Look anyway: the automation checks the cases someone thought to write down, and this is the class of bug that keeps arriving in a shape nobody wrote down.

**A4.** DO: open any Google Doc → select text → toolbar text-color button.
EXPECT: a labeled **Brand** row with your colors above CUSTOM.
IF NOT: `chrome://extensions` → toggle the extension off and on (known Chrome wedge for unpacked extensions), reload the Doc, retry once. Still absent: stop and report.

## B. Personal palettes, no policy

**B1. Multiple palettes is now ON by default (changed 2026-08-24).**
DO: settings → find **Multiple palettes**.
EXPECT: it is already checked, and a **New palette** button is already showing. No selector yet — you only have one palette, and one is not a choice.
DO: uncheck it, then check it again.
EXPECT: unchecking hides the **New palette** button (and any selector); checking it brings them straight back with nothing lost. Turning the opt-in off SUPPRESSES palettes from the chooser, it never deletes them — that is the guarantee this step exists to prove.

**B2.** DO: click **New palette**.
EXPECT: a **Palette** selector appears listing **Default** (the palette you were just looking at, now a real entry) and **Palette 2**; Palette 2 is selected; the editor shows one starter color; status says "New palette created. Add colors and Save."

**B2b.** DO: click **Rename palette**, type `Client work`, press Enter.
EXPECT: the selector now says Client work.

**B3.** DO: change the starter color to a distinctive hex (`#FF00AA`),
**Save**.
EXPECT: "Saved 1 colors…" status.

**B4.** DO: back to the Doc tab (do not reload it), reopen the color picker.
EXPECT: the Brand row now shows only your `#FF00AA` — the switch and the save reached an already-open tab live — and the toolbar icon has repainted to match.
IF NOT: report — the live-update channel is broken. A picker that updates but an icon that does not, or the reverse, is still a report: same channel, different consumers.

**B5.** DO: settings → selector → back to your first palette.
EXPECT: the editor shows the original colors; the Doc's picker follows on reopen, and the toolbar icon follows back too.

**B6.** The mid-switch edit, on each surface — the two hosts answer it differently BY DESIGN (documented decision, 2026-08-23).
DO (popup): change one hex and within a second switch palettes in the selector, then switch back.
EXPECT: the edit LANDED in the palette you typed it in — the popup auto-saves, and switching flushes a pending edit into its own palette before moving; the other palette is untouched. Undo on either palette restores that palette's own colors, never the other one's.
DO (settings): change one hex WITHOUT saving, switch palettes, switch back.
EXPECT: the edit is GONE — settings writes only on **Save**, so an unsaved edit is discarded by the switch; neither palette changed, and the editor shows the returned palette's saved colors.
IF NOT: stop — this is the mid-switch write bug class; report exactly what you saw and on which surface.

**B6b.** DO: **Delete palette** (twice — the first click arms it, asking "Really delete?").
EXPECT: back on Default; the selector hides (one palette is not a choice); nothing else lost. Re-create a second palette if you want to keep testing switches.

**B6c. Reset means "undo my unsaved edits", behind a two-click confirm.**
DO: change a couple of hexes WITHOUT saving, then click **Reset** ONCE.
EXPECT: nothing resets yet — the button relabels to **Really reset?** and a status line spells out the deal: Reset returns to your last saved colors, and changes you have not saved will be lost. Now click somewhere else instead: the button disarms back to Reset and nothing happened — a stray click never resets. Finally arm it again and click **Reset** a second time to confirm.
EXPECT: the colors you last **saved** come back (not the ones the extension shipped with), status says so, and nothing was written — Save is still there if you want to keep the edits after all. On a palette you have never saved, the starting colors are the last saved state, so those are what return.
IF NOT (a single click resets outright, or packaged defaults come back over colors you had saved): report — the first is a missing confirm, the second is the old behavior, so a stale build.

**B6e. Import makes a palette; it does not overwrite one.** DO: note the colors of the palette you are on. Open **Import / export**, paste these two lines into the box, and click **Import from box**:

```
Poppy #FE5917
Grass #385834
```

EXPECT: the status says it imported 2 colors into a new palette, "Imported"; the selector now lists **Imported** and is on it; the editor shows those two colors; and switching back to the palette you started on shows its original colors, untouched. Import no longer replaces what you had.
IF NOT (the colors you were looking at were replaced, or no new entry appeared): report.

Do this one with a **Doc tab already open** if you can, and glance at it after the import: the Brand row and the toolbar icon should both be on the imported colors without a reload. Import creates and switches in a single write, so it rides the same live-update channel B4/B5 cover, and creating is the one part of that channel this round's changes touched.

**B6f. A color is saved when you finish typing it.** DO: open the popup by clicking the toolbar icon. Click into a hex field, select it all, and type a new value slowly, watching the status line. Then press Enter (or click another field).
EXPECT: nothing is saved while you are mid-value — the status stays quiet — and "Saved" appears once you press Enter or leave the field. Now type another value and, without pressing Enter, click on the page behind the popup to dismiss it; reopen the popup.
EXPECT: that value was saved anyway. Both halves matter: a half-typed color must never be stored, and a finished one must never be lost.
IF NOT (the status says Saved while you are still typing, or the value you typed before dismissing is gone): report — this is the data-integrity fix from the last round.

**B6g. Clean up the test palettes.** DO: delete the `Imported` palette from B6e, and any palettes named `Palette 1`…`Palette 10` left by earlier rounds, with **Delete palette** (two clicks each) — keep Default and at most one real one.
EXPECT: they go, and the selector hides once a single palette is left. Worth doing before section C so the org entry is easy to spot in the list.

**B7.** DO: uncheck **Multiple palettes**.
EXPECT: selector and New palette hide; whichever palette was active keeps applying in pickers. Every palette you made is still stored — re-check the box and they are all back, in order. Leave it CHECKED before moving on, since that is now the default state.

## C. Organization palette as a default (unlocked)

Everything from here to the end uses two browser windows side by side:

- The **admin window**: any browser signed in to `admin.google.com` as the example.org admin account.
- The **user window**: Chrome running the **dev@example.org** profile (the avatar at Chrome's top right shows who you are). Do A0's one-copy check in this profile too — exactly one copy, loaded from this repo — and reload it if you have not since Step 0.

### Who does what in C–F

Every DO from here on carries one of three tags. This is the split the owner asked for on 2026-08-25 ("in the future this could be automated with you confirming this behavior and only having me do the admin elements"):

- **[ADMIN]** — you, in the Admin console. Exercising the production delivery path is the point of these sections, so nothing here is automated away.
- **[YOU]** — you, in the extension's own pages: the popup, Settings, `chrome://extensions`, `chrome://policy`. Browser control refuses `chrome-extension://` and `chrome://` URLs outright, so these stay yours.
- **[AGENT]** — the machine, on request. Two checks, both read-only and both proven on 2026-08-24/25 with live org policy in force:
  - **"check the state"** — reads what policy actually arrived (straight off Chrome's managed store on disk, so it is the delivered cloud policy, not a guess), what the extension stored in response, and, computed with the shipping resolver, the hexes every picker should be showing. Say it after any console Save; it replaces the `chrome://policy` reload for the "did it arrive, and is it the right payload" question.
  - **"check the surfaces"** — opens Docs, Sheets and Slides in the user profile and confirms the Brand row: label present, tooltips carrying the names, no stray check marks, and a brand colour actually applying with its hex read back from the rendered canvas. This is driven interactively through browser control rather than scripted; scripting it from Node would mean attaching Playwright to your running Chrome, which was considered and not pursued (bd `workspace-custom-palette-0dj`).

**Your list, C–F, is only the [ADMIN] and [YOU] lines.** Compactly:

| Step | [ADMIN] console | [YOU] extension pages | then say |
| --- | --- | --- | --- |
| C0–C0b | find the field, add from the Web Store, Allow install | — | — |
| C0c | — | `chrome://extensions` ID check | — |
| C1 | paste unlocked palette, Save | — | check the state |
| C2 | — | popup + Settings expectations | check the surfaces |
| C3 | — | edit one hex, Save | check the surfaces |
| C4, C4b | — | popup **Use organization palette**; opt-out round trip | — |
| D1 | paste locked payload, Save | popup + Settings read-only | check the state |
| D2–D4b | — | New palette, switch, delete, opt-out round trip | check the surfaces (D2) |
| D5 | remove lock, Save; restore lock, Save | popup left OPEN, watch it | check the state (each Save) |
| D6 | remove lock, Save | New palette `Keep me` `#7733AA`, Save first | check the state, check the surfaces |
| NEW-2 | publish a different palette, Save | watch the toolbar icon | check the state |
| E1 | paste `palettes`, Save | selector lists Retail, Wholesale, Keep me | check the state, check the surfaces |
| E2 | — | selector → Wholesale | check the surfaces |
| F1 | paste lock-only, Save | editor stays editable | check the state |
| F2 | paste degenerate palette, Save | own colours, editable | check the state, check the surfaces |
| F3 | empty the box, Save | own colours back | check the state |
| F4 | — | personal profile untouched | — |

`chrome://policy` is still there for you as a second opinion at any point, and it is the fallback if the state read-out says nothing arrived: the "No policies set" troubleshooting list under C0 applies unchanged.

### Why this section failed the last three times

Worth sixty seconds, because it explains every symptom you hit and the reason the steps below now read differently.

**The old step 4 asked for something that cannot exist.** It told you to find or add the extension by the ID `lcgphmdkenfmepgpenegnbepjkpgmbci`. That is the ID of an **unpacked** extension, and Chrome derives an unpacked extension's ID
**from the folder path it was loaded from**. Measured, same code, two folders:

| Loaded from | ID Chrome assigned |
| --- | --- |
| a temp copy | `kdnlgdpfoehpadnbcfijlfknjfldcadn` |
| a second temp copy | `offoifpapdineoklbbkdgndkpapnpdbh` |

So that ID was an artifact of one checkout on one machine. It is not in the Chrome Web Store, which is why the console could not find it, and why
**Add by ID** fell through to demanding a custom URL — the console was asking where on the internet it should fetch an extension that only exists in a folder on your Mac. There was no answer to give it. You were right that it could not be added.

**And the entry you did add pointed at a different extension.** Adding from the Web Store by name gets you the published item, `hchpnnppgakgmobkbldgkohmplkcahjl` — the **0.1.7 store build**. Policy set there is delivered to that ID. Your dev build had a different ID, so it would never have seen a single one of the payloads below even if every step had worked. Two extensions, one getting the policy and the other getting tested.

**The fix, already applied.** `manifest.json` now carries the store item's own public `key`, which pins the ID. The unpacked 0.2.0 build in this repo now loads as `hchpnnppgakgmobkbldgkohmplkcahjl` — the same ID your console entry already targets. Verified: loading this tree now reports exactly that ID. So the console entry you created is the right one, and the policy you set on it lands on the build you are testing. Nothing about this is a workaround; it is how you develop against a published extension's identity, and the Web Store injects that identical field into what it distributes.

**C0. Find the policy field — one-time setup.**

DO [ADMIN], in the admin window:
1. Go to `admin.google.com` and sign in as the org's admin.
2. Click the **Menu** icon (three lines, top left) → **Devices** → **Chrome** → **Apps & extensions** → **Users & browsers**.
3. In the left-hand list, click the org unit that contains `dev@example.org`. If you are unsure which one, the top level works — the user shows under the unit you select.
4. The extension will **not** be in the app list until someone adds it, and a new org has an empty list. To add it: click the **yellow + button** (bottom right) → **Add from Chrome Web Store** → search for `Custom Color Palette` → click the extension → **Select**. Do NOT use **Add Chrome app or extension by ID**: that path is for self-hosted extensions and will ask you for an installation URL there is no answer to. If the entry already exists from a previous attempt, use it.
5. Confirm the row's ID reads `hchpnnppgakgmobkbldgkohmplkcahjl`. This is the one thing in this section worth checking twice: policy is delivered per extension ID, so an entry with any other ID silently tests nothing.
6. Click the extension's name (**Custom Color Palette for Google Workspace Docs, Sheets & Slides**) to open its settings panel, then scroll toward the bottom to the **Policy for extensions** text box. This ONE box carries every payload below.

**C0b. Set the installation policy to Allow, not Force.**
DO [ADMIN]: on that same panel, find the installation policy selector and set it to
**Allow install** (or leave it blank). It must NOT be **Force install**.
WHY: your local 0.2.0 build and the store's 0.1.7 build now share an ID, which is exactly what makes this test possible — but it also means a force-install would have Chrome pull the store's 0.1.7 down on top of the build you are testing.
SETTLED IN THE FIELD, 2026-08-24: policy was delivered to a browser running the unpacked build, with `Source: Cloud` and `Status: OK` on `chrome://policy`, so the payload does reach an extension the console is not force-installing. The rule stands as written — the payload is attached to the extension ID, not to the installation.
IF you see the extension reappear as 0.1.7, or Chrome says the extension is installed by your administrator and cannot be removed: that is this setting. Change it to Allow install and remove the store copy again.

**C0c. THE ID CHECK. Do not skip this one — it is what failed in the field on 2026-08-24, and it costs ten seconds.**
DO [YOU]: in the user window open `chrome://extensions`, turn **Developer mode** on (top right), and read the **ID** printed on the unpacked card.
EXPECT: `hchpnnppgakgmobkbldgkohmplkcahjl`, and exactly one copy of this extension, showing **0.2.0**. If a store copy (0.1.7) is also there, **Remove** it — both now claim the same ID and Chrome will not run two.
IF THE ID IS ANYTHING ELSE (in the field it read `lcgphmdkenfmepgpenegnbepjkpgmbci`): **Remove** the card entirely, then **Load unpacked** → this repo's root again. A plain **Reload** is not enough and never will be: the ID *is* the extension's identity, so Chrome keeps the identity it first registered and will not adopt a new one on reload. Removing and re-loading is what makes it re-read `manifest.json` and pick up the pinned key.
WHY THIS IS THE WHOLE BALLGAME: policy is delivered per extension ID. If the card says one ID and the console entry says another, the console configures one extension while you test a different one — and `chrome://policy` reports **No policies set** forever, with nothing anywhere to hint at why. Reloading policies cannot fix it. Waiting cannot fix it. Only matching the IDs can.

Two things to know before pasting anything:
- Every payload below is COMPLETE. Select what is already in the box (Ctrl/Cmd+A) and replace it — never append.
- Each setting is wrapped as `"name": { "Value": … }`; that wrapper is how Chrome delivers typed policy values. The console refuses malformed JSON, so a typo fails loudly at Save rather than silently later.

**Where Save is, because the console does not make it obvious.** Editing any field turns it yellow, and a **SAVE** button appears in the **upper right of the settings panel** — not next to the box you just typed in, and not at the bottom of the page where you would look for it. Nothing you type takes effect until you click it. After saving, the field stays yellow: that highlight means "set at this org unit", not "unsaved", so do not read it as a failure. The way to confirm a save stuck is to reload the console page and see your JSON still there.

EXPECT: the box exists, accepts typing, and has a **Save** action in the panel's upper right.
IF NOT (there is no Policy for extensions field on the panel): report — that means the manifest's policy schema is not being read. Stop here.

**The delivery ritual — how every console save reaches the browser.** Used by C1, D1, D5, D6, E1, F1, F2 and F3. After each Save in the admin window:
1. Say **"check the state"** [AGENT]. Back comes: the policy that actually arrived (read off Chrome's managed store, so it is the delivered cloud policy), what the extension stored in response (pointer, push memory, your palettes), and — computed with the shipping resolver — **what the pickers should therefore be showing**. It reads only and works while Chrome is running. Read the **delivered policy** line the way you would read the Policy value column: it must be **the payload you just pasted**, not one from another step. Steps in this document deliberately publish different things, including two that publish deliberate garbage, so "a policy is delivered" and "the right policy is delivered" are different facts and only one of them is the one you need.
2. Cloud delivery can lag a minute or two. If the read-out says nothing arrived yet, wait about 60 seconds and ask again, and only then conclude anything.
3. If you want to see it with your own eyes, or the read-out and the screen disagree [YOU]: in the user window open `chrome://policy`, click **Reload policies** (top right), and find the extension's section. Status **OK**, Source **Cloud**, and the **Policy value** column showing the pasted payload is the same fact the read-out reports.

**When the ritual says nothing arrived (the read-out reports no policy, or `chrome://policy` says "No policies set") and you are sure you saved.** Work these in order; the first is the one that has actually bitten, twice.
1. **Check the ID on the card** (C0c). Console entry and `chrome://extensions` must show the same ID. This is the cause until proven otherwise, it is invisible from `chrome://policy`, and no amount of reloading will move it.
2. **Check you are in the right Chrome profile.** The avatar at the top right must be **dev@example.org**. Its own signed-in Google account is what the policy follows — a different profile on the same Mac gets nothing, correctly.
3. **Check the org unit.** The policy must be set on the unit that contains that user, or on a parent it inherits from. Selecting the top-level org is the safe choice.
4. **Check the save really stuck.** Reload the console page. If your JSON is not in the box, it was never saved — see the Save note in C0.
5. Only then consider the Allow-vs-Force question in C0b.
Asking again, or reloading policies more times, is not on this list. Once is enough; twice covers the propagation lag. A third time is a symptom of hoping.

**C1. First palette, unlocked.**
DO [ADMIN]: in the admin window, select everything in the **Policy for extensions** box and paste this over it, then click **Save**:

```json
{
  "palette": { "Value": [
    { "name": "Org Blue",  "hex": "#1A73E8" },
    { "name": "Org Green", "hex": "#34A853" }
  ]}
}
```

Run the delivery ritual [AGENT].
EXPECT: the read-out shows `palette` delivered with Org Blue / Org Green, `activePaletteId = "org"` and `orgDefaultPushed = true` stored, and "the pickers should show" listing exactly `#1A73E8` and `#34A853`.
IF NOT after two asks a minute apart: stop; screenshot BOTH the console panel showing the saved JSON and the full `chrome://policy` page.

**C2. What an unlocked org palette looks like.**
DO [YOU]: two checks in the user window — (a) click the extension's toolbar icon to open the popup; (b) right-click that icon → **Options** (or `chrome://extensions` → Details → Extension options).
DO [AGENT]: say **"check the surfaces"** — the Brand row in Docs, Sheets and Slides, with Org Blue / Org Green applying.
**Two rules changed on 2026-08-24 and both land in this step**, so read them before judging what you see. (1) An unlocked org palette now BECOMES your active palette when it first arrives — but only if the palette it would displace was never customized (a "Default" that is still the packaged colors counts as never customized; anything you edited does not). (2) The **Multiple palettes** opt-in is the only thing that shows the Palette selector, and it now defaults ON — an org palette no longer forces the selector open on its own.

EXPECT: **Org Blue / Org Green are what you land on** — in every picker, in the popup, and on the toolbar icon — without you selecting anything. Settings says "Your organization provides a default palette…". With **Multiple palettes** on (the default), a **Palette** selector lists **Organization palette** with your own palette beside it, and the org entry is the one selected. The editor stays editable: editing keeps a personal copy.
EXPECT ALSO: **your own palette is still there.** It is listed in the selector, under its own name, with its own colors. The org palette took the SELECTION, never the palette — nothing of yours is deleted, and switching back to it works.
IF you had CUSTOMIZED your palette before the org's arrived: you keep yours active instead, deliberately. Nothing anyone typed is ever displaced by an unlocked policy; switch to **Organization palette** by hand to see the org's, or use the popup's **Use organization palette**.
IF NOT (the org colors do not become active for an untouched palette, or your own palette is missing from the selector afterwards): report — the first is the push failing, the second is data loss and is stop-ship.

**C3. Editing detaches your own copy.**
DO [YOU]: on the settings page, change one hex (say `#00AA11`) and click **Save**.
EXPECT: "Saved … as your own. Your organization's updates will no longer change them."
DO [AGENT]: "check the surfaces" — your `#00AA11` replaced the org entry in the Brand row, in all three apps, with no reload.
EXPECT ALSO, and this is new: turn on the Palette selector and look at what that save created. It is named **`My colors`**, NOT "Default" — it holds the organization's colors with your edit, so calling it the default palette was a lie the field caught (round 7, D4). An existing palette keeps its own name when you edit it; only a palette CREATED by a save gets this name.

**C4. Going back.**
DO [YOU]: click the toolbar icon for the popup, then click **Use organization palette**.
EXPECT: org colors back everywhere; the note reverts to saying the organization provides these colors.

## D. Enforcement

**C4b. Opting out returns you to the organization's colors WITHOUT a lock too.** NEW — this is the case you tested on 2026-08-27 and rejected: it used to leave you on your own palette, because the rule was scoped to enforcement. It no longer is.
DO [YOU]: with the policy still UNLOCKED and **Multiple palettes** on, make sure you are on a palette of your own (C3 left you with one).
DO [YOU]: uncheck **Multiple palettes**.
EXPECT: the selector disappears and the editor returns to the organization's colors — but EDITABLE, with Save available, because nothing is enforced. Unlocked org colors are a starting point you may change, not a rule.
IF you stay on your own palette: report — that is the exact behavior that was rejected.
DO [YOU]: check **Multiple palettes** again.
EXPECT: your palette is still in the list with its colors.
IF it is gone: report, and treat it as a stop-ship.

**D1. Turn the lock on.**
DO [ADMIN]: back in the admin window, select everything in the **Policy for extensions** box and paste this replacement — BOTH keys together — then click **Save**:

```json
{
  "palette": { "Value": [
    { "name": "Org Blue",  "hex": "#1A73E8" },
    { "name": "Org Green", "hex": "#34A853" }
  ]},
  "paletteLocked": { "Value": true }
}
```

Run the delivery ritual [AGENT]: the read-out must show `paletteLocked = true` beside `palette`, `enforcementPushed = true` stored, and "enforced: YES" before you judge anything below.
EXPECT [YOU] in both popup and settings: the org palette shown **read-only**, with the editing controls (Add / Save / Reset / Import) gone while it is showing. With **Multiple palettes** on — the default — the note names the control that is actually on screen: "cannot be edited here. **Use New palette below** to make colors of your own." (settings) / "**Use New palette in Settings** …" (popup). There is still no Palette selector, because you have only the one palette and one is not a choice.
EXPECT if you deliberately turned **Multiple palettes** OFF: the **New palette** button is gone and the note points at the opt-in instead — "Turn on Multiple palettes …". Either way the note names something you can actually act on.
IF NOT (a Palette selector offering only "Organization palette" and nothing else, or a note telling you to turn on something already on): report.

**D2.** The push happens once. DO [YOU]: on the settings page, confirm **Multiple palettes** is checked (it is on by default; check it if you turned it off in B7), then click **New palette**.
EXPECT: an editable **Palette 1** appears beside Organization palette — creation works under enforcement, and nothing of the org's was copied into it.
DO [YOU]: open the selector at the top of that page and choose Palette 1.
EXPECT: instantly editable. Then close and reopen the popup. EXPECT: **still on Palette 1**.
DO [AGENT]: "check the surfaces" — the Brand row shows Palette 1's colour, not the org's, under the lock.
IF yanked back to the org palette: stop — the push is re-firing; report.

**D3.** DO [YOU]: selector → Organization palette, then back to Palette 1, watching the note above the editor each time.
EXPECT: on the org entry, read-only again and the note back to the enforced wording; on Palette 1, editable and the note NO LONGER saying the colors cannot be edited. Palette 1 stays in the list untouched throughout.
IF NOT (the note keeps saying "cannot be edited here" while you are editing your own palette): report. Worth watching closely: this was silently wrong until 2026-08-24 — the note only refreshed on a policy event, never on a switch — so this is the first human pass over the fix.

**D4. This is the step that failed in round 7, and the cause is fixed — expect a pass.** What failed: a "Default" appeared that did not hold the packaged default colors. It was created by C3's detach, because a palette created by SAVING used to be named "Default" whatever was in it. Save-created palettes are now `My colors`, so the only thing that can legitimately be called Default here is the packaged palette materialized on purpose.
EXPECT: no personal "Default" palette ever materialized — creating made exactly one new entry, so the selector holds [Organization palette, Palette 1] and nothing else. Then DO [YOU]:
**Delete palette** (two clicks) on Palette 1.
EXPECT: the selector disappears again — back to org-only, still enforced, still read-only, and the Multiple palettes checkbox stays on.
IF a "Default" entry appeared at any point: report — that seeding is retired.

**D4b. Opting out of Multiple palettes returns you to the organization's colors.** NEW — added 2026-08-26 and widened 2026-08-27. It applies whether or not the policy is locked: the lock decides whether the org palette can be EDITED, not which palette a single-palette user is on. You have already confirmed the locked case; the unlocked one is in C4b. You are starting from D4's end state: enforced, org-only, Multiple palettes on.
DO [YOU]: click **New palette**, then **Save**. You are now on a palette of your own, editable.
DO [YOU]: uncheck **Multiple palettes**.
EXPECT: the selector disappears (that is what opting out asks for) AND the editor returns to the organization's colors, read-only, with the enforced note back. Under a lock, "one palette" has to mean the enforced one.
IF you are left sitting on your own colors with no selector to leave them: report — that is enforcement defeated by a checkbox, which is the whole point of the rule.
DO [YOU]: check **Multiple palettes** again.
EXPECT: your palette is still in the list with its colors, exactly as you left it.
IF it is gone: report, and treat it as a stop-ship — opting out is meant to change which palette is active, never to delete one.
DO [YOU]: delete that palette (two clicks) to get back to org-only before D5.

**D5. The lock toggles live.**
DO [YOU]: click the toolbar icon to open the popup and LEAVE IT OPEN on screen. Then [ADMIN], in the admin window, select everything in the policy box and paste this lock-free replacement over it; click **Save**:

```json
{
  "palette": { "Value": [
    { "name": "Org Blue",  "hex": "#1A73E8" },
    { "name": "Org Green", "hex": "#34A853" }
  ]}
}
```

Run the delivery ritual [AGENT] WITHOUT touching the popup — do not close or reopen it while the policy catches up.
**Judge only from the moment the read-out (or `chrome://policy`) shows the new value**, not from when you clicked Save in the console. Cloud propagation is the slow part and it is Chrome's, not the extension's: a tester who started the clock at Save measured 30-45 seconds and read it as a failure (field, 2026-08-25). What is being tested here is that an OPEN surface reacts once the policy has actually arrived.
EXPECT [YOU]: within moments of the key updating, the open popup un-freezes by itself: fields become editable, the note softens. Now [ADMIN] put the lock back (paste the full two-key payload from D1 again), Save, run the ritual [AGENT], still watching the open popup.
EXPECT: it freezes onto the read-only org palette again without being reopened — a fresh enforcement episode.
IF the popup only reacts after you close and reopen it: report — live policy changes must reach an open surface.

**D6. Nothing is ever lost — the stop-ship check.**
DO [YOU]: on settings, click **New palette**, use **Rename palette** to name it `Keep me`, set its starter color to something distinctive (`#7733AA`), and
**Save**. THEN [ADMIN] remove the lock: paste the same lock-free payload as D5, Save, run the ritual [AGENT] — the read-out lists `Keep me` among the stored palettes with `#7733AA`.
EXPECT [YOU]: `Keep me` survived the whole enforcement episode byte for byte — still listed, selected colors intact, fully editable.
DO [AGENT]: "check the surfaces" — the Brand row shows `#7733AA` in all three apps. The org entries are gone (the policy now carries only `palette`), your checkbox is still on.
IF NOT: **stop ship.** Report what is missing or changed.

## E. Several organization palettes

**E1.** DO [ADMIN]: in the admin window, select everything in the policy box and paste this replacement (note it is `palettes`, plural — this REMOVES the single `palette` key from before), then Save:

```json
{
  "palettes": { "Value": [
    { "name": "Retail", "swatches": [
      { "name": "Poppy",    "hex": "#FE5917" },
      { "name": "Sunshine", "hex": "#EABF26" }
    ]},
    { "name": "Wholesale", "swatches": [
      { "name": "Grass", "hex": "#385834" },
      { "name": "Night", "hex": "#1A2D27" }
    ]}
  ]}
}
```

Run the delivery ritual [AGENT], and again judge only from when the read-out shows `palettes` (two published) — not from the console Save.
DO [AGENT]: "check the surfaces" — the Brand row shows Retail's colours (staff start on the first).
EXPECT [YOU]: the selector lists Retail, Wholesale, and `Keep me` from D6 (anything of your own survives alongside). (A selector here without any opt-in is correct and is not D1 regressing: TWO org palettes are already a choice worth surfacing, and switching between org palettes never needed the opt-in — only creating a personal one does.)

**E2.** DO [YOU]: selector → Wholesale. DO [AGENT]: "check the surfaces" — the Brand row shows Grass / Night.

## F. Degenerate policies and teardown

**Read this before F1 and F2, because both of them pass by looking like failures.** Everything up to here has been an admin publishing something sensible and you checking it arrived. F1 and F2 are the opposite: you publish something an admin might publish *by mistake*, and the correct result is that the extension quietly ignores it and leaves the user exactly as they were. So the screen you are looking for in both steps shows **your own colors, fully editable, no organization wording anywhere** — which is indistinguishable from "the policy never arrived" unless you check the payload. That is what the state read-out (or the **Policy value** column on `chrome://policy`) is for: confirm the delivered policy is the degenerate payload you just pasted. Value present + own colors on screen = pass. (Field note, 2026-08-24: this caught a tester out, who reached F2 in order and read a correct skip as enforcement being broken.)

**F1. A lock with nothing to enforce.**
DO [ADMIN]: select all in the policy box and paste just this, then Save and run the delivery ritual [AGENT]:

```json
{ "paletteLocked": { "Value": true } }
```

EXPECT, and this is the POSITIVE signal that separates F1 from "the policy never arrived": the read-out shows **`paletteLocked = true` delivered, no palette, and "enforced: NO"** — it WAS delivered — and [YOU] the extension ignores it. No read-only editor, no enforced note; whatever colors were on screen are untouched and still editable. Delivered-but-inert is the assertion. A lock with no palette to enforce is ignored on purpose, so a typo in the `palette` key can never freeze someone on colors they cannot change.
IF NOT (the editor goes read-only, or an enforced note appears): report — a lock with nothing to lock must never bite.

**F2. Invalid entries are skipped, not fatal.**
DO [ADMIN]: select all and paste this replacement, then Save and run the ritual [AGENT]:

```json
{
  "palette": { "Value": [
    { "name": "",       "hex": "#123456" },
    { "name": "BadHex", "hex": "notacolor" }
  ]}
}
```

EXPECT: both entries are skipped — one has no name, the other has no usable hex — so the organization has published nothing usable at all. Your own colors come back in every picker, fully editable, with no organization wording. **That is the pass**, and here is how you tell it apart from F1 and from F3: the read-out shows the **`palette` key with this degenerate value** and "the pickers should show" listing YOUR colours (F1 showed `paletteLocked`; F3 will show nothing at all). DO [AGENT]: "check the surfaces" — the Brand row shows YOUR colors rather than a blank row or a nameless `#123456` swatch. Value delivered plus your own colors on screen is exactly right. **Multiple palettes** also still behaves normally here (checking it reveals **New palette**), because the opt-in never depended on a policy existing.
IF NOT (the Brand row is empty, a picker shows a black or broken swatch, the page errors, or `#123456` appears as a nameless swatch): report — one bad entry must never take the rest down.

**F3. Teardown.**
DO [ADMIN]: click into the **Policy for extensions** box, select all (Ctrl/Cmd+A), delete so it is completely empty, click **Save**, and run the delivery ritual one last time. (Leaving the extension's console entry itself in place is harmless; removing it is separate post-release cleanup.)
EXPECT: the read-out reports no policy delivered (and `chrome://policy` shows **"No policies set"**) — the only one of F1/F2/F3 where nothing is delivered at all, which is what distinguishes this step from the two before it. [YOU] In the user window the org entries leave the selector and your own colors are back, editable, in every picker.
A note on the sameness, because it caught a tester out (2026-08-25): all three of these steps end with a screen that looks like an ordinary unmanaged install, with no organization wording and no **Use organization palette** control. That is correct in all three — there is nothing to go back TO — so judge them by the Policy value column, which differs in each, not by the screen, which does not. Policy delivered this way is scoped to the managed account — nothing here was ever machine-wide.

**F4. Nothing here was machine-wide.** DO [YOU]: switch to the
**personal@example.com** profile (the one section B used) and open the extension's settings page there.
EXPECT: your own palettes from section B are exactly as you left them, with no organization wording and no org entries in the selector — nothing sections C–F did in the managed profile reached this one. Policy is delivered to the managed account, and palettes are stored per Google account.
IF NOT (org colors or org wording appear in the personal profile): report — that is a scoping bug, and it is the one thing in this document that would be a stop-ship on its own. The key → storage-area → scope table behind this claim is in `docs/DEPLOY.md`, "Where the extension stores things".

## Reporting

For any IF NOT: the step number, a screenshot, and (for C–F) what the state read-out or `chrome://policy` showed at that moment. `docs/TEST_PLAN.md` remains the full assertion reference behind this script.
