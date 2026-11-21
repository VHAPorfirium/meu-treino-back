import { ProgramType } from '@prisma/client';

export interface ProgramDurationInput {
  programType: ProgramType;
  targetWeeks?: number | null;
  targetDays?: number | null;
}

export class InvalidProgramDurationError extends Error {}

const DAYS_PER_WEEK = 7;

/**
 * Regra única de "o que cada tipo de programa exige". Criação, progresso e
 * conclusão usam esta mesma classe, então nenhum outro lugar precisa saber
 * que um desafio é medido em dias e um mesociclo em semanas.
 */
export class ProgramDurationPolicy {
  static validate(durationInput: ProgramDurationInput): void {
    const { programType, targetWeeks, targetDays } = durationInput;

    const rulesByProgramType: Record<ProgramType, () => void> = {
      CONTINUOUS: () => {
        if (targetWeeks || targetDays) {
          throw new InvalidProgramDurationError('Treino contínuo não possui duração.');
        }
      },
      MESOCYCLE: () => {
        if (!targetWeeks || targetWeeks < 1 || targetDays) {
          throw new InvalidProgramDurationError('Mesociclo exige apenas a duração em semanas.');
        }
      },
      CHALLENGE: () => {
        if (!targetDays || targetDays < 1 || targetWeeks) {
          throw new InvalidProgramDurationError('Desafio exige apenas a duração em dias.');
        }
      },
    };

    rulesByProgramType[programType]();
  }

  static hasDeadline(programType: ProgramType): boolean {
    return programType !== ProgramType.CONTINUOUS;
  }

  /** Total de dias da jornada; `null` para o treino contínuo, que não termina. */
  static calculateTotalDays(durationInput: ProgramDurationInput): number | null {
    if (durationInput.programType === ProgramType.CHALLENGE) {
      return durationInput.targetDays ?? null;
    }
    if (durationInput.programType === ProgramType.MESOCYCLE) {
      return durationInput.targetWeeks ? durationInput.targetWeeks * DAYS_PER_WEEK : null;
    }
    return null;
  }
}
