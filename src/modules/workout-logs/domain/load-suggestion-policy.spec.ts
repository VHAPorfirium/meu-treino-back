import { parseTopOfRepRange, suggestNextLoad } from './load-suggestion-policy';

describe('parseTopOfRepRange', () => {
  it('lê faixas e números simples', () => {
    expect(parseTopOfRepRange('10-12')).toBe(12);
    expect(parseTopOfRepRange('10')).toBe(10);
    expect(parseTopOfRepRange('8 a 10')).toBe(10);
    expect(parseTopOfRepRange(null)).toBeNull();
  });
});

describe('suggestNextLoad', () => {
  it('sobe 2,5 kg quando bateu o topo em todas as séries', () => {
    expect(
      suggestNextLoad([{ weight: 40, reps: 12 }, { weight: 40, reps: 12 }], '10-12'),
    ).toEqual({ suggestedWeight: 42.5, suggestionKind: 'increase' });
  });

  it('sobe 1 kg em cargas leves', () => {
    expect(suggestNextLoad([{ weight: 8, reps: 15 }], '12-15').suggestedWeight).toBe(9);
  });

  it('mantém a carga quando alguma série ficou abaixo do topo', () => {
    expect(
      suggestNextLoad([{ weight: 40, reps: 12 }, { weight: 40, reps: 10 }], '10-12'),
    ).toEqual({ suggestedWeight: 40, suggestionKind: 'keep' });
  });

  it('sem carga registrada não sugere nada', () => {
    expect(suggestNextLoad([{ weight: null, reps: 15 }], '15')).toEqual({
      suggestedWeight: null,
      suggestionKind: null,
    });
  });
});
