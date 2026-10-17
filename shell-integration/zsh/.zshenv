# Loaded by zsh instances started by mywebterm (the server points ZDOTDIR here).
# Restores the user's zsh config, then adds hooks that report to the page the
# current directory (OSC 7 sequence, as in Ghostty) and the running command
# (private 6767 sequence).

# Secret chosen by the page for this shell. The command and resume sequences
# carry it: the page ignores those without it, so output from a program (a
# file shown by cat, an ssh server, logs) can't make it put a command in the
# URL, where a reload would run it. Kept in a shell variable and removed from
# the environment, so programs started from here never see it.
typeset -g _mywebterm_secret=$MYWEBTERM_SECRET
unset MYWEBTERM_SECRET

if [[ -n "${MYWEBTERM_ZDOTDIR+x}" ]]; then
  ZDOTDIR="$MYWEBTERM_ZDOTDIR"
  unset MYWEBTERM_ZDOTDIR
else
  unset ZDOTDIR
fi

[[ -f "${ZDOTDIR:-$HOME}/.zshenv" ]] && source "${ZDOTDIR:-$HOME}/.zshenv"

# At each prompt: current directory, and end of the previous command
_mywebterm_report_prompt() {
  printf '\e]7;file://%s%s\a\e]6767;prompt\a' "$HOST" "$PWD"
}
# $3: the full command, aliases expanded ($2 is empty beyond about
# 80 characters). Truncated, on a single line.
_mywebterm_report_command() {
  local command_line=${3//[[:cntrl:]]/ }
  printf '\e]6767;command;%s;%s\a' "$_mywebterm_secret" "${command_line[1,200]}"
}

autoload -Uz add-zsh-hook
add-zsh-hook precmd _mywebterm_report_prompt
add-zsh-hook preexec _mywebterm_report_command

# Startup command (?command= in the URL): put in the input line of the first
# prompt, submitted if MYWEBTERM_COMMAND_RUN. The zle hook is set at the first
# precmd, after .zshrc, which could redefine zle-line-init.
if [[ -n "$MYWEBTERM_COMMAND" ]]; then
  typeset -g _mywebterm_command=$MYWEBTERM_COMMAND _mywebterm_command_run=$MYWEBTERM_COMMAND_RUN
  unset MYWEBTERM_COMMAND MYWEBTERM_COMMAND_RUN

  _mywebterm_insert_command() {
    add-zle-hook-widget -d line-init _mywebterm_insert_command
    BUFFER=$_mywebterm_command
    CURSOR=$#BUFFER
    [[ -n $_mywebterm_command_run ]] && zle .accept-line
    unset _mywebterm_command _mywebterm_command_run
  }
  _mywebterm_hook_command() {
    add-zsh-hook -d precmd _mywebterm_hook_command
    autoload -Uz add-zle-hook-widget
    zle -N _mywebterm_insert_command
    add-zle-hook-widget line-init _mywebterm_insert_command
  }
  add-zsh-hook precmd _mywebterm_hook_command
fi

# --- AI agent sessions --------------------------------------------------------
# An agent started without an explicit session gets an ID chosen here, and the
# page puts the resume command in the URL (6767;resume sequence): reloading the
# tab reopens that conversation, not the directory's latest one.
# Limitation: a new session opened from the agent (/clear, /resume…) is not
# tracked, the URL keeps the first one.
# A function with the same name in your .zshrc replaces these.

_mywebterm_report_resume() {
  printf '\e]6767;resume;%s;%s\a' "$_mywebterm_secret" "$1"
}

_mywebterm_uuid() {
  local id
  id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null) || return 1
  print -r -- ${(L)id}
}

# Runs <program> with <start option> <new id>, and reports
# "<resume command> <id>". Adds nothing if an argument matches <options>
# (session already chosen, non-interactive mode, help…) or if the first one is
# a <subcommand>.
# Usage: _mywebterm_with_session <program> <start option> <resume command> <options> <subcommands> -- <args…>
_mywebterm_with_session() {
  local program=$1 start_option=$2 resume=$3 options=$4 subcommands=$5 arg id
  shift 6
  for arg in "$@"; do
    [[ $arg == ${~options} ]] && { command $program "$@"; return; }
  done
  if [[ $1 == ${~subcommands} ]] || ! id=$(_mywebterm_uuid); then
    command $program "$@"
    return
  fi
  _mywebterm_report_resume "$resume $id"
  command $program $start_option "$id" "$@"
}

# Claude Code: --session-id <uuid> at startup, --resume <uuid> to resume
claude() {
  _mywebterm_with_session claude --session-id 'claude --resume' \
    '(-r|--resume|--resume=*|-c|--continue|--session-id|--session-id=*|--fork-session|--from-pr|--from-pr=*|-p|--print|-h|--help|-v|--version)' \
    '(agents|attach|auth|auto-mode|doctor|gateway|import|install|logs|mcp|plugin|project|respawn|rm|setup-token|stop|ultrareview|update)' \
    -- "$@"
}

# pi: --session-id <id> opens the session, or creates it if it doesn't exist
pi() {
  _mywebterm_with_session pi --session-id 'pi --session-id' \
    '(-r|--resume|-c|--continue|--session|--session=*|--session-id|--session-id=*|--fork|--fork=*|--no-session|-p|--print|--mode|--mode=*|--export|--list-models|-h|--help|-v|--version)' \
    '(install|remove|uninstall|update|list|config|auth|mcp)' \
    -- "$@"
}
