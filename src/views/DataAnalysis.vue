<template>
  <div class="data-analysis-page">
    <div class="chart-section">
      <ChartDisplay
        ref="chartDisplayRef"
        :chart-options="chartOptions"
        :has-valid-data="hasValidData"
        :precise-update-data="preciseUpdateData"
        :column-mapping="columnMapping"
        @chart-hover="handleChartHover"
        @chart-leave="handleChartLeave"
        @chart-point-selected="handleChartPointSelected"
      />
    </div>
    <div class="editor-section">
      <ExcelEditor
        ref="excelEditorRef"
        :is-generating="isGenerating"
        @file-change="handleFileChange"
        @data-change="handleDataChange"
        @cell-change="handleCellChange"
        @clear-data="handleClearData"
        @cell-selected="handleCellSelected"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import ChartDisplay from "../components/ChartDisplay.vue";
import ExcelEditor from "../components/ExcelEditor.vue";
import { useChartProcessor } from "../composables/useChartProcessor";

// 类型定义
interface RowData {
  [key: string]: string | number | undefined;
}

interface CellChangeInfo {
  rowIndex: number;
  columnIndex: number;
  newValue: string;
  columnName: string;
  timestamp: number;
}

interface PreciseUpdateData {
  cellChange: CellChangeInfo;
  fullData: any;
}

// 响应式数据
const excelEditorRef = ref();
const chartDisplayRef = ref();
const isGenerating = ref(false);
const chartOptions = ref<any | null>(null);
const preciseUpdateData = ref<PreciseUpdateData | null>(null);
const columnMapping = ref<Record<number, string>>({});

// 组合式函数
const { processChartData, processGroupedChartData } = useChartProcessor();

// 计算属性
const hasValidData = computed(() => {
  return chartOptions.value !== null;
});

// 处理文件变化
function handleFileChange(workbook: any) {
  // 处理文件变化逻辑
}

// 处理数据变化（实时更新图表）
function handleDataChange(data: { 
  rows: RowData[]; 
  columns: string[]; 
  columnGroups?: Record<string, string[]>;
  columnMapping?: Record<number, string>;
  headerRowCount?: number; // 添加表头行数
}) {
  try {
    // 更新列映射（用于精准更新）
    if (data.columnMapping) {
      columnMapping.value = data.columnMapping;
    } else {
      // 如果没有传递列映射，根据列创建一个
      const newColumnMapping: Record<number, string> = {};
      data.columns.forEach((column, index) => {
        newColumnMapping[index] = column;
      });
      columnMapping.value = newColumnMapping;
    }

    // 优先使用分组图表处理
    if (data.columnGroups && Object.keys(data.columnGroups).length > 1) {
      const groupedResult = processGroupedChartData(data.rows, data.columnGroups, data.headerRowCount);
      if (groupedResult) {
        chartOptions.value = groupedResult;
        return;
      }
    }
    // 回退到单个图表处理
    const result = processChartData(data.rows, data.columns, data.headerRowCount);
    if (result) {
      chartOptions.value = result;
    } else {
      chartOptions.value = null;
    }
  } catch (error) {
    console.error('图表处理错误:', error);
    chartOptions.value = null;
  }
}

// 清空数据
function handleClearData() {
  chartOptions.value = null;
}

// 图表事件处理
function handleChartHover(params: any) {
  // 处理图表悬停事件
}

function handleChartLeave() {
  // 处理图表离开事件
}

// 处理单元格选中事件（表格 -> 图表）
function handleCellSelected(cellInfo: any) {
  console.log("Cell selected in table:", cellInfo);
  
  if (!cellInfo) {
    // 清除图表高亮
    if (chartDisplayRef.value && chartDisplayRef.value.clearChartHighlight) {
      chartDisplayRef.value.clearChartHighlight();
    }
    return;
  }
  
  // 在图表中高亮对应的散点
  if (chartDisplayRef.value && chartDisplayRef.value.highlightChartPoint) {
    chartDisplayRef.value.highlightChartPoint(cellInfo.dataRowIndex, cellInfo.columnName);
  }
}

// 处理图表点击事件（图表 -> 表格）
function handleChartPointSelected(pointInfo: any) {
  console.log("Chart point selected:", pointInfo);
  
  if (!pointInfo) {
    // 清除表格高亮
    if (excelEditorRef.value && excelEditorRef.value.clearCellHighlight) {
      excelEditorRef.value.clearCellHighlight();
    }
    return;
  }
  
  // 在表格中高亮对应的单元格
  if (excelEditorRef.value && excelEditorRef.value.highlightCell) {
    excelEditorRef.value.highlightCell(pointInfo.dataRowIndex, pointInfo.columnName);
  }
}

// 处理精准单元格变更
function handleCellChange(data: PreciseUpdateData) {
  console.log('Received cell change:', data);
  
  // 检查是否为真正的结构性变化（新增列等，但不包括表头修改）
  const isStructuralChange = !columnMapping.value[data.cellChange.columnIndex];
  
  if (isStructuralChange) {
    console.log('Structural change detected (new column), performing full update');
    // 对于结构性变化，处理常规数据变更
    if (data.fullData) {
      handleDataChange(data.fullData);
    }
    return;
  }
  
  // 对于表头修改，只更新列映射，不重新生成图表
  if (data.cellChange.rowIndex === 0 && data.fullData && data.fullData.columnMapping) {
    console.log('Header change detected, updating column mapping only');
    columnMapping.value = data.fullData.columnMapping;
  }
  
  // 尝试精准更新
  console.log('Attempting precise update for:', data.cellChange.rowIndex === 0 ? 'header change' : 'data change');
  preciseUpdateData.value = data;
  
  // 清除精准更新数据（防止重复触发）
  setTimeout(() => {
    preciseUpdateData.value = null;
  }, 500);
}

// 组件挂载
onMounted(() => {
  // 组件已挂载
});
</script>

<style scoped lang="less">
.data-analysis-page {
  height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
}

.chart-section {
  height: 100vh;
  width: 60%;
  border-bottom: 1px solid #e4e7ed;
}

.editor-section {
  height: 100vh;
  width: 40%;
  overflow: hidden;
}
</style>
