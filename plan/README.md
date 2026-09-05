# pi-ramanujan: correctness-first acceleration roadmap

## Recommendation

Evolve Ramanujan into a **zero-extra-model-call, semantics-preserving acceleration layer**, rather than a growing shell-command allowlist.

Build in this order:

1. Define the correctness contract and disable unsafe speculation by default.
2. Measure actual overlap opportunities and build differential replay tests.
3. Replace command rewriting/output stitching with an opt-in tool-adapter architecture.
4. Ship one narrowly proven optimization; expand only when measurements justify it.
5. Add harness diagnostics and pursue larger transport/runtime improvements upstream where extension APIs are insufficient.

The current MVP is a useful prototype, **not yet a 100%-correct accelerator**. Adding more commands or a general command cache now would multiply its risks.

## Review baseline

Reviewed local checkout `8901c1761dfc4f5db1433fa0a66527b14c431bdd`, with origin pointing to the supplied GitHub repository. Reviewed all implementation/test files, the supplied article, pi 0.84.4 extension/package/settings documentation, tool override/spawn-hook examples, and the installed built-in Bash implementation. This is a local-checkout review, not a claim that GitHub's latest branch is identical.

Validation: `npm test` passes all 28 tests across five files; `npm run typecheck` passes. Existing tests largely validate the prototype's intended behavior, not equivalence to normal Bash/pi execution. No live-model benchmark was run and no speedup is established by this review.

### What is worth retaining

- Small, understandable modules separating extraction, eligibility, execution, state, and storage.
- No extra LLM calls, prompt instructions, or model-visible telemetry.
- Invocation IDs and promises for tracking in-flight work.
- Parent abort propagation and reuse of pi's local process-tree cleanup.
- Incremental UTF-8 decoding rather than decoding each output chunk independently.
- Testable clock injection and a simple test suite.

### Current execution path

`toolcall_delta → extract command → detect trailing && → launch eligible Git segments → tool_call waits and replaces command with suffix or : → tool_result stitches text → turn_end clears state`

It only triggers when a received partial command ends at `&&`. It eagerly launches multiple segments independently, not as an actual conditional shell chain.

## 1. Define “zero cost” and “100% correct” precisely

### Proposed product contract

**Zero extra model cost:** no draft models, extra inference requests, speculative subagents, added prompt tokens, or model-visible accelerator metadata. Local CPU, RAM, disk I/O, process launches, and abandoned work are real costs and must be bounded and reported. Zero overhead and always faster cannot honestly be guaranteed.

**Correctness means preserving the tool contract, not guaranteeing that the model's answer is correct.** For supported optimizations:

- Preserve finalized tool arguments, authorization, execution backend, environment, and required ordering.
- Preserve model-visible results, errors, truncation behavior, and readable full-output artifacts.
- Preserve externally relevant effects and cancellation/timeout semantics.
- Do not consume stale observations of mutable state.
- On uncertainty, delegate to the original tool unchanged.

Explicitly exclude wall-clock duration and harmless accelerator-local telemetry from equivalence. Define how generated temporary paths and progress timing are compared; do not silently ignore changed output bytes, missing files, or changed error text.

An arbitrary command against a mutable filesystem cannot meet an unconditional equivalence guarantee merely because its name sounds read-only. Early reads can observe different state; even reads can trigger access logs, filesystem atime changes, network access, or configured helper programs. State assumptions and authorization must be explicit.

### Product modes

| Mode | Behavior | Intended status |
|---|---|---|
| `off` | No acceleration | Escape hatch |
| `observe` | Parse and measure opportunities; execute nothing speculatively | Initial default |
| `strict` | Only adapters with a documented equivalence argument and compatible authorization/backend | Release target |
| `experimental` | Explicitly opted-in assumptions about stable worktrees or local prefetch | Separate, not marketed as 100% correct |

“Shadow mode” must not be ambiguous: observation-only mode launches nothing. Executing a second copy for comparison belongs in disposable test fixtures, not arbitrary user repositories.

## 2. Correctness and performance findings

### P0 — Fix before broadening scope

| Finding | Evidence / consequence | Required response |
|---|---|---|
| Eligibility normalizes away dangerous syntax | `src/allowlist.ts` collapses whitespace before checking for newlines. `git status\ntouch marker` returns `true`, but the original string is executed. | Reject unsupported syntax on original input; never classify a different string from the one executed. |
| Option denylist is not a read-only proof | The predicate accepts `git diff "--output=marker"`, `git branch --set-upstream-to=origin/main`, and `git diff --out=marker`. Quoting bypasses raw whitespace-token matching; option abbreviations are Git-version dependent. | Replace “arbitrary arguments minus denylist” with exact parsed grammars and an explicit supported runtime. |
| Git has implicit effects | `git remote show origin` is accepted and may contact the remote. Status can refresh the index; diff/show can use configured helpers; partial clones may fetch missing objects. | Do not equate Git inspection with pure computation. Strict adapters need controlled configuration, object availability, and effect boundaries. |
| Execution precedes authorization | `message_update` launches local processes before any `tool_call` permission gate. | Require explicit authorization for preparation, or do no early I/O. Project trust is not tool-call approval. Cancellation after denial cannot undo effects. |
| `&&` semantics are broken | `src/state.ts` launches all eligible parts before their predecessors complete; a test explicitly requires this. Later outputs are included even if an earlier command fails. | Preserve success dependencies and suppress unreachable execution/results. Parallelism requires a proof, not a read-only label. |
| Final shell program is not validated | Prefix-string matching accepts a changed control-flow context. For `git status && echo ok || echo recovered`, a failed prefix currently causes `:` and loses the recovery branch. Later syntax errors can also make the original command behave differently. | Validate the complete supported grammar at adoption. Unsupported constructs execute normally; earlier speculative effects still require independent safety. |
| Results are not equivalent | `stitch()` inserts newlines, loses exit-code messages, can append Bash's `(no output)` for a successful empty suffix, and does custom truncation after the suffix is already truncated. | Reuse the built-in result path over raw output rather than merging already-formatted results. |
| Artifact/details mismatch | Prefix output is unbounded in memory; combined full output is not saved. Suffix `details` can remain attached to a different combined result. | Bound buffers and preserve the exact result/artifact contract. |
| Execution context differs | `runShellCommand()` creates default local Bash operations, bypassing the active tool's custom shell settings, command prefix, spawn hook, remote/sandbox backend, and session-environment injection. | Never silently replace an unknown backend with local execution. Require explicit adapter cooperation. |
| Timeout semantics differ | Prefix receives no tool timeout; `prepare()` can wait indefinitely, then the suffix gets a fresh timeout. | Specify the normal invocation deadline and preparation budget separately; unsupported timeout cases fall back without introducing a new hang. |

The eligibility examples above were checked by calling the predicate only. The potentially mutating commands were **not** executed.

### P1 — Robustness, integration, and measurement

- **Chunk-boundary dependence:** a delta containing `git status && git br` misses the launch opportunity. Track complete boundaries anywhere in newly received input, even if a subsequent token/quote is incomplete. Never execute an incomplete command segment.
- **Non-structural JSON extraction:** `indexOf('"command"')` does not establish a top-level schema field; JSON whitespace, duplicate keys, invalid escapes, and incomplete strings need explicit handling. Final validated arguments remain authoritative.
- **Repeated parsing:** rescanning growing strings and complete chains on each delta can approach quadratic work. Use per-call cursors and incremental parser state with hard size limits.
- **Mismatch waits unnecessarily:** `prepare()` awaits stale promises even when the final command does not match. Cancel/discard immediately and delegate, without waiting for unrelated work.
- **Preflight head-of-line blocking:** pi's default parallel mode preflights sibling calls sequentially. Waiting inside `tool_call` can delay all siblings. Adoption/waiting belongs inside the executing adapter, after preflight.
- **Extension composition:** argument mutation changes what later permission/audit hooks see; result patching can interact badly with other handlers. A blocked call must never acquire a speculative success result or lose its denial reason.
- **Stats commands affect execution:** `restore()` and `clearStats()` dispose in-flight calls. `/ramanujan` refreshes via `restore()`. Reading or resetting counters must not cancel or lose active execution state.
- **Stats are not saved time:** `speculativeMs` includes discarded work and can misrepresent multiple segments' timing. A shared `endedAt` can reflect one completed segment while others are still pending. Count per-operation events and distinguish overlap from critical-path savings.
- **Synchronous storage:** `mkdirSync`/`appendFileSync` run on launch/accounting paths; replaying an ever-growing log is unbounded. Buffer telemetry, rotate per-session files, and aggregate off the hot path.
- **Documentation drift:** README describes an exact normalized-command set and project-local stats; code accepts arbitrary arguments and stores user-global stats at `~/.pi/ramanujan-stats.data`.

## 3. Target architecture

### A. Pure observer and incremental parser

Keep provider events outside the execution engine. Translate supported public events into a small internal stream:

`invocation-start → argument-fragment → arguments-final → authorized-execute → result → dispose`

Use public event fields; do not depend on incidental `partialJson` properties remaining available. Capture representative provider fixtures and test actual event delivery. A `toolcall_end` is a candidate boundary, **not authorization** or proof that later hooks will preserve arguments.

For shell support, start with a deliberately tiny grammar, not a homegrown general Bash interpreter. Preserve source spans and reject unsupported comments, escapes, substitutions, redirections, pipelines, background jobs, compound lists, and mixed `&&`/`||`. A real shell AST parser can improve syntax recognition later, but does not prove purity.

### B. Explicit adapter capabilities

Suggested conceptual interface, not an existing pi API:

```ts
interface AccelerationAdapter<Args, Prepared> {
  // Includes implementation/backend identity and the preparation authorization policy.
  identity: string;
  classify(args: Partial<Args>, context: ExecutionIdentity): Eligibility;
  prepare(candidate: Candidate, budget: Budget, signal: AbortSignal): Promise<Prepared>;
  // Called with final, post-hook arguments inside authorized tool execution.
  adopt(prepared: Prepared, args: Args, context: ExecutionIdentity): Adoption;
  dispose(prepared: Prepared): Promise<void>;
}
```

Preparation may be pure parsing/allocation, immutable computation, or separately authorized I/O. These are different capabilities, not one `readOnly` boolean.

Each adapter documents:

- Dependencies, observable effects, backend/environment/config identity.
- Argument completeness, schema validation, and occurrence identity.
- Freshness proof and the point at which the result becomes authoritative.
- Timeout, cancellation, errors, output, and artifact behavior.
- Why discarding preparation is safe and what resources it can consume.

Use `(session generation, assistant message, toolCallId, occurrence)` for invocation identity. Keep result caching separate: identical arguments do not justify sharing a nondeterministic or stateful invocation.

### C. Adoption without rewriting the conversation

Prefer a supported tool override/operations wrapper which delegates to the same built-in implementation and consumes prepared data inside its `execute`/operations boundary. Keep original arguments visible to permissions, audit hooks, UI, and session storage. Preserve schemas and prompt metadata exactly.

For Bash, investigate replaying prepared raw bytes through the original tool's output handling rather than patching `tool_result`. That fixes formatting only; it does **not** fix shell semantics or authorization by itself. Do not split a general shell program into fresh shells: shell state, traps, process identity, and control flow can be observable.

Pi supports registering same-name overrides and operations interfaces, but it does not follow that an extension can transparently wrap every existing override or recover its effective backend/configuration. Detect incompatible tool ownership where possible; require adapter registration for cooperating extensions; otherwise decline acceleration. Unknown integration state is a fallback, not permission to use defaults.

### D. Bounded scheduler

- Start conservatively: one preparation per session, small bounded queue, explicit byte/time budgets. Tune using data rather than arbitrary large concurrency.
- Foreground work takes priority; no additional launch once adoption is imminent and launch overhead exceeds likely overlap.
- State machine: `candidate → preparing → ready → adopted | discarded | failed → disposed`.
- Every promise settles into a typed outcome; late completion cannot reattach to a new session or resurrect discarded state.
- Propagate abort to process trees, cleanup files/listeners, and handle reload, shutdown, model errors, blocked calls, and abandoned streams.
- Never turn a preparation failure into a tool failure unless it genuinely represents the authorized invocation's result. Usually discard and delegate.
- A “race normal execution against speculation” policy duplicates work and is not the default; it requires a separately proven pure operation and resource budget.

### E. Freshness policy

Strict reuse begins with **immutable inputs**, not a TTL cache of `git status`, `read`, or search results.

A content hash is useful only if it identifies the actual bytes the authorized operation consumes, with backend and implementation identity included. Metadata equality, filesystem watchers, HEAD equality, and a last-second `stat()` are not complete proofs against concurrent writers, symlink changes, configuration changes, or TOCTOU races.

For mutable reads, prefer accelerating downstream processing of bytes acquired by the authoritative read, or an explicitly defined snapshot API. Hashing the entire input at adoption may cost as much as simply executing the original operation; benchmark it. Do not change ordinary `read` into “read an earlier snapshot” and call it transparent.

## 4. Implementation milestones / suggested PRs

### PR 1 — Contain the prototype and correct its claims (small)

- [ ] Add `off` / execution-free `observe` modes; make observation the default until strict eligibility exists.
- [ ] Add the concrete P0 eligibility regressions before changing the classifier.
- [ ] Separate stats lifecycle from execution lifecycle.
- [ ] Fix README allowlist/storage descriptions and link this roadmap.
- [ ] Keep the existing package manifest approach; pi recommends `*` peers for bundled core packages. Pin the tested development dependency and document a tested host compatibility matrix instead of claiming universal compatibility.

**Done when:** default installation cannot launch a speculative process; stats commands cannot alter active calls; regression tests record the known unsafe cases.

### PR 2 — Replay and differential test harness (medium)

- [ ] Add an offline event player: same assistant/tool events, configurable chunk boundaries, deterministic clock and fake process scheduler.
- [ ] Add real-tool differential tests using disposable repositories and controlled environment/configuration.
- [ ] Compare baseline and accelerated final arguments, content, errors, artifact bytes, effects, and required event ordering. Normalize only documented nondeterminism such as unique temp filenames, while verifying referenced file contents.
- [ ] Test permission-gate ordering both before and after Ramanujan; blocked and argument-rewritten calls; competing overrides; remote/sandbox adapters.
- [ ] Record zero-extra-provider-request and unchanged prompt/schema invariants.

**Done when:** the suite exposes the current chain/output bugs and catches deliberate injected regressions. Tests support a bounded correctness argument; they are not a universal proof.

### PR 3 — Telemetry that measures the opportunity (medium)

- [ ] Record monotonic timestamps for candidate discovery, launch, readiness, authorized execution, adoption, and final completion.
- [ ] Count eligible, rejected-by-reason, launched, adopted, discarded, failed, and cancelled work separately.
- [ ] Add parse/event-handler time, foreground wait, bytes, queue depth, and wasted work; sample expensive metrics.
- [ ] Move persistence off streaming/preflight paths; keep commands, paths, outputs, and prompts out of default telemetry. Raw event capture is explicit opt-in and potentially sensitive.
- [ ] Add `/ramanujan status`, `/ramanujan stats`, and `/ramanujan doctor`; counters must be safe to inspect mid-turn and useful without TUI-only components.

**Done when:** a report distinguishes “work overlapped” from measured end-to-end savings and shows observer overhead against extension-disabled runs.

### PR 4 — Adapter engine and one strict vertical slice (large)

- [ ] Implement parser/candidate identity, typed outcomes, budgeted scheduler, and execution-time adoption.
- [ ] Prove wrapper passthrough first: identical behavior with no hits.
- [ ] Choose the first actual optimization from PR 3 data: pure preparation, computation over already-authoritative immutable bytes, or a cooperating tool with explicitly immutable inputs.
- [ ] If retaining Git as a test adapter, restrict it to controlled, preauthorized immutable-object fixtures first; do not promote ordinary status/diff/log to strict based on command names.
- [ ] Add rejection reasons for unavailable effective backend/config, mutable dependencies, unknown authorization, and unsupported timeout semantics.

**Done when:** one end-to-end path has a written equivalence argument, passes differential/integration tests, and yields reproducible positive net savings. If no candidate clears this gate, ship diagnostics rather than an unsafe accelerator.

### PR 5 — Improve speculative coverage (medium, conditional on PR 4)

- [ ] Make detection invariant to stream chunk boundaries, including complete prefixes followed by incomplete suffixes.
- [ ] Observe complete earlier tool calls while the rest of the assistant message streams; prepare only where separately authorized and dependency-safe.
- [ ] Cover standalone calls when there is measurable remaining generation, rather than requiring `&&`.
- [ ] Introduce additional adapters one at a time with independent proof/test/benchmark gates.
- [ ] Keep dependency-aware serial execution as the chain default. Do not repeat the current eager parallel `&&` behavior.

**Done when:** coverage rises on recorded traces without relaxing the contract or increasing tail latency beyond the agreed budget.

### PR 6 — Release and upstream integration (medium)

- [ ] Windows/Git Bash, Linux, and macOS CI; supported provider event fixtures; TUI, print/JSON, and RPC smoke tests.
- [ ] Lifecycle tests for `/new`, resume, fork, reload, cancellation, failed streams, and shutdown.
- [ ] Package-install smoke test from a clean environment with production dependencies only; add license/repository metadata and tagged releases. Remove `private` only if publishing to npm.
- [ ] Document compatibility limitations, mode defaults, budgets, local-data retention, measured wins, and known non-wins.
- [ ] Propose upstream APIs for any missing safe composition boundary rather than importing private runtime internals.

## 5. Broader acceleration opportunities, ranked

| Priority | Opportunity | Why / likely scope | Correctness boundary |
|---|---|---|---|
| 1 | Latency and cache diagnostics | Extension can identify time in provider response, decoding, hooks, tools, and local event handling; some spans need upstream instrumentation. | Passive measurement; sanitized telemetry and very low overhead. |
| 2 | Remove accelerator overhead | Incremental parsing, cheap imports, asynchronous bounded telemetry, no preflight waits. Directly actionable here. | Preserve behavior; measure extension-disabled versus observe. |
| 3 | Pure preparation and immutable computation reuse | Earlier parsing/allocation or cached deterministic transforms over authoritative bytes. Extension adapters or upstream tool internals. | Exact implementation/input identity; authorization still runs per invocation. |
| 4 | In-flight deduplication for explicitly pure tools | Multiple identical immutable computations share work without needing speculative guesses. | Never deduplicate nondeterministic calls, permission checks, effects, or mutable reads just by arguments. Reference-count cancellation. |
| 5 | Earlier preparation of completed sibling calls | More general than Bash `&&`; overlap with later assistant output. | Must respect permission/backend/state constraints. Default parallel execution already overlaps siblings after preflight. |
| 6 | Prompt-cache health | Diagnose changing system prompts/tool metadata and cache misses. Recommend existing pi/provider options before implementing another mechanism. | Never strip instructions, change schemas, inject cache-warming requests, or claim cache controls are free on every provider. |
| 7 | Transport connection reuse | Audit existing SSE/WebSocket/connection reuse; opt into supported settings when appropriate. Usually provider/core work. | Preserve auth, cancellation, retry, and request semantics; no speculative billable request. Benchmark current defaults first. |
| 8 | Runtime/TUI/serialization hot paths | Profile repeated rendering, copying, serialization, resource loading, and startup work. Likely upstream fixes rather than a tool-caller feature. | Preserve final content and required lifecycle delivery; buffering must not delay cancellation or change persistence guarantees. |
| Experimental | Filesystem/page-cache warming | Might reduce cold reads; actual tool still performs an authoritative read. | Early I/O still needs permission and can affect atime, contention, privacy, and device/network behavior. Not universally strict. |
| Experimental | Snapshot-backed read/grep/find cache | Potentially useful on large immutable trees. | New explicit snapshot semantics or real synchronization required. Watcher/mtime-only invalidation is insufficient. |
| Research | Structured programmatic tool DAG | Effect/dependency declarations enable safe overlap without inferring arbitrary Bash semantics. Cooperating-tool or upstream project. | New tool schema/programming model changes the action space; keep separate from transparent acceleration. |

Avoid defaulting to a persistent shell: it can leak environment, cwd, traps, aliases, and state between calls. A reusable worker for pure computations over immutable data is a much narrower proposition.

Do not count smaller models, less thinking, lossy output compression, context pruning, tool hiding, speculative subagents, or changed retry policy as part of the unchanged-semantics/zero-extra-model-cost promise. They can be useful separate experiments, but optimize a different objective.

## 6. Benchmark and release gates

### Measure the right quantity

For an isolated eligible operation with duration `T`, launch at `t_launch`, and normal execution point `t_exec`:

`ideal hidden latency <= min(T, max(0, t_exec - t_launch))`

Then subtract parsing, validation, scheduling, storage, extra process setup, and contention. Concurrent intervals cannot simply be summed into wall-clock savings. Critical-path savings require baseline comparison or an explicitly labeled model.

The maximum end-to-end impact also depends on the fraction `f` of baseline latency affected: even eliminating that fraction entirely gives at most `1 / (1 - f)` speedup. Fast Git commands with little remaining generation may offer almost no net benefit.

### Workloads

1. Synthetic timing fixtures with known dependency graphs and overlap bounds.
2. Local real-tool fixtures: small/large repositories, clean/dirty trees, cold/warm caches, small/huge outputs, successes/failures, no-output cases.
3. Offline recorded event replays across observed providers and chunking patterns, with no additional model requests.
4. Optional separately budgeted live paired trials: replay validates harness semantics, but cannot alone establish real-world total task latency or model behavior.

Compare extension disabled, observe, and strict; keep experimental results separate. Randomize paired run order and isolate mutable fixtures to limit warm-cache/order bias. Report sample counts, median/p95, variability, absolute milliseconds, coverage, hit rate, waste, memory/CPU, and extra model requests/tokens—not only best-case speedup.

### Test matrix additions

- Every possible fragment boundary for small JSON/shell fixtures; randomized chunking for larger cases.
- Duplicate/missing command keys, escaped keys/values, all JSON whitespace, incomplete Unicode and invalid escapes.
- Quoted operators, comments, backslash-newlines, shell substitutions, redirections, option quoting/abbreviations, mixed control flow, final syntax errors.
- Prefix failure with later eligible commands; successful empty suffix; non-newline output; mixed stdout/stderr; partial UTF-8; oversized output and artifacts.
- External mutations, refs/config/environment changes, symlink swaps, concurrent pi sessions, and preceding/sibling writers.
- Denial, hook argument changes, unavailable backends, malformed final args, timeout supplied after command, abort at every transition.
- Rejections, never-settling fake jobs, late completions, shutdown/reload, bounded queues/output, corrupt storage, and stats inspection while active.

Provisional gates, to calibrate after baseline collection: no known equivalence failures; zero extra model requests/prompt changes; bounded resources; observer hook overhead below 1 ms p95 on the reference machine; no material p95 end-to-end regression (initial alert threshold 2% outside measurement noise); reproducible positive net gains on at least one representative workload. Do not promise a universal speedup percentage in advance.

## 7. What to take from the article

Alex Zhang's [Speculative Programmatic Tool Calling](https://alexzhang13.github.io/blog/2026/spec-ptc/) contributes three especially useful ideas:

1. **Preparation and real execution share promises through an explicit function contract.** Adopt this, rather than rewriting shell text and reconstructing formatted results.
2. **Dependencies and invocation occurrence matter.** Use a dependency graph where semantics are known; identical arguments are not always interchangeable calls.
3. **Measure realistic overlap.** The article reports roughly 1–1.2× on its RLM experiments; its illustrative 2.4× example is not a pi speedup prediction. Its tools often include high-latency sub-LLM calls, unlike this MVP's local Git prefixes.

Do not port the shadow REPL as a general Bash executor. Deep-copying a language namespace does not isolate filesystem/network effects, and speculative paid subcalls violate this project's cost constraint. Start with explicit, narrow adapters and no speculative code evaluation.

## Next working session

Implement **PR 1**, then **PR 2**, not a larger allowlist. The first meaningful checkpoint is: “We can demonstrate where the old MVP changes behavior, and the new default cannot do that.” After measurement, choose one profitable strict adapter or pivot toward harness diagnostics/upstream overhead fixes.

### References for implementation

- Project: https://github.com/FletcherDares/pi-ramanujan
- Article: https://alexzhang13.github.io/blog/2026/spec-ptc/
- Article implementation (future deeper study, not audited here): https://github.com/alexzhang13/spec-ptc
- pi docs reviewed: installed `docs/extensions.md`, `docs/packages.md`, `docs/settings.md` (0.84.4).
- pi examples reviewed: installed `examples/extensions/tool-override.ts`, `examples/extensions/bash-spawn-hook.ts`.
- pi implementation reviewed: `node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js`.
- Upstream tool reference: https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/src/core/tools/bash.ts
