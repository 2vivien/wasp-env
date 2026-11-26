# 05 — Base de données (PostgreSQL / Neon / Drizzle)

> Le schéma ci-dessous est la **spécification**, pas du SQL prêt à migrer. L'agent le transforme en fichiers Drizzle (un fichier par table, voir plafonds dans 02), génère la migration, la **relit**, puis l'applique.

## 1. Règles générales

- Clés primaires : `uuid` (v7 si disponible, sinon `gen_random_uuid()`), colonne `id`.
- Dates : `timestamptz`, `created_at` / `updated_at` par défaut `now()`, mise à jour par trigger ou par service.
- Types de contenu chiffré : `bytea` pour `ciphertext`, `nonce` ; ou `jsonb` du format de blob (04 §3) — **un seul choix** pour tout le projet, noté dans DECISIONS.md.
- Enums Postgres pour les listes fermées (rôles, catégories, types d'événements) ; pas de chaînes libres.
- Suppression : **douce** (`deleted_at`) pour coffres, projets, environnements, secrets (corbeille 30 j) ; **dure** pour sessions, liens expirés, invitations terminées après 90 j.
- Toutes les FK ont une action explicite (`ON DELETE CASCADE|RESTRICT|SET NULL`) justifiée en commentaire.
- Toute colonne utilisée en filtre/jointure est indexée. Pas d'index inutile.
- Row Level Security (RLS) activée sur les tables métier en défense en profondeur (le rôle applicatif ne contourne pas) — si Neon le permet dans la config retenue ; sinon documenter l'alternative.

## 2. Tables

### Authentification (générées par Better Auth, à intégrer)
`user` (id, name, email, email_verified, image, created_at, updated_at), `session` (id, user_id, token, expires_at, ip, user_agent…), `account` (id, user_id, provider_id = 'google', account_id = sub Google, tokens non utilisés → **ne pas stocker access/refresh/id token** si la config permet de les omettre), `verification`.
Contrainte projet : `account.provider_id` ∈ {`google`} ; pas de colonne mot de passe utilisée.

### Identité
`profiles` — `user_id` PK/FK→user CASCADE, `handle` (citext), `handle_normalized` UNIQUE, `display_name?`, `avatar_url?`, `bio?`, `handle_changed_at`, `onboarding_step` enum(`handle`,`passphrase`,`recovery`,`done`).
`reserved_handles` — `handle` PK, `reserved_until?`.
`user_key_material` — `user_id` PK/FK, `public_key_x25519`, `public_key_ed25519`, `enc_private_keys` (blob), `ak_wrapped_by_passphrase` (blob), `kdf_params` (jsonb : algo, mem, iter, par, salt), `ak_wrapped_by_recovery` (blob), `format_version`, `rotated_at?`.
`devices` / `sessions_meta` — métadonnées d'affichage des sessions (nom d'appareil, dernier usage) liées à `session.id`.

### Coffres et accès
`vaults` — `id`, `owner_id`→user RESTRICT, `kind` enum(`personal`,`shared`), `enc_meta` (nom, description, icône, couleur, chiffrés), `key_version` int, `archived_at?`, `deleted_at?`, timestamps. **Un seul coffre `personal` par défaut/utilisateur** (index unique partiel).
`vault_members` — `vault_id`→vaults CASCADE, `user_id`→user CASCADE, `role` enum, `permissions` bit/array (exceptions), `added_by`, `created_at`. PK (`vault_id`,`user_id`). Contrainte : exactement 1 membre `owner` par coffre (index unique partiel).
`vault_key_envelopes` — `vault_id`, `user_id`, `key_version`, `sealed_key` (blob), `sender_public_key`. PK (`vault_id`,`user_id`,`key_version`). FK composite → `vault_members`.

### Contenu
`projects` — `id`, `vault_id`→vaults CASCADE, `enc_meta` (nom, description, icône, tags), `position`, `archived_at?`, `deleted_at?`, timestamps.
`environments` — `id`, `project_id`, `vault_id` (dénormalisé), `kind` enum(`development`,`staging`,`production`,`testing`,`custom`), `enc_meta` (nom si custom), `position`, `deleted_at?`. **FK composite** (`project_id`,`vault_id`) → `projects(id, vault_id)` pour **interdire** un environnement dont le `vault_id` ≠ celui du projet. Max 10 par projet (trigger ou contrainte applicative + test).
`secrets` — `id`, `vault_id` NOT NULL, `project_id?`, `environment_id?`, `category` enum, `enc_meta` (nom, description, tags, champs perso), `current_version` int, `is_favorite` par utilisateur → table à part, `archived_at?`, `deleted_at?`, `created_by`, timestamps. **FK composites** : (`environment_id`,`project_id`,`vault_id`) → `environments(id, project_id, vault_id)` ; si `environment_id` non nul alors `project_id` non nul (CHECK).
`secret_versions` — `secret_id`, `version` int, `enc_value` (blob), `enc_meta_snapshot?`, `created_by`, `created_at`. PK (`secret_id`,`version`). Immuable (pas d'UPDATE). Rétention : 50 versions max par secret, purge des plus anciennes.
`secret_favorites` — (`user_id`,`secret_id`) PK.
`env_files` — `id`, `environment_id`, `enc_layout` (ordre, commentaires, lignes vides — chiffré) pour export sans perte ; les valeurs sont des `secrets` de catégorie ENV.

### Partage
`share_scopes` — `id`, `vault_id`, `kind` enum(`project`,`secret`), `object_id`, `created_by`. Périmètre de partage partiel avec sa propre clé `SK`.
`share_members` — `scope_id`, `user_id`, `role`, `permissions`, `sealed_key` (blob), `key_version`. PK (`scope_id`,`user_id`).
`groups` — `id`, `owner_id`, `enc_name`. `group_members` — (`group_id`,`user_id`) PK, `added_at`.
`invitations` — `id`, `kind` enum(`handle`,`link`,`qr`), `target_kind` enum(`vault`,`project`,`secret`), `target_id`, `inviter_id`, `invitee_id?` (pour `handle`), `role`, `permissions`, `status` enum(`pending`,`accepted`,`declined`,`revoked`,`expired`), `expires_at`, `created_at`, `responded_at?`.
`share_links` — `id`, `token_hash` UNIQUE, `target_kind`, `target_id`, `enc_payload` (blob chiffré sous LK), `permissions`, `expires_at`, `max_uses?`, `use_count`, `access_code_hash?`, `revoked_at?`, `created_by`.
`share_link_uses` — `link_id`, `used_at`, `ip_hash`, `user_agent_hash` (journal d'usage sans donnée brute).

### Audit et sécurité
`audit_logs` — `id`, `actor_id?`, `vault_id?`, `event` enum, `target_kind`, `target_id`, `metadata` jsonb **(liste blanche de clés, jamais de valeur)**, `ip_hash?`, `created_at`. Append-only (REVOKE UPDATE/DELETE pour le rôle applicatif). Rétention 12 mois, partition mensuelle si volume.
`rate_limits` — clé, compteur, fenêtre (ou service externe).
`recovery_events` — `user_id`, `kind`, `created_at` (pour alerter l'utilisateur d'une récupération).

## 3. Contraintes d'isolation (obligatoires, testées)

1. Un environnement ne peut pas référencer un projet d'un autre coffre (FK composite).
2. Un secret ne peut pas référencer un environnement d'un autre projet/coffre (FK composite + CHECK).
3. Un membre de coffre est unique par (coffre, utilisateur).
4. Un coffre a exactement un propriétaire.
5. Une enveloppe de clé ne peut exister que pour un membre existant.
6. Un lien ou une invitation ne peut cibler qu'un objet existant du coffre de l'invitant, et l'invitant doit avoir la permission `share`.
7. `audit_logs` : aucune écriture UPDATE/DELETE possible par l'application.
8. Les versions de secrets sont immuables.

## 4. Index minimum

`vault_members(user_id)`, `projects(vault_id) WHERE deleted_at IS NULL`, `environments(project_id)`, `secrets(vault_id, environment_id) WHERE deleted_at IS NULL`, `secrets(vault_id, category)`, `secret_versions(secret_id, version DESC)`, `invitations(invitee_id, status)`, `share_links(token_hash)`, `audit_logs(vault_id, created_at DESC)`, `profiles(handle_normalized)`, `session(user_id)`.

## 5. Transactions obligatoires

Création de compte (profil + clés + coffre personnel + enveloppe), création de secret (secret + version 1 + audit), nouvelle version (vérif version attendue + insertion + mise à jour `current_version` + audit), ajout de membre (membre + enveloppe + audit), rotation (par lots : chaque lot atomique, état global `rotating` reprenable), suppression de compte.

## 6. Migrations

- `drizzle-kit generate` puis **relecture humaine** de chaque `.sql`. `push` interdit en production.
- Migrations additives d'abord (expand/contract). Pas de renommage destructif en une étape.
- Branche Neon de test créée par la CI ; seed minimal sans aucun vrai secret.
- Sauvegardes : point-in-time restore Neon activé ; ne contiennent que du chiffré pour le contenu sensible.
