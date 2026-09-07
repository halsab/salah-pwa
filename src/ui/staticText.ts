export function staticText(id: string): string {
  const template = document.getElementById(id)
  // Статический текст поставляется в той же версионированной оболочке, без отдельного запроса и JS-кода.
  return template instanceof HTMLTemplateElement ? template.content.textContent : ''
}
