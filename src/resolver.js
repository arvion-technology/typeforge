// JSON Schema loading and local $ref resolution.
//
// TypeForge only accepts JSON documents. Schemas are usually authored in JSON
// (or generated to JSON), and skipping YAML keeps this project focused on the
// interesting part: the intermediate representation and four emitters.

/** Parse a JSON Schema document from text. */
export function parseSchema(text) {
  if (typeof text !== "string") throw new TypeError("parseSchema expects a string");
  const source = text.trim();
  if (!source) throw new Error("schema is empty");
  let document;
  try {
    document = JSON.parse(source);
  } catch (error) {
    throw new Error(`invalid JSON: ${error.message}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error("a JSON Schema document must be an object");
  }
  return document;
}

/** Resolve a local JSON Pointer. Returns undefined when the target is absent. */
export function resolvePointer(root, pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("#")) {
    throw new Error(`remote $ref "${pointer}" is not supported; inline the schema instead`);
  }
  if (pointer === "#") return root;
  const parts = pointer
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part).replace(/~1/g, "/").replace(/~0/g, "~"));
  let node = root;
  for (const part of parts) {
    if (node === null || typeof node !== "object" || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

/** A schema title or definition key turned into a stable name. */
export function nameFromPointer(pointer) {
  const parts = pointer.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Root";
}

/**
 * Build a resolver over a document. `deref` follows a `$ref` chain and returns
 * the target plus the pointer that named it; the IR needs both.
 */
export function createResolver(root) {
  return {
    root,
    pointer(pointer) {
      const target = resolvePointer(root, pointer);
      if (target === undefined) throw new Error(`unresolved $ref "${pointer}"`);
      return target;
    },
    /** Follow $ref chains: { pointer, schema } or null for a non-ref node. */
    deref(node) {
      let current = node;
      const seen = new Set();
      let pointer = null;
      while (current && typeof current === "object" && typeof current.$ref === "string") {
        if (seen.has(current.$ref)) throw new Error(`circular $ref chain at "${current.$ref}"`);
        seen.add(current.$ref);
        pointer = current.$ref;
        current = this.pointer(current.$ref);
      }
      return current === node ? null : { pointer, schema: current };
    },
  };
}
