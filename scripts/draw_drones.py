# Flat front-elevated illustrations of DJI drones, traced by eye from DJI's
# product photos (Air 3S front shot used as the layout for the folding drones).
import math, sys

OUT = sys.argv[1]
INK = "#111111"
SW = 2.6
O = f'stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round" stroke-linecap="round"'
ORANGE = "#F2A33A"
SHADOW = '<ellipse cx="170" cy="164" rx="96" ry="5" fill="#111111" fill-opacity="0.12"/>'

def svg(body, vb="-18 0 376 170"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="376" height="170">'
            f'{SHADOW}{body}</svg>')

def blade(hx, hy, tx, ty, w, fill, tip=True):
    """Tapered prop blade from hub (hx,hy) to tip (tx,ty)."""
    dx, dy = tx - hx, ty - hy
    L = math.hypot(dx, dy); nx, ny = -dy / L, dx / L
    mx, my = hx + dx * 0.45, hy + dy * 0.45
    p = (f'M{hx:.1f},{hy:.1f} Q{mx + nx*w:.1f},{my + ny*w:.1f} {tx:.1f},{ty:.1f} '
         f'Q{mx - nx*w*0.35:.1f},{my - ny*w*0.35:.1f} {hx:.1f},{hy:.1f}Z')
    s = f'<path d="{p}" fill="{fill}" {O}/>'
    if tip:
        ex, ey = hx + dx * 0.86, hy + dy * 0.86
        s += f'<path d="M{ex:.1f},{ey:.1f} L{tx:.1f},{ty:.1f}" stroke="{ORANGE}" stroke-width="{w*0.55:.1f}" stroke-linecap="round"/>'
    return s

def prop(hx, hy, angle, length, w, fill, tip):
    a = math.radians(angle)
    t1 = (hx + math.cos(a) * length, hy - math.sin(a) * length * 0.55)
    t2 = (hx - math.cos(a) * length, hy + math.sin(a) * length * 0.55)
    return blade(hx, hy, *t1, w, fill, tip) + blade(hx, hy, *t2, w, fill, tip)

def motor(x, y, r, fill):
    return (f'<rect x="{x-r:.1f}" y="{y-r*0.9:.1f}" width="{2*r:.1f}" height="{r*1.8:.1f}" rx="{r*0.45:.1f}" fill="{fill}" {O}/>'
            f'<ellipse cx="{x}" cy="{y-r*0.9:.1f}" rx="{r:.1f}" ry="{r*0.4:.1f}" fill="{fill}" {O}/>')

def arm(x1, y1, x2, y2, w, fill):
    # an outlined thick arm: draw dark outline then fill
    return (f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{INK}" stroke-width="{w+SW*2:.1f}" stroke-linecap="round"/>'
            f'<path d="M{x1},{y1} L{x2},{y2}" stroke="{fill}" stroke-width="{w:.1f}" stroke-linecap="round"/>')

def foldable(c):
    """Mini / Air / Mavic share DJI's folding layout."""
    s = ""
    # rear arms, motors, props (behind body)
    for sx in (-1, 1):
        mx = 170 + sx * c["rear_dx"]; my = c["rear_y"]
        s += arm(170 + sx * 22, 64, mx, my + 4, c["arm_w"], c["arm"])
        s += motor(mx, my, c["motor_r"], c["motor"])
        s += prop(mx, my - c["motor_r"] * 0.9, 28 if sx < 0 else 152, c["prop_l"], c["prop_w"], c["prop"], c["tips"])
    # body
    s += c["body_svg"]
    # front arms, legs, motors, props
    for sx in (-1, 1):
        mx = 170 + sx * c["front_dx"]; my = c["front_y"]
        s += arm(170 + sx * 26, 92, mx, my + 4, c["arm_w"] + 1, c["arm"])
        if c.get("legs"):
            lx = mx + sx * -c["leg_in"]
            s += arm(mx, my + 6, lx, my + c["leg_h"], c["arm_w"] - 1, c["arm"])
        s += motor(mx, my, c["motor_r"] + 0.5, c["motor"])
        s += prop(mx, my - c["motor_r"] * 0.9, 152 if sx < 0 else 28, c["prop_l"] + 4, c["prop_w"] + 0.5, c["prop"], c["tips"])
    s += c["gimbal_svg"]
    return svg(s)

def eye(x, y, r):
    return (f'<circle cx="{x}" cy="{y}" r="{r}" fill="#2B2D31" {O}/>'
            f'<circle cx="{x - r*0.3:.1f}" cy="{y - r*0.3:.1f}" r="{r*0.3:.1f}" fill="#FFFFFF"/>')

# ---------------------------------------------------------------- Mini 4 Pro
mini_body = (
    f'<path d="M150,46 C150,36 158,32 170,32 C182,32 190,36 190,46 L196,96 C196,104 186,108 170,108 '
    f'C154,108 144,104 144,96 Z" fill="#ECECE8" {O}/>'
    f'<path d="M158,40 C158,34 182,34 182,40 L180,52 L160,52 Z" fill="#D7D7D2" {O}/>'
    + eye(156, 84, 7) + eye(184, 84, 7)
)
mini_gimbal = (
    f'<path d="M160,98 L180,98 L180,108 L160,108 Z" fill="#D7D7D2" {O}/>'
    f'<rect x="155" y="106" width="30" height="26" rx="7" fill="#2B2D31" {O}/>'
    f'<circle cx="170" cy="119" r="8" fill="#5B5F66" {O}/>'
    f'<circle cx="170" cy="119" r="3.5" fill="#111111"/><circle cx="167" cy="116" r="1.6" fill="#FFFFFF"/>'
)
mini = foldable(dict(
    rear_dx=80, rear_y=40, front_dx=118, front_y=86, arm_w=6, arm="#ECECE8", motor="#ECECE8", motor_r=6,
    prop="#4A4D52", prop_l=50, prop_w=8, tips=True, legs=True, leg_in=4, leg_h=34,
    body_svg=mini_body, gimbal_svg=mini_gimbal))

# ---------------------------------------------------------------- Air 3S
air_body = (
    f'<path d="M146,50 C146,36 154,30 162,32 L170,36 L178,32 C186,30 194,36 194,50 L200,96 '
    f'C200,104 188,108 170,108 C152,108 140,104 140,96 Z" fill="#B4B7BB" {O}/>'
    + eye(152, 86, 6) + eye(188, 86, 6)
)
air_gimbal = (
    f'<rect x="150" y="96" width="40" height="8" rx="3" fill="#2B2D31" {O}/>'
    f'<rect x="149" y="102" width="42" height="52" rx="10" fill="#2B2D31" {O}/>'
    f'<rect x="160" y="108" width="20" height="18" rx="4" fill="#5B5F66" {O}/>'
    f'<circle cx="170" cy="117" r="5" fill="#111111"/><circle cx="168" cy="115" r="1.6" fill="#FFFFFF"/>'
    f'<circle cx="170" cy="140" r="8" fill="#5B5F66" {O}/>'
    f'<circle cx="170" cy="140" r="3.5" fill="#111111"/><circle cx="168" cy="138" r="1.5" fill="#FFFFFF"/>'
)
air = foldable(dict(
    rear_dx=88, rear_y=36, front_dx=124, front_y=82, arm_w=8, arm="#B4B7BB", motor="#3A3D42", motor_r=7,
    prop="#3A3D42", prop_l=54, prop_w=9, tips=True, legs=True, leg_in=-10, leg_h=60,
    body_svg=air_body, gimbal_svg=air_gimbal))

# ---------------------------------------------------------------- Mavic 4 Pro
mavic_body = (
    f'<path d="M144,48 C144,34 156,28 170,28 C184,28 196,34 196,48 L204,92 '
    f'C204,102 190,106 170,106 C150,106 136,102 136,92 Z" fill="#7E8187" {O}/>'
    f'<path d="M154,34 C160,30 180,30 186,34" fill="none" {O}/>'
    + eye(148, 72, 5) + eye(192, 72, 5)
)
mavic_gimbal = (
    f'<path d="M144,88 C144,70 196,70 196,88" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>'
    f'<path d="M144,88 C144,70 196,70 196,88" fill="none" stroke="#5E6167" stroke-width="7" stroke-linecap="round"/>'
    f'<circle cx="170" cy="100" r="29" fill="#2B2D31" {O}/>'
    f'<rect x="159" y="80" width="22" height="18" rx="5" fill="#5B5F66" {O}/>'
    f'<circle cx="170" cy="89" r="5.5" fill="#111111"/><circle cx="168" cy="87" r="1.8" fill="#FFFFFF"/>'
    f'<circle cx="160" cy="111" r="7" fill="#5B5F66" {O}/><circle cx="160" cy="111" r="3" fill="#111111"/>'
    f'<circle cx="180" cy="111" r="7" fill="#5B5F66" {O}/><circle cx="180" cy="111" r="3" fill="#111111"/>'
)
mavic = foldable(dict(
    rear_dx=94, rear_y=34, front_dx=130, front_y=78, arm_w=8, arm="#7E8187", motor="#3A3D42", motor_r=7.5,
    prop="#3A3D42", prop_l=56, prop_w=9, tips=False, legs=True, leg_in=-8, leg_h=64,
    body_svg=mavic_body, gimbal_svg=mavic_gimbal))

# ---------------------------------------------------------------- Avata 2
def duct(cx, cy, rx, ry, t):
    blades = ""
    for ang in (20, 140, 260):
        a = math.radians(ang)
        tx, ty = cx + math.cos(a) * (rx - t - 3), cy + math.sin(a) * (ry - t * 0.5 - 1)
        blades += blade(cx, cy, tx, ty, 4, "#2B2D31", False)
    return (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#A9ACB1" {O}/>'
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx - t}" ry="{ry - t*0.55:.1f}" fill="#6E7177" {O}/>'
            + blades +
            f'<circle cx="{cx}" cy="{cy}" r="4" fill="#2B2D31" {O}/>')

avata = svg(
    duct(108, 62, 48, 20, 9) + duct(232, 62, 48, 20, 9)
    + f'<rect x="146" y="26" width="48" height="108" rx="12" fill="#A9ACB1" {O}/>'
    + f'<rect x="153" y="30" width="34" height="32" rx="7" fill="#3A3D42" {O}/>'
    + duct(92, 104, 66, 29, 12) + duct(248, 104, 66, 29, 12)
    + f'<rect x="132" y="128" width="76" height="12" rx="6" fill="#3A3D42" {O}/>'
    + f'<rect x="144" y="70" width="52" height="58" rx="10" fill="#A9ACB1" {O}/>'
    + f'<rect x="151" y="78" width="38" height="44" rx="6" fill="#2B2D31" {O}/>'
    + f'<circle cx="170" cy="104" r="13" fill="#5B5F66" {O}/>'
    + f'<circle cx="170" cy="104" r="6" fill="#111111"/><circle cx="166" cy="100" r="2.4" fill="#FFFFFF"/>'
    + f'<rect x="137" y="88" width="5" height="32" rx="2.5" fill="{ORANGE}" {O}/>'
    + f'<rect x="198" y="88" width="5" height="32" rx="2.5" fill="{ORANGE}" {O}/>',
    vb="0 0 340 170")

for name, s in (("mini", mini), ("air", air), ("mavic", mavic), ("avata", avata)):
    open(f"{OUT}/drone-{name}.svg", "w").write(s)
print("ok")
