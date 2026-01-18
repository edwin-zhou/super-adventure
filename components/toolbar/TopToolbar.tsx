'use client'

import { useState } from 'react'
import {
  Waves,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useWhiteboardStore } from '@/stores/useWhiteboardStore'
import { GestureControlPanel } from '@/components/gesture/GestureControlPanel'

export function TopToolbar() {
  const [showGestureControl, setShowGestureControl] = useState(false)
  
  const gestureEnabled = useWhiteboardStore((state) => state.gestureControlEnabled)
  const setGestureEnabled = useWhiteboardStore((state) => state.setGestureControlEnabled)

  return (
    <>
      <TooltipProvider>
        <div className="fixed left-4 top-4 z-50">
          <div className="flex gap-2 bg-slate-800/90 backdrop-blur-sm border border-slate-700 rounded-lg px-4 py-2 shadow-lg">
            {/* Gesture Control Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'w-10 h-10',
                    gestureEnabled && 'bg-theme-primary bg-theme-primary-hover'
                  )}
                  onClick={() => setShowGestureControl(!showGestureControl)}
                >
                  <Waves size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Gesture Control</TooltipContent>
            </Tooltip>
          </div>

          {/* Gesture Control Toggle */}
          {showGestureControl && (
            <div className="absolute top-16 left-0 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg w-64">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-white">Gesture Control</Label>
                <button
                  onClick={() => setShowGestureControl(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm text-slate-300">
                  {gestureEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  onClick={() => setGestureEnabled(!gestureEnabled)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    gestureEnabled ? 'bg-theme-primary' : 'bg-slate-600'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      gestureEnabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </TooltipProvider>

      {/* Gesture Control Panel at Bottom Right */}
      <GestureControlPanel 
        isEnabled={gestureEnabled}
        onClose={() => setGestureEnabled(false)}
      />
    </>
  )
}
