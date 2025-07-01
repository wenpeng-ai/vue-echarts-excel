import { prepareBoxplotData } from "echarts/extension/dataTool";
import type {
  RowData,
  ChartOptions,
  ChartProcessor,
  DeviceDataMap,
  ChartSeriesData,
} from "../types";
import Decimal from "decimal.js";

/**
 * 计算数组的统计值
 */
function calculateStatistics(values: number[]) {
  const sortedValues = [...values].sort((a, b) => a - b);
  const n = sortedValues.length;
  
  const min = sortedValues[0];
  const max = sortedValues[n - 1];
  const mean = values.reduce((sum, val) => sum + val, 0) / n;
  
  // 计算中位数
  const median = n % 2 === 0 
    ? (sortedValues[Math.floor(n / 2) - 1] + sortedValues[Math.floor(n / 2)]) / 2 
    : sortedValues[Math.floor(n / 2)];
  
  return { min, max, mean, median };
}

/**
 * 图表数据处理相关逻辑
 */
export function useChartProcessor(): ChartProcessor {

  /**
   * 过滤非数据行（统计行）并去除序号列
   */
  function filterDataRows(rows: RowData[], columns: string[]): { rows: RowData[], columns: string[] } {
    const statsKeywords = [
      "最大值", "最小值", "误差", "平均值", "标准差", 
      "方差", "中位数", "众数", "四分位数", "极差",
      "max", "min", "mean", "avg", "std", "variance",
      "median", "mode", "range", "error", "偏差",
      "总计", "合计", "汇总", "统计", "小计"
    ];
    
    // 首先过滤统计行
    const filteredRows = rows.filter((row, index) => {
      // 检查行中的所有值是否包含统计关键词
      const hasStatsKeyword = Object.values(row).some(value => {
        if (value === null || value === undefined) return false;
        const cellStr = String(value).trim();
        return statsKeywords.some(keyword => 
          cellStr === keyword || cellStr.includes(keyword)
        );
      });
      
      // 检查是否为空行
      const isEmpty = Object.values(row).every(cell => 
        cell === null || cell === undefined || String(cell).trim() === ""
      );
      
      // 检查是否有有效数字（检查数值列）
      const hasValidNumbers = columns.some(col => {
        const value = row[col];
        if (value === null || value === undefined) return false;
        const numValue = Number(value);
        return !isNaN(numValue) && isFinite(numValue);
      });
      
      return !hasStatsKeyword && !isEmpty && hasValidNumbers;
    });
    
    // 只有当列名明确是"序号"时才去除
    let columnToRemove: string | null = null;
    
    // 查找列名为"序号"的列
    const sequenceColumn = columns.find(col => col.trim() === '序号');
    if (sequenceColumn) {
      columnToRemove = sequenceColumn;
    }
    
    // 从列列表中移除序号列
    const filteredColumns = columnToRemove ? columns.filter(col => col !== columnToRemove) : columns;
    
    // 从每一行中移除序号列
    const finalRows = filteredRows.map(row => {
      if (!columnToRemove) return row;
      
      const newRow = { ...row };
      delete newRow[columnToRemove];
      return newRow;
    });
    
    return { rows: finalRows, columns: filteredColumns };
  }

  /**
   * 提取设备类型
   */
  function extractDeviceTypes(columns: string[], coordinate: string): string[] {
    const targetColumns = columns.filter((col) => col.includes(coordinate));
    const deviceTypes: string[] = [];

    targetColumns.forEach((col) => {
      const parts = col.split("-");
      if (parts.length >= 2) {
        const deviceType = parts[0].trim();
        if (deviceType && !deviceTypes.includes(deviceType)) {
          deviceTypes.push(deviceType);
        }
      }
    });

    return deviceTypes;
  }

  /**
   * 提取坐标数据
   */
  function extractCoordinateData(
    rows: RowData[],
    columns: string[],
  ): DeviceDataMap {
    const dataMap: DeviceDataMap = {};

    columns.forEach((deviceType) => {
      const values: number[] = [];

      rows.forEach((row, rowIndex) => {
        const cellValue = row[deviceType];
        
        // 更严格的数值验证
        if (cellValue !== null && cellValue !== undefined) {
          const stringValue = String(cellValue).trim();
          
          // 跳过空字符串和非数字字符串
          if (stringValue !== "" && !isNaN(Number(stringValue))) {
            const numValue = Number(stringValue);
            
            // 确保是有限数字（排除 Infinity 和 NaN）
            if (isFinite(numValue)) {
              values.push(numValue);
            }
          }
        }
      });

      if (values.length > 0) {
        dataMap[deviceType] = values;
      } else {
        console.warn(`警告: ${deviceType} 列没有有效的数值数据`);
      }
    });

    return dataMap;
  }

  /**
   * 创建散点图系列数据 - 使用固定抖动算法
   */
  function createScatterSeries(
    rows: RowData[],
    columns: string[],
    colors: string[],
    headerRowCount: number = 1 // 添加表头行数参数，默认为1
  ): any[] {
    const scatterSeries: any[] = [];

    columns.forEach((column, index) => {
      const scatterData: ChartSeriesData[] = [];

      rows.forEach((row, rowIndex) => {
        const cellValue = row[column];
        
        // 使用与 extractCoordinateData 相同的严格验证
        if (cellValue !== null && cellValue !== undefined) {
          const stringValue = String(cellValue).trim();
          
          if (stringValue !== "" && !isNaN(Number(stringValue))) {
            const numValue = Number(stringValue);
            
            if (isFinite(numValue)) {
              // 🔒 使用固定的抖动算法，基于列索引和行索引
              // 这样每个数据点的抖动值总是相同的
              const seed = index * 12345 + rowIndex * 6789;
              const pseudoRandom = Math.sin(seed) * 10000;
              const jitter = (pseudoRandom - Math.floor(pseudoRandom) - 0.5) * 0.4;

              scatterData.push({
                value: [index + jitter, numValue],
                类型: column,
                原始值: cellValue, // 保存原始值用于精确计算
                值: numValue,
                // 🔒 保存固定的抖动值供后续精准更新使用
                fixedXValue: index + jitter,
                rowIndex: rowIndex, // 图表数据中的行索引（处理后）
                originalRowIndex: rowIndex + headerRowCount, // 原始Excel中的行索引（包含表头偏移）
                columnIndex: index  // 保存列索引用于定位
              });
            }
          }
        }
      });

      // 根据样本数量动态调整散点大小
      const sampleCount = scatterData.length;
      let symbolSize = 8; // 默认大小
      if (sampleCount > 100) {
        symbolSize = 2; // 样本数超过100时使用小散点
      } else if (sampleCount > 50) {
        symbolSize = 4; // 样本数超过50时使用中等散点
      }

      scatterSeries.push({
        name: `${column}散点`,
        type: "scatter",
        data: scatterData,
        symbolSize: symbolSize,
        z: 2, // 设置散点图的层级高于箱线图
        itemStyle: {
          color: colors[index % colors.length],
          opacity: 0.7,
        },
        emphasis: {
          // hover时的样式
          itemStyle: {
            color: colors[index % colors.length],
            opacity: 1,
            borderColor: '#fff',
            borderWidth: 2,
          },
          z: 10, // hover时提升到最高层级
        },
        tooltip: {
          formatter: (param: any) => {
            const data = param.data;
            // 使用原始值显示更精确的数据
            const originalValue = data.原始值;
            return `<div style="color: #333;">类型: ${data.类型}<br/>值: ${originalValue}`;
          },
        },
      });
    });

    return scatterSeries;
  }

  /**
   * 生成图表配置
   */
  function createChartOption(columns: string[], dataMap: DeviceDataMap, scatterSeries: any[]) {
    const allValues = Object.values(dataMap).flat() as number[];
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.1;
    
    // 重要：确保盒须图数据和列的对应关系正确
    const boxDataValues = columns.map(column => dataMap[column] || []);
    const boxData = prepareBoxplotData(boxDataValues);

    return {
      tooltip: { trigger: "item" },
      legend: {
        type: "scroll",
        show: true,
        bottom: 0,
      },
      // 工具栏只保留下载和还原
      toolbox: {
        feature: {
          restore: {},
          saveAsImage: {
            pixelRatio: 2,
            backgroundColor: '#ffffff'
          }
        },
        right: '10%',
        top: '10px'
      },
      // 只保留滚轮缩放，去除滑块
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: [0],
          start: 0,
          end: 100
        },
        {
          type: 'inside',
          yAxisIndex: [0],
          start: 0,
          end: 100
        }
      ],
      xAxis: {
        type: "value",
        min: -1,
        max: columns.length,
        interval: 1,
        axisLabel: {
          show: true,
          interval: 0,
          fontSize: 12,
          color: "#333",
          rotate: columns.length > 4 ? 15 : 0,
          formatter: function (value: any) {
            const index = Math.round(value);
            return columns[index] || "";
          },
        },
        axisTick: {
          show: true,
          interval: 0,
        },
      },
      yAxis: {
        type: "value",
        splitArea: { show: true },
        splitLine: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        min: min - padding,
        max: max + padding,
      },
      series: [
        {
          name: `箱线图`,
          type: "boxplot",
          data: boxData.boxData.map((boxDataItem: any, index: number) => [
            index, // 使用数组索引，确保与列顺序一致
            ...boxDataItem,
          ]),
          boxWidth: ["5%", "60%"],
          z: 1, // 设置箱线图的层级较低
          tooltip: {
            formatter: (param: any) => {
              const data = param.data;
              const deviceType = columns[data[0]]; // 通过索引获取列名
              const values = boxDataValues[data[0]] || []; // 使用正确的数据对应关系
              
              // 使用辅助函数计算统计值，但保留原始精度
              const stats = calculateStatistics(values);
              
              return `
                <div style="text-align: left; padding: 8px; color: #333;">
                  <strong style="font-size: 14px;">${deviceType}</strong><br/>
                  <hr style="margin: 4px 0; border: none; border-top: 1px solid #eee;"/>
                  <span>最大值:</span> <strong>${stats.max}</strong><br/>
                  <span>最小值:</span> <strong>${stats.min}</strong><br/>
                  <span>中位数:</span> <strong>${stats.median}</strong><br/>
                  <span>平均值:</span> <strong>${stats.mean}</strong><br/>
                  <span>第一四分位数 (Q1):</span> <strong>${data[2]}</strong><br/>
                  <span>第三四分位数 (Q3):</span> <strong>${data[4]}</strong><br/>
                  <hr style="margin: 4px 0; border: none; border-top: 1px solid #eee;"/>
                  <span>样本数:</span> <strong>${values.length}</strong>
                </div>
              `;
            },
          },
        },
        ...scatterSeries,
      ],
    };
  }

  /**
   * 创建合并的图表配置（同时包含X和Y坐标数据）
   */
  function createCombinedChartOption(rows: RowData[], columns: string[], headerRowCount: number = 1): any {
    const colors = [
      "#FF5722",
      "#2196F3",
      "#4CAF50",
      "#FF9800",
      "#9C27B0",
      "#F44336",
      "#00BCD4",
      "#795548",
    ];

    const { rows: chartRows, columns: filteredColumns } = filterDataRows(rows, columns);
    const dataMap = extractCoordinateData(chartRows, filteredColumns);

    const scatterSeries = createScatterSeries(
      chartRows,
      filteredColumns,
      colors,
      headerRowCount
    );

    return createChartOption(filteredColumns, dataMap, scatterSeries);
  }

  /**
   * 处理分组图表数据（根据最后一级表头分组）
   */
  function processGroupedChartData(rows: RowData[], columnGroups: Record<string, string[]>, headerRowCount: number = 1): Record<string, any> | null {
    if (rows.length === 0 || Object.keys(columnGroups).length === 0) return null;
    
    const { rows: chartRows, columns: filteredColumns } = filterDataRows(rows, Object.values(columnGroups).flat());
    if (chartRows.length === 0) return null;

    const groupedCharts: Record<string, any> = {};

    // 为每个分组生成独立的图表
    Object.entries(columnGroups).forEach(([groupName, groupColumns]) => {
      if (groupColumns.length > 0) {
        // 过滤掉序号列后，需要重新匹配分组列
        const validGroupColumns = groupColumns.filter(col => filteredColumns.includes(col));
        if (validGroupColumns.length > 0) {
          const groupChart = createCombinedChartOption(chartRows, validGroupColumns, headerRowCount);
          if (groupChart) {
            groupedCharts[groupName] = {
              ...groupChart,
              title: {
                text: `${groupName} 数据分析`,
                left: 'center',
                textStyle: {
                  fontSize: 16,
                  fontWeight: 'bold'
                }
              }
            };
          }
        }
      }
    });

    return Object.keys(groupedCharts).length > 0 ? groupedCharts : null;
  }

  /**
   * 处理图表数据
   */
  function processChartData(rows: RowData[], columns: string[], headerRowCount: number = 1): any | null {
    if (rows.length === 0 || columns.length === 0) return null;
    const { rows: chartRows, columns: filteredColumns } = filterDataRows(rows, columns);
    if (chartRows.length === 0) return null;
    // 创建合并的图表配置
    return createCombinedChartOption(chartRows, filteredColumns, headerRowCount);
  }

  return {
    processChartData,
    processGroupedChartData,
  };
}
