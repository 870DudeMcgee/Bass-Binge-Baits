import pathlib
import json

target = pathlib.Path("/Users/jewelbait/Bass Binge Website")

# Product files and their color image mappings
products = {
    "products/heavy-cover-football.html": [
        "../assets/img/products/hcf-34-magic-brownie.jpg",
        "../assets/img/products/hcf-34-fruit-fly.jpg",
        "../assets/img/products/hcf-34-ryry-special.jpg",
        "../assets/img/products/hcf-34-chartreuse.jpg",
        "../assets/img/products/hcf-34-black-blue.jpg",
        "../assets/img/products/hcf-34-junebug.jpg"
    ],
    "products/peewee-football.html": [
        "../assets/img/products/pwf-716-magic-brownie.jpg",
        "../assets/img/products/pwf-716-fruit-fly.jpg",
        "../assets/img/products/pwf-716-ryry-special.jpg",
        "../assets/img/products/pwf-716-chartreuse.jpg",
        "../assets/img/products/pwf-716-black-blue.jpg",
        "../assets/img/products/pwf-716-junebug.jpg"
    ],
    "products/peewee-football-hd.html": [
        "../assets/img/products/pwf-hd-12-magic-brownie.jpg",
        "../assets/img/products/pwf-hd-12-fruit-fly.jpg",
        "../assets/img/products/pwf-hd-12-ryry-special.jpg",
        "../assets/img/products/pwf-hd-12-chartreuse.jpg",
        "../assets/img/products/pwf-hd-12-black-blue.jpg",
        "../assets/img/products/pwf-hd-12-junebug.jpg"
    ],
    "products/peewee-spider-hd.html": [
        "../assets/img/products/pshd-magic-brownie.jpg",
        "../assets/img/products/pshd-fruit-fly.jpg",
        "../assets/img/products/pshd-ryry-special.jpg",
        "../assets/img/products/pshd-chartreuse.jpg",
        "../assets/img/products/pshd-black-blue.jpg",
        "../assets/img/products/pshd-junebug.jpg"
    ]
}

for filepath, color_images in products.items():
    p = target / filepath
    html = p.read_text()
    
    # Find the data-color-images attribute - it currently has bad quotes, we need to fix the whole thing
    # Look for data-color-images= followed by the malformed array
    marker = "data-color-images="
    start_idx = html.find(marker)
    if start_idx == -1:
        print(f"ERROR: Could not find marker in {filepath}")
        continue
    
    # Find everything after "data-color-images=" until the next attribute or ">"
    after_marker = html[start_idx + len(marker):]
    
    # The old format was: '["image.jpg"]'
    # We want: '["img1", "img2", ...]'
    # Find the opening quote
    open_q = after_marker.find("'")
    if open_q == -1:
        print(f"ERROR: No opening quote in {filepath}")
        continue
    
    # Find closing quote and bracket
    close_q = after_marker.find("'", open_q + 1)
    
    # Replace the value between quotes
    new_value = json.dumps(color_images)
    new_html = html[:start_idx + len(marker)] + "'" + new_value + "'" + html[close_q + 1:]
    p.write_text(new_html)
    print(f"Updated {filepath}: {len(color_images)} color images wired up")
    print(f"  New value: {new_value}")

print("\nAll product pages now have per-color images!")
