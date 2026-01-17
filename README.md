# Whiteboard App

A modern, feature-rich whiteboard application built with React, Konva, and shadcn/ui.

## Features

### Drawing Tools
- **Rectangle**: Draw rectangular shapes with customizable fill and stroke
- **Circle**: Create circular shapes
- **Line**: Draw straight lines
- **Pen**: Freehand drawing with smooth curves
- **Text**: Add and edit text with customizable fonts
- **Sticky Notes**: Create colorful sticky notes for annotations
- **Image**: Drag and drop images onto the canvas

### Interaction
- **Selection Tool**: Select, move, rotate, and resize elements
- **Pan Tool**: Navigate around the infinite canvas
- **Multi-select**: Hold Shift to select multiple elements
- **Zoom**: Scroll to zoom in/out, centered on cursor
- **Transform**: Scale and rotate selected elements
- **Undo/Redo**: Full history support for all actions

### Keyboard Shortcuts
- `V` - Select tool
- `H` - Pan tool
- `R` - Rectangle
- `C` - Circle
- `L` - Line
- `P` - Pen
- `T` - Text
- `S` - Sticky note
- `I` - Image
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Y` or `Ctrl/Cmd + Shift + Z` - Redo
- `Ctrl/Cmd + A` - Select all
- `Delete` or `Backspace` - Delete selected elements
- `Escape` - Clear selection

### Styling
- Customizable fill and stroke colors
- Adjustable stroke width (1-20px)
- Font size control (8-72px)
- Preset color palettes
- Per-element or default style settings
- Sticky note color themes

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Konva** - Canvas rendering
- **React Konva** - React wrapper for Konva
- **Zustand** - State management
- **Tailwind CSS 4** - Styling
- **shadcn/ui** - UI components
- **Lucide React** - Icons

## Getting Started

### Prerequisites
- Node.js 18+ 
- pnpm (recommended) or npm

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Usage

1. **Drawing**: Select a tool from the left toolbar and click-drag on the canvas to create elements
2. **Editing**: Double-click text or sticky notes to edit their content
3. **Transforming**: Use the select tool to click on elements and transform them with handles
4. **Styling**: Adjust colors and properties in the right sidebar
5. **Images**: Drag and drop image files directly onto the canvas
6. **Navigation**: Use the pan tool or scroll wheel to navigate the infinite canvas

## Project Structure

```
src/
├── components/
│   ├── canvas/          # Canvas and shape components
│   ├── toolbar/         # Left toolbar
│   ├── sidebar/         # Right properties sidebar
│   └── ui/              # shadcn/ui components
├── stores/              # Zustand state management
├── hooks/               # Custom React hooks
├── types/               # TypeScript type definitions
└── lib/                 # Utility functions
```

## License

MIT
