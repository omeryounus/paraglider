# Aero Glide: Canyon Rush

Arcade precision flight built with **Vite**, **Three.js**, and **TypeScript**. Dive mountain valleys, thread glowing rings, ride thermals, and nail bullseye landings. The four courses match Terrain Studio templates from [terrains.zyfod.dev](https://terrains.zyfod.dev/).

- Live: [https://paraglider-six.vercel.app](https://paraglider-six.vercel.app)
- Repo: [https://github.com/omeryounus/paraglider](https://github.com/omeryounus/paraglider)

Each biome ships a Terrain Studio–style GLB in `public/terrains/`. If a file is missing, the game falls back to a procedural heightmap.

## Courses

| Level | Terrain Studio template | Flavor |
| --- | --- | --- |
| Alpine Slalom | Mountain Range | Tight canyon, speed-ring chains |
| Coastal Run | Tropical Island | Water skimming, beach bullseye |
| Dune Storm | Desert | Heavy thermals, wandering downdrafts |
| Ridge Runner | Geological Hybrid | Terraced drops, gold-ring gaps |

## Play loop

- **Green rings** +500 and grow combo
- **Gold rings** +1,500 and fill boost
- **Cyan boost rings** +1,000 and a 2× speed surge
- Miss a ring: combo dies and the clock loses 4 seconds
- Thermals refill boost and launch you
- Red downdrafts dump altitude unless you boost through
- Near-miss skims award live points and charge boost
- Bullseye landing 5,000 (2× if you flare under 1.5 m/s)

Stars are awarded from score thresholds. Best run is stored in `localStorage`.

## Controls

| Action | Keyboard | Touch / Mobile |
| :--- | :--- | :--- |
| **Pitch Down (Dive / Speed)** | `W` / `Down Arrow` | Virtual Stick Forward |
| **Pitch Up / Flare (Brake)** | `S` / `Up Arrow` / `Space` | Flare Button |
| **Steer / Bank** | `A` / `D` or `Left` / `Right` | Virtual Stick Left / Right |
| **Boost Rush** | `Shift` | Boost Button |
| **Toggle Camera (3rd / Cockpit)** | `V` | Cam Button |
| **Look / Orbit** | Drag mouse | Drag |
| **Zoom in / out** | Wheel, `+` / `-` | `+` / `−` buttons |
| **Reset view** | `Home` / `0` | RESET button |
| **Retry** | `R` | — |

## Terrain Studio maps

Boards from [Terrain Studio](https://terrains.zyfod.dev/) live here:

```
public/terrains/mountain.glb   — Mountain Range
public/terrains/island.glb     — Tropical Island
public/terrains/desert.glb     — Desert Dunes
public/terrains/hybrid.glb     — Geological Hybrid
```

Re-export a template as GLB from the site and replace the matching file to fly your own landscape. Draco meshes are supported. The loader prefers a `Collision_Mesh` node, then `Terrain_Surface`. Tiny boards are auto-scaled.

## Develop

```bash
npm install
npm run dev
npm run build
```

Vercel is configured as a Vite app (`vercel.json`). Push to `main` to ship.

## Layout

```
src/config/     levels, constants
src/game/       physics, scoring, course, terrain, camera, input
src/entities/   glider, rings, thermals, hazards, pad, orbs
src/ui/         HUD, menus, touch
src/main.ts     boot + frame loop
```
