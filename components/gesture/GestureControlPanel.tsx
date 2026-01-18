'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Video, VideoOff, Hand, Minimize2, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import { GestureRecognizer, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision'

interface GestureControlPanelProps {
  isEnabled: boolean
  onClose: () => void
}

export function GestureControlPanel({ isEnabled, onClose }: GestureControlPanelProps) {
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [gestureDetected, setGestureDetected] = useState<string | null>(null)
  const [isCompact, setIsCompact] = useState(false)
  const [handsDetected, setHandsDetected] = useState(0)
  const [gestureCooldown, setGestureCooldown] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const gestureRecognizerRef = useRef<GestureRecognizer | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastGestureTimeRef = useRef<{ [key: string]: number }>({})
  const palmPositionHistoryRef = useRef<Array<{ x: number; y: number; timestamp: number }>>([])
  const palmSwipeHistoryRef = useRef<Array<{ x: number; y: number; timestamp: number }>>([])
  const snapHistoryRef = useRef<Array<{ distance: number; timestamp: number }>>([])
  const gestureDebounceMs = 1500 // 1.5 second debounce for zoom gestures
  const scrollDebounceMs = 1500 // 1.5 second debounce for scroll gestures
  const PINCH_THRESHOLD = 0.08 // Distance threshold for detecting OK gesture (increased for better detection)
  const SWIPE_THRESHOLD = 0.15 // Minimum horizontal movement distance for swipe detection
  const SWIPE_TIME_WINDOW = 500 // Time window in ms to track palm movement
  const PALM_SWIPE_THRESHOLD = 0.12 // Minimum horizontal movement for whole palm swipe (no pinch required)
  const SNAP_THRESHOLD = 0.06 // Distance threshold for thumb-middle finger snap detection
  const SNAP_TIME_WINDOW = 300 // Time window in ms to detect quick snap motion
  
  const viewport = useWhiteboardStore((state) => state.viewport)
  const setViewport = useWhiteboardStore((state) => state.setViewport)
  const resetViewport = useWhiteboardStore((state) => state.resetViewport)
  const setVideoPlayerOpen = useWhiteboardStore((state) => state.setVideoPlayerOpen)
  const setVideoPlayerAction = useWhiteboardStore((state) => state.setVideoPlayerAction)

  // Custom OK gesture detection based on thumb-index pinch
  const detectOKGesture = useCallback((landmarks: any) => {
    if (!landmarks || landmarks.length === 0) return false
    
    // Get thumb tip (landmark 4) and index fingertip (landmark 8)
    const thumbTip = landmarks[4]
    const indexTip = landmarks[8]
    
    if (!thumbTip || !indexTip) return false
    
    // Calculate 3D distance between thumb and index finger
    const distance = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
      Math.pow(thumbTip.y - indexTip.y, 2) +
      Math.pow(thumbTip.z - indexTip.z, 2)
    )
    
    // If distance is below threshold, it's an OK gesture (pinch)
    return distance < PINCH_THRESHOLD
  }, [])

  // Custom snap gesture detection (thumb-middle finger snap)
  const detectSnapGesture = useCallback((landmarks: any) => {
    if (!landmarks || landmarks.length === 0) return false
    
    // Get thumb tip (landmark 4) and middle fingertip (landmark 12)
    const thumbTip = landmarks[4]
    const middleTip = landmarks[12]
    const palm = landmarks[0] // Wrist/palm base for movement tracking
    
    if (!thumbTip || !middleTip || !palm) return false
    
    // Calculate 3D distance between thumb tip and middle fingertip
    const thumbMiddleDistance = Math.sqrt(
      Math.pow(thumbTip.x - middleTip.x, 2) +
      Math.pow(thumbTip.y - middleTip.y, 2) +
      Math.pow(thumbTip.z - middleTip.z, 2)
    )
    
    // Track distance over time to detect quick snap motion
    const now = Date.now()
    snapHistoryRef.current.push({ distance: thumbMiddleDistance, timestamp: now })
    
    // Remove old entries outside time window
    snapHistoryRef.current = snapHistoryRef.current.filter(
      entry => now - entry.timestamp <= SNAP_TIME_WINDOW
    )
    
    // Need at least 3 positions to detect snap motion (close, then separate)
    if (snapHistoryRef.current.length < 3) return false
    
    // Detect snap: fingers come close together (below threshold) then separate
    // Check if distance was below threshold recently and is now increasing
    const recentDistances = snapHistoryRef.current.map(e => e.distance)
    const minDistance = Math.min(...recentDistances)
    const maxDistance = Math.max(...recentDistances)
    
    // Snap detected if:
    // 1. Fingers came close (min distance below threshold)
    // 2. Then separated (current distance > min distance + some margin)
    // 3. This happened quickly (within time window)
    if (minDistance < SNAP_THRESHOLD && thumbMiddleDistance > minDistance + 0.05) {
      // Clear history after detecting snap
      snapHistoryRef.current = []
      return true
    }
    
    return false
  }, [])

  // Custom whole palm swipe detection (no pinch required - side of palm movement)
  const detectPalmSwipe = useCallback((landmarks: any) => {
    if (!landmarks || landmarks.length === 0) return null
    
    // Get palm/wrist base (landmark 0) - side of the palm
    const palm = landmarks[0]
    
    if (!palm) return null
    
    // Track palm movement over time (no pinch check needed)
    const now = Date.now()
    const currentPalmPos = { x: palm.x, y: palm.y, timestamp: now }
    
    // Add current position to history
    palmSwipeHistoryRef.current.push(currentPalmPos)
    
    // Remove old positions outside time window
    palmSwipeHistoryRef.current = palmSwipeHistoryRef.current.filter(
      pos => now - pos.timestamp <= SWIPE_TIME_WINDOW
    )
    
    // Need at least 2 positions to detect movement
    if (palmSwipeHistoryRef.current.length < 2) return null
    
    // Calculate horizontal movement of the palm
    const oldestPos = palmSwipeHistoryRef.current[0]
    const horizontalMovement = currentPalmPos.x - oldestPos.x
    
    // Detect swipe direction based on horizontal movement
    if (Math.abs(horizontalMovement) >= PALM_SWIPE_THRESHOLD) {
      if (horizontalMovement > 0) {
        return 'Palm_Swipe_Right' // Moving right
      } else {
        return 'Palm_Swipe_Left' // Moving left
      }
    }
    
    return null
  }, [])

  // Custom horizontal swipe detection (pinch + palm movement) - kept for backward compatibility
  const detectHorizontalSwipe = useCallback((landmarks: any) => {
    if (!landmarks || landmarks.length === 0) return null
    
    // Get thumb tip (landmark 4) and index fingertip (landmark 8)
    const thumbTip = landmarks[4]
    const indexTip = landmarks[8]
    const palm = landmarks[0] // Wrist/palm base
    
    if (!thumbTip || !indexTip || !palm) return null
    
    // 1. Check if thumb and index are pinched (close together)
    const thumbIndexDistance = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
      Math.pow(thumbTip.y - indexTip.y, 2) +
      Math.pow(thumbTip.z - indexTip.z, 2)
    )
    
    // Must be pinched to detect swipe
    if (thumbIndexDistance >= PINCH_THRESHOLD) {
      // Clear history if not pinched
      palmPositionHistoryRef.current = []
      return null
    }
    
    // 2. Track palm movement over time
    const now = Date.now()
    const currentPalmPos = { x: palm.x, y: palm.y, timestamp: now }
    
    // Add current position to history
    palmPositionHistoryRef.current.push(currentPalmPos)
    
    // Remove old positions outside time window
    palmPositionHistoryRef.current = palmPositionHistoryRef.current.filter(
      pos => now - pos.timestamp <= SWIPE_TIME_WINDOW
    )
    
    // Need at least 2 positions to detect movement
    if (palmPositionHistoryRef.current.length < 2) return null
    
    // 3. Calculate horizontal movement
    const oldestPos = palmPositionHistoryRef.current[0]
    const horizontalMovement = currentPalmPos.x - oldestPos.x
    
    // 4. Detect swipe direction
    if (Math.abs(horizontalMovement) >= SWIPE_THRESHOLD) {
      if (horizontalMovement > 0) {
        return 'Swipe_Right' // Moving right
      } else {
        return 'Swipe_Left' // Moving left
      }
    }
    
    return null
  }, [])

  // Custom Zero gesture detection (O-shape: thumb-index touching, other fingers extended)
  const detectZeroGesture = useCallback((landmarks: any) => {
    if (!landmarks || landmarks.length === 0) return false
    
    // Get thumb tip (landmark 4) and index fingertip (landmark 8)
    const thumbTip = landmarks[4]
    const indexTip = landmarks[8]
    const wrist = landmarks[0]
    
    if (!thumbTip || !indexTip || !wrist) return false
    
    // 1. Calculate 3D distance between thumb and index finger (should be close)
    const thumbIndexDistance = Math.sqrt(
      Math.pow(thumbTip.x - indexTip.x, 2) +
      Math.pow(thumbTip.y - indexTip.y, 2) +
      Math.pow(thumbTip.z - indexTip.z, 2)
    )
    
    // Thumb and index must be close (forming the O)
    if (thumbIndexDistance >= PINCH_THRESHOLD) return false
    
    // 2. Check that other fingers (middle, ring, pinky) are extended (not fist)
    // For each finger, check if the tip is further from wrist than the base
    const fingerExtensionChecks = [
      { tip: 12, base: 9 },   // Middle finger
      { tip: 16, base: 13 },  // Ring finger
      { tip: 20, base: 17 }   // Pinky finger
    ]
    
    let extendedCount = 0
    for (const finger of fingerExtensionChecks) {
      const tipLandmark = landmarks[finger.tip]
      const baseLandmark = landmarks[finger.base]
      
      if (!tipLandmark || !baseLandmark) continue
      
      // Distance from wrist to tip
      const tipDistance = Math.sqrt(
        Math.pow(tipLandmark.x - wrist.x, 2) +
        Math.pow(tipLandmark.y - wrist.y, 2) +
        Math.pow(tipLandmark.z - wrist.z, 2)
      )
      
      // Distance from wrist to base
      const baseDistance = Math.sqrt(
        Math.pow(baseLandmark.x - wrist.x, 2) +
        Math.pow(baseLandmark.y - wrist.y, 2) +
        Math.pow(baseLandmark.z - wrist.z, 2)
      )
      
      // If tip is further than base, finger is extended
      if (tipDistance > baseDistance * 1.1) {
        extendedCount++
      }
    }
    
    // At least 2 out of 3 fingers should be extended (not a fist)
    return extendedCount >= 2
  }, [])

  // Action handlers
  const handleZoomIn = useCallback(() => {
    // Zoom in by absolute 15% (adds 0.15 to scale)
    const newScale = viewport.scale + 0.15
    setViewport({ scale: newScale })
  }, [viewport.scale, setViewport])

  const handleZoomOut = useCallback(() => {
    const newScale = Math.max(0.1, viewport.scale - 0.15)
    setViewport({ scale: newScale })
  }, [viewport.scale, setViewport])

  const handleScrollUp = useCallback(() => {
    const scrollAmount = window.innerHeight * 0.30 // 30% absolute scroll
    const targetY = viewport.y - scrollAmount
    const startY = viewport.y
    const duration = 300 // Animation duration in milliseconds
    const startTime = performance.now()
    
    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease-out function for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const currentY = startY + (targetY - startY) * easeOut
      
      setViewport({ y: currentY })
      
      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      }
    }
    
    requestAnimationFrame(animateScroll)
  }, [viewport.y, setViewport])

  const handleScrollDown = useCallback(() => {
    const scrollAmount = window.innerHeight * 0.30 // 30% absolute scroll
    const targetY = viewport.y + scrollAmount
    const startY = viewport.y
    const duration = 300 // Animation duration in milliseconds
    const startTime = performance.now()
    
    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease-out function for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const currentY = startY + (targetY - startY) * easeOut
      
      setViewport({ y: currentY })
      
      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      }
    }
    
    requestAnimationFrame(animateScroll)
  }, [viewport.y, setViewport])

  const handleShowVideoPlayer = useCallback(() => {
    setVideoPlayerOpen(true)
  }, [setVideoPlayerOpen])

  const handlePauseVideo = useCallback(() => {
    setVideoPlayerAction('pause')
  }, [setVideoPlayerAction])

  const handlePlayVideo = useCallback(() => {
    setVideoPlayerAction('play')
  }, [setVideoPlayerAction])

  const handleHideVideoPlayer = useCallback(() => {
    setVideoPlayerOpen(false)
    resetViewport()
  }, [setVideoPlayerOpen, resetViewport])

  // Trigger action based on detected gesture with debouncing
  const triggerGestureAction = useCallback((gesture: string) => {
    const now = Date.now()
    const lastTime = lastGestureTimeRef.current[gesture] || 0
    
    // Video control, swipe, and snap gestures execute immediately (no debouncing)
    const isVideoGesture = gesture === 'Open_Palm' || gesture === 'Closed_Fist'
    const isSwipeGesture = gesture === 'Swipe_Left' || gesture === 'Swipe_Right' || gesture === 'Palm_Swipe_Left' || gesture === 'Palm_Swipe_Right'
    const isSnapGesture = gesture === 'Snap_Gesture'
    
    if (!isVideoGesture && !isSwipeGesture && !isSnapGesture) {
      // Determine debounce time based on gesture type
      const isScrollGesture = gesture === 'Pointing_Up' || gesture === 'Thumb_Down'
      const debounceTime = isScrollGesture ? scrollDebounceMs : gestureDebounceMs
      
      // Check if enough time has passed since last trigger
      if (now - lastTime < debounceTime) {
        // Show cooldown message
        const timeRemaining = ((debounceTime - (now - lastTime)) / 1000).toFixed(1)
        setGestureCooldown(`Wait ${timeRemaining}s`)
        return
      }
      
      // Update last trigger time for non-video gestures
      lastGestureTimeRef.current[gesture] = now
    }
    
    // Clear cooldown message
    setGestureCooldown(null)
    
    // Map gestures to actions
    switch (gesture) {
      case 'Zero_Gesture':  // ⭕ Custom Zero gesture (O-shape, not fist) → Zoom in by absolute 30% (1.5s cooldown, smooth animation)
      case 'OK_Gesture':  // 👌 Custom OK gesture (thumb-index pinch) → Zoom in by absolute 30% (1.5s cooldown, smooth animation)
      case 'Thumb_Up':
      case 'ILoveYou':  // 👌 ILoveYou gesture → Zoom in by absolute 30% (1.5s cooldown, smooth animation)
        handleZoomIn()
        break
      case 'Victory':  // ✌️ Victory gesture → Zoom out by absolute 30% (1.5s cooldown, smooth animation)
        handleZoomOut()
        break
      case 'Pointing_Up':  // ☝️ Pointing Up → Scroll up 30% (1.5s cooldown, smooth animation)
        handleScrollUp()
        break
      case 'Thumb_Down':  // 👎 Thumb Down → Scroll down 30% (1.5s cooldown, smooth animation)
        handleScrollDown()
        break
      case 'Open_Palm':  // 🖐️ Open Palm → Play/Continue video (immediate, no cooldown)
        handlePlayVideo()
        break
      case 'Closed_Fist':  // ✊ Closed Fist → Pause video (immediate, no cooldown)
        handlePauseVideo()
        break
      case 'Palm_Swipe_Left':  // 👈 Whole Palm Swipe Left (side of palm, no pinch) → Enable/Show video player (immediate, no cooldown)
        handleShowVideoPlayer()
        break
      case 'Palm_Swipe_Right':  // 👉 Whole Palm Swipe Right (side of palm, no pinch) → Hide video player (immediate, no cooldown)
        handleHideVideoPlayer()
        break
      case 'Swipe_Right':  // 👉 Swipe Right (pinch + move right) → Enable/Show video player (immediate, no cooldown)
        handleShowVideoPlayer()
        break
      case 'Swipe_Left':  // 👈 Swipe Left (pinch + move left) → Hide video player (immediate, no cooldown)
        handleHideVideoPlayer()
        break
      case 'Snap_Gesture':  // 👌 Snap Gesture (thumb-middle finger snap) → Disable camera/gesture control (ONLY gesture that disables camera, immediate, no cooldown)
        onClose()
        break
    }
  }, [handleZoomIn, handleZoomOut, handleScrollUp, handleScrollDown, handlePlayVideo, handlePauseVideo, handleHideVideoPlayer, handleShowVideoPlayer, onClose])

  // Initialize MediaPipe Gesture Recognizer
  const initializeGestureRecognizer = useCallback(async () => {
    try {
      // Suppress MediaPipe info messages that appear as errors
      const originalError = console.error
      console.error = (...args: any[]) => {
        const msg = args.join(' ')
        if (msg.includes('TensorFlow Lite XNNPACK delegate') || 
            msg.includes('INFO:')) {
          return // Suppress MediaPipe info logs
        }
        originalError.apply(console, args)
      }
      
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      )
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'GPU'
        },
        numHands: 2,
        runningMode: 'VIDEO'
      })
      gestureRecognizerRef.current = recognizer
      
      // Restore original console.error
      console.error = originalError
    } catch (error) {
      console.error('Error initializing gesture recognizer:', error)
    }
  }, [])

  // Detect gestures from video feed
  const detectGestures = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !gestureRecognizerRef.current || !isCameraOn) {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    
    if (video.readyState >= 2) {
      const results = gestureRecognizerRef.current.recognizeForVideo(video, performance.now())
      
      // Clear canvas
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        // Draw hand landmarks
        if (results.landmarks && results.landmarks.length > 0) {
          const drawingUtils = new DrawingUtils(ctx)
          for (const landmarks of results.landmarks) {
            drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, {
              color: '#00FF00',
              lineWidth: 2
            })
            drawingUtils.drawLandmarks(landmarks, {
              color: '#FF0000',
              lineWidth: 1,
              radius: 3
            })
          }
        }
        
        // Update detected hands count
        setHandsDetected(results.landmarks?.length || 0)
        
        // Check for custom gestures - PRIORITY DETECTION
        let customGestureDetected = false
        if (results.landmarks && results.landmarks.length > 0) {
          // First check for snap gesture (thumb-middle finger snap) - HIGHEST PRIORITY
          const isSnap = detectSnapGesture(results.landmarks[0])
          if (isSnap) {
            setGestureDetected('Snap_Gesture')
            triggerGestureAction('Snap_Gesture')
            customGestureDetected = true
          } else {
            // If not snapping, check for whole palm swipe (no pinch required - side of palm movement)
            const palmSwipeDirection = detectPalmSwipe(results.landmarks[0])
            if (palmSwipeDirection) {
              setGestureDetected(palmSwipeDirection)
              triggerGestureAction(palmSwipeDirection)
              customGestureDetected = true
            } else {
              // If not palm swiping, check for pinch-based swipe
              const swipeDirection = detectHorizontalSwipe(results.landmarks[0])
              if (swipeDirection) {
                setGestureDetected(swipeDirection)
                triggerGestureAction(swipeDirection)
                customGestureDetected = true
              } else {
                // If not swiping, check for Zero gesture (O-shape with extended fingers)
                const isZero = detectZeroGesture(results.landmarks[0])
                if (isZero) {
                  setGestureDetected('Zero_Gesture')
                  triggerGestureAction('Zero_Gesture')
                  customGestureDetected = true
                } else {
                  // If not Zero, check for OK gesture (simple pinch)
                  const isOK = detectOKGesture(results.landmarks[0])
                  if (isOK) {
                    setGestureDetected('OK_Gesture')
                    triggerGestureAction('OK_Gesture')
                    customGestureDetected = true
                  }
                }
              }
            }
          }
        }
        
        // Update gesture from MediaPipe (if no custom gesture detected)
        if (!customGestureDetected) {
          if (results.gestures && results.gestures.length > 0) {
            const topGesture = results.gestures[0][0]
            const gestureName = topGesture.categoryName
            
            // Ignore Victory gesture if it might be an OK gesture attempt
            // Check if thumb and index are close (even if above strict threshold)
            let skipGesture = false
            if (gestureName === 'Victory' && results.landmarks && results.landmarks.length > 0) {
              const thumbTip = results.landmarks[0][4]
              const indexTip = results.landmarks[0][8]
              const distance = Math.sqrt(
                Math.pow(thumbTip.x - indexTip.x, 2) +
                Math.pow(thumbTip.y - indexTip.y, 2) +
                Math.pow(thumbTip.z - indexTip.z, 2)
              )
              // If thumb and index are somewhat close, ignore Victory detection
              if (distance < 0.15) {
                skipGesture = true
              }
            }
            
            if (!skipGesture && topGesture.score > 0.7) {
              setGestureDetected(gestureName)
              // Trigger action based on detected gesture
              triggerGestureAction(gestureName)
            } else {
              setGestureDetected(null)
            }
          } else {
            setGestureDetected(null)
          }
        }
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(detectGestures)
  }, [isCameraOn, triggerGestureAction, detectOKGesture, detectZeroGesture, detectHorizontalSwipe, detectPalmSwipe, detectSnapGesture])

  const startCamera = useCallback(async () => {
    // Don't start if already running
    if (isCameraOn && streamRef.current) {
      return
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setIsCameraOn(true)
        
        // Wait for video to load, then start gesture detection
        videoRef.current.onloadedmetadata = () => {
          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth
            canvasRef.current.height = videoRef.current.videoHeight
          }
          detectGestures()
        }
      }
    } catch (error) {
      console.error('Error accessing camera:', error)
      alert('Unable to access camera. Please check permissions.')
    }
  }, [detectGestures, isCameraOn])

  const stopCamera = useCallback(() => {
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraOn(false)
    setGestureDetected(null)
    setHandsDetected(0)
    // Clear palm position history when camera stops
    palmPositionHistoryRef.current = []
    palmSwipeHistoryRef.current = []
    snapHistoryRef.current = []
  }, [])

  const toggleCamera = () => {
    // When gesture control is enabled, camera should always be on
    // Only allow toggling if gesture control is disabled
    if (!isEnabled) {
      if (isCameraOn) {
        stopCamera()
      } else {
        startCamera()
      }
    } else {
      // If gesture control is enabled, ensure camera stays on
      if (!isCameraOn) {
        startCamera()
      }
    }
  }

  // Initialize gesture recognizer on mount
  useEffect(() => {
    initializeGestureRecognizer()
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [initializeGestureRecognizer])

  // Auto-start camera when gesture control is enabled
  useEffect(() => {
    if (isEnabled) {
      // Ensure camera is always on when gesture control is enabled
      startCamera()
    } else {
      stopCamera()
    }
  }, [isEnabled, startCamera, stopCamera])

  if (!isEnabled) return null

  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-50 w-80 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl overflow-hidden",
      isCompact ? "max-h-80" : ""
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-slate-900/50 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Hand size={18} className="text-theme-primary" />
          <h3 className="text-sm font-semibold text-white">Gesture Control</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCompact(!isCompact)}
            className="text-slate-400 hover:text-white transition-colors"
            title={isCompact ? "Expand" : "Compact"}
          >
            {isCompact ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Video Preview */}
      <div className={cn("p-3", isCompact && "overflow-y-auto max-h-[calc(20rem-3rem)]")}>
        <div className="relative bg-slate-900 rounded-lg overflow-hidden aspect-video min-h-[180px]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 w-full h-full object-cover scale-x-[-1]",
              isCameraOn ? "block" : "hidden"
            )}
          />
          <canvas
            ref={canvasRef}
            className={cn(
              "absolute inset-0 w-full h-full scale-x-[-1]",
              isCameraOn ? "block" : "hidden"
            )}
          />
          {!isCameraOn && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <VideoOff size={32} className="mx-auto mb-2 text-slate-600" />
                <p className="text-xs text-slate-500">Camera off</p>
              </div>
            </div>
          )}
          
          {/* Gesture Indicator */}
          {gestureDetected && isCameraOn && (
            <div className="absolute top-2 left-2 bg-blue-500/90 px-3 py-1.5 rounded-lg text-sm font-bold text-white shadow-lg">
              🤚 {gestureDetected}
            </div>
          )}
          
          {/* Cooldown Indicator */}
          {gestureCooldown && isCameraOn && (
            <div className="absolute top-12 left-2 bg-orange-500/90 px-3 py-1.5 rounded-lg text-sm font-bold text-white shadow-lg">
              ⏱️ {gestureCooldown}
            </div>
          )}
          
          {/* Hands Detected Counter */}
          {isCameraOn && (
            <div className="absolute bottom-2 left-2 bg-slate-800/80 px-2 py-1 rounded text-xs font-medium text-white">
              👋 {handsDetected} hand{handsDetected !== 1 ? 's' : ''} detected
            </div>
          )}
          
          {/* Camera Status Overlay */}
          {isCameraOn && (
            <div className="absolute top-2 right-2 bg-green-500/80 px-2 py-1 rounded text-xs font-medium text-white flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              LIVE
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-3 flex items-center justify-between">
          <Button
            size="sm"
            variant={isCameraOn ? "destructive" : "default"}
            onClick={toggleCamera}
            disabled={isEnabled}
            className="flex items-center gap-2"
            title={isEnabled ? "Camera is always on when gesture control is enabled" : undefined}
          >
            {isCameraOn ? (
              <>
                <VideoOff size={14} />
                Stop Camera
              </>
            ) : (
              <>
                <Video size={14} />
                Start Camera
              </>
            )}
          </Button>

          <div className={cn(
            "flex items-center gap-2 text-xs",
            isCameraOn ? "text-green-400" : "text-slate-500"
          )}>
            <div className={cn(
              "w-2 h-2 rounded-full",
              isCameraOn ? "bg-green-400 animate-pulse" : "bg-slate-600"
            )} />
            {isCameraOn ? "Active" : "Inactive"}
          </div>
        </div>

        {/* Status Info */}
        <div className="mt-3 p-2 bg-slate-900/50 rounded border border-slate-700">
          <p className="text-xs text-slate-400">
            {isCameraOn 
              ? "Gesture recognition ready. Use hand gestures to control the whiteboard."
              : "Enable camera to start detecting gestures."
            }
          </p>
        </div>

        {/* Gesture Commands */}
        <div className="mt-3">
          <h4 className="text-xs font-semibold text-slate-400 mb-2">Available Gestures</h4>
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white"
            >
              <span className="text-xs">⭕ Zoom In 30%: Zero/OK Gesture</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white"
            >
              <span className="text-xs">✌️ Zoom Out 30%: Victory Gesture</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleScrollUp}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white"
            >
              <span className="text-xs">☝️ Scroll Up 30%: One Gesture</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleScrollDown}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white"
            >
              <span className="text-xs">👎 Scroll Down 30%: Thumb-Down Gesture</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShowVideoPlayer}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white"
            >
              <span className="text-xs">👈 Enable Video Player: Pointing Left</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePauseVideo}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white"
            >
              <span className="text-xs">✊ Pause Video: Fist</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePlayVideo}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white"
            >
              <span className="text-xs">🖐️ Continue Video: Palm</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleHideVideoPlayer}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white"
            >
              <span className="text-xs">👋 Hide Video Player: Swipe</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="w-full justify-start text-left bg-slate-900/50 border-slate-700 hover:bg-slate-800 text-white border-red-500/50 hover:border-red-500"
            >
              <span className="text-xs">✋ Disable Camera: Close Palm</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
