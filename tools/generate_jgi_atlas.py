"""Build game atlas for JGI bank frames: white-ish master, 5x3 @ 128px (15 frames)."""

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "jgi-frames"
WHITE_OUTPUT = ROOT / "res" / "craft-jgi-bank-game"
FRAME_COUNT = 15
FRAME_SIZE = 128
ATLAS_COLS = 5
ATLAS_ROWS = 3


def make_white_master(src: Image.Image) -> Image.Image:
    image = src.convert("RGBA")
    px = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = px[x, y]
            if a < 24:
                continue
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            # 保留很暗的缝隙/座舱；其余抬成浅灰母版，方便游戏里灰/红染色。
            if lum < 10:
                continue
            surface = min(1.0, max(0.0, (lum - 10.0) / 40.0))
            gray = min(250.0, 120.0 + lum * 1.55)
            nr = r * (1.0 - surface) + gray * surface
            ng = g * (1.0 - surface) + (gray + 3.0) * surface
            nb = b * (1.0 - surface) + (gray + 6.0) * surface
            px[x, y] = (round(nr), round(ng), round(nb), a)
    return image


def pick_source_files(files: list[Path], count: int) -> list[Path]:
    if len(files) < count:
        raise SystemExit(f"need at least {count} frames in {SOURCE}, found {len(files)}")
    if len(files) == count:
        return files
    # 从现有帧均匀抽 count 张（例如 20→15）
    last = len(files) - 1
    idxs = [round(i * last / (count - 1)) for i in range(count)]
    return [files[i] for i in idxs]


def main():
    source_files = pick_source_files(sorted(SOURCE.glob("frame-*.png")), FRAME_COUNT)

    WHITE_OUTPUT.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (FRAME_SIZE * ATLAS_COLS, FRAME_SIZE * ATLAS_ROWS), (0, 0, 0, 0))

    # 只保留 atlas.png，清掉历史 frame-*.png 母版
    for old in WHITE_OUTPUT.glob("frame-*.png"):
        old.unlink(missing_ok=True)

    for index, source_file in enumerate(source_files):
        # 浏览器导出 1024px、机头朝下；游戏母版转正并缩到 256 再落到 128。
        original = Image.open(source_file).convert("RGBA")
        original = original.rotate(180).resize((256, 256), Image.Resampling.LANCZOS)
        master = make_white_master(original)
        frame = master.resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.LANCZOS)
        atlas.alpha_composite(
            frame,
            ((index % ATLAS_COLS) * FRAME_SIZE, (index // ATLAS_COLS) * FRAME_SIZE),
        )

    # 保持 RGBA：索引色 PNG 在部分微信 Canvas 上会解成全透明，导致飞机消失。
    atlas.save(WHITE_OUTPUT / "atlas.png", optimize=True)
    print("generated", len(source_files), "frames ->", WHITE_OUTPUT / "atlas.png", atlas.size)


if __name__ == "__main__":
    main()
