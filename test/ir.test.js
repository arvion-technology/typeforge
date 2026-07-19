import test from "node:test";
import assert from "node:assert/strict";

import { buildIR, orderedDefinitions, collectRefs, irStats, KIND } from "../src/ir.js";
import { SAMPLES, sampleById } from "../src/samples.js";

test("buildIR names definitions and keeps an object root", () => {
  const ir = buildIR(sampleById("user-profile").schema);
  assert.equal(ir.rootName, "UserProfile");
  assert.equal(ir.root.kind, KIND.OBJECT);
  const names = ir.definitions.map((definition) => definition.name).sort();
  assert.deepEqual(names, ["Address", "AuditFields", "Role", "Team", "UserSummary"]);
});

test("$refs become named references rather than copies", () => {
  const ir = buildIR(sampleById("user-profile").schema);
  const address = ir.definitions.find((definition) => definition.name === "Address");
  assert.equal(address.node.properties.find((property) => property.name === "line1").node.kind, KIND.STRING);
  assert.equal(ir.root.properties.find((property) => property.name === "address").node.kind, KIND.REF);
  assert.deepEqual([...collectRefs(ir.root)].sort(), ["Address", "Role", "Team"]);
});

test("allOf is flattened into one object when every part is object-like", () => {
  const ir = buildIR(sampleById("user-profile").schema);
  const address = ir.definitions.find((definition) => definition.name === "Address").node;
  assert.equal(address.kind, KIND.OBJECT);
  assert.deepEqual(address.properties.map((property) => property.name), [
    "createdAt", "updatedAt", "line1", "line2", "city", "country", "postalCode",
  ]);
  assert.ok(address.properties.filter((property) => ["line1", "city", "country"].includes(property.name)).every((property) => property.required));
});

test("type arrays and nullable fields are both understood", () => {
  const ir = buildIR(sampleById("comment-thread").schema);
  const author = ir.definitions.find((definition) => definition.name === "Author").node;
  const avatar = author.properties.find((property) => property.name === "avatarUrl").node;
  assert.equal(avatar.kind, KIND.STRING);
  assert.equal(avatar.nullable, true);
  assert.equal(avatar.format, "uri");
});

test("recursive schemas produce a ref back to their own definition", () => {
  const ir = buildIR(sampleById("comment-thread").schema);
  const comment = ir.definitions.find((definition) => definition.name === "Comment").node;
  const replies = comment.properties.find((property) => property.name === "replies").node;
  assert.equal(replies.kind, KIND.ARRAY);
  assert.deepEqual(replies.items, { kind: KIND.REF, name: "Comment", description: undefined });
});

test("oneOf becomes a union of refs", () => {
  const ir = buildIR(sampleById("event-envelope").schema);
  const payload = ir.root.properties.find((property) => property.name === "payload").node;
  assert.equal(payload.kind, KIND.UNION);
  assert.deepEqual(payload.variants.map((variant) => variant.name), ["OrderCreated", "OrderPaid", "UserInvited"]);
});

test("enums keep their literal values", () => {
  const ir = buildIR(sampleById("user-profile").schema);
  const role = ir.definitions.find((definition) => definition.name === "Role").node;
  assert.equal(role.kind, KIND.ENUM);
  assert.deepEqual(role.values, ["owner", "admin", "member", "viewer"]);
});

test("orderedDefinitions puts dependencies before dependents", () => {
  const ir = buildIR(sampleById("user-profile").schema);
  const order = orderedDefinitions(ir).map((definition) => definition.name);
  assert.ok(order.indexOf("AuditFields") < order.indexOf("Address"));
  assert.ok(order.indexOf("UserSummary") < order.indexOf("Team"));
});

test("orderedDefinitions terminates on recursive schemas", () => {
  const ir = buildIR(sampleById("comment-thread").schema);
  const order = orderedDefinitions(ir).map((definition) => definition.name);
  assert.deepEqual(order.sort(), ["Author", "Comment", "Reactions"]);
});

test("draft-07 definitions containers work too", () => {
  const ir = buildIR({
    definitions: { Thing: { type: "object", properties: { id: { type: "string" } } } },
    type: "object",
    properties: { thing: { $ref: "#/definitions/Thing" } },
  });
  assert.deepEqual(ir.definitions.map((definition) => definition.name), ["Thing"]);
  assert.equal(ir.definitions[0].node.properties[0].name, "id");
});

test("irStats counts fields, references and depth", () => {
  const stats = irStats(buildIR(sampleById("user-profile").schema));
  assert.equal(stats.types, 6);
  assert.ok(stats.fields >= 20, `fields ${stats.fields}`);
  assert.ok(stats.references >= 4, `references ${stats.references}`);
  assert.ok(stats.depth >= 2);
});
