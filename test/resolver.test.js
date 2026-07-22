import test from "node:test";
import assert from "node:assert/strict";

import { parseSchema, resolvePointer, nameFromPointer, createResolver } from "../src/resolver.js";

test("parseSchema accepts a JSON object and rejects everything else", () => {
  assert.deepEqual(parseSchema('{"type":"string"}'), { type: "string" });
  assert.throws(() => parseSchema("type: string"), /invalid JSON/);
  assert.throws(() => parseSchema("[]"), /must be an object/);
  assert.throws(() => parseSchema("   "), /empty/);
});

test("resolvePointer follows JSON Pointer escapes", () => {
  const document = { $defs: { "a/b": { "~tilt": { type: "boolean" } } } };
  assert.equal(resolvePointer(document, "#/$defs/a~1b/~0tilt").type, "boolean");
  assert.equal(resolvePointer(document, "#/$defs/missing"), undefined);
  assert.equal(resolvePointer(document, "#"), document);
});

test("nameFromPointer keeps the last segment", () => {
  assert.equal(nameFromPointer("#/$defs/UserProfile"), "UserProfile");
  assert.equal(nameFromPointer("#/definitions/Address"), "Address");
});

test("createResolver follows a chain of local refs", () => {
  const document = {
    $defs: {
      Alias: { $ref: "#/$defs/Name" },
      Name: { type: "string" },
    },
  };
  const resolver = createResolver(document);
  const result = resolver.deref({ $ref: "#/$defs/Alias" });
  assert.equal(result.schema.type, "string");
  assert.equal(result.pointer, "#/$defs/Name");
});

test("createResolver rejects remote refs and dangling pointers", () => {
  const resolver = createResolver({});
  assert.throws(() => resolver.pointer("https://example.com/schema.json"), /remote \$ref/);
  assert.throws(() => resolver.pointer("#/$defs/Missing"), /unresolved \$ref/);
  assert.equal(resolver.deref({ type: "string" }), null);
});
