# Guide utilisateur — Wasp

Wasp conserve des secrets chiffrés dans le navigateur avant leur envoi. Le compte Google authentifie l’utilisateur ; il ne déverrouille pas le contenu du coffre.

## Connexion et première configuration

1. Ouvrir l’application et choisir **Continuer avec Google**.
2. Choisir un pseudo public unique. L’adresse Google ne sert pas d’identifiant de partage.
3. Créer un coffre avec une phrase secrète et conserver hors ligne la clé de récupération affichée une seule fois.
4. Déverrouiller le coffre avec la phrase secrète. La clé reste en mémoire dans l’onglet ; verrouiller le coffre ou se déconnecter quand l’appareil n’est plus utilisé.

La perte simultanée de la phrase secrète et de la clé de récupération rend les données chiffrées irrécupérables.

## Secrets et fichiers `.env`

- Ajouter un secret en choisissant un nom et une valeur. Les valeurs sont chiffrées dans le navigateur et masquées par défaut.
- Révéler une valeur seulement lorsque nécessaire ; la révélation automatique est limitée dans le temps.
- Importer un fichier `.env` depuis le coffre. L’aperçu indique les variables reconnues, les doublons et les lignes à vérifier, sans envoyer le texte en clair.
- Exporter un fichier ENV uniquement si un fichier local en clair est nécessaire. Un téléchargement contient des valeurs en clair ; protéger et supprimer ce fichier après usage.
- Les commentaires, les lignes vides et l’ordre des lignes sont conservés dans le fichier importé.

## Projets et environnements

Créer un projet depuis **Projets**, puis ajouter un ou plusieurs environnements. Le nom de projet et les noms d’environnements sont chiffrés côté navigateur. Ils peuvent être déchiffrés pour consultation, renommés et supprimés depuis la liste des projets. Une suppression est logique et masque aussi les environnements du projet.

## Partage d’un coffre

1. Configurer les clés de partage dans **Sécurité** si cela n’a pas déjà été fait.
2. Dans le coffre, saisir le pseudo du destinataire et choisir lecture ou lecture-écriture.
3. Le destinataire accepte l’invitation dans **Partagés**, puis déverrouille sa clé de partage.
4. Révoquer l’accès dans le coffre si nécessaire.

Le partage actuel porte sur un coffre entier. La révocation ne peut pas effacer une valeur déjà vue ou copiée par un autre membre ; régénérer aussi les secrets concernés chez leur fournisseur.

## Sessions et activité

La page **Sécurité** liste les sessions, permet de révoquer une session ou toutes les autres et affiche le journal d’activité sans valeur secrète. La révocation supprime l’accès futur à la session choisie.

## Limites actuelles

Cette version ne comprend pas encore les liens privés/QR, les groupes, la recherche globale, les catégories avancées, l’historique/restauration des versions de secrets, la rotation automatique des clés, la corbeille restaurable, la suppression de compte ni l’export de sauvegarde chiffrée. Le détail des fonctions disponibles et les limites de sécurité sont dans le [README](../README.md) et le [modèle de menace](../THREAT_MODEL.md).
