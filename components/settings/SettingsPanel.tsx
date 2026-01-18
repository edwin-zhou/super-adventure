'use client'

import { useState, useEffect } from 'react'
import { X, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const PAGE_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Cream', value: '#fef3c7' },
  { name: 'Light Yellow', value: '#fef9c3' },
  { name: 'Light Blue', value: '#dbeafe' },
  { name: 'Light Green', value: '#dcfce7' },
  { name: 'Light Pink', value: '#fce7f3' },
  { name: 'Light Purple', value: '#f3e8ff' },
  { name: 'Light Gray', value: '#f3f4f6' },
  { name: 'Beige', value: '#fef2f2' },
  { name: 'Mint', value: '#d1fae5' },
  { name: 'Sky', value: '#e0f2fe' },
  { name: 'Lavender', value: '#ede9fe' },
  { name: 'Peach', value: '#ffedd5' },
  { name: 'Rose', value: '#ffe4e6' },
  { name: 'Ivory', value: '#fffbeb' },
  { name: 'Slate', value: '#e2e8f0' },
  { name: 'Powder Blue', value: '#b3e5fc' },
  { name: 'Seafoam', value: '#b2dfdb' },
  { name: 'Lemon', value: '#fff9c4' },
  { name: 'Blush', value: '#ffccbc' },
  { name: 'Lilac', value: '#e1bee7' },
  { name: 'Pearl', value: '#f5f5f5' },
  { name: 'Champagne', value: '#faebd7' },
  { name: 'Aqua', value: '#ccf5f5' },
]

const FONT_OPTIONS = [
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Times New Roman', value: '"Times New Roman", serif' },
  { name: 'Courier', value: '"Courier New", monospace' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Comic Sans', value: '"Comic Sans MS", cursive' },
  { name: 'Impact', value: 'Impact, fantasy' },
  { name: 'Trebuchet', value: '"Trebuchet MS", sans-serif' },
  { name: 'Helvetica', value: 'Helvetica, sans-serif' },
  { name: 'Palatino', value: '"Palatino Linotype", serif' },
  { name: 'Garamond', value: 'Garamond, serif' },
  { name: 'Bookman', value: '"Bookman Old Style", serif' },
  { name: 'Tahoma', value: 'Tahoma, sans-serif' },
  { name: 'Monaco', value: 'Monaco, monospace' },
  { name: 'Lucida', value: '"Lucida Console", monospace' },
  { name: 'Brush Script', value: '"Brush Script MT", cursive' },
]

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

type GridType = 'grid' | 'lines' | 'dots' | 'large-grid' | 'small-dots' | 'cross'

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [selectedColor, setSelectedColor] = useState(PAGE_COLORS[0])
  const [customColor, setCustomColor] = useState('#ffffff')
  const [gridType, setGridType] = useState<GridType>('grid')
  const [selectedFont, setSelectedFont] = useState(FONT_OPTIONS[0])
  const [showAllColors, setShowAllColors] = useState(false)
  const [showAllFonts, setShowAllFonts] = useState(false)
  const [showAllGrids, setShowAllGrids] = useState(false)

  // Load grid type from document on mount (SSR-safe)
  useEffect(() => {
    const stored = document.documentElement.getAttribute('data-grid-type') as GridType | null
    if (stored) {
      setGridType(stored)
    }
  }, [])

  const applyPageColor = (color: string) => {
    document.documentElement.style.setProperty('--page-color', color)
  }

  const applyGridType = (type: GridType) => {
    setGridType(type)
    document.documentElement.setAttribute('data-grid-type', type)
  }

  const gridOptions = [
    { 
      type: 'grid' as GridType, 
      name: 'Grid',
      preview: (
        <div className="w-16 h-16 bg-white rounded border border-slate-300 relative overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={`v-${i}`} className="absolute top-0 bottom-0 w-px bg-slate-300" style={{ left: `${i * 25}%` }} />
          ))}
          {[...Array(5)].map((_, i) => (
            <div key={`h-${i}`} className="absolute left-0 right-0 h-px bg-slate-300" style={{ top: `${i * 25}%` }} />
          ))}
        </div>
      )
    },
    { 
      type: 'lines' as GridType, 
      name: 'Lines',
      preview: (
        <div className="w-16 h-16 bg-white rounded border border-slate-300 relative overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={`h-${i}`} className="absolute left-0 right-0 h-px bg-slate-300" style={{ top: `${i * 25}%` }} />
          ))}
        </div>
      )
    },
    { 
      type: 'dots' as GridType, 
      name: 'Dots',
      preview: (
        <div className="w-16 h-16 bg-white rounded border border-slate-300 relative">
          {[...Array(5)].map((_, i) => 
            [...Array(5)].map((_, j) => (
              <div 
                key={`${i}-${j}`}
                className="absolute w-1 h-1 bg-slate-400 rounded-full" 
                style={{ left: `${j * 25}%`, top: `${i * 25}%` }}
              />
            ))
          )}
        </div>
      )
    },
    { 
      type: 'large-grid' as GridType, 
      name: 'Large Grid',
      preview: (
        <div className="w-16 h-16 bg-white rounded border border-slate-300 relative overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={`v-${i}`} className="absolute top-0 bottom-0 w-px bg-slate-400" style={{ left: `${i * 50}%` }} />
          ))}
          {[...Array(3)].map((_, i) => (
            <div key={`h-${i}`} className="absolute left-0 right-0 h-px bg-slate-400" style={{ top: `${i * 50}%` }} />
          ))}
        </div>
      )
    },
    { 
      type: 'small-dots' as GridType, 
      name: 'Small Dots',
      preview: (
        <div className="w-16 h-16 bg-white rounded border border-slate-300 relative">
          {[...Array(9)].map((_, i) => 
            [...Array(9)].map((_, j) => (
              <div 
                key={`${i}-${j}`}
                className="absolute w-0.5 h-0.5 bg-slate-400 rounded-full" 
                style={{ left: `${j * 12.5}%`, top: `${i * 12.5}%` }}
              />
            ))
          )}
        </div>
      )
    },
    { 
      type: 'cross' as GridType, 
      name: 'Cross',
      preview: (
        <div className="w-16 h-16 bg-white rounded border border-slate-300 relative">
          {[...Array(4)].map((_, i) => 
            [...Array(4)].map((_, j) => (
              <div key={`${i}-${j}`} className="absolute" style={{ left: `${j * 33.3}%`, top: `${i * 33.3}%` }}>
                <div className="w-2 h-px bg-slate-400 absolute -translate-x-1/2" />
                <div className="h-2 w-px bg-slate-400 absolute -translate-y-1/2" />
              </div>
            ))
          )}
        </div>
      )
    },
  ]

  const applyFont = (font: typeof FONT_OPTIONS[0]) => {
    setSelectedFont(font)
    document.documentElement.style.setProperty('--default-font', font.value)
  }

  const handleCustomNotesUpload = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.md,.doc,.docx,.pdf'
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0]
      if (file) {
        alert(`Custom notes uploaded: ${file.name}
This feature will be fully integrated soon!`)
        // TODO: Process and apply custom notes/styles
      }
    }
    input.click()
  }

  const handleColorSelect = (color: typeof PAGE_COLORS[0]) => {
    setSelectedColor(color)
    setCustomColor(color.value)
    applyPageColor(color.value)
  }

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value
    setCustomColor(color)
    applyPageColor(color)
    setSelectedColor({ name: 'Custom', value: color })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
        onClick={onClose}
      />
      
      {/* Settings Panel */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-[500px] max-h-[600px] overflow-y-auto z-[101]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Font & Style Section */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Font & Style</h3>
            
            {/* Font Options */}
            <div className="space-y-2 mb-4">
              <Label className="text-sm text-slate-300">Font Family</Label>
              <div className="grid grid-cols-2 gap-2">
                {(showAllFonts ? FONT_OPTIONS : FONT_OPTIONS.slice(0, 4)).map((font) => (
                  <button
                    key={font.name}
                    onClick={() => applyFont(font)}
                    className={cn(
                      'px-3 py-2 rounded-lg border-2 transition-all text-sm',
                      selectedFont.value === font.value
                        ? 'border-blue-400 bg-blue-500/10 ring-2 ring-blue-400'
                        : 'border-slate-600 hover:border-slate-500'
                    )}
                    style={{ fontFamily: font.value }}
                  >
                    <span className="text-white">{font.name}</span>
                  </button>
                ))}
              </div>
              
              {/* Show More/Less Button */}
              <button
                onClick={() => setShowAllFonts(!showAllFonts)}
                className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {showAllFonts ? 'Show Less' : `Show More (${FONT_OPTIONS.length - 4} more fonts)`}
              </button>
            </div>

            {/* Custom Notes Upload */}
            <div className="p-4 bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-2 border-dashed border-blue-500/50 rounded-lg">
              <p className="text-sm text-white mb-3 font-medium text-center">
                Upload your own notes and get your own style!
              </p>
              <Button
                onClick={handleCustomNotesUpload}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload size={18} className="mr-2" />
                Upload Custom Notes
              </Button>
              <p className="text-xs text-slate-400 mt-2 text-center">
                Supports: TXT, MD, DOC, DOCX, PDF
              </p>
            </div>
          </div>

          {/* Theme Color Section */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Page Theme Color</h3>
            
            <div className="grid grid-cols-4 gap-2 mb-3">
              {(showAllColors ? PAGE_COLORS : PAGE_COLORS.slice(0, 8)).map((color) => (
                <button
                  key={color.name}
                  onClick={() => handleColorSelect(color)}
                  className={cn(
                    'relative group rounded-lg p-4 transition-all hover:scale-105 border-2',
                    selectedColor.value === color.value ? 'border-blue-400 shadow-lg ring-2 ring-blue-400' : 'border-slate-600'
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {selectedColor.value === color.value && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 bg-blue-600 rounded-full border-2 border-white" />
                    </div>
                  )}
                  <div className="opacity-0 group-hover:opacity-100 absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-white whitespace-nowrap pointer-events-none bg-slate-900 px-2 py-1 rounded">
                    {color.name}
                  </div>
                </button>
              ))}
            </div>
            
            {/* Show More/Less Button */}
            <button
              onClick={() => setShowAllColors(!showAllColors)}
              className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showAllColors ? 'Show Less' : `Show More (${PAGE_COLORS.length - 8} more colors)`}
            </button>

            {/* Custom Color */}
            <div className="pt-3 border-t border-slate-700 mt-3">
              <Label className="text-xs text-slate-300 mb-2 block">Custom Color</Label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={customColor}
                  onChange={handleCustomColorChange}
                  className="w-12 h-12 rounded-lg cursor-pointer border-2 border-slate-600"
                />
                <div className="flex-1">
                  <input
                    type="text"
                    value={customColor}
                    onChange={(e) => {
                      const value = e.target.value
                      setCustomColor(value)
                      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                        applyPageColor(value)
                        setSelectedColor({ name: 'Custom', value })
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm"
                    placeholder="#ffffff"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Grid Style Section */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Grid Style</h3>
            
            <div className="grid grid-cols-3 gap-2">
              {(showAllGrids ? gridOptions : gridOptions.slice(0, 3)).map((option) => (
                <button
                  key={option.type}
                  onClick={() => applyGridType(option.type)}
                  className={cn(
                    'relative p-3 rounded-lg border-2 transition-all',
                    gridType === option.type 
                      ? 'border-blue-400 bg-blue-500/10 ring-2 ring-blue-400' 
                      : 'border-slate-600 hover:border-slate-500'
                  )}
                >
                  <div className="flex flex-col items-center gap-2">
                    {option.preview}
                    <span className="text-xs font-medium text-white">{option.name}</span>
                  </div>
                  {gridType === option.type && (
                    <div className="absolute top-2 right-2">
                      <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
            
            {/* Show More/Less Button */}
            <button
              onClick={() => setShowAllGrids(!showAllGrids)}
              className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showAllGrids ? 'Show Less' : `Show More (${gridOptions.length - 3} more styles)`}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 bg-slate-900/50">
          <Button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            Done
          </Button>
        </div>
      </div>
    </>
  )
}
