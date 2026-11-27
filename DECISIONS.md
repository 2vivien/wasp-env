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
- **Réaffirmé le 27/11/2026 :** l'isolation est désormais couverte par `tests/idor.test.ts` sur la base de test en CI ; l'activation de RLS resterait une défense en profondeur nécessitant une identité par transaction, non présente dans le pool pg actuel.

## 2026-11-27 — Budgets de performance

- **Choix :** `pnpm check:budgets` mesure le JS gzip chargé au démarrage à partir des manifests de build Next. Le budget public est fixé à 180 Ko gzip (mesuré 167,9 Ko) et celui des routes applicatives à 250 Ko.
- **Raison :** avec Next 16/Turbopack, les chunks sont fusionnés et partagés entre toutes les routes ; une mesure par route donnerait le même total et ne dirait rien. Le script échoue si le total dépasse le budget.
- **Écart assumé :** la cible documentée de 120 Ko pour `/` et `/login` n'est pas atteinte ; elle reste notée comme dette de performance, sans rollback functionalité.
- **Alternative écartée :** supprimer des dépendances UI pour gagner 48 Ko au prix d'une régression d'accessibilité.

## 2026-11-27 — Autorisation : ownership ou exceptions

- **Choix :** toute mutation est autorisée soit par un filtre de propriété explicite (`userId = session.user.id`) sur les ressources personnelles, soit par `can(rôle, action, access.permissions)` via `getVaultAccess` sur les ressources de coffre partagé. Les routes sans partage restent volontairement en ownership strict, ce qui est plus restrictif que la matrice ; on n'ouvre pas leur accès aux membres sans rechiffrement explicite.
- **Raison :** éviter d'appliquer une matrice de permissions à des objets dont la clé n'est pas disponible pour les membres, tout en garantissant que les exceptions par membre sont bien prises en compte côté serveur là où le partage existe.
- **Alternative écartée :** uniformiser toutes les routes sur `can()` ; cela donnerait l'accès à des objets chiffrés sous une clé que le membre ne détient pas, et créerait une fausse impression de sécurité.
- **Contrôle :** `tests/api-auth.test.ts` vérifie statiquement qu'aucune mutation n'échappe à ces deux règles.

## 2026-11-27 — Contrôle d'accessibilité automatisé

- **Choix :** `@axe-core/playwright` en dépendance de développement, avec un test Playwright sur les pages publiques (`/`, `/login`) filtré sur WCAG 2 A/AA et les violations serious/critical.
- **Raison :** rendre l'accessibilité vérifiable en CI plutôt que de se fier à une revue manuelle ; le premier passage a détecté un contraste insuffisant sur le bouton Google de la landing, corrigé via les tokens.
- **Alternative écartée :** injecter `axe-core` à la main dans la page (version non suivie, aucune traçabilité de dépendance).

## 2026-11-26 — Licence

- **Choix :** MIT, fichier `LICENSE` à la racine.
- **Raison :** décision explicite du propriétaire du produit ; favorise la redistribution et les contributions ouvertes.
- **Alternative écartée :** AGPL-3.0, plus restrictive pour les réutilisations SaaS fermées.
