"""Bundles index.html + css + js into one self-contained dist/duo-ludo.html"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '<style>\n' + (root / m.group(1)).read_text() + '\n</style>', html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>\n' + (root / m.group(1)).read_text() + '\n</script>', html)
# Brand mark is inline SVG, so the standalone build has no external image dependency.
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'duo-ludo.html').write_text(html)
print('built', len(html)//1024, 'KB')
