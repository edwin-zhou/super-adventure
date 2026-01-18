import { NextResponse } from 'next/server'

/**
 * POST /api/elevenlabs/token
 * 
 * Generates a single-use token for Scribe v2 Realtime WebSocket authentication.
 * This token is required to connect to the ElevenLabs Scribe STT service.
 */
export async function POST() {
  console.log('[ElevenLabs Token] Request received')
  
  const apiKey = process.env.ELEVENLABS_API_KEY

  if (!apiKey) {
    console.error('[ElevenLabs Token] ELEVENLABS_API_KEY not set')
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY environment variable is not set' },
      { status: 500 }
    )
  }

  console.log('[ElevenLabs Token] API key found, requesting token...')

  try {
    const response = await fetch(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
      }
    )

    console.log('[ElevenLabs Token] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[ElevenLabs Token] Error response:', errorText)
      return NextResponse.json(
        { error: 'Failed to generate Scribe token' },
        { status: response.status }
      )
    }

    const data = await response.json()
    console.log('[ElevenLabs Token] Token generated successfully, length:', data.token?.length || 0)
    return NextResponse.json({ token: data.token })
  } catch (error) {
    console.error('[ElevenLabs Token] Exception:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
