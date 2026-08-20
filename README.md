# dsh-pet-update 🐾

> 基于 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 二次优化的桌面宠物插件。

<p align="center">
  <a href="https://github.com/003617/dsh-pet-update"><img alt="stars" src="https://img.shields.io/github/stars/003617/dsh-pet-update?style=social"></a>
  <a href="https://github.com/003617/dsh-pet-update/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/003617/dsh-pet-update?color=orange"></a>
  <a href="https://github.com/PC2005-cloud/dsh-pet"><img alt="upstream" src="https://img.shields.io/badge/fork%20of-PC2005--cloud%2Fdsh-pet-8A2BE2"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-DeepSeek%20Harness%20Web-8A2BE2">
  <img alt="assets" src="https://img.shields.io/badge/assets-51%20animations-ff69b4">
</p>

> A floating desktop pet for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI.
> 一只住在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面里的桌面宠物：跟随当前会话活动（思考 / 阅读 / 编辑 / 工作中 / 回复 / 完成 / 出错）自动切换表情动作并轮换对话气泡，同时保留待机呼吸、随机动作、屏幕漫游、点击反应、可拖拽。

---

## 🚀 快速开始（安装本仓库的优化版）

从 GitHub 直接安装本 fork：

```sh
dsh plugin --profile web add github:003617/dsh-pet-update
```

或者 clone 后从本地目录安装：

```sh
git clone https://github.com/003617/dsh-pet-update.git
dsh plugin --profile web add ./dsh-pet-update
```

重启 `dsh web`，宠物出现在界面右下角——51 个透明动画开箱即用，无需任何生成流程。

> ⚠️ 注意：`dsh plugin --profile web add dsh-pet`（不带来源）安装的是 npm 上发布的**上游原版**，不是本优化版。
> 💡 想从零生成自己的宠物，请前往上游 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（素材链：AI 提示词 → 绿幕视频 → 透明动画，素材由豆包生成，全流程可复现）。

## ✨ 功能特性

- **会话活动感知**：跟随当前会话阶段自动切换表情动作并轮换对话气泡——思考 / 阅读 / 编辑 / 工作中 / 回复 / 完成 / 出错
- **余额提示**：每 5 分钟自动查询一次 DeepSeek 余额，鼠标左键双击桌宠立即查询；提示时播放「吃白饭」动作并在气泡中展示余额
- **角色台词与随机小剧场**：单击有 6 句随机角色台词；闲置约 3 分钟随机触发 11 组动作小剧场
- **纯粹的桌宠**：不掺天气查询、系统监控等额外业务；余额查询走服务端代理，浏览器不接触 API Key
- **51 个手绘风透明动画**：待机呼吸、打瞌睡、玩魔方、哼歌、炸毛、吐泡泡、玩水枪、小提琴演奏、蓝鲸现世、吃白饭、照镜子、三支舞、写代码、四季动作（放风筝、堆雪人、吃冰淇淋、放烟花……）全部无缝衔接
- **永不停止的动画链**：每段动画播完立即按概率选下一个（30% 待机 / 10% 转向 / 40% 动作 / 20% 移动）
- **屏幕漫游**：朝 facing 方向行走，自动检查空间、不走出屏幕
- **点击 / 拖拽**：单击有随机回应动画（开心 / 害羞 / 傲娇），双击查询余额，可拖到任意位置
- **左右朝向**：所有动画 CSS 镜像，人物可朝左 / 朝右
- **落地对齐**：动画统一脚底线，宠物始终站在"地面"上
- **流畅切换**：双缓冲 video 交叉淡入，切换零空白帧
- **无障碍友好**：支持 `prefers-reduced-motion`

## ⚙️ 配置

| 配置项 | 说明 | 当前状态 |
|---|---|---|
| `size` | 舞台宽度（px），宠物高度 = 宽度×9/16×74% | 默认 462（≈高度 260px），**暂未下发到浏览器**（DSH 客户端配置管线限制，走代码默认值） |
| `position` | 默认角落位置 | 默认右下角，同上暂未下发 |
| `fullRoot` | 原始 2160×1215 母版资源目录 | 默认 `$DSH_HOME/pet-assets`，需手动下载母版后生效 |

> 说明：插件安装即用，上述配置均为可选；`size`/`position` 的浏览器侧配置化正在规划中。

## 🗑️ 卸载

```sh
dsh plugin --profile web remove dsh-pet
```

## 🎬 效果预览

> 动画为透明背景；Web 播放器中透明部分显示为页面底色，实际播放为透明。
> 点击视频可播放 / 暂停。

<p>
  <video src="./assets/thumb/%E5%BE%85%E6%9C%BA%E5%91%BC%E5%90%B8%E4%BC%91%E9%97%B2.webm" width="180" controls muted loop title="待机呼吸休闲"></video>
  <video src="./assets/thumb/%E4%B8%9C%E5%BC%A0%E8%A5%BF%E6%9C%9B.webm" width="180" controls muted loop title="东张西望"></video>
  <video src="./assets/thumb/%E5%8E%9F%E5%9C%B0%E6%BC%82%E6%B5%AE%E8%B8%8F%E6%AD%A5.webm" width="180" controls muted loop title="原地漂浮踏步"></video>
  <video src="./assets/thumb/%E5%8E%9F%E5%9C%B0%E5%B0%8F%E6%86%A9%E6%B2%89%E7%9C%A0.webm" width="180" controls muted loop title="原地小憩沉眠"></video>
  <video src="./assets/thumb/%E7%82%B9%E5%87%BB%E5%9B%9E%E5%BA%94%20-%20%E5%BC%80%E5%BF%83%E8%B7%83%E5%8A%A8.webm" width="180" controls muted loop title="点击回应 - 开心跃动"></video>
  <video src="./assets/thumb/%E8%A2%AB%E9%BC%A0%E6%A0%87%E6%8B%96%E6%8B%BD%E6%82%AC%E7%A9%BA%E5%8F%8D%E9%A6%88.webm" width="180" controls muted loop title="被鼠标拖拽悬空反馈"></video>
</p>

全部 51 个动画见仓库：`assets/thumb/`。

## 📦 与本仓库相关的上游项目

- **本仓库**：[003617/dsh-pet-update](https://github.com/003617/dsh-pet-update) —— dsh-pet 的优化版插件源码（本仓库）
- **上游原版**：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) —— 完整三件套项目（提示词配方 → 素材生成链 → 插件），含 [DESIGN.md](https://github.com/PC2005-cloud/dsh-pet/blob/master/DESIGN.md) 设计与实现文档

## 🔎 发现更多 DSH 插件

- 社区插件目录：[awesome-dsh-plugin.com](https://awesome-dsh-plugin.com)
- DSH 官方仓库：[deepseek-ai/DeepSeek-Harness](https://github.com/deepseek-ai/deepseek-harness)

## 📄 许可

- 代码：MIT（版权归原作者 PC2005-cloud；本仓库为二次优化版，由 [003617](https://github.com/003617) 维护）
- 素材（动画/提示词）：见上游仓库说明
