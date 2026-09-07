import { useCallback } from 'react'

export function StaticContent({ id, sourceUrl }: { id: string; sourceUrl?: string }) {
  const attach = useCallback((node: HTMLDivElement | null) => {
    const template = document.getElementById(id)
    if (!node || !(template instanceof HTMLTemplateElement)) return
    // Текст из оболочки не требует JavaScript-разметки и доступен с тем же precache офлайн.
    const content = template.content.cloneNode(true) as DocumentFragment
    if (sourceUrl) content.querySelector('a[data-primary-source]')?.setAttribute('href', sourceUrl)
    node.replaceChildren(content)
  }, [id, sourceUrl])
  return <div ref={attach} className="static-content" />
}
