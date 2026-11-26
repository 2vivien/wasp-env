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
