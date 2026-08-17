# Design-Intent Document: Aero Glide — Canyon Rush

**Target Genre**: Survival & Resource Management (Cross-Country Thermal Odyssey)
**Platform**: Three.js / HTML5 Mobile Web Prototype (Portrait Orientation)
**Target Word Count**: Under 500 words

---

### 1. Who Are the Players?
Aero Glide appeals to mobile gamers and flight simulation enthusiasts seeking an accessible yet high-skill physics challenge. Players who enjoy intuitive physical mechanics (such as glide conservation, thermal soaring, and precision flare landings) combined with arcade pacing and escalating atmospheric hazards.

### 2. What Is the Game?
*Aero Glide: Canyon Rush* is a single-player paragliding survival and navigation prototype. The player pilots a ram-air paraglider across treacherous mountain canyons, ocean archipelagos, desert dunes, and volcanic rifts. 

The core game loop centers around **Energy and Altitude Resource Management**:
- **Potential Energy (Altitude)**: Every second in the air, the glider sinks along its aerodynamic polar curve. Players must read terrain contours and hunt rising thermal columns (+4.5 m/s) and ridge updrafts to climb.
- **Kinetic Energy (Airspeed & Stamina)**: Diving and speed-barring penetrates headwinds and gains speed at the cost of sink rate. Centering thermals restores boost stamina.
- **Hazard Avoidance**: Sinking downdrafts, rotors on leeward cliffs, and turbulent air pockets drain altitude and threaten crashes.
- **Precision Landing**: At the course terminus, the player must time a dual-brake flare (reducing sink below 1.0 m/s) to stick a bullseye landing on the target pad.

### 3. What Does This Prototype Contain?
- **Physics & Flight Model**: Realistic aerodynamic polar with independent left/right brake steering, weight shift, speed bar accelerator, emergency big-ears descent, and harness pendulum inertia.
- **Dynamic 3D Ram-Air Canopy & Pilot Rig**: Multi-cell canopy with leading-edge ram-air intakes, rib tapes, dynamic trailing-edge deflection on brake, and animated pilot hands pulling brake toggles.
- **Offline Synthesized Audio**: Procedural Web Audio API engine featuring an authentic variometer (thermal climb beeps / sink alarm) and airspeed wind sound.
- **Universal Controls**: Touch controls optimized for mobile portrait mode (dual thumb brake sliders), desktop keyboard/mouse, gyroscope device tilt, and Gamepad API support.
- **Four Biomes**: Alpine Slalom, Coastal Run, Dune Storm, and Ridge Runner with dynamic terrain collisions, procedural thermals, downdrafts, and waypoint navigation.

### 4. Future-State Vision
Building upon this prototype with Meta Horizon Creator tools:
1. **Multiplayer Tandem & Cross-Country Races**: Group thermalling, slipstream mechanics, and shared cross-country airspace.
2. **Procedural Weather Systems**: Dynamic cloud streets, shifting frontal winds, rain squalls, and day/night thermic cycles.
3. **Glider Customization & Gear Crafting**: Upgradable EN-A to EN-D competition wings, lightweight hike-and-fly harnesses, reserve chutes, and variometer instruments.
4. **Creator Sandbox**: In-game canyon and thermal course designer allowing community members to publish custom flight challenges.
