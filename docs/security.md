# Security

This server gives full shell access to the machine.

- By default it only listens on `127.0.0.1`. Don't switch to `MYWEBTERM_HOST=0.0.0.0`: the token
  would then travel in clear over the network, and a leaked token gives a shell on your machine.
- The WebSocket requires the token from `~/.config/mywebterm/token`. The checks below only stop
  browsers: any other local process (another user, a Docker container reaching the host, a
  sandboxed app) can forge the headers, but can't read the token. The page keeps it in
  `localStorage`, which is per origin and port: other servers on localhost don't see it.
- `MYWEBTERM_UNSAFE_NO_TOKEN=1` turns the token off: no address to open first, but any local
  process can then open a shell as you. The Origin, Host and frame checks still apply to browsers.
- Commands in the URL only run on their own when signed with the token (see
  [Run a command](urls.md#run-a-command)): otherwise a link from Slack or an email would run any command.
  `MYWEBTERM_UNSAFE_UNSIGNED_COMMANDS=1` turns this off; so does `MYWEBTERM_UNSAFE_NO_TOKEN=1`.
- Any program can print the sequences the page reads, so a file shown by `cat`, an ssh server or
  logs could announce a fake running command, which the page would sign into `?c=` and a reload
  would run. The zsh hooks therefore carry a secret chosen by the page for each tab, passed to the
  shell and removed from its environment so that programs never see it: command and resume
  sequences without it are ignored. Titles, notifications and the directory stay open to every
  program; they don't run anything.
- Pasted text goes through bracketed paste when the program asks for it (zsh does), with the
  markers removed from the text: a line break copied from a web page doesn't run anything on its
  own.
- The page refuses to be shown in a frame (`frame-ancestors 'none'`): otherwise a site could load
  the terminal in an invisible iframe and make you type into it.
- WebSocket connections from another origin are rejected. Without this check, any site open in the
  browser could drive the terminal.
- Every request, page and WebSocket, must also target a local name (`localhost`, `*.localhost`,
  127.0.0.1 or `ALLOWED_HOSTS`), otherwise it gets a 403: this blocks DNS rebinding, where a site
  points its own domain at 127.0.0.1 to read `/config.json` or drive the terminal.
