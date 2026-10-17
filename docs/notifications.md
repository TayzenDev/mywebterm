# Notifications

When an agent is done or waiting for an answer, the tab lets you know, **if you're not looking at
it** (tab in the background, or browser window behind another application):

- a browser notification, which brings you back to the tab when clicked. You need to allow it once
  with the "🔔 Enable notifications" button in the top right corner (shown until you accept or
  decline). One notification per tab: the next one replaces the previous one;
- a "🔴" before the tab title and a dot on the favicon, even without the permission. They go away
  when you come back to the tab, and the notification closes.

The page handles terminal notification sequences: OSC 9 (iTerm2), OSC 777 (rxvt, Ghostty) and
OSC 99 (kitty). Programs that emit them work as is, and the `notify` command sends one from the
shell:

```bash
make test; notify "tests done"            # tab title + message
notify "Build" "failed at step 3"         # title + message
```

**Claude Code**: register `bin/claude-notify-hook` as a hook in `~/.claude/settings.json`. It
notifies when Claude is done (`Stop`, with the start of its answer), asks for a permission
(`Notification`), or asks a question / proposes a plan (`PreToolUse` on `AskUserQuestion` and
`ExitPlanMode`). The "waiting for your input" reminder, one minute after it's done, is ignored.
Outside mywebterm (no `MYWEBTERM` variable), the hook does nothing.

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "/path/to/mywebterm/bin/claude-notify-hook" }] }],
    "Notification": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "/path/to/mywebterm/bin/claude-notify-hook" }] }],
    "PreToolUse": [{ "matcher": "AskUserQuestion|ExitPlanMode", "hooks": [{ "type": "command", "command": "/path/to/mywebterm/bin/claude-notify-hook" }] }]
  }
}
```

Shells get `TERM_PROGRAM=mywebterm` rather than the value of the terminal that started the server:
otherwise agents would think they run in Ghostty (or another terminal) and pick their sequences
accordingly. Inside tmux, the hook's sequence only gets through with `set -g allow-passthrough on`.

## No notification?

Switch to another tab and run `sleep 5; notify test` beforehand, then check in order:

- **No "🔴" in the tab title**: the sequence doesn't reach the page. For Claude Code, check that
  the hooks are declared and that `claude` runs in a mywebterm tab (`echo $MYWEBTERM` → `1`).
- **"🔴" but nothing in the Notification Center**: the browser doesn't send it. The "🔔 Enable
  notifications" button must have been accepted for this exact address (`term.localhost` and
  `localhost:8080` are two separate permissions), and the browser must be allowed to notify in
  System Settings → Notifications (restart it after changing that).
- **In the Notification Center but no banner**: macOS keeps it quiet. A Focus mode (Do Not
  Disturb…) or screen sharing hides banners; also check the browser's alert style in System
  Settings → Notifications.

The notification is removed from the Notification Center when you come back to the tab: to test,
wait for it before coming back.
