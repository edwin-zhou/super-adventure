import { NextRequest, NextResponse } from 'next/server'

// Gesture templates with customizable parameters
const GESTURE_TEMPLATES = {
  'two_finger_pinch': {
    name: 'Two Finger Pinch',
    description: 'Pinch thumb and index finger together',
    detection: (finger1: number, finger2: number, threshold: number) => `
const detect = (landmarks) => {
  if (!landmarks || landmarks.length === 0) return false
  const tip1 = landmarks[${finger1}]
  const tip2 = landmarks[${finger2}]
  if (!tip1 || !tip2) return false
  const distance = Math.sqrt(
    Math.pow(tip1.x - tip2.x, 2) +
    Math.pow(tip1.y - tip2.y, 2) +
    Math.pow(tip1.z - tip2.z, 2)
  )
  return distance < ${threshold}
}`
  },
  'finger_point': {
    name: 'Finger Pointing',
    description: 'Point with a specific finger',
    detection: (fingerTip: number, fingerBase: number) => `
const detect = (landmarks) => {
  if (!landmarks || landmarks.length === 0) return false
  const wrist = landmarks[0]
  const tip = landmarks[${fingerTip}]
  const base = landmarks[${fingerBase}]
  if (!wrist || !tip || !base) return false
  const tipDistance = Math.sqrt(
    Math.pow(tip.x - wrist.x, 2) +
    Math.pow(tip.y - wrist.y, 2) +
    Math.pow(tip.z - wrist.z, 2)
  )
  const baseDistance = Math.sqrt(
    Math.pow(base.x - wrist.x, 2) +
    Math.pow(base.y - wrist.y, 2) +
    Math.pow(base.z - wrist.z, 2)
  )
  return tipDistance > baseDistance * 1.3
}`
  },
  'hand_height': {
    name: 'Hand Position',
    description: 'Hand above or below threshold',
    detection: (threshold: number, above: boolean) => `
const detect = (landmarks) => {
  if (!landmarks || landmarks.length === 0) return false
  const palm = landmarks[0]
  if (!palm) return false
  return ${above ? 'palm.y < ' + threshold : 'palm.y > ' + threshold}
}`
  }
}

// Action templates
const ACTION_TEMPLATES = {
  'zoom': (direction: 'in' | 'out', amount: number = 0.15) => `
const action = () => {
  const newScale = viewport.scale ${direction === 'in' ? '+' : '-'} ${amount}
  setViewport({ scale: Math.max(0.1, newScale) })
}`,
  'scroll': (direction: 'up' | 'down', amount: number = 0.3) => `
const action = () => {
  const scrollAmount = window.innerHeight * ${amount}
  setViewport({ y: viewport.y ${direction === 'up' ? '-' : '+'} scrollAmount })
}`,
  'video_control': (action: 'play' | 'pause') => `
const action = () => {
  setVideoPlayerAction('${action}')
}`,
  'open_url': (url: string) => `
const action = () => {
  window.open('${url}', '_blank')
}`,
  'custom': (code: string) => code
}

export async function POST(request: NextRequest) {
  try {
    const { 
      gestureName, 
      gestureType, 
      detectionParams, 
      actionType, 
      actionParams 
    } = await request.json()

    if (!gestureName || !gestureType || !actionType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Generate detection code from template
    let detectionCode = ''
    const safeName = gestureName.replace(/\s+/g, '')
    
    switch (gestureType) {
      case 'two_finger_pinch':
        detectionCode = GESTURE_TEMPLATES.two_finger_pinch.detection(
          detectionParams?.finger1 || 4,
          detectionParams?.finger2 || 8,
          detectionParams?.threshold || 0.06
        )
        break
      case 'finger_point':
        detectionCode = GESTURE_TEMPLATES.finger_point.detection(
          detectionParams?.fingerTip || 8,
          detectionParams?.fingerBase || 5
        )
        break
      case 'hand_height':
        detectionCode = GESTURE_TEMPLATES.hand_height.detection(
          detectionParams?.threshold || 0.5,
          detectionParams?.above || true
        )
        break
      default:
        throw new Error('Unknown gesture type')
    }

    // Generate action code from template
    let actionCode = ''
    
    switch (actionType) {
      case 'zoom_in':
        actionCode = ACTION_TEMPLATES.zoom('in', actionParams?.amount)
        break
      case 'zoom_out':
        actionCode = ACTION_TEMPLATES.zoom('out', actionParams?.amount)
        break
      case 'scroll_up':
        actionCode = ACTION_TEMPLATES.scroll('up', actionParams?.amount)
        break
      case 'scroll_down':
        actionCode = ACTION_TEMPLATES.scroll('down', actionParams?.amount)
        break
      case 'play_video':
        actionCode = ACTION_TEMPLATES.video_control('play')
        break
      case 'pause_video':
        actionCode = ACTION_TEMPLATES.video_control('pause')
        break
      case 'open_url':
        actionCode = ACTION_TEMPLATES.open_url(actionParams?.url || 'https://google.com')
        break
      case 'custom':
        actionCode = ACTION_TEMPLATES.custom(actionParams?.code || 'console.log("Custom action")')
        break
      default:
        actionCode = 'const action = () => { console.log("Gesture detected") }'
    }

    // Wrap with function names
    const finalDetectionCode = `const detect${safeName} = ${detectionCode}`
    const finalActionCode = `const action${safeName} = ${actionCode}`

    return NextResponse.json({
      detectionCode: finalDetectionCode,
      actionCode: finalActionCode,
      gestureName,
    })
  } catch (error) {
    console.error('Error generating gesture code:', error)
    return NextResponse.json(
      { error: 'Failed to generate gesture code' },
      { status: 500 }
    )
  }
}
