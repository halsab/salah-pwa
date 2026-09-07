export function required<Value>(value: Value | null | undefined): Value {
  if (value == null) throw new Error('Не найдены данные тестового сценария')
  return value
}
