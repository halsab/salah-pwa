import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'


import shell from '../../index.html?raw'
import { beforeEach } from 'vitest'

// jsdom не реализует 2d-контекст: canvas-физика в тестах не запускается,
// компоненты остаются в статическом fallback-режиме без ошибок jsdom.
HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement['getContext']

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(shell, 'text/html')
  for (const template of parsed.querySelectorAll('template')) {
    if (!document.getElementById(template.id)) document.body.append(template.cloneNode(true))
  }
})
