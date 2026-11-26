# 13 — Feuille de route

Chaque phase a : **tâches**, **livrables**, **critère de sortie**. On ne passe pas à la phase suivante tant que le critère n'est pas vert. Les dépendances de sécurité dictent l'ordre.

## Phase 0 — Conception (avant tout code)
- Recevoir l'**image de référence**, remplir `07 §3`, écrire `tokens.css`, valider la comparaison visuelle.
- `THREAT_MODEL.md`, `DECISIONS.md` initial (choix Better Auth vs Auth.js, format des blobs, métadonnées chiffrées, liens = secrets seulement ?).
- Maquettes fidèles des écrans P1–P22 (ou composants isolés dans Storybook) **dans le style de l'image**.
**Sortie** : tokens verrouillés, décisions ouvertes tranchées, maquettes validées par Vivien.

## Phase 1 — Fondations
1. Dépôt, pnpm, Next.js 16, TypeScript strict, ESLint (plafonds de taille, no-cycle, no-couleurs-en-dur), Prettier, Vitest, Playwright, Husky, gitleaks, CI.
2. `lib/env`, `lib/errors`, `lib/logger` (avec rédaction), `lib/limits`.
3. Neon + Drizzle : schéma d'auth, `profiles`, `user_key_material`, `vaults`, `vault_members`, `vault_key_envelopes`, `audit_logs`. Migrations relues.
4. Better Auth + Google seul (03). `proxy.ts`, `requireSession`.
5. Package `crypto/` complet et testé (04) **avant** tout module métier.
6. Layout, sidebar, thème, tokens, composants UI de base (07 §4 sans le kanban).
7. Pages P1–P5 (landing, login, onboarding, unlock, lien privé en coquille), verrouillage automatique, multi-onglets.
**Sortie** : un utilisateur se connecte avec Google, crée pseudo + phrase + clé de récupération, verrouille/déverrouille, récupère avec la clé ; tests crypto et auth verts ; base de test sans aucun clair.

## Phase 2 — Coffres et secrets
Modules `vaults`, `secrets`, `activity` ; P6, P7, P8 (sans membres), P12, P13 ; création/édition/versions/restauration ; catégories et champs ; favoris ; corbeille/archivage ; recherche locale P11 ; générateur de mots de passe ; verrouillage optimiste.
**Sortie** : CRUD complet de secrets chiffrés avec historique ; recherche locale ; audit propre.

## Phase 3 — Projets, environnements, ENV
Modules `projects`, `environments`, `env-files` ; P9, P10 (kanban + vue liste + comparer), P14 ; parseur dotenv sans perte + corpus de round-trip ; import multi-fichiers ; export ; versions ENV ; déplacement/copie entre environnements ; DnD accessible.
**Sortie** : import → édition → export identique octet pour octet ; comparateur sans valeurs ; kanban utilisable au clavier.

## Phase 4 — Collaboration
Modules `sharing`, `invitations`, `groups` ; profils publics, recherche de pseudo, empreintes de clé ; P8 membres, P15 (par pseudo), P16, P17 (personnes), P18, P19 ; `share_scopes` pour projet/secret ; permissions atomiques + rôles + exceptions ; tests IDOR exhaustifs.
**Sortie** : partager secret / projet / coffre avec un second compte test, périmètre strictement respecté.

## Phase 5 — Partage avancé et sécurité
Liens privés + QR (P15, P17 liens, P5 complet) ; expiration, usages, code, révocation ; **rotation de clés** par lots reprenable ; alertes de changement de clé ; sessions (P21) ; export/import chiffré ; page Activité complète P20.
**Sortie** : révocation + rotation validées par tests ; ancien membre incapable de lire les nouvelles versions.

## Phase 6 — Finitions et robustesse
Tous les états (hors ligne, erreurs partielles, non autorisé) ; accessibilité complète (axe + clavier) ; budgets de performance ; mobile (barre inférieure, listes) ; i18n prête ; pages système P22 ; documentation utilisateur.
**Sortie** : checklist `12 §6` verte sauf audit externe.

## Phase 7 — Mise en production
Audit de sécurité externe, correctifs, scan de dépendances, sauvegardes Neon vérifiées (restauration testée), supervision (Sentry sans secrets, OpenTelemetry), politique de divulgation (`SECURITY.md`), déploiement (Docker/hébergement choisi), publication open source.
**Sortie** : audit sans point critique ou élevé ouvert ; plan de réponse aux incidents écrit.

## Hors MVP (backlog)
Synchronisation GitHub (écriture seule ; client/CLI local pour préserver le zero-knowledge ; mode serveur = mode distinct documenté), CLI, extensions IDE, mode « utilisation sans révélation », passkey (PRF) pour le déverrouillage, application mobile, SSO d'entreprise, intégrations de rotation automatique de clés fournisseurs.

## Questions ouvertes à trancher avec Vivien (avant la phase 0)

1. **Image de référence** : à fournir (clair seul ou clair + sombre ?).
2. **Nom du produit** et domaine (alphasec, passary, Secure Vault ?).
3. **Licence** open source (AGPL-3.0 protège contre la reprise en SaaS fermé ; MIT est plus permissif).
4. **Liens privés** : limités aux secrets (et petits lots), ou aussi projets/coffres ? (recommandé : secrets seulement).
5. **Catégorie du secret en clair côté serveur** : acceptable, ou tout chiffrer (au prix d'un tri 100 % local) ?
6. **Choix final de la lib d'auth** : Better Auth (recommandé : NextAuth/Auth.js v5 est en bêta et en maintenance) ou Auth.js v5 malgré tout.
7. **Hébergement** (Vercel + Neon ou autre) et service de rate limiting (Upstash/Redis ou table Postgres).
