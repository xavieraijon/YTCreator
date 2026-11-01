// Reads the exact publish date of each entry of a channel's RSS feed. Entries without an id or with a date that
// does not parse are skipped: a date is never guessed (FR-009).
export function parseFeed(xml: string): Map<string, string> {
  const dates = new Map<string, string>()
  for (const [, entry = ''] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const videoId = /<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/.exec(entry)?.[1]
    const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1]
    if (!videoId || !published) continue
    const time = Date.parse(published)
    if (Number.isNaN(time)) continue
    dates.set(videoId, new Date(time).toISOString())
  }
  return dates
}
