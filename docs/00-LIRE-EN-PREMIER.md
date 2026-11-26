# 00 — LIRE EN PREMIER (agent de code)

> Ce dossier `docs/` est la **seule source de vérité** du projet. Si le code et ces fichiers divergent, le code a tort. Si ces fichiers sont ambigus, **demander**, ne pas deviner.

## 1. Le produit en une phrase

Gestionnaire de secrets zero-knowledge, gratuit et open source : coffres → projets → environnements → secrets, import/export `.env`, partage sans e-mail. **Connexion uniquement via Google.** Le serveur ne lit jamais une valeur secrète.

## 2. Ordre de lecture obligatoire

| # | Fichier | Contenu |
|---|---|---|
| 01 | `01-PRODUIT-ET-PERIMETRE.md` | Fonctionnalités, MVP, hors périmètre |
| 02 | `02-ARCHITECTURE-ET-REGLES-CODE.md` | Arborescence, couches, tailles de fichiers, hooks, types |
| 03 | `03-AUTH-GOOGLE.md` | Auth Google only, session, pseudo, verrouillage du coffre |
| 04 | `04-CRYPTOGRAPHIE.md` | Clés, chiffrement, partage, révocation, récupération |
| 05 | `05-BASE-DE-DONNEES.md` | Schéma, contraintes, index, cascades |
| 06 | `06-API-BACKEND.md` | Endpoints, validation, erreurs, limites, rate limiting |
| 07 | `07-DESIGN-SYSTEM.md` | Tokens, composants, interdits visuels, protocole image |
| 08 | `08-PAGES-ACCES.md` | Landing, login, onboarding, déverrouillage |
| 09 | `09-PAGES-ESPACE.md` | Dashboard, coffres, projets (kanban) |
| 10 | `10-PAGES-SECRETS-ENV.md` | Secrets, éditeur ENV, comparateur |
| 11 | `11-PAGES-PARTAGE-ACTIVITE-REGLAGES.md` | Partage, invitations, groupes, activité, réglages |
| 12 | `12-QUALITE-LIMITES-TESTS.md` | Limites min/max, a11y, perf, tests, checklists |
| 13 | `13-FEUILLE-DE-ROUTE.md` | Phases, tâches, critères de sortie |

## 3. Règles absolues (aucune exception)

1. **Rien ne tombe.** Chaque fonctionnalité listée dans 01 existe en code, avec ses états (chargement, vide, erreur, succès, hors-ligne, non autorisé). Une fonctionnalité sans écran, sans route, sans test ou sans état d'erreur n'est pas terminée.
2. **Aucun secret en clair côté serveur**, ni en base, ni dans les logs, ni dans les erreurs, ni dans Sentry, ni dans l'URL (sauf fragment `#`).
3. **Google est la seule méthode d'authentification.** Pas de mot de passe de compte, pas de lien magique, pas d'e-mail/mot de passe. L'authentification (Google) et le déverrouillage du coffre (phrase secrète) sont **deux choses distinctes** (voir 03).
4. **Couleurs, typographie, rayons, espacements : uniquement via les tokens** de `07`. Aucune valeur en dur dans un composant. L'image de référence fournie par Vivien est reproduite **à la lettre** (couleurs incluses).
5. **TypeScript strict** : pas de `any`, pas de `@ts-ignore`, pas de `@ts-expect-error` sans commentaire justifié et ticket, pas de `as` pour contourner un type (sauf `as const`), pas de `!` non justifié.
6. **Limites de taille de fichiers/fonctions** de `02` : respectées, sans dépasser le plafond **ni** descendre sous les planchers (pas de fichiers vides ou de coquilles).
7. **Pas de logique métier dans les composants React.** Composant = affichage + câblage de hooks.
8. **Pas de texte superflu.** Chaque mot de l'interface est justifié (voir 07 §Textes).
9. **Pas de design générique** : pas de gradient décoratif, pas d'illustrations stock, pas d'emojis, pas de cartes ombrées partout, pas de petites icônes décoratives.
10. **Vérifier avant d'utiliser un module.** En cas de doute sur une bibliothèque ou une pratique : rechercher la documentation officielle à jour, choisir la meilleure option, la documenter dans `DECISIONS.md` (date, choix, raison, alternative écartée).

## 4. Définition de « terminé » pour une tâche

- [ ] Code conforme à `02` (tailles, couches, nommage).
- [ ] Types stricts, Zod aux frontières (entrées API, variables d'env, JSON.parse).
- [ ] États UI complets (voir 07 §États).
- [ ] Accessibilité clavier + lecteur d'écran vérifiée.
- [ ] Tests écrits (unitaire, intégration, et E2E si parcours).
- [ ] Aucun secret/clé/fragment dans logs ou erreurs (test automatisé).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` verts.
- [ ] Doc mise à jour si le comportement change.

## 5. Décisions déjà prises (ne pas rouvrir)

- Next.js 16 (App Router), React, TypeScript strict, Tailwind, shadcn/ui, Framer Motion (sobre), Zod.
- PostgreSQL sur Neon, Drizzle ORM, monolithe modulaire.
- Route → Controller → Service → Repository.
- Chiffrement côté client, AES-256-GCM, Argon2id, libsodium pour les enveloppes asymétriques.
- Open source, gratuit, aucune fonction de sécurité réservée à un plan payant.
