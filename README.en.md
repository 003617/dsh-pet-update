# dsh-pet-update 🐾

> An optimized fork of [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet).

<p align="center">
  <a href="https://github.com/003617/dsh-pet-update"><img alt="stars" src="https://img.shields.io/github/stars/003617/dsh-pet-update?style=social"></a>
  <a href="https://github.com/003617/dsh-pet-update/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/github/license/003617/dsh-pet-update?color=orange"></a>
  <a href="https://github.com/PC2005-cloud/dsh-pet"><img alt="upstream" src="https://img.shields.io/badge/fork%20of-PC2005--cloud%2Fdsh-pet-8A2BE2"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-DeepSeek%20Harness%20Web-8A2BE2">
  <img alt="assets" src="https://img.shields.io/badge/assets-51%20animations-ff69b4">
</p>

> A floating desktop pet for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI: session-activity aware expressions and actions, rotating speech bubbles, idle breathing, random actions, screen wandering, click reactions, and draggable.

---

## 🚀 Quick Start (Install This Fork)

Install this fork directly from GitHub:

```sh
dsh plugin --profile web add github:003617/dsh-pet-update
```

Or clone and install from a local directory:

```sh
git clone https://github.com/003617/dsh-pet-update.git
dsh plugin --profile web add ./dsh-pet-update
```

Restart `dsh web` and the pet appears in the bottom-right corner — 51 transparent animations, ready to use out of the box, no generation pipeline required.

> ⚠️ Note: `dsh plugin --profile web add dsh-pet` (without a source) installs the **upstream original** published on npm, not this fork.
> 💡 Want to craft your own one-of-a-kind pet from scratch? Head to the upstream repo [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) (asset pipeline: AI prompts → green-screen video → transparent animation, generated with Doubao — fully reproducible).

## ✨ Features

- **Session-activity aware**: follows the current session phase (thinking / reading / editing / working / replying / done / error) to switch expressions and rotate speech bubbles automatically
- **Balance prompts**: queries your DeepSeek balance every 5 minutes (or on left double-click); plays the "eating rice" animation and shows the balance in a bubble
- **Character lines & idle skits**: click for one of 6 random lines; ~3 min idle triggers one of 11 action skits
- **A pure pet, nothing else**: no weather, no monitoring; balance queries go through the server-side proxy, the browser never touches your API key
- **51 hand-drawn style transparent animations**: idle breathing, dozing off, Rubik's cube, humming, hair-raising, bubbles, water gun, violin, the whale emerging, eating rice, mirror, three dances, writing code, seasonal actions (kite, snowman, ice cream, fireworks…) — all seamlessly chained
- **Never-ending animation chain**: the next animation is picked instantly by probability (30% idle / 10% turn / 40% action / 20% move)
- **Screen wandering**: walks toward its facing direction, checks the space ahead, never walks off screen
- **Click / drag**: click triggers a random reaction (happy / shy / tsundere); double-click queries the balance; drag it anywhere
- **Left/right facing**: all animations are CSS-mirrored
- **Ground alignment**: unified foot line, the pet always stands on the "ground"
- **Smooth transitions**: double-buffered video cross-fade, zero blank frames
- **Accessibility-friendly**: supports `prefers-reduced-motion`

## ⚙️ Configuration

| Key | Description | Current status |
|---|---|---|
| `size` | Stage width (px); pet height ≈ width×9/16×74% | Default 462 (≈260px tall), **not yet delivered to the browser** (DSH client config pipeline limitation; falls back to code default) |
| `position` | Default corner position | Defaults to bottom-right, same as above (not yet delivered) |
| `fullRoot` | Original 2160×1215 master asset directory | Defaults to `$DSH_HOME/pet-assets`; takes effect after manually downloading the master assets |

> Note: the plugin works out of the box; all config above is optional. Browser-side configuration of `size`/`position` is planned.

## 🗑️ Uninstall

```sh
dsh plugin --profile web remove dsh-pet-update
```

> 💡 If you previously installed the upstream original `dsh-pet` from npm, note that this fork (package name `dsh-pet-update`) is **a different plugin** — both may appear on screen at once. To fully switch to this fork, uninstall the upstream one first:
> ```sh
> dsh plugin --profile web remove dsh-pet
> ```

## 🎬 Animation Previews

> The animations have transparent backgrounds; in the web player below the transparent areas show the page background color, while actual playback is transparent. Click a video to play / pause.

<p>
  <video src="./assets/thumb/%E5%BE%85%E6%9C%BA%E5%91%BC%E5%90%B8%E4%BC%91%E9%97%B2.webm" width="180" controls muted loop title="Idle breathing & chill"></video>
  <video src="./assets/thumb/%E4%B8%9C%E5%BC%A0%E8%A5%BF%E6%9C%9B.webm" width="180" controls muted loop title="Looking around"></video>
  <video src="./assets/thumb/%E5%8E%9F%E5%9C%B0%E6%BC%82%E6%B5%AE%E8%B8%8F%E6%AD%A5.webm" width="180" controls muted loop title="Floating in place"></video>
  <video src="./assets/thumb/%E5%8E%9F%E5%9C%B0%E5%B0%8F%E6%86%A9%E6%B2%89%E7%9C%A0.webm" width="180" controls muted loop title="Napping"></video>
  <video src="./assets/thumb/%E7%82%B9%E5%87%BB%E5%9B%9E%E5%BA%94%20-%20%E5%BC%80%E5%BF%83%E8%B7%83%E5%8A%A8.webm" width="180" controls muted loop title="Click response - happy bounce"></video>
  <video src="./assets/thumb/%E8%A2%AB%E9%BC%A0%E6%A0%87%E6%8B%96%E6%8B%BD%E6%82%AC%E7%A9%BA%E5%8F%8D%E9%A6%88.webm" width="180" controls muted loop title="Dragged by the mouse"></video>
</p>

All 51 animations live in the repo under `assets/thumb/`.

## 📦 Related Upstream Project

- **This repo**: [003617/dsh-pet-update](https://github.com/003617/dsh-pet-update) — optimized fork of dsh-pet (this repository)
- **Upstream original**: [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) — the complete three-piece project (prompts recipe → asset pipeline → plugin), including [DESIGN.md](https://github.com/PC2005-cloud/dsh-pet/blob/master/DESIGN.md)

## 🔎 Discover More DSH Plugins

- Community plugin catalog: [awesome-dsh-plugin.com](https://awesome-dsh-plugin.com)
- DSH official repository: [deepseek-ai/DeepSeek-Harness](https://github.com/deepseek-ai/deepseek-harness)

## 📄 License

- Code: MIT (copyright held by the original author PC2005-cloud; this repository is an optimized fork maintained by [003617](https://github.com/003617))
- Assets (animations/prompts): see the upstream repository notes
