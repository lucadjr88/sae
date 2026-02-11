module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testRegex: '.*\\.test\\.(ts|js)$',
  collectCoverage: false,
};
