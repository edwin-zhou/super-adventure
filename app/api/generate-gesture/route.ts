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
  'four_finger_pinch': {
    name: 'Four Finger Pinch',
    description: 'Both index and middle fingers pinch together (requires two hands)',
    detection: (threshold: number) => `
const detect = (landmarks, allLandmarks) => {
  // This gesture requires two hands - check if we have landmarks from both
  if (!allLandmarks || allLandmarks.length < 2) return false
  
  const hand1 = allLandmarks[0]
  const hand2 = allLandmarks[1]
  if (!hand1 || !hand2) return false
  
  // Get index finger tips (landmark 8) from both hands
  const indexTip1 = hand1[8]
  const indexTip2 = hand2[8]
  // Get middle finger tips (landmark 12) from both hands
  const middleTip1 = hand1[12]
  const middleTip2 = hand2[12]
  
  if (!indexTip1 || !indexTip2 || !middleTip1 || !middleTip2) return false
  
  // Calculate distance between all four fingertips
  // We check if both index fingers are close AND both middle fingers are close
  const indexDistance = Math.sqrt(
    Math.pow(indexTip1.x - indexTip2.x, 2) +
    Math.pow(indexTip1.y - indexTip2.y, 2) +
    Math.pow(indexTip1.z - indexTip2.z, 2)
  )
  
  const middleDistance = Math.sqrt(
    Math.pow(middleTip1.x - middleTip2.x, 2) +
    Math.pow(middleTip1.y - middleTip2.y, 2) +
    Math.pow(middleTip1.z - middleTip2.z, 2)
  )
  
  // All four fingers should be close together
  return indexDistance < ${threshold} && middleDistance < ${threshold}
}`
  },
  'two_palm_clap': {
    name: 'Two Palm Clap',
    description: 'Two palms moving towards each other (requires two hands)',
    detection: (threshold: number) => `
const detect = (landmarks, allLandmarks) => {
  // This gesture requires two hands
  if (!allLandmarks || allLandmarks.length < 2) return false
  
  const hand1 = allLandmarks[0]
  const hand2 = allLandmarks[1]
  if (!hand1 || !hand2) return false
  
  // Get palm centers (landmark 0 is wrist, 9 is middle finger base - average gives palm center)
  const palm1Wrist = hand1[0]
  const palm1Middle = hand1[9]
  const palm2Wrist = hand2[0]
  const palm2Middle = hand2[9]
  
  if (!palm1Wrist || !palm1Middle || !palm2Wrist || !palm2Middle) return false
  
  // Calculate palm centers
  const palm1Center = {
    x: (palm1Wrist.x + palm1Middle.x) / 2,
    y: (palm1Wrist.y + palm1Middle.y) / 2,
    z: (palm1Wrist.z + palm1Middle.z) / 2
  }
  const palm2Center = {
    x: (palm2Wrist.x + palm2Middle.x) / 2,
    y: (palm2Wrist.y + palm2Middle.y) / 2,
    z: (palm2Wrist.z + palm2Middle.z) / 2
  }
  
  // Calculate distance between palm centers
  const palmDistance = Math.sqrt(
    Math.pow(palm1Center.x - palm2Center.x, 2) +
    Math.pow(palm1Center.y - palm2Center.y, 2) +
    Math.pow(palm1Center.z - palm2Center.z, 2)
  )
  
  // Palms are close together (clapping position)
  return palmDistance < ${threshold}
}`
  },
  'four_fingers_up': {
    name: 'Four Fingers Up',
    description: 'Detect 4 fingers extended (excluding thumb)',
    detection: (threshold: number) => `
const detect = (landmarks) => {
  if (!landmarks || landmarks.length === 0) return false
  
  const wrist = landmarks[0]
  if (!wrist) return false
  
  // Finger tip and base landmarks:
  // Index: tip=8, base=5
  // Middle: tip=12, base=9
  // Ring: tip=16, base=13
  // Pinky: tip=20, base=17
  
  const fingerPairs = [
    { tip: 8, base: 5 },   // Index
    { tip: 12, base: 9 },  // Middle
    { tip: 16, base: 13 }, // Ring
    { tip: 20, base: 17 }  // Pinky
  ]
  
  let extendedCount = 0
  
  for (const finger of fingerPairs) {
    const tip = landmarks[finger.tip]
    const base = landmarks[finger.base]
    if (!tip || !base) continue
    
    // Finger is extended if tip is further from wrist than base
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
    
    if (tipDistance > baseDistance * ${threshold}) {
      extendedCount++
    }
  }
  
  // All 4 fingers should be extended
  return extendedCount >= 4
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
  'close_chatbot': () => `
const action = () => {
  setChatbotOpen(false)
}`,
  'export_pdf': () => `
const action = () => {
  // Trigger the export button click
  const exportButton = document.querySelector('[title="Export as PNG"]')
  if (exportButton) {
    exportButton.click()
  }
}`,
  'open_settings': () => `
const action = () => {
  // Find and click the settings button in the toolbar
  const settingsButton = document.querySelector('[class*="settings"]') || 
                         document.querySelector('button[title*="Settings"]')
  if (settingsButton) {
    settingsButton.click()
  } else {
    // Fallback: dispatch a custom event that the settings panel can listen to
    window.dispatchEvent(new CustomEvent('open-settings'))
  }
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
      case 'four_finger_pinch':
        detectionCode = GESTURE_TEMPLATES.four_finger_pinch.detection(
          detectionParams?.threshold || 0.1
        )
        break
      case 'two_palm_clap':
        detectionCode = GESTURE_TEMPLATES.two_palm_clap.detection(
          detectionParams?.threshold || 0.15
        )
        break
      case 'four_fingers_up':
        detectionCode = GESTURE_TEMPLATES.four_fingers_up.detection(
          detectionParams?.threshold || 1.1
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
      case 'close_chatbot':
        actionCode = ACTION_TEMPLATES.close_chatbot()
        break
      case 'export_pdf':
        actionCode = ACTION_TEMPLATES.export_pdf()
        break
      case 'open_settings':
        actionCode = ACTION_TEMPLATES.open_settings()
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
