import { useRef } from 'react'

import { CloseIcon } from '../../ui/Icons'
import { useDialogViewport, useModalDialog } from '../../ui/dialogHooks'

const ADHAN_URL = 'https://github.com/batoulapps/adhan-js'
const ADHAN_METHODS_URL = 'https://github.com/batoulapps/adhan-js/blob/master/METHODS.md'
const GEONAMES_URL = 'https://www.geonames.org/'
const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/'
const OPENSTREETMAP_URL = 'https://www.openstreetmap.org/copyright'
const NOMINATIM_URL = 'https://nominatim.org/'

interface MethodologyDialogProps {
  open: boolean
  officialScheduleUrl: string
  onClose: () => void
}

export function MethodologyDialog({
  open,
  officialScheduleUrl,
  onClose,
}: MethodologyDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useModalDialog(open, onClose, closeRef)
  const layerRef = useDialogViewport(open)
  if (!open) return null

  return (
    <div
      ref={layerRef}
      className="dialog-layer"
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        aria-labelledby="methodology-dialog-title"
        aria-modal="true"
        className="location-dialog methodology-dialog"
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <h2 id="methodology-dialog-title">Как рассчитывается время</h2>
          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="methodology-content">
          <section className="methodology-section">
            <h3>В Татарстане</h3>
            <p>
              Это готовое расписание: приложение его не пересчитывает. Источник —{' '}
              <a href={officialScheduleUrl} target="_blank" rel="noreferrer">ДУМ РТ</a>.
            </p>
          </section>

          <section className="methodology-section">
            <h3>В других местах</h3>
            <p>
              Время рассчитывается прямо на устройстве библиотекой{' '}
              <a href={ADHAN_URL} target="_blank" rel="noreferrer">Adhan JS 4.4.6</a>.
              Для расчёта интернет не нужен.
            </p>
            <p>
              Профиль задаёт углы Фаджра и Иша: ДУМ РТ — 18°/15°, ДУМ РФ — 16°/15°.
              Аср и правило для северных широт выбираются отдельно.
            </p>
            <p>
              Если сумерек нет, правило ДУМ РТ ставит Фаджр за 120 минут до восхода,
              а Иша — через 90 минут после заката. Другие варианты перечислены здесь:{' '}
              <a href={ADHAN_METHODS_URL} target="_blank" rel="noreferrer">описание профилей</a>.
            </p>
          </section>

          <section className="methodology-section methodology-timezone">
            <h3>Часовой пояс</h3>
            <p>
              Время показывается в часовом поясе устройства. Если выбран город в другом
              часовом поясе, расписание может быть сдвинуто на разницу во времени.
            </p>
          </section>

          <section className="methodology-section">
            <h3>Местоположение</h3>
            <p>
              GPS обрабатывается на устройстве. Справочник городов —{' '}
              <a href={GEONAMES_URL} target="_blank" rel="noreferrer">GeoNames</a>{' '}
              (<a href={CC_BY_URL} target="_blank" rel="noreferrer">CC BY 4.0</a>).
            </p>
            <p>
              Только после нажатия «Уточнить название онлайн» округлённые координаты
              отправляются в <a href={NOMINATIM_URL} target="_blank" rel="noreferrer">Nominatim</a>,
              который использует данные{' '}
              <a href={OPENSTREETMAP_URL} target="_blank" rel="noreferrer">OpenStreetMap</a>.
            </p>
          </section>

          <p className="methodology-disclaimer">
            Расчётное время может отличаться от расписания местной мечети. Если есть местное
            официальное расписание, ориентируйтесь на него.
          </p>
        </div>
      </section>
    </div>
  )
}
