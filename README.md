# pi-ramanujan

Speculative `&&` for [Pi](https://pi.dev/). When bash streams `git status && git branch`, runs `git status` early, then only `git branch`, stitches output.

Allowlist: `git status`, `git branch` (`src/allowlist.ts`).

```bash
pi install ./
```

`/ramanujan` — show speculation stats and splits. `/ramanujan clear` — clear.

```bash
npm test
```
