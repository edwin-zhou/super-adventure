'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useScribe, CommitStrategy } from '@elevenlabs/react'

interface UseVoiceAgentOptions {
  /** Called when a transcript is committed and should be sent to the agent */
  onSubmit: (text: string) => Promise<string>
  /** Called when an error occurs */
  onError?: (error: string) => void
}

interface UseVoiceAgentReturn {
  // State
  isVoiceMode: boolean
  isListening: boolean
  isAgentTurn: boolean
  isSpeaking: boolean
  partialTranscript: string
  error: string | null
  
  // Actions
  startSession: () => Promise<void>
  stopSession: () => void
}

// Track the current playing audio instance to interrupt previous playback
let currentAudioInstance: HTMLAudioElement | null = null

/**
 * Plays text as speech using the TTS API
 * Interrupts any currently playing audio before starting new playback
 */
async function speakText(text: string): Promise<void> {
  // Stop and clean up any currently playing audio
  if (currentAudioInstance) {
    try {
      currentAudioInstance.pause()
      currentAudioInstance.currentTime = 0
      // Clean up the previous audio URL if it exists
      if (currentAudioInstance.src && currentAudioInstance.src.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioInstance.src)
      }
    } catch (err) {
      console.warn('Error stopping previous audio:', err)
    }
    currentAudioInstance = null
  }

  const response = await fetch('/api/elevenlabs/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!response.ok) {
    throw new Error('TTS request failed')
  }

  const audioBlob = await response.blob()
  const audioUrl = URL.createObjectURL(audioBlob)
  
  return new Promise((resolve, reject) => {
    const audio = new Audio(audioUrl)
    currentAudioInstance = audio
    
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl)
      if (currentAudioInstance === audio) {
        currentAudioInstance = null
      }
      resolve()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl)
      if (currentAudioInstance === audio) {
        currentAudioInstance = null
      }
      reject(new Error('Audio playback failed'))
    }
    audio.play().catch((err) => {
      URL.revokeObjectURL(audioUrl)
      if (currentAudioInstance === audio) {
        currentAudioInstance = null
      }
      reject(err)
    })
  })
}

/**
 * Custom hook for managing voice agent sessions with ElevenLabs Scribe STT and TTS.
 * 
 * Features:
 * - Turn-based conversation flow
 * - VAD-based automatic commit (commits after silence)
 * - TTS playback of agent responses
 * - Auto-resume listening after agent responds
 */
export function useVoiceAgent({ onSubmit, onError }: UseVoiceAgentOptions): UseVoiceAgentReturn {
  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [isAgentTurn, setIsAgentTurn] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Track if we should resume listening after agent turn
  const shouldResumeRef = useRef(false)
  // Track if session is being stopped
  const stoppingRef = useRef(false)

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 1.5,
    vadThreshold: 0.5,
    minSpeechDurationMs: 200,
    minSilenceDurationMs: 800,
    languageCode: 'en',
    
    onCommittedTranscript: async (data) => {
      if (stoppingRef.current) return
      if (!data.text || data.text.trim() === '') return
      
      const transcriptText = data.text
      
      // Pause listening while agent processes - disconnect to stop transcription
      setIsAgentTurn(true)
      shouldResumeRef.current = true
      stoppingRef.current = true // Mark as intentional disconnect
      scribe.disconnect()
      stoppingRef.current = false // Reset for resume
      
      try {
        // Send to agent and get response
        const response = await onSubmit(transcriptText)
        
        if (stoppingRef.current) return
        
        // Start TTS playback in background (don't wait for it)
        setIsSpeaking(true)
        speakText(response).finally(() => {
          setIsSpeaking(false)
        })
        
        // Resume listening immediately - reconnect
        if (shouldResumeRef.current && !stoppingRef.current) {
          // Fetch new token and reconnect
          const tokenResponse = await fetch('/api/elevenlabs/token', { method: 'POST' })
          if (tokenResponse.ok) {
            const { token } = await tokenResponse.json()
            await scribe.connect({
              token,
              modelId: 'scribe_v2_realtime',
              microphone: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            })
          }
          setIsAgentTurn(false)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError(errorMessage)
        onError?.(errorMessage)
        setIsAgentTurn(false)
        setIsSpeaking(false)
      }
    },
    
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'Scribe error'
      setError(errorMessage)
      onError?.(errorMessage)
    },
    
    onAuthError: (data) => {
      setError(`Authentication failed: ${data.error}`)
      onError?.(`Authentication failed: ${data.error}`)
    },
    
    onInputError: (data) => {
      setError(`Audio input error: ${data.error}`)
      onError?.(`Audio input error: ${data.error}`)
    },
    
    onDisconnect: () => {
      if (!stoppingRef.current) {
        // Unexpected disconnect
        setIsVoiceMode(false)
        setIsAgentTurn(false)
        setIsSpeaking(false)
      }
    },
  })

  const startSession = useCallback(async () => {
    try {
      setError(null)
      stoppingRef.current = false
      
      // Fetch token
      const response = await fetch('/api/elevenlabs/token', { method: 'POST' })
      if (!response.ok) {
        throw new Error('Failed to fetch Scribe token')
      }
      const { token } = await response.json()
      
      // Connect to Scribe
      await scribe.connect({
        token,
        modelId: 'scribe_v2_realtime',
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      
      setIsVoiceMode(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start voice session'
      setError(errorMessage)
      onError?.(errorMessage)
    }
  }, [scribe, onError])

  const stopSession = useCallback(() => {
    stoppingRef.current = true
    shouldResumeRef.current = false
    
    // Stop any currently playing audio
    if (currentAudioInstance) {
      try {
        currentAudioInstance.pause()
        currentAudioInstance.currentTime = 0
        if (currentAudioInstance.src && currentAudioInstance.src.startsWith('blob:')) {
          URL.revokeObjectURL(currentAudioInstance.src)
        }
      } catch (err) {
        console.warn('Error stopping audio on session stop:', err)
      }
      currentAudioInstance = null
    }
    
    scribe.disconnect()
    scribe.clearTranscripts()
    
    setIsVoiceMode(false)
    setIsAgentTurn(false)
    setIsSpeaking(false)
    setError(null)
  }, [scribe])

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      stoppingRef.current = true
      // Stop any currently playing audio on unmount
      if (currentAudioInstance) {
        try {
          currentAudioInstance.pause()
          currentAudioInstance.currentTime = 0
          if (currentAudioInstance.src && currentAudioInstance.src.startsWith('blob:')) {
            URL.revokeObjectURL(currentAudioInstance.src)
          }
        } catch (err) {
          console.warn('Error stopping audio on unmount:', err)
        }
        currentAudioInstance = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    // State
    isVoiceMode,
    isListening: isVoiceMode && !isAgentTurn && scribe.isConnected,
    isAgentTurn,
    isSpeaking,
    partialTranscript: scribe.partialTranscript,
    error,
    
    // Actions
    startSession,
    stopSession,
  }
}
