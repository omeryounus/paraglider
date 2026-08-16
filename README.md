# Paraglide

A single-scene 3D paragliding flight simulator built with **Vite**, **Three.js**, and **TypeScript**. It is ready to host on **Vercel** and designed to fly over landscapes exported from [Terrain Studio](https://terrains.zyfod.dev/).

The empty GitHub repo [omeryounus/paraglider](https://github.com/omeryounus/paraglider) is the project home. Until `public/terrain.glb` is present, the game generates a procedural alpine valley so you can fly immediately.

## Flight model

- Constant forward motion along heading at a **12 m/s** base speed
- **9:1 glide ratio** (`sink = -speed / 9`)
- Pitch down increases airspeed and sink; pitch up / **flare** (Space) bleeds speed and shallows the descent
- Roll banks the canopy visually and yaws the heading
- Three cylindrical **thermals** add **+3.5 m/s** lift while you are inside them
- Downward `Raycaster` vs the terrain mesh: AGL ≤ 1 m ends the flight
  - Gentle sink (`|vy| < 2 m/s`) and a level wing → **Safe Landing**
  - Steep sink or high bank → **Crash**

## Controls

| Input | Action |
| --- | --- |
| `W` / `S` or `↑` / `↓` | Pitch |
| `A` / `D` or `←` / `→` | Steer |
| `Space` | Flare / brake |
| `R` | Restart |

## Load a Terrain Studio landscape

1. Open [Terrain Studio](https://terrains.zyfod.dev/) and author a tile (or use a template).
2. Export a **GLB** package. The **Three.js Viewer Assets** preset is the best match. Draco-compressed meshes are supported.
3. Unzip the export and copy `terrain.glb` to `public/terrain.glb`.
4. Optional: also copy `collision.glb` if the zip includes a dedicated collision mesh.

The loader prefers, in order:

1. `/collision.glb` if present
2. A node named `Collision_Mesh` inside `terrain.glb`
3. `Terrain_Surface` / `Terrain_Board`
4. The rest of the GLB (water / skirt / slab nodes are skipped when a named surface exists)

Tiny exports are auto-scaled so the valley stays flyable. Shadows are enabled on every loaded mesh.

## Local development

```bash
npm install
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`).

```bash
npm run build    # typecheck + production bundle
npm run preview  # serve dist/
```

## Live

- App: [https://paraglider-six.vercel.app](https://paraglider-six.vercel.app)
- Repo: [https://github.com/omeryounus/paraglider](https://github.com/omeryounus/paraglider)

## Vercel

This is a standard Vite app. Connect the GitHub repo in the Vercel dashboard, or deploy from the CLI:

```bash
npx vercel
```

`vercel.json` sets the Vite build command and `dist` output directory. After the first deploy, replace `public/terrain.glb` and push again to fly your own Terrain Studio map.

## Project layout

```
index.html
src/main.ts        # scene, glider, aerodynamics, collision, HUD
src/style.css
package.json
vite.config.ts
public/terrain.glb # optional Terrain Studio export
```
