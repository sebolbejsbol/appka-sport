import type { ImageEntry } from '@rnmapbox/maps';

/** @2x — ostre znaczniki na ekranach retina (generowane: scripts/generate-map-badges.py). */
const BADGE_SCALE = 2;

function badgeAsset(moduleId: number): ImageEntry {
  return { image: moduleId, scale: BADGE_SCALE };
}

export const mapBadgeImages = {
  'badge-0': badgeAsset(require('../../assets/map-badges/badge-0.png')),
  'badge-1': badgeAsset(require('../../assets/map-badges/badge-1.png')),
  'badge-2': badgeAsset(require('../../assets/map-badges/badge-2.png')),
  'badge-3': badgeAsset(require('../../assets/map-badges/badge-3.png')),
  'badge-4': badgeAsset(require('../../assets/map-badges/badge-4.png')),
  'badge-5': badgeAsset(require('../../assets/map-badges/badge-5.png')),
  'badge-6': badgeAsset(require('../../assets/map-badges/badge-6.png')),
  'badge-7': badgeAsset(require('../../assets/map-badges/badge-7.png')),
  'badge-8': badgeAsset(require('../../assets/map-badges/badge-8.png')),
  'badge-9': badgeAsset(require('../../assets/map-badges/badge-9.png')),
  'badge-10': badgeAsset(require('../../assets/map-badges/badge-10.png')),
  'badge-11': badgeAsset(require('../../assets/map-badges/badge-11.png')),
  'badge-12': badgeAsset(require('../../assets/map-badges/badge-12.png')),
  'badge-13': badgeAsset(require('../../assets/map-badges/badge-13.png')),
  'badge-14': badgeAsset(require('../../assets/map-badges/badge-14.png')),
  'badge-15': badgeAsset(require('../../assets/map-badges/badge-15.png')),
  'badge-16': badgeAsset(require('../../assets/map-badges/badge-16.png')),
  'badge-17': badgeAsset(require('../../assets/map-badges/badge-17.png')),
  'badge-18': badgeAsset(require('../../assets/map-badges/badge-18.png')),
  'badge-19': badgeAsset(require('../../assets/map-badges/badge-19.png')),
  'badge-20': badgeAsset(require('../../assets/map-badges/badge-20.png')),
} as const;
