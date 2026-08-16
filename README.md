# Aero Glide: Canyon Rush

Arcade precision flight built with **Vite**, **Three.js**, and **TypeScript**. Dive mountain valleys, thread glowing rings, ride thermals, and nail bullseye landings. The four courses match Terrain Studio templates from [terrains.zyfod.dev](https://terrains.zyfod.dev/).

- Live: [https://paraglider-six.vercel.app](https://paraglider-six.vercel.app)
- Repo: [https://github.com/omeryounus/paraglider](https://github.com/omeryounus/paraglider)

Each biome plays immediately on a procedural stand-in. Drop a Studio GLB at `public/terrains/{mapId}.glb` to swap in a hand-authored landscape.

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

| Input | Action |
| --- | --- |
| `W` / `↓` | Dive — accelerate toward 22 m/s |
| `S` / `↑` / `Space` | Flare — bleed to 6 m/s |
| `A` `D` / arrows | Bank / yaw |
| `Shift` | Boost (2×, drains meter) |
| `R` | Retry |

On touch devices a virtual stick plus Boost / Flare buttons appear.

## Terrain Studio maps

Place Terrain Studio exports here:

```
public/terrains/mountain.glb
public/terrains/island.glb
public/terrains/desert.glb
public/terrains/hybrid.glb
```

Draco meshes are supported. The loader prefers a `Collision_Mesh` node, then `Terrain_Surface`. Tiny boards are auto-scaled. Without a file, the matching procedural biome is used.

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
