import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// The deployment is a single-page app under one URL. Hash fragments are not
// separate sitemap entries per protocol — the sitemap lists the canonical
// entry with a generous change frequency. If routes are promoted to real
// server paths later, extend the entries list.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
