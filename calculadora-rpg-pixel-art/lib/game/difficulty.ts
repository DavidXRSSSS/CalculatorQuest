export interface DifficultyProfile {
  currentNumber: number
  milestone: number
  score: number
  projectileSpeed: number
  spawnRate: number
  baseDifficulty: number
  multiplier: number
  attackSpeed: number
  attackFrequency: number
  patternComplexity: number
  comboLength: number
  warningTime: number
  safeSpace: number
  specialAttackChance: number
  telekinesisChance: number
  arenaPressure: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const MILESTONES = [1, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 8000, 9000] as const

export function getDifficultyMilestone(currentNumber: number) {
  const value = Math.max(1, Math.min(9999, Math.floor(Math.abs(currentNumber))))
  let milestone = 1
  for (const point of MILESTONES) if (value >= point) milestone = point
  return milestone
}

/** 0: principiante (1-14) · 1: intermedio (15-99) · 2: avanzado (100-499) · 3: experto (500-9999) */
export function getDifficultyBand(currentNumber: number) {
  const value = Math.abs(currentNumber)
  if (value < 15) return 0
  if (value < 100) return 1
  if (value < 500) return 2
  return 3
}

export function createDifficultyProfile(operands: number[]): DifficultyProfile {
  const relevant = operands.filter(Number.isFinite).map(Math.abs)
  const maxRelevant = Math.max(0, ...relevant)
  const currentNumber = Math.max(1, Math.min(9999, Math.round(maxRelevant)))
  const milestone = getDifficultyMilestone(currentNumber)
  const average = relevant.length ? relevant.reduce((sum, value) => sum + value, 0) / relevant.length : 0
  const score = clamp((currentNumber * 0.68 + average * 0.32) / 9999, 0, 1)
  const intensity = Math.min(1, Math.log10(currentNumber + 9) / 4)
  const baseDifficulty = 1 + intensity * 5
  return {
    currentNumber,
    milestone,
    score,
    projectileSpeed: 170 + currentNumber * 0.045,
    spawnRate: Math.max(0.06, 0.62 - currentNumber * 0.000045),
    baseDifficulty,
    multiplier: 1,
    attackSpeed: 0.86 + score * 0.56,
    attackFrequency: 0.78 + score * 0.7,
    patternComplexity: 0.25 + score * 0.75,
    comboLength: 1 + Math.floor(score * 3),
    warningTime: 1.12 - score * 0.34,
    safeSpace: 1 - score * 0.24,
    specialAttackChance: 0.12 + score * 0.58,
    telekinesisChance: score * 0.55,
    arenaPressure: 0.18 + score * 0.7,
  }
}

export function scaleDifficulty(profile: DifficultyProfile, phase: number, multiplier = 1) {
  const phaseMultiplier = phase === 1 ? 1 : phase === 2 ? 1.45 : phase === 3 ? 2 : 3.2
  const total = profile.baseDifficulty * phaseMultiplier * multiplier
  return {
    ...profile,
    multiplier: total / profile.baseDifficulty,
    // Fase 3 applies the requested x2 pressure over the Phase 2 baseline through attack composition below.
    attackSpeed: profile.attackSpeed * (0.92 + total * 0.075),
    attackFrequency: profile.attackFrequency * (0.88 + total * 0.085),
    patternComplexity: clamp(profile.patternComplexity + (total - 1) * 0.12, 0.2, 1.8),
    comboLength: Math.min(6, profile.comboLength + Math.floor((total - 1) / 2)),
    warningTime: phase === 2 ? 0.7 : clamp(profile.warningTime - (total - 1) * 0.025, 0.52, 1.2),
    safeSpace: clamp(profile.safeSpace - (total - 1) * 0.025, 0.56, 1),
    specialAttackChance: clamp(profile.specialAttackChance + (total - 1) * 0.045, 0.1, 0.98),
    telekinesisChance: clamp(profile.telekinesisChance + (total - 1) * 0.04, 0, 1),
    arenaPressure: clamp(profile.arenaPressure + (total - 1) * 0.06, 0.1, 1.8),
  }
}

export function isPhase4Eligible(operands: number[]) {
  return operands.filter((value) => Number.isInteger(value) && value >= 50).length >= 2
}
