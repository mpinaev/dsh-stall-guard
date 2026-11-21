# dsh-stall-guard

**English** · [Русский](README.md) · [简体中文](README.zh.md)

A DeepSeek Harness plugin that rejects agent tool calls where the agent sets its
own deadline or waits idly. One check on the tool pipeline, no core patches and
no prompt edits.

## Why

Agents like to wrap commands in `timeout 25` and wait in `sleep 1` loops. The
first tears an operation apart in the middle: a docker stop is abandoned
halfway, the next step works with a half-done state, and the exit code is lost.
The second burns time instead of checking the result. Instructions alone do not
always cure it — a refusal in the step itself, with a reason and a replacement
action, does.

## What it blocks

| Tool | Condition | Why it is refused |
|---|---|---|
| `bash`, `pwsh` | `timeout N cmd` | A short deadline tears the operation apart and loses the exit code. |
| `bash`, `pwsh` | `sleep N` | Waiting in a loop instead of checking the result. |
| `job_output` | `wait: true` with `timeout_ms` above 15000 | A blocking wait is the same ten minutes, split into pieces. DSH reports a background job's completion by itself. |
| `wait_agent` | `timeout_ms` above 15000 | The completion notice arrives in a later turn; waiting adds nothing. |

Lowercase `timeout` is deliberate: ssh's `ConnectTimeout=5` and systemd's
`TimeoutStopSec=` pass through, because the letter differs and there is no space
before the number.

## Installation

The plugin is local and not published to npm. Add a row to the profile patch
(`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: stall-guard
      name: /home/dragon/Projects/dsh-stall-guard/index.js
```

Restarting `dsh web` picks the row up. Without a restart, the live instance is
reloaded through `dsh_hot_reload` with `entryId: stall-guard`.

## Checking

Inspect a command without booting the host:

```sh
node -e "import('./index.js').then(m => console.log(m.inspectCommand('docker ps -a')))"
```

Live: ask the agent to run a command with its own deadline wrapper — a refusal
with the reason and the replacement action should come back.

## Boundaries

- Quoted text is not parsed: `grep "timeout 5"` is refused although it is just a
  search. The cost of the mistake is one rewritten call.
- The plugin does not touch the `timeoutMs` argument the model passes to `bash`.
  That ceiling lives in the profile patch (`bash-sandbox.maxTimeoutMs`).
- `promoteOnTimeout` lives inside agent presets, which the profile patch cannot
  reach: a command that hits the ceiling may continue as a background job.

How it works — see [docs/DETAIL.md](docs/DETAIL.md).

## License

MIT, see [LICENSE](LICENSE).
