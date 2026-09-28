// Значения из runtime остаются текстом Markdown, а не синтаксисом разметки.
export function markdownText(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+.!|>~-]/g, '\\$&')
}

export function markdownLink(label: string, url: string): string {
  const safe = /^https?:\/\//i.test(url) ? url : ''
  return safe ? `[${markdownText(label)}](${encodeURI(safe).replace(/\(/g, '%28').replace(/\)/g, '%29')})` : markdownText(label)
}
