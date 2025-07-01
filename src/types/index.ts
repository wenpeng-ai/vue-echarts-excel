import type * as XLSX from 'xlsx'

// Excel相关类型
export interface WorksheetData {
  headerRows: string[][]
  columns: string[]
  rows: RowData[]
  merges: XLSX.Range[]
  columnGroups: Record<string, string[]>
  headerRowCount: number // 添加表头行数
}

export interface RowData {
  [key: string]: string | number | undefined
}

// 图表相关类型
export interface ChartSeriesData {
  value: [number, number]
  类型: string
  原始值?: string | number // 保存原始值用于精确显示
  值: number
  fixedXValue?: number // 固定的X抖动值
  rowIndex?: number // 图表数据中的行索引（处理后）
  originalRowIndex?: number // 原始Excel中的行索引（包含表头偏移）
  columnIndex?: number // 列索引
}

export interface ChartOptions {
  xChartOption: any
  yChartOption: any
}

export interface DeviceDataMap {
  [deviceType: string]: number[]
}

// 合并单元格类型
export interface MergeRange {
  s: { r: number; c: number }
  e: { r: number; c: number }
}

// 表头级数分析结果
export interface HeaderLevelAnalysis {
  isMultiLevel: boolean;
  levelCount: number;
  description: string;
}

// Excel处理器返回类型
export interface ExcelProcessor {
  processExcelFile: (file: File) => Promise<XLSX.WorkBook>
  loadSheetData: (workbook: XLSX.WorkBook, sheetName: string) => WorksheetData
  loadRawSheetData: (workbook: XLSX.WorkBook, sheetName: string) => any
  loadRawWorkbookData: (workbook: XLSX.WorkBook) => any[]
  analyzeHeaderLevel: (headerRows: string[][]) => HeaderLevelAnalysis
  generateGroupsByHeaderLevel: (columns: string[], rows: RowData[], isMultiLevel: boolean) => Record<string, any[]>
}

// 图表处理器返回类型
export interface ChartProcessor {
  processChartData: (rows: RowData[], columns: string[], headerRowCount?: number) => any | null
  processGroupedChartData: (rows: RowData[], columnGroups: Record<string, string[]>, headerRowCount?: number) => Record<string, any> | null
}

// 表格合并处理器返回类型
export interface TableMerge {
  isCellMerged: (row: number, col: number, merges: XLSX.Range[]) => boolean
  getRowSpan: (row: number, col: number, merges: XLSX.Range[]) => number
  getColSpan: (row: number, col: number, merges: XLSX.Range[]) => number
}
