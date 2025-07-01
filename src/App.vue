<script setup lang="ts">
import { TrendCharts } from '@element-plus/icons-vue'
</script>

<template>
  <div class="app">
    <!-- 主要内容区域 -->
    <main class="app-main">
      <router-view />
    </main>

    <!-- 回到顶部 -->
    <el-backtop :right="40" :bottom="40" />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  overflow-y: hidden;
}

#app {
  height: 100vh;
  width: 100vw;
  max-width: 100vw;
  overflow: hidden;
}

.app {
  height: 100vh;
  width: 100vw;
  max-width: 100vw;
  overflow: hidden;
}

.app-main {
  height: 100%;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}
</style>
