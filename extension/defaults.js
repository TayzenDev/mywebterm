// Réglages par défaut, partagés par le script de fond et la page d'options.
const api = globalThis.browser ?? globalThis.chrome;

const DEFAULTS = {
  // host[:port] tel qu'il apparaît dans l'URL ; « *.exemple » accepte les sous-domaines
  hosts: ['127.0.0.1:8080', 'localhost:8080', 'term.localhost:8080', 'term.localhost'],
  title: 'Terminal',
  color: 'grey',
  // Sortir du groupe un onglet qui quitte le terminal pour un autre site
  ungroupOnLeave: true,
  // Adresse ouverte par le raccourci clavier
  openUrl: 'http://term.localhost/',
  // Depuis un terminal, le raccourci ouvre le nouveau dans le même dossier
  inheritCwd: true,
};
