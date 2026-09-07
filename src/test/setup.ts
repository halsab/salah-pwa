import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'


import shell from '../../index.html?raw'
import { beforeEach } from 'vitest'

beforeEach(() => {
  const parsed = new DOMParser().parseFromString(shell, 'text/html')
  for (const template of parsed.querySelectorAll('template')) {
    if (!document.getElementById(template.id)) document.body.append(template.cloneNode(true))
  }
})
