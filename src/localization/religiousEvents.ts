import type { ReligiousEventId } from '../domain/religiousEvents'
import { translate, type MessageKey } from './messages'
import type { SupportedLocale } from './locale'

const TITLE_KEYS: Record<ReligiousEventId, MessageKey> = {
  'hijri-new-year': 'eventHijriNewYear',
  ashura: 'eventAshura',
  mawlid: 'eventMawlid',
  raghaib: 'eventRaghaib',
  'isra-miraj': 'eventIsraMiraj',
  baraat: 'eventBaraat',
  ramadan: 'eventRamadan',
  'eid-al-fitr': 'eventEidAlFitr',
  'dhul-hijjah-first-ten': 'eventDhulHijjah',
  arafa: 'eventArafa',
  'eid-al-adha': 'eventEidAlAdha',
  tashriq: 'eventTashriq',
}

const LIST_TITLE_KEYS: Partial<Record<ReligiousEventId, MessageKey>> = {
  ramadan: 'eventRamadanStart',
  'dhul-hijjah-first-ten': 'eventDhulHijjahStart',
}

export function eventTitleKey(eventId: ReligiousEventId, list = false): MessageKey {
  return (list ? LIST_TITLE_KEYS[eventId] : undefined) ?? TITLE_KEYS[eventId]
}

export function localizedEventTitle(eventId: ReligiousEventId, locale: SupportedLocale, list = false): string {
  return translate(locale, eventTitleKey(eventId, list))
}
