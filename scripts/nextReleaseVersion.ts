import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const RELEASE_TAG_PATTERN = /^v(\d{2})\.([1-9]\d*)$/
const RELEASE_TIME_ZONE = 'Europe/Moscow'

export function getNextReleaseVersion(tags: readonly string[], now: Date): string {
  const year = new Intl.DateTimeFormat('en', {
    year: '2-digit',
    timeZone: RELEASE_TIME_ZONE,
  }).format(now)
  let highestRelease = 0

  for (const tag of tags) {
    const match = RELEASE_TAG_PATTERN.exec(tag)
    if (!match || match[1] !== year) continue

    const release = Number(match[2])
    if (Number.isSafeInteger(release)) highestRelease = Math.max(highestRelease, release)
  }

  return `v${year}.${highestRelease + 1}`
}

function readGitTags(): string[] {
  return execFileSync('git', ['tag', '--list'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(getNextReleaseVersion(readGitTags(), new Date()))
}
