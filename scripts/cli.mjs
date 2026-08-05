#!/usr/bin/env node
// TypeForge CLI — generate models from a JSON Schema file.
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { codegen, LANGUAGES } from "../src/index.js";

const USAGE = `typeforge — JSON Schema to TypeScript, Zod, Python and Go

Usage
  typeforge <schema.json> [--lang typescript|zod|python|go] [--out file]
  typeforge <schema.json> --all

Options
  --lang, -l    Output language (default: typescript)
  --out, -o     Write to a file instead of stdout
  --all, -a     Print all four outputs, separated by headers
  --help, -h    Show this message

Examples
  typeforge examples/user-profile.json --lang zod
  typeforge examples/user-profile.json --lang go --out models.go
  typeforge examples/user-profile.json --all
`;

function parseArguments(argv) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--all" || argument === "-a") flags.all = true;
    else if (argument === "--help" || argument === "-h") flags.help = true;
    else if (argument === "--lang" || argument === "-l") flags.lang = argv[++index];
    else if (argument === "--out" || argument === "-o") flags.out = argv[++index];
    else if (argument.startsWith("--lang=")) flags.lang = argument.slice(7);
    else if (argument.startsWith("--out=")) flags.out = argument.slice(6);
    else positional.push(argument);
  }
  return { flags, positional };
}

const { flags, positional } = parseArguments(process.argv.slice(2));
if (flags.help || !positional.length) {
  console.log(USAGE);
  process.exit(flags.help ? 0 : 2);
}

const file = positional[0];
let source;
try {
  source = readFileSync(file, "utf8");
} catch {
  console.error(`typeforge: cannot read ${file}`);
  process.exit(2);
}

let result;
try {
  result = codegen(source);
} catch (error) {
  console.error(`typeforge: ${file}: ${error.message}`);
  process.exit(2);
}

if (flags.all) {
  for (const output of result.outputs) {
    console.log(`// ===== ${output.label} (${output.extension}) =====`);
    console.log(output.code.trimEnd(), "\n");
  }
  process.exit(0);
}

const language = LANGUAGES.find((entry) => entry.id === (flags.lang || "typescript"));
if (!language) {
  console.error(`typeforge: unknown language "${flags.lang}". Choose one of: ${LANGUAGES.map((entry) => entry.id).join(", ")}`);
  process.exit(2);
}

const code = result.outputs.find((output) => output.id === language.id).code;
if (flags.out) {
  writeFileSync(flags.out, code);
  console.log(`wrote ${flags.out} (${code.split("\n").length} lines from ${basename(file)})`);
} else {
  process.stdout.write(code);
}
