# Guide utilisateur — Wasp

Wasp conserve des secrets chiffrés dans le navigateur avant leur envoi. Le compte Google authentifie l’utilisateur ; il ne déverrouille pas le contenu du coffre.

## Connexion et première configuration

1. Ouvrir l’application et choisir **Continuer avec Google**.
2. Choisir un pseudo public unique. L’adresse Google ne sert pas d’identifiant de partage.
3. Créer un coffre avec une phrase secrète : vous pouvez la saisir vous-même ou utiliser « Générer une phrase forte », qui la tire dans votre navigateur sans l'envoyer à Wasp. Conserver hors ligne la clé de récupération affichée une seule fois.
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

## Partages à portée limitée

1. Configurer les clés de partage dans **Sécurité** pour les personnes destinataires.
2. Depuis un secret ou un projet, choisir un pseudo ou un groupe. Un partage de secret donne un accès en lecture seule à la valeur actuelle de ce secret. Un partage de projet donne un accès en lecture seule aux noms du projet, à ses environnements et à leurs fichiers `.env` chiffrés (maximum 20 environnements).
3. Les invitations ciblées expirent après 30 jours. Les membres actuels du groupe reçoivent chacun une enveloppe chiffrée; un nouveau membre doit être invité à nouveau. Le destinataire accepte puis déverrouille ses clés de partage dans **Partagés**.
4. Les liens privés et leurs codes QR sont disponibles pour un secret. La clé est dans le fragment de l’URL, jamais envoyée au serveur; le lien expire après 7 jours et est limité à 20 ouvertures. Vous pouvez protéger le lien par un code d’au moins 12 caractères; l’empreinte est hachée avec scrypt et les essais sont limités (5 par adresse IP et par minute, 30 par lien et par minute). Communiquez le code par un canal distinct. Une ouverture n’est comptée qu’après l’action explicite « Ouvrir ». L’expéditeur peut révoquer le lien depuis la liste des secrets ou **Sécurité**.
5. Révoquer un accès bloque les consultations futures, mais ne peut pas effacer les valeurs déjà vues, copiées ou téléchargées. Après révocation d’un partage de secret, utilisez **Renouveler la clé** et remplacez également l’identifiant chez son fournisseur. Pour un projet, renouvelez manuellement les identifiants de ses fichiers `.env`.

Le partage coffre préexistant reste distinct et porte sur l’ensemble du coffre. Les partages ciblés ne transmettent pas la clé maîtresse du coffre.

## Sessions et activité

La page **Sécurité** liste les sessions, permet de révoquer une session ou toutes les autres et affiche le journal d’activité sans valeur secrète. La révocation supprime l’accès futur à la session choisie.

## Limites actuelles

Les clés de partage de projet sont dérivées dans le navigateur; la rotation de projet après révocation n’est pas automatisée. La rotation d’un secret invalide ses anciennes enveloppes et rechiffre son historique, mais une personne ayant déjà vu une valeur ne peut pas être désapprise. Les liens privés ne s’appliquent qu’aux secrets. Le code des liens est limité par Redis; les autres endpoints ne disposent pas encore d’un rate limiting distribué général. Il n’y a pas encore de recherche globale, catégories avancées, corbeille restaurable ni suppression de compte vérifiée par audit. Les flux et permissions nécessitent encore une suite d’intégration/IDOR complète, une revue et un audit indépendant. Le détail est dans le [README](../README.md) et le [modèle de menace](../THREAT_MODEL.md).
