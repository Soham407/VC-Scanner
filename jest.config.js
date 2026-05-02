module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.sandcastle/'],
  testPathIgnorePatterns: ['<rootDir>/.sandcastle/', '<rootDir>/supabase/functions/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo|expo-.*|expo-modules-core|expo(nent)?|@expo(nent)?/.*|@expo/vector-icons|react-native-paper|@pchmn/expo-material3-theme|@material/material-color-utilities|@callstack/react-theme-provider)/)'
  ]
};
