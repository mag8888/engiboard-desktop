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

# 4. Click the first existing screenshot thumbnail ----------------------------
# Projects view: task rows with BEFORE/AFTER image columns on the right side.
wins_before = count_app_windows()
print(f"  app windows before click: {wins_before}")

thumb_x = int(SW * 0.70)   # right-side image column
thumb_y = int(SH * 0.30)   # first task row, below the toolbar
print(f"Clicking thumbnail at ({thumb_x}, {thumb_y})")
pyautogui.click(thumb_x, thumb_y)
time.sleep(6)              # editor window open + image decode

# 5. Verify a SECOND window opened (the editor) -------------------------------
wins_after = count_app_windows()
print(f"  app windows after click: {wins_after}")
editor = shot("02-editor-opened")

if wins_after <= wins_before:
    fail(f"no new window opened (before={wins_before}, after={wins_after}) -- "
         "thumbnail click did not open the editor")

editor_blank = is_blank(editor)
print(f"  editor blank after open: {editor_blank}")

# 6. DIAGNOSTIC: nudge the editor with REAL OS events from outside the app -----
# If an external OS resize/move/focus repaints it, the bug is a WebView2
# compositor first-paint stall (and the in-app set_size is a no-op). If it
# stays blank, editor.html itself isn't loading/painting.
ed = None
for w in gw.getAllWindows():
    if "annotate" in w.title.lower():
        ed = w
        break
if ed is None:
    # fall back: the EngiBoard window that is not maximized / not the main
    cands = [w for w in gw.getAllWindows() if "engiboard" in w.title.lower()]
    ed = cands[-1] if cands else None

if ed is not None:
    print(f"  editor window: '{ed.title}' pos=({ed.left},{ed.top}) size=({ed.width}x{ed.height})")
    try:
        ed.activate(); time.sleep(0.5)
        shot("03-after-activate")
        ed.resizeTo(ed.width + 60, ed.height + 40); time.sleep(0.8)
        ed.resizeTo(ed.width - 60, ed.height - 40); time.sleep(0.8)
        shot("04-after-resize")
        ed.moveTo(ed.left + 30, ed.top + 30); time.sleep(0.6)
        shot("05-after-move")
        # click inside the editor to give it real focus
        pyautogui.click(ed.left + ed.width // 2, ed.top + ed.height // 2); time.sleep(0.8)
        shot("06-after-click")
    except Exception as e:
        print(f"  nudge raised {e!r}")
    final = Image.open(os.path.join(OUT, "06-after-click.png"))
    print(f"  blank after external nudges: {is_blank(final)}")
else:
    print("  could not locate editor window for nudge experiment")

log_fh.flush()
if editor_blank:
    fail("editor window is blank/white on open -- see app-stderr.log + nudge screenshots")

print("\nPASS: editor opened with visible content")
