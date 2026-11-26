# 12 — Qualité, limites, performance, tests, checklists

## 1. Règles « à ne pas dépasser / à ne pas être en dessous »

| Sujet | Minimum | Maximum |
|---|---|---|
| Fichier composant / hook / service… | planchers de `02` §4 | plafonds de `02` §4 |
| Couverture de tests (lignes) | 80 % global, **95 %** sur `crypto/`, `permissions/`, parseur ENV | — |
| Phrase secrète | 12 car., score ≥ 3 | 256 car. |
| Argon2id | 19 MiB / t=2 / p=1 | défaut 64 MiB / t=3 ; temps de dérivation visé 0,5–1,5 s sur appareil moyen |
| Contraste texte | 4,5:1 | — |
| Cible tactile | 44 px mobile, 36 px desktop | — |
| LCP pages publiques | — | ≤ 2,5 s (4G) |
| INP | — | ≤ 200 ms |
| CLS | — | ≤ 0,1 |
| JS initial `/login` et `/` | — | ≤ 120 Ko gzip |
| JS d'une route de l'app | — | ≤ 250 Ko gzip (hors WASM libsodium chargé à la demande) |
| Temps de recherche locale (5 000 objets) | — | ≤ 50 ms |
| Déchiffrement d'une liste de 500 noms | — | ≤ 300 ms (Web Worker) |
| Liste rendue sans virtualisation | — | 100 lignes |
| Requêtes API par écran au chargement | — | 4 (regrouper sinon) |
| Dépendances directes de production | — | justifier chaque ajout ; viser ≤ 45 |
| Complexité cyclomatique d'une fonction | — | 10 |

## 2. Performance

- Server Components pour le shell et les données chiffrées ; îlots clients minimaux.
- Libsodium (WASM) et Argon2 : **chargés à la demande** (import dynamique) à l'étape de déverrouillage/onboarding, pas sur la landing.
- Déchiffrement en lot et indexation dans un **Web Worker** ; communication par transferables.
- TanStack Query : `staleTime` 30 s pour listes, invalidation ciblée après mutation ; **cache vidé au verrouillage**.
- Pas de waterfall : requêtes parallèles ; `prefetch` des routes principales de la sidebar au survol.
- Images : `next/image`, formats modernes ; polices `next/font` avec `display: swap`.
- Budget vérifié en CI (Lighthouse CI + analyse de bundle) : échec si dépassement.

## 3. Sécurité — checklist de revue (chaque PR touchant à ces zones)

- [ ] Aucune valeur secrète, clé, phrase, fragment dans : logs, erreurs, toasts, analytics, URL, stockage navigateur, props de debug, snapshots de tests.
- [ ] Toute route lit la session et vérifie la **permission** dans le service.
- [ ] Réponse `404` quand l'existence ne doit pas fuiter.
- [ ] Entrées validées par Zod ; sorties filtrées (aucun e-mail d'autrui).
- [ ] `Cache-Control: no-store` sur routes sensibles.
- [ ] CSRF/Origin vérifiés sur mutations.
- [ ] Rate limits en place.
- [ ] Nonce/AAD corrects, nonce jamais réutilisé.
- [ ] Pas de `dangerouslySetInnerHTML`, pas de `eval`, pas de script tiers.
- [ ] Rendu Markdown des notes sans HTML brut.
- [ ] Redirections (`next`, `callbackURL`) limitées aux chemins internes.
- [ ] CSP respectée, aucune dérogation `unsafe-inline` pour les scripts.
- [ ] Dépendance nouvelle : audit, licence compatible open source, maintenance active.

## 4. Pyramide de tests

**Unitaires (Vitest)** : crypto (vecteurs + altérations), parseur ENV (round-trip ≥ 40 fichiers), permissions (matrice rôle × action × ressource, y compris exceptions), validateurs, générateur de mots de passe, formatage de dates, machines d'état (onboarding, verrouillage, rotation).
**Intégration (Vitest + Postgres éphémère)** : chaque endpoint (cf. 06 §8), contraintes d'isolation (05 §3), transactions (rollback complet en cas d'échec), audit en même transaction, rate limits.
**Composants (Testing Library)** : états de chaque composant clé (SecretValue, DataTable, ConfirmDestructive, PermissionMatrix, KanbanBoard au clavier).
**E2E (Playwright, 3 navigateurs)** : voir §5.
**Sécurité** : fuzz des logs, test « serveur curieux », tests d'autorisation (IDOR) sur tous les `:id`, scan `gitleaks`, `pnpm audit`, ZAP baseline en CI nocturne.
**Accessibilité** : `axe` sur chaque page dans chaque état ; parcours clavier E2E.
**Visuel** : captures de référence des pages clés (clair/sombre, desktop/mobile) comparées à l'image de référence validée.

## 5. Parcours E2E obligatoires

1. Login Google (mock) → onboarding complet → dashboard.
2. Reprise de l'onboarding après fermeture à l'étape 2.
3. Déverrouillage OK / échec / blocage / récupération.
4. Verrouillage inactivité + multi-onglets.
5. Créer coffre → projet → 3 environnements → importer `.env` → éditer → exporter → **comparer octet pour octet**.
6. Kanban : glisser copier/déplacer ; équivalent clavier.
7. Comparateur Dev/Prod sans valeur visible.
8. Créer, réviser, restaurer une version de secret.
9. Partager un secret par pseudo ; destinataire accepte ; accès limité à ce secret.
10. Partager un projet ; vérifier qu'il ne voit pas le reste du coffre.
11. Lien privé : usage unique, expiration, révocation, code erroné ×5.
12. QR code : scan simulé → même résultat que le lien.
13. Révocation d'un membre → rotation → l'ancien ne déchiffre plus les nouvelles versions.
14. Utilisateur non autorisé (IDOR) → 404 sur tous les objets d'autrui.
15. Changement de phrase, régénération de la clé de récupération.
16. Export chiffré → import sur un autre compte test.
17. Suppression de compte.
18. Navigateur sans WebCrypto → écran d'incompatibilité.

## 6. Critères d'acceptation de la v1.0 (reprise du cahier des charges)

1. Connexion Google uniquement, aucune autre méthode accessible.
2. Pseudo choisi, e-mail jamais exposé aux autres.
3. Déverrouillage sur un nouvel appareil (nouvelle session Google + phrase secrète).
4. Récupération avec la clé prévue.
5. Secrets chiffrés côté client (vérifié en inspectant la base de test).
6. Plusieurs coffres ; projets et environnements.
7. Import/export ENV **sans altération** ; comparaison sans valeurs.
8. Partage d'un secret, d'un projet, d'un coffre ; groupes ; invitation sans e-mail.
9. Liens privés + QR ; expiration, limite d'usages, code, révocation.
10. Révocation + rotation effectives.
11. Permissions vérifiées côté serveur (tests IDOR verts).
12. Journaux sans secret (fuzz vert).
13. Audit de sécurité externe réalisé avant ouverture publique.
14. Design conforme à l'image de référence (revue visuelle signée par Vivien).
15. Tous les états de page (chargement, vide, erreur, non autorisé, verrouillé, hors ligne) implémentés.

## 7. Documentation à livrer

`README.md` (installation en 5 commandes), `docs/` (ce dossier), `SECURITY.md` (signalement de vulnérabilités), `THREAT_MODEL.md` (acteurs, actifs, menaces, mitigations, hors périmètre), `DECISIONS.md` (ADR courts), `CONTRIBUTING.md`, `LICENSE` (à choisir, ex. AGPL-3.0 ou MIT — décision de Vivien), `.env.example`, guide utilisateur « Si vous perdez votre phrase secrète ».
