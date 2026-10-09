import { useEffect, useState } from 'react'

import type { ThemeTone } from '../domain/theme'

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

function readSystemAppearance(): ThemeTone {
  if (typeof window.matchMedia !== 'function') return 'light'
  try {
    return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function useSystemAppearance(): ThemeTone {
  const [tone, setTone] = useState<ThemeTone>(readSystemAppearance)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    let media: MediaQueryList
    try {
      media = window.matchMedia(COLOR_SCHEME_QUERY)
    } catch {
      return
    }

    const update = (event: MediaQueryListEvent | MediaQueryList) => {
      setTone(event.matches ? 'dark' : 'light')
    }
    update(media)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    const legacyMedia = media as unknown as {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
    }
    if (typeof legacyMedia.addListener !== 'function') return
    legacyMedia.addListener(update)
    return () => legacyMedia.removeListener?.(update)
  }, [])

  return tone
}
