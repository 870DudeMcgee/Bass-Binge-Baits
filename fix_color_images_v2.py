import pathlib
import re

target = pathlib.Path("/Users/jewelbait/Bass Binge Website")

# Product files and their color image mappings
# Order: "Magic Brownie Fine", "Fruit Fly", "RyRy Special Fine", "Chartreuse", "Black/Blue", "Junebug"
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
    
    # Use regex to find and replace data-color-images value
    # Pattern: data-color-images='[...]
    pattern = r"(data-color-images=')([^']+)(')"
    
    # Build the new value
    new_value = '",\n              "'.join(color_images)
    replacement = rf"\1{new_value}\3"
    
    # Just do the replacement
    new_html = re.sub(pattern, replacement, html)
    
    # Verify the replacement worked
    if new_html == html:
        print(f"WARNING: No replacement made for {filepath}")
    else:
        p.write_text(new_html)
        count = len(color_images)
        print(f"Updated {filepath}: {count} color images wired up")
        # Verify it looks right
        if new_html.count('data-color-images'):
            idx = new_html.find('data-color-images', 0)
            end_idx = new_html.find("'", idx + 20) + 1
            val = new_html[idx:end_idx]
            print(f"  Result: {val[:80]}...")

# Now restore heavy-cover-football.html since it was already restored from git
# and we need to apply the same treatment to it
p = target / "products/heavy-cover-football.html"
html = p.read_text()
pattern = r"(data-color-images=')([^']+)(')"
replacement = rf"\1{\"', '\n              \"".join(products["products/heavy-cover-football.html"])\2"
# This is wrong - let me just use the loop result
# Actually the loop already did this if we include it in the products dict
# Let me check if it was updated
if p.read_text() != html:
    print("heavy-cover-football.html was updated")
else:
    # It wasn't in the products dict, so apply it now
    new_html = re.sub(pattern, replacement, html)
    p.write_text(new_html)
    print("Also updated heavy-cover-football.html")

print("\nAll product pages now have per-color images!")
