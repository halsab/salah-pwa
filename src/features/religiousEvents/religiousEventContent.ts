import type { ReligiousEventId } from '../../domain/religiousEvents'

import arafa from '../../content/religious-events/arafa.md?raw'
import ashura from '../../content/religious-events/ashura.md?raw'
import baraat from '../../content/religious-events/baraat.md?raw'
import dhulHijjahFirstTen from '../../content/religious-events/dhul-hijjah-first-ten.md?raw'
import eidAlAdha from '../../content/religious-events/eid-al-adha.md?raw'
import eidAlFitr from '../../content/religious-events/eid-al-fitr.md?raw'
import hijriNewYear from '../../content/religious-events/hijri-new-year.md?raw'
import israMiraj from '../../content/religious-events/isra-miraj.md?raw'
import mawlid from '../../content/religious-events/mawlid.md?raw'
import raghaib from '../../content/religious-events/raghaib.md?raw'
import ramadan from '../../content/religious-events/ramadan.md?raw'
import tashriq from '../../content/religious-events/tashriq.md?raw'

export const RELIGIOUS_EVENT_CONTENT: Readonly<Record<ReligiousEventId, string>> = Object.freeze({
  'hijri-new-year': hijriNewYear,
  ashura,
  mawlid,
  raghaib,
  'isra-miraj': israMiraj,
  baraat,
  ramadan,
  'eid-al-fitr': eidAlFitr,
  'dhul-hijjah-first-ten': dhulHijjahFirstTen,
  arafa,
  'eid-al-adha': eidAlAdha,
  tashriq,
})
