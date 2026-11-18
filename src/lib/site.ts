// Single source of truth for the public identity of the deployment.
// SITE_URL must be overridden at deploy time if the product moves to another
// domain — every canonical, sitemap entry and OG URL derives from it.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://relay.aiazimara.com'

export const SITE_NAME = 'AZIMARA RELAY'
export const ORG_NAME = 'AI Azimara'
// Operating location for geo-targeting (Dubai, United Arab Emirates).
export const SITE_LOCALITY = 'Dubai'
export const SITE_COUNTRY = 'United Arab Emirates'
export const SITE_COUNTRY_CODE = 'AE'
export const SITE_REGION_CODE = 'AE-DU' // ISO 3166-2:AE — Dubai
export const SITE_LOCALE = 'en_AE'

export const SITE_DESCRIPTION =
  'AZIMARA RELAY is a non-custodial financial operations platform for businesses on Solana: approval-bound payments, batch payouts, treasury monitoring, reconciliation and AI-assisted operations. Built in Dubai, UAE.'

export const SITE_KEYWORDS = [
  'Solana treasury management',
  'non-custodial payments platform',
  'onchain payroll UAE',
  'crypto batch payouts',
  'Solana payment operations Dubai',
  'USDC payments business',
  'approval workflow payments',
  'smart payment routing',
  'web3 finance operations UAE',
  'treasury operations platform',
]
