# Examples — Hackathon Contributions

Behaviors in this directory were built by hackathon participants. **They are
examples, not official Math Square exhibits** — they haven't been through the
full exhibit review, tuning, and stability testing that the rotation pieces
(Venus, Voronoi, …) have. They're here so the next group starts from something
real and working rather than a blank file.

## Layout

Each participant or team gets **their own subfolder**, so contributions never
collide:

```
examples/
  <event>/                     e.g. hackathon-2026
    <your-name>/
      README.md                describe your behavior(s), the math, how to run
      your-behavior.js
```

## Adding yours

Fork the devkit, branch off `main`, create your own subfolder under
`examples/<event>/<your-name>/`, add your files, and open a pull request into
`main`. Because you only ever add **new files in your own folder**, your PR
merges cleanly no matter what anyone else changes or what order the PRs land in
— no conflicts to resolve.

## Running an example

Point the behavior loader in `main.ts` at a file, then `npm run dev`:

```js
const beh = await import('./examples/<event>/<name>/<behavior>.js');
```

Dev tip: in the dev window set **sensors = Off**, check the **mouse** box, and
**click-and-hold + drag** to act as a player.

Shared under the same [MoMath Source Available License](../LICENSE) as the rest
of the devkit.
