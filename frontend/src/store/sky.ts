import { ref, computed, watch, watchEffect, onMounted } from 'vue'
import { defineStore } from 'pinia'
import { STARS, CONSTELLATIONS } from '../data/stars'
import { METEOR_SHOWERS } from '../data/meteors'
import type { Star, Meteor, MeteorShower } from '../types'

const STORAGE_KEY = 'sky-store-state-v2'

function loadStoredState(): { [key: string]: any } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveStoredState(state: { [key: string]: any }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

export const useSkyStore = defineStore('sky', () => {
  const stored = loadStoredState()

  const viewDate = ref(stored?.viewDate ? new Date(stored.viewDate) : new Date())
  const zoom = ref(stored?.zoom ?? 1.0)
  const panX = ref(0)
  const panY = ref(0)
  const showLabels = ref(stored?.showLabels ?? true)
  const showConstLines = ref(stored?.showConstLines ?? true)
  const showGrid = ref(stored?.showGrid ?? true)
  const selectedStar = ref<Star | null>(null)
  const searchQuery = ref('')
  const latitude = ref(stored?.latitude ?? 39.9)
  const showMeteorMode = ref(stored?.showMeteorMode ?? false)
  const meteors = ref<Meteor[]>([])
  const meteorIdCounter = ref(0)
  const lastMeteorSpawn = ref(0)
  const meteorModeStartedAt = ref<number>(0)
  const hasSeededMeteors = ref(false)

  watchEffect(() => {
    const state: { [key: string]: any } = {}
    state.viewDate = viewDate.value.toISOString()
    state.zoom = zoom.value
    state.showLabels = showLabels.value
    state.showConstLines = showConstLines.value
    state.showGrid = showGrid.value
    state.latitude = latitude.value
    state.showMeteorMode = showMeteorMode.value
    saveStoredState(state)
  }, { flush: 'post' })

  function resetMeteorSeed() {
    hasSeededMeteors.value = false
    meteorModeStartedAt.value = 0
  }

  watch(showMeteorMode, (val) => {
    if (val) {
      meteorModeStartedAt.value = performance.now()
      if (!hasSeededMeteors.value && activeMeteorShowers.value.length > 0) {
        seedInitialMeteors()
      }
    } else {
      meteors.value = []
      resetMeteorSeed()
    }
  })

  watch(viewDate, () => {
    meteors.value = []
    resetMeteorSeed()
    if (showMeteorMode.value && activeMeteorShowers.value.length > 0) {
      seedInitialMeteors()
    }
  })

  onMounted(() => {
    if (showMeteorMode.value && activeMeteorShowers.value.length > 0) {
      meteorModeStartedAt.value = performance.now()
      seedInitialMeteors()
    }
  })

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

  function createMeteor(forceProgress?: number): Meteor {
    const activeShowers = activeMeteorShowers.value
    if (activeShowers.length === 0) {
      return { id: 0, showerIndex: 0, progress: 0, speed: 0, length: 0, brightness: 0, startOffset: 0 }
    }
    const totalWeight = activeShowers.reduce((sum, s) => sum + s.zhr * s.activityFactor, 0)
    let r = Math.random() * totalWeight
    let chosen = activeShowers[0]
    for (const s of activeShowers) {
      r -= s.zhr * s.activityFactor
      if (r <= 0) { chosen = s; break }
    }
    const baseSpeed = chosen.velocity / 70
    return {
      id: meteorIdCounter.value++,
      showerIndex: METEOR_SHOWERS.findIndex(s => s.name === chosen.name),
      progress: forceProgress ?? 0,
      speed: 0.01 + Math.random() * 0.02 * baseSpeed,
      length: 50 + Math.random() * 150,
      brightness: 0.5 + Math.random() * 0.5,
      startOffset: -0.2 + Math.random() * 0.4
    }
  }

  function seedInitialMeteors() {
    const activeShowers = activeMeteorShowers.value
    if (activeShowers.length === 0) return
    const totalZhr = activeShowers.reduce((sum, s) => sum + s.zhr * s.activityFactor, 0)
    const isPeakPeriod = activeShowers.some(s => s.activityFactor > 0.8)
    const baseCount = Math.round(totalZhr / 20)
    const seedCount = isPeakPeriod 
      ? Math.min(12, Math.max(5, baseCount + 3))
      : Math.min(8, Math.max(3, baseCount))
    const seeds: Meteor[] = []
    for (let i = 0; i < seedCount; i++) {
      const progress = 0.05 + (i / seedCount) * 0.7
      const meteor = createMeteor(progress)
      if (isPeakPeriod) {
        meteor.brightness = Math.max(meteor.brightness, 0.7)
        meteor.speed *= 1.2
      }
      seeds.push(meteor)
    }
    meteors.value = [...meteors.value, ...seeds]
    hasSeededMeteors.value = true
  }

  function spawnMeteor(now: number) {
    if (!showMeteorMode.value) return
    const activeShowers = activeMeteorShowers.value
    if (activeShowers.length === 0) return

    if (!hasSeededMeteors.value) {
      seedInitialMeteors()
      lastMeteorSpawn.value = now
      return
    }

    const totalZhr = activeShowers.reduce((sum, s) => sum + s.zhr * s.activityFactor, 0)
    const baseInterval = Math.max(100, 3600000 / totalZhr)
    const elapsed = now - meteorModeStartedAt.value
    const warmupFactor = elapsed < 10000 ? 0.2 + (elapsed / 10000) * 0.8 : 1
    const spawnInterval = Math.max(80, baseInterval * warmupFactor)

    if (now - lastMeteorSpawn.value < spawnInterval) return

    meteors.value.push(createMeteor())
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
