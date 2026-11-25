# État fonctionnel de la révision

Cette page décrit la différence entre le cahier des charges MVP et l’application présente dans ce dépôt. Elle évite de présenter des écrans de démonstration ou des fonctionnalités planifiées comme déjà livrés.

| Domaine | Disponible dans cette révision | À construire / valider |
|---|---|---|
| Connexion | Google, Better Auth, profil par pseudo | Reprise complète d’onboarding, changement de phrase/récupération |
| Coffre | Coffre personnel, chiffrement côté client | Plusieurs coffres, archivage, corbeille, transfert et membres avancés |
| Secrets | Ajout, révélation temporaire, copie, modification, suppression | Catégories, favoris, champs personnalisés, versions/restauration, recherche, déplacement |
| Projets | Création, renommage, suppression logique | Description/tags, vue kanban, déplacement/copier entre environnements |
| Environnements | Création, renommage, suppression logique, un fichier chiffré par environnement | Variables distinctes, parser/export byte-à-byte exhaustif, comparaison, historique, duplication |
| Partage | Invitation nominative par pseudo au niveau coffre, acceptation/révocation | Partage projet/secret, permissions atomiques, groupes, liens/QR, expiration et rotation |
| Sécurité | Sessions/révocation, journal de quelques mutations, verrouillage client | Réglages complets, suppression de compte, sauvegarde chiffrée, rotation après révocation |
| Production | Tests unitaires crypto/dotenv, lint et types | Tests route/DB/E2E/a11y, rate limiting distribué, RLS évaluée, audit indépendant |

Avant d’annoncer une fonction comme terminée, ajouter son interface, endpoint authentifié/autorisé, états d’erreur et tests associés.
