# URLs: directory and command

The URL holds the tab's state: its directory, the running program and its title. Reloading,
bookmarking or restoring a tab reopens the same thing.

## Open in a directory

The URL path is the starting directory:

| URL                                     | Directory                                  |
| --------------------------------------- | ------------------------------------------ |
| `http://127.0.0.1:8080/`                | home                                       |
| `http://127.0.0.1:8080/~/Dev/project`   | `~/Dev/project`                            |
| `http://127.0.0.1:8080/Users/me/Dev`    | `/Users/me/Dev`                            |
| `http://127.0.0.1:8080/Dev/project`     | `/Dev/project`, otherwise `~/Dev/project`  |

If the directory doesn't exist, the shell opens in your home directory with a warning.
The paths `/fonts/…`, `/ghostty-web/…` and `/config.json` are reserved.

The URL then follows the current directory on every `cd` (zsh only, not during `ssh`): reloading
the page or bookmarking it reopens the shell in the same place.

## Run a command

`?command=` (or `?c=`) types a command at the first prompt, in the URL's directory:
`http://127.0.0.1:8080/~/Dev/project?c=htop`. It stays in the history, and you get the shell back
when it exits.

It only runs automatically if the URL carries a valid `?sig=`: the page signs every `?c=` it writes
with your token (HMAC, bound to the URL's directory), so reloads, bookmarks and restored tabs run
as before. A command without a valid signature (a link from another site, Slack, an email, or a URL
typed by hand) is never typed into the shell: the page shows it and asks first. Run signs it, Ignore
drops it from the URL. The signature needs a secure context (`localhost`, `*.localhost`,
127.0.0.1): on another `ALLOWED_HOSTS` name over http, every command asks first.

`MYWEBTERM_UNSAFE_UNSIGNED_COMMANDS=1`, or running without a token, turns signatures off. A command
then runs automatically if you opened the tab yourself (address bar, bookmark, a link from the
terminal itself, but also a link opened from another app, such as Slack or Mail: `Sec-Fetch-Site`
header); when opened from another site, it is only typed: press Enter to run it, Ctrl+C to cancel.

After that, `?c=` follows the running program if it is in the `PROGRAMS` table (htop, vim,
lazygit, tmux, ssh, claude…): reloading the page or bookmarking it starts it again. The parameter
goes away when the prompt comes back. Other commands (`npm install`, `git push`…) are never put
there, so that a reload doesn't run them again, nor are `psql`/`pgcli`, whose command line often
contains a password.

`?c=` ends up in the browser history, its sync and session restore. A command line that looks like
it holds a secret (`password`, `token`, `key`, `secret`, `auth`…, a known API key format such as
`sk-…` or `ghp_…`, or `user:password@` in a URL) is only put there if you say so: a prompt in the
corner asks, without taking the focus from the program. It goes away when the command ends.

For AI agents, a reload must reopen **the same conversation**, even with several sessions in the
same directory. The zsh integration therefore wraps `claude` and `pi`: when started without an
explicit session, they get an identifier chosen up front (`--session-id <uuid>`), and the URL gets
their resume command (`?c=claude --resume <uuid>`, `?c=pi --session-id <uuid>`). Options from the
original command line (`--model`…) are not kept. Limitations: a new session started from inside
the agent (`/clear`, `/resume`…) is not tracked, and a `claude` or `pi` function in your `.zshrc`
overrides this one. codex and opencode can't be given a session identifier at startup: for them,
the URL keeps the command line as typed.

The title sent by the agent (the session name for Claude Code) is kept alongside, in `?t=`: the tab
shows it as soon as it reloads, without waiting for the agent to send it again. It goes away with
`?c=` when the prompt comes back.
