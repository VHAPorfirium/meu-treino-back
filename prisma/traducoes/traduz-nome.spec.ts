import { traduzNome } from './traduz-nome';

/**
 * E11 onda 2 — o que estes testes protegem é a REGRA DE QUALIDADE, não a
 * tradução de um nome específico: o glossário vai crescer, e o motor tem que
 * continuar preferindo deixar em inglês a entregar meia tradução.
 */
describe('portão de qualidade', () => {
  it('devolve null quando alguma palavra não está no glossário', () => {
    const r = traduzNome('dumbbell zottman curl on wobble board');
    expect(r.pt).toBeNull();
    // e diz o que faltou — é a lista de trabalho da onda 2
    expect(r.faltando).toEqual(expect.arrayContaining(['zottman', 'wobble']));
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
