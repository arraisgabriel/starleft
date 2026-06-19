# STARLEFT — Save & Cloud-Sync Adversarial Analysis
_Generated 2026-06-18. Static analysis of solo save, Google Drive sync, and co-op (MP) save; every finding adversarially verified (3 independent refutation lenses). Read-only audit — no code changed._

## Executive summary
The save subsystem is functionally rich but its cross-device and multi-writer guarantees rest on a single fragile primitive: `savedAt = Date.now()` is the *sole* reconcile key for Google Drive sync, last-write-wins, and ▶Continue selection — with no monotonic counter, content hash, device id, or server-`modifiedTime` tiebreak. On top of that, every seamless entry point (boot, menu-show, tab-focus) pulls with `autoApply:true`, which silently fast-forwards local slots with no prompt; the interactive conflict overlay's "Keep this device's copy" choice persists nothing and is reversed by the very next ambient pull; push-side error handling buckets auth/quota/network/5xx failures into `skipped` and still reports "Synced ✓"; and the tab-close autosave's cloud push is an 8s `setTimeout` that dies with the page, so every session's final checkpoint is structurally never uploaded. None of the five save writers (solo manual, solo autosave, import, MP host, cloud recreate) share a mutex or atomic write. No defect is Critical (no single-action total wipe), but two High-severity paths can silently destroy the most recent real progress, and a long tail of Medium/Low issues converts "silent data loss masked as success" into a recurring pattern. The rejected-candidate ledger removed five plausible-but-refuted claims (single-threaded JS, present guards, or harmless outcomes).

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 10 |
| Low | 19 |
| Informational | 12 |

## Top data-loss windows
- **[C4] (High):** User clicks ✓ "Keep this device's copy" in the cloud-conflict overlay; the next seamless `autoApply` pull silently overwrites the kept-local save with the cloud copy — directly reversing the explicit choice.
- **[C1] (High):** Two devices on one account share the AUTO_KEY autosave; a behind-the-clock device makes the newest *real* progress but stamps a *lower* `savedAt`, so an `autoApply` pull fast-forwards an older cloud save over it — permanent silent loss, no prompt.

## Findings by criticality

### [C4] "Keep this device's copy" in the cloud-conflict dialog persists nothing — the next seamless autoApply pull silently overwrites the save the user explicitly chose to keep
- **Severity:** High · **Likelihood:** Realistic · **Subsystem:** Cloud sync — conflict-overlay decision durability
- **Evidence:** js/net/gdrive-sync.js:293-297, js/net/gdrive-sync.js:204-228, js/net/gdrive-sync.js:383-413
- **Trigger / repro:** Trigger an interactive pull via "☁ Restore from cloud" / "☁ Sync now"; the conflict overlay appears because a cloud save is newer; deliberately click ✓ "Keep this device's copy". Then return to the main menu, alt-tab, or reopen the game (any seamless entry point).
- **Impact:** The user's explicit "keep my copy" decision is silently reversed and their data lost on the next ambient sync, with no prompt — actively contradicting the dialog's own "nothing is overwritten until you pick" copy.
- **Fix sketch:** In the Keep handler (gdrive-sync.js:295) persist a per-slKey "prefer local" flag keyed on the conflicting cloud `savedAt` (e.g. `GD_keepLocal[slKey]=cloudSavedAt`); in `gdrivePull`'s autoApply branch (218-219) skip fast-forward when the flag matches `f.savedAt`; clear it on next local save or "Use cloud". Alternatively re-stamp and re-push the kept-local save so it legitimately wins LWW.

### [C1] savedAt = per-device Date.now() is the SOLE cross-device merge key, so an autoApply pull silently fast-forwards over genuinely-newer local progress
- **Severity:** High · **Likelihood:** Rare · **Subsystem:** Cloud sync — reconcile/merge key (gdrive-sync)
- **Evidence:** js/net/gdrive-sync.js:215-225, js/net/gdrive-sync.js:171-173, js/net/gdrive-sync.js:218-222, js/net/gdrive-sync.js:236-242, js/save.js:124, js/save.js:366-382, js/main.js:406-414
- **Trigger / repro:** Two devices share one Google account and the shared AUTO_KEY autosave slot. The behind-the-clock device makes the newest *real* progress but stamps a *lower* `savedAt`; the ahead-clock device's older state carries a *higher* `savedAt`. On the slow-clock device's boot or alt-tab focus, the seamless `autoApply` pull treats the ahead-clock cloud save as "strictly newer" and fast-forwards it over the genuinely-newer local save. (Equal-`savedAt` divergence never reconciles in either direction.)
- **Impact:** Permanent silent loss of the most recent real cross-device progress — overwritten by an older cloud copy with no conflict prompt; `latestSave()`/Continue then resumes the stale state. Equal-stamp divergence silently drops one device's real edit.
- **Fix sketch:** Stop trusting raw `Date.now()` alone: add a per-device monotonic counter (or content hash) in `serializeGame`, and break `savedAt` ties/inversions using the cloud file's server `modifiedTime` (already captured at gdrive-sync.js:110) before fast-forwarding. When orderings disagree, fall back to the conflict prompt instead of autoApply.

### [C2] Seamless autoApply pull silently overwrites the AUTO_KEY/Continue slot and swaps which game state ▶Continue resumes — no prompt, no per-save signal
- **Severity:** Medium · **Likelihood:** Realistic · **Subsystem:** Cloud sync — Drive PULL autoApply / recreateSlot
- **Evidence:** js/net/gdrive-sync.js:204-232, js/net/gdrive-sync.js:219,225,228-229, js/net/gdrive-sync.js:503-535, js/save.js:422-445
- **Trigger / repro:** Two devices, one Google account, sync on. Device A leaves a newer-by-`savedAt` cloud autosave. On Device B the player has a deliberate but older-by-`savedAt` local save that Continue points at. The player boots STARLEFT on B, shows the main menu, or alt-tabs back — any seamless autoApply entry point.
- **Impact:** Player loses their local resume point and silently loads the wrong (other-device) game state with no warning; the overwritten local autosave content is gone (single slot, LWW).
- **Fix sketch:** After a fast-forward that changes the Continue target, surface a persistent, *named* toast ("Continue now resumes your other device's save: <episode> — <when>") and stash the overwritten blob in a one-deep shadow slot for undo. At minimum, replace the anonymous "Synced ✓" with a per-save "updated from cloud" line.

### [C3] Boot/focus trigger ordering: ▶Continue is labeled from LOCAL saves synchronously before the async cloud pull resolves; clicking in the window loads stale state then overwrites newer cloud progress
- **Severity:** Medium · **Likelihood:** Realistic · **Subsystem:** Boot/focus trigger ordering (cloud save-sync)
- **Evidence:** js/main.js:413-425, js/main.js:248-256, js/save.js:366-382, js/save.js:422-445, js/net/gdrive-sync.js:362-366, js/net/gdrive-sync.js:383-418, js/net/gdrive-sync.js:204-232
- **Trigger / repro:** On a device whose local autosave is older than/racing the cloud autosave: (a) cold boot or main-menu show — user clicks ▶Continue during the seconds-long window between the synchronous button label and the async Drive pull completing; (b) a PAUSED live solo mission (`togglePause` sets `running=false` while G is live) when the user alt-tabs and the focus pull's only guard `if(running) return` passes.
- **Impact:** User resumes an out-of-date campaign and, on the next autosave/push, permanently discards newer cross-device progress — or a paused mid-mission session is silently replaced on disk. No conflict prompt fires (autoApply never prompts; the subsequent push sees local as newer).
- **Fix sketch:** In `continueGame()` (save.js:426), if a pull is pending, `await` it before re-reading `latestSave()`. Guard the resumed-autosave push: if AUTO_KEY was loaded from a slot older than the known cloud `savedAt`, raise a conflict instead of silently pushing. (Report-noted: trigger (c) was dropped — alt-tab does not unpause, so the focus pull never runs for a live game.)

### [C5] Drive PUSH swallows ALL per-slot failures (401/403/network/5xx) into `skipped` and reports "Synced ✓"
- **Severity:** Medium · **Likelihood:** Realistic · **Subsystem:** Cloud sync — Drive PUSH error handling / false success
- **Evidence:** js/net/gdrive-sync.js:159-181, js/net/gdrive-sync.js:55-78, js/net/gdrive-sync.js:510-524, js/net/gdrive-auth.js:16,78-90
- **Trigger / repro:** A push (manual "Sync now", "Connect cloud", or the debounced 8s autosave-push) runs over one or more slots and a write fails: a token invalidated *after* `driveList()` (implicit-flow token crosses ~1h expiry mid-batch while `tokenValid()` is still true within its 30s margin, or a server revoke → 401), a 403 (quota/revoked scope), a transient network drop, or a 5xx that fails its single retry.
- **Impact:** The user believes their save is backed up (email shown) while zero (or fewer than expected) slots reached the cloud. If they later wipe local storage or switch devices, the un-pushed progress is gone — and the UI asserted success.
- **Fix sketch:** Track `failed++` in the per-slot catch (gdrive-sync.js:174), retaining the first error kind. After the loop, if `failed>0` route through `statusFor(lastErr)` (or a new 'partial' state) instead of 'ok', and only render "Synced ✓"/return `{ok:true}` when `failed===0` — matching how PULL already surfaces failures.

### [C7] recreateSlot fails closed and silently on any pull failure (download/parse/validate/quota) — caller ignores the boolean and shows "Synced ✓"
- **Severity:** Medium · **Likelihood:** Realistic · **Subsystem:** Cloud sync — Drive PULL recreateSlot error handling
- **Evidence:** js/net/gdrive-sync.js:236-242, js/net/gdrive-sync.js:224-230, js/net/gdrive-sync.js:249,258, js/save.js:39-41
- **Trigger / repro:** During a pull, a cloud file fails to download (transient 404 if another device just deleted it, network blip, 5xx after the single retry), or its body fails `JSON.parse`/`isSaveBlob`/`saveVersionOk`, or `saveWrite` throws (quota full).
- **Impact:** Stale local state masquerading as synced; under quota the expected cloud save is silently never restored. Recoverable on a later successful pull, but the user has no indication anything failed and Continue still points at the stale copy.
- **Fix sketch:** Collect the `recreateSlot` results in the fastForward/reconcile loops; if any returned false, call `syncStatus('fail'/'partial')` instead of 'ok'. In `recreateSlot`, wrap `saveWrite` to surface `isQuotaError` via toast (matching save.js:358) so a quota failure during pull isn't silent.

### [C9] No in-flight mutex on gdrivePush: a concurrent push creates DUPLICATE cloud files for one slKey
- **Severity:** Medium · **Likelihood:** Rare · **Subsystem:** Cloud sync — Drive PUSH concurrency / duplicate creates
- **Evidence:** js/net/gdrive-sync.js:156-182, js/net/gdrive-sync.js:127-130, js/net/gdrive-sync.js:362-366, js/net/gdrive-sync.js:328-331
- **Trigger / repro:** Two pushes of the same pool overlap. Same-device: a new-campaign autosave arms the 8s `GD_pushTimer`, then `cloudCampaignGate→gdriveConnect→gdrivePushAll{interactive:true}` runs within that window; or a manual "Sync now" while the 8s autosave-push timer is pending. Both `gdrivePush`es independently `driveList()`, both see `remote===undefined` for a new slot, both `driveCreate`.
- **Impact:** Permanent duplicate/orphaned cloud files per slot: they double-count toward `GD_CLOUD_MANUAL_CAP=50` (can prune real saves sooner — see C10), double-process in pull, clutter the index, and can resurface as a stale cloud-only restore row. Recoverable, not direct local loss, but degrades the backup guarantee.
- **Fix sketch:** Add a per-pool in-flight guard (`GD_pushInFlight[pool.id]` promise) so a second push coalesces instead of re-listing+re-creating; or make `driveCreate` check-then-create. Also sort `fastForward` by `savedAt` desc (or max per slKey) in `gdrivePull` so a duplicate/stale autosave file can't overwrite a newer local slot.

### [C25] Account-switch upload confirm is bypassed when the prior-account email hint is empty, and interactive auth never shows an account chooser
- **Severity:** Medium · **Likelihood:** Rare · **Subsystem:** Google Drive auth — account-switch / opt-in
- **Evidence:** js/net/gdrive-sync.js:303-331, js/net/gdrive-sync.js:395-418, js/net/gdrive-auth.js:78-110, js/net/gdrive-auth.js:127-128
- **Trigger / repro:** (a) "☁ Connect cloud saves" when the persisted email hint is empty — true on a fresh profile and, crucially, after any Disconnect (`gdriveDisconnect→signOut` removes EMAIL_KEY) — while the browser's active Google session is a *different* account than previously synced. (b) On boot/menu-show, a prior standing OAuth grant exists (only the local `cloud_on` flag was cleared): `gdriveMenuSync` makes one silent acquire and turns sync on.
- **Impact:** A user who disconnects from account A and reconnects while signed into account B (shared/work browser) silently uploads all of device A's saves into account B's Drive with no prompt and no account picker; cross-device sync then appears broken. The boot silent-grant path can begin uploading without an affirmative action this session.
- **Fix sketch:** Drop the `prevEmail!==''` precondition (or always confirm when `localCount>0` and the freshly-signed account differs from any prior hint), and route the Connect acquire through `switchAccount()` (`prompt:'select_account'`) so the user explicitly picks the destination account before any device-global push.

### [C33] Co-op client's blocked[] grid drifts from host (never un-stamped on building destruction) → p2 gets a false "Cannot build there"
- **Severity:** Medium · **Likelihood:** Rare · **Subsystem:** Co-op snapshot — client terrain-grid drift
- **Evidence:** js/net/sync.js:63-100, js/net/sync.js:226-238, js/net/sync.js:333-338, js/units.js:1338-1347, js/units.js:581-603, js/input.js:76-82
- **Trigger / repro:** Live 2-player co-op. The host destroys (or has destroyed) a building whose footprint the p2/client player later tries to build on. Kill it host-side, then on the client tap-to-place a building over the now-clear rubble.
- **Impact:** The p2 player cannot place a building on ground that is actually clear (and that the host CAN build on); the click is rejected with a misleading "Cannot build there" toast over visibly-empty terrain. Unfixable for the session — even reconnect resync doesn't clear it. No data loss.
- **Fix sketch:** On the client, when a building entity is removed in `applySnap` (sync.js:337 full-snap splice and 342 delta-gone), if `e.kind==='building'` call `markBuilding(G,e,false)` before splicing. In `applyFullSnapshot` (sync.js:88) clear all building footprints (or re-derive `blocked[]` from `baseBlocked`) before re-stamping living buildings so a resync fully heals stale cells.

### [G2] Re-imported / cross-device-imported save becomes a NEW slKey that can never dedup against its cloud original
- **Severity:** Medium · **Likelihood:** Rare · **Subsystem:** Save import vs Google Drive cloud sync
- **Evidence:** js/save.js:529-530, js/save.js:39-41,124, js/net/gdrive-sync.js:163-174, js/net/gdrive-sync.js:189-201, js/net/gdrive-sync.js:479-497
- **Trigger / repro:** User exports a save and imports it on a second device (or re-imports the same file later, or imports it twice). Cloud sync is on. On the next save-triggered push the imported slot is uploaded.
- **Impact:** The same game accumulates as multiple separate cloud files and "In cloud only" rows. They double-count toward `GD_CLOUD_MANUAL_CAP=50`, so duplicate clutter can prune genuinely-distinct older saves (oldest-by-`savedAt` deleted) — in the worst case evicting the only cloud copy of a real older campaign.
- **Fix sketch:** Carry the originating slKey in the blob: have `serializeGame`/`saveGame` embed an origin key (`d.slKey`) and have `importSaveFile` reuse it (write under the original key, keep original `savedAt` unless it already exists locally) instead of always re-stamping. Alternatively add a content/`savedAt`+`mapIndex` secondary dedup in `gdrivePruneCloud`/`gdriveAppendCloudRows`.

### [G7] Cross-device: an unpushed final autosave lets the next device silently fast-forward Continue to an OLDER cloud checkpoint
- **Severity:** Medium · **Likelihood:** Rare · **Subsystem:** Cloud autoApply pull vs unflushed unload autosave
- **Evidence:** js/net/gdrive-sync.js:204-232, js/net/gdrive-sync.js:383-418, js/main.js:406-423
- **Trigger / repro:** Two devices on one account. Device A plays a long solo session and closes the tab (its final autosave is written locally but never pushed — see G6). The player then opens STARLEFT on Device B (or returns to an idle Device B).
- **Impact:** On Device B the player silently loses the final minutes/hours played on Device A and resumes an older state, with no signal it's stale. Classic "my progress disappeared" with no recovery prompt — LWW can't help because A's newest real save was never a cloud candidate.
- **Fix sketch:** Root-cause: flush the final autosave to Drive on unload via `navigator.sendBeacon`/`fetch keepalive` (or push synchronously in `_unloadAutosave`). Guardrail: when an autoApply fast-forward would overwrite the autosave/Continue slot, gate it behind a lightweight "newer cloud save found" toast/confirm instead of silently applying.

### [G9] Co-op host has NO periodic autosave during a match — the only host autosave is the undeliverable tab-close path
- **Severity:** Medium · **Likelihood:** Rare · **Subsystem:** Periodic autosave loop vs co-op host clock
- **Evidence:** js/main.js:443-457, js/net/host-clock.js:19-31, js/main.js:272-275
- **Trigger / repro:** A co-op host plays any campaign match for any duration — there is no periodic host autosave at all. The 60s autosave (`autoTick`) lives inside the `netRole==='solo'` branch (main.js:446-450); the host branch only calls `NET.hostRafStep()`, and `hostStep()` does `update()`+`hostTick()` with no autosave.
- **Impact:** Long co-op sessions have no mid-match recovery point. A host crash / power loss / OS tab-kill loses the entire co-op session for both players (the ally only ever holds host-broadcast mirrors, never sent mid-match). Solo autosaves every 60s; co-op host effectively never.
- **Fix sketch:** Hoist the `autoTick`/60s autosave out of the solo-only branch (or add it to the host branch / `hostStep`). `autosaveCurrentGame()` already self-gates per role (`autosaveGame`=solo, `mpAutosaveGame`=host), so calling it unconditionally each frame fixes it without touching client behavior.

### [C36] MP resume-picker cloud pull omits autoApply, so a cross-device-divergent co-op slot pops the solo "CLOUD SAVE IS NEWER" overlay in the lobby
- **Severity:** Low · **Likelihood:** Realistic · **Subsystem:** Identity — co-op cloud pool merge / misplaced conflict overlay
- **Evidence:** js/net/gdrive-sync.js:445-462, js/net/gdrive-sync.js:204-232, js/net/gdrive-sync.js:264-293
- **Trigger / repro:** On device A a co-op slot `mpsave_<campId>` exists locally with `savedAt=T1`; the same campId slot in the MP Drive pool is newer (`T2>T1`) because another device advanced that campaign. The player opens the co-op lobby resume picker, which fires `gdriveOnMpResumeOpen` — calling `gdrivePull` *without* `autoApply:true`.
- **Impact:** A confusing, solo-flavored "cloud save is newer" modal interrupts the co-op lobby flow. Nothing is overwritten without a click, but picking "Keep this device's copy" for an older slot skips its push and the older local progress is superseded next sync. Recoverable, surprising, mis-contexted UI.
- **Fix sketch:** Pass `autoApply:true` on the MP resume-picker pull (gdrive-sync.js:461) so divergent co-op slots fast-forward LWW like every other seamless pull, instead of popping the solo-styled conflict overlay in the lobby.

### [G6] Tab-close autosave never reaches the cloud: 8s push debounce is torn down with the page (solo + host)
- **Severity:** Low · **Likelihood:** Realistic · **Subsystem:** Autosave-on-unload → Google Drive cloud push
- **Evidence:** js/main.js:406-414, js/save.js:366-382, js/net/gdrive-sync.js:362-366
- **Trigger / repro:** Player closes the tab, switches tabs, or backgrounds the app (`pagehide`/`visibilitychange:hidden`) while a live solo or co-op-host match is running. This is the deliberately-added "last checkpoint of the session" path.
- **Impact:** The most recent checkpoint is silently absent from the cloud. Correct on the device that wrote it (local write succeeds), so single-device play looks fine — but the cloud backup is permanently stale by one session, exactly the data cross-device sync exists to carry.
- **Fix sketch:** On the unload path, after the local `saveWrite`, send the serialized blob via `navigator.sendBeacon` (or `fetch keepalive:true`) to Drive. At minimum, run an explicit push on next boot (`gdriveMenuSync` currently only pulls) so the close-time delta uploads on reopen.

### [C6] Background autosave-push that finds the cloud copy newer strands the status at "Cloud is newer" with no overlay/buttons and never uploads the local change
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Cloud sync — Drive PUSH conflict dead-end
- **Evidence:** js/net/gdrive-sync.js:171-181, js/net/gdrive-sync.js:518-524
- **Trigger / repro:** Two-device use: device B saved more recently to the cloud (cloud `savedAt` > this device's local for the same slKey, e.g. shared AUTO_KEY). Then on device A a local save/autosave fires the debounced background `autoPush` (`gdrivePush{interactive:false}`). The `s.savedAt < remote.savedAt` branch pushes a conflict and sets `syncStatus('conflict')` but the PUSH path never calls `showCloudConflict`.
- **Impact:** Confusing/stuck "Cloud is newer — choose which to keep" status with no actionable control from a background push; the just-made local edit silently does not back up. No permanent loss, but misleading and stalls the backup.
- **Fix sketch:** In `gdrivePush`, when `conflicts.length` on a non-interactive autoPush, either route through the autoApply pull's `recreateSlot`/fast-forward path (adopt the newer cloud copy) or fall through to `gdrivePull({autoApply:true})` instead of leaving a buttonless 'conflict' status. Surface the state in `#menuCloudStatus` and clear it on the next successful push.

### [C8] Cloud fast-forward (recreateSlot) swallows quota write failures, stamps GD_lastSyncAt, and reports synced — device keeps the stale local slot
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Cloud sync — Drive PULL quota swallow / false-synced
- **Evidence:** js/net/gdrive-sync.js:236-242, js/net/gdrive-sync.js:224-229, js/save.js:39-41
- **Trigger / repro:** On boot/focus or load-menu open, an autoApply pull fast-forwards a cloud slot newer than local, but the new (later-campaign, larger) blob plus the rest of localStorage exceeds the ~5MB origin quota at write time. `recreateSlot`'s `try{saveWrite}catch(_){return false}` swallows the throw; the caller ignores it and stamps `GD_lastSyncAt`+`syncStatus('ok')`.
- **Impact:** The cross-device user thinks the newer cloud progress was pulled, but this device silently kept the older local copy and reports 'ok'. Loading here gives stale state with no error. Recoverable once space frees, but a confusing silent divergence.
- **Fix sketch:** In `recreateSlot`, don't swallow the write failure: detect `isQuotaError(err)`, toast "Cloud pull failed: browser storage full", and `return false`. In `gdrivePull`, track whether any fast-forward returned false and call `syncStatus('fail'/'partial')` instead of unconditionally stamping 'ok'.

### [C10] Cloud retention prune counts/sorts by appProperties.savedAt only (no slKey dedup, skew-sensitive) and runs after partial-failure pushes
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Cloud sync — retention/prune correctness & messaging
- **Evidence:** js/net/gdrive-sync.js:176-201, js/net/gdrive-sync.js:245-262, js/save.js:261-263
- **Trigger / repro:** The cloud manual-save count approaches `GD_CLOUD_MANUAL_CAP=50` (heavy multi-device use, or inflated by the C9 duplicate-create race) and a push reaches its prune tail; OR a device pulled more cloud saves than its 12-slot local cap holds (`dropped>0`, shown the "rest stay backed up" toast) and a later prune trims exactly those un-restored cloud-only saves.
- **Impact:** A real, distinct cloud save (including one the user was explicitly told "stays backed up") can be permanently deleted when the cloud is at cap and the count is inflated by C9 duplicates or misordered by clock skew. Recoverable while a local slot exists — but the cloud backup of an older campaign (often the only copy of a dropped-on-this-device save) can vanish silently.
- **Fix sketch:** Defense-in-depth: dedup `GD_cloudIndex` by slKey before the prune sort (keep newest per slKey, queue older same-slKey duplicates for deletion first) so an inflated count can't push a distinct save past the cap; optionally tie-break the sort by `modifiedTime` to blunt `savedAt` skew.

### [C12] Cloud prune (cap 50) vs local cap (12) creates a cross-device re-upload / re-prune ping-pong that thrashes Drive write/delete quota
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Cloud sync — retention vs create-decision interaction
- **Evidence:** js/net/gdrive-sync.js:162-177, js/net/gdrive-sync.js:189-201, js/save.js:349-352
- **Trigger / repro:** Two+ devices on one account accumulate >50 distinct manual cloud saves between them (each device's local cap is only 12). Device A's push tail prunes the oldest cloud files; device B still holds some of those exact slots locally and re-uploads each as a brand-new create on its next push; A re-prunes; repeat.
- **Impact:** No permanent data loss (the slot bounces back), but persistent Drive API/quota thrash that can trip the 403 'perm' quota path, after which syncs silently fail (see C5). The user sees intermittent "Sync failed" with no indication two of their own devices are fighting.
- **Fix sketch:** Optional hardening: stamp pruned slKeys into a small short-lived 'tombstone' set (appProperties or local list) so a stale device's next push skips re-creating a just-pruned slKey until its next pull converges. Not strictly required — the existing pull→`enforceCap` convergence terminates after one bounded round.

### [C13] Pruned/other-device-deleted cloud file still shown as an "In cloud only" restore row from a stale GD_cloudIndex, so Restore silently fails
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Cloud sync — Load-menu cloud rows / stale index
- **Evidence:** js/net/gdrive-sync.js:479-497, js/net/gdrive-sync.js:465-470, js/net/gdrive-sync.js:236-241, js/net/gdrive-sync.js:70-71
- **Trigger / repro:** Device A prunes or another device removes a manual cloud save. Device B's `GD_cloudIndex` is still stale (`gdriveSeamlessPull` is throttled 30s and no-ops without a token). B opens Load Game, sees the file as a dimmed "In cloud only" row, and clicks Restore — `driveDownload` 404s, `recreateSlot` swallows it and returns false.
- **Impact:** Confusing failure: a save the user can *see* listed cannot be restored, with a generic "Could not restore that save" and no hint it was pruned/deleted elsewhere. The dead row persists and stays clickable until a successful list refresh. No data loss.
- **Fix sketch:** In `recreateSlot`, detect the `{kind:'missing'}` 404 and bubble it up so `gdriveRestoreOne` can toast "That cloud save was removed on another device" and drop it from `GD_cloudIndex` immediately (`filter(x=>x.id!==f.id)`) before the line-470 refresh.

### [C14] saveGame rapid-collapse window (<3000ms) reuses the newest manual slot key — a deliberate quick checkpoint OR any backward clock jump silently overwrites the previous distinct manual save
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Local slot model — saveGame rapid-collapse + savedAt keying
- **Evidence:** js/save.js:346-353, js/save.js:249-259, js/save.js:422-429
- **Trigger / repro:** Either (a) the player intentionally creates two manual saves under 3s apart (two checkpoints before/after a risky move, double-tapping Save/Ctrl+S), OR (b) the device wall clock moves backward by more than ~3s between two manual saves (NTP correction, manual fix, DST/timezone edit, hibernate/resume restoring an earlier RTC). The guard `now-manual[0].savedAt < 3000` is true for both (the backward jump makes the difference a large negative).
- **Impact:** A manual checkpoint the player intended to keep is silently destroyed (toast still says "Game saved"), and/or Continue resumes an older state than the latest save (a backward jump makes new keys sort below older ones). Permanent, single-user, no signal.
- **Fix sketch:** Make the guard bounded and forward-only: `const dt=now-manual[0].savedAt; if(dt>=0 && dt<3000) key=manual[0].key;`. Optionally clamp `savedAt` to be monotonic (`Math.max(now,lastSavedAt+1)`) so `listSaves` ordering can't invert after a clock rewind.

### [C15] Two tabs of a live solo game clobber each other's autosave on the shared AUTO_KEY (no leader election/mutex), and the enforceCap read-modify-write can transiently exceed the cap
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Multi-tab — shared AUTO_KEY autosave + enforceCap race
- **Evidence:** js/save.js:366-382, js/save.js:261-263, js/save.js:348-352, js/main.js:406-414, js/main.js:450
- **Trigger / repro:** Two browser tabs of the game on the same origin. (a) Each has a different live solo game; both autosave on their 60s loop or both fire `_unloadAutosave` on tab switch/close → the shared AUTO_KEY is clobbered. (b) Both tabs manually save at the same moment while the manual pool is at the 12-slot cap → the `enforceCap` read-modify-write races.
- **Impact:** Silent loss of one game's autosave; Continue resumes the wrong game (recoverable only if a manual save also exists). The manual pool can transiently hold 13 slots until the next `enforceCap` trims one — possibly evicting a slot the user expected to keep (self-healing).
- **Fix sketch:** Tag the autosave blob with a per-tab session id and skip the write if AUTO_KEY already holds a newer `savedAt` from a different session; optionally add a `BroadcastChannel('starleft_save')` ping so a second live-game tab degrades to a manual-only slot. For `enforceCap`, re-list and trim *after* writing the new key.

### [C21] Dead entities are never purged from G.entities and are serialized unfiltered, so saves accumulate every corpse for the whole run (unbounded growth toward quota); restored control groups also retain dead members
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Local (de)serialization — dead-entity retention
- **Evidence:** js/save.js:120, js/save.js:234, js/save.js:236-238, js/units.js:1335-1357, js/core.js:134-154, js/input.js:285-286
- **Trigger / repro:** Any long solo campaign battle where many units/buildings die before a save (manual or the 60s autosave). The longer the fight, the more dead entities every subsequent save carries; restoring then briefly retains dead members in any control group until that group is recalled.
- **Impact:** Save size grows with cumulative deaths, not live army size. LZ hides most of it, but a very long run inflates every slot and brings the origin closer to ~5MB, making "storage full" more likely. A control group can momentarily count a dead unit (badge/recall) right after load until recalled. No data loss.
- **Fix sketch:** Optional hygiene: in `serializeGame` filter dead entities that aren't `{$ref}` targets (or reap dead entities after deathFx completes), and rebuild control groups with the same `!e.dead` filter used for selection at save.js:234. Not required given the per-mission reset.

### [C22] Loading a legacy (pre-v2) save never resets fallenVets, so a prior session's memorial leaks in and inflates the legacy madosis backfill
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Versioning — memorial restore + madosisBackfill
- **Evidence:** js/save.js:230-233, js/madosis.js:484, js/madosis.js:491-495, js/lore.js:214-221
- **Trigger / repro:** In one page session the player first loads/plays a campaign that populates `fallenVets` (a v2 save with `s.fallen`, or a finished mission), then loads a LEGACY pre-v2 save (`s.fallen` undefined) from the Load menu. `restoreFallen` (which clears+repopulates) never runs and no `resetFallen` is called, so the module-global `fallenVets` retains the prior game's dead.
- **Impact:** After loading a legacy save mid-session the player sees a memorial belonging to a different/earlier game and gets veterans whose back-filled sanity load is wrong (higher than it should be), which can push them toward an unearned breakdown. Recoverable on a fresh page load; confusing and non-deterministic by load order.
- **Fix sketch:** In `deserializeGame`, make the memorial restore total: call `resetFallen()` unconditionally before the array check (e.g. `if(typeof resetFallen==='function') resetFallen(); if(Array.isArray(s.fallen)&&...) restoreFallen(s.fallen);`) so a legacy save always clears the prior session's `fallenVets`.

### [C26] Cloud auth UI dead-ends: an interactive Connect/Sync-now click is consumed by an in-flight silent token request via the shared `pending` dedup, and a browser-blocked popup is reported only as generic "Sign in to sync"
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Google Drive auth — interactive auth UX failures
- **Evidence:** js/net/gdrive-auth.js:13,26-27,78-90, js/net/gdrive-auth.js:69-71, js/net/gdrive-sync.js:146-152, js/net/gdrive-sync.js:519
- **Trigger / repro:** (a) A silent token request is in flight (`gdriveSeamlessPull`/`gdriveMenuSync` on focus/menu-show while the token is expired) when the user clicks "Sync now"/"Connect" within the same brief window — `getToken` queues both into the single `pending` array and only `pending[0]` (the silent one) fires; the interactive request piggybacks, GIS rejects both. (b) The user clicks while the popup blocker suppresses the OAuth window (`popup_failed_to_open`).
- **Impact:** The user clicks a sign-in/sync button and no popup appears; the status reads "Sign in to sync" — a dead button implying they aren't signed in rather than that a silent request collided or the browser blocked the window. Recoverable by clicking again once no silent request is pending / popups unblocked.
- **Fix sketch:** In `getToken`, don't dedupe an interactive request behind a silent one — if a new request is interactive and the only in-flight calls are silent/non-gesture, fire `requestAccessToken` itself within the click's activation. In `gdAcquire`, keep the caught error and map `err.type==='popup_failed_to_open'` to a distinct "unblock popups" status instead of generic 'signin'.

### [C29] Co-op client mirror is overwritten with OLDER (or wrong-fork) co-op state on resume/persist — no savedAt/version/hash compare, and mpHostStartFromSave re-persists without re-stamping savedAt
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Co-op save authority — client mirror regression
- **Evidence:** js/net/mp.js:347-357, js/net/mp.js:326-345, js/net/mp.js:471-508, js/save.js:318-327, js/net/gdrive-sync.js:218,252-254,445-452
- **Trigger / repro:** Two devices have a co-op campaign. Device A's last autosave broadcast is dropped (A crashes/backgrounds right after writing locally — the host-write-then-broadcast gap), so A's local mirror is now older than B's. Later A (or anyone) re-hosts from A's stale slot via `mpHostStartFromSave`; the partner is fed that stale blob. `mpClientPersistSave` writes the blob unconditionally with no comparison.
- **Impact:** A participant's locally-mirrored co-op campaign progress is silently rolled back to an earlier state (or the wrong fork) with no prompt, toast, or conflict overlay.
- **Fix sketch:** In `mpClientPersistSave` (mp.js:354) skip/keep-newer when an existing slot's `savedAt >= blob.savedAt`; and in `mpHostStartFromSave` (mp.js:483) re-stamp `d.savedAt=Date.now()` before the local write + resume broadcast so the resumed authoritative state is newest by timestamp across devices.

### [C30] Host-write-then-broadcast co-op save has no ACK/retransmit and the client drops partial chunk buffers after a TTL — a save the host holds can be permanently absent on the ally
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Co-op save authority — broadcast delivery
- **Evidence:** js/save.js:312-337, js/net/mp.js:448-458, js/net/sync.js:373-384, js/main.js:266-271
- **Trigger / repro:** Host saves (manual or the 60s autosave) and then crashes, force-quits, or drops the link before the chunked `mpsave` fully reaches the client; the session never resumes from the host afterward. `mpBroadcastSave` is fire-and-forget; `_recvChunked` drops a partial buffer after `CHUNK_TTL` and only persists on full receipt.
- **Impact:** The most recent co-op progress is unrecoverable for the ally — they can only re-host from an older mirror (or nothing), with no signal that their copy is behind. The client has no independent serializer and its Save button is hidden.
- **Fix sketch:** Add a lightweight ACK + bounded retransmit to `NET.mpBroadcastSave` (client replies on full `mpsave` receipt; host re-sends after timeout), and/or surface a "your co-op copy may be behind the host" hint on the client when a transfer starts but doesn't complete before a host drop.

### [C31] Co-op manual save and 60s autosave share ONE slot per campaign (keyed only on campaign id, ignoring opts.auto)
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Co-op save authority — slot model
- **Evidence:** js/save.js:312-338, js/save.js:271, js/main.js:272-276
- **Trigger / repro:** Host makes a deliberate manual co-op save at a chosen moment; up to 60s later the host's periodic autosave fires and rewrites the same campaign slot with the then-current (possibly worse) state. Both paths key the slot solely on `mpSaveKey(payload.mpCampaignId)`, independent of `opts.auto`. (Note: per G9 no periodic co-op autosave currently exists, so the live overlap is the host-on-close autosave vs a manual checkpoint.)
- **Impact:** A co-op player cannot keep an intentional checkpoint distinct from rolling autosave; the deliberate save is replaced with no warning.
- **Fix sketch:** Give the tab-close `mpAutosave` its own MP autosave slot key (e.g. `mpSaveKey(campId)+'_auto'`) so a deliberate manual co-op save is never overwritten, mirroring the solo AUTO_KEY separation.

### [G1] Imported saves are never pushed to the cloud (silent backup gap) — import is the only local writer that skips gdriveAutoPush
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Save import vs Google Drive cloud sync
- **Evidence:** js/save.js:519-539, js/save.js:354,374, js/net/gdrive-sync.js:362-366, js/main.js:413-423
- **Trigger / repro:** User has cloud sync ON, imports a save file (Load Game → ⬆ Import Save File), then idles on the menu, closes the tab, or never starts/continues a game before switching devices. The imported save is the only copy of that progress. `importSaveFile` validates, re-stamps, and `saveWrite`s — but unlike `saveGame`/`autosaveGame`/`mpSaveGame` it never calls `gdriveAutoPush()`.
- **Impact:** The user imports a save believing cloud sync now covers it, but it is cloud-invisible until they happen to start a game and trigger a save. If the device is lost/cleared, or they move to another device expecting the import, it's gone — a silent backup gap they reasonably assume is covered.
- **Fix sketch:** In `importSaveFile`, after `buildLoadSlots()`, add `if(typeof gdriveAutoPush==='function') gdriveAutoPush();` (matching `saveGame`/`autosaveGame`) so the imported slot is pushed immediately.

### [G3] Import re-stamps savedAt=Date.now(), making a possibly-stale imported save outrank newer local saves for ▶Continue and last-write-wins
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Save import vs cross-device merge ordering
- **Evidence:** js/save.js:529-530, js/save.js:422-429, js/net/gdrive-sync.js:218-220,234-242
- **Trigger / repro:** User imports an OLD save file (an export shared by a friend, or an old backup) while a newer autosave/manual save of further progress already exists locally and/or in the cloud. `importSaveFile` unconditionally sets `d.savedAt=Date.now()` with no comparison.
- **Impact:** Player clicks ▶Continue (or the top Load row) and resumes the stale imported state instead of their latest progress, with no signal the timestamp reflects the import moment rather than play time. Across devices the re-stamped import can also out-rank and shadow newer real saves in the merge (violating the `recreateSlot` LWW invariant that deliberately preserves `savedAt`).
- **Fix sketch:** In `importSaveFile`, don't blindly stamp `Date.now()`: keep the file's original `d.savedAt` if present (or clamp the new stamp to not exceed the current newest local save), and/or tag the slot as imported so ▶Continue and the Load row can show "imported" rather than a fake-fresh time.

### [G8] Co-op host's final checkpoint reaches neither the ally nor the MP cloud pool on tab-close
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Autosave-on-unload → co-op ally broadcast + MP cloud pool
- **Evidence:** js/main.js:407-411, js/save.js:311-338, js/net/mp.js:448-458, js/net/gdrive-sync.js:448-453
- **Trigger / repro:** The co-op HOST closes/backgrounds its tab during a live campaign match (the host is the single authoritative serializer; the ally only mirrors host bytes). `_unloadAutosave→mpAutosaveGame→mpSaveGame`: the host's own slot lands synchronously, but the ally copy goes through `NET.mpBroadcastSave` (chunked WebRTC, needs a live event loop to flush) and the MP cloud copy via `gdriveAutoPushMp` is the same 8000ms `setTimeout` that dies with the page.
- **Impact:** If the ally later resumes (`mpHostStartFromSave` from its mirror) or the host's device is lost and only the MP cloud pool survives, the last session of co-op progress is gone. The ally's "re-hostable copy" is silently a checkpoint behind whenever the host left via tab-close.
- **Fix sketch:** On the host unload branch, after the synchronous local write, force a best-effort synchronous cloud flush (call `gdrivePush` immediately instead of the 8s-debounced `gdriveAutoPushMp`) and/or fire a `navigator.sendBeacon` for the MP cloud pool. The chunked WebRTC ally copy can't be reliably flushed on unload — document it as best-effort and rely on the periodic in-match autosave (G9) plus the synchronous local slot.

### [G10] Unload autosave fires twice (visibilitychange:hidden + pagehide), doubling a chunked co-op broadcast at teardown
- **Severity:** Low · **Likelihood:** Rare · **Subsystem:** Autosave-on-unload event wiring
- **Evidence:** js/main.js:413-414
- **Trigger / repro:** Normal tab-close on most browsers fires `visibilitychange→hidden` then `pagehide`; both are bound to `_unloadAutosave` with no `_unloadDone` guard. On alt-tab (hidden but not closed) it serializes + attempts a co-op broadcast on every focus loss.
- **Impact:** Wasted work and a redundant doomed broadcast at the worst possible moment; on alt-tab it triggers a full extra serialize+broadcast attempt every focus loss. No data loss. Mostly a hardening/efficiency gap.
- **Fix sketch:** Add a one-shot guard: `let _unloadDone=false;` and at the top of `_unloadAutosave` `if(_unloadDone) return; _unloadDone=true;` (or `{once:true}` semantics). This removes the duplicate serialize + redundant broadcast on close while leaving the by-design single autosave on alt-tab intact.

### [C16] mapIndex is a raw positional index clamped (never identity-validated) into MAPS — a save from a longer/reordered/shrunk campaign silently loads a DIFFERENT episode's cfg
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Versioning — save map resolution (saveMapIndex)
- **Evidence:** js/save.js:45-48, js/save.js:163-171, js/save.js:221-224, js/save.js:125, js/maps_data.js:851-947
- **Trigger / repro:** The live GitHub Pages build ships an update that inserts a gated/villain interlude into MAPS (the project does this — `isVillain` interludes at 7.5/8.5/9.5), reorders MAPS (a documented crawl-audio-desync footgun), or shrinks MAPS below a saved `mapIndex`. The player then loads/Continues/autosaves a campaign (non-HUB) save written before the update. Also reachable from a corrupted slot with a too-large `mapIndex`.
- **Impact:** The player resumes onto an internally-inconsistent battlefield: wrong victory/quest conditions, wrong enemy art, wrong episode name, an unrelated map's terrain-paint stamped over the saved terrain, units landing on the wrong map. The load list and toast assert one map while the terrain is another. No warning.
- **Fix sketch:** In `saveMapIndex`/`deserializeGame`, when `d.mapName` is present and `MAPS[idx].name !== d.mapName`, prefer resolving `idx` by matching `d.mapName` against `MAPS[].name` (skipping `isVillain` spacers) before clamping; if no match, refuse the load with a clear toast rather than silently dropping onto `MAPS[clamp]`.

### [C17] Most-recent / corrupt-at-rest save makes Continue & latestSave silently load OLDER progress; a truncated LZ slot becomes an undeletable phantom counting toward quota
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** At-rest LZ storage — corruption masking / phantom slots
- **Evidence:** js/save.js:29-37, js/save.js:249-260, js/save.js:422-430, js/save.js:463-466, js/save.js:468-495
- **Trigger / repro:** Any partial/aborted localStorage write or external corruption leaves a slot whose value begins with the LZ sentinel but is truncated/garbled (tab killed mid-`setItem` of a ~1MB blob, OS/disk hiccup, profile-sync clobber, manual edit). This commonly hits the newest slot (manual or AUTO_KEY). `decompressFromUTF16` returns '' or a partial prefix (does not throw), `JSON.parse` then throws, and the slot is silently skipped from `listSaves`.
- **Impact:** User silently loses their most recent save and is dropped to an earlier state (labels look plausible, no cue). Simultaneously the phantom key consumes quota with no UI affordance to delete/export it; as phantom + real saves approach 5MB, future saves start failing with "storage full" the user cannot resolve through the game.
- **Fix sketch:** Treat a sentinel-prefixed slot that decompresses to a non-parseable/short string as corrupt rather than absent: surface such keys in `buildLoadSlots` as a greyed "corrupt save — delete" row (with ✕) and exclude them from `latestSave` fallback only after a one-time toast.

### [C18] If lz-string fails to load, saves silently fall back to uncompressed JSON (10-17×) and migrateSavesToLZ no-ops; the migration also never recompacts the co-op pool
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** At-rest LZ storage — compression fallback & migration coverage
- **Evidence:** js/save.js:24-27, js/save.js:545-558, js/save.js:39-41, js/save.js:13-14
- **Trigger / repro:** (a) `js/lib/lz-string.js` fails to load/evaluate (flaky network, ad/script blocker, CDN/cache miss, future include-order regression), so `LZString` is undefined — `saveCompress` returns raw JSON and `migrateSavesToLZ` no-ops. (b) A user with pre-compression co-op saves upgrades to the compression build; `migrateSavesToLZ` only scans `SAVE_PREFIX`, never the disjoint `MP_SAVE_PREFIX`.
- **Impact:** Drastically reduced save capacity and premature, unexplained "storage full" failures with a near-empty save list and no hint compression is off. Users with pre-compression co-op saves keep oversized (~1MB) co-op slots eating the shared ~5MB quota.
- **Fix sketch:** In `migrateSavesToLZ` also scan `MP_SAVE_PREFIX` (add it to the prefix test at save.js:549) so legacy co-op slots recompact on first boot. When `LZString` is undefined, `console.warn` once that at-rest compression is disabled so the quota path is diagnosable.

### [C19] storageUsedBytes returns a misleading low/zero value when localStorage access throws, so the meter says ~5MB free while every save fails
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** At-rest LZ storage — UI quota meter
- **Evidence:** js/save.js:463-467, js/save.js:471-474
- **Trigger / repro:** Browser configured to throw on localStorage access (some private/incognito modes, storage disabled, SecurityError on getItem). The user opens the Load Game menu and/or attempts to save. `storageUsedBytes` wraps the whole enumeration in one try/catch returning the accumulator `n` (initialized 0), so a throw returns 0.
- **Impact:** User is told they have ~5MB free while every save fails; the diagnostic meter contradicts reality, deepening the confusion it was meant to remove. No data loss — purely misleading UI.
- **Fix sketch:** In `storageUsedBytes`, return a sentinel (-1/null) on catch and have `buildLoadSlots` render "Storage: unavailable" rather than "1 KB of ~5 MB used". Also wrap `listSaves()`' loop in try/catch so the Load menu degrades gracefully when storage access is blocked.

### [C20] encodeRefs treats ANY on-entity object literal with a numeric `id` field as an entity cross-reference, so the active STOMP-boss `_quake` becomes null on load
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Local (de)serialization — reference integrity
- **Evidence:** js/save.js:85, js/save.js:94, js/villains.js:493, js/villains.js:398-409
- **Trigger / repro:** A manual save or the 60s autosave fires while a mech boss (Rex / STOMP villain) is mid-earthquake — the ~0.4s window after a JUMP-STOMP landing while `u._quake` is still expanding — then that save is loaded. `u._quake = {x,y,r,rMax,dmg,capFrac, id:state.time}` uses a numeric `id`, so `encodeRefs` replaces the whole object with `{$ref:state.time}`; on load no entity has that float id, so it resolves to null.
- **Impact:** A saved/reloaded boss fight loses the remaining area damage of an in-progress earthquake (minor, self-correcting). The real concern is the latent class bug: `encodeRefs` will silently clobber any persisted entity sub-object using a numeric `id` key, with no guard or warning.
- **Fix sketch:** Rename the `_quake` (and any future transient sub-object) numeric `id` key to a non-reserved name like `castT`/`waveId` so `encodeRefs` never mistakes it for an entity ref; or harden `encodeRefs` to only ref-encode objects actually in `G.entities` (gate on `byId` membership / a kind tag) rather than on the presence of a numeric `id` field.

### [C23] Legacy veterans without u.lore are permanently excluded from madosis (never minted a sanityThreshold, can never break)
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Versioning — madosisBackfill lore precondition
- **Evidence:** js/madosis.js:498-505, js/madosis.js:84-89, js/career.js:118-133
- **Trigger / repro:** A pre-v2 save written before the lore/dossier system existed (or any save where a level-2+ combat veteran lacks `u.lore`) is loaded; that veteran is already at/over the level at which the threshold would normally be minted. `madosisBackfill` skips `!u.lore`, and the only other minting site (`mintSanityThreshold` via `promoteIfReady`) requires a fresh star-up that never comes.
- **Impact:** No data loss or crash. A quiet gameplay inconsistency: some legacy veterans can never go mad, so the madosis mechanic behaves differently on old saves than new ones, with no indication. (The feared divide-by-zero is fully guarded by `thr>0` at every division site.)
- **Fix sketch:** In `madosisBackfill` (and the per-frame path), don't gate the threshold mint on `u.lore`: call `ensureDossier(u)` for eligible vets before `mintSanityThreshold`, or drop the `!u.lore` skip at madosis.js:499 and let `mintSanityThreshold`'s own seed fallback (`u.id+1`) handle lore-less legacy units.

### [C27] Implicit/token OAuth flow issues no refresh token, so cloud sync silently stops ~1h into a session
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Google Drive auth — token lifetime
- **Evidence:** js/net/gdrive-auth.js:5-7,11,61-68,78-82, js/net/gdrive-sync.js:146-151
- **Trigger / repro:** Any session kept open longer than the ~1h token TTL (long play sessions, a pinned tab). After expiry, `tokenValid()` is false; the background paths call `getToken({interactive:false})` which rejects immediately (`!interactive && !silent`) because there is no refresh token. `gdriveSeamlessPull`'s silent path can renew only if the Google session + standing grant still permit a windowless grant.
- **Impact:** Cloud backups quietly stop ~1h into a session; autosaves stop reaching Drive until an explicit interactive sign-in. An inherent constraint of a secret-free static-site OAuth flow, but it materially limits sync reliability — and combined with C5, the user may believe they're still synced.
- **Fix sketch:** On a pure `interactive:false` push failure, opportunistically retry once via the `silent:true` path before flipping to 'signin', and surface the 'signin'/'fail' state in the in-match start-screen mini-indicator (sync.js:527-534) so the user gets a visible cue when cloud backup stalls mid-session.

### [C28] Interactive "Sync now"/"Restore" bypass the GD_lastPullAt throttle and gdrivePull has no in-flight mutex, so a button-driven pull can run concurrently with a seamless focus pull
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Cloud sync — pull concurrency / throttle bypass
- **Evidence:** js/net/gdrive-sync.js:357-358, js/net/gdrive-sync.js:204-232, js/net/gdrive-sync.js:383-403
- **Trigger / repro:** Player opens the Load menu (which fires `gdriveSeamlessPull`) and immediately clicks "Sync now"/"Restore from cloud" while the seamless pull is still in flight; or any alt-tab focus pull overlaps a button-driven pull. The seamless paths respect a 30s `GD_lastPullAt` throttle, but `gdriveSyncNow`/`gdriveRestore` call `gdrivePullAll` directly and neither check nor update it.
- **Impact:** Confusing/inconsistent sync status and a slot getting auto-applied without the conflict prompt the interactive path would have shown; no permanent data loss because both pulls write identical cloud bytes.
- **Fix sketch:** Add a single in-flight guard (module-level `GD_pullInFlight` promise) that `gdrivePull` awaits/coalesces so seamless and interactive pulls for the same pool serialize; the second caller reuses the first's result instead of racing.

### [C32] Co-op resume/persist accept any blob with coop===true and skip the build-skew guard when the ally's SAVE_VERSION is unknown — no campaign-id/participant/checksum validation
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Co-op save authority — resume/persist validation
- **Evidence:** js/net/mp.js:326-357, js/net/mp.js:474-508
- **Trigger / repro:** (a) A newer-build player re-hosts a saved co-op campaign while the ally never sent a usable `SAVE_VERSION` (`S._peerVer` null) and the ally's build is actually older — the build-skew gate `if(S.peerId && S._peerVer!=null && S._peerVer < (d.v||0))` short-circuits. (b) The connected host broadcasts an `mpsave`/`mpresume` whose `mpCampaignId` differs from the campaign the client previously mirrored.
- **Impact:** On a real build mismatch the resume fails with a confusing/misattributed "lost host" error instead of a clear version message (recoverable but misleading). The client mirror is unauthenticated — a client can end up with a co-op slot for a campaign it did not knowingly join, or have its picker populated by host-driven campIds.
- **Fix sketch:** Defensive hardening: in `mpClientApplyResume`/`mpClientPersistSave`, reject blobs whose `blob.mpCampaignId` doesn't match `S.mpCampaignId` once a co-op identity is established (allow first-set). The build-skew path is already covered by the client-side `saveVersionOk` check which shows a clear message.

### [C35] Co-op resume adopts the saved blob's STALE participant list and never re-validates the actual joiner, so the resume picker mislabels who a campaign belongs to
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Identity — co-op save participants
- **Evidence:** js/net/mp.js:474-508, js/save.js:291-309, js/net/mp-ui.js:69-83, js/profile.js:11-16
- **Trigger / repro:** Device B (a former co-op client holding a mirrored copy of campaign C, or the same person after clearing site data so `getOrCreateProfile` mints a new profile id) opens the lobby resume picker, becomes host, and resumes campaign C with a different ally. `mpHostStartFromSave` keeps `d.participants` (the original host+joiner) untouched and re-persists the slot.
- **Impact:** The resume picker mislabels who a co-op campaign belongs to (shows the original two handles even after the campaign was resumed with a new partner or by a re-identified player). Purely a display/attribution inconsistency — no game state or save lost.
- **Fix sketch:** In `mpHostStartFromSave`, after patching `d.coop`/`mpCampaignId`, refresh the roster before the `saveWrite` at mp.js:497: `d.participants = mpCoopMeta().parts` (rebuilt from the live `S.me`/`S.joiner`) so the re-persisted slot and picker label reflect the actual resuming session.

### [C37] Co-op resume of a campId-less blob mints a fresh mpCampaignId and writes a NEW slot instead of overwriting the original — slot duplication and possible enforceMpCap eviction
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Identity — mpCampaignId minting on resume
- **Evidence:** js/net/mp.js:482-497, js/save.js:271-289
- **Trigger / repro:** A co-op campaign blob lacking `mpCampaignId` is resumed via the lobby (a hand-edited/legacy/foreign blob, or one that reached the device through a path that dropped the field) while `MP_SESSION.mpCampaignId` is null (fresh page session). Line 482 computes `S.mpCampaignId = d.mpCampaignId || S.mpCampaignId || _mpUuid()` — both falsy → mints a brand-new id → line 497 writes a new slot key while the picked slot survives under its original key.
- **Impact:** Slot duplication and a now-ambiguous campaign identity (two pickable rows for one campaign that diverge on the next save). No data lost, but it wastes the 12-slot MP cap (`enforceMpCap` can then evict an unrelated oldest co-op campaign) and confuses the resume picker. Edge case — normal co-op saves always carry `mpCampaignId`.
- **Fix sketch:** Harden `mpHostStartFromSave` to derive the campId from the picked KEY (`key.slice(MP_SAVE_PREFIX.length)`) and overwrite in place under that same key rather than falling back to `_mpUuid()`; never mint a fresh id when resuming an existing slot.

### [G4] Importing an exported autosave silently converts it into a permanent manual slot (and a separate cloud file)
- **Severity:** Informational · **Likelihood:** Rare · **Subsystem:** Save import vs autosave/cloud slot identity
- **Evidence:** js/save.js:487,529-530, js/save.js:256,261-263, js/net/gdrive-sync.js:120,125,247-249
- **Trigger / repro:** User exports the ★ Autosave row (`buildLoadSlots` renders a ⬇ export button on every slot including the autosave) and later imports that file. `importSaveFile` keys it `SAVE_PREFIX+Date.now()`, never AUTO_KEY, so slot kind (derived from the key) flips to manual.
- **Impact:** An imported autosave no longer behaves as the single shared resume autosave: it occupies a manual slot, can push out another manual save under the 12-cap, and in the cloud loses the autosave's prune-exemption. Confusing slot identity; minor recoverable churn rather than data loss.
- **Fix sketch:** In `importSaveFile`, detect an imported autosave (content originally keyed/flagged as auto, or add an exported 'kind' field) and write it to AUTO_KEY instead of a fresh manual key; or offer "import as autosave vs manual". Preserve legacy-default behavior for files lacking the flag to keep save compatibility.

## Cross-cutting themes
- **`savedAt = Date.now()` is the single point of failure.** It is simultaneously the cross-device merge key (C1, C2, C6, G7, C29), the ▶Continue/latestSave sort key (C3, C14, G3), and the LWW arbiter — with no monotonic counter, content hash, device id, or server `modifiedTime` tiebreak. Clock skew (C1, C14), re-stamping on import (G3, G2), and equal-stamp divergence (C1) all silently corrupt ordering. Nearly every High/Medium finding traces back here.
- **`autoApply:true` on every seamless pull means the conflict overlay almost never fires, and the interactive path's decisions aren't durable.** Boot, menu-show, and focus pulls fast-forward without prompting (C2, C3, G7); the one place a user *can* choose (the overlay) persists nothing and is reversed by the next ambient pull (C4); and the MP resume picker has the inverse bug — it pops the overlay where it shouldn't (C36).
- **Silent-false / empty-catch swallows data-loss signals and reports success.** PUSH buckets 401/403/network/5xx into `skipped` and renders "Synced ✓" (C5); `recreateSlot` returns false on download/parse/validate/quota failure and every caller ignores it (C7, C8, C13); the quota meter returns 0 on a storage throw (C19); corrupt slots are skipped as if absent (C17). The user is repeatedly told everything worked while data silently did not move.
- **No atomic write and no mutex across the five save writers.** Solo-manual, solo-autosave, import, MP-host, and cloud-`recreateSlot` all write the same key space with no leader election, no in-flight guard, and non-atomic read-modify-write. This yields multi-tab autosave clobber + cap overflow (C15), duplicate cloud creates (C9, C12), and overlapping pulls (C28).
- **Boot/focus trigger ordering races the network.** ▶Continue is labeled synchronously from local slots before the async pull resolves (C3); the focus pull is gated only on `running`, which pause clears (C3); and the 8s debounced push is torn down with the page so the final checkpoint never uploads (G6, G8, G7). Unload wiring also double-fires (G10).
- **Co-op save authority is a single fragile broadcast with no ACK, no client serializer, and no periodic host autosave.** Host-write-then-fire-and-forget-broadcast (C30), client mirror overwritten unconditionally (C29), a shared manual/auto slot (C31), unvalidated participants/campId (C32, C35, C37), and — most importantly — *no mid-match host autosave at all* (G9) leave long co-op sessions with no recoverable checkpoint.

## Appendix A — Methodology & limitations
The audit fanned out across 12 dimensions of the save surface — solo serialize/deserialize, ref-encoding, slot model & caps, at-rest LZ compression, the Drive PUSH path, the Drive PULL/`recreateSlot` path, retention/prune, OAuth/token lifetime, boot/focus trigger ordering, co-op host/client save authority, co-op snapshot shape vs save-blob shape, and save import/versioning. Candidate findings were deduplicated, then each survivor was run through three independent refutation lenses: **correctness** (does the traced code actually do what's claimed?), **guard** (is there an existing precondition, clamp, or version gate that neutralizes it?), and **reachability** (can a real user/runtime ordering actually hit it?). A completeness critic then swept for missed adjacent paths. Five candidates were refuted and moved to the verification ledger (Appendix B) — three on guard grounds (a present guard, a self-correcting outcome, an append-only contract), and two on reachability (single-threaded JS makes the claimed interleave impossible; the leading `Date.now()` prevents the claimed collision).

**Limitations.** This is a *static* read-only analysis. Timing-dependent races (C9/C12/C15/C28 concurrency, C3/C5/G6 teardown ordering) are reasoned from the code, not reproduced, so their exact firing windows are inferred. The clock-skew findings (C1, C14) assume realistic NTP/RTC behavior but were not exercised against a real skewed clock. Confirming the highest-value items would take dynamic testing: a **multi-tab harness** (two live games on one origin) for C15; a **mock-Drive double** that can inject 401/403/5xx mid-batch and delay `driveList`/`recreateSlot` for C5/C7/C9/C28 and the false-"Synced ✓" surface; and a **clock-skew rig** (two clients, offset wall clocks, shared AUTO_KEY) to demonstrate C1's silent fast-forward over genuinely-newer progress and the C4 "Keep" reversal. None of these were run; all citations are line-exact against the current tree.

## Appendix B — Verification ledger
| Candidate | Suspected severity | Why refuted |
|---|---|---|
| **C11** — reconcileAndRecreate calls `enforceCap()` per cloud recreate, evicting the globally-oldest local manual save the merge meant to keep | Medium | Surface mechanics read correctly (`keep` computed on a pre-eviction snapshot at gdrive-sync.js:252-255, then a blind per-entry `pool.enforceCap()` at 258). But the claimed *harmful* outcome does not follow: the evicted slot is the oldest-by-`savedAt`, which is also exactly what the merge's keep-set tolerates losing under the cap, so no save the merge intended to retain is actually destroyed. Refuted on outcome. |
| **C34** — Compact mpsnap packing omits fields the full snapshot/save blob carry (career heroId/xp/lore, sim-state extractReady/holdout/_simRngS/etc.) | Informational | Every cited code fact is accurate (`packEnt` is an explicit allow-list; `applyFullSnapshot`'s scalar list omits those keys; mid-match entities are created bare). But the effect is a *joined-client* split-brain only — no persisted-save corruption, no host/solo divergence — i.e. a latent hardening gap below the reporting bar, not a save/sync data-loss defect. |
| **C24** — Hero sprite backfill assigns the WRONG bespoke recolor when a hero's MAPS sprite mapping is reassigned between save and load | Informational | The backfill at save.js:228 fires only `if(e.hero && !e.spriteType)` — a real, correct guard. `serializeEntity` persists `spriteType` verbatim, so any modern hero's value round-trips and the backfill cannot overwrite a present field; it only re-derives for genuinely legacy entities missing the field, which is the documented intended migration. Refuted on guard. |
| **C38** — `_mpUuid` non-secure-context fallback yields a weak ~30-bit `Math.random` id with no collision guard for campaign/profile ids and Drive slKeys | Informational | Entropy description accurate, but the leading `Date.now().toString(36)` makes a realistic same-device collision effectively impossible, and the https deployment uses `crypto.randomUUID` (the fallback only runs in non-secure contexts). Hardening gap below the bar, not a reachable defect. Refuted on reachability. |
| **G5** — Import has no transactional guard against concurrent writers re-stamping the same instant, colliding with autosave/pull on shared key space | Informational | Lines quoted accurately, but the load-bearing mechanism — a non-atomic read-decide-write *interleaving* between `importSaveFile` and the gdrive pull, evicting a slot the other path just intended to keep — is impossible in this runtime: JS here is single-threaded and import's entire critical section (save.js:528-532) runs to completion before any other handler. Refuted on reachability. |
