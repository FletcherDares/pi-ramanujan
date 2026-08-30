# pi-ramanujan

Speculative `&&` splitter for the [Pi](https://pi.dev/) harness.

**Detect-only for now** — watches bash commands as they stream, finds complete prefixes before `&&`, and logs them. Does not run commands early yet.

## Install

```bash
pi install ./
```

Or from git once published:

```bash
pi install git:github.com/FletcherDares/pi-ramanujan
```

## Usage

The model uses `bash` as usual. Ramanujan hooks in automatically.

- `/ramanujan` — show detected splits this session
- `/ramanujan clear` — clear history

## Dev

```bash
npm install
npm test
npm run typecheck
```
