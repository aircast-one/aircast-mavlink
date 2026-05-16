# @aircast-one/mavlink

Type-safe MAVLink library for TypeScript. Parses and serializes MAVLink v1/v2 messages with full type narrowing — no manual casts needed. Works in browsers, Web Workers, and Node.js.

Generated from official [MAVLink XML definitions](https://github.com/mavlink/mavlink/tree/master/message_definitions/v1.0).

## Features

- **Type-safe parsing** — discriminated unions narrow `payload` when you switch on `message_name`
- **Type-safe serialization** — per-message `serialize` functions with typed payloads
- **Tree-shakeable** — import only the constants and messages you need
- **MAVLink v1 & v2** — automatic protocol detection, CRC validation, extension field handling
- **Browser-first** — designed for Web Workers, no Node.js dependencies at runtime
- **4 built-in dialects** — Common, ArduPilotMega, Minimal, Standard

## Installation

```bash
npm install @aircast-one/mavlink
```

Requires Node.js >= 18.0.0 (uses native `fetch` for code generation).

## Quick Start

### Parsing

```typescript
import { ArdupilotmegaParser } from '@aircast-one/mavlink/ardupilotmega'
import type { ArdupilotmegaMessage } from '@aircast-one/mavlink/ardupilotmega/messages'

const parser = new ArdupilotmegaParser()

// parseBytes handles buffering, frame sync, CRC validation
const messages = parser.parseBytes(rawBytes) as ArdupilotmegaMessage[]

for (const msg of messages) {
  switch (msg.message_name) {
    case 'HEARTBEAT':
      // payload is auto-narrowed to MessageHeartbeat
      console.log('Type:', msg.payload.type)
      console.log('Autopilot:', msg.payload.autopilot)
      break

    case 'GPS_RAW_INT':
      // payload is auto-narrowed to MessageGpsRawInt
      console.log('Lat:', msg.payload.lat / 1e7)
      console.log('Lon:', msg.payload.lon / 1e7)
      break

    case 'ATTITUDE':
      console.log('Roll:', msg.payload.roll)
      break
  }
}
```

### Serializing (type-safe per-message functions)

Each message has a generated `serialize` function with a fully typed payload:

```typescript
import { serializeCommandLong } from '@aircast-one/mavlink/ardupilotmega/messages'

const bytes = serializeCommandLong(
  {
    target_system: 1,
    target_component: 1,
    command: 400, // MAV_CMD_COMPONENT_ARM_DISARM
    confirmation: 0,
    param1: 1, // arm
    param2: 0,
    param3: 0,
    param4: 0,
    param5: 0,
    param6: 0,
    param7: 0,
  },
  { system_id: 255, component_id: 190, sequence: 0 }
)
```

### Serializing (generic serializer)

For dynamic message names, use the dialect serializer:

```typescript
import { ArdupilotmegaSerializer } from '@aircast-one/mavlink/ardupilotmega'

const serializer = new ArdupilotmegaSerializer()

const bytes = serializer.serialize(
  'HEARTBEAT',
  {
    type: 6,
    autopilot: 8,
    base_mode: 81,
    custom_mode: 0,
    system_status: 4,
    mavlink_version: 3,
  },
  { system_id: 255, component_id: 190, sequence: 0 }
)
```

### Selective serializer (tree-shakeable)

Register only the messages you send — skip the full dialect bundle:

```typescript
import { ArdupilotmegaSerializer } from '@aircast-one/mavlink/ardupilotmega/parser'
import { CommandLongDefinition } from '@aircast-one/mavlink/ardupilotmega/messages/command-long'
import { HeartbeatDefinition } from '@aircast-one/mavlink/ardupilotmega/messages/heartbeat'

const serializer = new ArdupilotmegaSerializer([CommandLongDefinition, HeartbeatDefinition])
```

### Constants

Constants are tree-shakeable — import only what you need:

```typescript
import {
  MAV_CMD_COMPONENT_ARM_DISARM,
  MAV_CMD_NAV_TAKEOFF,
} from '@aircast-one/mavlink/ardupilotmega/constants/mav-cmd'

import type { MAV_CMD } from '@aircast-one/mavlink/ardupilotmega/constants/mav-cmd'
```

### Web Worker

```typescript
// worker.ts
import { ArdupilotmegaParser } from '@aircast-one/mavlink/ardupilotmega'
import type { ArdupilotmegaMessage } from '@aircast-one/mavlink/ardupilotmega/messages'

const parser = new ArdupilotmegaParser()

self.onmessage = (event) => {
  const messages = parser.parseBytes(event.data) as ArdupilotmegaMessage[]

  for (const msg of messages) {
    self.postMessage(msg)
  }
}
```

## Available Dialects

| Dialect       | Parser                | Serializer                | Messages               |
| ------------- | --------------------- | ------------------------- | ---------------------- |
| Common        | `CommonParser`        | `CommonSerializer`        | `CommonMessage`        |
| ArduPilotMega | `ArdupilotmegaParser` | `ArdupilotmegaSerializer` | `ArdupilotmegaMessage` |
| Minimal       | `MinimalParser`       | `MinimalSerializer`       | `MinimalMessage`       |
| Standard      | `StandardParser`      | `StandardSerializer`      | `StandardMessage`      |

All are imported from `@aircast-one/mavlink/<dialect>/full`.

## API Reference

### Parser

```typescript
class DialectParser {
  parseBytes(data: Uint8Array): ParsedMAVLinkMessage[]
  decode(frame: MAVLinkFrame): ParsedMAVLinkMessage
  resetBuffer(): void
  getDialectName(): string
}
```

`parseBytes` handles buffering, frame synchronization, protocol detection (v1/v2), CRC validation, and payload decoding. Feed it raw bytes from any transport — WebSocket, WebRTC data channel, TCP, serial — and get back fully decoded messages.

### Serializer

```typescript
class DialectSerializer {
  constructor(definitions?: MessageDefinition[])
  serialize(
    messageName: string,
    payload: Record<string, unknown>,
    options: SerializeOptions
  ): Uint8Array
}

interface SerializeOptions {
  system_id: number
  component_id: number
  sequence: number
  protocol_version?: 1 | 2 // auto-detected from message ID if omitted
}
```

Pass specific `MessageDefinition` arrays to the constructor for selective registration (smaller bundles). Omit to use all definitions registered by the `/full` import.

### Per-Message Serialize Functions

Each message module exports a type-safe serialize function:

```typescript
function serializeHeartbeat(payload: MessageHeartbeat, options: SerializeOptions): Uint8Array
function serializeCommandLong(payload: MessageCommandLong, options: SerializeOptions): Uint8Array
// ... one per message in the dialect
```

Import from `@aircast-one/mavlink/<dialect>/messages`.

### Generated Types

```typescript
// Discriminated union — TypeScript narrows payload via message_name
type ArdupilotmegaMessage =
  | { message_name: 'HEARTBEAT'; payload: MessageHeartbeat; /* ...base fields */ }
  | { message_name: 'GPS_RAW_INT'; payload: MessageGpsRawInt; /* ...base fields */ }
  | { message_name: 'ATTITUDE'; payload: MessageAttitude; /* ...base fields */ }
  // ... all messages in dialect

// Message name literal union — for autocomplete and exhaustive checks
type ArdupilotmegaMessageName = 'HEARTBEAT' | 'GPS_RAW_INT' | 'ATTITUDE' | ...;

// Lookup map — get payload type from message name
interface MessageTypeMap {
  HEARTBEAT: MessageHeartbeat;
  GPS_RAW_INT: MessageGpsRawInt;
  // ...
}
```

### ParsedMAVLinkMessage (base type)

```typescript
interface ParsedMAVLinkMessage {
  timestamp: number
  system_id: number
  component_id: number
  message_id: number
  message_name: string
  sequence: number
  payload: Record<string, unknown>
  protocol_version: 1 | 2
  checksum: number
  crc_ok: boolean
  signature?: Uint8Array
  dialect?: string
}
```

Cast to the dialect's message type for full type narrowing:

```typescript
const messages = parser.parseBytes(data) as ArdupilotmegaMessage[]
```

## Import Patterns

```
@aircast-one/mavlink
├── (root)                        # import type { ParsedMAVLinkMessage } from '@aircast-one/mavlink'
├── <dialect>                     # Parser + Serializer (all messages registered)
├── <dialect>/parser              # Parser + Serializer (register manually)
├── <dialect>/messages            # Message types + serialize functions + unions
└── <dialect>/constants/<enum>    # Individual enum constants (tree-shakeable)
```

Dialects: `ardupilotmega`, `common`, `minimal`, `standard`

## Code Generation

Generate TypeScript types from any MAVLink XML dialect:

```bash
# From URL
bun src/cli.ts generate \
  -i https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/common.xml \
  -o ./src/generated/dialects/common

# From local file
bun src/cli.ts generate -i ./my-dialect.xml -o ./types

# Batch generate multiple dialects
bun src/cli.ts batch -d "common,minimal,ardupilotmega" -o ./mavlink-types

# List available upstream dialects
bun src/cli.ts list
```

### CLI Options

| Command    | Flag               | Description                                   |
| ---------- | ------------------ | --------------------------------------------- |
| `generate` | `-i <path>`        | Input XML file or URL (required)              |
|            | `-o <path>`        | Output directory (default: `./types`)         |
|            | `-n <name>`        | Dialect name (auto-detected from filename)    |
|            | `-f <format>`      | `single` or `separate` (default: `separate`)  |
|            | `--no-enums`       | Skip enum generation                          |
|            | `--no-type-guards` | Skip type guard generation                    |
| `batch`    | `-o <path>`        | Output directory (default: `./mavlink-types`) |
|            | `-d <dialects>`    | Comma-separated dialect names                 |
|            | `--package`        | Generate `package.json` and `tsconfig.json`   |

### Programmatic Usage

```typescript
import { generateTypesFromXML } from '@aircast-one/mavlink'

const files = await generateTypesFromXML(xmlContent, {
  dialectName: 'my-dialect',
  outputFormat: 'separate',
  includeEnums: true,
  includeTypeGuards: true,
})
// files: { 'types.ts': '...', 'parser.ts': '...', ... }
```

## Architecture

```
XML Dialect Definition
        │
        ▼
   Code Generator ──► Per-message modules (definition + interface + serialize fn)
        │              Per-constant modules (type union + const values)
        │              Parser class (extends DialectParser)
        │              Serializer class (standalone, lazy registration)
        │              Discriminated union type
        │              Message name literal union
        ▼
  Runtime (browser/Node.js)
        │
   ┌────┴────┐
   │ Parser  │  Raw bytes → ParsedMAVLinkMessage[]
   │         │  - StreamBuffer handles partial frames
   │         │  - Frame parser detects v1/v2 magic bytes
   │         │  - CRC validation with computed CRC_EXTRA
   │         │  - Payload decoding with wire-order field sorting
   └─────────┘
   ┌─────────┐
   │Serializer│  Message name + payload + options → Uint8Array
   │         │  - Encodes payload with field defaults
   │         │  - Creates v1/v2 frame with CRC
   │         │  - Protocol version auto-detected from message ID
   └─────────┘
```

## Limitations

- **MAVLink v2 signing** — the parser reads v2 signatures but does not validate them. The serializer does not create signed frames. Use transport-layer encryption (DTLS/TLS) for security.
- **CRC_EXTRA** — computed from XML definitions at generation time. Custom dialects must be generated with the CLI to get correct CRC values.
- **Pinned MAVLink version** — built-in dialects are generated from a pinned upstream commit (`mavlinkCommit` in package.json). Update the commit SHA and regenerate to pick up new messages.

## Development

```bash
# Install dependencies
npm install

# Generate dialects from MAVLink XML
npm run generate

# Build the package
npm run build

# Run tests
npm test

# Type-check
npm run typecheck
```

## License

MIT
