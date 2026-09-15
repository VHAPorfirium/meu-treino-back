import { traduzNome } from './traduz-nome';

/**
 * E11 onda 2 — o que estes testes protegem é a REGRA DE QUALIDADE, não a
 * tradução de um nome específico: o glossário vai crescer, e o motor tem que
 * continuar preferindo deixar em inglês a entregar meia tradução.
 */
describe('portão de qualidade', () => {
  it('devolve null quando alguma palavra não está no glossário', () => {
    // palavra inventada de propósito: o glossário cresce, e este teste protege a
    // REGRA (na dúvida, inglês), não um termo específico que amanhã já existe
    const r = traduzNome('dumbbell flurbwidget curl');
    expect(r.pt).toBeNull();
    expect(r.faltando).toContain('flurbwidget'); // diz o que faltou
  });

  it('devolve null quando não identifica o movimento', () => {
    expect(traduzNome('foo bar baz').pt).toBeNull();
  });
});

describe('ordem do português', () => {
  it('põe o equipamento no FIM, não no começo como no inglês', () => {
    // "dumbbell ..." não pode virar "halteres ..."
    const r = traduzNome('seated dumbbell biceps curl');
    // "biceps curl" é frase conhecida -> "Rosca direta" (como se fala mesmo)
    expect(r.pt).toBe('Rosca direta sentado com halteres');
    expect(r.pt!.startsWith('Rosca')).toBe(true);
  });

  it('frase inteira ganha de palavra solta: "bench press" não é "banco pressão"', () => {
    expect(traduzNome('barbell bench press').pt).toBe('Supino reto com barra');
  });

  it('a frase mais longa ganha da mais curta', () => {
    expect(traduzNome('incline bench press').pt).toBe('Supino inclinado');
  });
});

describe('sem preposição órfã', () => {
  it('não deixa "com" solto quando a palavra seguinte já apareceu', () => {
    // "barbell high bar squat": "na barra" + "com barra" -> o 2º pedaço vira só
    // "com" depois do dedupe e tem que sumir inteiro, não virar frase quebrada
    const pt = traduzNome('barbell high bar squat').pt;
    expect(pt).not.toBeNull();
    expect(pt!.trim()).not.toMatch(/\b(com|na|no|de|em)$/);
  });

  it('nenhum nome traduzido termina em preposição', () => {
    const casos = [
      'dumbbell fly on exercise ball',
      'ez bar french press on exercise ball',
      'barbell high bar squat',
      'cable rope triceps pushdown',
    ];
    for (const c of casos) {
      const pt = traduzNome(c).pt;
      if (pt) expect(pt.trim()).not.toMatch(/\b(com|na|no|de|em|da|do)$/);
    }
  });
});

describe('sem redundância', () => {
  it('não diz "na máquina" quando o núcleo já nomeia o aparelho', () => {
    // "Cadeira extensora" JÁ é a máquina
    expect(traduzNome('lever leg extension').pt).toBe('Cadeira extensora');
  });
});

describe('limpeza', () => {
  it('não repete palavra ("side bend" não vira "Flexão lateral lateral")', () => {
    expect(traduzNome('45° side bend').pt).toBe('Flexão lateral');
  });

  it('ignora ruído do dataset: (male), (female), "v. 3"', () => {
    const a = traduzNome('assisted pull-up (male)').pt;
    const b = traduzNome('assisted pull-up v. 3').pt;
    expect(a).toBe('Barra fixa assistido');
    expect(b).toBe(a);
  });
});
