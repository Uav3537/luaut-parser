import { readFileSync } from "node:fs"
import { parse } from "@ast/builders"

const LITERAL = String.raw`"(?:[^"\\n]|\.)*"`
const ELEMENT = String.raw`(?:${LITERAL}|\`(?:[^\`\$]|\.)*\`)`
const ARRAY = new RegExp(String.raw`\[\s*(?:${ELEMENT},?\s*)+\]\.join\("\n"\)`, "g")
const TEMPLATE = /`(?:[^`\$]|\.)*`/g
const STRING = new RegExp(LITERAL, "g")

function decode(literal: string): string | undefined {
    try {
        return JSON.parse(literal.startsWith("`")
            ? `"${literal.slice(1, -1).replace(/"/g, '\\"')}"`
            : literal) as string
    } catch { return undefined }
}

for (const file of process.argv.slice(2)) {
    const text = readFileSync(file, "utf8")
    const lineOf = (index: number): number => text.slice(0, index).split("\n").length
    const seen = new Set<number>()
    const report = (source: string, index: number): void => {
        if (source.includes("```") || !/\b(end|then)\b/.test(source)) return
        try { parse(source); return } catch { /* falls through */ }
        const line = lineOf(index)
        if (seen.has(line)) return
        seen.add(line)
        console.log(`${file}:${line}  ${source.split("\n")[0].slice(0, 60)}`)
    }
    for (const m of text.matchAll(ARRAY)) {
        const parts = m[0].match(new RegExp(ELEMENT, "g")) ?? []
        const lines = parts.map(decode)
        if (lines.every(l => l !== undefined)) report((lines as string[]).join("\n"), m.index!)
    }
    for (const m of text.matchAll(TEMPLATE)) { const v = decode(m[0]); if (v) report(v, m.index!) }
    for (const m of text.matchAll(STRING)) { const v = decode(m[0]); if (v) report(v, m.index!) }
}
