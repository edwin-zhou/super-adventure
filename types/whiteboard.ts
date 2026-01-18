// Base element interface
export interface BaseElement {
  id: string
  type: ElementType
  x: number
  y: number
  rotation?: number
  scaleX?: number
  scaleY?: number
  draggable?: boolean
  visible?: boolean
}

// Element types
export type ElementType = 
  | 'rectangle' 
  | 'circle' 
  | 'line' 
  | 'freehand' 
  | 'text' 
  | 'sticky' 
  | 'image'

// Shape elements
export interface RectangleElement extends BaseElement {
  type: 'rectangle'
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius?: number
}

export interface CircleElement extends BaseElement {
  type: 'circle'
  radius: number
  fill: string
  stroke: string
  strokeWidth: number
}

export interface LineElement extends BaseElement {
  type: 'line'
  points: number[] // [x1, y1, x2, y2]
  stroke: string
  strokeWidth: number
  lineCap?: 'butt' | 'round' | 'square'
}

export interface FreehandElement extends BaseElement {
  type: 'freehand'
  points: number[] // [x1, y1, x2, y2, ...]
  stroke: string
  strokeWidth: number
  tension?: number
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'miter' | 'round' | 'bevel'
}

// Text element
export interface TextElement extends BaseElement {
  type: 'text'
  text: string
  fontSize: number
  fontFamily?: string
  fill: string
  width?: number
  align?: 'left' | 'center' | 'right'
  fontStyle?: 'normal' | 'bold' | 'italic'
}

// Sticky note element
export interface StickyNoteElement extends BaseElement {
  type: 'sticky'
  text: string
  width: number
  height: number
  backgroundColor: string
  textColor: string
  fontSize: number
}

// Image element
export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  width: number
  height: number
  imageObj?: HTMLImageElement
}

// Union type for all elements
export type WhiteboardElement =
  | RectangleElement
  | CircleElement
  | LineElement
  | FreehandElement
  | TextElement
  | StickyNoteElement
  | ImageElement

// Tool types
export type ToolType = 
  | 'select' 
  | 'rectangle' 
  | 'circle' 
  | 'line' 
  | 'pen' 
  | 'text' 
  | 'sticky' 
  | 'image'
  | 'pan'

// Viewport state
export interface ViewportState {
  x: number
  y: number
  scale: number
}

// Selection state
export interface SelectionState {
  selectedIds: string[]
  transforming: boolean
}

// Drawing state (for in-progress elements)
export interface DrawingState {
  isDrawing: boolean
  startPoint: { x: number; y: number } | null
  currentElement: Partial<WhiteboardElement> | null
}

// History state for undo/redo
export interface HistoryState {
  past: WhiteboardElement[][]
  present: WhiteboardElement[]
  future: WhiteboardElement[][]
}

// Store state
export interface WhiteboardState {
  // Elements
  elements: WhiteboardElement[]
  
  // Current tool
  currentTool: ToolType
  
  // Viewport
  viewport: ViewportState
  
  // Selection
  selection: SelectionState
  
  // Drawing state
  drawing: DrawingState
  
  // History
  history: HistoryState
  
  // Element styling (for new elements)
  defaultStyles: {
    fill: string
    stroke: string
    strokeWidth: number
    fontSize: number
    stickyColor: string
    fontFamily: string
    fontStyle: 'normal' | 'bold' | 'italic'
  }
  
  // Gesture control
  gestureControlEnabled: boolean
  
  // Video player
  isVideoPlayerOpen: boolean
  videoPlayerAction: 'play' | 'pause' | null
  
  // Actions
  setTool: (tool: ToolType) => void
  setGestureControlEnabled: (enabled: boolean) => void
  setVideoPlayerOpen: (isOpen: boolean) => void
  setVideoPlayerAction: (action: 'play' | 'pause' | null) => void
  
  // Element actions
  addElement: (element: WhiteboardElement) => void
  updateElement: (id: string, updates: Partial<WhiteboardElement>) => void
  deleteElement: (id: string) => void
  deleteSelectedElements: () => void
  
  // Selection actions
  selectElement: (id: string, multiSelect?: boolean) => void
  clearSelection: () => void
  selectAll: () => void
  
  // Viewport actions
  setViewport: (viewport: Partial<ViewportState>) => void
  resetViewport: () => void
  
  // Drawing actions
  startDrawing: (point: { x: number; y: number }) => void
  continueDrawing: (point: { x: number; y: number }) => void
  finishDrawing: () => void
  
  // Style actions
  updateDefaultStyles: (styles: Partial<WhiteboardState['defaultStyles']>) => void
  updateSelectedElementsStyle: (styles: Partial<WhiteboardElement>) => void
  
  // History actions
  undo: () => void
  redo: () => void
  
  // Clear all
  clearCanvas: () => void
}
