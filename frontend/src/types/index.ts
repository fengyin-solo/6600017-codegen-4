export interface Star {
  name: string
  ra: number   // right ascension in hours (0-24)
  dec: number  // declination in degrees (-90 to +90)
  mag: number  // apparent magnitude (lower = brighter)
  spectral: string
}

export interface Constellation {
  name: string
  nameCn: string
  stars: number[]  // indices into star array
  lines: [number, number][]  // pairs of star indices
}

export interface MeteorShower {
  name: string
  nameCn: string
  startMonth: number
  startDay: number
  peakMonth: number
  peakDay: number
  endMonth: number
  endDay: number
  radiantRa: number
  radiantDec: number
  zhr: number
  velocity: number
}

export interface Meteor {
  id: number
  showerIndex: number
  progress: number
  speed: number
  length: number
  brightness: number
  startOffset: number
}
