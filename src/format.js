// Identifier and comment formatting shared by the emitters.

/** Split `user-profile`, `user_profile`, `userProfile` into words. */
export function words(text) {
  return String(text || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

export function pascal(text) {
  const parts = words(text);
  const joined = parts.map((part) => part[0].toUpperCase() + part.slice(1)).join("");
  return joined || "Value";
}

export function camel(text) {
  const value = pascal(text);
  return value[0].toLowerCase() + value.slice(1);
}

export function snake(text) {
  return words(text).map((part) => part.toLowerCase()).join("_") || "value";
}

/** Make a value safe as a Python (or generic) identifier. */
const RESERVED = new Set([
  "class", "def", "from", "import", "return", "pass", "global", "lambda", "None", "True", "False",
  "and", "or", "not", "in", "is", "if", "else", "for", "while", "with", "as", "try", "except",
  "finally", "raise", "yield", "del", "assert", "break", "continue", "async", "await", "nonlocal",
]);

export function safePythonName(text) {
  const name = snake(text);
  if (!/^[a-z_]/.test(name)) return `field_${name}`;
  return RESERVED.has(name) ? `${name}_` : name;
}

/** Make a value safe as a TypeScript property when it is quoted. */
export function isIdentifier(text) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text);
}

/** Quote a JSON property name unless it is already a valid identifier. */
export function propertyKey(text) {
  return isIdentifier(text) ? text : JSON.stringify(text);
}

/** Wrap a description as `//` comment lines, at a sensible width. */
export function lineComments(text, indent = 0) {
  if (!text) return [];
  const prefix = " ".repeat(indent) + "// ";
  const width = Math.max(30, 96 - prefix.length);
  const out = [];
  let line = "";
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(prefix + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(prefix + line);
  return out;
}

/** Escape text for the demo's code viewer. */
export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
