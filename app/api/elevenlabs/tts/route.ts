import { NextRequest, NextResponse } from 'next/server'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

// Default voice ID - "Rachel" voice (warm, conversational)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

/**
 * POST /api/elevenlabs/tts
 * 
 * Converts text to speech using ElevenLabs TTS API.
 * Returns an audio stream that can be played in the browser.
 * 
 * Body: { text: string, voiceId?: string }
 * Returns: audio/mpeg stream
 */
export async function POST(request: NextRequest) {
  console.log('[ElevenLabs TTS] Request received')
  
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    console.error('[ElevenLabs TTS] ELEVENLABS_API_KEY not set')
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY environment variable is not set' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { text, voiceId } = body

    console.log('[ElevenLabs TTS] Text length:', text?.length || 0, 'Voice ID:', voiceId || DEFAULT_VOICE_ID)

    if (!text || typeof text !== 'string') {
      console.error('[ElevenLabs TTS] Invalid text:', typeof text)
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      )
    }

    console.log('[ElevenLabs TTS] Creating client and converting text...')
    const client = new ElevenLabsClient({ apiKey })

    // Use eleven_flash_v2_5 for low latency
    const audioStream = await client.textToSpeech.convert(
      voiceId || DEFAULT_VOICE_ID,
      {
        text,
        modelId: 'eleven_flash_v2_5',
        outputFormat: 'mp3_44100_128',
      }
    )

    console.log('[ElevenLabs TTS] Audio stream received, returning response')

    // Convert the ReadableStream to a Response with proper headers
    return new Response(audioStream as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[ElevenLabs TTS] Exception:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `TTS conversion failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}
