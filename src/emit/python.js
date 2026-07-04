// Python emitter: dataclasses with typed fields, enums and Literal unions.
import { KIND, orderedDefinitions } from "../ir.js";
import { pascal, snake, safePythonName, lineComments } from "../format.js";

function pythonLiteral(value) {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(", ")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)}: ${pythonLiteral(entry)}`).join(", ")}}`;
  }
  return String(value);
}

function enumMemberName(value) {
  const name = snake(String(value));
  return /^[a-z_]/.test(name) ? name : `value_${name}`;
}

function className(name) {
  return pascal(name);
}

function fieldComment(description, indent) {
  return lineComments(description, indent).map((line) => line.replace(/^(\s*)\/\//, "$1#"));
}

function makeTypes(uses) {
  const use = (name) => {
    uses.add(name);
    return name;
  };

  function typeOf(node) {
    if (!node) return use("Any");
    let base;
    switch (node.kind) {
      case KIND.REF:
        base = className(node.name);
        break;
      case KIND.STRING:
        if (node.format === "date") base = use("date");
        else if (node.format === "date-time") base = use("datetime");
        else base = "str";
        break;
      case KIND.INTEGER:
        base = "int";
        break;
      case KIND.NUMBER:
        base = "float";
        break;
      case KIND.BOOLEAN:
        base = "bool";
        break;
      case KIND.NULL:
        base = "None";
        break;
      case KIND.ANY:
        base = use("Any");
        break;
      case KIND.ENUM:
        base = `Literal[${node.values.map(pythonLiteral).join(", ")}]`;
        use("Literal");
        break;
      case KIND.UNION: {
        const parts = node.variants.map(typeOf);
        if (!parts.length) base = use("Any");
        else {
          use("Union");
          base = `Union[${parts.join(", ")}]`;
        }
        break;
      }
      case KIND.INTERSECTION:
        // Python has no structural intersection; a mapping is the closest
        // annotation that does not lie about the runtime shape.
        use("Dict");
        use("Any");
        base = "Dict[str, Any]";
        break;
      case KIND.ARRAY:
        use("List");
        base = `List[${typeOf(node.items)}]`;
        break;
      case KIND.OBJECT:
        use("Dict");
        use("Any");
        base = "Dict[str, Any]";
        break;
      default:
        base = use("Any");
    }
    if (node.nullable && base !== "None" && base !== "Any" && !base.startsWith("Optional[")) {
      use("Optional");
      base = `Optional[${base}]`;
    }
    return base;
  }

  return { typeOf, use };
}

function hasDefault(property) {
  return property.default !== undefined || !property.required;
}

function emitDataclass(name, node, typeOf, use) {
  const lines = [];
  if (node.description) lines.push(...lineComments(node.description).map((line) => line.replace("//", "#")));
  lines.push("@dataclass", `class ${className(name)}:`);
  if (!node.properties.length) {
    lines.push("    pass");
    return lines;
  }
  // Dataclass rules: fields with defaults must come after fields without.
  const fields = [...node.properties].sort((left, right) => Number(hasDefault(left)) - Number(hasDefault(right)));
  for (const property of fields) {
    if (property.description) lines.push(...fieldComment(property.description, 4));
    const pythonName = safePythonName(property.name);
    let annotation = typeOf(property.node);
    let defaultValue = "";
    if (property.default !== undefined) defaultValue = ` = ${pythonLiteral(property.default)}`;
    else if (!property.required) {
      if (!annotation.startsWith("Optional[")) {
        annotation = `Optional[${annotation}]`;
        use("Optional");
      }
      defaultValue = " = None";
    }
    lines.push(`    ${pythonName}: ${annotation}${defaultValue}`);
  }
  return lines;
}

export function emitPython(ir) {
  const uses = new Set();
  const { typeOf, use } = makeTypes(uses);
  const body = [];
  const ordered = orderedDefinitions(ir);

  for (const definition of ordered) {
    if (definition.node.kind === KIND.ENUM) {
      const values = definition.node.values;
      const base = values.every((value) => typeof value === "string") ? "(str, Enum)" : "(Enum, )";
      if (definition.node.description) body.push(...lineComments(definition.node.description).map((line) => line.replace("//", "#")));
      body.push(`class ${className(definition.name)}${base}:`);
      for (const value of values) body.push(`    ${enumMemberName(value)} = ${pythonLiteral(value)}`);
      body.push("");
      uses.add("Enum");
    } else if (definition.node.kind === KIND.OBJECT) {
      body.push(...emitDataclass(definition.name, definition.node, typeOf, use), "");
      uses.add("dataclass");
    } else {
      if (definition.node.description) body.push(...lineComments(definition.node.description).map((line) => line.replace("//", "#")));
      body.push(`${className(definition.name)} = ${typeOf(definition.node)}`, "");
    }
  }

  const rootName = className(ir.rootName);
  if (ir.root.kind === KIND.REF && className(ir.root.name) === rootName) {
    // root already emitted as a named class
  } else if (ir.root.kind === KIND.REF) {
    body.push(`${rootName} = ${className(ir.root.name)}`, "");
  } else if (ir.root.kind === KIND.OBJECT) {
    body.push(...emitDataclass(ir.rootName, ir.root, typeOf, use), "");
    uses.add("dataclass");
  } else {
    body.push(`${rootName} = ${typeOf(ir.root)}`, "");
  }

  const imports = ["from __future__ import annotations"];
  if (uses.has("dataclass")) imports.push("from dataclasses import dataclass");
  if (uses.has("Enum")) imports.push("from enum import Enum");
  if (uses.has("date") || uses.has("datetime")) {
    imports.push(`from datetime import ${[uses.has("date") ? "date" : null, uses.has("datetime") ? "datetime" : null].filter(Boolean).join(", ")}`);
  }
  const typing = ["Any", "Dict", "List", "Literal", "Optional", "Union"].filter((name) => uses.has(name));
  if (typing.length) imports.push(`from typing import ${typing.join(", ")}`);

  const header = [
    `# Generated by TypeForge from ${ir.rootName}.`,
    "# Field names are snake_case; use a serialisation layer if the wire format differs.",
  ];
  return [...header, "", ...imports, "", ...body].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
