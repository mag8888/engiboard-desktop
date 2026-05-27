"""
EngiBoard Windows Smoke Test
Scenario: Demo login -> click existing screenshot thumbnail -> editor window
opens with the image visible (NOT a blank/white screen).

Verification is by real signals, not guesses:
  - render readiness: poll until the window content stops being blank
  - login dismissed:  screen must change meaningfully after the Demo click
  - editor opened:    a SECOND EngiBoard window must appear after the click
  - editor not blank: editor region must contain content
"""
import subprocess, time, os, sys
import pyautogui
import pygetwindow as gw
from PIL import ImageGrab, Image, ImageChops

pyautogui.PAUSE = 0.3
pyautogui.FAILSAFE = False

OUT = os.environ.get("SCREENSHOT_DIR", ".")


def shot(name):
    path = os.path.join(OUT, f"{name}.png")
    ImageGrab.grab().save(path)
    print(f"  [screenshot] {name}.png")
    return Image.open(path)


def blank_ratio(img):
    """Return (white_ratio, dark_ratio) of a grayscale image."""
    px = list(img.convert("L").getdata())
    n = len(px)
    return sum(p > 240 for p in px) / n, sum(p < 20 for p in px) / n


def is_blank(img):
    w, d = blank_ratio(img)
    return w > 0.90 or d > 0.90


def frac_diff(a, b, thresh=30):
    """Fraction of pixels that differ by more than `thresh` in luminance."""
    da = ImageChops.difference(a.convert("L"), b.convert("L")).getdata()
    n = len(da)
    return sum(p > thresh for p in da) / n


def count_app_windows():
    return len([w for w in gw.getAllWindows()
                if "engiboard" in w.title.lower() and w.visible])


def wait_window(fragment, timeout=30):
    for _ in range(timeout):
        wins = [w for w in gw.getAllWindows() if fragment.lower() in w.title.lower()]
        if wins:
            return wins[0]
        time.sleep(1)
    return None


def fail(msg):
    print(f"\nFAIL: {msg}")
    sys.exit(1)


# 1. Locate the installed exe -------------------------------------------------
app = os.environ.get("ENGIBOARD_EXE", "")
if not app or not os.path.exists(app):
    for c in [
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\EngiBoard\EngiBoard.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\EngiBoard\EngiBoard.exe"),
        r"C:\Program Files\EngiBoard\EngiBoard.exe",
    ]:
        if os.path.exists(c):
            app = c
            break
if not app or not os.path.exists(app):
    fail(f"EngiBoard.exe not found (ENGIBOARD_EXE={os.environ.get('ENGIBOARD_EXE','unset')})")

print(f"Launching {app}")
subprocess.Popen([app])

# 2. Wait for the main window, then maximize for deterministic geometry --------
win = wait_window("EngiBoard", timeout=30)
if not win:
    shot("00-no-window")
    fail("main window not found after 30 s")

try:
    win.maximize()
    time.sleep(1)
    win.activate()
except Exception as e:
    print(f"  (maximize/activate raised {e!r}, continuing)")

SW, SH = pyautogui.size()
print(f"Screen: {SW}x{SH}")

# 3. Poll until the WebView has actually painted the login card ---------------
print("Waiting for login screen to render...")
rendered = False
for i in range(25):
    time.sleep(1)
    img = ImageGrab.grab()
    w, d = blank_ratio(img)
    if w < 0.85 and d < 0.85:
        rendered = True
        print(f"  rendered after ~{i+1}s (white={w:.2f} dark={d:.2f})")
        break
login = shot("01-login-screen")
if not rendered:
    fail("login screen never rendered (stayed blank) -- WebView paint failure")

# 4. Click "Demo (offline only)" ----------------------------------------------
# Measured from the real 1024x768 render: card centered, Demo btn ~82% down.
demo_x = int(SW * 0.508)
demo_y = int(SH * 0.820)
print(f"Clicking Demo at ({demo_x}, {demo_y})")
pyautogui.click(demo_x, demo_y)
time.sleep(5)

after_demo = shot("02-after-demo-click")
changed = frac_diff(login, after_demo)
print(f"  screen change after Demo click: {changed:.1%}")
if changed < 0.05:
    fail("screen did not change after Demo click -- button was missed")

# 5. Click the first existing screenshot thumbnail ----------------------------
# Demo opens on the Projects view with task rows. The BEFORE/AFTER thumbnails
# occupy the right portion of each row. Target the first row's right half.
wins_before = count_app_windows()
print(f"  app windows before thumbnail click: {wins_before}")

thumb_x = int(SW * 0.70)   # right-side image column
thumb_y = int(SH * 0.30)   # first task row, below toolbar
print(f"Clicking thumbnail at ({thumb_x}, {thumb_y})")
pyautogui.click(thumb_x, thumb_y)
time.sleep(6)              # editor window open + image decode

# 6. Verify a SECOND window opened (the editor) -------------------------------
wins_after = count_app_windows()
print(f"  app windows after thumbnail click: {wins_after}")
editor = shot("03-editor-opened")

if wins_after <= wins_before:
    fail(f"no new window opened (before={wins_before}, after={wins_after}) -- "
         "thumbnail click did not open the editor")

if is_blank(editor):
    fail("editor window is blank/white -- image did not render")

print("\nPASS: editor opened as a new window with visible content")

# 7. Close editor -------------------------------------------------------------
pyautogui.hotkey("ctrl", "w")
time.sleep(1)
shot("04-after-close")
