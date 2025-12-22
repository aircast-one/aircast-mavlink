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

    // Combined decoder and parser template
    this.templates.set(
      'decoder',
      Handlebars.compile(`// Auto-generated decoder and parser for {{{ dialectName }}} dialect
// Generated from MAVLink XML definitions

// Embedded MAVLink CRC implementation
{{{generateCrcExtra messages}}}

class MAVLinkCRC {
  static calculate(data: Uint8Array, crcExtra: number): number {
    let crc = 0xffff;

    // Process all message bytes using MCRF4XX algorithm
    for (let i = 0; i < data.length; i++) {
      let tmp = data[i] ^ (crc & 0xff);
      tmp = (tmp ^ (tmp << 4)) & 0xff;
      crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
    }

    // Add CRC_EXTRA byte using the same algorithm
    let tmp = crcExtra ^ (crc & 0xff);
    tmp = (tmp ^ (tmp << 4)) & 0xff;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;

    return crc;
  }
  
  static validate(data: Uint8Array, messageId: number, receivedChecksum: number): boolean {
    const crcExtra = CRC_EXTRA[messageId];
    if (crcExtra === undefined) {
      return false;
    }
    
    const calculatedChecksum = this.calculate(data, crcExtra);
    return calculatedChecksum === receivedChecksum;
  }
}

// Parser types for MAVLink protocol parsing
interface ParsedMAVLinkMessage {
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

interface MAVLinkFrame {
  magic: number;
  length: number;
  incompatible_flags?: number; // v2 only
  compatible_flags?: number;   // v2 only
  sequence: number;
  system_id: number;
  component_id: number;
  message_id: number;
  payload: Uint8Array;
  checksum: number;
  signature?: Uint8Array; // v2 only, 13 bytes
  crc_ok?: boolean;
  protocol_version?: 1 | 2;
}

interface MessageDefinition {
  id: number;
  name: string;
  fields: FieldDefinition[];
}

interface FieldDefinition {
  name: string;
  type: string;
  arrayLength?: number;
  extension?: boolean;
}

type FieldValue = string | number | bigint | boolean | Array<string | number | bigint | boolean>;
type PayloadObject = Record<string, FieldValue>;
type DecodedValue = { value: FieldValue; bytesRead: number };

// Base dialect parser class
abstract class DialectParser {
  protected messageDefinitions: Map<number, MessageDefinition> = new Map();
  protected dialectName: string;
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(dialectName: string) {
    this.dialectName = dialectName;
  }

  abstract loadDefinitions(): Promise<void>;

  parseBytes(data: Uint8Array): ParsedMAVLinkMessage[] {
    const results: ParsedMAVLinkMessage[] = [];

    if (!data || data.length === 0) {
      return results;
    }

    // Append new data to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    let offset = 0;
    
    // Parse MAVLink frames from buffer
    while (offset < this.buffer.length) {
      const frameResult = this.tryParseFrame(this.buffer.slice(offset));
      
      if (frameResult.frame) {
        const message = this.decode(frameResult.frame);
        results.push(message);
        offset += frameResult.bytesConsumed;
      } else if (frameResult.bytesConsumed > 0) {
        // Skip invalid bytes
        offset += frameResult.bytesConsumed;
      } else {
        // Not enough data for a complete frame
        break;
      }
    }

    // Keep remaining data in buffer
    this.buffer = this.buffer.slice(offset);
    return results;
  }

  private tryParseFrame(data: Uint8Array): { frame?: MAVLinkFrame; bytesConsumed: number } {
    if (data.length < 8) {
      return { bytesConsumed: 0 };
    }

    let offset = 0;
    
    // Find magic byte
    while (offset < data.length && data[offset] !== 0xFE && data[offset] !== 0xFD) {
      offset++;
    }

    if (offset === data.length) {
      return { bytesConsumed: data.length };
    }

    const magic = data[offset];
    const isV2 = magic === 0xFD;

    if (data.length - offset < (isV2 ? 12 : 8)) {
      return { bytesConsumed: offset };
    }

    let frameOffset = offset;
    const frame: Partial<MAVLinkFrame> = { magic };

    frameOffset++;
    frame.length = data[frameOffset++];

    if (isV2) {
      frame.incompatible_flags = data[frameOffset++];
      frame.compatible_flags = data[frameOffset++];
    }

    frame.sequence = data[frameOffset++];
    frame.system_id = data[frameOffset++];
    frame.component_id = data[frameOffset++];
    frame.message_id = data[frameOffset++];

    if (isV2 && data.length - frameOffset >= 2) {
      frame.message_id |= (data[frameOffset++] << 8);
      frame.message_id |= (data[frameOffset++] << 16);
    }

    const totalLength = frameOffset - offset + frame.length + 2; // +2 for checksum
    if (data.length - offset < totalLength) {
      return { bytesConsumed: offset };
    }

    frame.payload = data.slice(frameOffset, frameOffset + frame.length);
    frameOffset += frame.length;

    frame.checksum = data[frameOffset] | (data[frameOffset + 1] << 8);
    frameOffset += 2;

    // Handle signature for v2
    if (isV2 && frame.incompatible_flags && (frame.incompatible_flags & 0x01)) {
      if (data.length - frameOffset >= 13) {
        frame.signature = data.slice(frameOffset, frameOffset + 13);
        frameOffset += 13;
      }
    }

    // Validate CRC using proper MAVLink algorithm
    const headerAndPayload = data.slice(offset + 1, offset + frameOffset - offset - 2);
    frame.crc_ok = MAVLinkCRC.validate(headerAndPayload, frame.message_id, frame.checksum);
    frame.protocol_version = isV2 ? 2 : 1;

    return { frame: frame as MAVLinkFrame, bytesConsumed: frameOffset - offset };
  }

  resetBuffer(): void {
    this.buffer = new Uint8Array(0);
  }

  decode(frame: MAVLinkFrame): ParsedMAVLinkMessage {
    const messageDef = this.messageDefinitions.get(frame.message_id);
    
    const protocolVersion = frame.protocol_version || (frame.magic === 0xFD ? 2 : 1);
    
    if (!messageDef) {
      return {
        timestamp: Date.now(),
        system_id: frame.system_id,
        component_id: frame.component_id,
        message_id: frame.message_id,
        message_name: \`UNKNOWN_\${frame.message_id}\`,
        sequence: frame.sequence,
        payload: {
          raw_payload: Array.from(frame.payload)
        },
        protocol_version: protocolVersion,
        checksum: frame.checksum,
        crc_ok: frame.crc_ok ?? true,
        signature: frame.signature,
        dialect: this.dialectName
      };
    }

    const payload = this.decodePayload(frame.payload, messageDef.fields);
    
    return {
      timestamp: Date.now(),
      system_id: frame.system_id,
      component_id: frame.component_id,
      message_id: frame.message_id,
      message_name: messageDef.name,
      sequence: frame.sequence,
      payload,
      protocol_version: protocolVersion,
      checksum: frame.checksum,
      crc_ok: frame.crc_ok ?? true,
      signature: frame.signature,
      dialect: this.dialectName
    };
  }

  private decodePayload(payload: Uint8Array, fields: FieldDefinition[]): PayloadObject {
    const result: PayloadObject = {};
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let offset = 0;

    // MAVLink v2 wire format: fields are sorted by type size (largest first)
    // Extension fields come after core fields and maintain their XML order
    // See: https://mavlink.io/en/guide/serialization.html#field_reordering
    const sortedFields = this.sortFieldsByWireOrder(fields);

    for (const field of sortedFields) {
      if (offset >= payload.length) {
        result[field.name] = this.getDefaultValue(field);
      } else {
        const { value, bytesRead } = this.decodeField(view, offset, field);
        result[field.name] = value;
        offset += bytesRead;
      }
    }

    return result;
  }

  // Sort fields by MAVLink v2 wire order: by type size descending, extensions last
  // Uses stable sort to preserve original order for same-size fields
  private sortFieldsByWireOrder(fields: FieldDefinition[]): FieldDefinition[] {
    // Separate core fields and extension fields
    const coreFields: Array<{ field: FieldDefinition; originalIndex: number }> = [];
    const extensionFields: FieldDefinition[] = [];

    fields.forEach((field, index) => {
      if (field.extension) {
        extensionFields.push(field);
      } else {
        coreFields.push({ field, originalIndex: index });
      }
    });

    // Stable sort core fields by type size (descending)
    // Arrays are sorted by element type size, not total array size
    coreFields.sort((a, b) => {
      const sizeA = this.getFieldTypeSize(a.field);
      const sizeB = this.getFieldTypeSize(b.field);
      if (sizeB !== sizeA) {
        return sizeB - sizeA; // Descending order (largest first)
      }
      // Same size: maintain original XML order (stable sort)
      return a.originalIndex - b.originalIndex;
    });

    // Extension fields maintain their XML order and come after core fields
    return [...coreFields.map(c => c.field), ...extensionFields];
  }

  // Get the size of a single element of a field type (for wire order sorting)
  private getFieldTypeSize(field: FieldDefinition): number {
    let baseType = field.type;
    // Strip array notation to get base type (arrays sort by element type, not total size)
    if (baseType.includes('[') && baseType.includes(']')) {
      baseType = baseType.substring(0, baseType.indexOf('['));
    }
    return this.getSingleFieldSize(baseType);
  }

  private getDefaultValue(field: FieldDefinition): FieldValue {
    const isArray = field.arrayLength !== undefined && field.arrayLength > 1;
    
    if (isArray) {
      return [];
    }

    switch (field.type) {
      case 'uint8_t':
      case 'int8_t':
      case 'uint16_t':
      case 'int16_t':
      case 'uint32_t':
      case 'int32_t':
      case 'float':
      case 'double':
        return 0;
      case 'uint64_t':
      case 'int64_t':
        return 0n;
      case 'char':
        return '\\0';
      default:
        if (field.type.startsWith('char[') || field.type.includes('[]')) {
          return '';
        }
        return 0;
    }
  }

  private decodeField(view: DataView, offset: number, field: FieldDefinition): DecodedValue {
    const isArray = field.arrayLength !== undefined;
    const arrayLength = field.arrayLength || 1;
    
    if (isArray && arrayLength > 1) {
      // Strip array notation from type to avoid double processing
      let baseType = field.type;
      if (baseType.includes('[') && baseType.includes(']')) {
        baseType = baseType.substring(0, baseType.indexOf('['));
      }
      
      // Special handling for char arrays - return as string
      if (baseType === 'char') {
        const chars: string[] = [];
        let totalBytes = 0;
        
        for (let i = 0; i < arrayLength; i++) {
          if (offset + totalBytes >= view.byteLength) break;
          const charCode = view.getUint8(offset + totalBytes);
          if (charCode === 0) break; // Null terminator
          chars.push(String.fromCharCode(charCode));
          totalBytes += 1;
        }
        
        // Return string value and total bytes for the array
        return { value: chars.join(''), bytesRead: arrayLength }; // Always consume full array size
      }
      
      // Handle other array types
      const values: (string | number | bigint | boolean)[] = [];
      let totalBytes = 0;
      
      for (let i = 0; i < arrayLength; i++) {
        if (offset + totalBytes >= view.byteLength) break;
        const { value, bytesRead } = this.decodeSingleValue(view, offset + totalBytes, baseType);
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
          values.push(value);
        }
        totalBytes += bytesRead;
      }
      
      return { value: values, bytesRead: totalBytes };
    } else {
      return this.decodeSingleValue(view, offset, field.type);
    }
  }

  private decodeSingleValue(view: DataView, offset: number, type: string): DecodedValue {
    try {
      switch (type) {
        case 'uint8_t':
          return { value: view.getUint8(offset), bytesRead: 1 };
        case 'int8_t':
          return { value: view.getInt8(offset), bytesRead: 1 };
        case 'uint16_t':
          return { value: view.getUint16(offset, true), bytesRead: 2 };
        case 'int16_t':
          return { value: view.getInt16(offset, true), bytesRead: 2 };
        case 'uint32_t':
          return { value: view.getUint32(offset, true), bytesRead: 4 };
        case 'int32_t':
          return { value: view.getInt32(offset, true), bytesRead: 4 };
        case 'uint64_t':
          return { value: view.getBigUint64(offset, true), bytesRead: 8 };
        case 'int64_t':
          return { value: view.getBigInt64(offset, true), bytesRead: 8 };
        case 'float':
          return { value: view.getFloat32(offset, true), bytesRead: 4 };
        case 'double':
          return { value: view.getFloat64(offset, true), bytesRead: 8 };
        case 'char': {
          const charCode = view.getUint8(offset);
          return { value: charCode === 0 ? '\\0' : String.fromCharCode(charCode), bytesRead: 1 };
        }
        default:
          if (type.startsWith('char[') && type.endsWith(']')) {
            const length = parseInt(type.slice(5, -1));
            const chars: string[] = [];
            for (let i = 0; i < length && offset + i < view.byteLength; i++) {
              const charCode = view.getUint8(offset + i);
              if (charCode === 0) break;
              chars.push(String.fromCharCode(charCode));
            }
            return { value: chars.join(''), bytesRead: length };
          } else if (type.includes('[') && type.includes(']')) {
            const baseType = type.substring(0, type.indexOf('['));
            const arrayLength = parseInt(type.substring(type.indexOf('[') + 1, type.indexOf(']')));
            const values: (string | number | bigint | boolean)[] = [];
            let totalBytes = 0;
            
            for (let i = 0; i < arrayLength; i++) {
              if (offset + totalBytes >= view.byteLength) break;
              const { value, bytesRead } = this.decodeSingleValue(view, offset + totalBytes, baseType);
              if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
                values.push(value);
              }
              totalBytes += bytesRead;
            }
            
            return { value: values, bytesRead: totalBytes };
          }
          return { value: view.getUint8(offset), bytesRead: 1 };
      }
    } catch (error) {
      return { value: 0, bytesRead: 1 };
    }
  }

  getMessageDefinition(id: number): MessageDefinition | undefined {
    return this.messageDefinitions.get(id);
  }

  getSupportedMessageIds(): number[] {
    return Array.from(this.messageDefinitions.keys()).sort((a, b) => a - b);
  }

  getDialectName(): string {
    return this.dialectName;
  }

  supportsMessage(messageId: number): boolean {
    return this.messageDefinitions.has(messageId);
  }

  // Serialization methods for outgoing commands
  serializeMessage(message: Record<string, unknown> & { message_name: string }): Uint8Array {
    const messageDef = Array.from(this.messageDefinitions.values())
      .find(def => def.name === message.message_name);
    
    if (!messageDef) {
      throw new Error(\`Unknown message type: \${message.message_name}\`);
    }

    // Extract fields from either flat structure or payload structure
    const messageFields = this.extractMessageFields(message, messageDef.fields);
    
    // Complete the message with all defined fields (including extension fields with defaults)
    const completeMessage = this.completeMessageWithDefaults(messageFields, messageDef.fields);
    
    const payload = this.serializePayload(completeMessage, messageDef.fields);
    return this.createMAVLinkFrame(message, messageDef.id, payload);
  }

  // Extract message fields from payload structure (payload format required)
  private extractMessageFields(
    message: Record<string, unknown>, 
    fieldDefinitions: FieldDefinition[]
  ): Record<string, unknown> {
    // Require payload structure
    if (!message.payload || typeof message.payload !== 'object') {
      throw new Error(\`Message must have a 'payload' object containing the message fields. Expected format: { message_name: '...', system_id: 1, component_id: 1, sequence: 0, payload: { ...fields } }\`);
    }
    
    return message.payload as Record<string, unknown>;
  }

  // Helper method to complete message with all defined fields
  private completeMessageWithDefaults(
    message: Record<string, unknown>, 
    fields: FieldDefinition[]
  ): Record<string, unknown> {
    const completeMessage = { ...message };
    
    for (const field of fields) {
      if (completeMessage[field.name] === undefined) {
        completeMessage[field.name] = this.getDefaultValueForField(field);
      }
    }
    
    return completeMessage;
  }

  // Get default value for a field based on its definition
  private getDefaultValueForField(field: FieldDefinition): unknown {
    const isArray = field.arrayLength !== undefined && field.arrayLength > 1;
    
    if (isArray) {
      return [];
    }

    let baseType = field.type;
    if (baseType.includes('[') && baseType.includes(']')) {
      baseType = baseType.substring(0, baseType.indexOf('['));
    }

    switch (baseType) {
      case 'uint8_t':
      case 'int8_t':
      case 'uint16_t':
      case 'int16_t':
      case 'uint32_t':
      case 'int32_t':
      case 'float':
      case 'double':
        return 0;
      case 'uint64_t':
      case 'int64_t':
        return 0n;
      case 'char':
        return field.type.includes('[') ? '' : '\\0';
      default:
        return 0;
    }
  }

  private serializePayload(message: Record<string, unknown>, fields: FieldDefinition[]): Uint8Array {
    // MAVLink v2 wire format: fields must be sorted by type size (largest first)
    // Extension fields come after core fields and maintain their XML order
    // See: https://mavlink.io/en/guide/serialization.html#field_reordering
    const sortedFields = this.sortFieldsByWireOrder(fields);

    // Calculate total payload size
    let totalSize = 0;
    for (const field of sortedFields) {
      totalSize += this.getFieldSize(field);
    }

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    for (const field of sortedFields) {
      const value = message[field.name];
      const bytesWritten = this.serializeField(view, offset, field, value);
      offset += bytesWritten;
    }

    // Implement MAVLink payload trimming: remove trailing zero bytes from extension fields only
    // This is required for proper handling of extension fields
    const fullPayload = new Uint8Array(buffer);

    // Calculate minimum payload size (core fields only)
    let corePayloadSize = 0;
    let extensionStartOffset = 0;
    let hasExtensions = false;

    for (const field of sortedFields) {
      const fieldSize = this.getFieldSize(field);

      // Check if this is an extension field using proper XML-based detection
      const isExtensionField = field.extension === true;

      if (isExtensionField) {
        if (!hasExtensions) {
          extensionStartOffset = corePayloadSize;
          hasExtensions = true;
        }
        // Don't add extension field sizes to core payload size
      } else {
        // This is a core field - always add to core payload size
        corePayloadSize += fieldSize;
      }
    }
    
    // If there are no extension fields, don't trim at all
    if (!hasExtensions) {
      return fullPayload;
    }
    
    // Find the last non-zero byte in extension fields only
    let trimmedLength = fullPayload.length;
    
    // If we have extensions, check if they contain any non-zero bytes
    if (hasExtensions && extensionStartOffset < fullPayload.length) {
      // Look for non-zero bytes in the extension section
      let hasNonZeroExtensions = false;
      for (let i = extensionStartOffset; i < fullPayload.length; i++) {
        if (fullPayload[i] !== 0) {
          hasNonZeroExtensions = true;
          break;
        }
      }
      
      if (!hasNonZeroExtensions) {
        // All extension fields are zero, trim them all
        trimmedLength = corePayloadSize;
      } else {
        // Find the last non-zero byte in extension fields
        for (let i = fullPayload.length - 1; i >= extensionStartOffset; i--) {
          if (fullPayload[i] !== 0) {
            trimmedLength = i + 1;
            break;
          }
        }
      }
    }
    
    // Never trim below the core payload size
    if (trimmedLength < corePayloadSize) {
      trimmedLength = corePayloadSize;
    }

    // Return trimmed payload if it's shorter than the original
    if (trimmedLength < fullPayload.length) {
      return fullPayload.slice(0, trimmedLength);
    }
    
    return fullPayload;
  }

  private serializeField(view: DataView, offset: number, field: FieldDefinition, value: unknown): number {
    const isArray = field.arrayLength !== undefined;
    const arrayLength = field.arrayLength || 1;
    
    if (isArray && arrayLength > 1) {
      let totalBytes = 0;
      let baseType = field.type;
      if (baseType.includes('[') && baseType.includes(']')) {
        baseType = baseType.substring(0, baseType.indexOf('['));
      }
      
      // Special handling for char arrays - treat string as char array
      if (baseType === 'char' && typeof value === 'string') {
        const str = value as string;
        for (let i = 0; i < arrayLength; i++) {
          const charCode = i < str.length ? str.charCodeAt(i) : 0;
          view.setUint8(offset + totalBytes, charCode);
          totalBytes += 1;
        }
        return totalBytes;
      }
      
      // Handle other array types
      const arrayValue = Array.isArray(value) ? value : [value];
      for (let i = 0; i < arrayLength; i++) {
        const itemValue = i < arrayValue.length ? arrayValue[i] : this.getDefaultValueForType(baseType);
        const bytesWritten = this.serializeSingleValue(view, offset + totalBytes, baseType, itemValue);
        totalBytes += bytesWritten;
      }
      return totalBytes;
    } else {
      return this.serializeSingleValue(view, offset, field.type, value);
    }
  }

  private serializeSingleValue(view: DataView, offset: number, type: string, value: unknown): number {
    const actualValue = value ?? this.getDefaultValueForType(type);
    
    switch (type) {
      case 'uint8_t':
        view.setUint8(offset, Number(actualValue));
        return 1;
      case 'int8_t':
        view.setInt8(offset, Number(actualValue));
        return 1;
      case 'uint16_t':
        view.setUint16(offset, Number(actualValue), true);
        return 2;
      case 'int16_t':
        view.setInt16(offset, Number(actualValue), true);
        return 2;
      case 'uint32_t':
        view.setUint32(offset, Number(actualValue), true);
        return 4;
      case 'int32_t':
        view.setInt32(offset, Number(actualValue), true);
        return 4;
      case 'uint64_t':
        view.setBigUint64(offset, typeof actualValue === 'bigint' ? actualValue : BigInt(Number(actualValue) || 0), true);
        return 8;
      case 'int64_t':
        view.setBigInt64(offset, typeof actualValue === 'bigint' ? actualValue : BigInt(Number(actualValue) || 0), true);
        return 8;
      case 'float':
        view.setFloat32(offset, Number(actualValue), true);
        return 4;
      case 'double':
        view.setFloat64(offset, Number(actualValue), true);
        return 8;
      case 'char':
        view.setUint8(offset, typeof actualValue === 'string' ? actualValue.charCodeAt(0) : Number(actualValue));
        return 1;
      default:
        if (type.startsWith('char[') && type.endsWith(']')) {
          const length = parseInt(type.slice(5, -1));
          const str = String(actualValue);
          for (let i = 0; i < length; i++) {
            const charCode = i < str.length ? str.charCodeAt(i) : 0;
            view.setUint8(offset + i, charCode);
          }
          return length;
        }
        view.setUint8(offset, Number(actualValue));
        return 1;
    }
  }


  private getFieldSize(field: FieldDefinition | string): number {
    if (typeof field === 'string') {
      // Legacy support for type string
      if (field.includes('[') && field.includes(']')) {
        const baseType = field.substring(0, field.indexOf('['));
        const arrayLength = parseInt(field.substring(field.indexOf('[') + 1, field.indexOf(']')));
        return this.getSingleFieldSize(baseType) * arrayLength;
      }
      return this.getSingleFieldSize(field);
    }
    
    // Handle FieldDefinition object
    const type = field.type;
    const arrayLength = field.arrayLength;
    
    if (arrayLength && arrayLength > 1) {
      return this.getSingleFieldSize(type) * arrayLength;
    }
    
    if (type.includes('[') && type.includes(']')) {
      const baseType = type.substring(0, type.indexOf('['));
      const parsedArrayLength = parseInt(type.substring(type.indexOf('[') + 1, type.indexOf(']')));
      return this.getSingleFieldSize(baseType) * parsedArrayLength;
    }
    
    return this.getSingleFieldSize(type);
  }

  private getSingleFieldSize(type: string): number {
    switch (type) {
      case 'uint8_t':
      case 'int8_t':
      case 'char':
        return 1;
      case 'uint16_t':
      case 'int16_t':
        return 2;
      case 'uint32_t':
      case 'int32_t':
      case 'float':
        return 4;
      case 'uint64_t':
      case 'int64_t':
      case 'double':
        return 8;
      default:
        return 1;
    }
  }

  private getDefaultValueForType(type: string): number | bigint {
    switch (type) {
      case 'uint8_t':
      case 'int8_t':
      case 'uint16_t':
      case 'int16_t':
      case 'uint32_t':
      case 'int32_t':
      case 'float':
      case 'double':
        return 0;
      case 'uint64_t':
      case 'int64_t':
        return 0n;
      case 'char':
        return 0;
      default:
        return 0;
    }
  }

  private createMAVLinkFrame(message: Record<string, unknown>, messageId: number, payload: Uint8Array): Uint8Array {
    const systemId = typeof message.system_id === 'number' ? message.system_id : 1;
    const componentId = typeof message.component_id === 'number' ? message.component_id : 1;
    const sequence = typeof message.sequence === 'number' ? message.sequence : 0;
    
    // Automatically determine protocol version based on message requirements
    const needsV2 = messageId > 255; // v1 only supports 8-bit message IDs (0-255)
    const userSpecifiedVersion = typeof message.protocol_version === 'number' ? message.protocol_version : null;
    
    // Use user-specified version if provided, otherwise auto-detect
    const protocolVersion = userSpecifiedVersion !== null ? userSpecifiedVersion : (needsV2 ? 2 : 1);
    const isV2 = protocolVersion === 2;
    const magic = isV2 ? 0xFD : 0xFE;
    
    // Calculate frame size based on protocol version
    const headerSize = isV2 ? 10 : 6; // v2 has extra fields
    const frameSize = headerSize + payload.length + 2;
    const buffer = new ArrayBuffer(frameSize);
    const view = new DataView(buffer);
    
    let offset = 0;
    
    // Header
    view.setUint8(offset++, magic);
    view.setUint8(offset++, payload.length);
    
    if (isV2) {
      // MAVLink v2: magic(1) + len(1) + incompat_flags(1) + compat_flags(1) + seq(1) + sysid(1) + compid(1) + msgid(3) + payload + checksum(2)
      view.setUint8(offset++, 0); // incompat_flags
      view.setUint8(offset++, 0); // compat_flags
      view.setUint8(offset++, sequence);
      view.setUint8(offset++, systemId);
      view.setUint8(offset++, componentId);
      // 24-bit message ID in v2
      view.setUint8(offset++, messageId & 0xFF);
      view.setUint8(offset++, (messageId >> 8) & 0xFF);
      view.setUint8(offset++, (messageId >> 16) & 0xFF);
    } else {
      // MAVLink v1: magic(1) + len(1) + seq(1) + sysid(1) + compid(1) + msgid(1) + payload + checksum(2)
      view.setUint8(offset++, sequence);
      view.setUint8(offset++, systemId);
      view.setUint8(offset++, componentId);
      view.setUint8(offset++, messageId & 0xFF); // 8-bit message ID in v1
    }
    
    // Payload
    const payloadView = new Uint8Array(buffer, offset, payload.length);
    payloadView.set(payload);
    offset += payload.length;
    
    // Calculate proper MAVLink CRC with CRC_EXTRA
    const crcExtra = CRC_EXTRA[messageId];
    if (crcExtra === undefined) {
      throw new Error("No CRC_EXTRA defined for message ID " + messageId);
    }
    
    // Get message data (exclude start byte and checksum)
    const messageData = new Uint8Array(buffer, 1, offset - 1);
    const checksum = MAVLinkCRC.calculate(messageData, crcExtra);
    
    // Checksum (little endian)
    view.setUint8(offset++, checksum & 0xFF);
    view.setUint8(offset++, (checksum >> 8) & 0xFF);
    
    return new Uint8Array(buffer);
  }
}

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
    this.loadDefinitionsSync();
  }

  async loadDefinitions(): Promise<void> {
    this.messageDefinitions.clear();
    for (const def of MESSAGE_DEFINITIONS) {
      this.messageDefinitions.set(def.id, def);
    }
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

  // Serialize a message to MAVLink bytes
  serialize(message: Record<string, unknown> & { message_name: string }): Uint8Array {
    return this.parser.serializeMessage(message);
  }

  // Complete a message with all defined fields (including extension fields with defaults)
  // This is useful to see what the serializer would send without actually serializing
  // Requires payload structure format
  completeMessage(message: Record<string, unknown> & { message_name: string }): Record<string, unknown> {
    const messageDef = Array.from(this.parser['messageDefinitions'].values())
      .find(def => def.name === message.message_name);
    
    if (!messageDef) {
      throw new Error(\`Unknown message type: \${message.message_name}\`);
    }

    // Extract fields from payload structure (throws error if not payload format)
    const messageFields = this.parser['extractMessageFields'](message, messageDef.fields);
    
    // Complete the message with defaults
    const completedFields = this.parser['completeMessageWithDefaults'](messageFields, messageDef.fields);
    
    // Return in the payload structure format
    return {
      ...message,
      payload: completedFields
    };
  }

  // Get supported message names for this dialect
  getSupportedMessages(): string[] {
    return Array.from(this.parser['messageDefinitions'].values()).map(def => def.name);
  }

  // Check if a message is supported by this dialect
  supportsMessage(messageName: string): boolean {
    return Array.from(this.parser['messageDefinitions'].values()).some(def => def.name === messageName);
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
