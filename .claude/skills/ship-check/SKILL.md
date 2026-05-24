---
name: ship-check
description: Run SyncFit's ready-to-ship verification gate (unit tests, type check, lint, format check, build) plus the conditional iOS and Neon integration suites when relevant files changed. Use before committing, pushing, or opening a PR.
disable-model-invocation: true
---

# Ship check

Run the full verification gate that CLAUDE.md requires before a branch is "done." Conditional steps fire based on what changed since `main`.

## 1. Always-run gate (Node)

Run in this exact order from the project root, stopping on the first failure:

1. `npm test`
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm run format:check`
5. `npm run build`

On failure: surface the failing step's output and stop. Do NOT patch on the way — the user decides.

## 2. Detect what changed

```
git diff --name-only origin/main...HEAD
git diff --name-only         # unstaged
git diff --cached --name-only # staged
```

Union the three lists. The branches below trigger only if a matching file appears in that union.

## 3. Conditional: integration tests

Trigger if any changed file matches:

- `src/app/actions/**`
- `src/app/api/**`
- `src/lib/*-persist.ts`, `src/lib/*-store.ts`
- `src/lib/readiness.ts`, `src/lib/manual-log.ts`, `src/lib/health-pairing.ts`, `src/lib/health-signals.ts`, `src/lib/device-auth.ts`
- `src/db/**`
- `tests/*.integration.test.ts`

Then run: `npm run test:integration`

If it errors with `DATABASE_URL env var is required`, `.env.local` is missing — report it and stop, don't try to "fix" it.

## 4. Conditional: iOS

Trigger if any changed file matches `ios/**`.

From `ios/SyncFit/`:

1. `xcodegen generate`
2. Pick a simulator. Prefer `'platform=iOS Simulator,name=iPhone 17 Pro'`. If `xcrun simctl list devices available | grep -q 'iPhone 17 Pro'` is false, pick the first available iPhone from that list.
3. `xcodebuild test -project SyncFit.xcodeproj -scheme SyncFit -destination '<picked>'`

Consider delegating to the `ios-build-checker` subagent for compact output — `xcodebuild test` dumps thousands of lines.

## 5. Reporting

Output one line per step:

```
[PASS] npm test
[PASS] tsc --noEmit
[FAIL] npm run lint
[SKIP] integration (no matching files)
[SKIP] iOS (no matching files)
```

Then the failing step's actual output (or a pointer if very long). Do not include passing output beyond the one-liner.

End with a final verdict: `READY` or `BLOCKED (<step name>)`.

## Constraints

- Never use `--no-verify` or skip a step to make the run green.
- Don't run `npm install` unless dependencies are visibly missing (`node_modules/` absent).
- Don't `git commit` or `git push` from this skill — it's verification only.
