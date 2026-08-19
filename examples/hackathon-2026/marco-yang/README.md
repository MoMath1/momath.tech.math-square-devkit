# Hackathon 2026 — Marco Yang

One Canvas2D behavior that walks a cat VAE's latent space with your feet.

> This is a hackathon **example, not an official Math Square exhibit.**

| Behavior | File | The math |
|---|---|---|
| **Latent Walk (AFHQ Cats)** | `latent-walk.js` | PCA of an AFHQ v2 cats VAE latent space. Each person steers the next pair of principal components; one shared live decode fills the floor. |

Ships a single ONNX decoder (`assets/decoder.onnx`) plus PCA metadata (`assets/meta.json`). Attract-mode ghosts keep the cat morphing when the floor is empty.

## How to run

This example needs `onnxruntime-web` (already in `package.json` on this branch). Point the loader in `main.ts` at the behavior, then `npm run dev`:

```js
const beh = await import('./examples/hackathon-2026/marco-yang/latent-walk.js');
```

**Dev tips**
- Set **sensors = Off**, check the **mouse** box, then **click-and-hold + drag**
  to act as a player.
- First load compiles the ONNX decoder (WebGPU if available, otherwise WASM)
  and can take a few seconds.
- Each tracked person gets the next PC pair (`PC1–PC2`, `PC3–PC4`, …), up to 8.
- Walk left/right to change the odd-numbered PC; up/down for the even one.
