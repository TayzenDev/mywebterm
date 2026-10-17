# Tab title and favicon

## Title

In order of priority:

1. **A name you chose**, kept in the URL (`?title=API`): it survives reloads and bookmarks.
   - click the badge in the top right corner, or press `Ctrl+Shift+R`;
   - or run `title API` in the terminal (`title` with no argument → automatic title).
   An empty name goes back to the automatic title.
2. **The running program** (`PROGRAMS` table in `public/index.html`), until the prompt comes back,
   taking precedence over titles the program sends itself:
   - tmux, herdr, vim, lazygit, htop, psql, man…: the program name;
   - `ssh`: `ssh <host>` (e.g. `ssh -p 22 me@prod-1` → `ssh prod-1`);
   - AI agents (claude, opencode, codex, aider, gemini): the title they send. Claude Code and
     opencode put the session name there; the status symbol in front of it ("✳", spinner…) is
     removed since the favicon already shows it. Otherwise, their name.
3. **Automatic title**: the name of the current directory, updated on every `cd` (zsh only), or a
   title sent by a program (OSC 0/2 sequences). The most recent one wins.

To track the directory and commands, the server starts zsh with `ZDOTDIR=shell-integration/zsh`:
this `.zshenv` restores your `ZDOTDIR`, loads your usual config, then adds two hooks. `precmd` sends
the current directory (OSC 7 sequence) and reports that the prompt is back; `preexec` sends the
command being run. Nothing to change in your `.zshrc`.

## Favicon

By default, a command prompt in the theme's colors. While a program from the `PROGRAMS` table is
running, its icon: a [simple-icons](https://simpleicons.org) logo (CC0) on the brand color, served
from `/icons/<slug>.svg`, or an emoji for those without a logo.
