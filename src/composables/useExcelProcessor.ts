import * as XLSX from 'xlsx'
import type { WorksheetData, ExcelProcessor, HeaderLevelAnalysis } from '../types'

/**
 * Excel文件处理相关逻辑
 */
export function useExcelProcessor(): ExcelProcessor {
  /**
   * 检测表头行数
   */
  function detectHeaderRowCount(worksheet: XLSX.WorkSheet, range: XLSX.Range): number {
    let headerRowCount = 1
    
    for (let R = range.s.r; R <= range.e.r; ++R) {
      let emptyCount = 0
      let hasNumber = false
      
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })]
        
        if (!cell || cell.v === undefined || cell.v === null || cell.v === '') {
          emptyCount++
        }
        
        if (cell && typeof cell.v === 'number') {
          hasNumber = true
        }
      }
      
      // 整行为空则停止
      if (emptyCount === range.e.c - range.s.c + 1) break
      
      // 有数字则停止，表示数据行开始
      if (hasNumber) break
      
      headerRowCount = R - range.s.r + 1
    }
    
    return headerRowCount
  }

  /**
   * 生成多级表头列名
   * 优化逻辑：
   * 1. 正确处理合并单元格情况，向左查找有效值
   * 2. 按层级顺序组合列名，例如：'机械手-X', '机械手-Y'
   * 3. 确保列名唯一性，避免重复
   * 4. 处理空值情况，提供备用列名
   */
  function generateColumns(headerRows: string[][]): string[] {
    const colCount = headerRows[0].length
    const columns: string[] = []
    
    for (let c = 0; c < colCount; ++c) {
      const colParts: string[] = []
      let lastValidValue = ''
      
      for (let r = 0; r < headerRows.length; ++r) {
        const cell = headerRows[r][c]
        
        if (cell && cell.trim() !== '') {
          // 当前单元格有值
          colParts.push(cell.trim())
          lastValidValue = cell.trim()
        } else {
          // 当前单元格为空，需要查找合并单元格的值
          let foundValue = ''
          
          // 向左查找同一行的有效值（处理合并单元格）
          for (let leftC = c - 1; leftC >= 0; leftC--) {
            const leftCell = headerRows[r][leftC]
            if (leftCell && leftCell.trim() !== '') {
              foundValue = leftCell.trim()
              break
            }
          }
          
          // 如果找到了值，并且这个值在当前列还没有被使用过
          if (foundValue && !colParts.includes(foundValue)) {
            colParts.push(foundValue)
          }
        }
      }
      
      // 生成最终的列名
      let colName = colParts.join('-')
      
      // 如果列名为空，使用列索引作为备用名称
      if (!colName) {
        colName = `Column${c + 1}`
      }
      
      // 确保列名唯一性
      let finalColName = colName
      let counter = 1
      while (columns.includes(finalColName)) {
        finalColName = `${colName}_${counter}`
        counter++
      }
      
      columns.push(finalColName)
    }
    console.log('生成的列名:', columns)
    return columns
  }

  /**
   * 根据多级表头的最后一级进行分组
   * 例如：机械手-X、机械手-Y 会被分为 X组 和 Y组
   */
  function groupColumnsByLastLevel(columns: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {}
    
    columns.forEach(column => {
      // 获取最后一级（最后一个'-'后的部分）
      const parts = column.split('-')
      const lastLevel = parts[parts.length - 1]
      
      if (!groups[lastLevel]) {
        groups[lastLevel] = []
      }
      groups[lastLevel].push(column)
    })
    
    console.log('按最后一级分组的列名:', groups)
    return groups
  }

  /**
   * 处理Excel文件
   */
  function processExcelFile(file: File): Promise<XLSX.WorkBook> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          resolve(workbook)
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * 加载工作表数据
   */
  function loadSheetData(workbook: XLSX.WorkBook, sheetName: string): WorksheetData {
    const worksheet = workbook.Sheets[sheetName]
    const merges = worksheet['!merges'] || []
    const range = XLSX.utils.decode_range(worksheet['!ref']!)
    
    const headerRowCount = detectHeaderRowCount(worksheet, range)
    
    // 提取表头
    const headerRows: string[][] = []
    for (let R = range.s.r; R < range.s.r + headerRowCount; ++R) {
      const row: string[] = []
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })]
        row.push(cell ? String(cell.v) : '')
      }
      headerRows.push(row)
    }

    // 生成列名和数据行
    const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
    const dataRows = allRows.slice(headerRowCount)
    const columns = generateColumns(headerRows)
    console.log('生成的列名:', columns)
    // 转换为对象数组
    const rows = dataRows.map(rowArr => {
      const rowObj: Record<string, any> = {}
      columns.forEach((col, idx) => {
        rowObj[col] = rowArr[idx]
      })
      return rowObj
    })

    return {
      headerRows,
      columns,
      rows,
      merges,
      columnGroups: groupColumnsByLastLevel(columns),
      headerRowCount
    }
  }



  /**
   * 加载原始Excel数据（保持原有格式，专注于数据和合并单元格）
   */
  function loadRawSheetData(workbook: XLSX.WorkBook, sheetName: string): any {
    const worksheet = workbook.Sheets[sheetName]
    
    // 初始化基本的sheet数据结构
    const sheetData: any = {
      name: sheetName,
      freeze: 'A1',
      styles: [],
      merges: [],
      rows: {},
      cols: {}
    }
    
    // 检查工作表是否有数据
    if (!worksheet || !worksheet['!ref']) {
      return sheetData
    }
    
    try {
      const range = XLSX.utils.decode_range(worksheet['!ref'])
      const merges = worksheet['!merges'] || []
      
      // 处理合并单元格信息
      if (merges && merges.length > 0) {
        sheetData.merges = merges.map((merge: any) => {
          const startCell = XLSX.utils.encode_cell({ r: merge.s.r, c: merge.s.c })
          const endCell = XLSX.utils.encode_cell({ r: merge.e.r, c: merge.e.c })
          return `${startCell}:${endCell}`
        })
      }
      
      // 处理列宽信息
      if (worksheet['!cols']) {
        worksheet['!cols'].forEach((col: any, index: number) => {
          if (col && col.wpx) {
            sheetData.cols[index] = {
              width: Math.round(col.wpx)
            }
          }
        })
      }
      
      // 遍历所有单元格，保持完整数据
      for (let R = range.s.r; R <= range.e.r; ++R) {
        // 确保行结构存在
        if (!sheetData.rows[R]) {
          sheetData.rows[R] = { cells: {} }
        }
        
        // 处理行高
        if (worksheet['!rows'] && worksheet['!rows'][R] && worksheet['!rows'][R].hpx) {
          sheetData.rows[R].height = Math.round(worksheet['!rows'][R].hpx!)
        }
        
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
          const cell = worksheet[cellAddress]
          
          if (cell) {
            const cellData: any = {}
            
            // 处理单元格值
            if (cell.v !== undefined && cell.v !== null) {
              // 根据单元格类型格式化值
              if (cell.t === 'n') {
                // 数字类型
                if (cell.w) {
                  cellData.text = cell.w // 使用格式化后的显示值
                } else {
                  cellData.text = String(cell.v)
                }
              } else if (cell.t === 'b') {
                // 布尔类型
                cellData.text = cell.v ? 'TRUE' : 'FALSE'
              } else if (cell.t === 'd') {
                // 日期类型
                cellData.text = cell.w || cell.v.toLocaleDateString()
              } else {
                // 文本和其他类型
                cellData.text = String(cell.v)
              }
            }
            
            // 处理合并单元格
            const containingMerge = merges.find((merge: any) => {
              return R >= merge.s.r && R <= merge.e.r &&
                     C >= merge.s.c && C <= merge.e.c
            })
            
            if (containingMerge) {
              const isMainCell = R === containingMerge.s.r && C === containingMerge.s.c
              if (isMainCell) {
                // 主单元格设置合并信息
                const rowSpan = containingMerge.e.r - containingMerge.s.r
                const colSpan = containingMerge.e.c - containingMerge.s.c
                if (rowSpan > 0 || colSpan > 0) {
                  cellData.merge = [rowSpan, colSpan]
                }
                sheetData.rows[R].cells[C] = cellData
              }
              // 被合并的单元格不设置数据
            } else {
              // 普通单元格
              if (cellData.text !== undefined) {
                sheetData.rows[R].cells[C] = cellData
              }
            }
          }
        }
      }
      
    } catch (error) {
      return sheetData
    }
    
    return sheetData
  }

  /**
   * 加载完整工作簿的原始数据
   */
  function loadRawWorkbookData(workbook: XLSX.WorkBook): any[] {
    const sheetsData: any[] = []
    
    workbook.SheetNames.forEach(sheetName => {
      const sheetData = loadRawSheetData(workbook, sheetName)
      sheetsData.push(sheetData)
    })
    return sheetsData
  }

  /**
   * 简化的表头级数判断
   * 基于当前简化逻辑：headerRows.length > 1 即为多级
   */
  function analyzeHeaderLevel(headerRows: string[][]): {
    isMultiLevel: boolean;
    levelCount: number;
    description: string;
  } {
    if (!headerRows || headerRows.length === 0) {
      return {
        isMultiLevel: false,
        levelCount: 0,
        description: '无表头数据'
      };
    }

    const levelCount = headerRows.length;
    const isMultiLevel = levelCount > 1;

    return {
      isMultiLevel,
      levelCount,
      description: isMultiLevel ? `${levelCount}级表头` : '单级表头'
    };
  }

  /**
   * 根据表头级数生成分组数据
   * 单级表头：所有数据作为一个分组
   * 多级表头：按最后一级分组
   */
  function generateGroupsByHeaderLevel(
    columns: string[],
    rows: Record<string, any>[],
    isMultiLevel: boolean
  ): Record<string, any[]> {
    if (!isMultiLevel) {
      // 单级表头：所有数据作为一个分组
      return {
        'All Data': rows.map(row => {
          const dataPoint: Record<string, any> = {};
          columns.forEach(col => {
            dataPoint[col] = row[col];
          });
          return dataPoint;
        })
      };
    } else {
      // 多级表头：按最后一级分组，返回列名分组
      return groupColumnsByLastLevel(columns);
    }
  }

  return {
    processExcelFile,
    loadSheetData,
    loadRawSheetData,
    loadRawWorkbookData,
    analyzeHeaderLevel,
    generateGroupsByHeaderLevel
  }
}
