# CrazyGames submission — Aero Glide: Canyon Rush

Portal: https://developer.crazygames.com/  
Docs followed: https://docs.crazygames.com/ (Basic Launch + HTML5 v3 SDK)

## Upload files

- Game zip: `dist/aero-glide-crazygames.zip`
- Landscape cover: `docs/crazygames/cover-landscape-1920x1080.jpg` (1920×1080)
- Portrait cover: `docs/crazygames/cover-portrait-800x1200.jpg` (800×1200)
- Square cover: `docs/crazygames/cover-square-800x800.jpg` (800×800)
- Landscape video: `docs/crazygames/preview-landscape-1080p.mp4` (16:9, ~18s, silent)
- Portrait video: `docs/crazygames/preview-portrait-1080p.mp4` (2:3, ~18s, silent)

## Listing copy

**Name:** Aero Glide: Canyon Rush

**Short description:**  
Pilot a ram-air paraglider through alpine canyons. Thread glowing rings, ride thermals, and flare onto the bullseye.

**Long description:**  
Aero Glide: Canyon Rush is a 3D arcade paragliding game. You fly a seated pilot under a ram-air wing across four biomes — alpine mountains, a tropical coast, desert dunes, and a high ridge.

Steer with left and right brakes, dive for speed, flare to land, and hunt blue thermal columns to climb. Score by hitting rings, skimming cliffs, and sticking a soft landing on the pad. Earn a star to unlock the next course.

Works on desktop and mobile. Keyboard, touch sliders, tilt, and gamepad are all supported.

**Controls (desktop):**  
A / D or arrows — bank  
W or ↓ — dive / speed bar  
S, ↑, or Space — flare  
B — big ears  
Shift — boost  
V — cockpit view  
P — pause  
R — retry

**Controls (mobile):**  
Left and right thumb sliders pull the brakes. Use the on-screen Speed Bar, Flare, Boost, and Tilt buttons.

**Orientation:** Landscape (also playable in portrait with touch controls)

**Tags:** flying, 3D, arcade, sports, simulation, paragliding, racing

**PEGI:** 12 (no violence, no chat)

**Progress save:** Yes, using the CrazyGames Data module (falls back to localStorage off-platform)

**SDK:** HTML5 v3 — init, loading start/stop, gameplay start/stop, muteAudio, happytime on a 3-star clear

## Basic Launch checklist

- [x] English UI
- [x] Chrome / Edge WebGL
- [x] Mouse, keyboard, and touch
- [x] Relative file paths (`base: './'`)
- [x] Total zip well under 50 MB
- [x] No external ads or store links
- [x] No custom fullscreen button
- [x] GameplayStart after a course loads
- [x] user-select disabled on the body
