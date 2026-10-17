# Setup

## Access token and address

The first start creates an access token in `~/.config/mywebterm/token` (readable by you only) and
prints the address with it. Open that address once: the page keeps the token for that address
(`127.0.0.1:8080`, `localhost:8080` and `term.localhost` each need it once) and removes it from the
URL. Without it, the page asks for it. Delete the file and restart the server to change the token.

The printed address uses `MYWEBTERM_DOMAIN` (`term.localhost` by default), without the port when
[`scripts/port80.sh`](#address-termlocalhost) relays port 80 to the server. Set it to the name you
use, so the token lands in the right address's storage. `npm start -- --open` also opens it in
the default browser, unless a page there already used the token.

## Start at login

```bash
scripts/autostart.sh install     # no sudo
scripts/autostart.sh uninstall
```

Installs a LaunchAgent: the server starts when you log in, restarts if it stops, and logs to
`~/Library/Logs/mywebterm.log`. It runs with `--open`, so at the first login the default browser
opens the address with the token; afterwards it opens nothing, until the token changes. `PORT`,
`MYWEBTERM_DOMAIN`, `MYWEBTERM_HOST` and `ALLOWED_HOSTS` set when installing are kept
(`MYWEBTERM_DOMAIN=webterm.localhost scripts/autostart.sh install`). The agent uses the `node`
found at install time: run `install` again after changing Node version (nvm…). Stop a server
started by hand first, or the agent's can't take the port.

## Address: term.localhost

`http://term.localhost:8080` works with no setup: macOS, Chrome, Firefox and Safari send every
`*.localhost` name to the machine itself (127.0.0.1 or ::1; the server listens on both). Any
`.localhost` name works (`webterm.localhost`…). Avoid `.local`, which is reserved for Bonjour/mDNS
on macOS: it would need an `/etc/hosts` entry, and name resolution can take several seconds.

To drop the `:8080`:

```bash
sudo scripts/port80.sh install        # → http://term.localhost
sudo scripts/port80.sh install 8081   # if PORT is different
sudo scripts/port80.sh uninstall
```

A non-root process can't listen on port 80 of 127.0.0.1. The script therefore installs a
LaunchDaemon: launchd (as root) listens on port 80 of 127.0.0.1 and ::1, and for each connection
starts `nc` as your user, which relays it to the terminal. Nothing is opened on the network and
the server keeps its port. (pf doesn't work here: on macOS 26, its `rdr` rules don't apply to local
connections.)

## Configuration

| Variable                             | Default     | Purpose                                                                         |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------- |
| `PORT`                               | `8080`      | HTTP port                                                                       |
| `MYWEBTERM_HOST`                     | `127.0.0.1` | Listening interface (not `HOST`: zsh uses that name for the machine's name)     |
| `SHELL`                              | `$SHELL`    | Shell to start                                                                  |
| `ALLOWED_HOSTS`                      |             | Comma-separated names accepted besides `localhost`, `*.localhost` and 127.0.0.1 |
| `MYWEBTERM_DOMAIN`                   | `term.localhost` | Name in the printed and opened address; accepted like `ALLOWED_HOSTS`      |
| `MYWEBTERM_UNSAFE_NO_TOKEN`          |             | `1`: no access token (see [Security](security.md)). Refused unless listening on the loopback   |
| `MYWEBTERM_UNSAFE_UNSIGNED_COMMANDS` |             | `1`: commands in the URL run without a signature (see [Run a command](urls.md#run-a-command))            |
