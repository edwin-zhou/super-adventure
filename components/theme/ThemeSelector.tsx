'use client'

import { useState } from 'react'
import { Palette, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const THEME_COLORS = [
  { name: 'Blue', value: '#3b82f6', hover: '#2563eb' },
  { name: 'Purple', value: '#8b5cf6', hover: '#7c3aed' },
  { name: 'Pink', value: '#ec4899', hover: '#db2777' },
  { name: 'Red', value: '#ef4444', hover: '#dc2626' },
  { name: 'Orange', value: '#f97316', hover: '#ea580c' },
  { name: 'Amber', value: '#f59e0b', hover: '#d97706' },
  { name: 'Green', value: '#10b981', hover: '#059669' },
  { name: 'Teal', value: '#14b8a6', hover: '#0d9488' },
  { name: 'Cyan', value: '#06b6d4', hover: '#0891b2' },
  { name: 'Indigo', value: '#6366f1', hover: '#4f46e5' },
  { name: 'Violet', value: '#a855f7', hover: '#9333ea' },
  { name: 'Rose', value: '#f43f5e', hover: '#e11d48' },
]

export function ThemeSelector() {
  const [showColorPanel, setShowColorPanel] = useState(false)
  const [selectedColor, setSelectedColor] = useState(THEME_COLORS[0]) // Default to blue

  const applyTheme = (color: typeof THEME_COLORS[0]) => {
    setSelectedColor(color)
    
    // Update CSS variables for the theme
    document.documentElement.style.setProperty('--theme-primary', color.value)
    document.documentElement.style.setProperty('--theme-primary-hover', color.hover)
  }

  return (
    <TooltipProvider>
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-10 h-10"
              onClick={() => setShowColorPanel(!showColorPanel)}
              style={{ 
                color: selectedColor.value 
              }}
            >
              <Palette size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Theme Color</TooltipContent>
        </Tooltip>

        {/* Color Panel */}
        {showColorPanel && (
          <div className="absolute top-0 left-16 bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg p-4 shadow-lg w-80 z-[60]">
            <div className="flex items-center justify-between mb-4">
              <Label className="text-sm text-white font-semibold">Choose Theme Color</Label>
              <button
                onClick={() => setShowColorPanel(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {THEME_COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => {
                    applyTheme(color)
                    setShowColorPanel(false)
                  }}
                  className={cn(
                    'relative group rounded-lg p-4 transition-all hover:scale-110',
                    selectedColor.value === color.value && 'ring-2 ring-white'
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {selectedColor.value === color.value && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                  )}
                  <div className="opacity-0 group-hover:opacity-100 absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-white whitespace-nowrap">
                    {color.name}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-600">
              <Label className="text-xs text-slate-400">Current: {selectedColor.name}</Label>
              <div 
                className="mt-2 h-8 rounded flex items-center justify-center text-white text-sm font-medium"
                style={{ backgroundColor: selectedColor.value }}
              >
                Preview
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
