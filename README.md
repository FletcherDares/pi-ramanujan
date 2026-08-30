# pi-ramanujan

Speculative `&&` for [Pi](https://pi.dev/). When bash streams `git status && git branch`, runs `git status` early, then only `git branch`, stitches output.

Allowlist: `git status`, `git branch` (`src/allowlist.ts`).

```bash
pi install ./
```

`/ramanujan` — show speculation stats. `/ramanujan clear` — clear.

Stats are saved as Pi session entries (not sent to the model), so they survive restarting and resuming a session. A new `/new` session starts with empty stats.

```bash
npm test
```
