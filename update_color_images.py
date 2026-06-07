import pathlib

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
    
    # Find the data-color-images attribute
    marker = "data-color-images="
    start_idx = html.find(marker)
    # Find the opening single-quote of the array value
    after_marker = html[start_idx + len(marker):]
    open_quote = after_marker.find("'")
    # Find the closing single-quote
    close_quote = after_marker.find("'", open_quote + 1)
    
    start_pos = start_idx + len(marker) + open_quote
    end_pos = start_idx + len(marker) + close_quote
    
    # Build new value as a multiline array
    quote_char = "'"
    arr_parts = [f"                    {quote_char}{img}{quote_char}" for img in color_images]
    new_value = "[" + "\n" + ",\n".join(arr_parts) + "\n                    " + quote_char + "]"
    
    # Replace the value
    new_html = html[:start_pos] + new_value + html[end_pos + 1:]
    p.write_text(new_html)
    print(f"Updated {filepath}: {len(color_images)} color images wired up")

print("\nAll product pages now have per-color images!")
