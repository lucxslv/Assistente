import os
from PIL import Image
import numpy as np
from skimage.measure import find_contours
from scipy.ndimage import gaussian_filter

# 1. Carrega imagem original do usuário
orig_path = "C:/Users/lucas/.gemini/antigravity/brain/77d777f0-bd5c-482f-972d-3a23a5fbb205/.user_uploaded/media_1790754729993.png"
img = Image.open(orig_path).convert("RGB")
arr = np.array(img, dtype=np.float32)

lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

# Bounding box
mask = lum > 50
rows = np.any(mask, axis=1)
cols = np.any(mask, axis=0)
ymin, ymax = np.where(rows)[0][[0, -1]]
xmin, xmax = np.where(cols)[0][[0, -1]]

pad = 4
ymin = max(0, ymin - pad)
ymax = min(arr.shape[0], ymax + pad)
xmin = max(0, xmin - pad)
xmax = min(arr.shape[1], xmax + pad)

emblem_crop = lum[ymin : ymax + 1, xmin : xmax + 1]
h, w = emblem_crop.shape

# Threshold limpo com anti-aliasing
alpha_crop = np.clip((emblem_crop - 40.0) / (130.0 - 40.0) * 255.0, 0, 255).astype(np.uint8)

rgba_crop = np.zeros((h, w, 4), dtype=np.uint8)
rgba_crop[:, :, 0] = 255
rgba_crop[:, :, 1] = 255
rgba_crop[:, :, 2] = 255
rgba_crop[:, :, 3] = alpha_crop

crop_img = Image.fromarray(rgba_crop, "RGBA")

# Canvas 1024x1024 transparente
canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
target_w = 880
target_h = int(h * (target_w / w))
resized = crop_img.resize((target_w, target_h), Image.Resampling.LANCZOS)

offset_x = (1024 - target_w) // 2
offset_y = (1024 - target_h) // 2
canvas.paste(resized, (offset_x, offset_y), resized)

# Salva PNGs em alta definição
os.makedirs("desktop/public", exist_ok=True)
os.makedirs("desktop/src/assets", exist_ok=True)
os.makedirs("desktop/src-tauri", exist_ok=True)

canvas.save("desktop/public/charlie-logo.png", format="PNG", optimize=True)
canvas.save("desktop/src/assets/charlie-logo.png", format="PNG", optimize=True)
canvas.save("desktop/src-tauri/app-icon.png", format="PNG", optimize=True)

# 2. Geração do SVG Vetorial Perfeito (Infinite Resolution)
alpha_map = np.array(canvas)[:, :, 3].astype(float)
alpha_smooth = gaussian_filter(alpha_map, 1.0)
contours = find_contours(alpha_smooth, 110)

svg_paths = []
for c in contours:
    pts = c[::2]  # subamostragem suave
    d_parts = [f"M {pts[0, 1]:.1f} {pts[0, 0]:.1f}"]
    for pt in pts[1:]:
        d_parts.append(f"L {pt[1]:.1f} {pt[0]:.1f}")
    d_parts.append("Z")
    svg_paths.append(" ".join(d_parts))

combined_d = " ".join(svg_paths)

svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="#F2F3F5" fill-rule="evenodd">
  <path d="{combined_d}" />
</svg>"""

with open("desktop/public/charlie-logo.svg", "w", encoding="utf-8") as f:
    f.write(svg_content)
with open("desktop/src/assets/charlie-logo.svg", "w", encoding="utf-8") as f:
    f.write(svg_content)

print(f"Sucesso! Gerados charlie-logo.png (1024x1024 HD transparente) e charlie-logo.svg vetorial ({len(contours)} contornos).")
