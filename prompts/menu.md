# Main menu art — background + logo

StarCraft-II-style menu layout, **red** accent. Two generated assets:
- `assets/menu/background.png` — full-bleed dystopian scene (opaque, used as-is)
- `assets/menu/logo.png` — red-star emblem (keyed to transparency)

Model: `gemini-2.5-flash-image` (Nano Banana). Key read from `_dev/.env`.

---

## ⭐ Background prompt (16:9 — `generationConfig.imageConfig.aspectRatio:"16:9"`)
```
A dark, cinematic sci-fi RTS main-menu BACKGROUND illustration, wide 16:9 landscape, painterly concept-art style, high detail.
Setting (a startup-vs-megacorp tech war) with a DARK, ominous twist: a dystopian neon corporate battlefield at night. A brooding skyline of towering glass-and-steel megacorp HQ towers and a half-built "open-plan" campus, holographic billboards flickering, drifting smoke and ember sparks, distant fires and red emergency strobes. In the mid-ground a colossal cracked, glowing PURPLE crystal monolith (the contested resource) pulses ominously. Foreground: a cracked battlefield ground with the dark silhouettes of wrecked war-mechs and downed drones.
Mood: oppressive, atmospheric, desaturated deep blacks and cold greys with strong RED accent glow (#d63b3b / #ff5a5a) and a secondary eerie purple. Volumetric haze, strong rim lighting, cinematic vignette.
Composition: keep the LEFT THIRD and the BOTTOM noticeably darker and emptier (negative space) for menu text legibility; visual interest weighted to the center-right. No text, no logos, no watermark, no UI, no large character in the center.
```
Used opaque, `background-size:cover`. CSS also layers two dark radial gradients as a fallback if the file is absent.

---

## ⭐ Logo prompt — generate on **MAGENTA**, not green
A red glow over a **green** key bleeds red→yellow→green (ugly halo). Over **magenta** it keys clean: the red core has low blue (survives), the contaminated halo gains blue (removed).
```
A bold sci-fi video-game LOGO EMBLEM / insignia: a single prominent five-pointed STAR centerpiece glowing brilliant RED (#ff3b3b) like molten energy, set inside a battle-worn dark gunmetal angular badge/crest with tech greebles and crisp red rim-lighting. Heroic, militant, premium game-logo quality. Centered, filling ~78% of the frame, with CRISP CLEAN EDGES — keep all glow CONTAINED inside the badge silhouette, do NOT let glow or haze bleed out into the background.
Background: SOLID FLAT PURE MAGENTA #ff00ff — absolutely no transparency, no checkerboard, no gradient, no texture, no border. No text, no letters, no numbers.
```

### Keying the logo (magenta → alpha)
1. `isMagenta = r>g+14 && b>g+14` → flood-fill from borders + global key.
2. Despeckle (keep largest blob + ≥120px).
3. **Feather** alpha by magenta-excess `min(r,b)-g` (fades the contaminated rim out smoothly).
4. **De-spill blue**: `b = min(b, max(r,g))` (neutralises residual magenta tint).
5. Crop to bbox → `assets/menu/logo.png`.

> The wordmark "STARLEFT" is crisp **CSS text** next to the emblem (image models garble text), so the logo = emblem image + CSS wordmark + a CSS red-★ fallback if the image is missing.

---

## Layout (in `rts.html` + `js/ui.js`)
- `#startScreen.menu`: full-bleed `.menu-bg`, `.menu-logo` top-left, `.menu-nav` left stack, `.menu-news` top-right, `.menu-hint` bottom — red-accent `.sc-btn` with an angular clip-path.
- Three buttons: **New Campaign** → `startGame(0)`; **Map Selection** → `showSub('mapScreen')`; **Documentation** → `showSub('docScreen')`.
- Sub-screens `#mapScreen` (the Quarter buttons) and `#docScreen` (controls) are modal `.overlay.submenu` panels with a Back button.
- Responsive: a `@media (hover:none),(max-width:760px)` block reflows everything to a centered vertical column for phones.
