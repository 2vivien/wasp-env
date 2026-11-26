# 04 — Cryptographie (zero-knowledge)

> Le package `src/crypto/` est autonome : aucune dépendance à `next`, `react`, `server/`, `drizzle`. Toute opération crypto passe par lui. Aucune primitive inventée.

## 1. Primitives

| Besoin | Primitive | Bibliothèque |
|---|---|---|
| Dérivation depuis la phrase | **Argon2id** | `libsodium-wrappers-sumo` (`crypto_pwhash`) |
| Chiffrement des données | **AES-256-GCM**, nonce 96 bits aléatoire | Web Crypto API |
| Dérivation de sous-clés | **HKDF-SHA-256** | Web Crypto API |
| Enveloppe de clé pour un membre | **Sealed box** (X25519 + XSalsa20-Poly1305) | libsodium |
| Signature d'identité | **Ed25519** | libsodium |
| Aléa | `crypto.getRandomValues` / `randombytes_buf` | natif |

Paramètres Argon2id par défaut : mémoire **64 MiB**, itérations **3**, parallélisme **1**, sel 16 octets. Minimum accepté en lecture : 19 MiB / 2 / 1 (recommandation OWASP minimale). Les paramètres sont **stockés avec l'enveloppe** pour pouvoir les relever plus tard.

## 2. Hiérarchie de clés

```
Phrase secrète ──Argon2id──► KEK_phrase ─┐
Clé de récupération (256 bits) ► KEK_rec ┼─ enveloppent ─► AK (clé de compte, 256 bits aléatoires)
                                         │
AK ── chiffre ──► clé privée X25519 + clé privée Ed25519 (stockées chiffrées)
Clé publique X25519 / Ed25519 ── publiées (identité)

Par coffre : VK (clé de coffre, 256 bits aléatoires)
  VK ── scellée avec la clé publique de chaque membre ──► vault_key_envelopes
  VK ── HKDF(info = "secret:"+secretId) ──► clé de donnée du secret
  VK ── HKDF(info = "meta:"+objectId)   ──► clé des métadonnées chiffrées
```

- Le serveur stocke : clé publique, clé privée **chiffrée**, `AK` enveloppée (×2), enveloppes de `VK`, blobs chiffrés. **Jamais** `AK`, `VK`, phrase, clé de récupération en clair.
- Le coffre personnel est un coffre à 1 membre (soi-même) : même mécanique que le partage, aucun cas spécial.

## 3. Format d'un blob chiffré

```
{ v: 1, alg: "A256GCM", nonce: base64url(12), ct: base64url(...) }
```
- **AAD (données authentifiées additionnelles)** obligatoire : `vaultId | objectType | objectId | version`. Empêche de déplacer un blob d'un objet à un autre (attaque par substitution).
- `v` permet les migrations de format. Tout blob de version inconnue est refusé avec une erreur claire.
- Nonce : toujours aléatoire, jamais réutilisé avec la même clé. Clé de donnée dérivée **par secret** (HKDF) pour rester très loin des limites AES-GCM.
- Compression interdite avant chiffrement (fuite de longueur exploitable) ; padding à multiple de 64 octets pour réduire la fuite de taille.

## 4. Ce qui est chiffré / en clair côté serveur

| Donnée | Chiffrée ? | Raison |
|---|---|---|
| Valeur du secret, notes, champs personnalisés | **Oui** | Contenu sensible |
| Nom du secret, description, tags | **Oui** (défaut) | Les métadonnées révèlent beaucoup |
| Noms de coffres, projets, environnements | **Oui** | Idem |
| Clés des variables ENV | **Oui** | Peuvent révéler les services utilisés |
| Type/catégorie du secret | Non | Nécessaire au tri serveur léger ; faible sensibilité (décision à réviser dans DECISIONS.md) |
| Identifiants, relations, dates, versions, tailles approx. | Non | Intégrité, permissions, pagination |
| Pseudo, nom d'affichage, clé publique | Non | Découverte pour le partage |
| E-mail Google | Non (exigé par la lib d'auth) | **Jamais exposé** aux autres, jamais loggué |

Conséquence assumée : **la recherche est locale**. Après déverrouillage, le client déchiffre les métadonnées (pas les valeurs) et construit un index en mémoire (MiniSearch). L'index n'est jamais persisté.

## 5. Flux

### 5.1 Création du compte (onboarding)
1. Générer `AK`, paires de clés, `VK` du coffre personnel, clé de récupération.
2. `KEK_phrase = Argon2id(phrase, sel)` ; `KEK_rec = HKDF(clé de récupération)`.
3. Envelopper `AK` avec chacune ; chiffrer les clés privées avec `AK` ; sceller `VK` pour soi.
4. Envoyer le tout en **une transaction** (échec = rien n'est créé).
5. Effacer les tampons (`fill(0)`) et références.

### 5.2 Déverrouillage
Récupérer les enveloppes → `Argon2id` → déballer `AK` → déchiffrer clés privées → déballer les `VK` à la demande → garder en mémoire (`CryptoKey` **non extractable** quand possible).

### 5.3 Lire / écrire un secret
Lecture : blob → HKDF(VK, secretId) → déchiffrer avec AAD. Écriture : nouvelle version = nouveau nonce, AAD incluant `version+1`, envoi du blob ; le serveur vérifie la **version attendue** (verrouillage optimiste) et refuse sur conflit.

### 5.4 Partager un coffre / projet / secret
- **Coffre** : sceller `VK` avec la clé publique du destinataire → `vault_key_envelopes`.
- **Projet ou secret seul** : ne jamais donner `VK` (sinon accès à tout le coffre). Créer une **clé de partage dédiée** (`SK`, aléatoire) ; rechiffrer l'objet (ou ses clés de donnée) sous `SK` ; sceller `SK` pour le destinataire. Un projet partagé = un « mini-coffre » logique (`share_scope`).
- Vérifier l'empreinte de clé publique du destinataire : afficher une **empreinte courte** (ex. 4 groupes de 4) que les deux parties peuvent comparer ; avertir si la clé publique d'un contact change (TOFU + alerte).

### 5.5 Lien privé
- Générer `LK` aléatoire dans le navigateur ; chiffrer le contenu partagé avec `LK` ; envoyer au serveur **seulement** le blob + permissions + expiration + max d'usages + hash du code d'accès éventuel.
- URL : `https://<domaine>/l/<tokenPublic>#<LK base64url>`. Le fragment n'est **jamais** envoyé au serveur ni loggué.
- Page `/l/[token]` : `Referrer-Policy: no-referrer`, pas de scripts tiers, le fragment est lu côté client puis **retiré de la barre d'adresse** (`history.replaceState`).
- Le code d'accès facultatif protège l'**accès au blob** côté serveur (rate-limité) ; il n'est pas la clé de chiffrement.
- Le jeton public est ≥ 128 bits d'entropie ; comparaison en temps constant ; stocké **haché** côté serveur.

### 5.6 Révocation et rotation
- Retirer un membre : suppression immédiate de son enveloppe et de ses permissions côté serveur (accès futur refusé).
- Il a possiblement déjà vu `VK` : **rotation** → nouvelle `VK'`, rechiffrement des clés de donnée/blobs du périmètre, nouvelles enveloppes pour les membres restants, versionnage `vaultKeyVersion`. Opération exécutée **par un membre déverrouillé** (administrateur/propriétaire), par lots, reprenable, avec état `rotating` visible dans l'UI.
- L'UI dit clairement : « Les valeurs déjà consultées par cette personne restent connues d'elle. Régénérez les clés chez le fournisseur. » Proposer la liste des secrets concernés.

### 5.7 Récupération
Clé de récupération → `KEK_rec` → `AK`. Après récupération : forcer la création d'une **nouvelle phrase secrète** et proposer de **régénérer** la clé de récupération. Sans phrase ni clé de récupération : données perdues, message explicite à l'onboarding et dans Réglages.

### 5.8 Export chiffré
Archive JSON chiffrée sous une clé dérivée d'une **phrase d'export** (Argon2id), contenant l'arborescence et les blobs rechiffrés. Jamais de clair sur disque. Import = opération symétrique avec validation de version et de schéma.

## 6. Hygiène mémoire côté client

- Garder les clés dans un module singleton (`key-store.ts`), pas dans React state ni dans un store sérialisable.
- À `lock()` : détruire les références, `fill(0)` sur tous les `Uint8Array` détenus, vider les caches TanStack Query contenant du clair, vider l'index de recherche.
- Les valeurs révélées sont **remasquées après 10 s** (réglable 5–60 s) et à la perte de focus de l'onglet si l'option est active.
- Presse-papiers : écrasé après 30 s (réglable 10–120 s ou désactivé) ; avertir que ce n'est pas garanti.
- Aucune valeur en clair dans le DOM tant qu'elle n'est pas révélée (placeholder de longueur fixe, pas la vraie longueur).
- Capture d'écran / DevTools : hors périmètre, ne pas promettre de protection.

## 7. Ce qu'il est interdit de faire

- Envoyer au serveur : phrase, `KEK`, `AK`, `VK`, clé de récupération, fragment de lien, valeur en clair, nom en clair d'un objet chiffré.
- Réutiliser un nonce. Utiliser `Math.random`. Utiliser ECB/CBC sans MAC. Écrire sa propre dérivation.
- Mettre une clé dans `localStorage`, cookie, URL (hors fragment), logs, erreurs, analytics, Sentry.
- Comparer des secrets/hash avec `===` (utiliser comparaison en temps constant).
- Considérer que le chiffrement remplace les contrôles d'accès serveur : **les deux** sont obligatoires.

## 8. Tests cryptographiques obligatoires (indépendants du reste)

- Vecteurs de test connus (AES-GCM, HKDF, Argon2id) passent.
- Aller-retour chiffrement/déchiffrement sur tailles 0, 1, 63, 64, 65, 64 KiB.
- Altération d'1 bit du ciphertext, du nonce, de l'AAD → échec.
- Blob d'un secret A collé sur un secret B → échec (AAD).
- Rotation : ancien membre ne peut plus déchiffrer les nouvelles versions.
- Récupération : phrase perdue + clé de récupération → accès OK ; sans les deux → impossible.
- Fuite : fuzz des logs/erreurs sur 1 000 opérations, aucune sous-chaîne secrète.
- Test « serveur curieux » : base de test inspectée, aucune valeur de test en clair.
- Audit externe avant la mise en production publique (phase 7).
