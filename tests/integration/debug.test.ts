import {
  ArdupilotmegaParser,
  ArdupilotmegaSerializer,
} from '../../src/generated/dialects/ardupilotmega/full'

describe('Debug Tests', () => {
  test('MEMINFO debug', () => {
    const parser = new ArdupilotmegaParser()
    const serializer = new ArdupilotmegaSerializer()

    const message = {
      message_name: 'MEMINFO',
      system_id: 1,
      component_id: 1,
      sequence: 0,
      payload: {
        brkval: 65536,
        freemem: 32768,
        freemem32: 1048576,
      },
    }

    console.log('Original message:', message)

    const bytes = serializer.serialize(message)
    console.log(
      'Serialized bytes:',
      Array.from(bytes)
        .map((b) => '0x' + b.toString(16).padStart(2, '0'))
        .join(' ')
    )

    const parsed = parser.parseBytes(bytes)
    console.log('Parsed messages:', parsed)
    if (parsed.length > 0) {
      console.log('Parsed payload:', parsed[0].payload)
    }

    expect(parsed).toHaveLength(1)
  })
})
