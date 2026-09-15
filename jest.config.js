/** Frente F — primeiros testes do projeto. Começam pelas duas unidades de maior
 *  risco: a chave do cache (vazamento entre usuários) e o dia local (fuso). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/prisma'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
};
