# Technical decisions

## 2026-11-25 — Client cryptography primitives

- **AES-256-GCM + HKDF-SHA-256 (Web Crypto):** secret data uses a per-object key and authenticated context; blobs use the versioned JSON shape `{ v, alg, nonce, ct }`. A 64-byte bucket padding scheme limits ciphertext-length leakage.
- **Argon2id and sealed boxes (libsodium-wrappers-sumo):** use the audited libsodium implementation for passphrase derivation, X25519 sealed envelopes, and Ed25519 identity keys. Defaults follow the product specification: 64 MiB and three operations; reject weaker stored parameters.
- **Vitest:** isolated cryptographic unit tests run without Next.js or application services.

The password, root, and vault keys stay in memory only. This does not replace authentication, authorization, or a security audit before public launch.

## 2026-11-25 — Green text palette (superseded)

- **Green foregrounds for ordinary interface text:** applied through Primer functional tokens so light and dark themes retain readable contrast. Error and destructive states keep semantic status colors instead of being recolored green.
- **Reason:** explicit product-owner request; semantic status colors remain distinct to preserve accessible feedback.

## 2026-11-26 — Direction visuelle Vercel

- **Choix :** palette monochrome clair/sombre inspirée de Vercel, focus bleu, densité GitHub, finition Apple (feedback immédiat, mouvements courts et interrompables). Les valeurs vivent uniquement dans `src/styles/tokens.css`.
- **Raison :** demande explicite du propriétaire du produit ; remplace la palette verte provisoire. Les couleurs sémantiques restent distinctes et accessibles.
- **Alternative écartée :** conserver la palette verte, jugée trop « produit-specific » pour la direction demandée.

## 2026-11-26 — Journal et erreurs API

- **Choix :** Pino avec liste de rédaction centralisée, identifiant de requête généré hors du logger, format d’erreur unique `{ error: { code, message, requestId } }` normalisé dans `lib/api.ts`, limites centralisées dans `lib/limits.ts`.
- **Raison :** éviter qu’une valeur secrète, un jeton ou un e-mail fuie dans un log ou un message d’erreur ; garder un seul vocabulaire pour le client.
- **Alternative écartée :** `console.log` et messages d’erreur spécifiques par endpoint.

## 2026-11-26 — Isolation base de données

- **Choix retenu :** filtrage applicatif strict par `userId`/`vaultId` dans chaque repository implicite, privilèges de base minimaux et contraintes d’unicité/foreign keys vérifiées par les migrations. RLS est différé jusqu’à la définition d’un rôle Postgres par utilisateur ou d’un `SET LOCAL app.user_id` dans chaque transaction.
- **Raison :** le pool pg unique ne porte pas encore d’identité utilisateur par transaction ; activer RLS maintenant bloquerait les requêtes ou donnerait une fausse sensation de sécurité.
- **Alternative écartée :** RLS avec `current_setting` non positionné, non testable et non vérifié en CI.

## 2026-11-26 — Licence

- **Statut :** à trancher par Vivien entre MIT et AGPL-3.0. Aucun fichier `LICENSE` n’est généré tant que le choix n’est pas explicite.
