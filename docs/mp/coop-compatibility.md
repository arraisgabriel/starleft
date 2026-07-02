# MULTIPLAYER CAMPAIGN COMPATIBILITY — MANDATORY RULE

> **Every feature, system, fix, or content addition MUST work identically in the multiplayer
> campaign as in solo — for EVERY player at the table.** Each co-op client is a full co-founder,
> not a spectator. This is a non-negotiable, owner-mandated rule (2026-07) enforced on ALL agents,
> skills, and tools working in this repo. A change that works in solo but degrades, mutes, hides,
> desyncs, or locks out any co-op player is an incomplete change and must not ship.
>
> Player count: the engine spawns co-op bases for `p2..pN` (`addCoopPlayer`) and the owner intends
> up to **4 players**; today's shipped per-player state is p1/p2. **Write new code
> ctrl-agnostic** (loop controllers / key by ctrl string) rather than hardcoding `'p2'`, so the
> 3-4 player extension is a data change, not a rewrite.

Full parity shipped across commits `4f99013` (Phases A+B), `aa42b2b`/`df9e08f`/`6cc5e58` (Phase C),
`2d3ed7b` (hub economy + hero split), `321a724` (presentation parity), `aa36d8a`. The patterns below
are all live in the tree — **reuse them; never invent parallel mechanisms.**

## The architecture in one paragraph

`netRole ∈ {'solo','host','client'}`. The client **never runs `update()`** — it applies host
snapshots (`js/net/sync.js`) and renders; only presentation drivers (`cinematicTick`,
`updateFlashCutscene`, `updateDialogs`, `TUTORIAL.update`) run for it, outside the sim guard.
The host is authoritative: client intents travel as `mpcmd` messages and are validated + replayed
host-side via `runScoped(ctrl, sel, fn)` → `actingCtrl(state)`. Presentation mirrors travel as
seq-deduped `mpcue` messages (`NET.cueSend`/`playCue`). Entities carry `.ctrl` ('p1'|'p2');
`isMine(e)` gates local UI. The treasury is split (`CAMPAIGN.m3` / `m3p2` via
`campaignM3(ctrl)`/`campaignAddM3`/`hubSpend`); heroes split by ctrl (Biba+Rust→p2 in co-op).

## The checklist — every change must pass ALL of these

**1. Three-paths rule.** State the answer for solo, host, AND client before writing code. If the
feature mutates gameplay state, it runs host/solo-only and the client sees it via snapshot. If the
client must trigger it, it goes through an intent (below). If it's presentation, it must reach the
client (below). "Solo-only" (`netRole==='solo'` gates) requires explicit justification in a comment
AND a co-op fallback that is not silence.

**2. Player actions → host-replay intents.** Any new player-triggered mutation routes through the
`net*` wrappers (`js/net/commands.js`). In-mission: existing kinds (`command/train/place/...`).
Hub facilities: `netHubAct(op, extra)` → `k:'hubact'` → a new `case` in `applyHubAct` (js/hub.js)
— client sends **selectors only** (keys/ids/op, never amounts); host re-derives cost and validates
ownership (`ownsKey` for units, `f.ctrl===actingCtrl` for fallen-style records). Facility fns get
the first-line guard `if(netRole==='client') return netHubAct(...)` with cosmetic pre-checks only.

**3. Ownership (`ctrl`) on everything ownable.** New unit-like entities, roster/session/fallen-style
records, and persistent per-player state must carry `ctrl` (legacy-default `'p1'`). Per-player UI
filters by `isMine`/`LOCAL_CTRL`; shared infrastructure is either-may-operate (payer's own pool)
unless the owner says otherwise.

**4. Economy.** Spends go through `hubSpend(cost)` (draws the acting controller's pool — never a
raw `CAMPAIGN.m3 -=`). Earnings follow ×player-count: `CAMPAIGN.m3 += r; if(netRole!=='solo')
CAMPAIGN.m3p2 += r;`. Mission-side gold uses `playerEco(state, ctrl)` — never hardcode `eco.p1`.

**5. Presentation reaches both screens.**
- Toasts/says/barks/achievements/one-shots → `narrate(kind, payload)` (self-gates; host-emit only).
- Cutscenes/cinematics → the cue channel: `cinematic()`/`NET.cueSend`+`playCue` case. Freezing beats
  use the **hold-cue contract** (`running=false` + `_coopHold` → resume via `endFlashCutscene`) —
  copy the boss-cutscene/holdout pattern verbatim. Non-freezing beats (bomber flight, crash-fall,
  summary) are **non-hold** cues driven by `cinematicTick` on the presentation clock, with a
  host-lost backstop, and NEVER gate the authoritative handoff (`mphub`/`mpstart`).
- Per-device things (voice clips, localStorage marks, touch-vs-mouse copy) relay **ids**, not text.
- Local-by-design (selection barks, own-unit menus) must stay local — do not relay.

**6. Mission/campaign flow transitions.** Anything that loads the next map must route co-op through
the handshake — `mpHostStart(idx, 'campaign', extra?)` (supports `{noCrawl:true}`), never a bare
`loadMap()` on the host (it strands the client). Hub arrival = `enterHubFromCombat` →
`mpHostEnterHub`. End-states mirror via the `endcard` cue and set `G.over` client-side.

**7. Sim purity.** Nothing the client runs may write sim state (`G` entities/eco/quests) — overlay
DOM, local flags, and `state.cinematic`-style presentation state only; never touch `running` on the
client outside the cue contract. Host emits from the authoritative path only (`!window._rbReplaying`
where relevant); `USE_ROLLBACK` keeps old fallback paths at every new gate.

**8. Wire + save shape.** Changing entity shape/IDs → update snapshot packing (`packEnt`/
`unpackInto`, `js/net/sync.js`); big/immutable payloads ride dirty-sets, not the 15 Hz hot path.
New top-level `G` scalars the client needs → the FULL-snapshot `SCALAR` list. New `CAMPAIGN` fields
→ additive with explicit legacy coercion in `deserializeHubCampaign`; save-compat is mandatory
(no `SAVE_VERSION` bump unless a field becomes required).

**9. Map/content authoring.** New maps/missions/quests must not assume a single player: co-op
spawns a p2 base (`addCoopPlayer`) unless `heroEscape`; heroes declare `owner:'p2'` for ally-owned
(Nino + future Zeca stay p1 — Nino is load-bearing); quest types must be state-derivable (the
client evaluates nothing); scripted beats follow rule 5. Hero-only maps must leave the client
something to control.

**10. Verify all three paths headlessly before shipping.** The deterministic pipe pattern (no live
WebRTC needed): stub `MP.send`/`NET.cueSend` on a staged host page to capture real emitted
messages → flip `netRole='client'` → replay through `NET.playCue`/`NET.applyRemoteCmd` → assert
client state/DOM. Plus a solo smoke proving byte-identical behavior. See `/tmp`-style Playwright
suites referenced in `docs/mp/` and the memory notes; `python3 -m http.server` + `rts.html`.
Live 2-browser passes remain the owner's final gate.

## Quick reference — the reusable primitives

| Need | Use | Where |
|---|---|---|
| Client triggers a hub action | `netHubAct(op,extra)` + `applyHubAct` case | js/net/commands.js, js/hub.js |
| Client triggers an in-mission action | existing `net*` wrapper / new `k` in `applyRemoteCmd` | js/net/commands.js |
| Mirror a toast/say/bark/ach | `narrate(kind, payload)` | js/net/commands.js → mp.js playCue |
| Mirror a freezing cutscene | `running=false` + `_coopHold` + `cinematic('flash',...,{hold:true})` | villains.js / waves.js pattern |
| Mirror a non-freezing cinematic | new cue type + `state.cinematic={kind}` + `cinematicTick` step | hub.js (extract/crashchain/nuke) |
| Next map in co-op | `mpHostStart(idx,'campaign',{noCrawl?})` | js/net/mp.js |
| Spend / earn M3$ | `hubSpend(cost)` / ×players both-pools pattern | js/hub.js:622 |
| Per-player state | `ctrl` field + `isMine`/`actingCtrl` + legacy-default p1 | state.js, hub.js |
| Ship new entity fields | `packEnt`/`unpackInto` (+ dirty-set if heavy) | js/net/sync.js |
