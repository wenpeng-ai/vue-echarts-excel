import { ref, Ref } from 'vue';
import * as echarts from 'echarts';

export interface CellChangeInfo {
  rowIndex: number;
  columnIndex: number;
  newValue: string;
  columnName: string;
  timestamp: number;
  oldColumnName?: string; // 旧列名，用于标签更新
}

export interface PreciseUpdateData {
  cellChange: CellChangeInfo;
  fullData: any;
}

/**
 * 高效精准图表更新 composable
 * 使用 ECharts 内部机制避免全量重新渲染
 */
export function usePreciseChartUpdate() {
  
  /**
   * 查找图表中受影响的数据点
   */
  function findAffectedDataPoints(
    cellChange: CellChangeInfo, 
    chartOptions: any,
    columnMapping: Record<number, string>
  ): Array<{ seriesIndex: number; dataIndex: number; newValue: number; columnName: string }> {
    const affectedPoints: Array<{ seriesIndex: number; dataIndex: number; newValue: number; columnName: string }> = [];
    
    if (!chartOptions || !chartOptions.series) {
      return affectedPoints;
    }
    
    const { rowIndex, columnIndex, newValue, columnName } = cellChange;
    
    // 跳过表头行，实际数据行从索引1开始
    const dataRowIndex = rowIndex - 1;
    
    // 验证新值是否为有效数字
    const numericValue = Number(newValue);
    if (isNaN(numericValue) || !isFinite(numericValue)) {
      console.warn(`Invalid numeric value: ${newValue}`);
      return affectedPoints;
    }
    
    // 遍历所有系列，查找受影响的数据点
    chartOptions.series.forEach((series: any, seriesIndex: number) => {
      if (series.type === 'scatter' && series.name) {
        // 检查系列名称是否与列名匹配
        const seriesColumnName = series.name.replace('散点', '').trim();
        
        if (seriesColumnName === columnName || series.name.includes(columnName)) {
          // 散点图系列：查找对应的数据点
          if (series.data && dataRowIndex >= 0 && dataRowIndex < series.data.length) {
            affectedPoints.push({
              seriesIndex,
              dataIndex: dataRowIndex,
              newValue: numericValue,
              columnName
            });
            console.log(`Found affected point: series ${seriesIndex}, data ${dataRowIndex}, column ${columnName}`);
          }
        }
      }
    });
    
    return affectedPoints;
  }

  /**
   * 使用 ECharts graphic API 进行超精准更新
   */
  function updateWithGraphicAPI(
    chartInstance: echarts.ECharts,
    affectedPoints: Array<{ seriesIndex: number; dataIndex: number; newValue: number; columnName: string }>,
    cellChange: CellChangeInfo
  ): boolean {
    try {
      affectedPoints.forEach(({ seriesIndex, dataIndex, newValue, columnName }) => {
        // 使用 dispatchAction 来更新数据
        chartInstance.dispatchAction({
          type: 'updateAxisPointer',
          currTrigger: 'none'
        });

        // 获取系列的数据
        const option = chartInstance.getOption() as any;
        const series = option.series[seriesIndex];
        
        if (series && series.data && series.data[dataIndex]) {
          const oldPoint = series.data[dataIndex];
          
          // 保持X轴位置不变，只更新Y值
          const newPoint = {
            ...oldPoint,
            value: [oldPoint.value[0], newValue],
            类型: columnName,
            原始值: cellChange.newValue,
            值: newValue
          };
          
          // 直接修改数据数组
          series.data[dataIndex] = newPoint;
          
          // 使用最小化的 setOption 更新
          chartInstance.setOption({
            series: [{
              seriesIndex: seriesIndex,
              data: series.data
            }]
          }, {
            notMerge: true,
            silent: true
          });
          
          console.log(`🎯 Updated point via graphic API: ${columnName} = ${newValue}`);
        }
      });
      
      return true;
    } catch (error) {
      console.error('Graphic API update failed:', error);
      return false;
    }
  }

  /**
   * 使用内存数据直接更新策略
   */
  function updateDataInMemory(
    chartInstance: echarts.ECharts,
    affectedPoints: Array<{ seriesIndex: number; dataIndex: number; newValue: number; columnName: string }>,
    cellChange: CellChangeInfo
  ): boolean {
    try {
      // 获取并缓存当前完整配置
      const currentOption = chartInstance.getOption() as any;
      
      // 在内存中直接修改数据
      let hasChanges = false;
      
      affectedPoints.forEach(({ seriesIndex, dataIndex, newValue, columnName }) => {
        const series = currentOption.series[seriesIndex];
        
        if (series && series.data && series.data[dataIndex]) {
          const oldDataPoint = series.data[dataIndex];
          
          // 只修改Y值，保持所有其他属性
          series.data[dataIndex] = {
            ...oldDataPoint,
            value: [oldDataPoint.value[0], newValue],
            类型: columnName,
            原始值: cellChange.newValue,
            值: newValue
          };
          
          hasChanges = true;
          console.log(`📝 Memory update: ${columnName}[${dataIndex}] = ${newValue}`);
        }
      });
      
      if (hasChanges) {
        // 一次性应用所有更改，关闭动画和合并
        chartInstance.setOption(currentOption, {
          notMerge: true,
          silent: true
        });
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Memory update failed:', error);
      return false;
    }
  }

  /**
   * 主要的精准更新函数 - 多策略尝试
   */
  function updateChartPrecisely(
    chartInstance: echarts.ECharts | null,
    preciseUpdateData: PreciseUpdateData,
    columnMapping: Record<number, string>,
    chartOptions: any,
    oldColumnName?: string
  ): boolean {
    if (!chartInstance || !preciseUpdateData.cellChange) {
      console.log('🚫 No chart instance or cell change data');
      return false;
    }

    const { cellChange } = preciseUpdateData;
    console.log('🔍 Processing cell change:', cellChange);
    console.log('🔍 Old column name from parameter:', oldColumnName);
    console.log('🔍 Old column name from cellChange:', cellChange.oldColumnName);
    
    // 检查是否为表头行的更新（列名修改）
    if (cellChange.rowIndex === 0) {
      const actualOldColumnName = oldColumnName || cellChange.oldColumnName;
      console.log('🏷️ Header row detected, actualOldColumnName:', actualOldColumnName);
      
      if (actualOldColumnName && actualOldColumnName !== cellChange.newValue) {
        console.log(`🏷️ Updating series label from "${actualOldColumnName}" to "${cellChange.newValue}"`);
        const labelUpdateSuccess = updateSeriesLabels(chartInstance, actualOldColumnName, cellChange.newValue);
        if (labelUpdateSuccess) {
          console.log('✅ Series label update successful');
          return true;
        } else {
          console.log('❌ Series label update failed');
        }
      } else {
        console.log('🚫 No old column name or same value, skipping label update');
      }
      // 如果标签更新失败或没有旧列名，降级到全量更新
      console.log('🔄 Falling back to full update for header change');
      return false;
    }
    
    // 检查是否为数值列的更新
    const columnName = cellChange.columnName;
    if (columnName === '序号' || columnName.includes('序号')) {
      console.log('序号列更新，跳过图表更新');
      return true; // 序号列更新不影响图表
    }

    // 查找受影响的数据点
    const affectedPoints = findAffectedDataPoints(cellChange, chartOptions, columnMapping);
    
    if (affectedPoints.length === 0) {
      console.log('No affected data points found, skipping precise update');
      return false; // 降级到全量更新
    }

    console.log(`🔧 Attempting precise update for ${affectedPoints.length} points`);
    
    // 策略1: 尝试内存数据更新（最快）
    const memorySuccess = updateDataInMemory(chartInstance, affectedPoints, cellChange);
    if (memorySuccess) {
      console.log('✅ Precise update successful via memory strategy');
      return true;
    }
    
    // 策略2: 尝试图形API更新
    const graphicSuccess = updateWithGraphicAPI(chartInstance, affectedPoints, cellChange);
    if (graphicSuccess) {
      console.log('✅ Precise update successful via graphic API');
      return true;
    }
    
    console.log('❌ All precise update strategies failed, will fallback to full update');
    return false;
  }

  /**
   * 更新系列标签（当表头名称改变时）
   */
  function updateSeriesLabels(
    chartInstance: echarts.ECharts,
    oldColumnName: string,
    newColumnName: string
  ): boolean {
    try {
      console.log(`🎨 Starting series label update: "${oldColumnName}" -> "${newColumnName}"`);
      const currentOption = chartInstance.getOption() as any;
      let hasChanges = false;

      console.log('🔍 Current chart series:', currentOption.series?.map((s: any) => ({ name: s.name, type: s.type })));

      // 更新系列名称
      currentOption.series.forEach((series: any, index: number) => {
        if (series.type === 'scatter' && series.name) {
          const seriesColumnName = series.name.replace('散点', '').trim();
          console.log(`🔍 Checking series ${index}: "${series.name}" -> column name: "${seriesColumnName}"`);
          
          if (seriesColumnName === oldColumnName) {
            const oldSeriesName = series.name;
            series.name = `${newColumnName}散点`;
            hasChanges = true;
            console.log(`✅ Updated series ${index} name: "${oldSeriesName}" -> "${series.name}"`);
          }
        }
      });

      // 更新图例
      if (currentOption.legend) {
        console.log('🔍 Updating legend data...');
        // 处理单个图例对象
        if (!Array.isArray(currentOption.legend)) {
          const legend = currentOption.legend;
          if (legend.data && Array.isArray(legend.data)) {
            console.log('🔍 Legend data before update:', legend.data);
            legend.data.forEach((item: any, index: number) => {
              if (typeof item === 'string' && item === `${oldColumnName}散点`) {
                legend.data[index] = `${newColumnName}散点`;
                hasChanges = true;
                console.log(`✅ Updated legend item: ${oldColumnName}散点 -> ${newColumnName}散点`);
              } else if (typeof item === 'object' && item.name === `${oldColumnName}散点`) {
                item.name = `${newColumnName}散点`;
                hasChanges = true;
                console.log(`✅ Updated legend object: ${oldColumnName}散点 -> ${newColumnName}散点`);
              }
            });
            console.log('🔍 Legend data after update:', legend.data);
          }
        } else {
          // 处理图例数组
          currentOption.legend.forEach((legend: any) => {
            if (legend.data && Array.isArray(legend.data)) {
              legend.data.forEach((item: any, index: number) => {
                if (typeof item === 'string' && item === `${oldColumnName}散点`) {
                  legend.data[index] = `${newColumnName}散点`;
                  hasChanges = true;
                  console.log(`✅ Updated legend item: ${oldColumnName}散点 -> ${newColumnName}散点`);
                } else if (typeof item === 'object' && item.name === `${oldColumnName}散点`) {
                  item.name = `${newColumnName}散点`;
                  hasChanges = true;
                  console.log(`✅ Updated legend object: ${oldColumnName}散点 -> ${newColumnName}散点`);
                }
              });
            }
          });
        }
      }

      console.log(`🎨 Label update summary: hasChanges = ${hasChanges}`);

      if (hasChanges) {
        console.log('🎨 Applying label changes to chart...');
        chartInstance.setOption(currentOption, {
          notMerge: true,
          silent: true
        });
        console.log('✅ Label changes applied successfully');
        return true;
      }

      console.log('⚠️ No changes detected for label update');
      return false;
    } catch (error) {
      console.error('💥 Label update failed:', error);
      return false;
    }
  }

  /**
   * 检查是否应该使用精准更新
   */
  function shouldUsePreciseUpdate(
    cellChange: CellChangeInfo,
    chartOptions: any
  ): boolean {
    // 如果是表头行（行索引为0），说明是列名修改
    if (cellChange.rowIndex === 0) {
      console.log('Header row changed, will try label update instead of full regeneration');
      return true; // 改为true，因为我们现在可以处理标签更新
    }

    // 检查是否为有效的数值更新
    const numericValue = Number(cellChange.newValue);
    if (isNaN(numericValue) || !isFinite(numericValue)) {
      // 如果不是数值且不是表头，可能是文本修改，需要完全重新生成
      if (cellChange.rowIndex !== 0) {
        console.log('Non-numeric value changed, requiring full chart regeneration');
        return false;
      }
    }

    // 检查是否为序号列
    if (cellChange.columnName === '序号' || cellChange.columnName.includes('序号')) {
      return true; // 序号列可以"精准更新"（实际是跳过）
    }

    // 检查图表是否有散点图系列
    if (!chartOptions || !chartOptions.series) {
      return false;
    }

    const hasMatchingScatterSeries = chartOptions.series.some((series: any) => 
      series.type === 'scatter' && 
      series.name && 
      (series.name.includes(cellChange.columnName) || series.name.replace('散点', '').trim() === cellChange.columnName)
    );

    if (!hasMatchingScatterSeries && cellChange.rowIndex !== 0) {
      console.log('No matching scatter series found, requiring full chart regeneration');
    }

    return hasMatchingScatterSeries || cellChange.rowIndex === 0;
  }

  return {
    updateChartPrecisely,
    findAffectedDataPoints,
    shouldUsePreciseUpdate,
    updateSeriesLabels
  };
}
