# 髙橋 春喜 ポートフォリオ

https://haru-ki417.github.io/portfolio/

同志社大学 生命医科学部（医療情報学）髙橋春喜のポートフォリオサイトです。
制作物 9 件の概要と事例ページ（`case-01.html` 〜 `case-09.html`）、英語版（`en.html`）があります。
多くの制作物は、「その場で試す」から、ページを離れずにそのまま試せます。

| 制作物 | ブラウザーで開く |
|---|---|
| MyDicomViewer | https://haru-ki417.github.io/MyDicomViewer/ |
| Abbild | https://haru-ki417.github.io/Abbild/ |
| AI-SHOW（VITAL ROOM Web 版） | https://haru-ki417.github.io/Harinezumi-AI-Hack/ |
| Pulse & Mind Study | https://pulsemind-datzdltheb62e.azurewebsites.net |
| TremorScope | https://haru-ki417.github.io/TremorScope/ |
| VolumeScope | https://haru-ki417.github.io/VolumeScope/ |
| QuantScope | https://haru-ki417.github.io/QuantScope/ |

## サイトのしくみ

- ライトモード（心電図の記録紙）とダークモード（ベッドサイドモニター）を切り替えられます（最初は端末の設定に合わせます）
- トップの「制作物モニター」のチャンネルや、上の絞り込みで、制作物を領域ごとに表示できます
- 「技術と制作物のつながり」で、技術を選ぶと使った制作物が、制作物を選ぶと使った技術が光ります
- 事例ページの構成図は、データの流れに沿って順に組み上がります。ハードウェアを使う制作物には、回路図を 2D と 3D（回して見られる）の両方で載せています

ビルド不要の静的サイトです（GitHub Pages: Deploy from a branch → `main` / `(root)`）。
3D の回路図には [three.js](https://threejs.org/)（MIT ライセンス、`assets/vendor/three/`）を使っています。
