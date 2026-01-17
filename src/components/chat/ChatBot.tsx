import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Minimize2, Headphones, X, Plus, Upload, Link } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export function ChatBot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your teaching assistant. How can I help you today?',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const [showVoiceCoach, setShowVoiceCoach] = useState(false)
  const [voiceCoachEnabled, setVoiceCoachEnabled] = useState(false)
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')

    // Simulate bot response
    setTimeout(() => {
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: getBotResponse(input),
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, botMessage])
    }, 500)
  }

  const getBotResponse = (userInput: string): string => {
    const input = userInput.toLowerCase()
    
    if (input.includes('hello') || input.includes('hi')) {
      return 'Hello! How can I assist you with your teaching today?'
    } else if (input.includes('help')) {
      return 'I can help you with:\n- Drawing shapes\n- Adding text and sticky notes\n- Managing your canvas\n- Keyboard shortcuts\n\nWhat would you like to know?'
    } else if (input.includes('shortcut')) {
      return 'Here are some useful shortcuts:\n- V: Select tool\n- H: Pan\n- P: Pen\n- T: Text\n- S: Sticky note\n- Ctrl+Z: Undo\n- Ctrl+Y: Redo'
    } else if (input.includes('clear') || input.includes('delete')) {
      return 'To delete elements, select them and press the Delete key. To clear the canvas, you can select all elements (Ctrl+A) and delete them.'
    } else {
      return 'I\'m here to help! You can ask me about drawing tools, shortcuts, or how to use the teaching features.'
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
          content: `I received ${fileArray.length} file(s): ${fileNames}. How can I help you with ${fileArray.length === 1 ? 'this file' : 'these files'}?`,
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
          content: `I received your file: ${file.name}. How can I help you with this file?`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, botMessage])
      }, 500)
    }
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
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
          content: `I received the URL: ${urlInput}. How would you like me to help with this?`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, botMessage])
      }, 500)

      setUrlInput('')
      setShowUrlModal(false)
    }
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsMinimized(false)}
          className="rounded-full w-14 h-14 bg-theme-primary bg-theme-primary-hover shadow-lg"
        >
          <Bot size={24} />
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 h-[600px] flex flex-col bg-slate-800/95 backdrop-blur-sm border border-slate-700 rounded-lg shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-theme-primary flex items-center justify-center">
            <Bot size={18} />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Teaching Assistant</h3>
            <p className="text-xs text-slate-400">Online</p>
          </div>
        </div>
        <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8',
                voiceCoachEnabled ? 'text-theme-primary' : 'text-slate-400 hover:text-white'
              )}
              onClick={() => setShowVoiceCoach(!showVoiceCoach)}
              title="Voice Coach"
            >
              <Headphones size={16} />
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

      {/* Voice Coach Panel */}
      {showVoiceCoach && (
        <div className="p-4 border-b border-slate-700 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-white">Voice Coach</Label>
            <button
              onClick={() => setShowVoiceCoach(false)}
              className="text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-slate-300">
              {voiceCoachEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              onClick={() => setVoiceCoachEnabled(!voiceCoachEnabled)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                voiceCoachEnabled ? 'bg-theme-primary' : 'bg-slate-600'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  voiceCoachEnabled ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
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
              className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'user'
                  ? 'bg-theme-primary text-white'
                  : 'bg-slate-700 text-slate-100'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
            >
              <Plus size={18} />
            </Button>
            
            {/* Plus Menu Dropdown */}
            {showPlusMenu && (
              <div 
                className="absolute bottom-12 left-0 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-2 w-48 z-10"
                onClick={(e) => e.stopPropagation()}
              >
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
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            className="bg-theme-primary bg-theme-primary-hover"
          >
            <Send size={18} />
          </Button>
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
          </div>
        </div>
      )}

      {/* URL Modal */}
      {showUrlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Paste URL</h3>
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
                <Label className="text-sm text-slate-300 mb-2">URL</Label>
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleUrlSubmit()
                    }
                  }}
                  className="bg-slate-900 border-slate-600 text-white"
                  autoFocus
                />
              </div>
              
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
                  className="bg-theme-primary bg-theme-primary-hover"
                >
                  Submit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
