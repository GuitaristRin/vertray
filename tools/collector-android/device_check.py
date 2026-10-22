"""Small adb helper for inspecting only the survey app's UI (never changes location providers)."""

import argparse
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

PACKAGE = "cn.jnxundi.campuscollector"
ALIASES = {"start": "开始采集", "pause": "暂停", "resume": "继续采集", "stop": "结束并保存", "mark": "入口 / 出口", "confirm-mark": "记下此刻", "rest": "上课 / 停留", "walk": "继续赶路", "detail": "细采集 5 分钟", "history": "导出数据 / 历史记录", "done": "完成", "save-as": "另存为"}


def adb(*args: str) -> bytes:
    return subprocess.check_output(["adb", *args])


def ui() -> ET.Element:
    # The hierarchy stays on stdout; do not overwrite any of the user's files on the phone.
    raw = adb("exec-out", "uiautomator", "dump", "/dev/tty").decode("utf-8", errors="replace")
    start, end = raw.index("<?xml"), raw.index("</hierarchy>") + len("</hierarchy>")
    return ET.fromstring(raw[start:end])


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["status", "tap", "screenshot", "scroll", "assert-stopped"])
    parser.add_argument("value", nargs="?")
    options = parser.parse_args()
    options.value = ALIASES.get(options.value, options.value)
    if options.action == "screenshot":
        if not options.value:
            parser.error("screenshot requires a local output path")
        Path(options.value).write_bytes(adb("exec-out", "screencap", "-p"))
        return
    root = ui()
    nodes = list(root.iter("node"))
    if not any(n.get("package") == PACKAGE for n in nodes):
        raise SystemExit("Survey app is not visible; no device input was sent")
    if options.action == "status":
        for node in nodes:
            text = node.get("text", "")
            if node.get("package") == PACKAGE and text:
                print(text, node.get("bounds"), "enabled=" + node.get("enabled", ""))
    elif options.action == "tap":
        matches = [n for n in nodes if n.get("package") == PACKAGE and n.get("text") == options.value and n.get("clickable") == "true" and n.get("enabled") == "true"]
        if not matches:
            raise SystemExit(f"No enabled app control with text: {options.value}")
        node = matches[-1]
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds", "")))
        adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
        print("Tapped:", options.value)
    elif options.action == "scroll":
        width, height = map(int, re.search(r"(\d+)x(\d+)", adb("shell", "wm", "size").decode()).groups())
        up = options.value == "up"
        adb("shell", "input", "swipe", str(width // 2), str(height // 4 if up else height * 3 // 4), str(width // 2), str(height * 3 // 4 if up else height // 4), "400")
    elif options.action == "assert-stopped":
        services = adb("shell", "dumpsys", "activity", "services", PACKAGE).decode()
        if "isForeground=true" in services:
            raise SystemExit("Recorder is still running")
        print("No foreground recorder remains")


if __name__ == "__main__":
    main()
