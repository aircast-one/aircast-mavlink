import Handlebars from 'handlebars'
import { TypeScriptDialect, TypeScriptEnum } from '../types'

export class TemplateEngine {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map()

  constructor() {
    this.initializeTemplates()
    this.registerHelpers()
  }

  private initializeTemplates(): void {
    // Main types template
    this.templates.set(
      'types',
      Handlebars.compile(`// Auto-generated TypeScript types for {{ dialectName }} dialect
// Generated from MAVLink XML definitions

export interface ParsedMAVLinkMessage {
  timestamp: number;
  system_id: number;
  component_id: number;
  message_id: number;
  message_name: string;
  sequence: number;
  payload: Record<string, unknown>;
  protocol_version: 1 | 2;
  checksum: number;
  crc_ok: boolean;
  signature?: Uint8Array;
  dialect?: string;
}


{{#unless includeEnums}}
{{#each enums}}
{{#each description}}
// {{ this }}
{{/each}}
export type {{ name }} =
{{#each values}}
  | {{ value }}{{#if description}} // {{ name }} - {{ join description " " }}{{/if}}
{{/each}}
  | number;

{{/each}}
{{/unless}}
`)
    )

    // Enums template - uses type unions + const values for zero runtime overhead
    this.templates.set(
      'enums',
      Handlebars.compile(`// Auto-generated TypeScript enums for {{ dialectName }} dialect
// Uses type unions + const values for optimal tree-shaking (no runtime enum objects)

{{#each enums}}
{{#each description}}
// {{ this }}
{{/each}}
export type {{ name }} =
{{#each values}}
  | {{ value }}{{#unless @last}}{{/unless}}
{{/each}};

{{#each values}}
{{#each description}}
// {{ this }}
{{/each}}
export const {{ name }} = {{ value }} as const;
{{/each}}

{{/each}}
{{#unless enums.length}}
// This dialect has no enums defined
export {};
{{/unless}}
`)
    )

    // Individual constant module template
    this.templates.set(
      'constant-module',
      Handlebars.compile(`// Auto-generated constants: {{ name }}
{{#each description}}
// {{ this }}
{{/each}}
export type {{ name }} =
{{#each values}}
  | {{ value }}{{#unless @last}}{{/unless}}
{{/each}};

{{#each values}}
{{#each description}}
// {{ this }}
{{/each}}
export const {{ name }} = {{ value }} as const;
{{/each}}
`)
    )

    // Constants index template - re-exports all constants
    this.templates.set(
      'constants-index',
      Handlebars.compile(`// Auto-generated constants for {{ dialectName }} dialect
// Import individual constants for optimal tree-shaking

{{#each enums}}
export * from './{{ fileName }}';
{{/each}}
{{#unless enums.length}}
// This dialect has no constants defined
export {};
{{/unless}}
`)
    )

    // Messages template
    this.templates.set(
      'messages',
      Handlebars.compile(`// Auto-generated TypeScript message interfaces for {{ dialectName }} dialect
// Constants are in separate files: import { MAV_TYPE_QUADROTOR } from './constants/mav-type'

import { ParsedMAVLinkMessage } from './types';

{{#each messages}}
{{#each description}}
// {{ this }}
{{/each}}
export interface Message{{ name }} {
{{#each fields}}
{{#each description}}
  // {{ this }}
{{/each}}
  {{ name }}{{#if optional}}?{{/if}}: {{ type }};
{{/each}}
}

{{/each}}

// Message type map for type-safe message handling
export interface MessageTypeMap {
{{#each messages}}
  {{ originalName }}: Message{{ name }};
{{/each}}
}

// Union type of all message types
export type AnyMessage = ParsedMAVLinkMessage;

// Use discriminated union for type narrowing:
//   if (msg.message_name === 'HEARTBEAT') { /* msg.payload is MessageHeartbeat */ }
`)
    )

    // Index template - no re-exports, just documentation
    this.templates.set(
      'index',
      Handlebars.compile(`// {{ dialectName }} dialect
//
// Import directly from specific modules for optimal tree-shaking:
//
// Parser (with all messages pre-registered):
//   import { {{capitalize dialectName}}Parser } from '@aircast-4g/mavlink/dialects/{{ dialectName }}/full'
//
// Parser (register messages manually):
//   import { {{capitalize dialectName}}Parser, registerMessage } from '@aircast-4g/mavlink/dialects/{{ dialectName }}/parser'
//
// Constants:
//   import { MAV_TYPE_QUADROTOR } from '@aircast-4g/mavlink/dialects/{{ dialectName }}/constants/mav-type'
//
// Message types:
//   import type { MessageHeartbeat } from '@aircast-4g/mavlink/dialects/{{ dialectName }}/messages/heartbeat'
//
// Types:
//   import type { ParsedMAVLinkMessage } from '@aircast-4g/mavlink/dialects/{{ dialectName }}/types'
`)
    )

    // Full bundle template - registers all messages
    this.templates.set(
      'full',
      Handlebars.compile(`// Auto-generated full dialect bundle
// All messages are pre-registered with the parser
// Import constants directly: import { MAV_TYPE_QUADROTOR } from './constants/mav-type'

export * from './parser';

import { registerMessage } from './parser';
{{#each messages}}
import { {{ name }}Definition, {{ toUpperCase originalName }}_ID, {{ toUpperCase originalName }}_CRC_EXTRA } from './messages/{{ kebabCase originalName }}';
{{/each}}

// Register all messages
{{#each messages}}
registerMessage({{ toUpperCase originalName }}_ID, {{ name }}Definition, {{ toUpperCase originalName }}_CRC_EXTRA);
{{/each}}
`)
    )

    // Messages re-export template (types only, no runtime code)
    this.templates.set(
      'messages-reexport',
      Handlebars.compile(`// Auto-generated message type re-exports for {{ dialectName }} dialect
// This file exports only TypeScript types (interfaces) - no runtime code
// Types are tree-shaken by bundlers, so this has no bundle size impact

{{#each messages}}
export type { Message{{ name }} } from './messages/{{ kebabCase originalName }}';
{{/each}}
`)
    )

    // Single file template
    this.templates.set(
      'single',
      Handlebars.compile(`{{{ generateTypes this }}}

{{{ generateMessages this }}}
`)
    )

    // Parser template with message registry for tree-shaking
    this.templates.set(
      'parser',
      Handlebars.compile(`// Auto-generated parser for {{{ dialectName }}} dialect
// Generated from MAVLink XML definitions

import {
  MessageDefinition,
  DialectParser,
} from '../../../core';

// Message registry for lazy loading
const MESSAGE_REGISTRY = new Map<number, MessageDefinition>();
const CRC_EXTRA_TABLE: Record<number, number> = {};

/**
 * Register a message definition. Called automatically when message modules are imported.
 */
export function registerMessage(id: number, definition: MessageDefinition, crcExtra: number): void {
  MESSAGE_REGISTRY.set(id, definition);
  CRC_EXTRA_TABLE[id] = crcExtra;
}

export class {{capitalize dialectName}}Parser extends DialectParser {
  constructor() {
    super('{{{ dialectName }}}');
    for (const [id, def] of MESSAGE_REGISTRY.entries()) {
      this.registerMessageDefinition(def, CRC_EXTRA_TABLE[id]);
    }
  }

  async loadDefinitions(): Promise<void> {
    // Definitions are registered on import
  }
}

// Dialect-specific serializer (delegates to parser)
export class {{capitalize dialectName}}Serializer {
  readonly parser: {{capitalize dialectName}}Parser;

  constructor() {
    this.parser = new {{capitalize dialectName}}Parser();
  }

  serialize(message: Record<string, unknown> & { message_name: string }): Uint8Array {
    return this.parser.serializeMessage(message);
  }

  completeMessage(message: Record<string, unknown> & { message_name: string }): Record<string, unknown> {
    return this.parser.completeMessage(message);
  }

  getSupportedMessages(): string[] {
    return this.parser.getSupportedMessageNames();
  }

  supportsMessage(messageName: string): boolean {
    return this.parser.supportsMessageName(messageName);
  }
}
`)
    )

    // Individual message module template (pure exports, no side-effects)
    this.templates.set(
      'message-module',
      Handlebars.compile(`// Auto-generated message module for {{ originalName }}
// Dialect: {{ dialectName }}

import type { MessageDefinition } from '../../../../core';

export const {{ constantName }}_ID = {{ id }};
export const {{ constantName }}_CRC_EXTRA = {{ crcExtra }};

export const {{ name }}Definition: MessageDefinition = {
  id: {{ id }},
  name: '{{ originalName }}',
  fields: [
{{#each fields}}
    { name: '{{ name }}', type: '{{ originalType }}'{{#if arrayLength}}, arrayLength: {{ arrayLength }}{{/if}}{{#if extension}}, extension: true{{/if}} },
{{/each}}
  ]
};

{{#each description}}
// {{ this }}
{{/each}}
export interface Message{{ name }} {
{{#each fields}}
  {{ name }}{{#if optional}}?{{/if}}: {{ basicType type }};
{{/each}}
}
`)
    )
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('join', (array: string[], separator: string) => {
      return array.join(separator)
    })

    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => {
      return a === b
    })

    Handlebars.registerHelper('ne', (a: unknown, b: unknown) => {
      return a !== b
    })

    Handlebars.registerHelper('toUpperCase', (str: string) => {
      return str.toUpperCase()
    })

    Handlebars.registerHelper('capitalize', (str: string) => {
      return str.charAt(0).toUpperCase() + str.slice(1)
    })

    Handlebars.registerHelper('kebabCase', (str: string) => {
      return str.toLowerCase().replace(/_/g, '-')
    })

    // Convert any type to basic TypeScript type (no enum references)
    Handlebars.registerHelper('basicType', (type: string) => {
      if (type.endsWith('[]')) {
        const baseType = type.slice(0, -2)
        // If it's a string array, return string[]
        if (baseType === 'string') return 'string[]'
        // Otherwise assume number array (for any enum or numeric type)
        return 'number[]'
      }
      if (type === 'string') return 'string'
      if (type === 'bigint') return 'bigint'
      // Default to number for all numeric and enum types
      return 'number'
    })

    Handlebars.registerHelper(
      'generateCrcExtra',
      (messages: Array<{ id: number; crcExtra: number }>) => {
        const entries = messages.map((msg) => `  ${msg.id}: ${msg.crcExtra}`).join(',\n')
        return `const CRC_EXTRA: Record<number, number> = {\n${entries}\n};`
      }
    )

    Handlebars.registerHelper('generateTypes', (dialect: TypeScriptDialect) => {
      return this.generateTypes(dialect, false)
    })

    Handlebars.registerHelper('generateMessages', (dialect: TypeScriptDialect) => {
      return this.generateMessages(dialect, false)
    })
  }

  generateTypes(dialect: TypeScriptDialect, includeEnums: boolean = true): string {
    const template = this.templates.get('types')
    if (!template) {
      throw new Error('Types template not found')
    }
    return template({ ...dialect, includeEnums })
  }

  generateEnums(dialect: TypeScriptDialect): string {
    const template = this.templates.get('enums')
    if (!template) {
      throw new Error('Enums template not found')
    }
    return template(dialect)
  }

  generateConstantModule(enumDef: TypeScriptDialect['enums'][0]): string {
    const template = this.templates.get('constant-module')
    if (!template) {
      throw new Error('Constant module template not found')
    }
    return template(enumDef)
  }

  generateConstantsIndex(dialect: TypeScriptDialect): string {
    const template = this.templates.get('constants-index')
    if (!template) {
      throw new Error('Constants index template not found')
    }
    // Add fileName to each constant for the template
    const enumsWithFileNames = dialect.enums.map((e) => ({
      ...e,
      fileName: e.name.toLowerCase().replace(/_/g, '-'),
    }))
    return template({ ...dialect, enums: enumsWithFileNames })
  }

  generateMessages(dialect: TypeScriptDialect, includeEnums: boolean = false): string {
    const template = this.templates.get('messages')
    if (!template) {
      throw new Error('Messages template not found')
    }

    // Filter enums to only include those actually used in message fields
    const usedEnums = this.getUsedEnums(dialect)

    return template({ ...dialect, includeEnums, enums: usedEnums })
  }

  private getUsedEnums(dialect: TypeScriptDialect): TypeScriptEnum[] {
    // Collect all field types used in messages
    const usedTypes = new Set<string>()

    for (const message of dialect.messages) {
      for (const field of message.fields) {
        // Extract base type from array notation (e.g., "ESC_FAILURE_FLAGS[]" -> "ESC_FAILURE_FLAGS")
        let baseType = field.type
        if (baseType.endsWith('[]')) {
          baseType = baseType.slice(0, -2)
        }
        usedTypes.add(baseType)
      }
    }

    // Filter enums to only include those referenced in fields
    return dialect.enums.filter((enumDef) => usedTypes.has(enumDef.name))
  }

  generateIndex(dialect: TypeScriptDialect, includeEnums: boolean = false): string {
    const template = this.templates.get('index')
    if (!template) {
      throw new Error('Index template not found')
    }
    return template({ ...dialect, includeEnums })
  }

  generateSingle(dialect: TypeScriptDialect): string {
    const template = this.templates.get('single')
    if (!template) {
      throw new Error('Single template not found')
    }
    const context = {
      ...dialect,
      generateTypes: () => this.generateTypes(dialect, false),
      generateMessages: () => this.generateMessages(dialect, false),
    }
    return template(context)
  }

  generateDecoder(dialect: TypeScriptDialect): string {
    const template = this.templates.get('decoder')
    if (!template) {
      throw new Error('Decoder template not found')
    }
    return template(dialect)
  }

  generateParser(dialect: TypeScriptDialect): string {
    const template = this.templates.get('parser')
    if (!template) {
      throw new Error('Parser template not found')
    }
    return template(dialect)
  }

  generateMessageModule(context: {
    dialectName: string
    originalName: string
    name: string
    constantName: string
    id: number
    crcExtra: number
    fields: Array<{
      name: string
      type: string
      originalType: string
      arrayLength?: number
      extension?: boolean
      optional?: boolean
      description?: string[]
    }>
    description?: string[]
  }): string {
    const template = this.templates.get('message-module')
    if (!template) {
      throw new Error('Message module template not found')
    }
    return template(context)
  }

  generateFull(dialect: TypeScriptDialect): string {
    const template = this.templates.get('full')
    if (!template) {
      throw new Error('Full template not found')
    }
    return template(dialect)
  }

  generateMessagesReexport(dialect: TypeScriptDialect): string {
    const template = this.templates.get('messages-reexport')
    if (!template) {
      throw new Error('Messages re-export template not found')
    }
    return template(dialect)
  }
}
