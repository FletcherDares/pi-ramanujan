# pi-ramanujan

> Experimental MVP; not yet correctness-preserving. See the [review and acceleration roadmap](plan/README.md) for known issues, safety requirements, and implementation milestones.

Speculative `&&` for [Pi](https://pi.dev/). When bash streams `git status && git branch`, runs `git status` early, then only `git branch`, stitches output.

Eligibility currently uses Git subcommand checks and an option denylist (`src/allowlist.ts`). It accepts arbitrary arguments in several cases and has known safety gaps; it is not a guarantee of read-only execution.

```bash
pi install ./
```

`/ramanujan` — show speculation stats. `/ramanujan clear` — clear.

Stats are saved in `~/.pi/ramanujan-stats.data` (not sent to the model), shared across this user's projects and sessions. `/ramanujan clear` resets these shared totals.

## Inspiration

This project was inspired by Alex Zhang's [Speculative Programmatic Tool Calling](https://alexzhang13.github.io/blog/2026/spec-ptc/). Thanks to Alex for sharing the ideas that sparked this work.

```bash
npm test
```
