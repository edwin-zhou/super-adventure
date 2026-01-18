'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, Minimize2, X, Plus, Upload, Link, Youtube, Loader2, Download, RotateCcw, AudioLines, Square, FileText } from 'lucide-react'
import { useVoiceAgent } from '@/hooks/useVoiceAgent'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { generateMaskFromPath } from '@/lib/mask-utils'
import {
  extractYoutubeUrls,
  containsYoutubeUrl,
  normalizeYoutubeUrl,
  getYoutubeVideoId,
} from '@/lib/youtube-utils'
import { 
  invokeAgent, 
  clearConversation, 
  addVideosToContext, 
  removeVideoFromContext,
  addNoteStyleSample,
  getNoteStyleSampleIds,
  clearNoteStyleSamples,
} from '@/app/actions/agent'

// Helper function to download an image from base64 data
function downloadImage(imageData: string, filename: string, format: string = 'png'): void {
  const mimeType = format === 'png' ? 'image/png' 
    : format === 'jpeg' ? 'image/jpeg' 
    : 'image/webp';
  const dataUrl = `data:${mimeType};base64,${imageData}`;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith(`.${format}`) ? filename : `${filename}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  youtubeUrl?: string
  imageUrl?: string
  imagePrompt?: string
  isLoading?: boolean
  isError?: boolean
}

// Maximum videos Gemini can process at once
const MAX_VIDEOS = 10

interface PendingVideo {
  id: string
  url: string
  title: string | null
  isLoading: boolean
}

interface NoteStyleSample {
  id: string
  base64Data: string
  name: string
}

interface ChatBotProps {
  onAddImageToPage?: (imageUrl: string, pageNumber: number, replace?: boolean, timestamps?: number[]) => void
}

// Fetch video title from YouTube oEmbed API
async function fetchVideoTitle(url: string): Promise<string | null> {
  try {
    const oembedUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`
    const response = await fetch(oembedUrl)
    if (response.ok) {
      const data = await response.json()
      return data.title || null
    }
  } catch (error) {
    console.error('Failed to fetch video title:', error)
  }
  return null
}

export function ChatBot({ onAddImageToPage }: ChatBotProps = {}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your AI teaching assistant. I can help you understand content, answer questions, generate images, and analyze YouTube videos.\n\nJust ask me anything naturally — I\'ll automatically use the right tools when needed!',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([])
  const [noteStyleSamples, setNoteStyleSamples] = useState<NoteStyleSample[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const noteStyleInputRef = useRef<HTMLInputElement>(null)
  
  // Get lasso mask context from the whiteboard store
  const lassoMaskContext = useWhiteboardStore((state) => state.lassoMaskContext)

  // Voice agent callback - wraps handleSend to return response text
  const handleVoiceSubmit = useCallback(async (text: string): Promise<string> => {
    // Collect all YouTube URLs from pending videos
    const pendingUrls = pendingVideos.map(v => v.url)
    const allYoutubeUrls = [...new Set(pendingUrls)]
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      youtubeUrl: allYoutubeUrls[0],
    }

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date(),
      isLoading: true,
    }

    setMessages((prev) => [...prev, userMessage, loadingMessage])
    setPendingVideos([])
    setIsGenerating(true)

    try {
      if (allYoutubeUrls.length > 0) {
        addVideosToContext(allYoutubeUrls)
      }
      
      // Prepare mask context if available
      let maskContext = null
      if (lassoMaskContext?.targetImageId && lassoMaskContext?.relativeMaskPath) {
        try {
          // Generate mask from the relative path
          const maskBase64 = generateMaskFromPath(
            lassoMaskContext.relativeMaskPath,
            1024, // Default image width
            1536  // Default image height
          )
          
          maskContext = {
            imageId: lassoMaskContext.targetImageId,
            maskBase64,
            targetImageId: lassoMaskContext.targetImageId,
          }
        } catch (error) {
          console.error('Failed to generate mask:', error)
        }
      }
      
      const result = await invokeAgent(text, undefined, maskContext)

      if (result.whiteboardActions && result.whiteboardActions.length > 0 && onAddImageToPage) {
        for (const action of result.whiteboardActions) {
          if (action.type === 'add_full_page_image') {
            onAddImageToPage(action.imageUrl, action.pageNumber, action.replace, action.timestamps)
          }
        }
      }

      // Handle video actions if any
      if (result.videoActions && result.videoActions.length > 0) {
        const { 
          setVideoPlayerTimestamp, 
          setVideoPlayerUrl, 
          setVideoPlayerOpen,
          setVideoPlayerAction,
          isVideoPlayerOpen 
        } = useWhiteboardStore.getState()
        for (const action of result.videoActions) {
          if (action.type === 'seek_to_timestamp' && action.timestamp !== undefined) {
            // Open video player if not already open
            if (!isVideoPlayerOpen) {
              setVideoPlayerOpen(true)
            }
            // If video URL is provided, load it
            if (action.videoUrl) {
              setVideoPlayerUrl(action.videoUrl)
              const timestamp = action.timestamp!
              
              // Wait for video/iframe to load and initialize
              // YouTube/Vimeo iframes need more time to be ready for API commands
              setTimeout(() => {
                // Set timestamp first
                setVideoPlayerTimestamp(timestamp)
                // Retry setting timestamp after a delay (for iframes that need more time)
                setTimeout(() => {
                  setVideoPlayerTimestamp(timestamp)
                }, 500)
                // Then play after timestamp is set (allows seek to complete)
                setTimeout(() => {
                  setVideoPlayerAction('play')
                  // Set timestamp one more time after play starts (ensures seek works)
                  setTimeout(() => {
                    setVideoPlayerTimestamp(timestamp)
                  }, 300)
                }, 800)
              }, 1000)
            } else {
              // If no video URL, set timestamp immediately (video already loaded)
              setVideoPlayerTimestamp(action.timestamp)
              // Start playing the video
              setVideoPlayerAction('play')
            }
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMessage.id
            ? {
                ...m,
                content: result.response,
                imageUrl: result.generatedImages?.[0]?.url,
                imagePrompt: result.generatedImages?.[0]?.prompt,
                isLoading: false,
                timestamp: new Date(),
              }
            : m
        )
      )

      return result.response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMessage.id
            ? {
                ...m,
                content: `❌ ${errorMessage}`,
                isLoading: false,
                isError: true,
                timestamp: new Date(),
              }
            : m
        )
      )
      
      throw error
    } finally {
      setIsGenerating(false)
    }
  }, [pendingVideos, onAddImageToPage])

  // Voice agent hook
  const {
    isVoiceMode,
    isListening,
    isAgentTurn,
    isSpeaking,
    partialTranscript,
    error: voiceError,
    startSession,
    stopSession,
  } = useVoiceAgent({
    onSubmit: handleVoiceSubmit,
    onError: (error) => console.warn('[Voice]', error),
  })

  // Add a video to pending list
  const addPendingVideo = useCallback(async (url: string) => {
    const normalizedUrl = normalizeYoutubeUrl(url)
    
    // Get video player store actions
    const { setVideoPlayerUrl, setVideoPlayerOpen } = useWhiteboardStore.getState()
    
    // Check if already at max or URL already exists
    let shouldAddVideo = false
    setPendingVideos(prev => {
      if (prev.length >= MAX_VIDEOS) return prev
      if (prev.some(v => v.url === normalizedUrl)) return prev
      
      shouldAddVideo = true
      const newVideo: PendingVideo = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        url: normalizedUrl,
        title: null,
        isLoading: true,
      }
      return [...prev, newVideo]
    })

    // If video was added, also set it in the video player (use the most recent video)
    if (shouldAddVideo) {
      setVideoPlayerUrl(normalizedUrl)
      setVideoPlayerOpen(true)
    }

    // Fetch title asynchronously
    const title = await fetchVideoTitle(normalizedUrl)
    setPendingVideos(prev => 
      prev.map(v => v.url === normalizedUrl ? { ...v, title, isLoading: false } : v)
    )
  }, [])

  // Remove a video from pending list
  const removePendingVideo = useCallback((videoId: string) => {
    setPendingVideos(prev => {
      const videoToRemove = prev.find(v => v.id === videoId)
      if (videoToRemove) {
        // Also remove from agent's video context
        removeVideoFromContext(videoToRemove.url)
      }
      return prev.filter(v => v.id !== videoId)
    })
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Close plus menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showPlusMenu) {
        setShowPlusMenu(false)
      }
    }

    if (showPlusMenu) {
      document.addEventListener('click', handleClickOutside)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
    }
  }, [showPlusMenu])

  const handleSend = async (messageText?: string, youtubeUrl?: string) => {
    const textToSend = messageText ?? input
    
    // Collect all YouTube URLs: explicit URL, pending videos, and extracted from message
    const extractedUrls = extractYoutubeUrls(textToSend)
    const pendingUrls = pendingVideos.map(v => v.url)
    const explicitUrls = youtubeUrl ? [youtubeUrl] : []
    
    // Combine all URLs, remove duplicates
    const allYoutubeUrls = [...new Set([...explicitUrls, ...pendingUrls, ...extractedUrls])]
    
    if (!textToSend.trim() && allYoutubeUrls.length === 0) return

    // Determine display content
    let displayContent = textToSend.trim()
    if (!displayContent && allYoutubeUrls.length > 0) {
      displayContent = allYoutubeUrls.length === 1 
        ? `Analyze this YouTube video`
        : `Analyze these ${allYoutubeUrls.length} YouTube videos`
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: displayContent,
      timestamp: new Date(),
      youtubeUrl: allYoutubeUrls[0],
    }

    // Add loading message
    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: allYoutubeUrls.length > 0
        ? 'Analyzing the video...'
        : 'Thinking...',
      timestamp: new Date(),
      isLoading: true,
    }

    setMessages((prev) => [...prev, userMessage, loadingMessage])
    setInput('')
    setPendingVideos([])
    setIsGenerating(true)

    try {
      // Add any new videos to global context
      if (allYoutubeUrls.length > 0) {
        addVideosToContext(allYoutubeUrls)
      }
      
      // Always use the agent (handles video context automatically)
      const result = await invokeAgent(
        textToSend.trim() || `Please analyze the YouTube video(s) and provide a summary of their key points.`
      )

      // Handle whiteboard actions if any
      if (result.whiteboardActions && result.whiteboardActions.length > 0 && onAddImageToPage) {
        for (const action of result.whiteboardActions) {
          if (action.type === 'add_full_page_image') {
            onAddImageToPage(action.imageUrl, action.pageNumber, action.replace, action.timestamps)
          }
        }
      }

      // Handle video actions if any
      if (result.videoActions && result.videoActions.length > 0) {
        const { 
          setVideoPlayerTimestamp, 
          setVideoPlayerUrl, 
          setVideoPlayerOpen,
          setVideoPlayerAction,
          isVideoPlayerOpen 
        } = useWhiteboardStore.getState()
        for (const action of result.videoActions) {
          if (action.type === 'seek_to_timestamp' && action.timestamp !== undefined) {
            // Open video player if not already open
            if (!isVideoPlayerOpen) {
              setVideoPlayerOpen(true)
            }
            // If video URL is provided, load it
            if (action.videoUrl) {
              setVideoPlayerUrl(action.videoUrl)
              const timestamp = action.timestamp!
              
              // Wait for video/iframe to load and initialize
              // YouTube/Vimeo iframes need more time to be ready for API commands
              setTimeout(() => {
                // Set timestamp first
                setVideoPlayerTimestamp(timestamp)
                // Retry setting timestamp after a delay (for iframes that need more time)
                setTimeout(() => {
                  setVideoPlayerTimestamp(timestamp)
                }, 500)
                // Then play after timestamp is set (allows seek to complete)
                setTimeout(() => {
                  setVideoPlayerAction('play')
                  // Set timestamp one more time after play starts (ensures seek works)
                  setTimeout(() => {
                    setVideoPlayerTimestamp(timestamp)
                  }, 300)
                }, 800)
              }, 1000)
            } else {
              // If no video URL, set timestamp immediately (video already loaded)
              setVideoPlayerTimestamp(action.timestamp)
              // Start playing the video
              setVideoPlayerAction('play')
            }
          }
        }
      }

      // Replace loading message with response
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMessage.id
            ? {
                ...m,
                content: result.response,
                imageUrl: result.generatedImages?.[0]?.url,
                imagePrompt: result.generatedImages?.[0]?.prompt,
                isLoading: false,
                timestamp: new Date(),
              }
            : m
        )
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred'
      
      // Replace loading message with error
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMessage.id
            ? {
                ...m,
                content: `❌ ${errorMessage}`,
                isLoading: false,
                isError: true,
                timestamp: new Date(),
              }
            : m
        )
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const fileArray = Array.from(files)
      
      // Add a message about the uploaded files
      const fileNames = fileArray.map((f) => f.name).join(', ')
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: `📎 Uploaded: ${fileNames}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])

      // Bot response
      setTimeout(() => {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `I received ${fileArray.length} file(s): ${fileNames}. Note: File analysis is not yet supported. For video analysis, please use YouTube links instead.`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, botMessage])
      }, 500)

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      
      setShowUploadModal(false)
    }
  }

  const handleNoteStyleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      const file = files[0]
      
      // Convert to base64
      const reader = new FileReader()
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string
        // Remove the data URL prefix to get just the base64 data
        const base64Only = base64Data.split(',')[1]
        
        try {
          // Add to server-side storage
          const sampleId = await addNoteStyleSample(base64Only, 'png')
          
          // Add to local state for UI display
          setNoteStyleSamples(prev => [...prev, {
            id: sampleId,
            base64Data: base64Data, // Keep full data URL for display
            name: file.name,
          }])
          
          // Show confirmation message
          const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: `📝 Uploaded note style sample: ${file.name}`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, userMessage])
          
          setTimeout(() => {
            const botMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: `Perfect! I'll use your note-taking style as a reference when generating study notes. Just ask me to create notes from any video content!`,
              timestamp: new Date(),
            }
            setMessages((prev) => [...prev, botMessage])
          }, 500)
        } catch (error) {
          console.error('Failed to upload note style:', error)
        }
      }
      reader.readAsDataURL(file)
      
      // Reset file input
      if (noteStyleInputRef.current) {
        noteStyleInputRef.current.value = ''
      }
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      console.log('File dropped:', file.name)
      
      // Add message about uploaded file
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: `📎 Uploaded: ${file.name}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])

      setTimeout(() => {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `I received your file: ${file.name}. Note: File analysis is not yet supported. For video analysis, please use YouTube links instead.`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, botMessage])
      }, 500)
    }
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      // Check if it's a YouTube URL
      if (containsYoutubeUrl(urlInput)) {
        if (pendingVideos.length < MAX_VIDEOS) {
          addPendingVideo(urlInput)
        }
        setShowUrlModal(false)
        setUrlInput('')
      } else {
        // Regular URL handling
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: `🔗 URL: ${urlInput}`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, userMessage])

        setTimeout(() => {
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `I received the URL: ${urlInput}. Currently, I can only analyze YouTube videos. Please paste a YouTube link for video analysis.`,
            timestamp: new Date(),
          }
          setMessages((prev) => [...prev, botMessage])
        }, 500)

        setUrlInput('')
        setShowUrlModal(false)
      }
    }
  }

  // Check for YouTube URL in input
  const inputHasYoutube = containsYoutubeUrl(input)
  
  // Check if chat is empty (only has the initial welcome message)
  const isChatEmpty = messages.length === 1 && messages[0].id === '1'
  
  // Handler for generating notes from video
  const handleGenerateNotes = () => {
    if (pendingVideos.length > 0) {
      const videoCount = pendingVideos.length
      const presetMessage = videoCount === 1
        ? `Create comprehensive study notes from this video. Include all key concepts, definitions, equations, diagrams, examples, and important points. Organize the notes clearly with headings and sections.`
        : `Create comprehensive study notes from these ${videoCount} videos. Include all key concepts, definitions, equations, diagrams, examples, and important points from each video. Organize the notes clearly with headings and sections.`
      handleSend(presetMessage)
    }
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          className="rounded-full w-14 h-14 bg-slate-700 hover:bg-slate-600 shadow-lg"
        >
          <Bot size={24} className="fill-blue-500 text-blue-500" />
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 h-[600px] flex flex-col bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">AI Assistant</h3>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
              Online • Video & Image AI
            </p>
          </div>
        </div>
        <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white"
              onClick={() => {
                clearConversation()
                setMessages([{
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: 'Chat cleared! How can I help you?',
                  timestamp: new Date(),
                }])
                setPendingVideos([])
                // Note: We keep note style samples across conversations
              }}
              title="New Chat"
            >
              <RotateCcw size={16} />
            </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white"
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 size={16} />
          </Button>
        </div>
      </div>

      {/* Note style samples indicator */}
      {noteStyleSamples.length > 0 && (
        <div className="px-3 py-2 bg-purple-900/30 border-b border-purple-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs text-purple-300">
              <Upload size={12} className="text-purple-400" />
              <span>
                {noteStyleSamples.length} note style{noteStyleSamples.length !== 1 ? 's' : ''} loaded
              </span>
            </div>
            <button
              onClick={() => {
                clearNoteStyleSamples()
                setNoteStyleSamples([])
              }}
              className="text-xs text-purple-400 hover:text-purple-200"
            >
              Clear
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {noteStyleSamples.map((sample) => (
              <div key={sample.id} className="flex-shrink-0">
                <img
                  src={sample.base64Data}
                  alt={sample.name}
                  className="w-24 h-32 object-cover rounded border border-purple-500/50"
                  title={sample.name}
                />
                <p className="mt-1 text-xs text-purple-300 truncate w-24" title={sample.name}>
                  {sample.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lasso selection indicator - more minimal */}
      {lassoMaskContext && (
        <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
              </svg>
              <span>Selected region in context</span>
            </div>
            <button
              onClick={() => {
                const { clearLassoMaskContext } = useWhiteboardStore.getState()
                clearLassoMaskContext()
              }}
              className="text-xs text-blue-400/60 hover:text-blue-400"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Pending videos indicator */}
      {pendingVideos.length > 0 && (
        <div className="px-3 py-2 bg-slate-900/80 border-b border-slate-700">
          {/* Header with count */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Youtube size={12} className="text-red-500" />
              <span>
                {pendingVideos.length} video{pendingVideos.length !== 1 ? 's' : ''} in context
                {pendingVideos.length < MAX_VIDEOS && (
                  <span className="text-slate-500 ml-1">
                    (up to {MAX_VIDEOS - pendingVideos.length} more)
                  </span>
                )}
              </span>
            </div>
            {pendingVideos.length > 1 && (
              <button
                onClick={() => setPendingVideos([])}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Clear all
              </button>
            )}
          </div>
          
          {/* Video list - horizontal scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-600">
            {pendingVideos.map((video) => (
              <div
                key={video.id}
                className="relative flex-shrink-0 w-32 group"
              >
                {/* Thumbnail */}
                <div className="relative w-32 h-18 rounded overflow-hidden bg-slate-800">
                  <img
                    src={`https://img.youtube.com/vi/${getYoutubeVideoId(video.url)}/mqdefault.jpg`}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-6 h-6 rounded-full bg-red-600/90 flex items-center justify-center">
                      <div className="w-0 h-0 border-l-[5px] border-l-white border-y-[3px] border-y-transparent ml-0.5" />
                    </div>
                  </div>
                  
                  {/* Remove button */}
                  <button
                    onClick={() => removePendingVideo(video.id)}
                    className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-black/80"
                  >
                    <X size={12} />
                  </button>
                </div>
                
                {/* Title */}
                <p className="mt-1 text-xs text-slate-300 truncate" title={video.title || video.url}>
                  {video.isLoading ? (
                    <span className="text-slate-500 animate-pulse">Loading...</span>
                  ) : (
                    video.title || 'Untitled video'
                  )}
                </p>
              </div>
            ))}
            
            {/* Add more button if under limit */}
            {pendingVideos.length < MAX_VIDEOS && (
              <button
                onClick={() => setShowUrlModal(true)}
                className="flex-shrink-0 w-32 h-18 rounded border-2 border-dashed border-slate-600 hover:border-slate-500 flex flex-col items-center justify-center text-slate-500 hover:text-slate-400 transition-colors gap-1"
              >
                <Plus size={18} />
                <span className="text-xs">Add video</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-lg p-3',
                message.role === 'user'
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                  : message.isError
                  ? 'bg-red-900/50 border border-red-700 text-red-200'
                  : 'bg-slate-700 text-slate-100'
              )}
            >
              {/* YouTube thumbnail for user messages */}
              {message.role === 'user' && message.youtubeUrl && (
                <div className="mb-2 rounded overflow-hidden">
                  <img
                    src={`https://img.youtube.com/vi/${getYoutubeVideoId(message.youtubeUrl)}/mqdefault.jpg`}
                    alt="YouTube thumbnail"
                    className="w-full h-auto"
                  />
                  <div className="bg-black/50 px-2 py-1 flex items-center gap-1">
                    <Youtube size={12} className="text-red-500" />
                    <span className="text-xs truncate">{message.youtubeUrl}</span>
                  </div>
                </div>
              )}
              
              {message.isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">{message.content}</span>
                </div>
              ) : (
                <>
                  {/* Display generated image if present */}
                  {message.imageUrl && (
                    <div className="mb-3">
                      <div className="relative rounded-lg overflow-hidden border border-slate-600">
                        <img
                          src={message.imageUrl}
                          alt={message.imagePrompt || 'Generated image'}
                          className="w-full h-auto"
                        />
                      </div>
                      {message.imagePrompt && (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-400 italic">
                            Prompt: {message.imagePrompt}
                          </p>
                          <button
                            onClick={() => {
                              // Extract base64 from data URL
                              const base64Data = message.imageUrl!.split(',')[1]
                              downloadImage(base64Data, 'generated-image', 'png')
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                            title="Download image"
                          >
                            <Download size={12} />
                            <span>Download</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-sm prose prose-sm prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-code:text-purple-300 prose-code:bg-slate-900/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-strong:text-white prose-a:text-blue-400 [&_.katex]:text-slate-100">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        // Filter out images from markdown - we display generated images separately
                        img: () => null,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </>
              )}
              
              <p className="text-xs mt-1 opacity-60">
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-700">
        {/* Voice mode indicator */}
        {isVoiceMode && (
          <div className={cn(
            'mb-2 px-3 py-2 rounded',
            isListening ? 'bg-green-500/10' : 'bg-blue-500/10'
          )}>
            <div className="flex items-center gap-2 mb-1">
              <div className={cn(
                'w-2 h-2 rounded-full',
                isListening ? 'bg-green-500 animate-pulse' : 'bg-blue-500'
              )} />
              <span className={cn(
                'text-xs',
                isListening ? 'text-green-400' : 'text-blue-400'
              )}>
                {isSpeaking ? 'Speaking...' : isAgentTurn ? 'Processing...' : isListening ? 'Listening...' : 'Voice mode active'}
              </span>
              {voiceError && (
                <span className="text-xs text-red-400 ml-auto">{voiceError}</span>
              )}
            </div>
          </div>
        )}
        
        {/* YouTube indicator in input */}
        {!isVoiceMode && inputHasYoutube && pendingVideos.length < MAX_VIDEOS && (
          <div className="mb-2 px-2 py-1 bg-red-500/10 rounded flex items-center gap-2">
            <Youtube size={14} className="text-red-500" />
            <span className="text-xs text-red-400">YouTube video detected - will be added on send</span>
          </div>
        )}
        {!isVoiceMode && pendingVideos.length >= MAX_VIDEOS && (
          <div className="mb-2 px-2 py-1 bg-amber-500/10 rounded flex items-center gap-2">
            <Youtube size={14} className="text-amber-500" />
            <span className="text-xs text-amber-400">Maximum {MAX_VIDEOS} videos reached</span>
          </div>
        )}
        
        <div className="flex gap-2 relative">
          <div className="relative">
            <Button
              onClick={(e) => {
                e.stopPropagation()
                setShowPlusMenu(!showPlusMenu)
              }}
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white"
              title="Add content"
              disabled={isGenerating || isVoiceMode}
            >
              <Plus size={18} />
            </Button>
            
            {/* Plus Menu Dropdown */}
            {showPlusMenu && (
              <div 
                className="absolute bottom-12 left-0 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-2 w-56 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setShowPlusMenu(false)
                    noteStyleInputRef.current?.click()
                  }}
                  className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center gap-2"
                >
                  <Upload size={16} className="text-purple-400" />
                  <span>Upload Note Style</span>
                </button>
                <button
                  onClick={() => {
                    setShowPlusMenu(false)
                    setShowUploadModal(true)
                  }}
                  className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center gap-2"
                >
                  <Upload size={16} />
                  <span>Upload File</span>
                </button>
                <button
                  onClick={() => {
                    setShowPlusMenu(false)
                    setShowUrlModal(true)
                  }}
                  className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center gap-2"
                >
                  <Youtube size={16} className="text-red-500" />
                  <span>YouTube Video</span>
                </button>
                <button
                  onClick={() => {
                    setShowPlusMenu(false)
                    setShowUrlModal(true)
                  }}
                  className="w-full px-4 py-2 text-left text-white hover:bg-slate-700 flex items-center gap-2"
                >
                  <Link size={16} />
                  <span>Paste URL</span>
                </button>
              </div>
            )}
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileUpload}
            accept="*/*"
          />
          <input
            ref={noteStyleInputRef}
            type="file"
            className="hidden"
            onChange={handleNoteStyleUpload}
            accept="image/*"
          />
          <Input
            value={isVoiceMode ? partialTranscript : input}
            onChange={(e) => !isVoiceMode && setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            onPaste={(e) => {
              if (isVoiceMode) return
              const pastedText = e.clipboardData.getData('text')
              // If pasted text contains YouTube URLs, add them to context
              if (containsYoutubeUrl(pastedText)) {
                const urls = extractYoutubeUrls(pastedText)
                const availableSlots = MAX_VIDEOS - pendingVideos.length
                if (urls.length > 0 && availableSlots > 0) {
                  e.preventDefault()
                  // Add up to available slots
                  const urlsToAdd = urls.slice(0, availableSlots)
                  urlsToAdd.forEach(url => addPendingVideo(url))
                }
              }
            }}
            placeholder={
              isVoiceMode
                ? (isSpeaking ? 'Speaking...' : isAgentTurn ? 'Processing...' : 'Listening...')
                : isGenerating 
                  ? 'Generating...'
                  : lassoMaskContext
                    ? 'Ask about the selected region...'
                    : pendingVideos.length > 0 
                      ? `Ask about ${pendingVideos.length === 1 ? 'this video' : `these ${pendingVideos.length} videos`}...` 
                      : 'Ask anything or paste YouTube URLs...'
            }
            className="flex-1 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
            disabled={isGenerating || isVoiceMode}
          />
          
          {/* Voice/Stop/Send/Notes Button */}
          {isVoiceMode ? (
            // Stop button - exits voice mode
            <Button
              onClick={stopSession}
              className="bg-red-600 hover:bg-red-500"
              title="Stop voice mode"
            >
              <Square size={18} />
            </Button>
          ) : isChatEmpty && pendingVideos.length > 0 && !input.trim() ? (
            // Notes button - when chat is empty and videos are available
            <Button
              onClick={handleGenerateNotes}
              disabled={isGenerating}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
              title={`Generate study notes from ${pendingVideos.length === 1 ? 'this video' : `these ${pendingVideos.length} videos`}`}
            >
              {isGenerating ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <FileText size={18} />
              )}
            </Button>
          ) : input.trim() || pendingVideos.length > 0 ? (
            // Send button - when there's text or videos
            <Button
              onClick={() => handleSend()}
              disabled={isGenerating}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
            >
              {isGenerating ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </Button>
          ) : (
            // Voice button - starts voice mode (when input is empty)
            <Button
              onClick={startSession}
              disabled={isGenerating}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
              title="Start voice mode"
            >
              <AudioLines size={18} />
            </Button>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Upload File</h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                dragActive
                  ? 'border-theme-primary'
                  : 'border-slate-600 bg-slate-900/50'
              )}
              style={dragActive ? { backgroundColor: 'var(--theme-primary)', opacity: 0.1 } : {}}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto mb-4 text-slate-400" size={48} />
              <p className="text-white mb-2">Drop your file here</p>
              <p className="text-sm text-slate-400">or click to browse</p>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 bg-theme-primary bg-theme-primary-hover"
              >
                Browse Files
              </Button>
            </div>
            
            <p className="mt-4 text-xs text-slate-500 text-center">
              Note: For video analysis, use YouTube links instead.
            </p>
          </div>
        </div>
      )}

      {/* URL Modal */}
      {showUrlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add YouTube Video</h3>
              <button
                onClick={() => {
                  setShowUrlModal(false)
                  setUrlInput('')
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label className="text-sm text-slate-300 mb-2">YouTube URL</Label>
                <div className="relative">
                  <Input
                    type="url"
                    placeholder="https://youtube.com/watch?v=..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleUrlSubmit()
                      }
                    }}
                    className="bg-slate-900 border-slate-600 text-white pl-10"
                    autoFocus
                  />
                  <Youtube size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500" />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  I'll analyze the video and answer your questions about it.
                </p>
              </div>

              {/* Preview thumbnail if valid YouTube URL */}
              {containsYoutubeUrl(urlInput) && (
                <div className="rounded overflow-hidden">
                  <img
                    src={`https://img.youtube.com/vi/${getYoutubeVideoId(normalizeYoutubeUrl(urlInput))}/mqdefault.jpg`}
                    alt="Video preview"
                    className="w-full h-auto"
                  />
                </div>
              )}
              
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowUrlModal(false)
                    setUrlInput('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUrlSubmit}
                  disabled={!urlInput.trim()}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
                >
                  <Youtube size={16} className="mr-2" />
                  Analyze Video
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
