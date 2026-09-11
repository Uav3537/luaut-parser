/**
 * Projects: `luaut.config.json`, the type libraries it names, import paths,
 * and a sourcemap's instance tree. Node-only (it reads files), and separate
 * from the parsing and analysis, which never touch the file system.
 */
export { nodeHost, type ProjectHost } from "./host"
export {
    CONFIG_FILE_NAMES, findConfig, loadConfig, stripJsonComments,
    type LuautConfig, type ConfigProblem, type ConfigLookup,
} from "./config"
export { resolveTypeLibraries, type TypeLibraries } from "./libraries"
export { moduleCandidates, resolveModulePath } from "./modules"
export { sourceMapTypes, type SourceMapNode, type SourceMapOptions, type SourceMapTypes } from "./sourcemap"
