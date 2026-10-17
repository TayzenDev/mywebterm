# mywebterm

Mon terminal local, dans le navigateur, avec [ghostty-web](https://github.com/coder/ghostty-web).

```bash
npm install
npm start
# → http://127.0.0.1:8080
```

Chaque onglet ouvert lance son propre shell (`$SHELL -l`).

## Ouvrir dans un dossier

Le chemin de l'URL est le dossier de départ :

| URL                                     | Dossier                         |
| --------------------------------------- | ------------------------------- |
| `http://127.0.0.1:8080/`                | home                            |
| `http://127.0.0.1:8080/~/Dev/projet`    | `~/Dev/projet`                  |
| `http://127.0.0.1:8080/Users/moi/Dev`   | `/Users/moi/Dev`                |
| `http://127.0.0.1:8080/Dev/projet`      | `/Dev/projet`, sinon `~/Dev/projet` |

Si le dossier n'existe pas, le shell s'ouvre dans le home avec un avertissement.
Les chemins `/fonts/…`, `/ghostty-web/…` et `/config.json` sont réservés.

L'URL suit ensuite le dossier courant à chaque `cd` (zsh uniquement, pas pendant un `ssh`) :
recharger la page ou la mettre en favori rouvre le shell au même endroit.

## Lancer une commande

`?command=` (ou `?c=`) tape une commande au premier prompt, dans le dossier de l'URL :
`http://127.0.0.1:8080/~/Dev/projet?c=htop`. Elle reste dans l'historique, et on retrouve le
shell quand elle se termine.

Elle n'est validée d'office que si l'onglet a été ouvert par vous : barre d'adresse, favori,
ou lien depuis le terminal lui-même (en-tête `Sec-Fetch-Site`). Ouverte depuis un autre site,
elle est seulement tapée : Entrée pour la lancer, Ctrl+C pour l'annuler.

Ensuite, `?c=` suit le programme en cours, s'il fait partie de la table `PROGRAMS` (htop, vim,
lazygit, tmux, ssh, claude…) : recharger la page ou la mettre en favori le relance. Le paramètre
disparaît au retour du prompt. Les autres commandes (`npm install`, `git push`…) n'y sont jamais
mises, pour qu'un rechargement ne les relance pas, ni `psql`/`pgcli`, dont la ligne contient
souvent un mot de passe.

Pour les agents IA, recharger doit rouvrir **la même conversation**, même avec plusieurs sessions
dans le même dossier. L'intégration zsh enveloppe donc `claude` et `pi` : lancés sans session
explicite, ils reçoivent un identifiant choisi d'avance (`--session-id <uuid>`), et l'URL prend leur
commande de reprise (`?c=claude --resume <uuid>`, `?c=pi --session-id <uuid>`). Les options de la
ligne d'origine (`--model`…) ne sont pas gardées. Limites : une nouvelle session ouverte depuis
l'agent (`/clear`, `/resume`…) n'est pas suivie, et une fonction `claude` ou `pi` de votre `.zshrc`
remplace celle-ci. codex et opencode ne permettent pas de choisir l'identifiant au démarrage :
pour eux, l'URL garde la ligne tapée.

Le titre envoyé par l'agent (le nom de la session pour Claude Code) est gardé à côté, dans `?t=` :
l'onglet le reprend dès le rechargement, sans attendre que l'agent le renvoie. Il disparaît avec
`?c=` au retour du prompt.

## Titre de l'onglet

Par ordre de priorité :

1. **Nom choisi à la main**, gardé dans l'URL (`?title=API`) : il survit au rechargement et aux favoris.
   - clic sur le badge en haut à droite, ou `Ctrl+Shift+R` ;
   - ou la commande `title API` dans le terminal (`title` sans argument → titre automatique).
   Un nom vide revient au titre automatique.
2. **Programme en cours** (table `PROGRAMS` dans `public/index.html`), jusqu’au retour du
   prompt, devant les titres que le programme envoie lui-même :
   - tmux, herdr, vim, lazygit, htop, psql, man… : le nom du programme ;
   - `ssh` : `ssh <machine>` (ex. `ssh -p 22 moi@prod-1` → `ssh prod-1`) ;
   - agents IA (claude, opencode, codex, aider, gemini) : le titre qu'ils envoient — Claude Code et
     opencode y mettent le nom de la session, sans le symbole d'état placé devant (« ✳ », spinner…)
     puisque le favicon en tient lieu — sinon leur nom.
3. **Titre automatique** : le nom du dossier courant, mis à jour à chaque `cd` (zsh uniquement),
   ou un titre envoyé par un programme (séquences OSC 0/2) — le plus récent l'emporte.

Pour suivre le dossier et les commandes, le serveur lance zsh avec
`ZDOTDIR=shell-integration/zsh` : ce `.zshenv` restaure votre `ZDOTDIR`, charge votre config
habituelle puis ajoute deux hooks. `precmd` envoie le dossier courant (séquence OSC 7) et signale le
retour au prompt, `preexec` envoie la commande lancée. Rien à modifier dans votre `.zshrc`.

## Favicon

Par défaut, une invite de commande aux couleurs du thème. Pendant qu'un programme de la table
`PROGRAMS` tourne, son icône : logo [simple-icons](https://simpleicons.org) (CC0) sur la couleur de
la marque, servi par `/icons/<slug>.svg`, ou un emoji pour ceux qui n'ont pas de logo.

## Notifications

Quand un agent a fini ou attend une réponse, l'onglet prévient, **s'il n'est pas sous vos yeux**
(onglet en arrière-plan, ou fenêtre du navigateur derrière une autre application) :

- une notification du navigateur, qui ramène à l'onglet au clic. Il faut l'autoriser une fois avec
  le bouton « 🔔 Activer les notifications » en haut à droite (affiché tant qu'on n'a ni accepté ni
  refusé). Une seule notification par onglet : la suivante remplace la précédente ;
- un « ● » devant le titre de l'onglet et une pastille sur le favicon, même sans la permission. Ils
  disparaissent au retour sur l'onglet, et la notification se ferme.

La page réagit aux séquences de notification des terminaux : OSC 9 (iTerm2), OSC 777 (rxvt,
Ghostty) et OSC 99 (kitty). Les programmes qui en émettent marchent donc tels quels, et la commande
`notify` en envoie une depuis le shell :

```bash
make test; notify "tests finis"        # titre de l'onglet + message
notify "Build" "échec à l'étape 3"     # titre + message
```

**Claude Code** : `bin/claude-notify-hook` se déclare comme hook dans `~/.claude/settings.json`.
Il notifie quand Claude a fini (`Stop`, avec le début de sa réponse), demande une autorisation
(`Notification`) ou pose une question / propose un plan (`PreToolUse` sur `AskUserQuestion` et
`ExitPlanMode`). Le rappel « waiting for your input », une minute après la fin, est ignoré. Hors de
mywebterm (variable `MYWEBTERM` absente), le hook ne fait rien.

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "/chemin/vers/mywebterm/bin/claude-notify-hook" }] }],
    "Notification": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "/chemin/vers/mywebterm/bin/claude-notify-hook" }] }],
    "PreToolUse": [{ "matcher": "AskUserQuestion|ExitPlanMode", "hooks": [{ "type": "command", "command": "/chemin/vers/mywebterm/bin/claude-notify-hook" }] }]
  }
}
```

Les shells lancés reçoivent `TERM_PROGRAM=mywebterm`, plutôt que celui du terminal qui a lancé le
serveur : sinon les agents se croiraient dans Ghostty (ou autre) et choisiraient leurs séquences en
conséquence. Dans tmux, la séquence du hook ne passe que si `set -g allow-passthrough on`.

## Souris

Quand un programme active la souris (vim `set mouse=a`, htop, tmux `mouse on`…), clics gauche/
milieu/droit, glisser, mouvements et molette lui sont transmis (formats SGR 1006 et X10, modes
9/1000/1002/1003), avec Shift/Alt/Ctrl. Sinon, comportement habituel : sélection au glisser,
molette sur l'historique, menu au clic droit. **Shift** maintenu force la sélection de texte même
quand le programme capture la souris.

## Coller une image

ghostty-web ne colle que du texte, et il avale Ctrl+V. Deux façons de passer une capture d'écran
à Claude Code (ou à un autre agent) :

- **Cmd+V** : si le presse-papier ne contient qu'une image, la page l'envoie au serveur, qui
  l'enregistre dans le dossier temporaire (`$TMPDIR/mywebterm-paste-<date>.png`) et colle son
  chemin. Claude Code reconnaît un chemin d'image collé et l'attache.
- **Ctrl+V** (macOS) : transmis au programme, comme dans Ghostty. Claude Code lit alors lui-même
  le presse-papier du Mac.

Les deux supposent que le programme tourne sur ce Mac : à travers `ssh`, le chemin désigne un
fichier absent de la machine distante, et Ctrl+V y lit un autre presse-papier.

## Thème

Les couleurs viennent de votre config Ghostty (`~/.config/ghostty/config`) : le `theme` choisi
(cherché dans `~/.config/ghostty/themes` puis dans Ghostty.app), surchargé par les `palette`,
`background`, `foreground`… écrits directement dans la config. `theme = light:X,dark:Y` suit le mode
du système. Sont aussi repris `font-size` (13 par défaut, comme Ghostty sur macOS), `font-thicken`
et `window-padding-x/y`.

La police suit `font-family` (plusieurs lignes = polices de secours). Le serveur cherche les
fichiers `.ttf`/`.otf` de cette famille dans les dossiers de polices du système (`~/Library/Fonts`,
`/Library/Fonts`…) et les sert à la page sous `/fonts/<id>` : Safari n'a pas accès aux polices
installées par l'utilisateur. Une police introuvable sous forme de fichier (ex. Menlo, en `.ttc`)
est demandée au navigateur par son nom. Sans `font-family`, c'est Menlo.

La config est relue à chaque chargement de page : après un changement dans Ghostty, rechargez.

## Adresse : term.localhost

`http://term.localhost:8080` marche sans rien configurer : macOS, Chrome, Firefox et Safari
envoient tout `*.localhost` vers la machine elle-même (127.0.0.1 ou ::1, le serveur écoute sur
les deux). N'importe quel nom en `.localhost` convient
(`webterm.localhost`…). Évitez `.local`, réservé à Bonjour/mDNS sur macOS : il faudrait
une entrée dans `/etc/hosts`, et la résolution peut traîner plusieurs secondes.

Pour enlever le `:8080` :

```bash
sudo scripts/port80.sh install        # → http://term.localhost
sudo scripts/port80.sh install 8081   # si PORT est différent
sudo scripts/port80.sh uninstall
```

Un processus non root ne peut pas écouter sur le port 80 de 127.0.0.1. Le script installe donc un
LaunchDaemon : launchd (root) écoute sur le port 80 de 127.0.0.1 et ::1, et pour chaque connexion
lance `nc` sous votre compte, qui la relaie au terminal. Rien n'est ouvert sur le réseau et le
serveur garde son port. (pf ne convient pas : sur macOS 26, ses règles `rdr` ne s'appliquent pas
aux connexions locales.)

## Extension : grouper les onglets du terminal

`extension/` range automatiquement chaque onglet du terminal dans un groupe d'onglets
« Terminal » (un par fenêtre), y compris un terminal rouvert (`Cmd+Shift+T`) ou restauré au
démarrage. Le même dossier sert pour les deux navigateurs. Pour Zen, utilisez plutôt le mod
ci-dessous : n'installez pas l'extension dans Zen, elle y créerait des groupes d'onglets.

- **Chrome** : `chrome://extensions` → mode développeur → *Charger l'extension non empaquetée* →
  dossier `extension/`.
- **Firefox** (139 ou plus) : `about:debugging#/runtime/this-firefox` → *Charger un module
  complémentaire temporaire* → `extension/manifest.json`. Il disparaît à la fermeture de Firefox ;
  pour une installation durable, signez-le en non listé sur addons.mozilla.org
  (`npx web-ext sign --channel=unlisted --source-dir extension --api-key … --api-secret …`) puis
  installez le `.xpi` obtenu.

**Raccourci** : `Alt+Shift+T` (Option+Shift+T sur Mac) ouvre un terminal. Depuis un onglet du
terminal, le nouveau s'ouvre dans le même dossier ; sinon sur `http://term.localhost/` (réglable).
Pour changer la touche : bouton *Modifier* dans les options, ou `about:addons` → engrenage →
*Gérer les raccourcis* (Firefox), `chrome://extensions/shortcuts` (Chrome).

Les options de l'extension règlent les adresses reconnues (par défaut `127.0.0.1:8080`,
`localhost:8080`, `term.localhost:8080` et `term.localhost`), le nom et la couleur du groupe.
Un onglet sorti du groupe à la main y reste ; un onglet qui quitte le terminal pour un autre
site sort du groupe (désactivable).

## Mod Zen : un dossier « Terminal » par espace

`zen-mod/` est un mod pour [Zen](https://zen-browser.app), chargé par le gestionnaire de mods
[Sine](https://github.com/CosmoCreeper/Sine). Il range chaque onglet du terminal dans le dossier
« Terminal » **de son espace**, y compris le premier terminal d'un dossier vide, et ouvre un
terminal au clavier. Contrairement à une extension, un mod a accès aux espaces et aux dossiers de
Zen.

**Installation**
1. Installez Sine avec son installeur pour macOS (voir la page des releases de Sine), puis
   redémarrez Zen. Sine ajoute deux fichiers dans `Zen.app/Contents/Resources` (`config.js`,
   `defaults/pref/config-prefs.js`) et son moteur dans le profil.
2. Réglages de Zen → *Sine Mods* → paramètres de Sine : cochez *Enable installing JS from
   unofficial sources* (préférence `sine.allow-unsafe-js`), le mod n'étant pas dans le catalogue.
   Un mod JS a tous les droits du navigateur : n'installez par ce biais que des mods dont vous
   lisez le code.
3. Toujours dans *Sine Mods*, installez le mod depuis GitHub en donnant l'adresse du dossier
   `zen-mod` du dépôt (`https://github.com/TayzenDev/mywebterm/tree/main/zen-mod`).
4. Créez un dossier « Terminal » dans chaque espace où vous voulez ranger les terminaux, ou cochez
   *Créer le dossier* dans les réglages du mod.

**Réglages** (*Sine Mods* → mywebterm, ou `about:config`, préfixe `mywebterm.`) : nom du dossier,
création automatique du dossier, sortie du dossier quand l'onglet quitte le terminal, adresses du
terminal, raccourci (`Alt+Shift+T` par défaut, Option+Shift+T sur Mac), adresse ouverte et reprise du
dossier courant. Un onglet sorti du dossier à la main n'y est pas remis. Zen épingle les onglets
d'un dossier, et par défaut `Cmd+W` décharge un onglet épinglé au lieu de le fermer : pour fermer
vraiment un terminal, passez `zen.pinned-tab-manager.close-shortcut-behavior` à `close`.

**Publier une mise à jour** : modifiez `zen-mod/`, augmentez `version` et mettez la date et l'heure
actuelles dans `updatedAt` de `theme.json`, puis poussez sur GitHub. Sine ne met à jour un mod que
si `updatedAt` est plus récent que celui de la version installée ; il vérifie au démarrage de Zen
(si la mise à jour automatique du mod est active dans *Sine Mods*) ou à la demande.

**Mises à jour de Zen** : celles que Zen installe lui-même conservent les fichiers de Sine (le
programme de mise à jour ne supprime que les fichiers de sa liste et ne vide pas
`defaults/pref/`). Une réinstallation complète de Zen (nouveau `.dmg`, Homebrew) les efface : il
faut alors relancer l'installeur de Sine ; les mods, dans le profil, sont conservés. Pour retirer
Sine de l'application, supprimez ces deux fichiers.

## Fonctionnement

```
navigateur (ghostty-web)  ⇄  WebSocket /pty  ⇄  server.js (node-pty)  ⇄  zsh
```

- `public/index.html` : le terminal ghostty-web, qui envoie les frappes clavier et les redimensionnements.
- `server.js` : sert la page et la lib, et branche chaque WebSocket sur un vrai pseudo-terminal.
- `ghostty-config.js` : lit la config et le thème Ghostty, servis sur `/config.json`.
- `fonts.js` : trouve les fichiers d'une famille de polices installée.
- `bin/title`, `bin/notify` : commandes ajoutées au `PATH` des shells lancés, qui renomment
  l'onglet et envoient une notification.
- `bin/claude-notify-hook` : hook Claude Code qui notifie l'onglet (voir Notifications).
- `shell-integration/zsh/.zshenv` : signale le dossier courant à la page.

## Configuration

| Variable | Défaut      | Rôle                    |
| -------- | ----------- | ----------------------- |
| `PORT`   | `8080`      | Port HTTP               |
| `HOST`   | `127.0.0.1` | Interface d'écoute      |
| `SHELL`  | `$SHELL`    | Shell à lancer          |
| `ALLOWED_HOSTS` | | Noms acceptés en plus de `localhost`, `*.localhost` et 127.0.0.1, séparés par des virgules |

## Sécurité

Ce serveur donne un accès shell complet à la machine.

- Il écoute uniquement sur `127.0.0.1` par défaut. Ne le passez pas en `HOST=0.0.0.0` sans ajouter
  d'authentification : toute personne de votre réseau aurait alors un shell sur votre machine.
- Les connexions WebSocket venant d'une autre origine sont refusées. Sans ce contrôle, n'importe quel
  site ouvert dans le navigateur pourrait piloter le terminal.
- Elles doivent aussi viser un nom local (`localhost`, `*.localhost`, 127.0.0.1 ou `ALLOWED_HOSTS`) :
  ça bloque le « DNS rebinding », où un site fait pointer son domaine vers 127.0.0.1.
