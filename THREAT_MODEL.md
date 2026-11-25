# Modèle de menace — Wasp

## Objectif et statut

Wasp vise à empêcher l’opérateur du service et un accès en lecture seule à la base de données de connaître le contenu des secrets. Le code actuel fournit des primitives cryptographiques testées, mais ce document n’est pas un audit et la version actuelle reste un prototype en développement.

## Actifs à protéger

- Valeurs de secrets, commentaires et fichiers `.env`.
- Clés de coffre, clés privées d’identité, phrase secrète et clé de récupération.
- Métadonnées chiffrées (noms de projets et environnements, noms/valeurs ENV).
- Sessions, pseudo, clés publiques, invitations et relations de partage.

## Adversaires considérés

- Lecteur non autorisé de la base de données ou des sauvegardes.
- Utilisateur authentifié tentant d’accéder aux données d’un autre compte.
- Opérateur ou administrateur du service curieux.
- Personne ayant obtenu temporairement un appareil déjà déverrouillé.

## Mesures présentes dans le code

- Chiffrement AES-GCM avec AAD et dérivation HKDF côté navigateur ; Argon2id et enveloppes X25519/Ed25519 via libsodium.
- Données chiffrées validées par schéma avant enregistrement ; clés sensibles conservées en mémoire de l’onglet, pas en `localStorage`.
- Endpoints métier authentifiés, filtrage par utilisateur/coffre, vérification des permissions pour les partages et contrôle de l’origine sur les mutations.
- Réponses sans cache sur les API sensibles ; journal d’activité sans valeur de secret ; jetons OAuth Google non conservés dans les comptes d’auth.
- Valeurs masquées par défaut et verrouillage automatique pendant l’usage du coffre.

## Risques et limites non éliminés

- Un appareil compromis, une extension malveillante, un XSS, une capture d’écran ou un presse-papiers compromis peut exposer les valeurs après déchiffrement.
- Un membre d’un coffre partagé peut conserver/copier une valeur déjà révélée. Révoquer un partage ne révoque pas ce qu’il a appris.
- Les métadonnées de relations, dates, volumes et catégories peuvent rester observables dans la base.
- La perte de la phrase secrète et de la clé de récupération est irréversible.
- Le partage de coffre n’est pas un cloisonnement par projet ou secret ; aucun lien public protégé ou QR n’est disponible actuellement.
- Le rate limiting applicatif, le cloisonnement RLS, les tests IDOR complets, la rotation après révocation, les sauvegardes chiffrées et l’audit externe ne sont pas encore validés comme exigences de production.

## Mesures opérationnelles requises avant production

1. Revue indépendante des flux de clés et audit cryptographique/application.
2. Tests d’intégration d’autorisation/IDOR pour chaque endpoint et tests de non-fuite en base/logs.
3. Valider CSP, cookies, origines OAuth, rate limiting distribué et alertes.
4. Tester les sauvegardes et une restauration depuis Neon.
5. Revue de dépendances et procédure de réponse aux incidents.

## Divulgation responsable

Ne pas publier d’exploit ni de valeur réelle. Suivre la procédure décrite dans [SECURITY.md](SECURITY.md) et fournir un rapport reproductible sans inclure de secrets.
