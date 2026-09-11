/**
 * How the project functions reach files.
 *
 * The default reads the disk. A language server passes its own, so an open,
 * unsaved document is read in preference to the disk and every read can be
 * recorded — which is what lets it tell when a config, a type library or a
 * sourcemap changed under a cached result.
 */
import { readFileSync, statSync } from "node:fs"

export interface ProjectHost {
    /** A file's text, or `undefined` when there is no such file. */
    readFile(path: string): string | undefined
}

export const nodeHost: ProjectHost = {
    readFile(path) {
        try {
            return statSync(path).isFile() ? readFileSync(path, "utf8") : undefined
        } catch {
            return undefined
        }
    },
}
