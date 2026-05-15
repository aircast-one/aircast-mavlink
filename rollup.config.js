import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'
import { glob } from 'glob'

// Dialect-level entry points + constants (tree-shakeable individual imports)
const dialectFiles = glob.sync('src/generated/dialects/*/{index,parser,full,messages}.ts')
const constantFiles = glob.sync('src/generated/dialects/*/constants/*.ts')
const jsFiles = [...dialectFiles, ...constantFiles]

// All files including individual messages (needed for .d.ts type resolution)
const messageFiles = glob.sync('src/generated/dialects/*/messages/*.ts')
const allFiles = [...jsFiles, ...messageFiles]

function toEntries(files) {
  return files.reduce((acc, file) => {
    const relativePath = file.replace('src/generated/', '').replace('.ts', '')
    acc[relativePath] = file
    return acc
  }, {})
}

export default [
  // JS bundle — messages inlined into dialect files, constants as individual files
  {
    input: toEntries(jsFiles),
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: false,
    },
    plugins: [
      resolve(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
        compilerOptions: {
          module: 'esnext',
        },
      }),
      terser({
        compress: {
          passes: 2,
        },
        mangle: true,
        format: {
          comments: false,
        },
      }),
    ],
  },

  // Type declarations — preserveModules so individual message types resolve
  {
    input: toEntries(allFiles),
    output: {
      dir: 'dist',
      format: 'es',
      entryFileNames: '[name].d.ts',
      preserveModules: true,
      preserveModulesRoot: 'src/generated',
    },
    plugins: [dts()],
  },
]
