import pathlib
import re

target = pathlib.Path("/Users/jewelbait/Bass Binge Website")

products_and_images = [
    ("products/heavy-cover-football.html", [
        "../assets/img/products/hcf-34-magic-brownie.jpg",
        "../assets/img/products/hcf-34-fruit-fly.jpg",
        "../assets/img/products/hcf-34-ryry-special.jpg",
        "../assets/img/products/hcf-34-chartreuse.jpg",
        "../assets/img/products/hcf-34-black-blue.jpg",
        "../assets/img/products/hcf-34-junebug.jpg"
    ]),
    ("products/peewee-football.html", [
        "../assets/img/products/pwf-716-magic-brownie.jpg",
        "../assets/img/products/pwf-716-fruit-fly.jpg",
        "../assets/img/products/pwf-716-ryry-special.jpg",
        "../assets/img/products/pwf-716-chartreuse.jpg",
        "../assets/img/products/pwf-716-black-blue.jpg",
        "../assets/img/products/pwf-716-junebug.jpg"
    ]),
    ("products/peewee-football-hd.html", [
        "../assets/img/products/pwf-hd-12-magic-brownie.jpg",
        "../assets/img/products/pwf-hd-12-fruit-fly.jpg",
        "../assets/img/products/pwf-hd-12-ryry-special.jpg",
        "../assets/img/products/pwf-hd-12-chartreuse.jpg",
        "../assets/img/products/pwf-hd-12-black-blue.jpg",
        "../assets/img/products/pwf-hd-12-junebug.jpg"
    ]),
    ("products/peewee-spider-hd.html", [
        "../assets/img/products/pshd-magic-brownie.jpg",
        "../assets/img/products/pshd-fruit-fly.jpg",
        "../assets/img/products/pshd-ryry-special.jpg",
        "../assets/img/products/pshd-chartreuse.jpg",
        "../assets/img/products/pshd-black-blue.jpg",
        "../assets/img/products/pshd-junebug.jpg"
    ])
]

for filepath, color_images in products_and_images:
    p = target / filepath
    html = p.read_text()
    
    # Create the new value string: '["img1.jpg", "img2.jpg", ...]'
    arr_str = "[" + ", ".join('"' + img + '"' for img in color_images) + "]"
    new_value = "'" + arr_str + "'"
    
    # Find and replace the data-color-images attribute value
    pattern = r"data-color-images='[^']*'" 
    if re.search(pattern, html):
        new_html = re.sub(pattern, "data-color-images=" + new_value, html)
        p.write_text(new_html)
        print(f"OK: {filepath} - {len(color_images)} images")
    else:
        print(f"FAIL: {filepath} - pattern not found")

# Verify all 4
for filepath, _ in products_and_images:
    p = target / filepath
    html = p.read_text()
    count = html.count("href=\"../assets/img/products/")
    color_imgs = re.findall(r"href=\"../assets/img/products/\w+-[a-z-]+\.jpg\"", html)
    print(f"{filepath}: {len(color_imgs)} color images found")
