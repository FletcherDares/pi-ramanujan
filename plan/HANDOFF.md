# Handoff: next implementation session

## Current state

- `main` is synchronized with `origin/main`.
- No open pull requests.
- The roadmap is in `plan/README.md`.
- Product modes are documented as `on` and `off`; `on` is the documented default and `off` is the escape hatch.
- Runtime mode switching is not implemented yet. The extension currently always installs its speculative Bash hooks.
- The current MVP still rewrites Bash commands, launches speculative processes, and stitches results. It is not yet semantics-preserving.

## Next step

Implement the first small runtime slice of PR 1: an explicit `on`/`off` setting with `on` as the default.

Requirements:

1. Locate the supported Pi extension/settings API and add a single mode setting.
2. Preserve current behavior when the setting is `on`.
3. When `off`, do not parse, launch, rewrite, or stitch speculative work; let normal Bash execution proceed unchanged.
4. Keep stats inspection and clearing independent from active execution.
5. Add focused tests for default-on behavior, off-mode pass-through, and no speculative launcher calls while off.
6. Run `npm test` and `npm run typecheck`.

After that, add the concrete P0 eligibility regression tests from the roadmap before broadening the allowlist. Do not implement an observation mode, a general command cache, or more speculative commands.

## Important constraints

- Preserve original tool arguments for permissions and audit hooks where possible.
- Do not silently change the execution backend or shell configuration.
- Unsupported or uncertain commands must fall back to normal execution.
- Do not add code comments unless explicitly requested.
- Keep changes small and submit them as a focused PR.

## Useful commands

```bash
npm test
npm run typecheck
git status --short --branch
gh pr list --state open
```
