import type * as XLSX from 'xlsx'
import type { TableMerge } from '../types'

/**
 * 表格合并单元格处理逻辑
 */
export function useTableMerge(): TableMerge {
  /**
   * 检查单元格是否被合并
   */
  function isCellMerged(row: number, col: number, merges: XLSX.Range[]): boolean {
    for (const m of merges) {
      if (row >= m.s.r && row <= m.e.r && col >= m.s.c && col <= m.e.c) {
        if (row !== m.s.r || col !== m.s.c) return true
      }
    }
    return false
  }

  /**
   * 获取行跨度
   */
  function getRowSpan(row: number, col: number, merges: XLSX.Range[]): number {
    for (const m of merges) {
      if (m.s.r === row && m.s.c === col) {
        return m.e.r - m.s.r + 1
      }
    }
    return 1
  }

  /**
   * 获取列跨度
   */
  function getColSpan(row: number, col: number, merges: XLSX.Range[]): number {
    for (const m of merges) {
      if (m.s.r === row && m.s.c === col) {
        return m.e.c - m.s.c + 1
      }
    }
    return 1
  }

  return {
    isCellMerged,
    getRowSpan,
    getColSpan
  }
}
