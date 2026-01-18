import { create } from 'zustand'
import type {
  WhiteboardState,
  WhiteboardElement,
  ToolType,
  ViewportState,
} from '@/types/whiteboard'

const initialViewport: ViewportState = {
  x: 0,
  y: 0,
  scale: 1,
}

const initialDefaultStyles = {
  fill: '#3b82f6',
  stroke: '#1e40af',
  strokeWidth: 2,
  fontSize: 16,
  stickyColor: '#fef08a',
  fontFamily: 'Arial, sans-serif',
  fontStyle: 'normal' as 'normal' | 'bold' | 'italic',
}

export const useWhiteboardStore = create<WhiteboardState>((set) => ({
  // Initial state
  elements: [],
  currentTool: 'pen',
  viewport: initialViewport,
  selection: {
    selectedIds: [],
    transforming: false,
  },
  drawing: {
    isDrawing: false,
    startPoint: null,
    currentElement: null,
  },
  history: {
    past: [],
    present: [],
    future: [],
  },
  defaultStyles: initialDefaultStyles,
  gestureControlEnabled: false,
  isVideoPlayerOpen: false,
  videoPlayerAction: null,
  videoPlayerUrl: null,
  isChatbotOpen: false,
  shouldActivateVoice: false,
  videoPlayerTimestamp: null,
  lassoMaskContext: null,

  // Tool actions
  setTool: (tool: ToolType) => set({ currentTool: tool }),
  
  // Gesture control actions
  setGestureControlEnabled: (enabled: boolean) => set({ gestureControlEnabled: enabled }),
  
  // Video player actions
  setVideoPlayerOpen: (isOpen: boolean) => set({ isVideoPlayerOpen: isOpen }),
  setVideoPlayerAction: (action: 'play' | 'pause' | null) => set({ videoPlayerAction: action }),
  setVideoPlayerUrl: (url: string | null) => set({ videoPlayerUrl: url }),
  
  // Chatbot actions
  setChatbotOpen: (isOpen: boolean) => set({ isChatbotOpen: isOpen }),
  setShouldActivateVoice: (shouldActivate: boolean) => set({ shouldActivateVoice: shouldActivate }),
  setVideoPlayerTimestamp: (timestamp: number | null) => set({ videoPlayerTimestamp: timestamp }),

  // Element actions
  addElement: (element: WhiteboardElement) =>
    set((state) => {
      const newElements = [...state.elements, element]
      return {
        elements: newElements,
        history: {
          past: [...state.history.past, state.elements],
          present: newElements,
          future: [],
        },
      }
    }),

  updateElement: (id: string, updates: Partial<WhiteboardElement>) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? ({ ...el, ...updates } as WhiteboardElement) : el
      ),
    })),

  deleteElement: (id: string) =>
    set((state) => {
      const newElements = state.elements.filter((el) => el.id !== id)
      return {
        elements: newElements,
        history: {
          past: [...state.history.past, state.elements],
          present: newElements,
          future: [],
        },
        selection: {
          ...state.selection,
          selectedIds: state.selection.selectedIds.filter((sid) => sid !== id),
        },
      }
    }),

  deleteSelectedElements: () =>
    set((state) => {
      const newElements = state.elements.filter(
        (el) => !state.selection.selectedIds.includes(el.id)
      )
      return {
        elements: newElements,
        history: {
          past: [...state.history.past, state.elements],
          present: newElements,
          future: [],
        },
        selection: {
          ...state.selection,
          selectedIds: [],
        },
      }
    }),

  // Selection actions
  selectElement: (id: string, multiSelect = false) =>
    set((state) => {
      if (multiSelect) {
        const isSelected = state.selection.selectedIds.includes(id)
        return {
          selection: {
            ...state.selection,
            selectedIds: isSelected
              ? state.selection.selectedIds.filter((sid) => sid !== id)
              : [...state.selection.selectedIds, id],
          },
        }
      }
      return {
        selection: {
          ...state.selection,
          selectedIds: [id],
        },
      }
    }),

  clearSelection: () =>
    set((state) => ({
      selection: {
        ...state.selection,
        selectedIds: [],
      },
    })),

  selectAll: () =>
    set((state) => ({
      selection: {
        ...state.selection,
        selectedIds: state.elements.map((el) => el.id),
      },
    })),

  // Viewport actions
  setViewport: (viewport: Partial<ViewportState>) =>
    set((state) => ({
      viewport: {
        ...state.viewport,
        ...viewport,
      },
    })),

  resetViewport: () => set({ viewport: initialViewport }),

  // Drawing actions
  startDrawing: (point: { x: number; y: number }) =>
    set({
      drawing: {
        isDrawing: true,
        startPoint: point,
        currentElement: null,
      },
    }),

  continueDrawing: (point: { x: number; y: number }) =>
    set((state) => {
      if (!state.drawing.isDrawing || !state.drawing.startPoint) return state

      const { currentTool, defaultStyles } = state
      const startPoint = state.drawing.startPoint

      let currentElement: Partial<WhiteboardElement> | null = null

      switch (currentTool) {
        case 'rectangle': {
          const width = point.x - startPoint.x
          const height = point.y - startPoint.y
          currentElement = {
            type: 'rectangle',
            x: width > 0 ? startPoint.x : point.x,
            y: height > 0 ? startPoint.y : point.y,
            width: Math.abs(width),
            height: Math.abs(height),
            fill: defaultStyles.fill,
            stroke: defaultStyles.stroke,
            strokeWidth: defaultStyles.strokeWidth,
          } as Partial<WhiteboardElement>
          break
        }
        case 'circle': {
          const radiusX = Math.abs(point.x - startPoint.x)
          const radiusY = Math.abs(point.y - startPoint.y)
          const radius = Math.max(radiusX, radiusY)
          currentElement = {
            type: 'circle',
            x: startPoint.x,
            y: startPoint.y,
            radius,
            fill: defaultStyles.fill,
            stroke: defaultStyles.stroke,
            strokeWidth: defaultStyles.strokeWidth,
          } as Partial<WhiteboardElement>
          break
        }
        case 'line': {
          currentElement = {
            type: 'line',
            x: 0,
            y: 0,
            points: [startPoint.x, startPoint.y, point.x, point.y],
            stroke: defaultStyles.stroke,
            strokeWidth: defaultStyles.strokeWidth,
            lineCap: 'round',
          } as Partial<WhiteboardElement>
          break
        }
        case 'pen': {
          const existingPoints = (state.drawing.currentElement as any)?.points as number[] || [startPoint.x, startPoint.y]
          currentElement = {
            type: 'freehand',
            x: 0,
            y: 0,
            points: [...existingPoints, point.x, point.y],
            stroke: defaultStyles.stroke,
            strokeWidth: defaultStyles.strokeWidth,
            tension: 0.5,
            lineCap: 'round',
            lineJoin: 'round',
          } as Partial<WhiteboardElement>
          break
        }
      }

      return {
        drawing: {
          ...state.drawing,
          currentElement,
        },
      }
    }),

  finishDrawing: () =>
    set((state) => {
      if (!state.drawing.currentElement) {
        return {
          drawing: {
            isDrawing: false,
            startPoint: null,
            currentElement: null,
          },
        }
      }

      const element = {
        ...state.drawing.currentElement,
        id: `${state.drawing.currentElement.type}-${Date.now()}-${Math.random()}`,
        draggable: true,
        visible: true,
      } as WhiteboardElement

      const newElements = [...state.elements, element]

      return {
        elements: newElements,
        history: {
          past: [...state.history.past, state.elements],
          present: newElements,
          future: [],
        },
        drawing: {
          isDrawing: false,
          startPoint: null,
          currentElement: null,
        },
      }
    }),

  // Style actions
  updateDefaultStyles: (styles) =>
    set((state) => ({
      defaultStyles: {
        ...state.defaultStyles,
        ...styles,
      },
    })),

  updateSelectedElementsStyle: (styles) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        state.selection.selectedIds.includes(el.id)
          ? ({ ...el, ...styles } as WhiteboardElement)
          : el
      ),
    })),

  // History actions
  undo: () =>
    set((state) => {
      if (state.history.past.length === 0) return state

      const previous = state.history.past[state.history.past.length - 1]
      const newPast = state.history.past.slice(0, -1)

      return {
        elements: previous,
        history: {
          past: newPast,
          present: previous,
          future: [state.elements, ...state.history.future],
        },
      }
    }),

  redo: () =>
    set((state) => {
      if (state.history.future.length === 0) return state

      const next = state.history.future[0]
      const newFuture = state.history.future.slice(1)

      return {
        elements: next,
        history: {
          past: [...state.history.past, state.elements],
          present: next,
          future: newFuture,
        },
      }
    }),

  // Lasso mask actions
  setLassoMaskContext: (context) => set({ lassoMaskContext: context }),
  
  clearLassoMaskContext: () => set({ lassoMaskContext: null }),

  // Clear all
  clearCanvas: () =>
    set((state) => ({
      elements: [],
      history: {
        past: [...state.history.past, state.elements],
        present: [],
        future: [],
      },
      selection: {
        selectedIds: [],
        transforming: false,
      },
    })),
}))
