# 02 — Architecture et règles de code

## 1. Principes

Monolithe modulaire. Chaque module a des frontières claires et n'expose qu'un `index.ts`. Le package `crypto` est **indépendant du serveur** (aucun import de `server/`, `next/*`, `react`).

## 2. Arborescence

```
.
├── docs/                        # ce dossier
├── drizzle/                     # migrations générées (ne pas éditer à la main)
├── e2e/                         # Playwright
├── proxy.ts                     # Next 16 (ex-middleware) : redirection optimiste uniquement
├── src/
│   ├── app/
│   │   ├── (public)/            # landing, login
│   │   ├── (onboarding)/        # pseudo, phrase secrète, récupération
│   │   ├── (app)/               # espace connecté (layout avec sidebar)
│   │   │   ├── dashboard/
│   │   │   ├── vaults/[vaultId]/
│   │   │   ├── projects/[projectId]/
│   │   │   ├── secrets/[secretId]/
│   │   │   ├── env/
│   │   │   ├── shared/  sharing/  invitations/  groups/
│   │   │   ├── activity/
│   │   │   └── settings/ (account, security)
│   │   ├── l/[token]/           # ouverture d'un lien privé (fragment lu côté client)
│   │   ├── api/                 # route handlers fins
│   │   ├── error.tsx  not-found.tsx  global-error.tsx
│   │   └── layout.tsx  globals.css
│   ├── modules/                 # métier, un dossier par domaine
│   │   └── <module>/
│   │       ├── <module>.controller.ts
│   │       ├── <module>.service.ts
│   │       ├── <module>.repository.ts
│   │       ├── <module>.schemas.ts      # Zod (entrées/sorties)
│   │       ├── <module>.types.ts
│   │       ├── <module>.errors.ts
│   │       └── index.ts
│   ├── features/                # UI par domaine (côté client)
│   │   └── <feature>/
│   │       ├── components/  hooks/  api/  state/  types.ts  index.ts
│   ├── crypto/                  # package indépendant (voir 04)
│   ├── lib/
│   │   ├── database/  (client, schema/, migrations helpers)
│   │   ├── permissions/  validation/  env/  logger/  errors/  rate-limit/
│   ├── components/
│   │   ├── ui/                  # primitives shadcn adaptées aux tokens
│   │   └── layout/              # Sidebar, Topbar, CommandPalette, PageHeader
│   └── styles/tokens.css        # SEULE source des couleurs, polices, rayons
└── tests/ (unit, integration)
```

Modules : `auth`, `identity`, `vaults`, `projects`, `environments`, `secrets`, `env-files`, `sharing`, `invitations`, `groups`, `activity`, `recovery`, `sessions`. (`integrations` créé vide au MVP seulement si nécessaire ; sinon non créé.)

## 3. Couches (sens unique des dépendances)

`Route → Controller → Service → Repository → Drizzle`

| Couche | Fait | Ne fait jamais |
|---|---|---|
| Route (`app/api/**/route.ts`) | Branche vers un controller | Logique, accès DB |
| Controller | Authentifie, valide (Zod), appelle le service, formate la réponse | Requête DB, règle métier |
| Service | Règles métier, **vérification des permissions**, transactions, audit | Lire `Request`/`Response`, SQL |
| Repository | Requêtes Drizzle, une seule table principale par fonction | Règles métier, permissions |
| Composant React | Affichage, câblage de hooks | Fetch direct, logique, crypto |
| Hook | Orchestration d'état/requêtes d'une feature | JSX |

Un module n'importe un autre module que via son `index.ts`. Interdit : import circulaire (vérifié par `eslint-plugin-import/no-cycle`).

## 4. Limites de taille (plafond ET plancher)

Lignes hors imports, commentaires et lignes vides.

| Type | Plancher | Cible | Plafond dur |
|---|---|---|---|
| Composant React | 15 | 40–120 | **150** |
| Page `page.tsx` | 8 | 20–60 | **80** (compose des features) |
| Hook | 10 | 20–60 | **80** |
| Controller | 20 | 40–120 | **150** |
| Service | 30 | 60–180 | **220** |
| Repository | 20 | 40–120 | **150** |
| Schéma Zod | 10 | 20–120 | **150** |
| Route handler | 5 | 8–30 | **40** |
| Fichier de schéma Drizzle (1 table) | 15 | 30–100 | **150** |
| Fichier de types | 5 | 10–100 | **150** |
| Fichier de tests | 20 | 50–200 | **300** |
| Fonction | 3 | 5–25 | **40** |

- Un fichier sous le plancher est **fusionné** avec son voisin logique (sauf `index.ts` de réexport et fichiers de config).
- Un fichier au-dessus du plafond est **découpé** avant merge ; l'ESLint `max-lines` et `max-lines-per-function` sont configurés avec ces plafonds et bloquent la CI.
- Complexité cyclomatique ≤ 10. Paramètres de fonction ≤ 4 (sinon objet typé). Profondeur d'imbrication ≤ 3.

## 5. Nommage

- Fichiers : `kebab-case`. Composants : `PascalCase.tsx`. Hooks : `use-xxx.ts` exportant `useXxx`.
- Un composant principal par fichier, export nommé (pas de `default` sauf pages/layouts Next).
- Types : `PascalCase`, sans préfixe `I`. Enums : unions littérales (`type Role = 'viewer' | …`), pas de `enum` TS.
- Constantes : `SCREAMING_SNAKE_CASE` dans `constants.ts` du module.
- Booléens : `isX`, `hasX`, `canX`. Handlers : `onX` (props) / `handleX` (interne).
- Pas d'abréviations obscures. Pas de commentaires qui répètent le code ; commenter le **pourquoi**.

## 6. Règles TypeScript

`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
- Types **dérivés des schémas Zod** (`z.infer`) pour tout ce qui traverse une frontière.
- Types de domaine opaques (branded) pour `VaultId`, `SecretId`, `UserId`, etc. : impossible de les mélanger.
- Valeurs secrètes typées `SecretString` (classe/branded) dont `toString`/`toJSON` renvoient `[REDACTED]`.
- Résultats d'opération attendus : `Result<T, AppError>` pour le métier ; exceptions réservées à l'imprévu.
- Union discriminée pour tous les états UI (`{ status: 'loading' } | { status: 'error', error } | …`).

## 7. Règles React / Next

- Server Components par défaut. `'use client'` seulement pour interactivité, crypto, état de verrouillage.
- Les données **chiffrées** peuvent être récupérées par Server Components ; le **déchiffrement n'a lieu que côté client**.
- Pas de `useEffect` pour dériver un état ni pour fetcher (utiliser TanStack Query). `useEffect` = synchronisation avec un système externe uniquement.
- Pas de `useMemo`/`useCallback` par réflexe : seulement après mesure ou pour stabiliser une dépendance connue.
- Listes longues (> 100 lignes) virtualisées (TanStack Virtual).
- Formulaires : React Hook Form + Zod resolver. Erreurs liées aux champs via `aria-describedby`.
- État serveur : TanStack Query (clés factorisées dans `features/*/api/keys.ts`). État local : `useState`/`useReducer`. État global : Zustand **uniquement** pour la session de déverrouillage et la palette de commandes.
- Aucune clé de chiffrement dans : `localStorage`, `sessionStorage`, cookies, IndexedDB non chiffré, URL, state persistant, devtools. Mémoire uniquement (voir 04).
- Images : `next/image`. Polices : `next/font` (Geist Sans + Geist Mono, sauf si l'image de référence impose autre chose).
- Aucun `dangerouslySetInnerHTML`. Aucun `eval`. Aucun script tiers analytique.

## 8. Hooks — conventions

Chaque hook : une responsabilité, un fichier, un test. Retour typé explicite.

Hooks attendus (liste minimale) :
`useSession`, `useVaultLock` (état locked/unlocked, `unlock`, `lock`, minuteur d'inactivité), `useVaults`, `useVault`, `useProjects`, `useProject`, `useEnvironmentBoard`, `useSecrets`, `useSecret`, `useDecryptedSecret`, `useRevealValue` (révélation 10 s puis remasquage), `useCopyToClipboard` (effacement 30 s), `useEnvEditor`, `useEnvDiff`, `useShare`, `useInvitations`, `useMembers`, `useGroups`, `useActivity`, `useCommandPalette`, `useDebouncedValue`, `useKeyboardShortcut`, `useIdleTimer`, `useConfirmDialog`.

Règles : pas de hook qui appelle un autre hook conditionnellement ; pas de hook > 80 lignes ; pas d'effet sans nettoyage ; pas de fetch dans un hook d'UI pure.

## 9. Gestion d'erreurs

- `AppError` avec `code` stable (`AUTH_REQUIRED`, `VAULT_LOCKED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`, `RATE_LIMITED`, `CRYPTO_FAILURE`, `INTERNAL`), `httpStatus`, message générique.
- Jamais de valeur secrète, clé, stack ou SQL dans le message renvoyé.
- Chaque écran a un `error.tsx` ou une zone d'erreur avec action de reprise.
- Les échecs de déchiffrement affichent « Impossible de déchiffrer. Vérifiez que le coffre est déverrouillé. » et ne révèlent rien d'autre.

## 10. Logs

Logger structuré (pino) avec **liste de rédaction** : `password`, `passphrase`, `secret`, `value`, `ciphertext`, `key`, `token`, `authorization`, `cookie`, `fragment`, `recoveryKey`, `email`. Un test vérifie qu'aucun log de test n'en contient. Sentry : `beforeSend` supprime corps de requête, cookies, URL avec fragment.

## 11. Variables d'environnement

Validées au démarrage par Zod dans `lib/env` (échec = arrêt). Jamais de `process.env` hors de ce module. Aucun secret en `NEXT_PUBLIC_`. `.env.example` à jour et commité ; `.env*` réels ignorés par git.

## 12. Dépendances

- Une dépendance se justifie dans `DECISIONS.md`. Versions épinglées. `pnpm audit` en CI. Dependabot/Renovate actifs.
- Interdit : bibliothèques crypto « maison », `crypto-js`, `bcryptjs` pour des clés de chiffrement, `moment`, `lodash` complet.
- Cryptographie : Web Crypto API (AES-GCM, HKDF) + `libsodium-wrappers-sumo` (Argon2id, sealed box, X25519, Ed25519).

## 13. Git et CI

- Commits Conventional Commits. Branche protégée `main`. PR obligatoire.
- CI : install → lint → typecheck → tests unitaires → tests intégration (Postgres éphémère) → build → E2E → audit des dépendances → scan de secrets (gitleaks).
- Hooks Husky : `lint-staged` + gitleaks sur pré-commit.

## 14. Sécurité applicative transverse

CSP stricte avec nonce (pas de `unsafe-inline` scripts), `Referrer-Policy: no-referrer` sur `/l/*`, `X-Content-Type-Options`, `Permissions-Policy`, `frame-ancestors 'none'`, HSTS. `Cache-Control: no-store` sur toutes les réponses contenant des données chiffrées ou des sessions. Origine vérifiée sur les mutations (CSRF).
