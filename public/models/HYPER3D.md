# Hyper3D Rodin drop-in

Official Hyper3D pack downloads (`base_basic_pbr.glb`).

| Rodin job | Saved as |
| --- | --- |
| Seated pilot (`73e4a776-1d58-4549-aa2a-f63a69c18175`) | `public/models/person.glb` |
| Parachute (`5336934e-faee-4ad5-80c3-833496a18202`) | `public/models/parachute.glb` |

Each file is the packed PBR GLB (diffuse + metallic-roughness + normal). No seat/pod file.

The game loads those two paths at boot, scales the parachute to ~9.2 m span, stands the person under it (~1.7 m), and hides any leftover seat mesh.
