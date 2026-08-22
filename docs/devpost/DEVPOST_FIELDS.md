# Devpost field copy — Meta Horizon Creator Competition: Game Prototype

Contest: https://mhcp-game-prototype.devpost.com/  
Submit: https://devpost.com/submit-to/30914-meta-horizon-creator-competition-game-prototype  
Deadline: 8 Sep 2026, 1:00pm PDT

Paste these. Do not upload the CrazyGames zip. See “Do not submit yet” at the bottom.

---

## Start project

**Project name**  
Aero Glide: Canyon Rush

**Tagline** (keep under ~60 characters)  
Gather scrap. Patch the wing. Beat the storm.

**Genre**  
Survival & Resource Management

**Built with** (tags)  
Three.js, TypeScript, Vite, Web Audio, Hyper3D, Grok

**Participants**  
Solo unless you add teammates. One Entry per person as Representative.

---

## About / Overview (the long “About the project” box)

Aero Glide: Canyon Rush is a single-player, portrait survival prototype.

You fly a torn ram-air wing down a ridge. Gold packs are fabric, teal packs are cord. Craft a Patch to restore the canopy, Bind to slow the storm tear, or a Heat wrap to stay warm. Blue thermals refill warmth. The storm ramps wind and shreds the wing until you land the valley pad or freeze, shred, crash, or whiteout.

This is the core loop we would rebuild on Meta Horizon early-access tools: gather, craft, survive.

---

## Inspiration

Real paragliding is already a survival-and-resource game: you spend height, you hunt lift, you convert speed into a flare. Most flight games hide that economy behind a vehicle or a health bar. We wanted the player to feel the polar with their thumbs.

The competition genre floor (gather, convert, survive an escalating threat) mapped cleanly onto thermals, brakes/flare, and sink. Portrait thumbs as left/right brake toggles came from how a real harness is flown.

---

## How I built it

Prompt-built with Grok (xAI) across short, playtested passes:

1. Polar + camera + pad so energy is playable.  
2. Rings, thermals, downdrafts, stars so a session has gather / spend / escalate.  
3. Seated pilot + ram-air wing (Hyper3D person/parachute, no pod) so the silhouette reads.  
4. Portrait sliders, Web Audio vario/wind, Kenney hits so climb and sink are obvious on a phone.  
5. Offline packaging rules: relative assets, no CDN, contest zip separate from the public Vite/CrazyGames ship.

Hand edits were limited to bug fixes, feel tuning, and keeping the pack legal.

---

## Challenges I ran into

- False fails: valley “landings” and wall-folds stole the stick. Landing now only counts on the pad.  
- Unreadable wing/pilot: camera clipped the canopy; shadow frustum flickered a black square; inward faces looked like holes. Fixed with camera clamp, no shadow map, opaque depth-writing materials.  
- Portrait HUD: desktop stats covered the valley. Collapsed chrome; thumbs stay on the brakes.  
- Root-absolute `/models` paths 404 on prefixed hosts. Locked `./models`, `./audio`, `./terrains`.  
- Contest pack vs product pack: a minified Vite zip with a CrazyGames SDK script is not a valid artefact here.

---

## Accomplishments that I'm proud of

- A complete gather → convert → land loop you can finish in one sitting.  
- Brakes that both turn the wing and flare it, so the signature mechanic is the resource conversion.  
- A first course a new player can read, with later courses as the escalation.  
- Climb and sink you can hear (vario) as well as see.

---

## What I learned

Judges (and players) punish hidden fails and unreadable silhouettes faster than missing features. Depth on one energy loop beat extra systems. Tell the AI the pack rules (portrait, offline, unminified `index.html` + `vendor/`) on day one.

---

## What's next

If this wins a completion grant: rebuild the same loop on Horizon early-access tools as a portrait, single-player title. Add local ghosts on your best line and a tiny course workshop. No multiplayer in the prototype, by rule.

---

## Try it out

Do **not** put https://paraglider-six.vercel.app as the official playable if that build still loads the CrazyGames SDK or any CDN. Judges must run the uploaded zip offline.

If you only have the public build today, leave “Try it out” empty or note: “Play from the submitted zip (local server, internet off, portrait).”

---

## Video (optional but useful)

Use `docs/crazygames/preview-portrait-1080p.mp4` (portrait, silent, ~18s) or record a new 30–60s phone capture: start Alpine → thermal → rings → flare on the pad → retry. No “Play now,” no logos, no face.

Gallery images: `docs/crazygames/cover-portrait-800x1200.jpg`, `docs/promo/ingame-assets.png`, `docs/promo/menu-assets.png`. Prefer portrait shots.

---

## Additional / custom questions (typical on this hackathon)

Fill these if the form shows them:

**Genre (required)**  
Survival & Resource Management

**MHCP member as of 10 Aug 2026?**  
Yes / No — you must be Yes or the entry is ineligible.

**Meta / Horizon username**  
(your handle — not in the design-intent file)

**Team name**  
Leave blank if solo.

**Which AI tools did you use?**  
Grok (xAI) for design and implementation prompting. Hyper3D Rodin for the person and parachute meshes.

**Is the prototype single-player and portrait?**  
Yes. Desktop keyboard is the same loop, not a second mode.

**Does the build make network requests?**  
The **submitted zip must not**. The public Vercel build currently does (CrazyGames SDK) — do not submit that zip.

---

## File uploads

| Artefact | File to attach | Notes |
|---|---|---|
| Design-intent | `docs/devpost/DESIGN_INTENT.docx` | Official 7 sections, text only, no name, under 500 words |
| Build log | `docs/devpost/buildlog.md` | Rename to `buildlog.md` if the form is picky |
| Playable zip | `docs/devpost/aero-glide-canyon-rush.zip` | 15.6 MB. `index.html` at zip root. No CrazyGames SDK. Rebuild with `bash scripts/pack-devpost.sh`. |

---

## Do not submit yet

The live game at paraglider-six.vercel.app and `dist/aero-glide-crazygames.zip` will **fail validation**:

1. Game code is minified in `assets/*.js`, not readable inside `index.html`.  
2. Three.js is bundled, not in a `vendor/` folder.  
3. `index.html` loads `https://sdk.crazygames.com/crazygames-sdk-v3.js`.  
4. Layout is landscape-first (portrait is supported, not locked).  
5. Current zip is a product pack, not the contest pack.

Before you hit Submit, we still need a dedicated offline zip: unminified single `index.html`, `vendor/three.module.js` (+ addons if needed), local Draco, no SDK, portrait lock, then a full playthrough with the internet off.

Eligibility reminder: MHCP member in good standing as of 10 Aug 2026, 18+, eligible country, one Entry.
