"""
Utility script to process and format AI-generated character sprite sheets
for Virtual Ramlila Ground.

Standard Virtual Ground Sprite Sheet Format:
- Total Size: 216 x 192 pixels
- Grid: 6 columns x 4 rows (24 frames total)
- Frame Size: 36 x 48 pixels
- Direction Rows:
    Row 0 (y=0..48):   Down / South (walking forward)
    Row 1 (y=48..96):  Left / West
    Row 2 (y=96..144): Right / East
    Row 3 (y=144..192): Up / North (walking away)

Usage:
    python scripts/process_spritesheet.py input_image.png public/assets/characters/player2.png
"""

import sys
from PIL import Image

def process_sheet(input_path: str, output_path: str):
    im = Image.open(input_path).convert("RGBA")
    
    TARGET_WIDTH = 216
    TARGET_HEIGHT = 192
    
    # Resize to exact target dimensions using Lanczos filter for clean pixel detail
    resized = im.resize((TARGET_WIDTH, TARGET_HEIGHT), Image.Resampling.LANCZOS)
    
    # Save with transparent PNG
    resized.save(output_path, format="PNG")
    print(f"Successfully processed sprite sheet saved to {output_path} ({TARGET_WIDTH}x{TARGET_HEIGHT})")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/process_spritesheet.py <input_path> <output_path>")
        sys.exit(1)
    process_sheet(sys.argv[1], sys.argv[2])
