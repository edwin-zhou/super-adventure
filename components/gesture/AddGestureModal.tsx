'use client'

import { useState } from 'react'
import { X, Plus, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'

interface AddGestureModalProps {
  isOpen: boolean
  onClose: () => void
}

const GESTURE_TYPES = [
  { value: 'two_finger_pinch', label: 'Two Finger Pinch', description: 'Pinch two fingers together' },
  { value: 'finger_point', label: 'Finger Pointing', description: 'Point with a specific finger' },
  { value: 'hand_height', label: 'Hand Position', description: 'Detect hand above/below position' },
]

const ACTION_TYPES = [
  { value: 'zoom_in', label: 'Zoom In' },
  { value: 'zoom_out', label: 'Zoom Out' },
  { value: 'scroll_up', label: 'Scroll Up' },
  { value: 'scroll_down', label: 'Scroll Down' },
  { value: 'play_video', label: 'Play Video' },
  { value: 'pause_video', label: 'Pause Video' },
  { value: 'open_url', label: 'Open URL' },
]

const FINGER_OPTIONS = [
  { value: 4, label: 'Thumb' },
  { value: 8, label: 'Index' },
  { value: 12, label: 'Middle' },
  { value: 16, label: 'Ring' },
  { value: 20, label: 'Pinky' },
]

export function AddGestureModal({ isOpen, onClose }: AddGestureModalProps) {
  const [gestureName, setGestureName] = useState('')
  const [gestureType, setGestureType] = useState('two_finger_pinch')
  const [actionType, setActionType] = useState('zoom_in')
  const [finger1, setFinger1] = useState(4) // Thumb
  const [finger2, setFinger2] = useState(8) // Index
  const [threshold, setThreshold] = useState(0.06)
  const [fingerTip, setFingerTip] = useState(8) // Index finger tip
  const [urlInput, setUrlInput] = useState('https://google.com')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const customGestures = useWhiteboardStore((state) => state.customGestures)
  const addCustomGesture = useWhiteboardStore((state) => state.addCustomGesture)
  const removeCustomGesture = useWhiteboardStore((state) => state.removeCustomGesture)

  const handleGenerate = async () => {
    if (!gestureName.trim()) {
      setError('Please enter a gesture name')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const detectionParams: any = {}
      
      if (gestureType === 'two_finger_pinch') {
        detectionParams.finger1 = finger1
        detectionParams.finger2 = finger2
        detectionParams.threshold = threshold
      } else if (gestureType === 'finger_point') {
        detectionParams.fingerTip = fingerTip
        detectionParams.fingerBase = fingerTip - 3 // MCP joint
      } else if (gestureType === 'hand_height') {
        detectionParams.threshold = 0.5
        detectionParams.above = true
      }

      const actionParams: any = {}
      if (actionType === 'open_url') {
        actionParams.url = urlInput
      }

      const response = await fetch('/api/generate-gesture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gestureName: gestureName.trim(),
          gestureType,
          detectionParams,
          actionType,
          actionParams,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate gesture')
      }

      const { detectionCode, actionCode } = await response.json()

      const newGesture = {
        id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: gestureName.trim(),
        description: GESTURE_TYPES.find(g => g.value === gestureType)?.description || '',
        detectionCode,
        actionCode,
      }

      addCustomGesture(newGesture)

      // Reset form
      setGestureName('')
      setError(null)
    } catch (err) {
      console.error('Error generating gesture:', err)
      setError('Failed to generate gesture. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDelete = (id: string) => {
    removeCustomGesture(id)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-[600px] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Add Custom Gesture</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <Label htmlFor="gesture-name" className="text-white mb-2">
              Gesture Name
            </Label>
            <Input
              id="gesture-name"
              placeholder="e.g., Quick Zoom"
              value={gestureName}
              onChange={(e) => setGestureName(e.target.value)}
              className="bg-slate-900 border-slate-600 text-white"
            />
          </div>

          <div>
            <Label htmlFor="gesture-type" className="text-white mb-2">
              Gesture Type
            </Label>
            <select
              id="gesture-type"
              value={gestureType}
              onChange={(e) => setGestureType(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {GESTURE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label} - {type.description}
                </option>
              ))}
            </select>
          </div>

          {/* Gesture-specific parameters */}
          {gestureType === 'two_finger_pinch' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-white mb-2">Finger 1</Label>
                <select
                  value={finger1}
                  onChange={(e) => setFinger1(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-white text-sm"
                >
                  {FINGER_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-white mb-2">Finger 2</Label>
                <select
                  value={finger2}
                  onChange={(e) => setFinger2(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-white text-sm"
                >
                  {FINGER_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-white mb-2">Sensitivity</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="0.2"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="bg-slate-900 border-slate-600 text-white text-sm"
                />
              </div>
            </div>
          )}

          {gestureType === 'finger_point' && (
            <div>
              <Label className="text-white mb-2">Pointing Finger</Label>
              <select
                value={fingerTip}
                onChange={(e) => setFingerTip(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-white"
              >
                {FINGER_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label htmlFor="action-type" className="text-white mb-2">
              Action to Trigger
            </Label>
            <select
              id="action-type"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ACTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {actionType === 'open_url' && (
            <div>
              <Label className="text-white mb-2">URL</Label>
              <Input
                type="url"
                placeholder="https://example.com"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                className="bg-slate-900 border-slate-600 text-white"
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="p-3 bg-blue-500/10 border border-blue-500/50 rounded text-blue-400 text-xs">
            <p className="font-semibold mb-1">💡 Template-Based System</p>
            <p>Choose a gesture pattern and customize it with your preferred fingers and actions. No coding required!</p>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !gestureName.trim()}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus size={16} className="mr-2" />
                Create Gesture
              </>
            )}
          </Button>
        </div>

        {/* Custom Gestures List */}
        {customGestures.length > 0 && (
          <div className="border-t border-slate-700 pt-4">
            <h4 className="text-sm font-semibold text-white mb-3">Your Custom Gestures</h4>
            <div className="space-y-2">
              {customGestures.map((gesture) => (
                <div
                  key={gesture.id}
                  className="flex items-center justify-between p-3 bg-slate-900/50 rounded border border-slate-700"
                >
                  <div className="flex-1">
                    <p className="text-white font-medium">{gesture.name}</p>
                    <p className="text-xs text-slate-400">{gesture.description}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(gesture.id)}
                    className="text-red-400 hover:text-red-300 transition-colors ml-3"
                    title="Delete gesture"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
