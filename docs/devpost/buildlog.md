# Build Log: Aero Glide — Canyon Rush
Genre: Survival & Resource Management

## Decisions locked so far
- Genre floor: altitude is the gathered / spent resource; thermals convert into climb and boost; sink, downdrafts, and the pad are the escalating threat.
- Core loop: bank → spend or recover height → thread rings → flare onto the pad. Win / lose / retry in one sitting.
- Single-player. Portrait-first mobile layout (thumb brake sliders). Desktop keyboard and gamepad kept as the same loop, not extra modes.
- Physics: one polar (trim ~12 m/s, ~11:1). Independent left/right brakes, speed bar, big-ears, flare. No vehicle sim sprawl.
- Scope: one flight fantasy. Four short courses, alpine first. No multiplayer, no weather cycle, no IAP, no ads.
- Offline constraint: no runtime network. Three.js and Draco local. No CDN fonts.
- Art: one seated person + ram-air wing only. Thin lines, chest carabiners, opaque materials. FogExp2 sky. Visual polish is not the score target; readability is.
- Audio: Kenney CC0 one-shots plus procedural wind / vario so the climb/sink state is audible.
- Persistence: local only (later Data Module on CrazyGames is a separate ship, not this prototype).
- AI-native build: design and implementation driven by prompting; hand edits only to fix bugs, tune feel, and keep the pack legal.

## Session 1: one-file flight loop
Tool(s): Grok (xAI) in a coding agent
What I built: a single-file Three.js paraglider that could bank, dive, and land on a heightmap. Polar numbers, a camera, and a pad.
Key decisions: lock the fantasy to one person under a wing. Energy (height + speed) is the resource, not a health bar.
Pivots: started toward a more general flight sim. Cut it. Judges need one loop.
What changed after playtesting: keyboard-only felt like a tech demo. Added a visible goal (pad) and a fail state (crash / miss).
Biggest problem: the wing read as a flat card. Need a real canopy later, not now.
What I learned: the polar has to be felt in the first ten seconds or the genre pitch dies.
Where things stand / next: flyable. Next: arcade goals so a session has score, not just “don’t crash.”

## Session 2: arcade goals on the polar
Tool(s): Grok
What I built: rings, combo, thermals as gather nodes, downdrafts as the threat, star unlocks, retry.
Key decisions: thermals refill boost and climb. Rings are the readable “you are doing well” signal. First course stays wide.
Pivots: dropped a plan for many maneuver types on course one. Alpine is a valley line, not a syllabus.
What changed after playtesting: off-pad “landings” in valleys felt like the game stealing the stick. Landing now only counts on the pad; skim is a bounce.
Biggest problem: wall-fold crashes in canyons. Removed the fold. Control loss was a false fail, not skill.
What I learned: Survival tension has to be fair. A hidden crash is not an escalating threat; it is a bug.
Where things stand / next: a run has a start, a gather/spend mid, and a landing. Next: make the body and wing readable.

## Session 3: readable wing and pilot
Tool(s): Grok, Hyper3D Rodin for person + parachute GLBs, Blender for earlier procedural canopy
What I built: seated harnessed pilot, ram-air canopy, thin charcoal lines, chest carabiners. No seat pod. Terrain Studio GLBs for four biomes with FogExp2.
Key decisions: person + parachute only. Lines must not read as arm-thick bars. Camera stays under the wing so the face is solid.
Pivots: a “pod / hang-glider seat” pass was wrong for the brief. Also killed a billboard-card strip that punched holes in the chest.
What changed after playtesting: front orbit clipped the canopy (black flicker). Clamped the camera to the wing deck. Global shadows off after a flickering black square from the shadow frustum.
Biggest problem: see-through pilot and inward faces. Depth write, double-sided fabric, no log depth fighting the sky.
What I learned: judges cannot play a loop they cannot read. Legibility before pretty.
Where things stand / next: the silhouette is a person under a wing. Next: audio + portrait HUD.

## Session 4: portrait hands and offline audio
Tool(s): Grok
What I built: dual thumb brake sliders, Speed / Flare / Boost / Tilt buttons. Kenney CC0 hits. Procedural wind and vario. Pause + volume. Coach line on first flight.
Key decisions: portrait thumbs mimic real toggles. Vario is the survival meter you hear.
Pivots: a dense mobile HUD covered the valley. Stats collapsed; actions stay at the thumbs.
What changed after playtesting: mute must be platform-respecting later; in this prototype mute is local.
Biggest problem: HUD overlap on phones. Fixed by hiding desktop chrome in portrait.
What I learned: the genre floor is clearer when climb and sink are audible, not only numeric.
Where things stand / next: a phone can finish a run. Next: pack for the contest rules, not the public site.

## Session 5: contest pack vs public ship
Tool(s): Grok
What I built: relative asset URLs (`./models`, `./audio`, `./terrains`). Submission notes, design-intent draft, this log. Identified that the Vite/CrazyGames zip is the wrong artefact for this contest.
Key decisions: Devpost zip must be unminified game code in top-level `index.html`, libraries in `vendor/`, zero network, ≤ 35MB. Public Vercel/CrazyGames build stays a separate product.
Pivots: almost submitted the 18MB CrazyGames zip. It fails: minified chunks, SDK script, no `vendor/`, landscape-first chrome.
What changed after playtesting: QA on another host 404’d `/models/*.glb` because of root-absolute paths. Relative paths locked.
Biggest problem: the contest packager copied a production bundle. That is not “readable index.html + vendor.”
What I learned: tell the AI the pack rules on day one. Retrofitting a Vite app is a dedicated session, not a zip rename.
Where things stand / next: design intent and this log match the official templates. Next: assemble a legal offline zip (unminified single HTML, `vendor/three`, local Draco, no SDK), lock portrait, play a full run with the internet off, then submit.

## Session 6: readable source + genre floor
Tool(s): Grok
What I built: Alpine survival loop (fabric/cord salvage, Patch/Bind/Heat wrap, canopy + warmth + storm meters). Contest packer that inlines unminified game JS into top-level `index.html` and puts Three.js in `vendor/`.
Key decisions: judges read the code, so Vite minified chunks are illegal. Genre floor is gather → craft → escalating storm, not rings-as-arcade. Contest zip is alpine-only, portrait, offline.
Pivots: dropped the “altitude is the only resource, no inventory” line after organizer feedback that the prototype did not read as Survival & Resource Management.
What changed after playtesting: first-minute copy now says gather scrap / patch the wing / beat the storm. Craft drawer stays hidden until the first pickup so the opening verb is still steer-and-collect.
Biggest problem: a packed Vite `index.html` was a loader. FAQ: engine exports are fine only if the game code is readable inside `index.html`.
What I learned: pack rules and genre floor are entry requirements, not polish. Retrofitting both in one session is cheaper than a second rejection.
Where things stand / next: legal zip (~14MB, root `index.html`, unminified `tickSurvival` / `gatherSalvage` / `craft`). Re-upload on Devpost, keep genre = Survival & Resource Management, replace the design-intent + this log.
