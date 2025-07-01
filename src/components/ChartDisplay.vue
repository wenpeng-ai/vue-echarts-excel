<template>
  <div class="chart-display">
    <div v-if="!hasValidData" class="no-data-placeholder">
      <el-empty 
        description="数据已自动加载，图表正在生成中..."
        :image-size="80"
      >
        <template #image>
          <el-icon size="100" color="#409EFF"><TrendCharts /></el-icon>
        </template>
      </el-empty>
    </div>
    
    <div v-else class="chart-container">
      <!-- 单个图表模式 -->
      <div v-if="!isGroupedCharts" class="chart-wrapper">
        <v-chart 
          ref="chartRef"
          :option="chartOptions" 
          autoresize 
          class="chart"
          @mouseover="handleChartHover"
          @mouseout="handleChartLeave"
          @click="(params) => handleChartClick(params, 'single')"
        />
      </div>
      
      <!-- 分组图表模式 -->
      <div v-else class="grouped-charts">
        <div 
          v-for="(chartOption, groupName) in chartOptions" 
          :key="groupName"
          class="chart-group"
        >
          <v-chart 
            :ref="(el) => setGroupedChartRef(el, String(groupName))"
            :option="chartOption" 
            autoresize 
            class="chart"
            @mouseover="handleChartHover"
            @mouseout="handleChartLeave"
            @click="(params) => handleChartClick(params, String(groupName))"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { TrendCharts } from '@element-plus/icons-vue'
import { usePreciseChartUpdate, PreciseUpdateData } from '../composables/usePreciseChartUpdate'

interface Props {
  chartOptions: any | Record<string, any> | null
  hasValidData: boolean
  preciseUpdateData?: PreciseUpdateData | null
  columnMapping?: Record<number, string>
}

const props = defineProps<Props>()

const emit = defineEmits(['chartHover', 'chartLeave', 'chartPointSelected'])

// 图表实例引用
const chartRef = ref<any>(null)
const groupedChartRefs = ref<Record<string, any>>({})

// 全局选中状态管理 - 只维护一个选中点和对应的图表ID
const selectedPoint = ref<{
  chartId: string;
  seriesIndex: number;
  dataIndex: number;
  value: [number, number];
} | null>(null)

// 防止事件冲突的标志
const isHandlingChartClick = ref(false)
const isHandlingTableSelection = ref(false)

// 当前十字线位置的缓存 - 全局只有一个
const currentCrosshairPosition = ref<{
  pixelX: number;
  pixelY: number;
  xValue: number;
  yValue: number;
} | null>(null)

// 精准更新 composable
const { updateChartPrecisely, shouldUsePreciseUpdate } = usePreciseChartUpdate()

// 判断是否为分组图表
const isGroupedCharts = computed(() => {
  return props.chartOptions && 
         typeof props.chartOptions === 'object' && 
         !Array.isArray(props.chartOptions) &&
         !props.chartOptions.series // 如果有series属性，说明是单个图表配置
})

// 设置分组图表引用
function setGroupedChartRef(el: any, groupName: string) {
  if (el) {
    groupedChartRefs.value[groupName] = el
  }
}

// 获取当前活动的图表实例
function getActiveChartInstance() {
  if (isGroupedCharts.value) {
    // 对于分组图表，返回第一个图表实例（或根据业务逻辑选择）
    const firstGroupName = Object.keys(groupedChartRefs.value)[0]
    return firstGroupName ? groupedChartRefs.value[firstGroupName] : null
  } else {
    return chartRef.value
  }
}

// 根据chartId获取指定的图表实例
function getChartInstance(chartId: string) {
  if (chartId === 'single') {
    return chartRef.value
  } else {
    return groupedChartRefs.value[chartId] || null
  }
}

// 设置图表点击监听器
function setupChartClickListener() {
  if (isGroupedCharts.value) {
    // 为每个分组图表设置独立的监听器
    Object.keys(groupedChartRefs.value).forEach(chartId => {
      const chartInstance = groupedChartRefs.value[chartId]
      if (!chartInstance) return
      
      const echartsInstance = chartInstance.chart || chartInstance
      if (!echartsInstance) return

      // 检查 ECharts 实例是否已初始化
      try {
        const option = echartsInstance.getOption()
        if (!option) {
          console.warn(`ECharts instance for chart ${chartId} is not initialized yet`)
          return
        }
        setupChartZRenderListener(echartsInstance, chartId)
      } catch (error) {
        console.warn(`Failed to setup listener for chart ${chartId}:`, error)
      }
    })
  } else {
    // 为单个图表设置监听器
    const chartInstance = chartRef.value
    if (!chartInstance) return
    
    const echartsInstance = chartInstance.chart || chartInstance
    if (!echartsInstance) return

    // 检查 ECharts 实例是否已初始化
    try {
      const option = echartsInstance.getOption()
      if (!option) {
        console.warn('ECharts instance for single chart is not initialized yet')
        return
      }
      setupChartZRenderListener(echartsInstance, 'single')
    } catch (error) {
      console.warn('Failed to setup listener for single chart:', error)
    }
  }
}

// 为指定图表设置ZRender监听器
function setupChartZRenderListener(echartsInstance: any, chartId: string) {
  // 监听整个图表区域的点击事件（包括空白区域）
  echartsInstance.getZr().on('click', (event: any) => {
    console.log('ZRender click event:', event, 'chartId:', chartId)
    
    // 如果正在处理图表点击事件，忽略这个事件
    if (isHandlingChartClick.value) {
      console.log('Chart click is being handled, ignoring ZRender event')
      return
    }
    
    // 检查是否点击的是散点图的数据点
    if (event.target && event.target.dataIndex !== undefined) {
      console.log('Clicked on data point via ZRender, ignoring (will be handled by chart click)')
      return // 如果是数据点，让 ECharts 的点击事件处理
    }
    
    // 延迟处理空白区域点击，让ECharts的点击事件有机会先执行
    setTimeout(() => {
      // 再次检查是否正在处理图表点击
      if (isHandlingChartClick.value) {
        console.log('Chart click started during delay, ignoring ZRender blank area click')
        return
      }
      
      // 只清除全局选中状态
      console.log('Clicked on blank area via ZRender, clearing selection for chart:', chartId)
      selectedPoint.value = null
      updateChartSelection()
    }, 10) // 10ms延迟，给ECharts点击事件优先处理
  })

  // 监听缩放（dataZoom）和漫游（roam）事件，缩放时取消选中
  echartsInstance.on('dataZoom', () => {
    if (selectedPoint.value) {
      selectedPoint.value = null
      updateChartSelection()
    }
  })
  echartsInstance.on('roam', () => {
    if (selectedPoint.value) {
      selectedPoint.value = null
      updateChartSelection()
    }
  })
}

// 监听精准更新数据
watch(
  () => props.preciseUpdateData,
  (newPreciseData: PreciseUpdateData | null | undefined) => {
    if (newPreciseData && newPreciseData.cellChange) {
      console.log('Received precise update data:', newPreciseData);
      handlePreciseUpdate(newPreciseData)
    }
  },
  { deep: true }
)

// 处理精准更新
function handlePreciseUpdate(preciseData: PreciseUpdateData) {
  console.log('🎯 ChartDisplay - Handling precise update:', preciseData)
  
  if (!preciseData.cellChange || !props.columnMapping) {
    console.log('🚫 Missing cell change data or column mapping, skipping precise update')
    return
  }

  console.log('🔍 Precise update - Row:', preciseData.cellChange.rowIndex, 'Column:', preciseData.cellChange.columnIndex)
  console.log('🔍 Old column name:', preciseData.cellChange.oldColumnName)
  console.log('🔍 New value:', preciseData.cellChange.newValue)

  // 检查是否应该使用精准更新
  if (!shouldUsePreciseUpdate(preciseData.cellChange, props.chartOptions)) {
    console.log('❌ Conditions not met for precise update, will use normal chart update flow')
    return
  }

  const chartInstance = getActiveChartInstance()
  if (!chartInstance) {
    console.warn('🚫 No chart instance available for precise update')
    return
  }

  // 获取 ECharts 实例
  const echartsInstance = chartInstance.chart || chartInstance

  if (echartsInstance) {
    console.log('🔧 Calling updateChartPrecisely...')
    const success = updateChartPrecisely(
      echartsInstance,
      preciseData,
      props.columnMapping,
      props.chartOptions,
      preciseData.cellChange.oldColumnName // 传递旧列名
    )

    if (!success) {
      console.log('❌ Precise update failed, chart will be updated through normal flow')
    } else {
      console.log('✅ Precise update successful!')
    }
  }
}

function handleChartHover(params: any) {
  emit('chartHover', params)
}

function handleChartLeave() {
  emit('chartLeave')
}

// 处理散点图点击选中
function handleChartClick(params: any, chartId: string) {
  console.log('Chart clicked:', params, 'chartId:', chartId)
  
  // 立即设置标志，表示正在处理图表点击事件
  isHandlingChartClick.value = true
  
  const resetFlag = () => {
    setTimeout(() => {
      isHandlingChartClick.value = false
    }, 20)
  }
  
  // 如果没有 params，说明点击的是空白区域，清空全局选中状态
  if (!params) {
    console.log('Clicked on empty area (no params), clearing selection')
    selectedPoint.value = null
    updateChartSelection()
    resetFlag()
    return
  }
  
  // 如果 params 存在但没有 componentType，说明点击的是空白区域
  if (!params.componentType) {
    console.log('Clicked on empty area (no componentType), clearing selection')
    selectedPoint.value = null
    updateChartSelection()
    resetFlag()
    return
  }
  
  // 如果点击的不是系列组件，清空选中状态
  if (params.componentType !== 'series') {
    console.log('Clicked on non-series component, clearing selection')
    selectedPoint.value = null
    updateChartSelection()
    resetFlag()
    return
  }
  
  // 如果点击的不是散点图或者没有数据，清空选中状态
  if (!params.seriesType || params.seriesType !== 'scatter' || !params.data) {
    console.log('Clicked on non-scatter element or no data, clearing selection')
    selectedPoint.value = null
    updateChartSelection()
    resetFlag()
    return
  }
  
  // 处理散点图的点击
  const clickedPoint = {
    chartId: chartId,
    seriesIndex: params.seriesIndex,
    dataIndex: params.dataIndex,
    value: params.data.value || params.value
  }
  
  console.log('Clicked on scatter point:', clickedPoint)
  
  // 如果点击的是已选中的点，则取消选中
  if (selectedPoint.value && 
      selectedPoint.value.chartId === clickedPoint.chartId &&
      selectedPoint.value.seriesIndex === clickedPoint.seriesIndex &&
      selectedPoint.value.dataIndex === clickedPoint.dataIndex) {
    console.log('Clicking same point, deselecting')
    selectedPoint.value = null
  } else {
    console.log('Selecting new point')
    selectedPoint.value = clickedPoint
  }
  
  // 立即更新图表的视觉效果
  updateChartSelection()
  
  // 发送选中事件给父组件，用于高亮表格单元格
  if (selectedPoint.value && props.columnMapping) {
    // 根据系列信息找到对应的列名
    const seriesIndex = selectedPoint.value.seriesIndex;
    const dataIndex = selectedPoint.value.dataIndex;
    
    // 从图表配置中获取系列信息
    let seriesName = "";
    if (isGroupedCharts.value) {
      // 分组图表情况
      const chartOptions = props.chartOptions[chartId];
      if (chartOptions && chartOptions.series && chartOptions.series[seriesIndex]) {
        seriesName = chartOptions.series[seriesIndex].name;
      }
    } else {
      // 单个图表情况
      if (props.chartOptions && props.chartOptions.series && props.chartOptions.series[seriesIndex]) {
        seriesName = props.chartOptions.series[seriesIndex].name;
      }
    }
    
    // 从系列名称中提取列名（移除"散点"后缀）
    const columnName = seriesName.replace('散点', '').trim();
    
    // 获取原始行索引（从散点图数据中）
    let originalRowIndex = dataIndex; // 默认使用dataIndex
    
    // 尝试从图表数据中获取originalRowIndex
    if (isGroupedCharts.value) {
      const chartOptions = props.chartOptions[chartId];
      if (chartOptions && chartOptions.series && chartOptions.series[seriesIndex] && 
          chartOptions.series[seriesIndex].data && chartOptions.series[seriesIndex].data[dataIndex]) {
        const dataPoint = chartOptions.series[seriesIndex].data[dataIndex];
        if (dataPoint.originalRowIndex !== undefined) {
          originalRowIndex = dataPoint.originalRowIndex;
        }
      }
    } else {
      if (props.chartOptions && props.chartOptions.series && props.chartOptions.series[seriesIndex] && 
          props.chartOptions.series[seriesIndex].data && props.chartOptions.series[seriesIndex].data[dataIndex]) {
        const dataPoint = props.chartOptions.series[seriesIndex].data[dataIndex];
        if (dataPoint.originalRowIndex !== undefined) {
          originalRowIndex = dataPoint.originalRowIndex;
        }
      }
    }
    
    console.log('Emitting chart point selected:', { dataIndex, originalRowIndex, columnName, seriesName });
    
    emit('chartPointSelected', {
      dataRowIndex: originalRowIndex, // 使用原始行索引
      columnName: columnName,
      seriesName: seriesName,
      chartId: chartId
    });
  } else {
    // 清除选中状态
    emit('chartPointSelected', null);
  }
  
  // 延迟重置标志，确保ZRender事件能看到这个标志
  resetFlag()
}

// 高亮指定的图表点（表格选中单元格时调用）
function highlightChartPoint(originalRowIndex: number, columnName: string) {
  console.log('Highlighting chart point:', { originalRowIndex, columnName });
  console.log('Chart options:', props.chartOptions);
  
  // 设置标志，防止全局点击事件干扰
  isHandlingTableSelection.value = true;
  
  if (!props.chartOptions) {
    isHandlingTableSelection.value = false;
    return;
  }
  
  // 查找对应的系列和数据点
  let targetSeriesIndex = -1;
  let targetChartId = 'single';
  let chartDataIndex = -1; // 在图表数据中的索引
  
  if (isGroupedCharts.value) {
    // 分组图表情况
    console.log('Processing grouped charts');
    Object.keys(props.chartOptions).forEach(chartId => {
      const chartOption = props.chartOptions[chartId];
      if (chartOption && chartOption.series) {
        chartOption.series.forEach((series: any, seriesIndex: number) => {
          console.log('Checking series:', series.name, 'against column:', columnName);
          const seriesColumnName = series.name.replace('散点', '').trim();
          // 增强匹配逻辑：检查完全匹配或包含关系
          if (seriesColumnName === columnName || series.name.includes(columnName) || columnName.includes(seriesColumnName)) {
            targetSeriesIndex = seriesIndex;
            targetChartId = chartId;
            
            // 在该系列数据中查找具有相同originalRowIndex的数据点
            if (series.data) {
              chartDataIndex = series.data.findIndex((dataPoint: any) => 
                dataPoint.originalRowIndex === originalRowIndex
              );
            }
            console.log('Found matching series:', series.name, 'at index:', seriesIndex, 'chartDataIndex:', chartDataIndex);
          }
        });
      }
    });
  } else {
    // 单个图表情况
    console.log('Processing single chart');
    if (props.chartOptions.series) {
      props.chartOptions.series.forEach((series: any, seriesIndex: number) => {
        console.log('Checking series:', series.name, 'against column:', columnName);
        const seriesColumnName = series.name.replace('散点', '').trim();
        // 增强匹配逻辑：检查完全匹配或包含关系
        if (seriesColumnName === columnName || series.name.includes(columnName) || columnName.includes(seriesColumnName)) {
          targetSeriesIndex = seriesIndex;
          
          // 在该系列数据中查找具有相同originalRowIndex的数据点
          if (series.data) {
            chartDataIndex = series.data.findIndex((dataPoint: any) => 
              dataPoint.originalRowIndex === originalRowIndex
            );
          }
          console.log('Found matching series:', series.name, 'at index:', seriesIndex, 'chartDataIndex:', chartDataIndex);
        }
      });
    }
  }
  
  if (targetSeriesIndex === -1 || chartDataIndex === -1) {
    console.log('Series or data point not found for column:', columnName, 'originalRowIndex:', originalRowIndex);
    isHandlingTableSelection.value = false;
    return;
  }
  
  // 获取实际的数据值
  let actualValue = [0, 0];
  
  if (isGroupedCharts.value) {
    const chartOption = props.chartOptions[targetChartId];
    if (chartOption && chartOption.series && chartOption.series[targetSeriesIndex] && 
        chartOption.series[targetSeriesIndex].data && 
        chartOption.series[targetSeriesIndex].data[chartDataIndex]) {
      const dataPoint = chartOption.series[targetSeriesIndex].data[chartDataIndex];
      actualValue = dataPoint.value || dataPoint;
    }
  } else {
    if (props.chartOptions.series && props.chartOptions.series[targetSeriesIndex] && 
        props.chartOptions.series[targetSeriesIndex].data && 
        props.chartOptions.series[targetSeriesIndex].data[chartDataIndex]) {
      const dataPoint = props.chartOptions.series[targetSeriesIndex].data[chartDataIndex];
      actualValue = dataPoint.value || dataPoint;
    }
  }
  
  console.log('Found actual value:', actualValue);
  
  // 设置选中点
  selectedPoint.value = {
    chartId: targetChartId,
    seriesIndex: targetSeriesIndex,
    dataIndex: chartDataIndex, // 使用图表数据索引
    value: [actualValue[0] || 0, actualValue[1] || 0] as [number, number]
  };
  
  // 更新图表选中状态
  updateChartSelection();
  
  // 延迟重置标志，确保全局点击事件不会立即清除选中状态
  setTimeout(() => {
    isHandlingTableSelection.value = false;
  }, 100);
}

// 清除图表高亮
function clearChartHighlight() {
  console.log('Clearing chart highlight');
  selectedPoint.value = null;
  updateChartSelection();
}

// 暴露方法给父组件
// @ts-ignore
defineExpose({
  highlightChartPoint,
  clearChartHighlight
})

// 更新图表的选中状态和虚线交叉
function updateChartSelection() {
  console.log('updateChartSelection called, selectedPoint:', selectedPoint.value)
  
  // 清除所有图表的十字线
  const allChartIds = isGroupedCharts.value ? Object.keys(groupedChartRefs.value) : ['single']
  
  allChartIds.forEach(chartId => {
    const chartInstance = getChartInstance(chartId)
    if (!chartInstance) return
    
    const echartsInstance = chartInstance.chart || chartInstance
    if (!echartsInstance) return
    
    // 检查 ECharts 实例是否已初始化
    try {
      // 尝试获取当前配置，如果失败说明实例未初始化
      const currentOption = echartsInstance.getOption()
      if (!currentOption) return
      
      // 清除该图表的十字线
      echartsInstance.setOption({
        ...currentOption,
        graphic: []
      }, {
        replaceMerge: ['graphic']
      })
    } catch (error) {
      console.warn(`ECharts instance for chart ${chartId} is not initialized yet:`, error)
      return
    }
  })
  
  // 如果没有选中的点，清除全局缓存并返回
  if (!selectedPoint.value) {
    console.log('No selected point, cleared all graphics')
    currentCrosshairPosition.value = null
    return
  }
  
  // 如果有选中的点，在对应的图表上显示十字线
  const targetChartId = selectedPoint.value.chartId
  const chartInstance = getChartInstance(targetChartId)
  if (!chartInstance) return
  
  const echartsInstance = chartInstance.chart || chartInstance
  if (!echartsInstance) return
  
  console.log('Drawing crosshairs for selected point on chart:', targetChartId)
  const [xValue, yValue] = selectedPoint.value.value
  
  // 立即更新十字线位置
  try {
    // 检查 ECharts 实例是否已初始化
    const currentOption = echartsInstance.getOption()
    if (!currentOption) {
      console.warn(`ECharts instance for chart ${targetChartId} is not initialized yet`)
      return
    }
    
    // 将数据坐标转换为像素坐标
    const pixelPoint = echartsInstance.convertToPixel('grid', [xValue, yValue])
    if (!pixelPoint) return
    
    const [pixelX, pixelY] = pixelPoint
    
    // 获取图表容器尺寸
    const chartDom = echartsInstance.getDom()
    const chartWidth = chartDom.clientWidth
    const chartHeight = chartDom.clientHeight
    
    // 获取网格区域信息
    const gridOption = currentOption.grid[0] || {}
    const gridLeft = typeof gridOption.left === 'string' ? 
      (parseFloat(gridOption.left) / 100) * chartWidth : (gridOption.left || chartWidth * 0.1)
    const gridRight = typeof gridOption.right === 'string' ? 
      (parseFloat(gridOption.right) / 100) * chartWidth : (gridOption.right || chartWidth * 0.1)
    const gridTop = typeof gridOption.top === 'string' ? 
      (parseFloat(gridOption.top) / 100) * chartHeight : (gridOption.top || chartHeight * 0.1)
    const gridBottom = typeof gridOption.bottom === 'string' ? 
      (parseFloat(gridOption.bottom) / 100) * chartHeight : (gridOption.bottom || chartHeight * 0.2)
    
    const gridAreaLeft = gridLeft
    const gridAreaRight = chartWidth - gridRight
    const gridAreaTop = gridTop
    const gridAreaBottom = chartHeight - gridBottom
    
    const newPosition = { pixelX, pixelY, xValue, yValue }
    
    // 如果是第一次显示或者没有缓存位置，直接显示
    if (!currentCrosshairPosition.value) {
      console.log('First time showing crosshair, no animation')
      currentCrosshairPosition.value = newPosition
      drawCrosshair(echartsInstance, newPosition, gridAreaLeft, gridAreaRight, gridAreaTop, gridAreaBottom)
      return
    }
    
    // 如果位置相同，不需要动画
    if (currentCrosshairPosition.value.pixelX === pixelX && 
        currentCrosshairPosition.value.pixelY === pixelY) {
      console.log('Same position, no animation needed')
      return
    }
    
    // 执行平滑动画
    console.log('Animating crosshair movement')
    animateCrosshair(
      echartsInstance, 
      currentCrosshairPosition.value, 
      newPosition,
      gridAreaLeft, 
      gridAreaRight, 
      gridAreaTop, 
      gridAreaBottom
    )
    
    // 更新缓存位置
    currentCrosshairPosition.value = newPosition
    
  } catch (error) {
    console.warn(`Failed to handle crosshair for chart ${targetChartId}:`, error)
  }
}

// 绘制十字线
function drawCrosshair(echartsInstance: any, position: any, gridAreaLeft: number, gridAreaRight: number, gridAreaTop: number, gridAreaBottom: number) {
  try {
    // 检查 ECharts 实例是否已初始化
    if (!echartsInstance.getOption) {
      console.warn('ECharts instance is not properly initialized for crosshair drawing')
      return
    }
    
    echartsInstance.setOption({
      graphic: [
        {
          id: 'crosshair-vertical',
          type: 'line',
          z: 2,
          position: [0, 0],
          shape: {
            x1: position.pixelX,
            y1: gridAreaTop,
            x2: position.pixelX,
            y2: gridAreaBottom
          },
          style: {
            stroke: '#808080',
            lineWidth: 1,
            lineDash: [8, 4],
            opacity: 0.8
          }
        },
        {
          id: 'crosshair-horizontal',
          type: 'line',
          z: 2,
          position: [0, 0],
          shape: {
            x1: gridAreaLeft,
            y1: position.pixelY,
            x2: gridAreaRight,
            y2: position.pixelY
          },
          style: {
            stroke: '#808080',
            lineWidth: 1,
            lineDash: [8, 4],
            opacity: 0.8
          }
        },
        {
          id: 'crosshair-label',
          type: 'text',
          z: 1,
          position: [gridAreaLeft - 10, position.pixelY],
          style: {
            text: position.yValue,
            fill: '#808080', 
            fontSize: 14,
            fontWeight: 'bold',
            textAlign: 'right',
            textVerticalAlign: 'middle',
            backgroundColor: "white",
            padding: [2, 4],
            borderColor: "#808080",
            borderWidth: 1,
            borderRadius: 3
          }
        }
      ]
    })
  } catch (error) {
    console.warn('Failed to draw crosshair:', error)
  }
}

// 平滑动画移动十字线
function animateCrosshair(
  echartsInstance: any, 
  fromPosition: any, 
  toPosition: any,
  gridAreaLeft: number, 
  gridAreaRight: number, 
  gridAreaTop: number, 
  gridAreaBottom: number
) {
  const duration = 200 // 动画持续时间
  const startTime = Date.now()
  
  function animate() {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    
    // 使用缓动函数让动画更平滑
    const easeProgress = 1 - Math.pow(1 - progress, 3) // easeOutCubic
    
    // 插值计算当前位置
    const currentPixelX = fromPosition.pixelX + (toPosition.pixelX - fromPosition.pixelX) * easeProgress
    const currentPixelY = fromPosition.pixelY + (toPosition.pixelY - fromPosition.pixelY) * easeProgress
    
    // 在动画过程中直接显示目标值，避免中间插值的长小数
    const displayValue = toPosition.yValue;
    
    // 绘制当前帧
    drawCrosshair(echartsInstance, {
      pixelX: currentPixelX,
      pixelY: currentPixelY,
      yValue: displayValue
    }, gridAreaLeft, gridAreaRight, gridAreaTop, gridAreaBottom)
    
    // 如果动画未完成，继续下一帧
    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }
  
  animate()
}

// 监听图表配置变化，清除选中状态
watch(() => props.chartOptions, () => {
  // 清除全局选中状态
  selectedPoint.value = null
  
  // 延迟清除选中状态，确保 ECharts 实例已完全初始化
  setTimeout(() => {
    updateChartSelection()
  }, 150)
  
  // 重新设置点击监听器
  setTimeout(() => {
    setupChartClickListener()
  }, 200)
}, { deep: true })

// 键盘事件处理函数
function handleKeyDown(event: KeyboardEvent) {
  // 按 Escape 键取消选中
  if (event.key === 'Escape' && selectedPoint.value) {
    console.log('Escape key pressed, clearing selection')
    selectedPoint.value = null
    updateChartSelection()
  }
}

// 全局点击事件处理函数
function handleGlobalClick(event: Event) {
  // 如果正在处理表格选中操作，忽略全局点击事件
  if (isHandlingTableSelection.value) {
    console.log('Ignoring global click during table selection')
    return
  }
  
  // 检查是否有选中的点
  if (!selectedPoint.value) return
  
  // 检查点击的元素是否在图表组件内
  const chartDisplayElement = document.querySelector('.chart-display')
  if (!chartDisplayElement) return
  
  // 检查点击的元素是否在表格组件内（避免表格操作清除图表选中状态）
  const excelEditorElement = document.querySelector('.excel-editor')
  if (excelEditorElement && excelEditorElement.contains(event.target as Node)) {
    console.log('Clicked in table area, ignoring for chart selection')
    return
  }
  
  // 如果点击的元素在图表组件内，不处理（让图表自己的点击事件处理）
  if (chartDisplayElement.contains(event.target as Node)) {
    return
  }
  
  // 如果点击的是图表外和表格外的任何地方，清除选中状态
  console.log('Clicked outside chart and table area, clearing selection')
  selectedPoint.value = null
  updateChartSelection()
}

// 组件挂载后设置图表实例和键盘监听
onMounted(() => {
  console.log('ChartDisplay mounted, chart precision update ready')
  // 添加键盘事件监听
  document.addEventListener('keydown', handleKeyDown)
  
  // 添加全局点击事件监听
  document.addEventListener('click', handleGlobalClick, true) // 使用捕获阶段
  
  // 延迟设置图表点击监听器，确保图表已完全初始化
  setTimeout(() => {
    setupChartClickListener()
  }, 500)
})

// 组件卸载时清理键盘监听
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
  document.removeEventListener('click', handleGlobalClick, true)
})
</script>

<style scoped lang="less">
.chart-display {
  height: 100vh;
  width: 100%;
  max-width: 100%;
  background: white;
  overflow: hidden;
}

.no-data-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
}

.chart-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chart-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
  
  .chart {
    height: 50%;
    width: 100%;
    max-width: 100%;
  }
}

.grouped-charts {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px;
  overflow-y: auto;
  
  .chart-group {
    min-height: 400px;
    height: 50%;
    width: 100%;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    padding: 10px;
    background: #fafafa;
    
    .chart {
      height: 100%;
      width: 100%;
    }
  }
}
</style>
