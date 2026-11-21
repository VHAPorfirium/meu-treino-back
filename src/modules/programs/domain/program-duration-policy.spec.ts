import { ProgramType } from '@prisma/client';
import { InvalidProgramDurationError, ProgramDurationPolicy } from './program-duration-policy';

describe('ProgramDurationPolicy', () => {
  describe('validate', () => {
    it('aceita treino contínuo sem duração', () => {
      expect(() => ProgramDurationPolicy.validate({ programType: ProgramType.CONTINUOUS })).not.toThrow();
    });

    it('recusa treino contínuo com duração', () => {
      expect(() =>
        ProgramDurationPolicy.validate({ programType: ProgramType.CONTINUOUS, targetDays: 30 }),
      ).toThrow(InvalidProgramDurationError);
    });

    it('exige semanas no mesociclo e recusa dias', () => {
      expect(() => ProgramDurationPolicy.validate({ programType: ProgramType.MESOCYCLE })).toThrow();
      expect(() =>
        ProgramDurationPolicy.validate({ programType: ProgramType.MESOCYCLE, targetWeeks: 4, targetDays: 30 }),
      ).toThrow();
      expect(() =>
        ProgramDurationPolicy.validate({ programType: ProgramType.MESOCYCLE, targetWeeks: 4 }),
      ).not.toThrow();
    });

    it('exige dias no desafio e recusa semanas', () => {
      expect(() => ProgramDurationPolicy.validate({ programType: ProgramType.CHALLENGE, targetDays: 0 })).toThrow();
      expect(() =>
        ProgramDurationPolicy.validate({ programType: ProgramType.CHALLENGE, targetWeeks: 4 }),
      ).toThrow();
      expect(() =>
        ProgramDurationPolicy.validate({ programType: ProgramType.CHALLENGE, targetDays: 30 }),
      ).not.toThrow();
    });
  });

  it('só o treino contínuo não tem prazo', () => {
    expect(ProgramDurationPolicy.hasDeadline(ProgramType.CONTINUOUS)).toBe(false);
    expect(ProgramDurationPolicy.hasDeadline(ProgramType.MESOCYCLE)).toBe(true);
    expect(ProgramDurationPolicy.hasDeadline(ProgramType.CHALLENGE)).toBe(true);
  });

  it('calcula o total de dias de cada tipo', () => {
    expect(ProgramDurationPolicy.calculateTotalDays({ programType: ProgramType.CONTINUOUS })).toBeNull();
    expect(
      ProgramDurationPolicy.calculateTotalDays({ programType: ProgramType.MESOCYCLE, targetWeeks: 4 }),
    ).toBe(28);
    expect(
      ProgramDurationPolicy.calculateTotalDays({ programType: ProgramType.CHALLENGE, targetDays: 30 }),
    ).toBe(30);
  });
});
