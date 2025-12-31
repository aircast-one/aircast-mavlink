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

    // Enums template
    this.templates.set(
      'enums',
      Handlebars.compile(`// Auto-generated TypeScript enums for {{ dialectName }} dialect

{{#each enums}}
{{#each description}}
// {{ this }}
{{/each}}
export enum {{ name }}Enum {
{{#each values}}
{{#each description}}
  // {{ this }}
{{/each}}
  {{ name }} = {{ value }},
{{/each}}
}

// Type alias for compatibility
export type {{ name }} = {{ name }}Enum;

{{/each}}
{{#unless enums.length}}
// This dialect has no enums defined
export {};
{{/unless}}
`)
    )

    // Messages template
    this.templates.set(
      'messages',
      Handlebars.compile(`// Auto-generated TypeScript message interfaces for {{ dialectName }} dialect

import { ParsedMAVLinkMessage } from './types';
{{#if includeEnums}}
{{#if enums.length}}
import type {
{{#each enums}}
  {{ name }},
{{/each}}
} from './enums';
{{/if}}
{{else}}
{{#if enums.length}}
import type {
{{#each enums}}
  {{ name }},
{{/each}}
} from './types';
{{/if}}
{{/if}}

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

// Type guard functions
{{#each messages}}
export function is{{ name }}(msg: ParsedMAVLinkMessage): msg is ParsedMAVLinkMessage & { payload: Message{{ name }} } {
  return msg.message_name === '{{ originalName }}';
}
{{/each}}
`)
    )

    // Index template
    this.templates.set(
      'index',
      Handlebars.compile(`// Auto-generated TypeScript index file
// Exports all dialect types

export * from './types';
{{#if includeEnums}}
{{#if enums.length}}
export * from './enums';
{{/if}}
{{/if}}
export * from './messages';
export * from './decoder';
`)
    )

    // Single file template
    this.templates.set(
      'single',
      Handlebars.compile(`{{{ generateTypes this }}}

{{{ generateMessages this }}}
`)
    )

    // Combined decoder and parser template - imports from core modules
    this.templates.set(
      'decoder',
      Handlebars.compile(`// Auto-generated decoder and parser for {{{ dialectName }}} dialect
// Generated from MAVLink XML definitions

import {
  ParsedMAVLinkMessage,
  MAVLinkFrame,
  MessageDefinition,
  FieldDefinition,
  DialectParser,
  getFieldDefaultValue,
  sortFieldsByWireOrder,
  getFieldSize,
} from '../../../core';

// CRC_EXTRA values for each message type
{{{generateCrcExtra messages}}}

{{#if messages}}
const MESSAGE_DEFINITIONS: MessageDefinition[] = [
{{#each messages}}
  {
    id: {{ id }},
    name: '{{{ originalName }}}',
    fields: [
{{#each fields}}
      {
        name: '{{{ name }}}',
        type: '{{{ originalType }}}',
{{#if arrayLength}}
        arrayLength: {{ arrayLength }},
{{/if}}
{{#if extension}}
        extension: {{ extension }},
{{/if}}
      },
{{/each}}
    ]
  },
{{/each}}
];
{{else}}
const MESSAGE_DEFINITIONS: MessageDefinition[] = [];
{{/if}}

export class {{capitalize dialectName}}Parser extends DialectParser {
  constructor() {
    super('{{{ dialectName }}}');
    this.setCrcExtraTable(CRC_EXTRA);
    this.loadDefinitionsSync();
  }

  async loadDefinitions(): Promise<void> {
    this.loadDefinitionsSync();
  }

  private loadDefinitionsSync(): void {
    this.messageDefinitions.clear();
    for (const def of MESSAGE_DEFINITIONS) {
      this.messageDefinitions.set(def.id, def);
    }
  }
}

// Dialect-specific serializer
export class {{capitalize dialectName}}Serializer {
  private parser: {{capitalize dialectName}}Parser;

  constructor() {
    this.parser = new {{capitalize dialectName}}Parser();
  }

  serialize(message: Record<string, unknown> & { message_name: string }): Uint8Array {
    return this.parser.serializeMessage(message);
  }

  completeMessage(message: Record<string, unknown> & { message_name: string }): Record<string, unknown> {
    const definitions = Array.from((this.parser as any).messageDefinitions.values()) as MessageDefinition[];
    const messageDef = definitions.find(def => def.name === message.message_name);

    if (!messageDef) {
      throw new Error(\`Unknown message type: \${message.message_name}\`);
    }

    if (!message.payload || typeof message.payload !== 'object') {
      throw new Error(\`Message must have a 'payload' object containing the message fields.\`);
    }

    const messageFields = message.payload as Record<string, unknown>;
    const sortedFields = sortFieldsByWireOrder(messageDef.fields);

    const completedFields: Record<string, unknown> = { ...messageFields };
    for (const field of sortedFields) {
      if (completedFields[field.name] === undefined) {
        completedFields[field.name] = getFieldDefaultValue(field);
      }
    }

    return {
      ...message,
      payload: completedFields
    };
  }

  getSupportedMessages(): string[] {
    const definitions = Array.from((this.parser as any).messageDefinitions.values()) as MessageDefinition[];
    return definitions.map(def => def.name);
  }

  supportsMessage(messageName: string): boolean {
    const definitions = Array.from((this.parser as any).messageDefinitions.values()) as MessageDefinition[];
    return definitions.some(def => def.name === messageName);
  }
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
}
