import { calculateLoadEvolutionPercentage } from './load-evolution-calculator';

describe('calculateLoadEvolutionPercentage', () => {
  it('faz a média da evolução entre a primeira e a última carga de cada exercício', () => {
    const evolution = calculateLoadEvolutionPercentage([
      { exerciseLoads: [{ exerciseId: 'agachamento', load: 50 }, { exerciseId: 'supino', load: 20 }] },
      { exerciseLoads: [{ exerciseId: 'agachamento', load: 55 }] },
      { exerciseLoads: [{ exerciseId: 'agachamento', load: 60 }, { exerciseId: 'supino', load: 22 }] },
    ]);
    // agachamento +20%, supino +10% → média 15%
    expect(evolution).toBe(15);
  });

  it('ignora exercícios com um único registro ou sem carga', () => {
    expect(
      calculateLoadEvolutionPercentage([
        { exerciseLoads: [{ exerciseId: 'prancha', load: 0 }, { exerciseId: 'remada', load: 30 }] },
      ]),
    ).toBeNull();
  });
});
