module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.sandcastle/'],
  testPathIgnorePatterns: ['<rootDir>/.sandcastle/', '<rootDir>/supabase/functions/']
};
