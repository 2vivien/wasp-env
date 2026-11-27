type RotationJobState = { fromVersion: number; status: string }

/** Nombre d'objets rechiffrés par une rotation de projet (projet + environnements + fichiers ENV). */
export function rotationTargetCount(input: { environments: number; envFiles: number }): number {
  return 1 + input.environments + input.envFiles
}

/** Un job en attente dont la version d'origine correspond peut être finalisé. */
export function canCompleteRotation(
  job: RotationJobState | undefined,
  expectedVersion: number,
): boolean {
  return Boolean(job && job.status !== 'completed' && job.fromVersion === expectedVersion)
}
