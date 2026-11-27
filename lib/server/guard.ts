/** Résultat d'un chargement serveur : distingue une absence de session d'une panne. */
export type ServerData<T> = { ok: true; value: T } | { ok: false }

export async function serverData<T>(load: () => Promise<T>): Promise<ServerData<T>> {
  try {
    return { ok: true, value: await load() }
  } catch {
    return { ok: false }
  }
}
