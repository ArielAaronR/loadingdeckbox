#!/usr/bin/env python3
"""Lid divider frame: a separate, press-fit frame that sits under the lid liner and splits the lid
into three bays (walls between the 01 · 02 · 03 numbers), so the liner itself stays a flat,
UV-printable plate.

What it does
  1. Reads the case meshes embedded in ../index.html (<script id="mesh"> and the Rectangle swap in
     <script id="plainEnds">), for both case versions.
  2. Sweeps every base-side part (base, bay insert, latch, clips) through the full lid swing
     (0-105 deg about the hinge) and cuts each divider wall's back edge so it never touches them.
  3. Builds the frame (front rail + end rails + back rail + two divider walls) as one watertight mesh.
  4. Writes print files to ../print/ (3MF, printed flat side down, no supports) and embeds the
     frame mesh + its footprint on the liner into index.html (<script id="lidDivider">) so the
     website can show it.

Usage (needs numpy + manifold3d):
  python3 -m venv .venv && .venv/bin/pip install numpy manifold3d
  .venv/bin/python tools/lid_divider.py              # defaults
  .venv/bin/python tools/lid_divider.py --end-gap 0.1 --wall 2.0

Coordinates are the website's: lid closed, x = front(-) to back(+), y = up, z = along the case
(bay 01 at -z). The liner's downward face is at y = 23.6.
"""
import argparse, base64, io, json, math, re, struct, sys, zipfile
from pathlib import Path
import numpy as np
from manifold3d import Manifold, CrossSection

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / 'index.html'

# ---- fixed case geometry (measured from the embedded meshes; see README "Lid divider") ----
TOP = 23.6                      # liner's downward face (frame's flat top presses here)
HINGE = (36.0, 21.25)           # lid hinge axis (x, y), along z
OPEN_DEG = 105
FRONT_X = -28.6                 # frame's front face: 0.7 mm off the lid front wall (clears the liner nubs at -28.8)
BACK_X = 28.6                   # frame's back face at the top (liner edge is 29.15)
BAY_Z = (-54.0, 0.0, 54.0)      # bay centres; bay openings are 50.8 mm circles
BAY_R = 25.4
DIV_Z = (-27.0, 27.0)           # divider walls: halfway between bays
LINER = dict(u0=-85.95, v0=29.15)   # liner (u, v) = (z - u0, v0 - x)
VERSIONS = {
    # end_face: inside face of the lid end skins (Lid inside 01/03) at the rail height
    # corner: hinge-corner blocks hanging under the liner (z range, x from) -> rails stay clear
    'loops': dict(name='Strap loops (v33)', file='3Bay_Lid_Divider_Strap_Loops.3mf', end_face=86.1,
                  base=['Base', 'Insert_Lower', 'Rocker', 'Clip_L', 'Clip_R'], lid='Lid', corner=(77.5, 20.0)),
    'plain': dict(name='Rectangle (v35)', file='3Bay_Lid_Divider_Rectangle.3mf', end_face=83.55,
                  base=['plain:Base', 'Insert_Lower', 'Rocker'], lid='plain:Lid', corner=(70.5, 20.0)),
}

def load_meshes():
    s = HTML.read_text()
    parts = json.loads(re.search(r'<script type="application/json" id="mesh">(.*?)</script>', s, re.S).group(1))
    plain = json.loads(re.search(r'<script type="application/json" id="plainEnds">(.*?)</script>', s, re.S).group(1))
    def dec(p):
        P = np.frombuffer(base64.b64decode(p['p']), dtype='<i2').astype(float).reshape(-1, 3) * 0.1
        I = np.frombuffer(base64.b64decode(p['i']), dtype='<u2').astype(int).reshape(-1, 3)
        return P, I
    M = {p['n']: dec(p) for p in parts}
    for k, v in plain['meshes'].items(): M['plain:' + k] = dec(v)
    return M

def slice_points(P, I, zs, step=0.25):
    """Points on the mesh surface where it crosses each plane z = const in `zs`, at most `step` mm apart."""
    T = P[I]
    out = []
    for z in zs:
        d = T[:, :, 2] - (z + 1e-6)
        hit = (d.min(axis=1) < 0) & (d.max(axis=1) > 0)
        if not hit.any(): continue
        Th, dh = T[hit], d[hit]
        E, M = [], []
        for a, b in ((0, 1), (1, 2), (2, 0)):
            da, db = dh[:, a], dh[:, b]
            m = (da * db) < 0
            f = np.where(m, da / np.where(m, da - db, 1), 0)[:, None]
            E.append(Th[:, a] + f * (Th[:, b] - Th[:, a])); M.append(m)
        p0 = np.where(M[0][:, None], E[0], E[1]); p1 = np.where(M[2][:, None], E[2], E[1])
        n = np.maximum(1, np.ceil(np.linalg.norm(p1 - p0, axis=1) / step).astype(int))
        k = np.repeat(np.arange(len(n)), n + 1)
        t = np.concatenate([np.linspace(0, 1, m + 1) for m in n])[:, None]
        out.append(p0[k] + t * (p1[k] - p0[k]))
    return np.vstack(out) if out else np.zeros((0, 3))

def swept(points, deg_step=1.0, reach=(60.0, 240.0)):
    """Base points expressed in the lid's frame for every opening angle 0..105 deg.
    Seen from the lid, base points orbit the hinge counter-clockwise as it opens, so only points whose
    angle about the hinge is within `reach` (degrees, measured from +x) can ever enter the lid's cavity."""
    cx, cy = HINGE
    ang = np.degrees(np.arctan2(points[:, 1] - cy, points[:, 0] - cx)) % 360
    points = points[(ang >= reach[0]) & (ang <= reach[1])]
    res = []
    for d in np.arange(0, OPEN_DEG + 1e-9, deg_step):
        a = math.radians(d); c, s = math.cos(a), math.sin(a)
        x, y = points[:, 0] - cx, points[:, 1] - cy
        res.append(np.column_stack([cx + x * c - y * s, cy + x * s + y * c, points[:, 2]]))
    return np.vstack(res)

def divider_profile(obst, zc, a):
    """(x, y) outline of one divider wall: front at FRONT_X, back edge cut to clear `obst` (swept base
    points), overhang <= 45 deg when printed upside down, bottom no lower than TOP - depth."""
    half = a.wall / 2 + a.clear
    band = obst[np.abs(obst[:, 2] - zc) <= half]
    dy = 0.25
    ys = np.arange(TOP, TOP - a.depth - 1e-9, -dy)
    rows = []
    prev = BACK_X
    for y in ys:
        near = band[np.abs(band[:, 1] - y) <= a.clear]
        near = near[near[:, 0] > FRONT_X - a.clear]
        xr = min(BACK_X, (near[:, 0].min() - a.clear) if len(near) else BACK_X)
        xr = min(xr, prev + dy)                 # 45 deg overhang when printed flat-side down
        if xr - FRONT_X < a.min_len: break      # wall would be too short to be useful: stop here
        rows.append((y, xr)); prev = xr
    # each row's limit must also respect the rows below it (the layer printed above it)
    for k in range(len(rows) - 2, -1, -1):
        y, xr = rows[k]; rows[k] = (y, min(xr, rows[k + 1][1] + dy))
    ybot = rows[-1][0]
    back = [(xr, y) for y, xr in rows]
    # simplify the staircase into a polyline (drop collinear-ish points)
    simp = [back[0]]
    for p in back[1:-1]:
        q, r = simp[-1], p
        if abs(r[0] - q[0]) > 0.05 or r is back[-2]: simp.append(p)
    simp.append(back[-1])
    poly = [(FRONT_X, TOP)] + simp + [(FRONT_X, ybot)]
    return poly, ybot

def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))

def wall(poly, zc, t):
    """Extrude an (x, y) outline along z, centred on zc."""
    if sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1])) < 0: poly = poly[::-1]   # CCW = solid
    cs = CrossSection([poly])
    return Manifold.extrude(cs, t).translate((0, 0, zc - t / 2))

def build(ver, meshes, a):
    V = VERSIONS[ver]
    # fine sweep in thin slices around each divider wall; coarse sweep of everything for the rail checks
    slab = a.wall / 2 + a.clear + 0.5
    zs_fine = np.concatenate([np.arange(zc - slab, zc + slab + 1e-9, 0.2) for zc in DIV_Z])
    fine = np.vstack([slice_points(*meshes[k], zs_fine, 0.2) for k in V['base']])
    obst = swept(fine, 1.0)
    zs_coarse = np.arange(-V['end_face'] - 1, V['end_face'] + 1, 0.75)
    coarse_pts = np.vstack([slice_points(*meshes[k], zs_coarse, 0.4) for k in V['base']])
    coarse = swept(coarse_pts, 1.5)
    coarse = coarse[(coarse[:, 0] > FRONT_X - 2) & (coarse[:, 0] < BACK_X + 2) & (coarse[:, 1] > 0) & (coarse[:, 1] < TOP + 1)]
    Ez = V['end_face'] - a.end_gap
    zc_corner, xc_corner = V['corner']
    parts, report = [], {}
    # rails (flat top against the liner)
    rh, rw = a.rail_h, a.rail_w
    parts.append(('front rail', box(FRONT_X, FRONT_X + rw, TOP - rh, TOP, -Ez, Ez)))
    for sgn in (-1, 1):
        z0, z1 = sorted((sgn * Ez, sgn * (Ez - rw)))
        parts.append(('end rail', box(FRONT_X, xc_corner - 0.5, TOP - rh, TOP, z0, z1)))
    parts.append(('back rail', box(BACK_X - rw, BACK_X, TOP - a.back_h, TOP, -(zc_corner - 1.5), zc_corner - 1.5)))
    for zc in DIV_Z:
        poly, ybot = divider_profile(obst, zc, a)
        parts.append(('divider', wall(poly, zc, a.wall)))
        report.setdefault('divider_depth_mm', round(TOP - ybot, 2))
    frame = parts[0][1]
    for _, m in parts[1:]: frame = frame + m
    # ---- checks ----
    lid_pts = slice_points(*meshes[V['lid']], np.arange(-V['end_face'] - 1, V['end_face'] + 1, 0.4), 0.25)
    problems = []
    for name, m in parts:
        b = m.bounding_box()  # (xmin, ymin, zmin, xmax, ymax, zmax)
        lo, hi = np.array(b[:3]), np.array(b[3:])
        if name != 'divider':
            hit = coarse[np.all((coarse >= lo - a.clear * 0.6) & (coarse <= hi + a.clear * 0.6), axis=1)]
            if len(hit): problems.append(f'{name}: {len(hit)} swept base points within {a.clear*0.6:.2f} mm')
        lh = lid_pts[np.all((lid_pts > lo + 0.05) & (lid_pts < hi - 0.05), axis=1)]
        # the lid's own walls touch the rails' outer faces by design; only count points well inside
        if len(lh): problems.append(f'{name}: {len(lh)} lid points inside it (lid feature in the way)')
    # bay clearance: walls vs bay openings (z only; the hinge axis is along z)
    gap = min(abs(abs(zc) - a.wall / 2 - abs(bz)) - BAY_R for zc in DIV_Z for bz in BAY_Z if abs(abs(zc) - abs(bz)) < BAY_R + 5)
    report['wall_to_bay_opening_mm'] = round(gap, 2)
    report['length_mm'] = round(2 * Ez, 2)
    report['problems'] = problems
    # footprint on the liner (u, v rectangles, liner mm) for the editor overlay
    fp = []
    def rect(x0, x1, z0, z1):
        u0, u1 = sorted((z0 - LINER['u0'], z1 - LINER['u0'])); v0, v1 = sorted((LINER['v0'] - x0, LINER['v0'] - x1))
        fp.append([round(u0, 2), round(v0, 2), round(u1, 2), round(v1, 2)])
    rect(FRONT_X, FRONT_X + rw, -Ez, Ez)
    for sgn in (-1, 1): rect(FRONT_X, xc_corner - 0.5, sgn * Ez, sgn * (Ez - rw))
    rect(BACK_X - rw, BACK_X, -(zc_corner - 1.5), zc_corner - 1.5)
    for zc in DIV_Z: rect(FRONT_X, BACK_X, zc - a.wall / 2, zc + a.wall / 2)
    return frame, fp, report

def mesh_arrays(m):
    g = m.to_mesh()
    return np.asarray(g.vert_properties)[:, :3].astype(float), np.asarray(g.tri_verts).astype(int)

def to_print(P):
    """Lid frame -> print bed: flat top (liner side) down, length along X. Proper rotation (no mirror)."""
    Q = np.column_stack([P[:, 2], -P[:, 0], TOP - P[:, 1]])
    return Q - Q.min(axis=0)

def write_3mf(path, name, P, I):
    v = '\n'.join(f'<vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>' for x, y, z in P)
    t = '\n'.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in I)
    model = f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">{name}</metadata>
<metadata name="Designer">Loading Deck</metadata>
<resources><object id="1" type="model" name="{name}"><mesh><vertices>
{v}
</vertices><triangles>
{t}
</triangles></mesh></object></resources>
<build><item objectid="1" transform="1 0 0 0 1 0 0 0 1 40 100 0"/></build>
</model>'''
    ct = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'''
    rels = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'''
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', ct); z.writestr('_rels/.rels', rels); z.writestr('3D/3dmodel.model', model)

def web_mesh(P, I):
    q = np.round(P * 10).astype('<i2')
    assert len(P) < 65536
    return {'p': base64.b64encode(q.tobytes()).decode(), 'i': base64.b64encode(I.astype('<u2').tobytes()).decode()}

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--wall', type=float, default=1.6, help='divider wall thickness, mm (default 1.6 = 4 lines at 0.4 mm)')
    ap.add_argument('--depth', type=float, default=22.6, help='max wall depth below the liner, mm (default 22.6 = down to 1 mm above the bay insert)')
    ap.add_argument('--clear', type=float, default=0.5, help='clearance to moving base parts, mm')
    ap.add_argument('--end-gap', type=float, default=0.0, help='gap at each end wall, mm (0 = press fit; raise to 0.1-0.2 if too tight)')
    ap.add_argument('--rail-w', type=float, default=3.0, help='rail width on the liner, mm')
    ap.add_argument('--rail-h', type=float, default=3.0, help='front/end rail height, mm')
    ap.add_argument('--back-h', type=float, default=1.6, help='back rail height, mm (low: the bay insert sits under it)')
    ap.add_argument('--min-len', type=float, default=12.0, help='shortest useful wall row, mm')
    ap.add_argument('--no-html', action='store_true', help="don't update index.html")
    a = ap.parse_args()
    meshes = load_meshes()
    embed, ok = {}, True
    for ver, V in VERSIONS.items():
        frame, fp, rep = build(ver, meshes, a)
        P, I = mesh_arrays(frame)
        st = str(frame.status())
        if not st.endswith('NoError') or frame.is_empty() or frame.genus() != 0 and False: print('  mesh status', st)
        bb = to_print(P).max(axis=0)
        write_3mf(ROOT / 'print' / V['file'], f"3-Bay lid divider - {V['name']}", to_print(P), I)
        embed[ver] = {'mesh': web_mesh(P, I), 'footprint': fp, 'file': 'print/' + V['file'],
                      'size': [round(float(x), 1) for x in bb], 'depth': rep['divider_depth_mm']}
        print(f"{V['name']}: {len(I)} triangles, print size {bb[0]:.1f} x {bb[1]:.1f} x {bb[2]:.1f} mm, "
              f"volume {frame.volume()/1000:.2f} cm3, wall depth {rep['divider_depth_mm']} mm, "
              f"wall-to-bay-opening {rep['wall_to_bay_opening_mm']} mm, length {rep['length_mm']} mm")
        for p in rep['problems']: print('  PROBLEM', p); ok = False
    if not a.no_html:
        s = HTML.read_text()
        tag = '<script type="application/json" id="lidDivider">' + json.dumps(embed, separators=(',', ':')) + '</script>'
        if 'id="lidDivider"' in s:
            s = re.sub(r'<script type="application/json" id="lidDivider">.*?</script>', lambda m: tag, s, flags=re.S)
        else:
            i = s.index('<script type="application/json" id="plainEnds">'); j = s.index('</script>', i) + len('</script>')
            s = s[:j] + '\n' + tag + s[j:]
        HTML.write_text(s)
        print('index.html updated')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
