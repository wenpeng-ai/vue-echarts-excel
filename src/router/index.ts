import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'DataAnalysis',
    component: () => import('../views/DataAnalysis.vue'),
    meta: {
      title: '数据分析工具'
    }
  }
]

const router = createRouter({
  history: createWebHistory('/vue-echarts-excel/'),
  routes
})

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta?.title || '数据分析工具'} - Excel数据可视化`
  next()
})

export default router
