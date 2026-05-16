from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "vehicles" / "attitude"
OUTPUT_DIR = SOURCE_DIR / "clean"


def is_fake_transparency_pixel(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    if alpha == 0:
        return True

    high = max(red, green, blue)
    low = min(red, green, blue)
    mean = (red + green + blue) / 3

    # The source attitude images were exported against a baked white/gray
    # checker preview. Treat only bright, low-saturation pixels connected to
    # the canvas edge as removable background so vehicle highlights remain.
    return mean >= 214 and high - low <= 42


def is_lower_matte_pixel(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    if alpha == 0:
        return True

    high = max(red, green, blue)
    low = min(red, green, blue)
    mean = (red + green + blue) / 3

    # The checker preview is not always pure white. Several rear assets have
    # gray checker/floor remnants below the axle after the edge pass, so the
    # lower matte pass accepts a wider low-saturation range and relies on
    # component size/location to avoid removing real vehicle highlights.
    return mean >= 118 and high - low <= 50


def is_lower_shadow_matte_pixel(pixel: tuple[int, int, int, int]) -> bool:
    red, green, blue, alpha = pixel
    if alpha == 0:
        return True

    high = max(red, green, blue)
    low = min(red, green, blue)
    mean = (red + green + blue) / 3

    # Some floor/checker remnants are dark gray rather than white. Only use
    # this wider range in the very bottom region, where it can remove the fake
    # preview shadow without touching the vehicle body.
    return mean >= 55 and high - low <= 75


def border_points(width: int, height: int) -> Iterable[tuple[int, int]]:
    for x in range(width):
        yield x, 0
        yield x, height - 1
    for y in range(1, height - 1):
        yield 0, y
        yield width - 1, y


def clean_png(source_path: Path, output_path: Path) -> tuple[int, int]:
    image = Image.open(source_path).convert("RGBA")
    width, height = image.size
    pixels = image.load()
    background = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def index(x: int, y: int) -> int:
        return y * width + x

    for x, y in border_points(width, height):
        idx = index(x, y)
        if not background[idx] and is_fake_transparency_pixel(pixels[x, y]):
            background[idx] = 1
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            idx = index(nx, ny)
            if background[idx] or not is_fake_transparency_pixel(pixels[nx, ny]):
                continue
            background[idx] = 1
            queue.append((nx, ny))

    def mark_matching_components(
        predicate,
        *,
        start_y: int = 0,
        min_component_size: int,
        min_floor_y: int,
        min_floor_width: int,
        min_floor_height: int,
        large_requires_floor_y: bool = False,
    ) -> None:
        visited = bytearray(width * height)
        component_queue: deque[tuple[int, int]] = deque()
        component: list[tuple[int, int]] = []

        for seed_y in range(start_y, height):
            for seed_x in range(width):
                seed_idx = index(seed_x, seed_y)
                if background[seed_idx] or visited[seed_idx] or not predicate(pixels[seed_x, seed_y]):
                    continue

                component.clear()
                component_queue.clear()
                visited[seed_idx] = 1
                component_queue.append((seed_x, seed_y))
                min_x = max_x = seed_x
                min_y = max_y = seed_y

                while component_queue:
                    x, y = component_queue.popleft()
                    component.append((x, y))
                    min_x = min(min_x, x)
                    max_x = max(max_x, x)
                    min_y = min(min_y, y)
                    max_y = max(max_y, y)
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                        if nx < 0 or ny < 0 or nx >= width or ny >= height:
                            continue
                        idx = index(nx, ny)
                        if background[idx] or visited[idx] or not predicate(pixels[nx, ny]):
                            continue
                        visited[idx] = 1
                        component_queue.append((nx, ny))

                component_width = max_x - min_x + 1
                component_height = max_y - min_y + 1
                large_matte = len(component) >= min_component_size and (
                    not large_requires_floor_y or min_y >= min_floor_y
                )
                floor_matte = (
                    component_width >= min_floor_width
                    and component_height >= min_floor_height
                    and min_y >= min_floor_y
                )
                if large_matte or floor_matte:
                    for x, y in component:
                        background[index(x, y)] = 1

    # Some exported images contain fake transparency islands trapped under the
    # vehicle body or between tires. They are no longer connected to the canvas
    # edge after the edge flood-fill, so remove large bright/desaturated matte
    # components first. Small highlights remain.
    mark_matching_components(
        is_fake_transparency_pixel,
        min_component_size=350,
        min_floor_y=int(height * 0.42),
        min_floor_width=90,
        min_floor_height=6,
    )

    def current_visible_bbox() -> tuple[int, int, int, int] | None:
        min_x = width
        min_y = height
        max_x = -1
        max_y = -1
        for y in range(height):
            for x in range(width):
                if background[index(x, y)]:
                    continue
                if pixels[x, y][3] == 0:
                    continue
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
        if max_x < min_x or max_y < min_y:
            return None
        return min_x, min_y, max_x, max_y

    # A few rear exports also have lower gray checker/floor remnants below the
    # vehicle. Restrict the broader matte predicate to the lower body region so
    # chrome, glass, and tire highlights higher in the vehicle stay intact.
    visible_bbox = current_visible_bbox()
    if visible_bbox:
        _, visible_top, _, visible_bottom = visible_bbox
        lower_body_y = visible_top + int((visible_bottom - visible_top) * 0.78)
        mark_matching_components(
            is_lower_matte_pixel,
            start_y=lower_body_y,
            min_component_size=4,
            min_floor_y=lower_body_y,
            min_floor_width=1,
            min_floor_height=1,
            large_requires_floor_y=True,
        )

    visible_bbox = current_visible_bbox()
    if visible_bbox:
        _, visible_top, _, visible_bottom = visible_bbox
        shadow_y = visible_top + int((visible_bottom - visible_top) * 0.86)
        mark_matching_components(
            is_lower_shadow_matte_pixel,
            start_y=shadow_y,
            min_component_size=4,
            min_floor_y=shadow_y,
            min_floor_width=1,
            min_floor_height=1,
            large_requires_floor_y=True,
        )

    # A transparent one-pixel canvas border prevents accidental crop-edge
    # slivers from rendering as a white/gray box in the HUD.
    for x, y in border_points(width, height):
        background[index(x, y)] = 1

    output_pixels: list[tuple[int, int, int, int]] = []
    removed = 0
    kept = 0
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if background[index(x, y)]:
                output_pixels.append((red, green, blue, 0))
                removed += 1
            else:
                output_pixels.append((red, green, blue, alpha))
                kept += 1

    cleaned = Image.new("RGBA", image.size)
    cleaned.putdata(output_pixels)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(output_path, "PNG", optimize=True)
    return removed, kept


def main() -> None:
    sources = sorted(path for path in SOURCE_DIR.glob("*.png") if path.parent == SOURCE_DIR)
    if not sources:
        raise SystemExit(f"No attitude PNGs found in {SOURCE_DIR}")

    for source in sources:
        removed, kept = clean_png(source, OUTPUT_DIR / source.name)
        print(f"{source.name}: transparent={removed} kept={kept}")


if __name__ == "__main__":
    main()
