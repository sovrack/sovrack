from PIL import Image, ImageDraw
import os

W, H = 2048, 2048
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# ViewBox bounds
min_x, max_x = 24.0, 76.0
min_y, max_y = 22.0, 78.0

vb_w = max_x - min_x  # 52
vb_h = max_y - min_y  # 56

scale = min(W / vb_w, H / vb_h) * 0.95  # 5% safety margin
offset_x = (W - vb_w * scale) / 2 - min_x * scale
offset_y = (H - vb_h * scale) / 2 - min_y * scale

def transform(pts_str):
    res = []
    for pair in pts_str.strip().split():
        x, y = map(float, pair.split(","))
        res.append((x * scale + offset_x, y * scale + offset_y))
    return res

top_pts = transform("50,24 68,24 62.5,33.5 54,33.5 41.5,46 44.5,49 39.5,57.5 28,46")
slash_pts = transform("54.5,36.5 60.5,36.5 45.5,63.5 39.5,63.5")
bot_pts = transform("50,76 32,76 37.5,66.5 46,66.5 58.5,54 55.5,51 60.5,42.5 72,54")

draw.polygon(top_pts, fill=(255, 255, 255, 255))
draw.polygon(slash_pts, fill=(37, 99, 235, 255))  # #2563EB
draw.polygon(bot_pts, fill=(255, 255, 255, 255))

base_dir = r"D:\Workspace\deploy-automation\sovrack"

# Save high-res master
master_png = os.path.join(base_dir, "apps/web/public/logo.png")
resized_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
resized_512.save(master_png, "PNG")
print("Saved", master_png)

targets = [
    (r"apps/web/public/brand/sovrack-mark.png", 512),
    (r"apps/web/src/app/icon.png", 192),
    (r"apps/web/src/app/apple-icon.png", 180),
]

for rel_path, size in targets:
    out_path = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    r = img.resize((size, size), Image.Resampling.LANCZOS)
    r.save(out_path, "PNG")
    print("Saved", out_path)

# Generate multi-res transparent favicon.ico (16, 32, 48)
ico_path = os.path.join(base_dir, r"apps/web/public/favicon.ico")
ico_16 = img.resize((16, 16), Image.Resampling.LANCZOS)
ico_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
ico_48 = img.resize((48, 48), Image.Resampling.LANCZOS)
ico_16.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)], append_images=[ico_32, ico_48])
print("Saved transparent ICO:", ico_path)
