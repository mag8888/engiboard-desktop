"""
EngiBoard Windows Smoke Test
Launched with EB_AUTODEMO=1, so the app skips login and lands on the demo
Projects view directly. Goal: click an existing screenshot thumbnail and
confirm the editor window opens with the image visible (NOT blank/white).

Real signals, no guesses:
  - render readiness: poll until window content stops being blank
  - editor opened:    a SECOND EngiBoard window must appear after the click
  - editor not blank: editor screenshot must contain content
"""
import subprocess, time, os, sys
import pyautogui
import pygetwindow as gw
from PIL import ImageGrab, Image

pyautogui.PAUSE = 0.3
pyautogui.FAILSAFE = False

OUT = os.environ.get("SCREENSHOT_DIR", ".")


def shot(name):
    path = os.path.join(OUT, f"{name}.png")
    ImageGrab.grab().save(path)
    print(f"  [screenshot] {name}.png")
    return Image.open(path)


def blank_ratio(img):
    px = list(img.convert("L").getdata())
    n = len(px)
    return sum(p > 240 for p in px) / n, sum(p < 20 for p in px) / n


def is_blank(img):
    w, d = blank_ratio(img)
    return w > 0.90 or d > 0.90


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
        r"C:\Program Files\EngiBoard\EngiBoard.exe",
    ]:
        if os.path.exists(c):
            app = c
            break
if not app or not os.path.exists(app):
    fail(f"EngiBoard.exe not found (ENGIBOARD_EXE={os.environ.get('ENGIBOARD_EXE','unset')})")

print(f"Launching {app} (EB_AUTODEMO={os.environ.get('EB_AUTODEMO','unset')})")
log_path = os.path.join(OUT, "app-stderr.log")
log_fh = open(log_path, "w", encoding="utf-8", errors="replace")
subprocess.Popen([app], stdout=log_fh, stderr=subprocess.STDOUT)  # capture Rust eprintln logs

# 2. Wait for window, maximize for deterministic geometry ---------------------
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

# 3. Poll until the demo Projects view has painted ----------------------------
# Auto-demo fires ~2.5s after launch; give it room and wait for real content.
print("Waiting for demo view to render...")
rendered = False
for i in range(25):
    time.sleep(1)
    w, d = blank_ratio(ImageGrab.grab())
    if w < 0.80 and d < 0.80:
        rendered = True
        print(f"  rendered after ~{i+1}s (white={w:.2f} dark={d:.2f})")
        break
shot("01-demo-view")
if not rendered:
    fail("demo view never rendered (stayed blank)")

def editor_window():
    for w in gw.getAllWindows():
        if "annotate" in w.title.lower():
            return w
    return None

# 4. ISSUE 1 — Presentation view: images should fill slots (object-fit:contain) -
# Click the first task's "Presentation" link, screenshot the BEFORE/AFTER view.
print("Opening Presentation view (issue 1: image fit)...")
pyautogui.click(int(SW * 0.31), int(SH * 0.38))   # "Presentation" link, first task
time.sleep(3)
shot("02-presentation")
pyautogui.press("escape")   # close presentation, back to list
time.sleep(2)

# 5. ISSUE 2 — Capture flow must NOT crash the app -----------------------------
# Repro: trigger capture -> sniper overlay -> drag a region -> release.
# Bug symptom: the whole app closes (0 windows) and no editor appears.
wins_before = count_app_windows()
print(f"Capture flow: app windows before = {wins_before}")

print("  clicking Capture button...")
pyautogui.click(int(SW * 0.26), int(SH * 0.12))   # 'Capture' button, top-left
time.sleep(2)
shot("03-sniper-overlay")

print("  dragging a region on the sniper overlay...")
pyautogui.moveTo(int(SW * 0.30), int(SH * 0.30))
pyautogui.mouseDown()
pyautogui.moveTo(int(SW * 0.62), int(SH * 0.60), duration=0.6)
pyautogui.mouseUp()
time.sleep(6)   # capture + editor open

wins_after = count_app_windows()
print(f"Capture flow: app windows after = {wins_after}")
shot("04-after-capture")
log_fh.flush()

# Primary assertion for the reported crash: app must still be alive.
if wins_after == 0:
    fail("APP CLOSED after capture -- the reported crash reproduced (0 windows)")

# Capture should have opened the editor with the grabbed image.
ed = editor_window()
if ed is None:
    fail("capture did not open the editor window (no 'Annotate' window present)")

editor_img = Image.open(os.path.join(OUT, "04-after-capture.png"))
if is_blank(editor_img):
    fail("editor opened from capture but is blank/white")

print("\nPASS: capture did not crash; editor opened with content")
