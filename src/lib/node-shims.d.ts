// Minimal ambient declarations for the two Node builtins `roblox.ts` uses, so
// `tsc --noEmit` works without `@types/node` fully resolving. When `@types/node`
// is installed these merge harmlessly with the real declarations.
declare module "node:fs" {
    export function readFileSync(path: string | URL, encoding: "utf8"): string
}
declare module "node:url" {
    export function fileURLToPath(url: string | URL): string
}
