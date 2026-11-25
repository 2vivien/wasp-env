# Wasp — gestionnaire de secrets

Gestionnaire de secrets zero-knowledge en développement. Les valeurs et métadonnées chiffrées sont préparées côté navigateur ; le serveur stocke des blobs chiffrés et applique les contrôles d’accès. Cette version n’est pas encore prête pour une ouverture publique ni un audit de sécurité externe.

## Fonctionnalités présentes

- Connexion Google avec Better Auth, pseudo public et configuration de clés d’identité.
- Coffre personnel chiffré, création/lecture/modification/suppression de secrets et import/export de fichiers `.env`.
- Projets et environnements chiffrés, création, renommage et suppression logique.
- Partage d’un coffre avec un pseudo, lecture ou lecture-écriture, acceptation et révocation.
- Liste/révocation des sessions et journal d’activité.
- Limites validées aux frontières API, réponses `no-store`, contrôle d’origine des mutations et données utilisateur filtrées par session.

## Installation locale

Prérequis : Node.js 24, pnpm et un projet PostgreSQL/Neon configuré.

1. Cloner le dépôt.
2. Installer les dépendances avec `pnpm install --frozen-lockfile`.
3. Créer `.env.development.local` à partir de `.env.example` et renseigner les variables OAuth, Better Auth et PostgreSQL.
4. Appliquer le schéma/migrations de base de données correspondant à cette révision.
5. Démarrer avec `pnpm dev`.

Commandes qualité : `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Documentation

- [Guide utilisateur](docs/guide-utilisateur.md)
- [Modèle de menace](THREAT_MODEL.md)
- [Signalement de vulnérabilité](SECURITY.md)
- [Décisions techniques](DECISIONS.md)

## Périmètre restant

La spécification MVP complète prévoit aussi les coffres multiples, recherche locale globale, partage partiel (projet/secret), liens privés et QR, groupes, comparaison ENV sans valeurs, restauration d’historique, rotation de clés, corbeille, réglages avancés, suppression de compte, sauvegarde chiffrée, tests d’intégration/E2E et audit externe. Ces parcours ne sont pas implémentés dans cette révision ; voir la feuille de route initiale avant toute annonce de disponibilité.

## Avertissement

Ne pas utiliser pour stocker des secrets de production sans revue de sécurité indépendante, sauvegarde/restauration testée et validation de la configuration Google/Neon du déploiement.
