import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { STARS, CONSTELLATIONS } from '../data/stars'
import { METEOR_SHOWERS } from '../data/meteors'
import type { Star, Meteor, MeteorShower } from '../types'

export const useSkyStore = defineStore('sky', () => {
  const viewDate = ref(new Date())
  const zoom = ref(1.0)
  const panX = ref(0)
  const panY = ref(0)
  const showLabels = ref(true)
  const showConstLines = ref(true)
  const showGrid = ref(true)
  const selectedStar = ref<Star | null>(null)
  const searchQuery = ref('')
  const latitude = ref(39.9) // Beijing default
  const showMeteorMode = ref(false)
  const meteors = ref<Meteor[]>([])
  const meteorIdCounter = ref(0)
  const lastMeteorSpawn = ref(0)

  const localSiderealTime = computed(() => {
    const d = viewDate.value
    const jd = d.getTime() / 86400000 + 2440587.5
    const T = (jd - 2451545.0) / 36525.0
    let lst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + T * T * (0.000387933 - T / 38710000)
    lst = ((lst % 360) + 360) % 360
    return lst / 15 // convert to hours
  })

  const filteredStars = computed(() => {
    if (!searchQuery.value) return []
    const q = searchQuery.value.toLowerCase()
    return STARS.filter(s => s.name.toLowerCase().includes(q)).slice(0, 5)
  })

  function projectStar(ra: number, dec: number, cx: number, cy: number, scale: number): [number, number] {
    const ha = (localSiderealTime.value - ra) * 15 * Math.PI / 180
    const decRad = dec * Math.PI / 180
    const latRad = latitude.value * Math.PI / 180

    const alt = Math.asin(Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha))
    const az = Math.atan2(-Math.cos(decRad) * Math.sin(ha), Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(ha))

    if (alt < -0.1) return [-999, -999] // below horizon

    const r = (Math.PI / 2 - alt) * scale * 0.45
    const x = cx + panX.value + r * Math.sin(az)
    const y = cy + panY.value - r * Math.cos(az)
    return [x, y]
  }

  function starRadius(mag: number): number {
    return Math.max(1, 5 - mag) * zoom.value
  }

  function spectralColor(spectral: string): string {
    const colors: Record<string, string> = {
      'O': '#9bb0ff', 'B': '#aabfff', 'A': '#cad7ff',
      'F': '#f8f7ff', 'G': '#fff4ea', 'K': '#ffd2a1', 'M': '#ffcc6f'
    }
    return colors[spectral] || '#ffffff'
  }

  function selectStar(x: number, y: number, cx: number, cy: number, scale: number) {
    let closest: Star | null = null
    let minDist = 20
    for (const star of STARS) {
      const [sx, sy] = projectStar(star.ra, star.dec, cx, cy, scale)
      const dist = Math.hypot(sx - x, sy - y)
      if (dist < minDist) { minDist = dist; closest = star }
    }
    selectedStar.value = closest
  }

  function isDateInRange(date: Date, startMonth: number, startDay: number, endMonth: number, endDay: number): boolean {
    const month = date.getMonth() + 1
    const day = date.getDate()
    const current = month * 100 + day
    const start = startMonth * 100 + startDay
    const end = endMonth * 100 + endDay
    if (start <= end) {
      return current >= start && current <= end
    } else {
      return current >= start || current <= end
    }
  }

  function getDaysFromPeak(date: Date, peakMonth: number, peakDay: number): number {
    const month = date.getMonth() + 1
    const day = date.getDate()
    const current = month * 100 + day
    const peak = peakMonth * 100 + peakDay
    return Math.abs(current - peak)
  }

  const activeMeteorShowers = computed(() => {
    return METEOR_SHOWERS.filter(shower =>
      isDateInRange(viewDate.value, shower.startMonth, shower.startDay, shower.endMonth, shower.endDay)
    ).map(shower => {
      const daysFromPeak = getDaysFromPeak(viewDate.value, shower.peakMonth, shower.peakDay)
      const activityFactor = Math.max(0.1, 1 - daysFromPeak / 15)
      return { ...shower, activityFactor }
    }).sort((a, b) => b.zhr * b.activityFactor - a.zhr * a.activityFactor)
  })

  function spawnMeteor(now: number) {
    if (!showMeteorMode.value) return
    const activeShowers = activeMeteorShowers.value
    if (activeShowers.length === 0) return

    const totalZhr = activeShowers.reduce((sum, s) => sum + s.zhr * s.activityFactor, 0)
    const spawnInterval = Math.max(100, 3600000 / totalZhr)

    if (now - lastMeteorSpawn.value < spawnInterval) return

    const showerIndex = Math.floor(Math.random() * activeShowers.length)
    const shower = activeShowers[showerIndex]
    const baseSpeed = shower.velocity / 70

    const meteor: Meteor = {
      id: meteorIdCounter.value++,
      showerIndex: METEOR_SHOWERS.findIndex(s => s.name === shower.name),
      progress: 0,
      speed: 0.01 + Math.random() * 0.02 * baseSpeed,
      length: 50 + Math.random() * 150,
      brightness: 0.5 + Math.random() * 0.5,
      startOffset: -0.2 + Math.random() * 0.4
    }

    meteors.value.push(meteor)
    lastMeteorSpawn.value = now

    if (meteors.value.length > 30) {
      meteors.value = meteors.value.slice(-20)
    }
  }

  function updateMeteors(deltaTime: number) {
    meteors.value = meteors.value
      .map(m => ({ ...m, progress: m.progress + m.speed * deltaTime * 60 }))
      .filter(m => m.progress < 1.5)
  }

  return {
    viewDate, zoom, panX, panY, showLabels, showConstLines, showGrid,
    selectedStar, searchQuery, latitude, localSiderealTime, filteredStars,
    projectStar, starRadius, spectralColor, selectStar,
    showMeteorMode, meteors, activeMeteorShowers, spawnMeteor, updateMeteors,
    STARS, CONSTELLATIONS, METEOR_SHOWERS
  }
})
