"""Prints the screen center "x y" of the first node whose text or content-desc matches a pattern.
Usage: smoke_find.py <ui.xml> <regex>   (exit 1 when nothing matches)"""
import re
import sys
import xml.etree.ElementTree as ET

path, pattern = sys.argv[1], re.compile(sys.argv[2], re.I)
try:
    root = ET.parse(path).getroot()
except Exception:
    sys.exit(1)
nodes = list(root.iter('node'))
# Buttons first, so a dialog title that repeats the button's words isn't the one tapped.
for only_clickable in (True, False):
    for node in nodes:
        if only_clickable and node.get('clickable') != 'true':
            continue
        label = f"{node.get('content-desc', '')}|{node.get('text', '')}"
        if pattern.search(label):
            m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                print((x1 + x2) // 2, (y1 + y2) // 2)
                sys.exit(0)
sys.exit(1)
