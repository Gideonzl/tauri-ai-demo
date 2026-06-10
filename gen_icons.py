import os, struct, zlib

icon_dir = os.path.join(os.path.dirname(__file__), 'src-tauri', 'icons')
os.makedirs(icon_dir, exist_ok=True)

# === icon.ico (16x16, 32-bit BGRA, dark blue #1a1a2e) ===
width, height, bpp = 16, 16, 32
image_size = width * height * 4
and_mask_size = height * ((width + 31) // 32) * 4
data_size = 40 + image_size + and_mask_size

header = struct.pack('<HHH', 0, 1, 1)
entry = struct.pack('<BBBBHHII', width, height, 0, 0, 1, bpp, data_size, 6 + 16)
bmp_header = struct.pack('<IiiHHIIiiII', 40, width, height * 2, 1, bpp, 0, image_size, 0, 0, 0, 0)
pixel = bytes([0x2e, 0x1a, 0x1a, 0xff])
pixels = pixel * (width * height)
and_mask = bytes(and_mask_size)

ico_path = os.path.join(icon_dir, 'icon.ico')
with open(ico_path, 'wb') as f:
    f.write(header + entry + bmp_header + pixels + and_mask)
print(f'icon.ico: {os.path.getsize(ico_path)} bytes')

# === PNG generator ===
def make_png(w, h, r, g, b, a=255):
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            raw += bytes([r, g, b, a])
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend

# Generate all required PNG sizes
png_files = {
    '32x32.png': 32,
    '128x128.png': 128,
    '128x128@2x.png': 256,
    'icon.png': 32,
}

for name, size in png_files.items():
    png = make_png(size, size, 0x1a, 0x1a, 0x2e)
    path = os.path.join(icon_dir, name)
    with open(path, 'wb') as f:
        f.write(png)
    print(f'{name}: {os.path.getsize(path)} bytes')

# icon.icns (macOS) - just copy the 128x128 PNG as placeholder
# Tauri on Windows doesn't actually need .icns
icns_src = os.path.join(icon_dir, '128x128.png')
icns_dst = os.path.join(icon_dir, 'icon.icns')
with open(icns_src, 'rb') as src, open(icns_dst, 'wb') as dst:
    dst.write(src.read())
print(f'icon.icns: {os.path.getsize(icns_dst)} bytes (placeholder)')

print('\nAll icons generated!')
