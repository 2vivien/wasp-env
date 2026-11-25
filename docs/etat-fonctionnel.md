# État fonctionnel de la révision

Cette page décrit la différence entre le cahier des charges MVP et l’application présente dans ce dépôt. Elle évite de présenter des écrans de démonstration ou des fonctionnalités planifiées comme déjà livrés.

| Domaine | Disponible dans cette révision | À construire / valider |
|---|---|---|
| Connexion | Google, Better Auth, profil par pseudo | Reprise complète d’onboarding, changement de phrase/récupération |
| Coffre | Coffre personnel, chiffrement côté client | Plusieurs coffres, archivage, corbeille, transfert et membres avancés |
| Secrets | Ajout, révélation temporaire, copie, modification, suppression, historique chiffré (50 versions) et restauration d’une ancienne version ; recherche locale dans les noms du coffre ouvert | Recherche globale multi-coffres/projets, catégories, favoris, champs personnalisés, déplacement |
| Projets | Création, renommage, suppression logique | Description/tags, vue kanban, déplacement/copier entre environnements |
| Environnements | Création, renommage, suppression logique, un fichier chiffré par environnement | Variables distinctes, parser/export byte-à-byte exhaustif, comparaison, historique, duplication |
| Partage | Invitation nominative par pseudo au niveau coffre, acceptation/révocation, expiration | Partage projet/secret, permissions atomiques, groupes, liens/QR privés, expiration et révocation des liens |
| Sécurité | Sessions/révocation, journal de quelques mutations, verrouillage client, suppression du compte avec confirmation par e-mail, export de sauvegarde chiffré côté client (Argon2id + AES-256-GCM) | Import/restauration de sauvegarde, réglages complets, rotation de clés après révocation |
| Production | Tests unitaires crypto/dotenv, lint et types | Tests route/DB/E2E/a11y, rate limiting distribué, RLS évaluée, audit indépendant |

Avant d’annoncer une fonction comme terminée, ajouter son interface, endpoint authentifié/autorisé, états d’erreur et tests associés.
