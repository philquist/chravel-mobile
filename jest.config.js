module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions: ["ts", "tsx", "js"],
  moduleNameMapper: {
    "^expo-constants$": "<rootDir>/src/__mocks__/expo-constants.ts",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: false }],
  },
  globals: {
    __DEV__: true,
  },
};
