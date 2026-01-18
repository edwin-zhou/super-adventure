'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Upload, Link as LinkIcon, Play, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'

interface VideoPlayerProps {
  isOpen: boolean
  onClose: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  isDragging?: boolean
}

export function VideoPlayer({ onClose, onDragStart, onDragEnd, onDragOver, onDrop, isDragging }: VideoPlayerProps) {
  const [localVideoUrl, setLocalVideoUrl] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  
  const videoPlayerAction = useWhiteboardStore((state) => state.videoPlayerAction)
  const setVideoPlayerAction = useWhiteboardStore((state) => state.setVideoPlayerAction)
  const storeVideoUrl = useWhiteboardStore((state) => state.videoPlayerUrl)
  const setStoreVideoUrl = useWhiteboardStore((state) => state.setVideoPlayerUrl)
  const videoPlayerTimestamp = useWhiteboardStore((state) => state.videoPlayerTimestamp)
  const setVideoPlayerTimestamp = useWhiteboardStore((state) => state.setVideoPlayerTimestamp)
  
  // Derive the actual video URL from store or local state
  const videoUrl = storeVideoUrl || localVideoUrl
  
  // Sync store URL to local state and clear store
  useEffect(() => {
    if (storeVideoUrl) {
      setLocalVideoUrl(storeVideoUrl)
      setStoreVideoUrl(null) // Clear after consuming
      setShowUrlInput(false)
    }
  }, [storeVideoUrl, setStoreVideoUrl])
  
  const setVideoUrl = (url: string) => {
    setLocalVideoUrl(url)
  }
  
  // Handle video player actions (play/pause)
  useEffect(() => {
    if (!videoPlayerAction) return
    
    if (videoPlayerAction === 'pause') {
      if (videoRef.current) {
        videoRef.current.pause()
      }
      // For iframe (YouTube/Vimeo), send postMessage
      if (iframeRef.current) {
        // YouTube iframe API
        iframeRef.current.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*')
        // Vimeo iframe API
        iframeRef.current.contentWindow?.postMessage('{"method":"pause"}', '*')
      }
    } else if (videoPlayerAction === 'play') {
      if (videoRef.current) {
        videoRef.current.play()
      }
      // For iframe (YouTube/Vimeo), send postMessage
      if (iframeRef.current) {
        // YouTube iframe API
        iframeRef.current.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*')
        // Vimeo iframe API
        iframeRef.current.contentWindow?.postMessage('{"method":"play"}', '*')
      }
    }
    
    // Reset action after processing
    setVideoPlayerAction(null)
  }, [videoPlayerAction, setVideoPlayerAction])

  // Handle video timestamp seeking
  useEffect(() => {
    if (videoPlayerTimestamp === null) return
    
    if (videoRef.current) {
      // For regular video elements, set currentTime directly
      videoRef.current.currentTime = videoPlayerTimestamp
    }
    
    // For iframe (YouTube/Vimeo), send postMessage
    if (iframeRef.current) {
      // YouTube iframe API - seek to time
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({
          event: 'command',
          func: 'seekTo',
          args: [videoPlayerTimestamp, true]
        }),
        '*'
      )
      // Vimeo iframe API - seek to time
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({
          method: 'setCurrentTime',
          value: videoPlayerTimestamp
        }),
        '*'
      )
    }
    
    // Reset timestamp after processing
    setVideoPlayerTimestamp(null)
  }, [videoPlayerTimestamp, setVideoPlayerTimestamp])
  
  // Convert YouTube URL to embed format
  const getEmbedUrl = (url: string) => {
    if (!url) return null
    
    // YouTube patterns
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
    const match = url.match(youtubeRegex)
    
    if (match && match[1]) {
      return `https://www.youtube.com/embed/${match[1]}?enablejsapi=1`
    }
    
    // Vimeo patterns
    const vimeoRegex = /vimeo\.com\/(\d+)/
    const vimeoMatch = url.match(vimeoRegex)
    
    if (vimeoMatch && vimeoMatch[1]) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`
    }
    
    // For direct video files or other URLs
    return url
  }
  
  const isEmbedUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be') || url.includes('vimeo.com')
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file)
      setVideoUrl(url)
      setShowUrlInput(false)
    }
  }

  const handleUrlSubmit = () => {
    if (videoUrl.trim()) {
      setShowUrlInput(false)
    }
  }

  return (
    <div 
      className="h-full flex flex-col bg-slate-900 border-r border-slate-700"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Header */}
      <div 
        className={`flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 cursor-move select-none hover:bg-slate-700 transition-colors ${isDragging ? 'opacity-50 bg-slate-700' : ''}`}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex items-center gap-2">
          <GripVertical size={16} className="text-slate-500" />
          <h3 className="text-sm font-semibold text-white">Player Section</h3>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Video Player Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {videoUrl ? (
          <div className="w-full flex flex-col items-center justify-center relative flex-1">
            {/* Close Video Button */}
            <button
              onClick={() => setVideoUrl('')}
              className="absolute top-2 right-2 z-10 w-8 h-8 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center text-white transition-colors"
              title="Clear video"
            >
              <X size={16} />
            </button>
            
            {isEmbedUrl(videoUrl) ? (
              <iframe
                ref={iframeRef}
                src={getEmbedUrl(videoUrl) || ''}
                className="w-full aspect-video max-h-[70vh] bg-black rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Video player"
              />
            ) : (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full max-h-[70vh] bg-black rounded-lg object-contain"
              >
                Your browser does not support the video tag.
              </video>
            )}
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => setShowUrlInput(true)}
                variant="ghost"
                className="text-white"
              >
                <LinkIcon size={16} className="mr-2" />
                Change URL
              </Button>
              <Button
                onClick={() => document.getElementById('video-file-input')?.click()}
                variant="ghost"
                className="text-white"
              >
                <Upload size={16} className="mr-2" />
                Upload New
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 mx-auto bg-slate-800 rounded-full flex items-center justify-center">
              <Play size={40} className="text-slate-400" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-white mb-2">No Video Loaded</h4>
              <p className="text-sm text-slate-400 mb-6">Upload a video file or paste a YouTube/Vimeo URL</p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => document.getElementById('video-file-input')?.click()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Upload size={18} className="mr-2" />
                Upload Video
              </Button>
              <Button
                onClick={() => setShowUrlInput(true)}
                variant="ghost"
                className="text-white border border-slate-600 hover:border-slate-500"
              >
                <LinkIcon size={18} className="mr-2" />
                Paste Video URL
              </Button>
            </div>
          </div>
        )}

        <input
          type="file"
          id="video-file-input"
          accept="video/*"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* URL Input Modal */}
      {showUrlInput && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-96">
            <h4 className="text-white font-semibold mb-4">Enter Video URL</h4>
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=... or direct video URL"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              className="mb-4 bg-slate-900 border-slate-600 text-white"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleUrlSubmit()
                }
              }}
            />
            <p className="text-xs text-slate-400 mb-4">
              Supports: YouTube, Vimeo, or direct video file URLs (.mp4, .webm, etc.)
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowUrlInput(false)
                  setVideoUrl('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUrlSubmit}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={!videoUrl.trim()}
              >
                Load Video
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
