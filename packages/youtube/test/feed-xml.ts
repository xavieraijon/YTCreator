// A YouTube RSS feed (Atom) with the entries given, shaped like the real one.
export function feedXml(entries: { videoId: string; published: string }[]): string {
  const items = entries
    .map(
      (e) => `
  <entry>
    <id>yt:video:${e.videoId}</id>
    <yt:videoId>${e.videoId}</yt:videoId>
    <yt:channelId>UCcocinacorta30000000000</yt:channelId>
    <title>Vídeo ${e.videoId}</title>
    <published>${e.published}</published>
    <updated>2026-10-30T08:00:00+00:00</updated>
  </entry>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <title>Cocina Corta</title>${items}
</feed>`
}
