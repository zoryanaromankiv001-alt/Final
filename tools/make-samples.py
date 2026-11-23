#!/usr/bin/env python3
"""
Generate realistic synthetic microbiology sample images for ColonyVision Lab.
- samples/bacterial-plate.jpg: E. coli on nutrient agar
- samples/staph-blood-agar.jpg: S. aureus on blood agar
- samples/yeast-cell-culture.jpg: S. cerevisiae yeast cells on hemocytometer grid
- samples/ground-truth.json: Ground truth colony counts, coordinates, and metrics
"""

import math
import random
import json
from PIL import Image, ImageDraw, ImageFilter

def make_bacterial_plate():
    random.seed(42)
    w, h = 1000, 1000
    cx, cy = 500, 500
    dish_r = 430
    
    # 1. Background bench (neutral dark slate lab bench)
    img = Image.new("RGB", (w, h), (38, 42, 50))
    draw = ImageDraw.Draw(img)
    
    # Bench texture noise
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            if (x - cx)**2 + (y - cy)**2 > dish_r**2:
                n = random.randint(-4, 4)
                r, g, b = pixels[x, y]
                pixels[x, y] = (max(0, min(255, r+n)), max(0, min(255, g+n)), max(0, min(255, b+n)))
                
    # 2. Outer Petri dish rim & drop shadow
    draw.ellipse((cx - dish_r - 12, cy - dish_r - 6, cx + dish_r + 12, cy + dish_r + 18), fill=(25, 28, 35))
    draw.ellipse((cx - dish_r - 6, cy - dish_r - 6, cx + dish_r + 6, cy + dish_r + 6), fill=(65, 72, 85), outline=(130, 140, 160), width=4)
    
    # 3. Nutrient Agar interior (warm translucent amber/cream)
    agar_color = (236, 222, 185)
    draw.ellipse((cx - dish_r, cy - dish_r, cx + dish_r, cy + dish_r), fill=agar_color)
    
    # Agar subtle lighting gradient & plastic reflections
    for y in range(cy - dish_r, cy + dish_r):
        for x in range(cx - dish_r, cx + dish_r):
            dist_sq = (x - cx)**2 + (y - cy)**2
            if dist_sq < dish_r**2:
                # Radial gradient toward rim
                factor = 1.0 - (dist_sq / (dish_r**2)) * 0.12
                # Top-left soft highlight
                hl = max(0, 1.0 - (math.hypot(x - (cx - 150), y - (cy - 150)) / 400.0)) * 25
                noise = random.randint(-2, 2)
                r = int(agar_color[0] * factor + hl + noise)
                g = int(agar_color[1] * factor + hl + noise)
                b = int(agar_color[2] * factor + hl + noise)
                pixels[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
                
    # Dish plastic edge inner bevel
    draw.ellipse((cx - dish_r, cy - dish_r, cx + dish_r, cy + dish_r), outline=(190, 175, 140), width=3)
    draw.ellipse((cx - dish_r + 6, cy - dish_r + 6, cx + dish_r - 6, cy + dish_r - 6), outline=(245, 235, 205), width=2)
    
    # 4. Generate ~84 distinct colonies
    colonies = []
    target_count = 84
    min_agar_r = 15
    max_agar_r = dish_r - 35
    
    attempts = 0
    while len(colonies) < target_count and attempts < 2000:
        attempts += 1
        # Random position within circular agar
        theta = random.uniform(0, 2 * math.pi)
        rad = math.sqrt(random.uniform(min_agar_r**2, max_agar_r**2))
        col_x = cx + rad * math.cos(theta)
        col_y = cy + rad * math.sin(theta)
        
        # Colony radius (most are small-medium: 5px to 14px radius)
        col_r = random.gauss(8.5, 2.5)
        col_r = max(4.0, min(16.0, col_r))
        
        # Check collision with existing colonies (allow occasional touching)
        too_close = False
        for ex, ey, er in colonies:
            if math.hypot(col_x - ex, col_y - ey) < (col_r + er - 2):
                too_close = True
                break
        if not too_close:
            colonies.append((col_x, col_y, col_r))
            
    # Draw colonies with realistic 3D dome appearance
    for col_x, col_y, col_r in colonies:
        ix, iy, ir = int(col_x), int(col_y), int(col_r)
        # Subtle drop shadow
        draw.ellipse((ix - ir, iy - ir + 1, ix + ir + 2, iy + ir + 3), fill=(185, 165, 130))
        # Base colony body (semi-opaque creamy white/ivory)
        draw.ellipse((ix - ir, iy - ir, ix + ir, iy + ir), fill=(255, 250, 235), outline=(215, 195, 160), width=1)
        # Raised 3D dome highlight
        hl_r = max(1, ir - 3)
        draw.ellipse((ix - hl_r - 1, iy - hl_r - 1, ix + hl_r - 1, iy + hl_r - 1), fill=(255, 255, 248))
        
    # Apply soft blur for optical camera lens realism
    img = img.filter(ImageFilter.GaussianBlur(radius=0.4))
    img.save("samples/bacterial-plate.jpg", "JPEG", quality=92)
    return [{"id": i+1, "x": round(c[0], 1), "y": round(c[1], 1), "r": round(c[2], 1)} for i, c in enumerate(colonies)]

def make_staph_blood_agar():
    random.seed(101)
    w, h = 1000, 1000
    cx, cy = 500, 500
    dish_r = 430
    
    img = Image.new("RGB", (w, h), (30, 32, 38))
    draw = ImageDraw.Draw(img)
    
    # Outer dish rim
    draw.ellipse((cx - dish_r - 10, cy - dish_r - 6, cx + dish_r + 10, cy + dish_r + 16), fill=(20, 22, 28))
    draw.ellipse((cx - dish_r - 5, cy - dish_r - 5, cx + dish_r + 5, cy + dish_r + 5), fill=(60, 65, 75), outline=(120, 130, 145), width=3)
    
    # Blood agar interior (deep crimson/ruby red)
    agar_color = (135, 24, 30)
    draw.ellipse((cx - dish_r, cy - dish_r, cx + dish_r, cy + dish_r), fill=agar_color)
    
    pixels = img.load()
    for y in range(cy - dish_r, cy + dish_r):
        for x in range(cx - dish_r, cx + dish_r):
            dist_sq = (x - cx)**2 + (y - cy)**2
            if dist_sq < dish_r**2:
                factor = 1.0 - (dist_sq / (dish_r**2)) * 0.15
                hl = max(0, 1.0 - (math.hypot(x - (cx - 160), y - (cy - 160)) / 380.0)) * 20
                noise = random.randint(-3, 3)
                r = int(agar_color[0] * factor + hl + noise)
                g = int(agar_color[1] * factor + hl + noise)
                b = int(agar_color[2] * factor + hl + noise)
                pixels[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
                
    draw.ellipse((cx - dish_r, cy - dish_r, cx + dish_r, cy + dish_r), outline=(90, 15, 20), width=3)
    
    # S. aureus golden colonies with beta-hemolysis clear halo
    colonies = []
    target_count = 110
    attempts = 0
    while len(colonies) < target_count and attempts < 3000:
        attempts += 1
        theta = random.uniform(0, 2 * math.pi)
        rad = math.sqrt(random.uniform(20**2, (dish_r - 40)**2))
        col_x = cx + rad * math.cos(theta)
        col_y = cy + rad * math.sin(theta)
        col_r = random.gauss(7.0, 2.0)
        col_r = max(3.5, min(14.0, col_r))
        
        too_close = False
        for ex, ey, er in colonies:
            if math.hypot(col_x - ex, col_y - ey) < (col_r + er - 1):
                too_close = True
                break
        if not too_close:
            colonies.append((col_x, col_y, col_r))
            
    # Draw hemolytic halo & golden colony
    for col_x, col_y, col_r in colonies:
        ix, iy, ir = int(col_x), int(col_y), int(col_r)
        # Beta-hemolytic halo (lighter, translucent brownish-amber ring around colony)
        halo_r = int(ir * 1.8)
        draw.ellipse((ix - halo_r, iy - halo_r, ix + halo_r, iy + halo_r), fill=(168, 55, 45))
        # Golden-yellow colony
        draw.ellipse((ix - ir, iy - ir, ix + ir, iy + ir), fill=(248, 208, 72), outline=(205, 160, 40), width=1)
        # Highlight
        hl_r = max(1, ir - 2)
        draw.ellipse((ix - hl_r, iy - hl_r - 1, ix + hl_r - 1, iy + hl_r - 1), fill=(255, 235, 140))
        
    img = img.filter(ImageFilter.GaussianBlur(radius=0.4))
    img.save("samples/staph-blood-agar.jpg", "JPEG", quality=92)
    return [{"id": i+1, "x": round(c[0], 1), "y": round(c[1], 1), "r": round(c[2], 1)} for i, c in enumerate(colonies)]

def make_yeast_culture():
    random.seed(303)
    w, h = 1000, 1000
    
    # Microscope brightfield background (pale cool gray/blue)
    img = Image.new("RGB", (w, h), (220, 226, 232))
    draw = ImageDraw.Draw(img)
    
    # Hemocytometer etched grid lines (triple lines and single lines)
    grid_step = 100
    for x in range(50, w, grid_step):
        draw.line([(x, 0), (x, h)], fill=(185, 195, 205), width=1)
        if x % 300 == 50:
            draw.line([(x-2, 0), (x-2, h)], fill=(175, 185, 195), width=1)
            draw.line([(x+2, 0), (x+2, h)], fill=(175, 185, 195), width=1)
    for y in range(50, h, grid_step):
        draw.line([(0, y), (w, y)], fill=(185, 195, 205), width=1)
        if y % 300 == 50:
            draw.line([(0, y-2), (w, y-2)], fill=(175, 185, 195), width=1)
            draw.line([(0, y+2), (w, y+2)], fill=(175, 185, 195), width=1)
            
    # Vignette & microscope illumination center brightness
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            d = math.hypot(x - 500, y - 500)
            factor = max(0.82, 1.08 - (d / 700.0) * 0.28)
            n = random.randint(-2, 2)
            r, g, b = pixels[x, y]
            pixels[x, y] = (max(0, min(255, int(r*factor+n))), max(0, min(255, int(g*factor+n))), max(0, min(255, int(b*factor+n))))
            
    # Yeast cells (ovoid, bright cytoplasm, refractive dark cell wall, occasional budding pair)
    cells = []
    target_count = 135
    attempts = 0
    while len(cells) < target_count and attempts < 3000:
        attempts += 1
        cx = random.uniform(50, w - 50)
        cy = random.uniform(50, h - 50)
        cr = random.gauss(6.5, 1.8)
        cr = max(3.5, min(12.0, cr))
        
        too_close = False
        for ex, ey, er in cells:
            if math.hypot(cx - ex, cy - ey) < (cr + er - 1):
                too_close = True
                break
        if not too_close:
            cells.append((cx, cy, cr))
            # 25% chance of budding daughter cell attached
            if random.random() < 0.25 and len(cells) < target_count:
                bud_r = cr * random.uniform(0.45, 0.75)
                angle = random.uniform(0, 2*math.pi)
                bx = cx + (cr + bud_r - 1.5) * math.cos(angle)
                by = cy + (cr + bud_r - 1.5) * math.sin(angle)
                cells.append((bx, by, bud_r))
                
    for cx, cy, cr in cells:
        ix, iy, ir = int(cx), int(cy), int(cr)
        # Refractive dark cell wall (contour boundary)
        draw.ellipse((ix - ir, iy - ir, ix + ir, iy + ir), fill=(245, 250, 255), outline=(55, 65, 75), width=2)
        # Bright central illumination
        cr_in = max(1, ir - 2)
        draw.ellipse((ix - cr_in, iy - cr_in, ix + cr_in, iy + cr_in), fill=(255, 255, 255))
        
    img = img.filter(ImageFilter.GaussianBlur(radius=0.35))
    img.save("samples/yeast-cell-culture.jpg", "JPEG", quality=92)
    return [{"id": i+1, "x": round(c[0], 1), "y": round(c[1], 1), "r": round(c[2], 1)} for i, c in enumerate(cells)]

def main():
    print("Generating samples...")
    bac_ground = make_bacterial_plate()
    staph_ground = make_staph_blood_agar()
    yeast_ground = make_yeast_culture()
    
    ground_truth = {
        "bacterial-plate.jpg": {
            "name": "E. coli CFU Assay (Nutrient Agar)",
            "count": len(bac_ground),
            "dish_center": [500, 500],
            "dish_radius": 430,
            "colonies": bac_ground
        },
        "staph-blood-agar.jpg": {
            "name": "S. aureus Beta-Hemolysis (Blood Agar)",
            "count": len(staph_ground),
            "dish_center": [500, 500],
            "dish_radius": 430,
            "colonies": staph_ground
        },
        "yeast-cell-culture.jpg": {
            "name": "S. cerevisiae Hemocytometer Culture",
            "count": len(yeast_ground),
            "dish_center": None,
            "dish_radius": None,
            "colonies": yeast_ground
        }
    }
    
    with open("samples/ground-truth.json", "w", encoding="utf-8") as f:
        json.dump(ground_truth, f, indent=2)
    print(f"Generated samples/ground-truth.json: {len(bac_ground)} bacterial colonies, {len(staph_ground)} staph colonies, {len(yeast_ground)} yeast cells.")

if __name__ == "__main__":
    main()
