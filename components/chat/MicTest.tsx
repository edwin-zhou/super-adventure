'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff, Volume2, Play, Square, Loader2, Sparkles, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useScribe, CommitStrategy } from '@elevenlabs/react'

/**
 * Simple mic test component with voice isolation and STT testing
 */
export function MicTest() {
  const [isListening, setIsListening] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isIsolating, setIsIsolating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [micInfo, setMicInfo] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [isolatedBlob, setIsolatedBlob] = useState<Blob | null>(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  
  // STT state
  const [sttActive, setSttActive] = useState(false)
  const [sttTranscripts, setSttTranscripts] = useState<string[]>([])
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Scribe STT hook
  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 1.5,
    vadThreshold: 0.5,
    minSpeechDurationMs: 200,
    minSilenceDurationMs: 800,
    languageCode: 'en',
    
    onConnect: () => {
      console.log('[MicTest STT] WebSocket connected')
    },
    
    onSessionStarted: () => {
      console.log('[MicTest STT] ✅ Session started - transcription active!')
    },
    
    onPartialTranscript: (data) => {
      console.log('[MicTest STT] 📝 Partial:', data.text)
    },
    
    onCommittedTranscript: (data) => {
      console.log('[MicTest STT] ✅ Committed:', data.text)
      if (data.text && data.text.trim()) {
        setSttTranscripts(prev => [...prev, data.text])
      }
    },
    
    onError: (err) => {
      console.error('[MicTest STT] ❌ Error:', err)
      setError(`STT Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
    
    onDisconnect: () => {
      console.log('[MicTest STT] Disconnected')
      setSttActive(false)
    },
  })

  const startSTT = useCallback(async () => {
    try {
      setError(null)
      console.log('[MicTest STT] Starting STT...')
      
      // Fetch token
      const response = await fetch('/api/elevenlabs/token', { method: 'POST' })
      if (!response.ok) {
        throw new Error('Failed to fetch Scribe token')
      }
      const { token } = await response.json()
      console.log('[MicTest STT] Token received')
      
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
      
      console.log('[MicTest STT] ✅ Connected to Scribe')
      setSttActive(true)
    } catch (err) {
      console.error('[MicTest STT] Failed to start:', err)
      setError(err instanceof Error ? err.message : 'Failed to start STT')
    }
  }, [scribe])

  const stopSTT = useCallback(() => {
    console.log('[MicTest STT] Stopping...')
    scribe.disconnect()
    setSttActive(false)
  }, [scribe])

  const clearTranscripts = useCallback(() => {
    setSttTranscripts([])
    scribe.clearTranscripts()
  }, [scribe])

  const startListening = useCallback(async () => {
    try {
      setError(null)
      setMicInfo(null)
      
      // List available devices first
      console.log('[MicTest] Enumerating devices...')
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = allDevices.filter(d => d.kind === 'audioinput')
      setDevices(audioInputs)
      console.log('[MicTest] Audio input devices:', audioInputs)
      
      // Request mic access
      console.log('[MicTest] Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false, // Disable processing for raw signal
          noiseSuppression: false,
          autoGainControl: false,
        } 
      })
      
      streamRef.current = stream
      
      // Get track info
      const tracks = stream.getAudioTracks()
      console.log('[MicTest] Got audio tracks:', tracks.length)
      
      if (tracks.length === 0) {
        setError('No audio tracks in stream')
        return
      }
      
      const track = tracks[0]
      const settings = track.getSettings()
      
      console.log('[MicTest] Track label:', track.label)
      console.log('[MicTest] Track enabled:', track.enabled)
      console.log('[MicTest] Track muted:', track.muted)
      console.log('[MicTest] Track readyState:', track.readyState)
      console.log('[MicTest] Settings:', settings)
      
      setMicInfo(`Mic: ${track.label}\nSample Rate: ${settings.sampleRate}Hz\nChannels: ${settings.channelCount}`)
      
      // Create audio context and analyzer
      const audioContext = new AudioContext()
      console.log('[MicTest] AudioContext state:', audioContext.state)
      console.log('[MicTest] AudioContext sampleRate:', audioContext.sampleRate)
      
      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        console.log('[MicTest] Resuming suspended AudioContext...')
        await audioContext.resume()
      }
      
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.3
      
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      
      // Start level monitoring
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let maxLevel = 0
      
      const updateLevel = () => {
        if (!analyserRef.current) return
        
        analyserRef.current.getByteFrequencyData(dataArray)
        
        // Calculate RMS level
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)
        const level = Math.min(100, Math.round((rms / 128) * 100))
        
        if (level > maxLevel) maxLevel = level
        
        setMicLevel(level)
        
        // Log periodically
        if (Math.random() < 0.02) { // Log ~2% of frames
          console.log(`[MicTest] Level: ${level}%, Max: ${maxLevel}%, RMS: ${rms.toFixed(2)}`)
        }
        
        animationFrameRef.current = requestAnimationFrame(updateLevel)
      }
      
      updateLevel()
      setIsListening(true)
      console.log('[MicTest] Started listening successfully')
      
    } catch (err) {
      console.error('[MicTest] Error:', err)
      setError(err instanceof Error ? err.message : 'Failed to access microphone')
    }
  }, [])

  const stopListening = useCallback(() => {
    console.log('[MicTest] Stopping...')
    
    // Stop recording if active
    if (isRecording) {
      stopRecording()
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    
    audioContextRef.current = null
    analyserRef.current = null
    streamRef.current = null
    animationFrameRef.current = null
    
    setIsListening(false)
    setMicLevel(0)
  }, [isRecording])

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      setError('No microphone stream available')
      return
    }
    
    console.log('[MicTest] Starting recording...')
    chunksRef.current = []
    setRecordingDuration(0)
    setRecordedBlob(null)
    setIsolatedBlob(null)
    
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'audio/webm;codecs=opus'
    })
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
        console.log('[MicTest] Recorded chunk:', e.data.size, 'bytes')
      }
    }
    
    mediaRecorder.onstop = () => {
      console.log('[MicTest] Recording stopped, total chunks:', chunksRef.current.length)
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      console.log('[MicTest] Total recorded size:', blob.size, 'bytes')
      setRecordedBlob(blob)
    }
    
    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.start(100) // Collect data every 100ms
    
    // Update recording duration
    recordingIntervalRef.current = setInterval(() => {
      setRecordingDuration(d => d + 0.1)
    }, 100)
    
    setIsRecording(true)
  }, [])

  const stopRecording = useCallback(() => {
    console.log('[MicTest] Stopping recording...')
    
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current)
      recordingIntervalRef.current = null
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    
    setIsRecording(false)
  }, [])

  const isolateVoice = useCallback(async () => {
    if (!recordedBlob) {
      setError('No recording to isolate')
      return
    }
    
    setIsIsolating(true)
    setError(null)
    
    try {
      console.log('[MicTest] Sending audio for voice isolation...')
      
      const formData = new FormData()
      formData.append('audio', recordedBlob, 'recording.webm')
      
      const response = await fetch('/api/elevenlabs/isolate', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Isolation failed: ${errorText}`)
      }
      
      const isolatedAudio = await response.blob()
      console.log('[MicTest] Received isolated audio:', isolatedAudio.size, 'bytes, type:', isolatedAudio.type)
      
      if (isolatedAudio.size === 0) {
        throw new Error('Received empty audio response')
      }
      
      console.log('[MicTest] Setting isolatedBlob state...')
      setIsolatedBlob(isolatedAudio)
      console.log('[MicTest] ✅ isolatedBlob state set!')
      
    } catch (err) {
      console.error('[MicTest] Voice isolation error:', err)
      setError(err instanceof Error ? err.message : 'Voice isolation failed')
    } finally {
      setIsIsolating(false)
    }
  }, [recordedBlob])

  const playAudio = useCallback((blob: Blob, label: string) => {
    console.log(`[MicTest] Playing ${label}...`)
    setIsPlaying(true)
    
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio
    
    audio.onended = () => {
      console.log(`[MicTest] ${label} playback ended`)
      URL.revokeObjectURL(url)
      setIsPlaying(false)
    }
    
    audio.onerror = (e) => {
      console.error(`[MicTest] ${label} playback error:`, e)
      URL.revokeObjectURL(url)
      setIsPlaying(false)
      setError('Audio playback failed')
    }
    
    audio.play().catch(err => {
      console.error('[MicTest] Play error:', err)
      setIsPlaying(false)
      setError('Failed to play audio')
    })
  }, [])

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsPlaying(false)
  }, [])

  return (
    <div className="p-4 bg-slate-800 rounded-lg space-y-4">
      <h3 className="text-white font-semibold flex items-center gap-2">
        <Volume2 size={18} />
        Microphone Test + Voice Isolation
      </h3>
      
      {error && (
        <div className="p-2 bg-red-500/20 border border-red-500 rounded text-red-300 text-sm">
          {error}
        </div>
      )}
      
      {micInfo && (
        <pre className="p-2 bg-slate-900 rounded text-xs text-slate-300 whitespace-pre-wrap">
          {micInfo}
        </pre>
      )}
      
      {devices.length > 0 && (
        <div className="text-xs text-slate-400">
          <p className="font-semibold">Available mics:</p>
          <ul className="list-disc list-inside">
            {devices.map((d, i) => (
              <li key={i}>{d.label || `Device ${i + 1}`}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Mic Level */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 w-12">Level:</span>
          <div className="flex-1 h-4 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-75 ${
                micLevel > 50 ? 'bg-green-500' : micLevel > 20 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${micLevel}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 w-10 text-right">{micLevel}%</span>
        </div>
        
        <p className="text-xs text-slate-500">
          {isListening 
            ? (micLevel > 10 ? '✅ Microphone is working!' : '⚠️ Very low signal - try speaking louder or check mic')
            : 'Click Start to test your microphone'
          }
        </p>
      </div>

      {/* Mic Control */}
      <div className="flex gap-2">
        <Button
          onClick={isListening ? stopListening : startListening}
          className={isListening ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}
          disabled={isRecording}
        >
          {isListening ? <MicOff size={16} className="mr-2" /> : <Mic size={16} className="mr-2" />}
          {isListening ? 'Stop' : 'Start'}
        </Button>
        
        {isListening && (
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            className={isRecording ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'}
          >
            {isRecording ? (
              <>
                <Square size={16} className="mr-2" />
                Stop ({recordingDuration.toFixed(1)}s)
              </>
            ) : (
              <>
                <Mic size={16} className="mr-2" />
                Record
              </>
            )}
          </Button>
        )}
      </div>

      {/* Recording & Isolation */}
      {recordedBlob && (
        <div className="p-3 bg-slate-900 rounded space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">
              📼 Recording: {(recordedBlob.size / 1024).toFixed(1)} KB ({recordingDuration.toFixed(1)}s)
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => playAudio(recordedBlob, 'original')}
                disabled={isPlaying}
                className="text-slate-300"
              >
                <Play size={14} className="mr-1" />
                Play Original
              </Button>
              <Button
                size="sm"
                onClick={() => isolatedBlob && playAudio(isolatedBlob, 'isolated')}
                disabled={!isolatedBlob || isPlaying}
                className="bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500"
              >
                <Play size={14} className="mr-1" />
                Play Isolated
              </Button>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={isolateVoice}
              disabled={isIsolating || isPlaying}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {isIsolating ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Isolating...
                </>
              ) : (
                <>
                  <Sparkles size={16} className="mr-2" />
                  Isolate Voice
                </>
              )}
            </Button>
            
            {isPlaying && (
              <Button
                onClick={stopPlayback}
                variant="ghost"
                className="text-slate-300"
              >
                <Square size={14} className="mr-1" />
                Stop
              </Button>
            )}
          </div>
          
          {isolatedBlob && (
            <div className="mt-3 p-3 bg-green-900/30 border border-green-600 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-400 font-semibold">
                  ✨ Voice Isolated Successfully!
                </span>
                <span className="text-xs text-green-500">
                  ({(isolatedBlob.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <Button
                onClick={() => playAudio(isolatedBlob, 'isolated')}
                disabled={isPlaying}
                className="w-full bg-green-600 hover:bg-green-500"
              >
                <Play size={16} className="mr-2" />
                Play Isolated Voice
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* STT Section */}
      <div className="border-t border-slate-700 pt-4 mt-4">
        <h4 className="text-white font-semibold flex items-center gap-2 mb-3">
          <MessageSquare size={16} />
          Speech-to-Text Test (Scribe v2)
        </h4>
        
        <div className="flex gap-2 mb-3">
          <Button
            onClick={sttActive ? stopSTT : startSTT}
            disabled={isListening} // Can't use both at same time
            className={sttActive ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}
          >
            {sttActive ? (
              <>
                <Square size={16} className="mr-2" />
                Stop STT
              </>
            ) : (
              <>
                <Mic size={16} className="mr-2" />
                Start STT
              </>
            )}
          </Button>
          
          {sttTranscripts.length > 0 && (
            <Button
              variant="ghost"
              onClick={clearTranscripts}
              className="text-slate-400"
            >
              Clear
            </Button>
          )}
        </div>
        
        {/* STT Status */}
        <div className="mb-3 text-xs">
          <span className={sttActive ? 'text-green-400' : 'text-slate-500'}>
            Status: {scribe.status} | Connected: {String(scribe.isConnected)}
          </span>
        </div>
        
        {/* Partial transcript */}
        {scribe.partialTranscript && (
          <div className="p-2 bg-yellow-900/30 border border-yellow-600 rounded mb-2">
            <span className="text-xs text-yellow-500">Partial: </span>
            <span className="text-yellow-300">{scribe.partialTranscript}</span>
          </div>
        )}
        
        {/* Committed transcripts */}
        {sttTranscripts.length > 0 && (
          <div className="p-2 bg-slate-900 rounded space-y-1 max-h-32 overflow-y-auto">
            {sttTranscripts.map((text, i) => (
              <div key={i} className="text-sm text-green-400">
                ✅ {text}
              </div>
            ))}
          </div>
        )}
        
        {sttTranscripts.length === 0 && sttActive && (
          <p className="text-xs text-slate-500">Speak into your microphone...</p>
        )}
        
        {!sttActive && sttTranscripts.length === 0 && (
          <p className="text-xs text-slate-500">Click "Start STT" to test speech recognition</p>
        )}
      </div>
      
      <p className="text-xs text-slate-500 border-t border-slate-700 pt-3 mt-3">
        Mic Test: Start → Record → Isolate → Compare | STT Test: Start STT → Speak → See transcripts
      </p>
      
      {/* Debug info */}
      <div className="text-xs text-slate-600">
        Debug: recorded={recordedBlob ? `${(recordedBlob.size/1024).toFixed(1)}KB` : 'null'} | 
        isolated={isolatedBlob ? `${(isolatedBlob.size/1024).toFixed(1)}KB` : 'null'} |
        stt={scribe.status}
      </div>
    </div>
  )
}
