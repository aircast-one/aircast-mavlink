# Aircast MAVLink

TypeScript MAVLink library with code generation from XML dialects, real-time parsing, and serialization. Designed for browser and Node.js with tree-shakeable imports.

## Installation

```bash
npm install @aircast-4g/mavlink
```

## Quick Start

### Parsing MAVLink messages

```typescript
import { CommonParser } from '@aircast-4g/mavlink/dialects/common/full'

const parser = new CommonParser()

// Parse raw bytes (handles buffering, frame sync, v1/v2 detection)
const messages = parser.parseBytes(rawBytes)

messages.forEach((msg) => {
  console.log(msg.message_name, msg.payload)
})
```

### Serializing MAVLink messages

```typescript
import { CommonSerializer } from '@aircast-4g/mavlink/dialects/common/full'

const serializer = new CommonSerializer()

const bytes = serializer.serialize({
  message_name: 'HEARTBEAT',
  system_id: 255,
  component_id: 190,
  sequence: 0,
  payload: {
    type: 6,
    autopilot: 8,
    base_mode: 81,
    custom_mode: 0,
    system_status: 4,
    mavlink_version: 3,
  },
})
```

### Web Worker integration

```typescript
// worker.ts
import { ArdupilotmegaParser } from '@aircast-4g/mavlink/dialects/ardupilotmega/full'

const parser = new ArdupilotmegaParser()

self.onmessage = (event) => {
  const messages = parser.parseBytes(event.data)
  self.postMessage({ type: 'MESSAGES', messages })
}
```

### Using constants (tree-shakeable)

```typescript
import { MAV_CMD_NAV_WAYPOINT } from '@aircast-4g/mavlink/dialects/ardupilotmega/constants/mav-cmd'
import type { MAV_CMD } from '@aircast-4g/mavlink/dialects/ardupilotmega/constants/mav-cmd'
```

### Using message types

```typescript
import type { ParsedMAVLinkMessage } from '@aircast-4g/mavlink/core/types'
import type { MessageHeartbeat } from '@aircast-4g/mavlink/dialects/common/messages/heartbeat'
```

## Available Dialects

| Dialect   | Parser                                            | Import                                            |
| --------- | ------------------------------------------------- | ------------------------------------------------- |
| Common    | `CommonParser` / `CommonSerializer`               | `@aircast-4g/mavlink/dialects/common/full`        |
| ArduPilot | `ArdupilotmegaParser` / `ArdupilotmegaSerializer` | `@aircast-4g/mavlink/dialects/ardupilotmega/full` |
| Minimal   | `MinimalParser` / `MinimalSerializer`             | `@aircast-4g/mavlink/dialects/minimal/full`       |
| Standard  | `StandardParser` / `StandardSerializer`           | `@aircast-4g/mavlink/dialects/standard/full`      |

## API Reference

### DialectParser

Base class for all dialect parsers (e.g., `CommonParser`, `ArdupilotmegaParser`).

```typescript
class DialectParser {
  // Parse raw bytes into messages (handles buffering internally)
  parseBytes(data: Uint8Array): ParsedMAVLinkMessage[]

  // Decode a single frame
  decode(frame: MAVLinkFrame): ParsedMAVLinkMessage

  // Serialize a message to MAVLink bytes
  serializeMessage(message: {
    message_name: string
    payload: Record<string, unknown>
    system_id?: number
    component_id?: number
    sequence?: number
  }): Uint8Array

  // Clear internal buffer
  resetBuffer(): void

  // Registry queries
  supportsMessage(messageId: number): boolean
  supportsMessageName(messageName: string): boolean
  getSupportedMessageIds(): number[]
  getSupportedMessageNames(): string[]
  getDialectName(): string
}
```

### DialectSerializer

Convenience wrapper around the parser's serialization methods.

```typescript
class DialectSerializer {
  serialize(message: { message_name: string; payload: Record<string, unknown> }): Uint8Array
  completeMessage(message: {
    message_name: string
    payload: Record<string, unknown>
  }): Record<string, unknown>
  getSupportedMessages(): string[]
  supportsMessage(messageName: string): boolean
}
```

### ParsedMAVLinkMessage

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

## Import Patterns

```
@aircast-4g/mavlink/
├── core/types                          # ParsedMAVLinkMessage type
├── dialects/<dialect>/full             # Parser + Serializer (all messages registered)
├── dialects/<dialect>/parser           # Parser only (register messages manually)
├── dialects/<dialect>/messages/<msg>   # Individual message definitions + types
├── dialects/<dialect>/constants/<enum> # Individual enum constants
└── dialects/<dialect>/messages         # All message type re-exports
```

## Code Generation CLI

Generate TypeScript types from MAVLink XML dialect definitions.

```bash
# Generate single dialect
npx aircast-mavlink generate -i common.xml -o ./types

# Generate from URL
npx aircast-mavlink generate -i https://raw.githubusercontent.com/mavlink/mavlink/master/message_definitions/v1.0/common.xml -o ./types

# Batch generate multiple dialects
npx aircast-mavlink batch -d "common,minimal,ardupilotmega" -o ./mavlink-types

# List available dialects
npx aircast-mavlink list
```

### CLI Options

**generate**: `-i <path>` input, `-o <path>` output, `-n <name>` dialect name, `-f single|separate` format, `--no-enums`, `--no-type-guards`

**batch**: `-o <path>` output, `-d <dialects>` comma-separated, `-f single|separate` format, `--package` generate package.json

### Programmatic Usage

```typescript
import { generateTypesFromXML } from '@aircast-4g/mavlink'

const files = await generateTypesFromXML(xmlContent, {
  dialectName: 'common',
  outputFormat: 'separate',
  includeEnums: true,
  includeTypeGuards: true,
})
```

## Limitations

- **MAVLink v2 signing**: The parser reads v2 signatures but does not validate them. The serializer does not create signed frames. Use transport-layer encryption (DTLS/TLS) for security.
- **CRC_EXTRA**: Computed from XML definitions at generation time. Custom dialects must be generated with the CLI to get correct CRC values.

## License

MIT
