# 03 — Authentification Google uniquement

## 1. Décision

**Seule méthode de connexion : Google (OAuth 2.0 / OpenID Connect).** Aucune connexion par e-mail, mot de passe, lien magique, SMS ou autre fournisseur.

### Choix de la bibliothèque (recherche faite le 25/11/2026)

- Auth.js / NextAuth v5 est toujours publié en `next-auth@beta` ; le projet est depuis septembre 2025 maintenu par l'équipe Better Auth, en **mode maintenance** (correctifs de sécurité, pas de nouvelles fonctionnalités), et leur propre guidance oriente les nouveaux projets vers Better Auth.
- Sur Next.js 16, `middleware.ts` est renommé `proxy.ts` ; l'ancien snippet `export { auth as middleware }` échoue.
- **Retenu : Better Auth** avec le fournisseur Google seul et l'adaptateur Drizzle (déjà la stack du projet). Même expérience utilisateur que NextAuth, base de code vivante.
- **Variante autorisée** (si Vivien tient à NextAuth) : Auth.js v5, voir §12. Ne jamais mélanger les deux.

## 2. Authentification ≠ déverrouillage

| Étape | Prouve | Fournie par | Donne accès à |
|---|---|---|---|
| Connexion | « Je suis ce compte » | Google | Session serveur, données chiffrées, métadonnées d'accès |
| Déverrouillage | « Je peux déchiffrer » | Phrase secrète (Argon2id) ou clé de récupération | Les clés, donc le contenu en clair, **en mémoire du navigateur** |

Google ne fournit jamais de clé de chiffrement. Un attaquant qui contrôle le compte Google sans connaître la phrase secrète n'obtient **que des blobs chiffrés**. L'administrateur du serveur non plus.

États de l'application : `signed_out` → `signed_in_no_profile` (pseudo manquant) → `signed_in_no_vault_keys` (phrase secrète non créée) → `locked` → `unlocked`.

## 3. Configuration Google Cloud

- Projet OAuth, écran de consentement « Externe », **scopes : `openid`, `email`, `profile` uniquement**. Aucun scope Drive/Gmail/etc.
- URI de redirection autorisés : `https://<domaine>/api/auth/callback/google` et `http://localhost:3000/api/auth/callback/google`.
- Pas d'accès hors-ligne (`access_type` par défaut), pas de refresh token stocké : on n'appelle jamais les API Google après la connexion.
- `prompt: "select_account"` pour éviter la connexion silencieuse au mauvais compte.
- Variables : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (≥ 32 octets aléatoires), `BETTER_AUTH_URL`.

## 4. Configuration serveur (Better Auth)

Fichier unique `src/modules/auth/auth.config.ts` (≤ 80 lignes) :

- `database: drizzleAdapter(db, { provider: "pg" })`.
- `emailAndPassword: { enabled: false }`. Aucun plugin magic-link, otp, username-password.
- `socialProviders: { google: { clientId, clientSecret, prompt: "select_account" } }`.
- `session` : stockage **en base** (révocable), durée 7 jours, `updateAge` 1 jour. `cookieCache` activé seulement avec TTL ≤ 5 min (révocation quasi immédiate).
- Cookies : `httpOnly`, `secure` (prod), `sameSite: "lax"`, préfixe `__Secure-`.
- `advanced.ipAddress` : récupérer l'IP depuis l'en-tête de la plateforme de confiance uniquement.
- `rateLimit` activé (stockage base) sur `/api/auth/*`.
- Handler : `app/api/auth/[...all]/route.ts` avec `toNextJsHandler(auth)` (≤ 5 lignes).
- Hooks Better Auth interdits pour la logique métier ; la création du profil se fait dans `identity.service`.

Tables d'auth (user, session, account, verification) créées par la génération Better Auth (`@better-auth/cli generate`) puis **relues et intégrées** au schéma Drizzle du projet (voir 05). Ne pas modifier leurs colonnes sans vérifier la doc.

## 5. Protection des routes

1. `proxy.ts` : vérification **optimiste** du cookie de session (présence) pour rediriger vers `/login` ; matcher sur `/(app)/*`, `/onboarding/*` ; exclut `/`, `/login`, `/l/*`, `/api/auth/*`, assets.
2. **Vraie vérification** à chaque accès aux données : `requireSession()` dans le controller, qui appelle `auth.api.getSession({ headers })`. Le proxy ne suffit jamais.
3. `requireUnlockedProfile()` (côté serveur) : session valide **et** profil complet (pseudo) **et** matériel de clés présent. Sinon redirection vers l'étape manquante.
4. Le déverrouillage étant côté client, le serveur ne sait pas si le coffre est « ouvert » : il ne sert que des données chiffrées, ce qui est sans danger.

## 6. Premier login : parcours

1. `/login` → bouton « Continuer avec Google ».
2. Retour Google → session créée → redirection `/onboarding`.
3. **Étape 1 Pseudo** : `@handle`, voir §7.
4. **Étape 2 Phrase secrète** : saisie + confirmation, indicateur de force (zxcvbn-ts), minimum imposé (voir §8). Dérivation Argon2id **dans le navigateur**.
5. **Étape 3 Clé de récupération** : générée localement, affichée une fois, téléchargeable en `.txt`, copie. Confirmation obligatoire : l'utilisateur re-saisit 3 groupes tirés au hasard.
6. Envoi au serveur : clé publique, clé privée chiffrée, clé de compte enveloppée (phrase) et enveloppée (récupération), paramètres Argon2, version de format. Création du coffre personnel.
7. Redirection `/dashboard` en état `unlocked`.

Le parcours est **reprenable** : si l'utilisateur ferme l'onglet à l'étape 2, le prochain login l'y ramène (état déduit du serveur, rien de sensible en `localStorage`).

## 7. Pseudo (`@handle`)

- Regex : `^[a-z][a-z0-9_]{2,19}$` (3–20 caractères, minuscules, commence par une lettre).
- Unicité insensible à la casse, contrainte `UNIQUE` en base sur la valeur normalisée.
- Liste réservée : `admin`, `root`, `support`, `security`, `vault`, `google`, `api`, `me`, `system`, `null`, etc. (fichier `reserved-handles.ts`).
- Vérification de disponibilité : endpoint rate-limité (30/min/IP), réponse temporisée constante pour limiter l'énumération.
- **Modifiable** 1 fois / 30 jours ; l'ancien pseudo est réservé 30 jours pour prévenir l'usurpation.
- Le pseudo est public (recherche pour partager). Nom d'affichage et avatar facultatifs, **non repris de Google par défaut** (l'avatar Google n'est pas affiché aux autres tant que l'utilisateur ne l'active pas).

## 8. Phrase secrète

- Minimum 12 caractères et score zxcvbn ≥ 3 ; maximum 256 caractères. Pas de règles « 1 majuscule 1 chiffre » absurdes ; encourager les phrases longues.
- Normalisation Unicode NFKC avant dérivation.
- Jamais envoyée au serveur, jamais loguée, jamais stockée (même hachée).
- Changement de phrase : rechiffre uniquement l'enveloppe de la clé de compte (pas les données).
- Échecs de déverrouillage : délai croissant local (1, 2, 4… 30 s) ; le serveur ne voit pas ces tentatives (rien à vérifier côté serveur). Au-delà de 10 échecs : message proposant la clé de récupération.

## 9. Verrouillage

- Automatique après inactivité : 15 min par défaut (réglable 1–120 min), à la fermeture de l'onglet, au retour de veille prolongée (`visibilitychange` > seuil).
- Manuel : bouton « Verrouiller » (sidebar) + `Ctrl/⌘+L`.
- Verrouiller = effacer les clés de la mémoire, vider les caches de requêtes contenant du clair, rediriger vers `/unlock` en conservant l'URL de retour (chemin seulement, sans fragment).
- La session Google reste valide ; seul le coffre est refermé.

## 10. Sessions et appareils

- Page Réglages → Sécurité : liste des sessions (appareil, navigateur, dernière activité, IP approximative), révocation individuelle, « Déconnecter tous les autres appareils ».
- Déconnexion : suppression de la session serveur **et** verrouillage local.
- Suppression de compte : confirmation en saisissant le pseudo, effacement des données chiffrées, retrait des coffres partagés (transfert de propriété requis si propriétaire avec d'autres membres), révocation de toutes les sessions et liens.

## 11. Cas limites à traiter

| Cas | Comportement |
|---|---|
| Utilisateur refuse le consentement Google | Retour `/login` avec message neutre « Connexion annulée » |
| Erreur OAuth (state invalide, etc.) | `/login?error=…`, message générique, pas de détail technique |
| Google renvoie un e-mail non vérifié | Refus (exiger `email_verified`) |
| Changement d'e-mail côté Google | Ne casse rien : l'identité = identifiant `sub` Google (via la table `account`), pas l'e-mail |
| Compte Google supprimé/perdu | L'accès au compte l'est aussi ; les données restent protégées par la phrase secrète. Pas de moyen de rattacher un autre Google (hors MVP) — l'écrire dans la doc utilisateur |
| Deux onglets, un verrouille | Synchronisation par `BroadcastChannel` : tous se verrouillent |
| Session expirée pendant l'usage | Modale « Session expirée », reconnexion Google sans perdre l'état local non sensible |
| Navigateur sans WebCrypto/WASM | Écran d'incompatibilité clair avec liste des navigateurs pris en charge |

## 12. Variante NextAuth (Auth.js v5) — uniquement si imposée

- Installer `next-auth@beta` (la v5 n'est pas sur le tag `latest`), provider `Google` avec `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `AUTH_SECRET`.
- Adaptateur Drizzle, `session: { strategy: "database" }` (pour la révocation).
- `proxy.ts` : `export { auth as proxy } from "@/auth"` avec le callback `authorized`. **Ne pas** utiliser `export { auth as middleware }` sur Next 16.
- Mêmes règles : scopes `openid email profile`, pas de provider Credentials/Email, vérification de session au plus près des données.
- Documenter le choix dans `DECISIONS.md` avec le risque : bibliothèque en maintenance seule.

## 13. Tests obligatoires

- Unitaires : validation du pseudo, force de la phrase secrète, machine d'états de l'onboarding.
- Intégration : callback Google simulé → création user/profil ; refus si e-mail non vérifié ; session révoquée = accès refusé à l'instant.
- E2E : login Google (mock OAuth), onboarding complet, reprise après fermeture à l'étape 2, verrouillage inactivité, déconnexion multi-onglets.
- Sécurité : aucune route `(app)` ni `/api/*` métier accessible sans session ; aucune réponse API ne contient l'e-mail d'un autre utilisateur.
