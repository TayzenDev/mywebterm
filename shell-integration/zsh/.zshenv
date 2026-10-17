# Chargé par les zsh lancés par mywebterm (le serveur pointe ZDOTDIR ici).
# On restaure la config zsh de l'utilisateur, puis on ajoute des hooks qui
# signalent à la page le dossier courant (séquence OSC 7, comme Ghostty) et la
# commande lancée (séquence privée 6767).

if [[ -n "${MYWEBTERM_ZDOTDIR+x}" ]]; then
  ZDOTDIR="$MYWEBTERM_ZDOTDIR"
  unset MYWEBTERM_ZDOTDIR
else
  unset ZDOTDIR
fi

[[ -f "${ZDOTDIR:-$HOME}/.zshenv" ]] && source "${ZDOTDIR:-$HOME}/.zshenv"

# À chaque prompt : dossier courant, et fin de la commande précédente
_mywebterm_report_prompt() {
  printf '\e]7;file://%s%s\a\e]6767;prompt\a' "$HOST" "$PWD"
}
# $3 : la commande complète, alias développés ($2 est vide au-delà
# d'environ 80 caractères). Tronquée, sur une seule ligne.
_mywebterm_report_command() {
  local command_line=${3//[[:cntrl:]]/ }
  printf '\e]6767;command;%s\a' "${command_line[1,200]}"
}

autoload -Uz add-zsh-hook
add-zsh-hook precmd _mywebterm_report_prompt
add-zsh-hook preexec _mywebterm_report_command

# Commande de départ (?command= dans l'URL) : placée dans la ligne de saisie du
# premier prompt, validée si MYWEBTERM_COMMAND_RUN. Le hook zle est posé au
# premier precmd, après le .zshrc qui pourrait redéfinir zle-line-init.
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

# --- Sessions des agents IA --------------------------------------------------
# Un agent lancé sans session explicite reçoit un identifiant choisi ici, et la
# page met la commande de reprise dans l'URL (séquence 6767;resume) : recharger
# l'onglet rouvre cette conversation-là, pas la dernière du dossier.
# Limite : une nouvelle session ouverte depuis l'agent (/clear, /resume…) n'est
# pas suivie, l'URL garde la première.
# Une fonction du même nom dans votre .zshrc remplace celles-ci.

_mywebterm_report_resume() {
  printf '\e]6767;resume;%s\a' "$1"
}

_mywebterm_uuid() {
  local id
  id=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null) || return 1
  print -r -- ${(L)id}
}

# Lance <programme> avec <option de départ> <nouvel id>, et signale
# « <commande de reprise> <id> ». Sans rien ajouter si un argument correspond
# à <options> (session déjà choisie, mode non interactif, aide…) ou si le
# premier est une <sous-commande>.
# Usage : _mywebterm_with_session <programme> <option de départ> <commande de reprise> <options> <sous-commandes> -- <args…>
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

# Claude Code : --session-id <uuid> au démarrage, --resume <uuid> pour reprendre
claude() {
  _mywebterm_with_session claude --session-id 'claude --resume' \
    '(-r|--resume|--resume=*|-c|--continue|--session-id|--session-id=*|--fork-session|--from-pr|--from-pr=*|-p|--print|-h|--help|-v|--version)' \
    '(agents|attach|auth|auto-mode|doctor|gateway|import|install|logs|mcp|plugin|project|respawn|rm|setup-token|stop|ultrareview|update)' \
    -- "$@"
}

# pi : --session-id <id> ouvre la session, ou la crée si elle n'existe pas
pi() {
  _mywebterm_with_session pi --session-id 'pi --session-id' \
    '(-r|--resume|-c|--continue|--session|--session=*|--session-id|--session-id=*|--fork|--fork=*|--no-session|-p|--print|--mode|--mode=*|--export|--list-models|-h|--help|-v|--version)' \
    '(install|remove|uninstall|update|list|config|auth|mcp)' \
    -- "$@"
}
