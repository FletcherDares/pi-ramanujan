# pi-ramanujan

> Always-on acceleration for Pi. It is not yet correctness-preserving; see the [review and acceleration roadmap](plan/README.md) for known issues, safety requirements, and implementation milestones.

Speculative `&&` for [Pi](https://pi.dev/). When bash streams `git status && git branch`, runs `git status` early, then only `git branch`, stitches output.

The accelerator is enabled by default and only starts recognized Git prefixes. Set `ramanujan.mode` to `"off"` in `~/.pi/agent/settings.json` or `.pi/settings.json` to pass Bash through unchanged. Unsupported shell syntax and known mutating or externally executing options are rejected; this is still not a guarantee of read-only execution.

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
