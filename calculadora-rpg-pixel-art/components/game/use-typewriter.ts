'use client'

import { useEffect, useState } from 'react'
import { sfx } from '@/lib/game/audio'

export function useTypewriter(text: string, trigger: number, speed = 40) {
  const [out, setOut] = useState(text)

  useEffect(() => {
    if (trigger === 0) return
    let i = 0
    setOut('')
    const id = window.setInterval(() => {
      i++
      setOut(text.slice(0, i))
      const ch = text[i - 1]
      if (ch && ch !== ' ') sfx.play('type')
      if (i >= text.length) window.clearInterval(id)
    }, speed)
    return () => window.clearInterval(id)
  }, [text, trigger, speed])

  return trigger === 0 ? text : out
}
