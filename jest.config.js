module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  projects: [
    {
      displayName: 'contracts',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/contracts/**/*.test.ts'],
      testTimeout: 30000,
      globalSetup: '<rootDir>/test/contracts/globalSetup.ts',
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
      },
    },
    {
      displayName: 'default',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/test/contracts/'],
    },
  ],
};
