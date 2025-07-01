declare module 'x-data-spreadsheet' {
  interface SpreadsheetOptions {
    mode?: string
    showToolbar?: boolean
    showGrid?: boolean
    showContextmenu?: boolean
    view?: {
      height?: () => number
      width?: () => number
    }
    row?: {
      len?: number
      height?: number
    }
    col?: {
      len?: number
      width?: number
      indexWidth?: number
      minWidth?: number
    }
    style?: {
      bgcolor?: string
      align?: string
      valign?: string
      textwrap?: boolean
      strike?: boolean
      underline?: boolean
      color?: string
      font?: {
        name?: string
        size?: number
        bold?: boolean
        italic?: boolean
      }
    }
  }

  interface CellData {
    text?: string
    style?: number
  }

  interface RowData {
    cells: { [colIndex: number]: CellData }
  }

  interface MergeRange {
    s: { r: number; c: number }
    e: { r: number; c: number }
  }

  interface SheetData {
    name: string
    freeze?: string
    styles: any[]
    merges: string[]  // 修改为字符串数组格式，如 ["A1:B2", "C1:D1"]
    rows: { [rowIndex: number]: RowData }
    cols: any
  }

  class Spreadsheet {
    constructor(container: HTMLElement, options?: SpreadsheetOptions)
    loadData(data: SheetData[]): void
    getData(): SheetData[]
    on(event: 'cell-edited', callback: (text: string, ri: number, ci: number) => void): void
    on(event: 'cell-selected', callback: (cell: any, ri: number, ci: number) => void): void
    on(event: 'cells-selected', callback: (cell: any, range: { sri: number, sci: number, eri: number, eci: number }) => void): void
    on(event: string, callback: Function): void
  }

  export default Spreadsheet
}

declare module 'x-data-spreadsheet/dist/spreadsheet.css'
