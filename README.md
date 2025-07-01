# Excel数据可视化分析工具

基于Vue3 + ECharts的Excel数据可视化分析工具，可以自动将Excel表格数据转换为箱线图（盒须图）和散点图进行统计分析。

[在线预览](https://wenpeng-ai.github.io/vue-echarts-excel/)

## 功能特性

- 📊 **Excel文件解析**: 支持.xlsx和.xls格式文件
- 📈 **多工作表支持**: 可选择不同的Sheet进行分析  
- 🔍 **智能表头识别**: 自动识别多级表头结构
- 📋 **数据预览**: 表格形式预览原始数据
- 🎯 **散点图叠加**: 在箱线图基础上叠加抖动散点图
- 🎨 **现代化UI**: 简洁优雅的用户界面

## 技术栈

- **前端框架**: Vue 3 (Composition API)
- **图表库**: ECharts + vue-echarts
- **Excel解析**: SheetJS (xlsx)
- **构建工具**: Vite
- **样式**: CSS3 + Flexbox/Grid

## 项目结构

```
src/
├── components/
│   └── ExcelEcharts.vue      # 主要组件
├── composables/
│   ├── useExcelProcessor.js  # Excel处理逻辑
│   ├── useChartProcessor.js  # 图表数据处理
│   └── useTableMerge.js      # 表格合并处理
├── assets/                   # 静态资源
├── App.vue                   # 根组件
└── main.js                   # 入口文件
```

## 快速开始

### 安装依赖

```bash
yarn
```

### 开发环境运行

```bash
yarn dev
```

### 生产环境构建

```bash
yarn build
```

## 使用说明

1. **上传Excel文件**: 点击文件选择按钮，选择.xlsx或.xls格式的Excel文件
2. **选择工作表**: 如果Excel包含多个Sheet，可以在下拉菜单中选择要分析的工作表
3. **分析图表**: 点击"数据图表"查看自动生成的箱线图和散点图分析
4. **数据联动**: 修改表格数据，图表也会相应变化。选中散点数据或者表格数据，双向高亮。


## 开发亮点

### 代码重构优化

- ✅ 删除冗余组件和无用代码
- ✅ 提取逻辑到可复用的Composables
- ✅ 优化组件结构，提高可维护性
- ✅ 现代化的响应式设计
- ✅ 清晰的代码组织和注释

### 架构优势

- **关注点分离**: 将Excel处理、图表生成、表格处理等逻辑分离到独立的composables
- **可复用性**: Composables可以在其他组件中复用
- **可测试性**: 纯函数逻辑易于单元测试
- **可维护性**: 清晰的代码结构和完善的注释

## 浏览器支持

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 许可证

MIT License
