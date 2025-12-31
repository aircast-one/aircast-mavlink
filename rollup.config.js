import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';
import { glob } from 'glob';


// Get all dialect entry points
const dialectEntries = glob.sync('src/generated/dialects/*/index.ts').reduce((acc, file) => {
  const dialectName = file.split('/')[3]; // Extract dialect name from path
  acc[`dialects/${dialectName}/index`] = file;
  return acc;
}, {});

export default [
  // Individual dialect bundles
  {
    input: dialectEntries,
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
      entryFileNames: '[name].js',
      banner: '// @aircast-4g/mavlink - Dialect bundle\n// Generated from TypeScript sources'
    },
    plugins: [
      resolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        compilerOptions: {
          module: 'esnext'
        }
      }),
      terser({
        compress: {
          passes: 2
        },
        mangle: true,
        format: {
          comments: false
        }
      })
    ]
  },

  // Individual dialect types
  {
    input: dialectEntries,
    output: {
      dir: 'dist',
      format: 'es',
      entryFileNames: '[name].d.ts'
    },
    plugins: [dts()]
  }
];
