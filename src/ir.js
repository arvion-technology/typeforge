// Schema → intermediate representation.
//
// The emitters never read JSON Schema directly. They consume a small, closed
// IR so that all four languages agree on what is optional, nullable, an enum
// or a union. Every node keeps the original property name and description so
// output stays traceable to the contract.
import { createResolver, nameFromPointer } from "./resolver.js";
import { pascal } from "./format.js";

export const KIND = Object.freeze({
  OBJECT: "object",
  ARRAY: "array",
  UNION: "union",
  INTERSECTION: "intersection",
  ENUM: "enum",
  REF: "ref",
  STRING: "string",
  INTEGER: "integer",
  NUMBER: "number",
  BOOLEAN: "boolean",
  NULL: "null",
  ANY: "any",
});

const escapePointer = (segment) => String(segment).replace(/~/g, "~0").replace(/\//g, "~1");

function definitionContainers(schema) {
  const out = [];
  if (schema.definitions) out.push(["#/definitions", schema.definitions]);
  if (schema.$defs) out.push(["#/$defs", schema.$defs]);
  if (schema.components?.schemas) out.push(["#/components/schemas", schema.components.schemas]);
  return out;
}

/**
 * Build the IR for a schema document.
 *
 * @param {object} schema parsed JSON Schema
 * @param {{rootName?: string}} [options]
 */
export function buildIR(schema, { rootName = "Root" } = {}) {
  const resolver = createResolver(schema);
  const names = new Set();
  const refNames = new Map();
  const definitions = new Map();

  function uniqueName(base) {
    const wanted = pascal(base || "Value");
    let candidate = wanted;
    let counter = 2;
    while (names.has(candidate.toLowerCase())) candidate = `${wanted}${counter++}`;
    names.add(candidate.toLowerCase());
    return candidate;
  }

  const rootTypeName = uniqueName(schema.title || rootName);

  function register(pointer, name, target) {
    refNames.set(pointer, name);
    if (!definitions.has(name)) definitions.set(name, { name, schema: target, node: null });
  }

  // Pre-register named definitions so a $ref to one keeps its authored name.
  for (const [prefix, container] of definitionContainers(schema)) {
    for (const [key, target] of Object.entries(container)) {
      register(`${prefix}/${escapePointer(key)}`, uniqueName(key), target);
    }
  }

  const visitedRefs = new Set();
  function collectRefs(node) {
    if (!node || typeof node !== "object") return;
    if (typeof node.$ref === "string" && !visitedRefs.has(node.$ref)) {
      visitedRefs.add(node.$ref);
      const target = resolver.pointer(node.$ref);
      const pointerName = nameFromPointer(node.$ref);
      const name = refNames.get(node.$ref) || uniqueName(pointerName);
      register(node.$ref, name, target);
      collectRefs(target);
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") collectRefs(value);
    }
  }
  collectRefs(schema);

  function buildNode(raw) {
    if (raw === true) return { kind: KIND.ANY };
    if (!raw || typeof raw !== "object") return { kind: KIND.ANY };

    if (typeof raw.$ref === "string") {
      const name = refNames.get(raw.$ref);
      if (!name) throw new Error(`unknown $ref "${raw.$ref}"`);
      return { kind: KIND.REF, name, description: raw.description };
    }

    const types = raw.type ? (Array.isArray(raw.type) ? raw.type : [raw.type]) : [];
    const nullable = raw.nullable === true || types.includes("null");
    const type = types.find((entry) => entry !== "null") || inferType(raw);
    const meta = {};
    if (raw.description) meta.description = raw.description;
    if (raw.deprecated === true) meta.deprecated = true;

    const finish = (node) => {
      Object.assign(node, meta);
      if (nullable) node.nullable = true;
      if (raw.default !== undefined) node.default = raw.default;
      return node;
    };

    if (Array.isArray(raw.enum) && raw.enum.length) {
      return finish({ kind: KIND.ENUM, values: raw.enum.slice() });
    }
    if (raw.const !== undefined) return finish({ kind: KIND.ENUM, values: [raw.const] });

    if (Array.isArray(raw.oneOf) || Array.isArray(raw.anyOf)) {
      const options = (raw.oneOf || raw.anyOf).map((option) => buildNode(option));
      const hasNull = options.some((option) => option.kind === KIND.NULL);
      const variants = options.filter((option) => option.kind !== KIND.NULL);
      return finish({ kind: KIND.UNION, variants, ...(hasNull ? { nullable: true } : {}) });
    }
    if (Array.isArray(raw.allOf)) return finish(buildAllOf(raw));

    if (type === "object" || raw.properties || (raw.additionalProperties && type === undefined)) {
      const required = new Set(Array.isArray(raw.required) ? raw.required : []);
      const properties = Object.entries(raw.properties || {}).map(([name, propertySchema]) => ({
        name,
        required: required.has(name),
        node: buildNode(propertySchema),
        description: propertySchema && propertySchema.description,
        default: propertySchema ? propertySchema.default : undefined,
      }));
      const node = finish({ kind: KIND.OBJECT, properties, closed: raw.additionalProperties === false });
      if (raw.additionalProperties === true) node.open = true;
      else if (raw.additionalProperties && typeof raw.additionalProperties === "object") {
        node.additional = buildNode(raw.additionalProperties);
      }
      // `additionalProperties: {}` means "anything", not "a typed extra field".
      if (node.additional && node.additional.kind === KIND.ANY) {
        node.open = true;
        delete node.additional;
      }
      return node;
    }

    if (type === "array" || raw.items) {
      let items;
      if (Array.isArray(raw.items)) items = { kind: KIND.UNION, variants: raw.items.map((item) => buildNode(item)) };
      else if (raw.items) items = buildNode(raw.items);
      else items = { kind: KIND.ANY };
      const node = finish({ kind: KIND.ARRAY, items });
      if (raw.minItems !== undefined) node.minItems = raw.minItems;
      if (raw.maxItems !== undefined) node.maxItems = raw.maxItems;
      return node;
    }

    if (type === "string") {
      const node = finish({ kind: KIND.STRING });
      if (raw.format) node.format = raw.format;
      if (raw.minLength !== undefined) node.minLength = raw.minLength;
      if (raw.maxLength !== undefined) node.maxLength = raw.maxLength;
      if (raw.pattern !== undefined) node.pattern = raw.pattern;
      return node;
    }
    if (type === "integer") {
      const node = finish({ kind: KIND.INTEGER });
      for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]) {
        if (raw[key] !== undefined) node[key] = raw[key];
      }
      return node;
    }
    if (type === "number") {
      const node = finish({ kind: KIND.NUMBER });
      for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]) {
        if (raw[key] !== undefined) node[key] = raw[key];
      }
      return node;
    }
    if (type === "boolean") return finish({ kind: KIND.BOOLEAN });
    if (type === "null") return finish({ kind: KIND.NULL });
    return finish({ kind: KIND.ANY });
  }

  function buildAllOf(raw) {
    const parts = raw.allOf.map((part) => {
      const deref = resolver.deref(part);
      return deref ? deref.schema : part;
    });
    const objectLike = parts.every((part) =>
      part && typeof part === "object"
      && !part.$ref
      && (part.type === "object" || part.type === undefined)
      && (part.properties !== undefined || part.additionalProperties !== undefined));
    if (!objectLike) {
      return { kind: KIND.INTERSECTION, parts: parts.map((part) => buildNode(part)) };
    }
    const merged = {
      type: "object",
      description: raw.description,
      properties: {},
      required: [],
      additionalProperties: raw.additionalProperties,
    };
    for (const part of [...parts, raw]) {
      Object.assign(merged.properties, part.properties || {});
      merged.required.push(...(part.required || []));
      if (part.additionalProperties !== undefined) merged.additionalProperties = part.additionalProperties;
    }
    merged.required = [...new Set(merged.required)];
    return buildNode(merged);
  }

  // Build the named nodes first so refs resolve to names, not inline copies.
  for (const definition of definitions.values()) {
    definition.node = buildNode(definition.schema);
  }
  const root = buildNode(schema);

  return {
    root,
    rootName: rootTypeName,
    definitions: [...definitions.values()],
    resolver,
  };
}

function inferType(raw) {
  if (raw.properties) return "object";
  if (raw.items) return "array";
  if (raw.pattern || raw.minLength !== undefined || raw.maxLength !== undefined || raw.format) return "string";
  if (raw.minimum !== undefined || raw.maximum !== undefined) return "number";
  return "any";
}

/** Every ref name reachable from a node. */
export function collectRefs(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (node.kind === KIND.REF) out.add(node.name);
  if (Array.isArray(node.variants)) node.variants.forEach((variant) => collectRefs(variant, out));
  if (Array.isArray(node.parts)) node.parts.forEach((part) => collectRefs(part, out));
  if (node.kind === KIND.ARRAY) collectRefs(node.items, out);
  if (node.kind === KIND.OBJECT) {
    node.properties.forEach((property) => collectRefs(property.node, out));
    if (node.additional) collectRefs(node.additional, out);
  }
  return out;
}

/**
 * Definitions in dependency order: a definition is emitted after the
 * definitions it references. Cycles keep their authored order.
 */
export function orderedDefinitions(ir) {
  const byName = new Map(ir.definitions.map((definition) => [definition.name, definition]));
  const state = new Map();
  const order = [];
  const visit = (name) => {
    if (!byName.has(name) || state.get(name) === 2 || state.get(name) === 1) return;
    state.set(name, 1);
    for (const dependency of collectRefs(byName.get(name).node)) visit(dependency);
    state.set(name, 2);
    order.push(byName.get(name));
  };
  for (const definition of ir.definitions) visit(definition.name);
  return order;
}

/** Counts shown above the demo code panel. */
export function irStats(ir) {
  let fields = 0;
  let references = 0;
  let depth = 0;
  const walk = (node, level) => {
    depth = Math.max(depth, level);
    if (!node || typeof node !== "object") return;
    if (node.kind === KIND.REF) references++;
    if (node.kind === KIND.ARRAY) walk(node.items, level + 1);
    if (node.kind === KIND.UNION || node.kind === KIND.INTERSECTION) {
      (node.variants || node.parts || []).forEach((part) => walk(part, level + 1));
    }
    if (node.kind === KIND.OBJECT) {
      fields += node.properties.length;
      node.properties.forEach((property) => walk(property.node, level + 1));
      if (node.additional) walk(node.additional, level + 1);
    }
  };
  walk(ir.root, 0);
  ir.definitions.forEach((definition) => walk(definition.node, 0));
  return { types: ir.definitions.length + 1, fields, references, depth };
}
