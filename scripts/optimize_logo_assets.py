from pathlib import Path
from PIL import Image

project = Path('/home/ubuntu/flsko')
source = Path('/home/ubuntu/flsko-design-assets')
source.mkdir(parents=True, exist_ok=True)
raw = project / 'assets/images/flsko-robot-logo.png'
raw_alt = project / 'assets/images/flsko-robot-logo-alt.png'
if raw.exists():
    (source / raw.name).write_bytes(raw.read_bytes())
if raw_alt.exists():
    (source / raw_alt.name).write_bytes(raw_alt.read_bytes())

mapping = {
    'icon.png': 512,
    'android-icon-foreground.png': 432,
    'favicon.png': 256,
    'splash-icon.png': 1024,
}
for name, size in mapping.items():
    target = project / 'assets/images' / name
    with Image.open(raw) as image:
        image = image.convert('RGBA')
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
        canvas.save(target, format='PNG', optimize=True, compress_level=9)

# Keep the generated alternative outside the project as a design option.
print('optimized logo assets')
for name in mapping:
    target = project / 'assets/images' / name
    print(name, target.stat().st_size)
