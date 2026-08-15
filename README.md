# 心理学考研专业课复习网页

一个适合部署到 GitHub Pages 的静态复习网页，当前已完成普通心理学的增强版整理，并支持本地错题本、本地内容管理、题目与重点/易混点关联维护。

## 当前功能

- 普通心理学按 **5 编 14 章** 组织
- 章节页支持重点、易混点、题目联动展示
- 题目支持建议字数、建议用时、参考答案、得分点、解析
- 支持本地错题本
- 支持本地内容管理：题目 / 重点 / 易混点增删改查
- 支持题目关联重点、关联易混点
- 支持本地导入 / 导出 JSON

## 目录结构

```text
.
├── index.html
├── webapp/
│   ├── psy-index.html
│   ├── psy-subject.html
│   ├── psy-chapter.html
│   ├── psy-papers.html
│   ├── psy-progress.html
│   ├── psy-manage.html
│   ├── psy-readme.html
│   ├── psy-app.js
│   └── psy.css
└── data/
    ├── subjects.json
    ├── chapters.json
    ├── focus_points.json
    ├── confusion_points.json
    └── questions.json
```

## GitHub Pages 部署方式

### 1. 上传仓库
把当前项目完整上传到 GitHub 仓库，保持 `webapp/` 与 `data/` 在仓库根目录同级。

### 2. 打开 GitHub Pages
在仓库设置中：

- 进入 **Settings**
- 打开 **Pages**
- Source 选择你的默认分支（如 `main`）
- Folder 选择 `/ (root)`

### 3. 访问地址
部署成功后可通过以下任一方式访问：

- 根地址：
  - `https://你的用户名.github.io/你的仓库名/`
- 首页直达地址：
  - `https://你的用户名.github.io/你的仓库名/webapp/psy-index.html`

根目录 `index.html` 已自动跳转到 `./webapp/psy-index.html`。

## 使用说明

### 普通访问
直接从首页进入即可，推荐路径：

- 首页
- 学科复习
- 单章复习
- 测试卷中心
- 复习进度
- 内容管理

### 内容管理说明
内容管理页支持：

- 题目管理
- 重点管理
- 易混点管理
- 关联重点 / 易混点维护
- 本地导入 / 导出

### 本地存储边界
本项目当前是**纯静态站方案**，因此以下功能依赖浏览器本地存储：

- 错题本
- 本地内容管理结果
- 导入后的本地覆盖数据

这意味着：

- 换浏览器、换设备、清缓存后，本地数据可能不会保留
- GitHub Pages 上的内容管理不会直接改写仓库里的 `data/*.json`
- 如需长期保留本地修改，请及时使用“导出 JSON”备份

## 发布前检查清单

- [ ] `webapp/` 与 `data/` 在仓库根目录同级
- [ ] `webapp/psy-app.js` 中 `DATA_BASE` 保持为 `../data`
- [ ] GitHub Pages 指向仓库根目录发布
- [ ] 部署后测试首页是否可正常跳转
- [ ] 测试章节页、试卷页是否能正常读取 JSON
- [ ] 测试错题本、本地管理、导入导出是否正常工作

## 当前版本定位

当前版本为：

**普通心理学增强版 / 静态站本地维护版**

适合作为：

- 个人复习网页
- GitHub Pages 静态知识库
- 本地维护型题库与考点复习工具
