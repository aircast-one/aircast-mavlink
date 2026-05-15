import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'
import { glob } from 'glob'

// Dialect-level entry points + constants (tree-shakeable individual imports)
const dialectFiles = glob.sync('src/generated/dialects/*/{index,parser,full,messages}.ts')
const constantFiles = glob.sync('src/generated/dialects/*/constants/*.ts')
const entryFiles = [...dialectFiles, ...constantFiles]

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
    input: toEntries(entryFiles),
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

  // Type declarations — message types bundled into messages.d.ts
  {
    input: toEntries(entryFiles),
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: false,
    },
    plugins: [dts()],
  },
]
