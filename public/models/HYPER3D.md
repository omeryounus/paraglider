# Hyper3D Rodin drop-in

Drop-ins from the public Hyper3D card API (workspace login is not required for the preview mesh + PBR maps). Official **Download** on hyper3d.ai stays behind Login/Subscribe.

| Rodin job | Saved as |
| --- | --- |
| Person (`0e68bae9-4f5f-4f1e-a230-5f3874a028b1`) | `public/models/person.glb` |
| Parachute (`5336934e-faee-4ad5-80c3-833496a18202`) | `public/models/parachute.glb` |

Each file is the `model_refine/model.glb` mesh plus embedded `texture_diffuse` / `texture_pbr` / `texture_normal`. No seat/pod file.

The game loads those two paths at boot, scales the parachute to ~9.2 m span, stands the person under it (~1.7 m), and hides any leftover seat mesh.
