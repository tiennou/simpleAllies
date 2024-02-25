import { JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    modulePaths: ['src'],
    setupFiles: ['./tests/setup.ts'],
};

export default config;
