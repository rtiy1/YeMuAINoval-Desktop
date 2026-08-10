import { useEffect, useState } from 'react'
import {
  type MCodeAILimits,
  currentLimits,
  statusListeners,
} from './mcodeAiLimits.js'

export function useMCodeAiLimits(): MCodeAILimits {
  const [limits, setLimits] = useState<MCodeAILimits>({ ...currentLimits })

  useEffect(() => {
    const listener = (newLimits: MCodeAILimits) => {
      setLimits({ ...newLimits })
    }
    statusListeners.add(listener)

    return () => {
      statusListeners.delete(listener)
    }
  }, [])

  return limits
}
