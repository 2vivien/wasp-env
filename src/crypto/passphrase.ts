/** Génération et estimation de phrase secrète, uniquement côté navigateur. */

const WORDS = [
  'abricot',
  'acier',
  'album',
  'alpine',
  'ambar',
  'ancre',
  'argile',
  'atlantique',
  'bambou',
  'bascule',
  'baton',
  'beluga',
  'bergamote',
  'bison',
  'brume',
  'cabane',
  'cactus',
  'cadence',
  'canyon',
  'caramel',
  'cedre',
  'cerise',
  'chaland',
  'chevron',
  'cigogne',
  'citron',
  'clairon',
  'coquillage',
  'corail',
  'cyclone',
  'dahlia',
  'dune',
  'eclipse',
  'edelweiss',
  'elephant',
  'erable',
  'escale',
  'faucon',
  'fenetre',
  'flamme',
  'galet',
  'girafe',
  'glacier',
  'gorge',
  'grenade',
  'hamac',
  'harmonie',
  'hibou',
  'horizon',
  'iris',
  'jambe',
  'jonquille',
  'lagune',
  'lampe',
  'lapin',
  'libellule',
  'luciole',
  'magnolia',
  'maison',
  'marmotte',
  'meandre',
  'mistral',
  'morse',
  'murene',
  'narval',
  'nebuleuse',
  'noyer',
  'occean',
  'olive',
  'orage',
  'otarie',
  'papaye',
  'passereau',
  'pelican',
  'piment',
  'pinacle',
  'planete',
  'prairie',
  'quartz',
  'radis',
  'rivage',
  'sagesse',
  'sauge',
  'sequoia',
  'silex',
  'soleil',
  'sorgho',
  'tamis',
  'tangent',
  'tulipe',
  'velours',
  'verveine',
  'voyage',
  'zephyr',
] as const

const WORD_COUNT = 6

type RandomBytes = (length: number) => Uint8Array

function defaultRandom(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/** Six mots tirés avec crypto.getRandomValues ( rejection sampling, sans biais modulo ). */
export function generatePassphrase(random: RandomBytes = defaultRandom): string {
  const chosen: string[] = []
  for (let index = 0; index < WORD_COUNT; index += 1) {
    let word = ''
    while (!word) {
      const [byte] = random(1)
      if (byte === undefined) continue
      // 256 est un multiple de la taille du dictionnaire pour éviter tout biais.
      const bucket = Math.floor(256 / WORDS.length)
      if (byte >= bucket * WORDS.length) continue
      word = WORDS[byte % WORDS.length] ?? ''
    }
    chosen.push(word)
  }
  return chosen.join(' ')
}

export type PassphraseStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: 'Faible' | 'Correcte' | 'Forte'
}

/** Estimation locale : longueur, diversité de caractères et présence de plusieurs mots. */
export function estimatePassphraseStrength(passphrase: string): PassphraseStrength {
  const value = passphrase.normalize('NFKC')
  if (value.length === 0) return { score: 0, label: 'Faible' }

  let score = 0
  if (value.length >= 12) score += 1
  if (value.length >= 20) score += 1
  if (/[a-z]/.test(value) && /[A-Z0-9]/.test(value)) score += 1
  if (value.split(/\s+/).length >= 4 && value.length >= 24) score += 1
  if (/(.)\1{3,}/.test(value) || /1234|abcd|qwerty/i.test(value)) score = Math.min(score, 1)

  const bounded = Math.min(score, 4) as PassphraseStrength['score']
  return {
    score: bounded,
    label: bounded >= 3 ? 'Forte' : bounded >= 2 ? 'Correcte' : 'Faible',
  }
}
