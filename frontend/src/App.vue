<template>
  <div class="flex h-screen">
    <!-- Sidebar -->
    <div class="w-72 bg-gray-900 p-4 flex flex-col gap-4 overflow-y-auto">
      <h1 class="text-xl font-bold text-blue-400">天文星图渲染器</h1>

      <!-- Search -->
      <div>
        <input v-model="store.searchQuery" placeholder="搜索天体..." class="w-full bg-gray-800 rounded px-3 py-2 text-sm" />
        <div v-if="store.filteredStars.length" class="mt-1">
          <div v-for="s in store.filteredStars" :key="s.name"
            @click="store.selectedStar = s"
            class="bg-gray-800 p-2 rounded mt-1 cursor-pointer hover:bg-gray-700 text-sm">
            {{ s.name }} <span class="text-gray-400">mag {{ s.mag }}</span>
          </div>
        </div>
      </div>

      <!-- Time Travel -->
      <div>
        <label class="text-gray-400 text-xs">时间旅行</label>
        <input type="datetime-local" v-model="dateStr" @input="updateDate"
          class="w-full bg-gray-800 rounded px-3 py-2 text-sm" />
      </div>

      <!-- Location -->
      <div>
        <label class="text-gray-400 text-xs">纬度: {{ store.latitude.toFixed(1) }}°</label>
        <input type="range" v-model.number="store.latitude" min="-90" max="90" step="0.1" class="w-full" />
      </div>

      <!-- Zoom -->
      <div>
        <label class="text-gray-400 text-xs">缩放: {{ store.zoom.toFixed(1) }}x</label>
        <input type="range" v-model.number="store.zoom" min="0.3" max="3" step="0.1" class="w-full" />
      </div>

      <!-- Toggles -->
      <div class="flex flex-col gap-2">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="store.showLabels" /> 星名标签
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="store.showConstLines" /> 星座连线
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" v-model="store.showGrid" /> 坐标网格
        </label>
        <label class="flex items-center gap-2 text-sm text-amber-400">
          <input type="checkbox" v-model="store.showMeteorMode" /> ☄️ 流星雨模式
        </label>
      </div>

      <!-- Active Meteor Showers -->
      <div v-if="store.showMeteorMode" class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-amber-400 font-bold mb-2">☄️ 活跃流星雨</h3>
        <div v-if="store.activeMeteorShowers.length === 0" class="text-xs text-gray-400">
          当前日期没有活跃的流星雨
        </div>
        <div v-else class="space-y-2">
          <div v-for="shower in store.activeMeteorShowers" :key="shower.name"
            class="bg-gray-900 rounded-lg p-2">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-amber-300">{{ shower.nameCn }}</span>
              <span class="text-xs text-gray-400">{{ shower.name }}</span>
            </div>
            <div class="text-xs text-gray-300 mt-1 space-y-0.5">
              <p>📅 {{ shower.startMonth }}/{{ shower.startDay }} - {{ shower.endMonth }}/{{ shower.endDay }}</p>
              <p>🌠 极大期: {{ shower.peakMonth }}/{{ shower.peakDay }}</p>
              <p>✨ ZHR: <span class="text-amber-400 font-bold">{{ Math.round(shower.zhr * shower.activityFactor) }}</span> / 小时</p>
              <p>🚀 速度: {{ shower.velocity }} km/s</p>
              <p>🎯 辐射点: RA {{ shower.radiantRa.toFixed(1) }}h, Dec {{ shower.radiantDec.toFixed(1) }}°</p>
              <div class="mt-1">
                <div class="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-orange-500 to-amber-400"
                    :style="{ width: (shower.activityFactor * 100) + '%' }"></div>
                </div>
                <p class="text-gray-500 mt-0.5">活动强度: {{ Math.round(shower.activityFactor * 100) }}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Star Info -->
      <div v-if="store.selectedStar" class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-amber-400 font-bold">{{ store.selectedStar.name }}</h3>
        <div class="text-xs text-gray-300 mt-2 space-y-1">
          <p>赤经: {{ store.selectedStar.ra.toFixed(2) }}h</p>
          <p>赤纬: {{ store.selectedStar.dec.toFixed(2) }}°</p>
          <p>视星等: {{ store.selectedStar.mag }}</p>
          <p>光谱型: {{ store.selectedStar.spectral }}</p>
        </div>
      </div>

      <!-- Constellation list -->
      <div class="text-xs">
        <h4 class="text-gray-400 mb-1">可见星座</h4>
        <div v-for="c in store.CONSTELLATIONS" :key="c.name" class="py-1 text-gray-300">
          {{ c.nameCn }} <span class="text-gray-500">({{ c.name }})</span>
        </div>
      </div>

      <div class="text-xs text-gray-500 mt-auto">
        LST: {{ store.localSiderealTime.toFixed(2) }}h
      </div>
    </div>

    <!-- Sky Canvas -->
    <div class="flex-1 relative">
      <StarCanvas />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useSkyStore } from './store/sky'
import StarCanvas from './components/StarCanvas.vue'

const store = useSkyStore()
const dateStr = ref(formatDate(store.viewDate))

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

watch(() => store.viewDate, (newDate) => {
  dateStr.value = formatDate(newDate)
}, { immediate: true })

function updateDate() {
  if (!dateStr.value) return
  const newDate = new Date(dateStr.value)
  if (!isNaN(newDate.getTime())) {
    store.viewDate = newDate
  }
}
</script>
