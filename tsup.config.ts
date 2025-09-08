import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],

  // Output formats - support both ESM and CJS for maximum compatibility
  format: ['esm', 'cjs'],

  // TypeScript declaration files
  dts: true,

  // Code splitting for better optimization
  splitting: true,

  // Source maps for debugging
  sourcemap: true,

  // Clean output directory before each build
  clean: true,

  // Target ES2022 to match tsconfig
  target: 'es2022',

  // Minify for production
  minify: process.env.NODE_ENV === 'production',

  // External dependencies - don't bundle production dependencies
  external: [
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {}),
  ],

  // Bundle dev dependencies but exclude Node.js built-ins
  noExternal: [],

  // Use proper extensions for Node.js module resolution
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.mjs',
    };
  },

  // Platform targeting
  platform: 'node',

  // Keep names for better debugging
  keepNames: true,

  // Define environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },

  // Bundle analysis in development
  metafile: process.env.NODE_ENV !== 'production',

  // Watch mode configuration
  watch: process.env.NODE_ENV === 'development',
});
