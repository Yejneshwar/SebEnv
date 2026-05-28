import { defineConfig } from 'rolldown';

export default defineConfig({
  input: 'index.js',
  
  // Tell Rolldown NOT to bundle these into your final code
  external: ['node:fs', 'node:path', 'node:url', 'inquirer', 'dotenv'], 
  
  output: [
    {
      file: 'dist/index.cjs',
      format: 'cjs',
    },
    {
      file: 'dist/index.mjs',
      format: 'esm',
    },
  ],
});