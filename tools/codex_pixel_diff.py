#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""参考端 vs ARTEX 像素级对照。
用法: python tools/codex_pixel_diff.py <ref.png> <artex.png> [--css]
两张图必须同尺寸（1280x816 CSS @dpr1.5 => 1920x1224）。
输出：
  1) 命名采样点色差（只对"纯色区域"有意义）
  2) 行/列扫描出的结构边界位置差异（这是布局是否对齐的硬指标）
"""
import sys
from PIL import Image, ImageChops

def load(p):
    return Image.open(p).convert("RGB")

def edge_x(im, y, thr=6):
    """在 y 行扫描，返回颜色发生跳变的 x 列表。"""
    W, _ = im.size
    px = im.load()
    res = []
    prev = px[0, y]
    for x in range(1, W):
        c = px[x, y]
        if max(abs(c[i]-prev[i]) for i in range(3)) > thr:
            res.append(x)
        prev = c
    # 合并相邻（抗锯齿产生的连续跳变算一条边）
    merged = []
    for x in res:
        if merged and x - merged[-1][-1] <= 2:
            merged[-1].append(x)
        else:
            merged.append([x])
    return [int(sum(g)/len(g)) for g in merged]

def edge_y(im, x, thr=6):
    _, H = im.size
    px = im.load()
    res = []
    prev = px[x, 0]
    for y in range(1, H):
        c = px[x, y]
        if max(abs(c[i]-prev[i]) for i in range(3)) > thr:
            res.append(y)
        prev = c
    merged = []
    for y in res:
        if merged and y - merged[-1][-1] <= 2:
            merged[-1].append(y)
        else:
            merged.append([y])
    return [int(sum(g)/len(g)) for g in merged]

POINTS = [
    ("导轨底/窗口底", 20, 400),
    ("顶栏底", 640, 10),
    ("左下角", 2, 812),
    ("面板中部", 200, 300),
    ("面板下部", 200, 500),
    ("主表面中部", 800, 400),
    ("主表面右下", 1200, 700),
    ("输入区面板内", 800, 750),
    ("右下角4px内缩", 1270, 810),
]

def main():
    ref = load(sys.argv[1]); art = load(sys.argv[2])
    if ref.size != art.size:
        print("!! 尺寸不同: %s vs %s —— 无法逐像素比" % (ref.size, art.size))
    else:
        print("尺寸一致: %s" % (ref.size,))
    S = 1.5   # CSS -> 像素

    print("\n== 1) 命名采样点 ==")
    bad = 0
    for (name, cx, cy) in POINTS:
        x, y = int(cx*S), int(cy*S)
        if x >= ref.size[0] or y >= ref.size[1]:
            continue
        a, b = ref.getpixel((x, y)), art.getpixel((x, y))
        d = max(abs(a[i]-b[i]) for i in range(3))
        flag = "OK " if d <= 3 else ("~~ " if d <= 8 else "XX ")
        if d > 8: bad += 1
        print("  %s%-16s ref=%-18s artex=%-18s maxΔ=%d" % (flag, name, str(a), str(b), d))
    print("  明显不符点数: %d" % bad)

    print("\n== 2) 结构边界（行扫描，CSS 横坐标）==")
    rows = [30, 50, 70, 120, 400, 700, 780, 810]
    for cy in rows:
        y = int(cy*S)
        if y >= ref.size[1]: continue
        er = [round(x/S, 1) for x in edge_x(ref, y)]
        ea = [round(x/S, 1) for x in edge_x(art, y)]
        print("  y=%-4d ref  : %s" % (cy, er[:14]))
        print("         artex: %s" % (ea[:14]))

    print("\n== 3) 结构边界（列扫描，CSS 纵坐标）==")
    cols = [20, 200, 340, 800, 1240]
    for cx in cols:
        x = int(cx*S)
        if x >= ref.size[0]: continue
        er = [round(y/S, 1) for y in edge_y(ref, x)]
        ea = [round(y/S, 1) for y in edge_y(art, x)]
        print("  x=%-4d ref  : %s" % (cx, er[:14]))
        print("         artex: %s" % (ea[:14]))

if __name__ == "__main__":
    main()
