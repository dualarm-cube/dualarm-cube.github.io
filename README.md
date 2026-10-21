# Dual-Arm Robotic Rubik's Cube Solver

Project page for our ECE 445 Senior Design project (UIUC, Spring 2026): https://dualarm-cube.github.io/

Qixuan Huang, Yiming Xu, Rong Wang, Zhuoyang Shen

## Layout

- `index.html` — the page (plain HTML, no build step)
- `static/css`, `static/js` — styles, the 3D replay viewer (`replay.js`, three.js from jsDelivr) and the results charts (`charts.js`)
- `static/sim/` — simulation exports: `scene.json` + `meshes.bin` (the MuJoCo model's bodies and CAD meshes), `replays/*.json|bin` (recorded runs), `stats.json` (1000 random scrambles)
- `static/videos`, `static/images` — robot footage, MuJoCo renders and figures

## Regenerating the simulation files

The exports come from `cube_mujoco/scripts/web_export/` in the project repository, using its MuJoCo environment:

```bash
cd cube_mujoco/scripts/web_export
python export_replay.py --out <this repo>/static/sim
python batch_stats.py --n 1000 --out <this repo>/static/sim/stats.json
python render_video.py --moves "R U R' U'" --out <this repo>/static/videos/sim_warmup.mp4
python render_video.py --seed 7 --scan --steps 14 --settle-steps 6 --out <this repo>/static/videos/sim_solve1.mp4
```

## Previewing locally

```bash
python3 -m http.server 4455
```

then open http://localhost:4455. The replay loads its data with `fetch`, so opening `index.html` directly from disk won't work.
