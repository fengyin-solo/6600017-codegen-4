<template>
  <canvas ref="canvasRef" class="w-full h-full bg-black cursor-crosshair"
    @click="onClick" @wheel.prevent="onWheel" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useSkyStore } from '../store/sky'

const store = useSkyStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let animId = 0
let lastTime = performance.now()

function draw() {
  const canvas = canvasRef.value
  if (!canvas) { animId = requestAnimationFrame(draw); return }
  const ctx = canvas.getContext('2d')!
  const w = canvas.width = canvas.offsetWidth * 2
  const h = canvas.height = canvas.offsetHeight * 2
  const cx = w / 2, cy = h / 2
  const scale = Math.min(w, h) * store.zoom

  const now = performance.now()
  const deltaTime = Math.min(0.1, (now - lastTime) / 1000)
  lastTime = now

  if (store.showMeteorMode) {
    store.spawnMeteor(now)
    store.updateMeteors(deltaTime)
  }

  // background
  ctx.fillStyle = '#000814'
  ctx.fillRect(0, 0, w, h)

  // random background stars
  const rng = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } }
  const r = rng(42)
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(255,255,255,${r() * 0.4})`
    ctx.beginPath()
    ctx.arc(r() * w, r() * h, r() * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // grid
  if (store.showGrid) {
    ctx.strokeStyle = 'rgba(100,100,200,0.15)'
    ctx.lineWidth = 1
    for (let dec = -60; dec <= 60; dec += 30) {
      ctx.beginPath()
      for (let ra = 0; ra <= 24; ra += 0.5) {
        const [x, y] = store.projectStar(ra, dec, cx, cy, scale)
        if (x < -500) continue
        ra === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    for (let ra = 0; ra < 24; ra += 2) {
      ctx.beginPath()
      for (let dec = -90; dec <= 90; dec += 5) {
        const [x, y] = store.projectStar(ra, dec, cx, cy, scale)
        if (x < -500) continue
        dec === -90 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  // constellation lines
  if (store.showConstLines) {
    ctx.strokeStyle = 'rgba(100,180,255,0.4)'
    ctx.lineWidth = 1.5
    for (const c of store.CONSTELLATIONS) {
      for (const [i, j] of c.lines) {
        const s1 = store.STARS[i], s2 = store.STARS[j]
        const [x1, y1] = store.projectStar(s1.ra, s1.dec, cx, cy, scale)
        const [x2, y2] = store.projectStar(s2.ra, s2.dec, cx, cy, scale)
        if (x1 < -500 || x2 < -500) continue
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }
  }

  // stars
  for (const star of store.STARS) {
    const [x, y] = store.projectStar(star.ra, star.dec, cx, cy, scale)
    if (x < -500 || x > w + 500 || y < -500 || y > h + 500) continue
    const radius = store.starRadius(star.mag)
    const color = store.spectralColor(star.spectral)

    // glow
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 3)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius * 3, 0, Math.PI * 2)
    ctx.fill()

    // core
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    // label
    if (store.showLabels && star.mag < 2.5) {
      ctx.fillStyle = 'rgba(200,200,255,0.7)'
      ctx.font = `${10 * store.zoom}px system-ui`
      ctx.fillText(star.name, x + radius + 4, y + 4)
    }
  }

  // horizon
  ctx.strokeStyle = 'rgba(0,200,100,0.3)'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let az = 0; az <= 360; az += 5) {
    const azRad = az * Math.PI / 180
    const r = (Math.PI / 2) * scale * 0.45
    const x = cx + store.panX + r * Math.sin(azRad)
    const y = cy + store.panY - r * Math.cos(azRad)
    az === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()

  // constellation labels
  if (store.showLabels) {
    ctx.fillStyle = 'rgba(100,180,255,0.8)'
    ctx.font = `bold ${12 * store.zoom}px system-ui`
    for (const c of store.CONSTELLATIONS) {
      const midStar = store.STARS[c.stars[0]]
      const [x, y] = store.projectStar(midStar.ra, midStar.dec, cx, cy, scale)
      if (x < -500) continue
      ctx.fillText(c.nameCn, x - 20, y - 15 * store.zoom)
    }
  }

  // meteor shower radiants and meteors
  if (store.showMeteorMode) {
    const pulse = (Math.sin(now / 500) + 1) / 2

    for (const shower of store.activeMeteorShowers) {
      const [rx, ry] = store.projectStar(shower.radiantRa, shower.radiantDec, cx, cy, scale)
      if (rx < -500) continue

      const radiantSize = (8 + pulse * 4) * store.zoom
      const gradient = ctx.createRadialGradient(rx, ry, 0, rx, ry, radiantSize * 2)
      gradient.addColorStop(0, `rgba(255, 180, 100, ${0.6 + pulse * 0.3})`)
      gradient.addColorStop(0.5, `rgba(255, 120, 50, ${0.3 + pulse * 0.2})`)
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(rx, ry, radiantSize * 2, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#ff8c42'
      ctx.beginPath()
      ctx.arc(rx, ry, radiantSize * 0.5, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = `rgba(255, 200, 100, ${0.4 + pulse * 0.3})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(rx, ry, radiantSize * 1.5, 0, Math.PI * 2)
      ctx.stroke()

      if (store.showLabels) {
        ctx.fillStyle = 'rgba(255, 200, 150, 0.9)'
        ctx.font = `bold ${11 * store.zoom}px system-ui`
        ctx.fillText(`★ ${shower.nameCn}`, rx + 12, ry - 12)
        ctx.font = `${9 * store.zoom}px system-ui`
        ctx.fillStyle = 'rgba(200, 180, 150, 0.7)'
        ctx.fillText(`ZHR: ${Math.round(shower.zhr * shower.activityFactor)}`, rx + 12, ry + 8)
      }
    }

    for (const meteor of store.meteors) {
      const shower = store.METEOR_SHOWERS[meteor.showerIndex]
      if (!shower) continue

      const [rx, ry] = store.projectStar(shower.radiantRa, shower.radiantDec, cx, cy, scale)
      if (rx < -500) continue

      const angle = Math.atan2(ry - cy, rx - cx) + meteor.startOffset
      const trailLength = meteor.length * store.zoom

      const startProgress = Math.max(0, meteor.progress - 0.3)
      const endProgress = meteor.progress

      const x1 = rx + Math.cos(angle) * trailLength * startProgress
      const y1 = ry + Math.sin(angle) * trailLength * startProgress
      const x2 = rx + Math.cos(angle) * trailLength * endProgress
      const y2 = ry + Math.sin(angle) * trailLength * endProgress

      const fadeIn = Math.min(1, meteor.progress * 5)
      const fadeOut = Math.max(0, 1 - (meteor.progress - 0.7) * 3.33)
      const alpha = meteor.brightness * fadeIn * fadeOut

      const meteorGradient = ctx.createLinearGradient(x1, y1, x2, y2)
      meteorGradient.addColorStop(0, `rgba(255, 255, 255, 0)`)
      meteorGradient.addColorStop(0.3, `rgba(200, 230, 255, ${alpha * 0.3})`)
      meteorGradient.addColorStop(0.7, `rgba(255, 220, 150, ${alpha * 0.8})`)
      meteorGradient.addColorStop(1, `rgba(255, 255, 255, ${alpha})`)

      ctx.strokeStyle = meteorGradient
      ctx.lineWidth = (2 + meteor.brightness * 3) * store.zoom
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()

      const headGlow = ctx.createRadialGradient(x2, y2, 0, x2, y2, 8 * store.zoom)
      headGlow.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
      headGlow.addColorStop(0.3, `rgba(255, 220, 150, ${alpha * 0.5})`)
      headGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = headGlow
      ctx.beginPath()
      ctx.arc(x2, y2, 8 * store.zoom, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  animId = requestAnimationFrame(draw)
}

function onClick(e: MouseEvent) {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const x = (e.clientX - rect.left) * 2
  const y = (e.clientY - rect.top) * 2
  const cx = canvas.width / 2, cy = canvas.height / 2
  const scale = Math.min(canvas.width, canvas.height) * store.zoom
  store.selectStar(x, y, cx, cy, scale)
}

function onWheel(e: WheelEvent) {
  store.zoom = Math.max(0.3, Math.min(3, store.zoom + (e.deltaY > 0 ? -0.1 : 0.1)))
}

onMounted(() => draw())
onUnmounted(() => cancelAnimationFrame(animId))
</script>
