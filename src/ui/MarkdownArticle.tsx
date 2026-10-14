import { lazy, Suspense } from 'react'

const MarkdownArticleContent = lazy(() => import('./MarkdownArticleContent').then(module => ({
  default: module.MarkdownArticleContent,
})))

export function MarkdownArticle({ content }: { content: string }) {
  return <Suspense fallback={<div className="markdown-article" aria-busy="true" />}>
    <MarkdownArticleContent content={content} />
  </Suspense>
}
