export const APP_ERROR_CODES = [
  'AUTH_REQUIRED',
  'VAULT_LOCKED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'RATE_LIMITED',
  'CRYPTO_FAILURE',
  'INTERNAL',
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

const GENERIC_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Connexion requise.',
  VAULT_LOCKED: 'Déverrouillez le coffre pour continuer.',
  FORBIDDEN: 'Accès refusé.',
  NOT_FOUND: 'Ressource introuvable.',
  CONFLICT: 'La ressource a changé. Rechargez puis réessayez.',
  VALIDATION: 'Données invalides.',
  RATE_LIMITED: 'Trop de requêtes. Réessayez plus tard.',
  CRYPTO_FAILURE: 'Impossible de déchiffrer. Vérifiez que le coffre est déverrouillé.',
  INTERNAL: 'Une erreur est survenue.',
  INVALID_REQUEST: 'Requête invalide.',
  PAYLOAD_TOO_LARGE: 'Données trop volumineuses.',
  CURRENT_SESSION: 'La session actuelle ne peut pas être révoquée ici.',
  ALREADY_EXISTS: 'Cette ressource existe déjà.',
  HANDLE_LOCKED: 'Ce pseudo ne peut plus être modifié.',
  HANDLE_TAKEN: 'Ce pseudo est déjà utilisé.',
  RECIPIENT_NOT_FOUND: 'Destinataire introuvable.',
  SHARE_ALREADY_EXISTS: 'Ce partage existe déjà.',
  ENVIRONMENT_LIMIT: 'Nombre maximal d’environnements atteint.',
  GROUP_LIMIT: 'Nombre maximal de groupes atteint.',
  MEMBER_LIMIT: 'Nombre maximal de membres atteint.',
  INVALID_HANDLE: 'Pseudo invalide.',
  USER_NOT_FOUND: 'Utilisateur introuvable.',
  SELF_MEMBER: 'Vous ne pouvez pas vous ajouter vous-même.',
  SELF_SHARE: 'Vous ne pouvez pas partager avec vous-même.',
  RECIPIENT_KEYS_UNAVAILABLE: 'Les clés du destinataire sont indisponibles.',
  STALE_SCOPE_KEY: 'La clé de partage n’est plus à jour.',
  PROJECT_SCOPE_LIMIT: 'Ce projet dépasse la limite de partage.',
  INVALID_EXPIRATION: 'Date d’expiration invalide.',
  NOT_FOUND_OR_EXPIRED: 'Invitation introuvable ou expirée.',
  GROUP_MEMBER_REQUIRED: 'Le destinataire doit appartenir au groupe.',
  SCOPE_TOO_LARGE: 'Périmètre de partage trop volumineux.',
  BACKUP_ACCOUNT_MISMATCH: 'Cette sauvegarde appartient à un autre compte.',
  LINK_UNAVAILABLE: 'Ce lien n’est plus valide.',
  INVALID_ACCESS_CODE: 'Code d’accès incorrect.',
  TOO_MANY_ATTEMPTS: 'Trop de tentatives. Réessayez plus tard.',
  RATE_LIMIT_UNAVAILABLE: 'La vérification est temporairement indisponible.',
  CONFIRMATION_REQUIRED: 'Confirmation requise.',
  OWNER_NOT_FOUND: 'Propriétaire introuvable.',
  PROFILE_REQUIRED: 'Profil requis.',
  VAULT_EXISTS: 'Un coffre personnel existe déjà.',
  VAULT_SHARE_NOT_FOUND: 'Partage introuvable.',
  CURRENT_SESSION_REQUIRED: 'Session actuelle requise.',
  UNSUPPORTED_FORMAT: 'Format non pris en charge.',
}

export function genericErrorMessage(code: string): string {
  return GENERIC_MESSAGES[code] ?? 'Action impossible. Réessayez.'
}

export class AppError extends Error {
  readonly code: string
  readonly httpStatus: number

  constructor(code: string, httpStatus: number, message = genericErrorMessage(code)) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.httpStatus = httpStatus
  }
}
