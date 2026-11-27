/** Vérification explicite de l'e-mail Google avant tout accès applicatif. */
export function hasVerifiedEmail(
  user: { emailVerified?: boolean | null } | null | undefined,
): boolean {
  return user?.emailVerified === true
}
