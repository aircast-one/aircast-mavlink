import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'
import { glob } from 'glob'

// Get all dialect entry points and all message/constant modules
const dialectFiles = glob.sync('src/generated/dialects/*/{index,parser,full,messages}.ts')
const messageFiles = glob.sync('src/generated/dialects/*/messages/*.ts')
const constantFiles = glob.sync('src/generated/dialects/*/constants/*.ts')
const allFiles = [...dialectFiles, ...messageFiles, ...constantFiles]

const dialectEntries = allFiles.reduce((acc, file) => {
  // Convert src/generated/dialects/common/index.ts -> dialects/common/index
  // Convert src/generated/dialects/common/parser.ts -> dialects/common/parser
  // Convert src/generated/dialects/common/messages/heartbeat.ts -> dialects/common/messages/heartbeat
  const relativePath = file.replace('src/generated/', '').replace('.ts', '')
  acc[relativePath] = file
  return acc
}, {})

export default [
  // Tree-shakeable dialect modules
  {
    input: dialectEntries,
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
      entryFileNames: '[name].js',
      preserveModules: true,
      preserveModulesRoot: 'src/generated',
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

  // Type declarations
  {
    input: dialectEntries,
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
