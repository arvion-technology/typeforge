// Public entry point: schema text or object -> IR -> one of four emitters.
import { parseSchema } from "./resolver.js";
import { buildIR, irStats } from "./ir.js";
import { emitTypeScript } from "./emit/typescript.js";
import { emitZod } from "./emit/zod.js";
import { emitPython } from "./emit/python.js";
import { emitGo } from "./emit/go.js";

export const LANGUAGES = [
  { id: "typescript", label: "TypeScript", extension: "ts", emit: emitTypeScript },
  { id: "zod", label: "Zod", extension: "ts", emit: emitZod },
  { id: "python", label: "Python", extension: "py", emit: emitPython },
  { id: "go", label: "Go", extension: "go", emit: emitGo },
];

export function languageById(id) {
  return LANGUAGES.find((language) => language.id === id) || LANGUAGES[0];
}

/** Generate one language's code from a schema object. */
export function generate(schema, language = "typescript") {
  const ir = schema && schema.root ? schema : buildIR(schema);
  return languageById(language).emit(ir);
}

/**
 * Generate all four outputs plus the IR statistics the demo displays.
 * @param {object|string} source parsed schema or schema text
 */
export function codegen(source) {
  const schema = typeof source === "string" ? parseSchema(source) : source;
  const ir = buildIR(schema);
  return {
    ir,
    stats: irStats(ir),
    outputs: LANGUAGES.map((language) => ({
      id: language.id,
      label: language.label,
      extension: language.extension,
      code: language.emit(ir),
    })),
  };
}

export { buildIR, irStats } from "./ir.js";
export { parseSchema } from "./resolver.js";
