# Tree-Shakeable Exports & Lazy Loading

## Goal

Replace monolithic dialect bundles with tree-shakeable individual message modules.

**Breaking change** - no backward compatibility.

## Expected Size Improvements

| Usage Pattern | Current | After |
|--------------|---------|-------|
| HEARTBEAT only | 206KB | ~8KB |
| 10 messages | 206KB | ~40KB |
| All messages | 206KB | ~206KB |

## New Directory Structure

```
src/generated/dialects/common/
├── index.ts                    # exports parser + imports all messages
├── parser.ts                   # CommonParser with message registry
├── messages/
│   ├── heartbeat.ts           # definition + crcExtra + interface + type guard
│   ├── gps-raw-int.ts
│   └── ...
├── enums.ts
└── types.ts
```

## Usage

```typescript
// Full dialect (imports everything)
import { CommonParser } from '@aircast-4g/mavlink/dialects/common';

// Tree-shakeable (only specific messages)
import { CommonParser } from '@aircast-4g/mavlink/dialects/common/parser';
import '@aircast-4g/mavlink/dialects/common/messages/heartbeat';
import '@aircast-4g/mavlink/dialects/common/messages/gps-raw-int';

const parser = new CommonParser();
// Parser only knows HEARTBEAT and GPS_RAW_INT
```

## Implementation

### 1. Parser Template (`src/generator/template-engine.ts`)

Replace `decoder` template with `parser` template:

```typescript
// parser.ts (generated)
import { MessageDefinition, DialectParser, getFieldDefaultValue, sortFieldsByWireOrder } from '../../../core';

const MESSAGE_REGISTRY = new Map<number, MessageDefinition>();
const CRC_EXTRA_TABLE: Record<number, number> = {};

export function registerMessage(id: number, definition: MessageDefinition, crcExtra: number): void {
  MESSAGE_REGISTRY.set(id, definition);
  CRC_EXTRA_TABLE[id] = crcExtra;
}

export class CommonParser extends DialectParser {
  constructor() {
    super('common');
    this.setCrcExtraTable(CRC_EXTRA_TABLE);
    for (const [id, def] of MESSAGE_REGISTRY) {
      this.messageDefinitions.set(id, def);
    }
  }

  async loadDefinitions(): Promise<void> {}
}

export class CommonSerializer { ... }
```

### 2. Message Module Template (`src/generator/template-engine.ts`)

Add new `message-module` template:

```typescript
// messages/heartbeat.ts (generated)
import { registerMessage } from '../parser';
import type { MessageDefinition } from '../../../../core';

export const HEARTBEAT_ID = 0;
export const HEARTBEAT_CRC_EXTRA = 50;

export const HeartbeatDefinition: MessageDefinition = {
  id: 0,
  name: 'HEARTBEAT',
  fields: [
    { name: 'custom_mode', type: 'uint32_t' },
    { name: 'type', type: 'uint8_t' },
    { name: 'autopilot', type: 'uint8_t' },
    { name: 'base_mode', type: 'uint8_t' },
    { name: 'system_status', type: 'uint8_t' },
    { name: 'mavlink_version', type: 'uint8_t' },
  ]
};

export interface MessageHeartbeat {
  custom_mode: number;
  type: number;
  autopilot: number;
  base_mode: number;
  system_status: number;
  mavlink_version: number;
}

export function isHeartbeat(msg: { message_name: string }): boolean {
  return msg.message_name === 'HEARTBEAT';
}

// Auto-register on import
registerMessage(HEARTBEAT_ID, HeartbeatDefinition, HEARTBEAT_CRC_EXTRA);
```

### 3. Index Template (`src/generator/template-engine.ts`)

Update to import all messages:

```typescript
// index.ts (generated)
export * from './types';
export * from './enums';
export * from './parser';

// Import all messages to register them
import './messages/heartbeat';
import './messages/sys-status';
// ... all messages

// Re-export types and guards
export { MessageHeartbeat, isHeartbeat } from './messages/heartbeat';
export { MessageSysStatus, isSysStatus } from './messages/sys-status';
// ...
```

### 4. Generator Changes (`src/generator/generator.ts`)

- Create `messages/` subdirectory per dialect
- Generate one file per message using `message-module` template
- Generate `parser.ts` using `parser` template
- Update `index.ts` generation

### 5. Rollup Config (`rollup.config.js`)

Enable `preserveModules` for tree-shaking:

```javascript
{
  input: dialectEntries,
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src/generated'
  },
  plugins: [resolve(), typescript(), terser()]
}
```

### 6. Package.json Exports

Add granular exports:

```json
{
  "exports": {
    "./dialects/common": "./dist/dialects/common/index.js",
    "./dialects/common/parser": "./dist/dialects/common/parser.js",
    "./dialects/common/messages/*": "./dist/dialects/common/messages/*.js"
  },
  "sideEffects": ["./dist/dialects/*/messages/*.js"]
}
```

## Files to Modify

1. `src/generator/template-engine.ts`
   - Add `parser` template (replace `decoder`)
   - Add `message-module` template
   - Update `index` template
   - Add `kebabCase` helper

2. `src/generator/generator.ts`
   - Add `generateMessageModules()` method
   - Create `messages/` directory
   - Generate individual message files

3. `rollup.config.js`
   - Enable `preserveModules`
   - Set `preserveModulesRoot`

4. `package.json`
   - Add granular exports for messages
   - Add `sideEffects` field

## Helper Functions Needed

```typescript
// Convert UPPER_SNAKE_CASE to kebab-case for filenames
function kebabCase(str: string): string {
  return str.toLowerCase().replace(/_/g, '-');
}

// Convert to CONSTANT_NAME
function constantCase(str: string): string {
  return str.toUpperCase();
}
```
