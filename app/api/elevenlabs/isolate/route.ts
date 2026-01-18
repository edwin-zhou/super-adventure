import { NextRequest, NextResponse } from 'next/server'
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

export async function POST(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY environment variable is not set' },
      { status: 500 }
    )
  }

  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      )
    }

    console.log(`[ElevenLabs Isolate] Processing audio: ${audioFile.name}, size: ${audioFile.size} bytes, type: ${audioFile.type}`)
    
    const client = new ElevenLabsClient({ apiKey })
    
    // Convert File to Blob for the API
    const audioBlob = new Blob([await audioFile.arrayBuffer()], { type: audioFile.type })
    
    const isolatedAudioStream = await client.audioIsolation.convert({
      audio: audioBlob,
    })

    console.log('[ElevenLabs Isolate] Voice isolation completed, collecting stream...')
    
    // Collect the stream into a buffer
    const chunks: Uint8Array[] = []
    for await (const chunk of isolatedAudioStream) {
      chunks.push(chunk)
    }
    
    // Concatenate all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const audioBuffer = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      audioBuffer.set(chunk, offset)
      offset += chunk.length
    }
    
    console.log(`[ElevenLabs Isolate] Collected ${audioBuffer.length} bytes of isolated audio`)
    
    // Return the audio as a response
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.length),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[ElevenLabs Isolate] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: `Voice isolation failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}
