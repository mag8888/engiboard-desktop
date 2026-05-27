"""
EngiBoard Windows Smoke Test
Scenario: Login as Demo → click BEFORE thumbnail → editor opens (not blank)
"""
import subprocess, time, os, sys
import pyautogui
import pygetwindow as gw
from PIL import ImageGrab, Image

pyautogui.PAUSE = 0.2
pyautogui.FAILSAFE = False

OUT = os.environ.get("SCREENSHOT_DIR", ".")

def shot(name):
    path = os.path.join(OUT, f"{name}.png")
    ImageGrab.grab().save(path)
    print(f"  📸 {name}.png")
    return Image.open(path)

def is_blank(img, white_thresh=0.90, dark_thresh=0.90):
    """True if image is >90% white or >90% dark — editor didn't render."""
    px = list(img.convert("L").getdata())
    n = len(px)
    return (sum(p > 240 for p in px) / n > white_thresh or
            sum(p < 20  for p in px) / n > dark_thresh)

def wait_window(title_fragment, timeout=25):
    for _ in range(timeout):
        wins = [w for w in gw.getAllWindows() if title_fragment.lower() in w.title.lower()]
        if wins:
            return wins[0]
        time.sleep(1)
    return None

# ── 1. Find installer path ──────────────────────────────────────────────────
app = os.environ.get("ENGIBOARD_EXE", "")
if not app or not os.path.exists(app):
    # Fallback candidates
    for candidate in [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\EngiBoard\EngiBoard.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\EngiBoard\EngiBoard.exe"),
        r"C:\Program Files\EngiBoard\EngiBoard.exe",
    ]:
        if os.path.exists(candidate):
            app = candidate
            break
if not app or not os.path.exists(app):
    print(f"ERROR: EngiBoard.exe not found (ENGIBOARD_EXE={os.environ.get('ENGIBOARD_EXE','not set')})")
    sys.exit(1)

print(f"Launching {app}")
subprocess.Popen([app])

# ── 2. Wait for window ──────────────────────────────────────────────────────
print("Waiting for window…")
win = wait_window("EngiBoard", timeout=25)
if not win:
    shot("00-no-window")
    print("ERROR: window not found after 25 s")
    sys.exit(1)

time.sleep(4)  # let WebView fully render
print(f"Window: pos=({win.left},{win.top}) size=({win.width}x{win.height})")
wx, wy, ww, wh = win.left, win.top, win.width, win.height

shot("01-login-screen")

# ── 3. Click "Demo (offline only)" ─────────────────────────────────────────
# Button is centered horizontally, ~73% down the window height
# (login card is centered; Demo btn is near the bottom of the card)
demo_x = wx + ww // 2
demo_y = wy + int(wh * 0.73)
print(f"Clicking Demo button at ({demo_x}, {demo_y})")
pyautogui.click(demo_x, demo_y)
time.sleep(5)   # demo data seeding + render

shot("02-tasks-view")

# ── 4. Click BEFORE thumbnail of first task ─────────────────────────────────
# Layout (from index.html CSS):
#   sidebar: 200px | drag: 24px | chat-col: 320px | BEFORE: 1fr | AFTER: 1fr
# tbar: 46px | filters row: ~44px | first task center: ~75px (row min-h 150)
remaining = ww - 200 - 24 - 320          # width for BEFORE + AFTER
before_col_center = 200 + 24 + 320 + remaining // 4   # mid of BEFORE col
task_center_y     = 46 + 44 + 75         # mid of first row

thumb_x = wx + before_col_center
thumb_y = wy + task_center_y
print(f"Clicking BEFORE thumbnail at ({thumb_x}, {thumb_y})")
pyautogui.click(thumb_x, thumb_y)
time.sleep(5)   # editor window open + image load

img = shot("03-editor-opened")

# ── 5. Verdict ──────────────────────────────────────────────────────────────
if is_blank(img):
    print("\n❌  FAIL: editor screenshot looks blank/white — image did not render")
    sys.exit(1)

print("\n✅  PASS: editor opened with visible content")

# ── 6. Close editor gracefully ──────────────────────────────────────────────
pyautogui.hotkey("ctrl", "w")
time.sleep(1)
shot("04-after-close")
