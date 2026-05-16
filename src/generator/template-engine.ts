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
{{/each}};

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
export {};
{{/unless}}
`)
    )

    // Individual constant module template — closed union (no | number)
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

    // Constants index template
    this.templates.set(
      'constants-index',
      Handlebars.compile(`// Auto-generated constants for {{ dialectName }} dialect

{{#each enums}}
export * from './{{ fileName }}';
{{/each}}
{{#unless enums.length}}
export {};
{{/unless}}
`)
    )

    // Messages template (used for single-file format)
    this.templates.set(
      'messages',
      Handlebars.compile(`// Auto-generated message types for {{ dialectName }} dialect

{{#each messages}}
{{#each description}}
// {{ this }}
{{/each}}
export interface Message{{ name }} {
{{#each fields}}
  {{ name }}{{#if optional}}?{{/if}}: {{ type }};
{{/each}}
}

{{/each}}
`)
    )

    // Index template
    this.templates.set(
      'index',
      Handlebars.compile(`// {{ dialectName }} dialect
//
// Parser + Serializer:
//   import { {{capitalize dialectName}}Parser, {{capitalize dialectName}}Serializer } from '@aircast-one/mavlink/{{ dialectName }}'
//
// Typed messages:
//   import type { {{capitalize dialectName}}Message } from '@aircast-one/mavlink/{{ dialectName }}/messages'
//
// Constants:
//   import { MAV_TYPE_QUADROTOR } from '@aircast-one/mavlink/{{ dialectName }}/constants/mav-type'
//
// Core types:
//   import type { ParsedMAVLinkMessage } from '@aircast-one/mavlink'
`)
    )

    // Full bundle template — registers all messages with parser and serializer
    this.templates.set(
      'full',
      Handlebars.compile(`// Auto-generated full dialect bundle
// All messages are pre-registered with parser and serializer

export * from './parser';

import { registerMessage } from './parser';
{{#each messages}}
import { {{ name }}Definition } from './messages/{{ kebabCase originalName }}';
{{/each}}

// Register all messages
{{#each messages}}
registerMessage({{ name }}Definition);
{{/each}}
`)
    )

    // Messages re-export template (types + discriminated union + serialize re-exports)
    this.templates.set(
      'messages-reexport',
      Handlebars.compile(`// Auto-generated message type re-exports for {{ dialectName }} dialect

import type { ParsedMAVLinkMessage } from './types';
{{#each messages}}
import type { Message{{ name }} } from './messages/{{ kebabCase originalName }}';
{{/each}}

// Re-export message interfaces
{{#each messages}}
export type { Message{{ name }} };
{{/each}}

// Re-export serialize functions
{{#each messages}}
export { serialize{{ name }} } from './messages/{{ kebabCase originalName }}';
{{/each}}

// Message name literal type
export type {{ capitalize dialectName }}MessageName =
{{#each messages}}
  | '{{ originalName }}'
{{/each}};

// Discriminated union — narrows payload automatically via message_name
export type {{ capitalize dialectName }}Message =
{{#each messages}}
  | (Omit<ParsedMAVLinkMessage, 'message_name' | 'payload'> & { message_name: '{{ originalName }}'; payload: Message{{ name }} })
{{/each}};

// Message type map
export interface MessageTypeMap {
{{#each messages}}
  {{ originalName }}: Message{{ name }};
{{/each}}
}
`)
    )

    // Single file template
    this.templates.set(
      'single',
      Handlebars.compile(`{{{ generateTypes this }}}

{{{ generateMessages this }}}
`)
    )

    // Parser template — parser + standalone serializer
    this.templates.set(
      'parser',
      Handlebars.compile(`// Auto-generated parser for {{{ dialectName }}} dialect

import {
  MessageDefinition,
  SerializeOptions,
  DialectParser,
  MessageSerializer,
} from '../../../core';

// Shared definition registry
const DEFINITIONS: MessageDefinition[] = [];

/**
 * Register a message definition. Called by full.ts imports.
 */
export function registerMessage(definition: MessageDefinition): void {
  DEFINITIONS.push(definition);
}

export class {{capitalize dialectName}}Parser extends DialectParser {
  constructor() {
    super('{{{ dialectName }}}');
    for (const def of DEFINITIONS) {
      this.registerMessageDefinition(def);
    }
  }
}

/**
 * Standalone serializer — does not require a parser.
 * Pass message definitions to the constructor for selective registration,
 * or use no arguments to register all definitions from the /full import.
 */
export class {{capitalize dialectName}}Serializer {
  private readonly serializer: MessageSerializer;

  constructor(definitions?: MessageDefinition[]) {
    this.serializer = new MessageSerializer();
    const defs = definitions ?? DEFINITIONS;
    for (const def of defs) {
      this.serializer.registerDefinition(def);
    }
  }

  serialize(messageName: string, payload: Record<string, unknown>, options: SerializeOptions): Uint8Array {
    return this.serializer.serialize(messageName, payload, options);
  }
}
`)
    )

    // Individual message module template
    this.templates.set(
      'message-module',
      Handlebars.compile(`// Auto-generated message module for {{ originalName }}

import type { MessageDefinition, SerializeOptions } from '../../../../core';
import { MessageSerializer } from '../../../../core';

export const {{ name }}Definition: MessageDefinition = {
  id: {{ id }},
  name: '{{ originalName }}',
  crcExtra: {{ crcExtra }},
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

const _serializer = new MessageSerializer();
_serializer.registerDefinition({{ name }}Definition);

/**
 * Type-safe serialize function for {{ originalName }}.
 */
export function serialize{{ name }}(payload: Message{{ name }}, options: SerializeOptions): Uint8Array {
  return _serializer.serialize('{{ originalName }}', payload as unknown as Record<string, unknown>, options);
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

    Handlebars.registerHelper('basicType', (type: string) => {
      if (type.endsWith('[]')) {
        const baseType = type.slice(0, -2)
        if (baseType === 'string') return 'string[]'
        return 'number[]'
      }
      if (type === 'string') return 'string'
      if (type === 'bigint') return 'bigint'
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
    if (!template) throw new Error('Types template not found')
    return template({ ...dialect, includeEnums })
  }

  generateEnums(dialect: TypeScriptDialect): string {
    const template = this.templates.get('enums')
    if (!template) throw new Error('Enums template not found')
    return template(dialect)
  }

  generateConstantModule(enumDef: TypeScriptDialect['enums'][0]): string {
    const template = this.templates.get('constant-module')
    if (!template) throw new Error('Constant module template not found')
    return template(enumDef)
  }

  generateConstantsIndex(dialect: TypeScriptDialect): string {
    const template = this.templates.get('constants-index')
    if (!template) throw new Error('Constants index template not found')
    const enumsWithFileNames = dialect.enums.map((e) => ({
      ...e,
      fileName: e.name.toLowerCase().replace(/_/g, '-'),
    }))
    return template({ ...dialect, enums: enumsWithFileNames })
  }

  generateMessages(dialect: TypeScriptDialect, includeEnums: boolean = false): string {
    const template = this.templates.get('messages')
    if (!template) throw new Error('Messages template not found')
    const usedEnums = this.getUsedEnums(dialect)
    return template({ ...dialect, includeEnums, enums: usedEnums })
  }

  private getUsedEnums(dialect: TypeScriptDialect): TypeScriptEnum[] {
    const usedTypes = new Set<string>()
    for (const message of dialect.messages) {
      for (const field of message.fields) {
        let baseType = field.type
        if (baseType.endsWith('[]')) {
          baseType = baseType.slice(0, -2)
        }
        usedTypes.add(baseType)
      }
    }
    return dialect.enums.filter((enumDef) => usedTypes.has(enumDef.name))
  }

  generateIndex(dialect: TypeScriptDialect, includeEnums: boolean = false): string {
    const template = this.templates.get('index')
    if (!template) throw new Error('Index template not found')
    return template({ ...dialect, includeEnums })
  }

  generateSingle(dialect: TypeScriptDialect): string {
    const template = this.templates.get('single')
    if (!template) throw new Error('Single template not found')
    const context = {
      ...dialect,
      generateTypes: () => this.generateTypes(dialect, false),
      generateMessages: () => this.generateMessages(dialect, false),
    }
    return template(context)
  }

  generateDecoder(dialect: TypeScriptDialect): string {
    const template = this.templates.get('decoder')
    if (!template) throw new Error('Decoder template not found')
    return template(dialect)
  }

  generateParser(dialect: TypeScriptDialect): string {
    const template = this.templates.get('parser')
    if (!template) throw new Error('Parser template not found')
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
    if (!template) throw new Error('Message module template not found')
    return template(context)
  }

  generateFull(dialect: TypeScriptDialect): string {
    const template = this.templates.get('full')
    if (!template) throw new Error('Full template not found')
    return template(dialect)
  }

  generateMessagesReexport(dialect: TypeScriptDialect): string {
    const template = this.templates.get('messages-reexport')
    if (!template) throw new Error('Messages re-export template not found')
    return template(dialect)
  }
}
