from PIL import Image

pts_top = '699,250 517,250 288,472 406,581 459,495 428,465 553,346 639,346'
pts_blue = '621,375 565,375 406,638 463,637'
pts_bot = '736,549 616,440 564,525 594,555 476,667 389,667 324,773 500,773'

svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="none">
  <rect width="1024" height="1024" rx="200" fill="#0B0D13"/>
  <polygon points="{pts_top}" fill="#FFFFFF"/>
  <polygon points="{pts_blue}" fill="#2D7AE5"/>
  <polygon points="{pts_bot}" fill="#FFFFFF"/>
</svg>'''

with open('apps/web/public/brand/logo.svg', 'w') as f:
    f.write(svg_content)

# Also generate a square icon version without the dark background for transparent use
svg_transparent = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="260 220 504 584" fill="none">
  <polygon points="{pts_top}" fill="#FFFFFF"/>
  <polygon points="{pts_blue}" fill="#2D7AE5"/>
  <polygon points="{pts_bot}" fill="#FFFFFF"/>
</svg>'''

with open('apps/web/public/brand/logo-transparent.svg', 'w') as f:
    f.write(svg_transparent)

with open('apps/web/public/brand/favicon.svg', 'w') as f:
    f.write(svg_content)

with open('apps/web/src/app/icon.svg', 'w') as f:
    f.write(svg_content)

print('Logos generated successfully!')
