from PIL import Image
import os

source_path = r"C:/Users/habib/.gemini/antigravity/brain/4dd1d8b5-da4d-4e57-8586-7a21ff1e2d75/.user_uploaded/media_1795180100227_68030c9b.png"
img = Image.open(source_path).convert("RGBA")

targets = [
    (r"apps/web/public/logo.png", 512),
    (r"apps/web/public/brand/sovrack-mark.png", 512),
    (r"apps/web/src/app/icon.png", 192),
    (r"apps/web/src/app/apple-icon.png", 180),
]

for rel_path, size in targets:
    out_path = os.path.join(r"D:\Workspace\deploy-automation\sovrack", rel_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(out_path, "PNG")
    print(f"Saved {out_path} ({size}x{size})")

# Favicon.ico
ico_path = os.path.join(r"D:\Workspace\deploy-automation\sovrack", r"apps/web/public/favicon.ico")
img.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print(f"Saved {ico_path}")
