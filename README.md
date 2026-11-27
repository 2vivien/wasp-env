# Wasp — gestionnaire de secrets

Gestionnaire de secrets zero-knowledge en développement. Les valeurs et métadonnées chiffrées sont préparées côté navigateur ; le serveur stocke des blobs chiffrés et applique les contrôles d’accès. Cette version n’est pas encore prête pour une ouverture publique ni un audit de sécurité externe.

## Fonctionnalités présentes

- Connexion Google avec Better Auth, pseudo public vérifié en direct, onboarding reprenable et page de déverrouillage dédiée.
- Coquille Vercel/GitHub : sidebar, topbar, navigation mobile, palette `⌘K`/`Ctrl+K`, pages 404/erreur.
- Coffre personnel chiffré, secrets versionnés, historique/restauration, fichiers `.env` importés/exportés sans altération.
- Projets et environnements chiffrés, création, renommage et suppression logique.
- Partage de coffre, partages ciblés secret/projet, liens privés avec QR/code, groupes, journal d’activité.
- Sessions révocables, sauvegarde chiffrée, permissions atomiques, proxy de session, CSP stricte avec nonce et erreurs API normalisées.
- Migration Drizzle initiale générée et relue ; limites centralisées et journal Pino avec rédaction.

## Installation locale

Prérequis : Node.js 24, pnpm et un projet PostgreSQL/Neon configuré.

1. Cloner le dépôt.
2. Installer les dépendances avec `pnpm install --frozen-lockfile`.
3. Copier `.env.example` vers `.env.development.local` et renseigner PostgreSQL, Better Auth et Google.
4. Appliquer la migration : `pnpm db:migrate`.
5. Démarrer avec `pnpm dev`.

Commandes qualité : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Documentation

- [Spécification MVP](docs/00-LIRE-EN-PREMIER.md)
- [État fonctionnel](docs/etat-fonctionnel.md)
- [Guide utilisateur](docs/guide-utilisateur.md)
- [Modèle de menace](THREAT_MODEL.md)
- [Signalement de vulnérabilité](SECURITY.md)
- [Décisions techniques](DECISIONS.md)
- [Licence MIT](LICENSE)

## Périmètre restant

Voir `docs/etat-fonctionnel.md` et `docs/13-FEUILLE-DE-ROUTE.md`. Les points livrés récemment : e-mail Google vérifié, pseudo modifiable 1×/30 j, journal de progression de rotation, historique des versions en table immuable, tests IDOR, fuzz de non-fuite (1 000 opérations), contrôle axe des états publics, virtualisation des longues listes et rotation de projet après révocation. Restent notamment ouverts : virtualisation du textarea ENV brut, RLS, audit externe et la cible de 120 Ko de JS initial.

## Avertissement

Ne pas utiliser pour stocker des secrets de production sans revue de sécurité indépendante, sauvegarde/restauration testée et validation de la configuration Google/Neon du déploiement.
