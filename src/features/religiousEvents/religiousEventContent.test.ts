import { describe, expect, it } from 'vitest'

import { RELIGIOUS_EVENTS } from '../../domain/religiousEvents'
import { RELIGIOUS_EVENT_CONTENT } from './religiousEventContent'

describe('локальные статьи религиозных событий', () => {
  it('разрешает каждый contentId и совпадает с title в единственном H1', () => {
    for (const event of RELIGIOUS_EVENTS) {
      expect(event.contentId).toBeDefined()
      if (!event.contentId) throw new Error(`Нет contentId для ${event.id}`)
      const content = RELIGIOUS_EVENT_CONTENT[event.contentId]
      const headings = content.match(/^# .+$/gm) ?? []
      expect(headings).toEqual([`# ${event.title}`])
      expect(content.startsWith(`# ${event.title}\n`)).toBe(true)
    }
  })

  it('не содержит frontmatter, links, images, code, raw HTML или tables', () => {
    for (const content of Object.values(RELIGIOUS_EVENT_CONTENT)) {
      expect(content).not.toMatch(/^---\s*$/m)
      expect(content).not.toMatch(/!?\[[^\]]*\]\([^)]*\)/)
      expect(content).not.toMatch(/```|`[^`]+`/)
      expect(content).not.toMatch(/<\/?[a-z][^>]*>/i)
      expect(content).not.toMatch(/^\s*\|.+\|\s*$/m)
    }
  })
})
