<template>
  <div class="excel-editor">
    <!-- 工具栏 -->
    <div class="toolbar">
      <el-upload
        :auto-upload="false"
        :show-file-list="false"
        accept=".xlsx, .xls"
        @change="handleFileChange"
      >
        <el-button size="small" type="primary">
          <el-icon>
            <Upload />
          </el-icon>上传Excel
        </el-button>
      </el-upload>
      <el-button size="small" @click="loadSampleData">
        <el-icon>
          <Star />
        </el-icon>示例数据
      </el-button>
      <el-button size="small" @click="clearAllData">
        <el-icon>
          <Delete />
        </el-icon>清空数据
      </el-button>
    </div>

    <!-- x-data-spreadsheet 编辑器 -->
    <div class="spreadsheet-container">
      <div
        id="spreadsheet"
        ref="spreadsheetRef"
        style="margin: 0px; padding: 0px; position: relative; width: 100%; height: calc(100vh - 60px); border: none;"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage } from "element-plus";
import { Star, Delete, Upload, Refresh } from "@element-plus/icons-vue";
import Spreadsheet from "x-data-spreadsheet";
import "x-data-spreadsheet/dist/xspreadsheet.css";

import { useExcelProcessor } from "../composables/useExcelProcessor";

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

interface Props {
  isGenerating: boolean;
}

defineProps<Props>();

const emit = defineEmits(["fileChange", "dataChange", "clearData", "cellChange", "cellSelected"]);

// 响应式数据
const spreadsheetRef = ref<HTMLElement>();
const spreadsheet = ref<any>(null);
const currentHeaderRows = ref<string[][]>([]);

// 添加选中状态管理
const selectedCellPosition = ref<{ row: number; col: number } | null>(null);
const highlightedCells = ref<Set<string>>(new Set()); // 存储高亮单元格的位置字符串

// 组合式函数
const {
  processExcelFile,
  loadSheetData,
  loadRawWorkbookData
} = useExcelProcessor();

// 取消单元格选中的通用函数
function clearCellSelection() {
  if (!spreadsheet.value) return;

  setTimeout(() => {
    try {
      const s = spreadsheet.value;
      if (s && s.sheet) {
        // 直接重置到A1单元格
        if (s.sheet.selector && typeof s.sheet.selector.set === 'function') {
          s.sheet.selector.set(0, 0, 0, 0);
        }

        // 重置行列索引到A1
        s.sheet.ri = 0;
        s.sheet.ci = 0;

        // 强制重绘
        if (s.reRender) {
          s.reRender();
        }
      }
    } catch (error) {
      console.log('Cell selection clear failed:', error);
    }
  }, 200);
}

// 存储列名映射关系
let columnMapping: { [originalIndex: number]: string } = {};

// 将Excel数据加载到x-data-spreadsheet中
async function loadExcelDataToSpreadsheet(workbook: any) {
  if (!spreadsheet.value || !workbook) {
    return;
  }

  try {
    // 获取第一个工作表的名称
    const firstSheetName = workbook.SheetNames[0];

    // 使用原始数据保持显示格式
    const rawData = loadRawWorkbookData(workbook);
    const firstSheet = rawData[0];

    // 同时获取处理后的列名映射
    const {
      columns: processedColumns,
      headerRows,
      columnGroups,
      headerRowCount
    } = loadSheetData(workbook, firstSheetName);

    console.log("headerRows", headerRows);

    // 存储表头行数据供后续使用
    currentHeaderRows.value = headerRows || [];

    // 建立列索引到处理后列名的映射
    columnMapping = {};
    processedColumns.forEach((col: string, index: number) => {
      columnMapping[index] = col;
    });

    console.log("Column mapping:", columnMapping);
    console.log("Raw sheet data:", firstSheet);
    console.log("Processed columns:", processedColumns);

    // 简单直接的表头级数判断
    const isMultiLevel = headerRows && headerRows.length > 1;
    console.log("表头级数判断:", {
      headerRowsLength: headerRows ? headerRows.length : 0,
      isMultiLevel: isMultiLevel
    });

    // 加载原始数据到表格（保持原始显示格式）
    spreadsheet.value.loadData([firstSheet]);

    // 使用通用函数取消选中
    clearCellSelection();

    // 数据加载完成后，延迟触发图表更新
    setTimeout(() => {
      getCurrentDataAndEmit();
    }, 300);
  } catch (error) {
    console.error("Error loading Excel data to spreadsheet:", error);
    throw error;
  }
}

// 初始化x-data-spreadsheet
function initSpreadsheet() {
  if (!spreadsheetRef.value) {
    return;
  }

  try {
    const options: any = {
      mode: "edit" as const,
      showToolbar: false,
      showGrid: true,
      showContextmenu: true,
      view: {
        height: () => window.innerHeight - 60,
        width: () => spreadsheetRef.value?.clientWidth || 400
      },
      row: {
        len: 150,
        height: 25
      },
      col: {
        len: 26,
        width: 100,
        indexWidth: 60,
        minWidth: 60
      },
      style: {
        bgcolor: "#ffffff",
        align: "left" as const,
        valign: "middle" as const,
        textwrap: false,
        strike: false,
        underline: false,
        color: "#0a0a0a",
        font: {
          name: "Helvetica" as const,
          size: 11,
          bold: false,
          italic: false
        }
      }
    };

    const s = new Spreadsheet(spreadsheetRef.value, options);
    spreadsheet.value = s;

    // 添加事件监听器，监听单元格编辑
    s.on("cell-edited", (text: string, ri: number, ci: number) => {
      console.log("Cell edited:", { text, ri, ci });
      
      let oldColumnName: string | undefined;
      
      // 如果编辑的是表头行（第0行），更新列映射
      if (ri === 0) {
        console.log("Header cell edited, updating column mapping");
        oldColumnName = columnMapping[ci]; // 保存旧的列名
        columnMapping[ci] = text || `Column${ci}`;
        console.log(`Column mapping updated: ${oldColumnName} -> ${columnMapping[ci]}`);
      }
      
      // 精准更新：发送具体的单元格变更信息
      const cellChangeInfo = {
        rowIndex: ri,
        columnIndex: ci,
        newValue: text,
        columnName: columnMapping[ci] || `Column${ci}`,
        timestamp: Date.now(),
        oldColumnName: oldColumnName // 传递旧列名，用于标签更新
      };
      
      // 延迟触发数据变化事件，确保数据已更新
      setTimeout(() => {
        getCurrentDataAndEmitWithCellChange(cellChangeInfo);
      }, 100);
    });

    // 添加单元格选中事件监听器 - 实现双向高亮联动
    s.on("cell-selected", (cell: any, ri: number, ci: number) => {
      console.log("Cell selected:", { cell, ri, ci });
      
      // 跳过表头行（第0行是表头）
      if (ri <= 0) {
        emit("cellSelected", null);
        return;
      }
      
      // 更新选中位置
      selectedCellPosition.value = { row: ri, col: ci };
      
      // ri就是原始Excel中的行索引（包含表头），直接使用
      const originalRowIndex = ri;
      
      // 获取列名
      const columnName = columnMapping[ci];
      if (!columnName) {
        emit("cellSelected", null);
        return;
      }
      
      // 发送选中信息给图表组件
      emit("cellSelected", {
        dataRowIndex: originalRowIndex, // 发送原始行索引
        columnIndex: ci,
        columnName,
        cellPosition: { row: ri, col: ci },
        cellValue: cell?.text || ""
      });
    });

    // 监听多个单元格选中（可选功能）
    s.on("cells-selected", (cell: any, range: { sri: number, sci: number, eri: number, eci: number }) => {
      console.log("Cells selected:", { cell, range });
      // 可以在这里处理多选情况
    });

    // 初始化空数据
    const emptySheet = {
      name: "Sheet1",
      freeze: "A1",
      styles: [],
      merges: [],
      rows: {},
      cols: {}
    };
    s.loadData([emptySheet]);

    // 使用通用函数取消选中
    clearCellSelection();
  } catch (error) {
    ElMessage.error("表格初始化失败");
  }
}

// 高亮指定单元格的方法
function highlightCell(originalRowIndex: number, columnName: string) {
  if (!spreadsheet.value) return;
  
  // 找到列索引
  const columnIndex = Object.keys(columnMapping).find(key => 
    columnMapping[parseInt(key)] === columnName
  );
  
  if (!columnIndex) {
    console.warn("Column not found:", columnName, "in mapping:", columnMapping);
    return;
  }
  
  // originalRowIndex已经是原始Excel中的行索引，直接使用
  const actualRowIndex = originalRowIndex;
  const actualColumnIndex = parseInt(columnIndex);
  
  console.log("Highlighting cell:", { 
    originalRowIndex, 
    actualRowIndex, 
    columnName,
    actualColumnIndex, 
    columnMapping 
  });
  
  try {
    // 获取表格实例
    const s = spreadsheet.value;
    if (!s || !s.sheet) {
      console.warn("Spreadsheet instance or sheet not available");
      return;
    }
    
    // 自动滚动到目标单元格
    scrollToCell(s, actualRowIndex, actualColumnIndex);
    
    // 设置选中的单元格
    if (s.sheet.selector) {
      s.sheet.selector.set(actualRowIndex, actualColumnIndex, actualRowIndex, actualColumnIndex);
      console.log("Cell selector set to:", { row: actualRowIndex, col: actualColumnIndex });
    } else {
      console.warn("Sheet selector not available");
    }
    
    // 更新选中位置
    selectedCellPosition.value = { row: actualRowIndex, col: actualColumnIndex };
    
    // 重新渲染表格
    if (s.reRender) {
      s.reRender();
    }
    
    // 添加到高亮集合
    const cellKey = `${actualRowIndex}-${actualColumnIndex}`;
    highlightedCells.value.add(cellKey);
    
    console.log("Cell highlighted successfully:", cellKey);
    
  } catch (error) {
    console.error("Error highlighting cell:", error);
  }
}

// 清除单元格高亮
function clearCellHighlight() {
  if (!spreadsheet.value) return;
  
  try {
    const s = spreadsheet.value;
    console.log('Clearing cell highlight - resetting to A1');
    
    // 直接重置到A1单元格
    if (s && s.sheet && s.sheet.selector && typeof s.sheet.selector.set === 'function') {
      s.sheet.selector.set(0, 0, 0, 0); // 重置到A1 (0,0)
      console.log('Selector reset to A1');
    }
    
    // 设置行列索引为A1
    if (s && s.sheet) {
      s.sheet.ri = 0;
      s.sheet.ci = 0;
      console.log('Sheet indices reset to A1');
    }
    
    // 清除选中位置
    selectedCellPosition.value = null;
    highlightedCells.value.clear();
    
    // 重新渲染
    if (s.reRender) {
      s.reRender();
    }
    
    console.log('Cell highlight cleared - reset to A1');
    
  } catch (error) {
    console.error("Error clearing cell highlight:", error);
  }
}

// 暴露方法给父组件
// @ts-ignore
defineExpose({
  highlightCell,
  clearCellHighlight
});

// 处理文件上传
async function handleFileChange(file: any) {
  try {
    const workbook = await processExcelFile(file.raw);
    if (workbook) {
      // 将Excel数据加载到x-data-spreadsheet中
      await loadExcelDataToSpreadsheet(workbook);
      emit("fileChange", workbook);

      ElMessage.success("Excel文件加载成功，图表将自动生成");
    }
  } catch (error) {
    ElMessage.error("文件处理失败，请检查文件格式");
  }
}

// 使用Excel处理器hooks
const { analyzeHeaderLevel, generateGroupsByHeaderLevel } = useExcelProcessor();

// 从表格获取当前数据并触发数据变化事件
function getCurrentDataAndEmit() {
  if (!spreadsheet.value) {
    console.log("No spreadsheet available");
    return null;
  }

  try {
    // 从x-data-spreadsheet获取数据
    const data = spreadsheet.value.getData();
    console.log("Spreadsheet data:", data);

    if (!data || !data[0] || !data[0].rows) {
      console.log("No valid data found in spreadsheet");
      return null;
    }

    const sheet = data[0];
    const allRows: any[] = [];

    // 使用列名映射获取处理后的列名，保留序号列
    const allProcessedColumns = Object.values(columnMapping).filter(
      col => col && col.trim() !== ""
    );
    const processedColumns = allProcessedColumns; // 保留所有列，包括序号列
    console.log("All processed columns:", allProcessedColumns);
    console.log("Processed columns (including first):", processedColumns);
    console.log("Column mapping:", columnMapping);

    // 确定数据开始的行数（跳过表头行）
    let dataStartRow = 1;

    // 如果有列名映射，说明是从Excel导入的，可能有多级表头
    if (Object.keys(columnMapping).length > 0) {
      // 查找第一个包含数字的行作为数据开始行
      for (let rowIndex = 1; rowIndex < 10; rowIndex++) {
        const row = sheet.rows[rowIndex];
        if (row && row.cells) {
          let hasNumber = false;
          Object.keys(row.cells).forEach(colIndex => {
            const cell = row.cells[colIndex];
            if (cell && cell.text && !isNaN(Number(cell.text))) {
              hasNumber = true;
            }
          });
          if (hasNumber) {
            dataStartRow = rowIndex;
            break;
          }
        }
      }
    }

    console.log("Data starts from row:", dataStartRow);

    // 获取数据行（排除序号列）
    Object.keys(sheet.rows).forEach(rowIndex => {
      const index = parseInt(rowIndex);
      if (index >= dataStartRow) {
        const row = sheet.rows[index];
        if (row && row.cells) {
          const rowData: any = {};
          let hasData = false;

          Object.keys(row.cells).forEach(colIndex => {
            const cell = row.cells[colIndex];
            const colIdx = parseInt(colIndex);
            const processedColName = columnMapping[colIdx];

            // 现在包括第一列（序号列），在useChartProcessor中再处理
            if (cell && cell.text && processedColName) {
              rowData[processedColName] = cell.text;
              hasData = true;
            }
          });

          // 只添加非空行
          if (hasData) {
            allRows.push(rowData);
          }
        }
      }
    });

    console.log("All extracted rows (including first column):", allRows);

    // 注意：统计行过滤现在在 useChartProcessor 中自动处理
    // 这里直接使用原始数据，过滤逻辑统一在图表生成时进行

    if (allRows.length > 0 && processedColumns.length > 0) {
      // 使用简化的表头级数判断
      const headerAnalysis = analyzeHeaderLevel(currentHeaderRows.value);
      console.log("表头分析结果:", headerAnalysis);

      // 生成分组数据
      const columnGroups = headerAnalysis.isMultiLevel
        ? generateGroupsByLastLevel(processedColumns)
        : { "All Data": processedColumns };

      const chartData = {
        rows: allRows,
        columns: processedColumns,
        columnGroups: columnGroups,
        columnMapping: columnMapping, // 添加列映射
        headerRowCount: currentHeaderRows.value.length // 添加表头行数
      };
      console.log("Emitting chart data with groups:", chartData);
      emit("dataChange", chartData);
      return chartData; // 返回数据用于精准更新
    } else {
      console.log("No valid data to emit:", {
        rowsLength: allRows.length,
        columnsLength: processedColumns.length
      });
      return null;
    }
  } catch (error) {
    console.error("Error extracting data from spreadsheet:", error);
    return null;
  }
}

// 精准单元格变更处理函数
function getCurrentDataAndEmitWithCellChange(cellChangeInfo: CellChangeInfo) {
  if (!spreadsheet.value) {
    console.log("No spreadsheet available");
    return;
  }

  try {
    // 检测是否为结构性变化
    const isStructuralChange = detectStructuralChange(cellChangeInfo);
    
    if (isStructuralChange) {
      console.log("Detected structural change, forcing full chart regeneration");
      // 对于结构性变化，只进行完全重新生成
      getCurrentDataAndEmit();
      return;
    }

    // 获取完整数据（用于图表完整性）
    const fullData = getCurrentDataAndEmit();
    
    // 发送精准变更信息
    emit("cellChange", {
      cellChange: cellChangeInfo,
      fullData: fullData
    });

    console.log("Precise cell change emitted:", cellChangeInfo);
  } catch (error) {
    console.error("Error in precise cell change handling:", error);
    // 降级到全量更新
    getCurrentDataAndEmit();
  }
}

// 检测结构性变化的函数
function detectStructuralChange(cellChangeInfo: CellChangeInfo): boolean {
  const { rowIndex, columnIndex, newValue } = cellChangeInfo;
  
  // 1. 对于表头行的修改，不视为结构性变化，让精准更新来处理标签更新
  if (rowIndex === 0) {
    console.log("Header row changed - will be handled by label update, not structural change");
    return false; // 改为 false，让精准更新处理
  }
  
  // 2. 检查是否新增了列（列索引超出当前映射范围）
  const maxColumnIndex = Math.max(...Object.keys(columnMapping).map(k => parseInt(k)));
  if (columnIndex > maxColumnIndex) {
    console.log("New column detected - column addition");
    // 自动添加新列到映射中
    columnMapping[columnIndex] = `Column${columnIndex}`;
    return true;
  }
  
  // 3. 检查新值是否为空但之前有值（可能删除列或重大结构变化）
  const currentColumnName = columnMapping[columnIndex];
  if (!newValue || newValue.trim() === '') {
    // 对于数据行的清空，不视为结构性变化
    if (rowIndex > 0) {
      return false;
    }
  }
  
  // 4. 检查是否在使用中的数据区域添加了新的有效数据
  if (rowIndex > 0 && newValue && newValue.trim() !== '') {
    // 检查这是否是一个新的数据列的第一个有效值
    const hasExistingData = Object.keys(spreadsheet.value?.sheet?.rows || {})
      .some(rIndex => {
        const r = parseInt(rIndex);
        if (r > 0 && r !== rowIndex) {
          const row = spreadsheet.value?.sheet?.rows[r];
          return row?.cells?.[columnIndex]?.text?.trim();
        }
        return false;
      });
    
    if (!hasExistingData && !currentColumnName) {
      console.log("New data column detected");
      return true;
    }
  }
  
  return false;
}

// 按最后一级分组的辅助函数（多级表头时使用）
function generateGroupsByLastLevel(columns: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  
  columns.forEach(column => {
    // 获取最后一级（最后一个'-'后的部分）
    const parts = column.split('-');
    const lastLevel = parts[parts.length - 1];
    
    if (!groups[lastLevel]) {
      groups[lastLevel] = [];
    }
    groups[lastLevel].push(column);
  });
  
  console.log('按最后一级分组的列名:', groups);
  return groups;
}

// 自动滚动到指定单元格的辅助函数
function scrollToCell(spreadsheetInstance: any, rowIndex: number, columnIndex: number) {
  if (!spreadsheetInstance || !spreadsheetInstance.sheet) return;
  
  try {
    console.log("开始滚动到单元格:", { rowIndex, columnIndex });
    
    const sheet = spreadsheetInstance.sheet;
    
    // 获取表格配置信息
    const rowHeight = sheet.table?.rowHeight || 25;
    const colWidth = sheet.table?.colWidth || 100;
    const viewHeight = sheet.viewHeight || (window.innerHeight - 60);
    const viewWidth = sheet.viewWidth || (spreadsheetInstance.el?.clientWidth || 800);
    
    console.log("表格配置信息:", { rowHeight, colWidth, viewHeight, viewWidth });
    
    // 使用 x-data-spreadsheet 内置滚动条方法
    if (sheet.verticalScrollbar && sheet.horizontalScrollbar) {
      // 先调试滚动条对象结构
      console.log("滚动条对象调试:", {
        verticalScrollbar: {
          scroll: sheet.verticalScrollbar.scroll,
          scrollTop: sheet.verticalScrollbar.scrollTop,
          top: sheet.verticalScrollbar.top,
          y: sheet.verticalScrollbar.y,
          keys: Object.keys(sheet.verticalScrollbar)
        },
        horizontalScrollbar: {
          scroll: sheet.horizontalScrollbar.scroll,
          scrollLeft: sheet.horizontalScrollbar.scrollLeft,
          left: sheet.horizontalScrollbar.left,
          x: sheet.horizontalScrollbar.x,
          keys: Object.keys(sheet.horizontalScrollbar)
        }
      });
      
      // 计算目标位置
      const targetRowPosition = rowIndex * rowHeight;
      const targetColPosition = columnIndex * colWidth;
      
      // 尝试多种方式获取当前滚动位置
      let currentVerticalScroll = 0;
      let currentHorizontalScroll = 0;
      
      // 方式1: 直接从scroll属性
      if (typeof sheet.verticalScrollbar.scroll === 'number') {
        currentVerticalScroll = sheet.verticalScrollbar.scroll;
      }
      // 方式2: 从scrollTop属性
      else if (typeof sheet.verticalScrollbar.scrollTop === 'number') {
        currentVerticalScroll = sheet.verticalScrollbar.scrollTop;
      }
      // 方式3: 从top属性
      else if (typeof sheet.verticalScrollbar.top === 'number') {
        currentVerticalScroll = sheet.verticalScrollbar.top;
      }
      
      // 横向滚动位置
      if (typeof sheet.horizontalScrollbar.scroll === 'number') {
        currentHorizontalScroll = sheet.horizontalScrollbar.scroll;
      }
      // 方式2: 从scrollLeft属性  
      else if (typeof sheet.horizontalScrollbar.scrollLeft === 'number') {
        currentHorizontalScroll = sheet.horizontalScrollbar.scrollLeft;
      }
      // 方式3: 从left属性
      else if (typeof sheet.horizontalScrollbar.left === 'number') {
        currentHorizontalScroll = sheet.horizontalScrollbar.left;
      }
      
      console.log("当前滚动位置调试:", { 
        currentVerticalScroll,
        currentHorizontalScroll,
        targetRowPosition,
        targetColPosition
      });
      
      // 计算需要的滚动距离
      // 纵向滚动：让目标行在可视区域中央
      const targetVerticalScroll = Math.max(0, targetRowPosition - viewHeight / 2);
      const verticalDistance = targetVerticalScroll - currentVerticalScroll;
      
      // 横向滚动：让目标列在可视区域中央  
      const targetHorizontalScroll = Math.max(0, targetColPosition - viewWidth / 2);
      const horizontalDistance = targetHorizontalScroll - currentHorizontalScroll;
      
      console.log("计算滚动距离:", { 
        verticalDistance, 
        horizontalDistance,
        targetVerticalScroll,
        targetHorizontalScroll,
        isVerticalNaN: isNaN(verticalDistance),
        isHorizontalNaN: isNaN(horizontalDistance)
      });
      
      // 执行滚动 - 确保距离不是 NaN
      if (!isNaN(verticalDistance) && Math.abs(verticalDistance) > 1) {
        console.log("执行纵向滚动:", verticalDistance);
        if (sheet.verticalScrollbar.moveFn) {
          sheet.verticalScrollbar.moveFn(verticalDistance);
        }
      } else {
        console.log("跳过纵向滚动:", { verticalDistance, isNaN: isNaN(verticalDistance) });
      }
      
      if (!isNaN(horizontalDistance) && Math.abs(horizontalDistance) > 1) {
        console.log("执行横向滚动:", horizontalDistance);
        if (sheet.horizontalScrollbar.moveFn) {
          sheet.horizontalScrollbar.moveFn(horizontalDistance);
        }
      } else {
        console.log("跳过横向滚动:", { horizontalDistance, isNaN: isNaN(horizontalDistance) });
      }
      
      console.log("使用内置滚动条方法完成滚动");
    }
    
    // 强制重新渲染以确保显示更新
    setTimeout(() => {
      if (spreadsheetInstance.reRender) {
        spreadsheetInstance.reRender();
      }
    }, 100);
    
  } catch (error) {
    console.error("滚动到单元格时出错:", error);
  }
}

// 加载示例数据
function loadSampleData() {
  const sampleData = {
    rows: [
      {
        "Device1-X": "1.234",
        "Device1-Y": "2.345",
        "Device2-X": "1.456",
        "Device2-Y": "2.567"
      },
      {
        "Device1-X": "1.345",
        "Device1-Y": "2.456",
        "Device2-X": "1.567",
        "Device2-Y": "2.678"
      },
      {
        "Device1-X": "1.456",
        "Device1-Y": "2.567",
        "Device2-X": "1.678",
        "Device2-Y": "2.789"
      },
      {
        "Device1-X": "1.567",
        "Device1-Y": "2.678",
        "Device2-X": "1.789",
        "Device2-Y": "2.890"
      },
      {
        "Device1-X": "1.678",
        "Device1-Y": "2.789",
        "Device2-X": "1.890",
        "Device2-Y": "2.901"
      }
    ],
    columns: ["Device1-X", "Device1-Y", "Device2-X", "Device2-Y"]
  };

  // 设置列名映射（包括序号列）
  columnMapping = {
    0: "序号", // 第一列序号，但在图表数据中会被排除
    1: "Device1-X",
    2: "Device1-Y",
    3: "Device2-X",
    4: "Device2-Y"
  };

  // 设置示例数据的表头行（模拟单级表头）
  currentHeaderRows.value = [["序号", "Device1-X", "Device1-Y", "Device2-X", "Device2-Y"]];
  
  // 使用简化的表头级数判断
  const headerAnalysis = analyzeHeaderLevel(currentHeaderRows.value);
  console.log("示例数据表头分析:", headerAnalysis);

  // 将示例数据加载到x-data-spreadsheet中
  if (spreadsheet.value) {
    const sheetData: any = {
      name: "Sheet1",
      freeze: "A1",
      styles: [],
      merges: [],
      rows: {
        // 表头行
        0: {
          cells: {
            0: { text: "序号" },
            1: { text: "Device1-X" },
            2: { text: "Device1-Y" },
            3: { text: "Device2-X" },
            4: { text: "Device2-Y" }
          }
        }
      },
      cols: {}
    };

    // 添加数据行
    sampleData.rows.forEach((row, rowIndex) => {
      sheetData.rows[rowIndex + 1] = {
        cells: {
          0: { text: String(rowIndex + 1) }, // 序号列
          1: { text: row["Device1-X"] },
          2: { text: row["Device1-Y"] },
          3: { text: row["Device2-X"] },
          4: { text: row["Device2-Y"] }
        }
      };
    });

    spreadsheet.value.loadData([sheetData]);

    // 使用通用函数取消选中
    clearCellSelection();

    // 数据加载完成后，延迟触发图表更新
    setTimeout(() => {
      getCurrentDataAndEmit();
    }, 300);

    ElMessage.success("示例数据已加载，图表将自动生成");
  }
}

// 清空所有数据
function clearAllData() {
  // 重置列名映射
  columnMapping = {};
  
  // 清空表头行数据
  currentHeaderRows.value = [];

  if (spreadsheet.value) {
    const emptySheet = {
      name: "Sheet1",
      freeze: "A1",
      styles: [],
      merges: [],
      rows: {},
      cols: {}
    };
    spreadsheet.value.loadData([emptySheet]);

    // 使用通用函数取消选中
    clearCellSelection();
  }

  emit("clearData");
  ElMessage.success("数据已清空");
}

// 生命周期
onMounted(() => {
  setTimeout(() => {
    initSpreadsheet();
    
    // 初始化完成后自动加载示例数据
    setTimeout(() => {
      loadSampleData();
    }, 500);
  }, 100);
});

// onUnmounted(() => {
//   // 清理监听器
//   window.removeEventListener('resize', resizeSpreadsheet)
// })
</script>

<style scoped lang="less">
.excel-editor {
  height: 100vh;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  background: white;
  overflow: hidden;
}

.toolbar {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid #e4e7ed;
  background-color: #fafafa;
  flex-shrink: 0;
  width: 100%;
  overflow: hidden;
}

.spreadsheet-container {
  flex: 1;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  background: white;
}

// x-data-spreadsheet样式覆盖
:deep(.x-spreadsheet) {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  height: 100% !important;
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
}

:deep(.x-spreadsheet-toolbar) {
  display: none;
}

:deep(.x-spreadsheet-table) {
  width: 100% !important;
  max-width: 100% !important;
  overflow: hidden !important;
}
</style>
