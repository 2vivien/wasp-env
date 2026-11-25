# État fonctionnel de la révision

Cette page décrit la différence entre le cahier des charges MVP et l’application présente dans ce dépôt. Elle évite de présenter des écrans de démonstration ou des fonctionnalités planifiées comme déjà livrés.

| Domaine | Disponible dans cette révision | À construire / valider |
|---|---|---|
| Connexion | Google, Better Auth, profil par pseudo | Reprise complète d’onboarding, changement de phrase/récupération |
| Coffre | Coffre personnel, chiffrement côté client | Plusieurs coffres, archivage, corbeille, transfert et membres avancés |
| Secrets | Ajout, révélation temporaire, copie, modification, suppression, historique chiffré (50 versions) et restauration d’une ancienne version ; recherche locale dans les noms du coffre ouvert | Recherche globale multi-coffres/projets, catégories, favoris, champs personnalisés, déplacement |
| Projets | Création, renommage, suppression logique | Description/tags, vue kanban, déplacement/copier entre environnements |
| Environnements | Création, renommage, suppression logique, un fichier chiffré par environnement | Variables distinctes, parser/export byte-à-byte exhaustif, comparaison, historique, duplication |
| Partage | Invitation nominative au niveau coffre; partage lecture seule d’un secret ou projet par pseudo ou vers les membres actuels d’un groupe; liens privés + QR pour un secret; expiration, acceptation et révocation | Nouveaux membres d’un groupe à réinviter; rotation d’un projet après révocation; audit externe |
| Sécurité | Sessions/révocation, journal d’activité, verrouillage client, export chiffré, import/restauration non destructive, migration des clés aléatoires de secrets, rotation d’un secret et de son historique | Rotation des clés de projets après révocation, reprise UI de rotation complète, vérification d’accès/code rate-limit distribué |
| Production | Tests unitaires crypto, typecheck, lint et build; routes authentifiées, états d’erreur, chiffrement client | Tests d’intégration DB/IDOR/E2E/a11y, rate limiting distribué, revue RLS, audit indépendant |

Avant d’annoncer une fonction comme terminée, ajouter son interface, endpoint authentifié/autorisé, états d’erreur et tests associés.
