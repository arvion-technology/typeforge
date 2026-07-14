// Sample schemas for the demo and the CLI example.
// They are plain objects so the tests and the browser import the same data.

const userProfile = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "UserProfile",
  description: "A member of a workspace, as returned by GET /users/{id}.",
  type: "object",
  required: ["id", "email", "role", "address"],
  properties: {
    id: { type: "string", format: "uuid", description: "Stable identifier, never reused." },
    email: { type: "string", format: "email" },
    displayName: { type: "string", minLength: 2, maxLength: 80 },
    role: { $ref: "#/$defs/Role" },
    address: { $ref: "#/$defs/Address" },
    team: { $ref: "#/$defs/Team" },
    tags: { type: "array", items: { type: "string" }, maxItems: 8 },
    lastSeenAt: { type: "string", format: "date-time" },
    marketingOptIn: { type: "boolean", default: false },
    metadata: { type: "object", additionalProperties: { type: "string" } },
  },
  $defs: {
    Role: {
      type: "string",
      enum: ["owner", "admin", "member", "viewer"],
      description: "Workspace permission level.",
    },
    AuditFields: {
      type: "object",
      properties: {
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
    },
    Address: {
      allOf: [
        { $ref: "#/$defs/AuditFields" },
        {
          type: "object",
          required: ["line1", "city", "country"],
          properties: {
            line1: { type: "string" },
            line2: { type: "string" },
            city: { type: "string" },
            country: { type: "string", minLength: 2 },
            postalCode: { type: "string", pattern: "^[0-9]{5}$" },
          },
        },
      ],
    },
    Team: {
      type: "object",
      required: ["id", "name"],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        members: { type: "array", items: { $ref: "#/$defs/UserSummary" } },
      },
    },
    UserSummary: {
      type: "object",
      required: ["id", "email"],
      properties: {
        id: { type: "string" },
        email: { type: "string", format: "email" },
        avatarUrl: { type: "string", format: "uri" },
      },
    },
  },
};

const commentThread = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "CommentThread",
  description: "A comment and its replies. The schema is recursive on purpose.",
  type: "object",
  required: ["id", "body", "replies"],
  properties: {
    id: { type: "string" },
    body: { type: "string", minLength: 1, maxLength: 4000 },
    author: { $ref: "#/$defs/Author" },
    createdAt: { type: "string", format: "date-time" },
    editedAt: { type: ["string", "null"], format: "date-time" },
    replies: { type: "array", items: { $ref: "#/$defs/Comment" } },
    reactions: { $ref: "#/$defs/Reactions" },
  },
  $defs: {
    Author: {
      type: "object",
      required: ["id", "handle"],
      properties: {
        id: { type: "string" },
        handle: { type: "string", pattern: "^[a-z0-9_]{3,24}$" },
        avatarUrl: { type: ["string", "null"], format: "uri" },
      },
    },
    Comment: {
      type: "object",
      required: ["id", "body", "createdAt"],
      properties: {
        id: { type: "string" },
        body: { type: "string", minLength: 1 },
        author: { $ref: "#/$defs/Author" },
        createdAt: { type: "string", format: "date-time" },
        replies: { type: "array", items: { $ref: "#/$defs/Comment" } },
      },
    },
    Reactions: {
      type: "object",
      required: ["like", "love"],
      properties: {
        like: { type: "integer", minimum: 0 },
        love: { type: "integer", minimum: 0 },
        laugh: { type: "integer", minimum: 0 },
      },
    },
  },
};

const eventEnvelope = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "EventEnvelope",
  description: "A discriminated webhook payload. The payload shape depends on type.",
  type: "object",
  required: ["id", "type", "occurredAt", "payload"],
  properties: {
    id: { type: "string", format: "uuid" },
    type: {
      type: "string",
      enum: ["order.created", "order.paid", "user.invited"],
    },
    occurredAt: { type: "string", format: "date-time" },
    attempt: { type: "integer", minimum: 1, default: 1 },
    payload: {
      oneOf: [
        { $ref: "#/$defs/OrderCreated" },
        { $ref: "#/$defs/OrderPaid" },
        { $ref: "#/$defs/UserInvited" },
      ],
    },
  },
  $defs: {
    OrderItem: {
      type: "object",
      required: ["sku", "quantity", "unitPrice"],
      properties: {
        sku: { type: "string" },
        quantity: { type: "integer", minimum: 1 },
        unitPrice: { type: "number", minimum: 0 },
      },
    },
    OrderCreated: {
      type: "object",
      required: ["orderId", "total", "items"],
      properties: {
        orderId: { type: "string" },
        total: { type: "number", minimum: 0 },
        currency: { type: "string", enum: ["USD", "EUR", "NPR"] },
        items: { type: "array", items: { $ref: "#/$defs/OrderItem" }, minItems: 1 },
      },
    },
    OrderPaid: {
      type: "object",
      required: ["orderId", "paidAt", "method"],
      properties: {
        orderId: { type: "string" },
        paidAt: { type: "string", format: "date-time" },
        method: { type: "string", enum: ["card", "wallet", "bank_transfer"] },
      },
    },
    UserInvited: {
      type: "object",
      required: ["email", "invitedBy"],
      properties: {
        email: { type: "string", format: "email" },
        invitedBy: { type: "string" },
        role: { type: "string", enum: ["admin", "member"] },
      },
    },
  },
};

export const SAMPLES = [
  { id: "user-profile", name: "User profile", blurb: "Nested $defs, enums, allOf, typed map", schema: userProfile },
  { id: "comment-thread", name: "Comment thread", blurb: "Recursive schema, nullable fields", schema: commentThread },
  { id: "event-envelope", name: "Event envelope", blurb: "oneOf union, discriminated payload", schema: eventEnvelope },
];

export const sampleById = (id) => SAMPLES.find((sample) => sample.id === id) || SAMPLES[0];
