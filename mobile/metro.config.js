// Metro config that lets the app import ../core — the TypeScript shared with the
// web and desktop builds.
//
// Two pieces are needed and both are easy to miss:
//   watchFolders     tells Metro that files OUTSIDE mobile/ are part of the
//                    project, so edits to core/ trigger a reload instead of
//                    being silently ignored.
//   nodeModulesPaths keeps resolution anchored to mobile/node_modules. Without
//                    it, a core file importing @supabase/supabase-js resolves
//                    relative to the repo root, where that copy is built for the
//                    web and pulls in browser globals Metro can't polyfill.

const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const repoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [path.resolve(repoRoot, 'core')]

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')]
// Anything resolved from outside mobile/ must still land on mobile's copy.
config.resolver.disableHierarchicalLookup = true

// `@core/x` -> repo-root core/x. Declared here rather than relying on tsconfig
// paths alone: this is what Metro actually resolves with at runtime, while
// tsconfig only satisfies the typechecker. Both are set, and they must agree.
config.resolver.extraNodeModules = {
  '@core': path.resolve(repoRoot, 'core'),
}

module.exports = config
