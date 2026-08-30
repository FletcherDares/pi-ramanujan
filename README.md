# pi-ramanujan

Speculative `&&` for [Pi](https://pi.dev/). When bash streams `git status && git branch`, runs `git status` early, then only `git branch`, stitches output.

Allowlist: `git status`, `git branch` (`src/allowlist.ts`).

```bash
pi install ./
```

`/ramanujan` — show speculation stats. `/ramanujan clear` — clear.

Stats are saved in Pi's per-project data directory (not sent to the model), so they survive restarts and all `/new` sessions. `/ramanujan clear` resets the project totals.

```bash
npm test
```
