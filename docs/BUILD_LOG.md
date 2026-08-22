# Build Log

Official contest file: `docs/devpost/buildlog.md` (upload as `buildlog.md`).

The notes below are outdated. Do not submit this file.

---

## Session 1: Codebase Diagnostics & 3D Asset Disconnection Analysis
- **Goal**: Identify why the 3D paraglider visual was disjointed and lacking controls.
- **Analysis**:
  - Found height coordinate offset mismatch between parent canopy group (`position.y = 3.15`) and nested mesh models.
  - Identified that suspension lines were tied to an invisible dummy mesh rather than true anchor points.
  - Discovered pilot arm rotations were overwriting glTF quaternions with raw Euler angles, twisting limbs into unnatural angles.
  - Identified missing authentic flight controls (independent dual brakes, speed bar, big ears, weight shift).
  - Detected external CDN URLs (Google Fonts and Draco decoders) that violated the competition's 100% offline rule.
- **Locked Decisions**:
  - Unify the paraglider 3D hierarchy into a dynamic ram-air canopy with animated trailing-edge deflection and realistic cascade line rigging.
  - Switch Draco decoding to 100% local assets in `public/draco/`.
  - Replace external CDN fonts with robust local typography stacks.

---

## Session 2: Flight Physics & Aerodynamic Polar Overhaul
- **Goal**: Build an authentic paragliding aerodynamic model in `src/game/physics.ts`.
- **Implementation**:
  - **Dual Independent Brakes**: Left brake (`leftBrake`) slows down the left wing tip, generating differential drag, yaw, and banking into the turn. Symmetrical braking (`symBrake`) slows forward airspeed and increases glide angle.
  - **Speed Bar**: Lowers angle of attack, increasing airspeed from 12 m/s to 22+ m/s while steepening sink rate.
  - **Big Ears**: Tucks outer 20% of wingtips downward, dumping altitude rapidly without excess speed.
  - **Flare Landing**: Dynamically converts forward kinetic airspeed into lift cushion near the ground for smooth touch-downs under 1.0 m/s.
  - **Harness Pendulum Dynamics**: Pilot swings beneath canopy with realistic roll and pitch inertia lag.
- **Outcome**: The glider feels alive and responsive, capturing the physical essence of real paragliding.

---

## Session 3: 100% Offline Synthesized Audio Engine
- **Goal**: Deliver rich flight audio without any external audio file dependencies or network calls.
- **Implementation** in `src/game/audio.ts`:
  - Utilized Web Audio API oscillators, noise buffers, and bandpass filter nodes.
  - **Aviation Variometer**: Procedural tone generator emitting intermittent pitch-ascending beeps (+4.5 m/s climb) and low sinking alarm tones (-3.5 m/s sink).
  - **Airspeed Wind Rush**: White noise stream dynamically modulated in volume and cutoff frequency by forward airspeed.
  - **Sound Effects**: Chimes for ring waypoints, boost surges, and soft flare landing chords.

---

## Session 4: Comprehensive Multi-Device Controls & Mobile Portrait UI
- **Goal**: Create intuitive, thumb-accessible controls for portrait mobile screens, plus keyboard and gamepad support.
- **Implementation**:
  - **Mobile Portrait Touch Layer**: Dual vertical brake sliders on screen edges (mimicking paraglider brake toggles) + floating action buttons for Speed Bar, Big Ears, Boost, Cam POV, and Gyro Tilt.
  - **DeviceOrientation Gyroscope**: Real-time phone tilt steering.
  - **Gamepad API Support**: Analog triggers for left/right brakes, thumbstick for flight attitude.
  - **Desktop Keyboard**: Intuitive W/A/S/D, Arrow keys, Shift, Space, and Q/E weight shift.

---

## Session 5: Submission Packaging & Offline Compliance Verification
- **Goal**: Automate packaging into the required `< 35MB` single `.zip` with top-level `index.html` and `vendor/three.module.js`.
- **Implementation** in `scripts/build-submission.mjs`:
  - Verifies zero external network fetches.
  - Compiles TypeScript and builds production distribution.
  - Bundles assets and generates `aero-glide-submission.zip` (9.55 MB).
- **Status**: 100% Compliant with all competition rules.
