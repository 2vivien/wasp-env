# Contribuer à Wasp

## Avant de modifier

- Lire `DECISIONS.md`, `README.md` et `THREAT_MODEL.md`.
- Ne jamais ajouter de secret, clé réelle, export `.env` ou contenu d’utilisateur au dépôt ou aux tests.
- Toute donnée sensible doit être chiffrée côté navigateur ; tout endpoint doit authentifier la session, valider son entrée et vérifier l’appartenance/permission côté serveur.
- Toute mutation doit vérifier l’origine et écrire son événement d’audit dans la même transaction.

## Vérification locale

Installer avec `pnpm install --frozen-lockfile`, puis exécuter `pnpm lint`, `pnpm typecheck` et `pnpm test` avant de soumettre un changement. Les modifications de schéma nécessitent une migration relue ; ne pas utiliser `drizzle-kit push` sur une base de production.

## Pull requests

- Décrire le comportement utilisateur, les routes touchées et les implications de sécurité.
- Ajouter tests et états d’erreur, chargement et vide pour tout nouveau parcours.
- Documenter toute décision de dépendance, format chiffré ou donnée visible côté serveur dans `DECISIONS.md`.
- Ne pas annoncer une fonction comme complète sans son UI, son endpoint autorisé, ses tests et sa documentation.
