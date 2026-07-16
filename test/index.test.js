import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { codegen, generate, languageById, LANGUAGES, parseSchema } from "../src/index.js";
import { SAMPLES, sampleById } from "../src/samples.js";

test("codegen returns all four languages with stable output", () => {
  const first = codegen(sampleById("user-profile").schema);
  const second = codegen(sampleById("user-profile").schema);
  assert.deepEqual(first.outputs.map((output) => output.id), ["typescript", "zod", "python", "go"]);
  assert.equal(first.outputs.length, 4);
  for (const output of first.outputs) {
    assert.ok(output.code.length > 200, `${output.id} output is suspiciously short`);
    assert.equal(output.code, second.outputs.find((entry) => entry.id === output.id).code);
  }
  assert.equal(first.stats.types, 6);
});

test("codegen accepts schema text as well as objects", () => {
  const text = JSON.stringify(sampleById("event-envelope").schema);
  const fromText = codegen(text);
  const fromObject = codegen(sampleById("event-envelope").schema);
  assert.equal(fromText.outputs[0].code, fromObject.outputs[0].code);
});

test("generate() selects a single language", () => {
  const schema = sampleById("comment-thread").schema;
  const python = generate(schema, "python");
  assert.match(python, /class CommentThread:/);
  assert.match(generate(schema, "typescript"), /export interface CommentThread/);
  assert.equal(languageById("nope").id, "typescript");
});

test("the CLI example matches the in-app sample", () => {
  const fromFile = parseSchema(readFileSync("examples/user-profile.json", "utf8"));
  assert.deepEqual(fromFile, sampleById("user-profile").schema);
});

test("the CLI prints a single language and all four", () => {
  const python = execFileSync(process.execPath, ["scripts/cli.mjs", "examples/user-profile.json", "--lang", "python"], { encoding: "utf8" });
  assert.match(python, /class UserProfile:/);
  assert.match(python, /from dataclasses import dataclass/);

  const all = execFileSync(process.execPath, ["scripts/cli.mjs", "examples/user-profile.json", "--all"], { encoding: "utf8" });
  for (const language of LANGUAGES) assert.match(all, new RegExp(`===== ${language.label}`));
});

test("the CLI writes to an output file", () => {
  const target = join(tmpdir(), `typeforge-${process.pid}.go`);
  const output = execFileSync(process.execPath, [
    "scripts/cli.mjs", "examples/user-profile.json", "--lang", "go", "--out", target,
  ], { encoding: "utf8" });
  assert.match(output, /wrote/);
  const content = readFileSync(target, "utf8");
  assert.match(content, /package models/);
  rmSync(target, { force: true });
});

test("the CLI rejects unknown languages", () => {
  assert.throws(() => execFileSync(process.execPath, [
    "scripts/cli.mjs", "examples/user-profile.json", "--lang", "rust",
  ], { encoding: "utf8", stdio: "pipe" }), /unknown language/);
});

test("every sample generates without throwing", () => {
  for (const sample of SAMPLES) {
    const result = codegen(sample.schema);
    assert.equal(result.outputs.length, 4);
    for (const output of result.outputs) assert.ok(output.code.length > 100);
  }
});
