#!/usr/bin/env python3
"""
Update version across all project files.
Usage:
  python update-version.py bugfix   # 1.2.3 -> 1.2.4
  python update-version.py minor    # 1.2.3 -> 1.3.0
  python update-version.py major    # 1.2.3 -> 2.0.0
  python update-version.py set 1.3.5  # Set specific version
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
# Release channel shown to users: manifest "version_name" (chrome://extensions) and the version footers.
# Set to "" for a stable release. The numeric version (and the git tag) stays plain X.Y.Z either way.
CHANNEL = "alpha"
MANIFEST = ROOT / "chrome-extension" / "manifest.json"
POPUP = ROOT / "chrome-extension" / "popup" / "popup.html"
CONTACTS = ROOT / "chrome-extension" / "pages" / "contacts.html"
ASK_AI = ROOT / "chrome-extension" / "pages" / "ask-ai.html"
BACKGROUND = ROOT / "chrome-extension" / "background" / "sw.js"
TASKS = ROOT / "TASKS.md"


def parse_version(s):
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", s)
    if not m:
        raise SystemExit(f"Invalid version format: {s}")
    return tuple(int(x) for x in m.groups())


def read_version():
    text = MANIFEST.read_text()
    m = re.search(r'"version"\s*:\s*"([^"]+)"', text)
    if not m:
        raise SystemExit("Could not find version in manifest.json")
    return m.group(1)


def write_version(version, bump_type=None, description=None):
    # manifest.json
    text = MANIFEST.read_text()
    text = re.sub(r'"version"\s*:\s*"[^"]+"', f'"version": "{version}"', text)
    text = re.sub(r'\n\s*"version_name"\s*:\s*"[^"]*",?', '', text)
    if CHANNEL:
        text = re.sub(r'("version"\s*:\s*"[^"]+",)', lambda m: m.group(1) + f'\n  "version_name": "{version}-{CHANNEL}",', text, count=1)
    MANIFEST.write_text(text)
    label = f"v{version} {CHANNEL}".strip()

    # popup.html - update or add version in footer
    popup_text = POPUP.read_text()
    popup_text = re.sub(r'<span id="version"[^>]*>[^<]*</span>', f'<span id="version" class="version">{label}</span>', popup_text)
    if 'id="version"' not in popup_text:
        popup_text = popup_text.replace(
            '<button type="button" id="openContacts" class="btn btn-secondary">Open Contacts</button>',
            f'<button type="button" id="openContacts" class="btn btn-secondary">Open Contacts</button>\n      <span id="version" class="version">{label}</span>'
        )
    POPUP.write_text(popup_text)

    # contacts.html - update or add version in footer
    contacts_text = CONTACTS.read_text()
    contacts_text = re.sub(r'<span id="version">[^<]*</span>', f'<span id="version">{label}</span>', contacts_text)
    if 'id="version"' not in contacts_text:
        contacts_text = contacts_text.replace(
            "    </main>\n  </div>",
            f"    </main>\n    <footer class=\"footer\"><span id=\"version\">{label}</span></footer>\n  </div>"
        )
    CONTACTS.write_text(contacts_text)

    # ask-ai.html - update or add version in footer
    ask_ai_text = ASK_AI.read_text()
    ask_ai_text = re.sub(r'<span id="version">[^<]*</span>', f'<span id="version">{label}</span>', ask_ai_text)
    if 'id="version"' not in ask_ai_text:
        ask_ai_text = ask_ai_text.replace(
            "    </main>\n  </div>",
            f"    </main>\n    <footer class=\"footer\"><span id=\"version\">{label}</span></footer>\n  </div>"
        )
    ASK_AI.write_text(ask_ai_text)

    # background/sw.js - update VERSION constant
    bg_text = BACKGROUND.read_text()
    if "const VERSION =" in bg_text:
        bg_text = re.sub(r"const VERSION = ['\"][^'\"]+['\"];", f'const VERSION = "{version}";', bg_text)
    else:
        bg_text = bg_text.replace(
            "const LOG = (...args) => console.log('[PRM background]', ...args);",
            f'const VERSION = "{version}";\nconst LOG = (...args) => console.log(\'[PRM background]\', ...args);'
        )
    BACKGROUND.write_text(bg_text)

    # TASKS.md
    if bump_type and description:
        entry = f"- [x] Bump {bump_type.capitalize()} version to {version} for {description} (`manifest.json`, `popup.html`, `contacts.html`, `ask-ai.html`, `background/sw.js`)\n"
        if TASKS.exists():
            content = TASKS.read_text()
            if "## Version History" in content:
                content = content.replace("## Version History", f"## Version History\n{entry}")
            else:
                content = content + "\n## Version History\n" + entry
        else:
            content = "# Tasks\n\n## Version History\n" + entry
        TASKS.write_text(content)

    print(f"Updated version to {version}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()
    current = read_version()
    major, minor, bugfix = parse_version(current)

    if cmd == "set":
        if len(sys.argv) < 3:
            print("Usage: python update-version.py set X.Y.Z")
            sys.exit(1)
        version = sys.argv[2]
        parse_version(version)
        description = sys.argv[3] if len(sys.argv) > 3 else "manual version set"
        write_version(version, "set", description)
        return

    if cmd == "bugfix":
        minor, bugfix = minor, bugfix + 1
        bump_type = "bugfix"
        description = sys.argv[2] if len(sys.argv) > 2 else "bug fixes"
    elif cmd == "minor":
        minor, bugfix = minor + 1, 0
        bump_type = "minor"
        description = sys.argv[2] if len(sys.argv) > 2 else "new features"
    elif cmd == "major":
        major, minor, bugfix = major + 1, 0, 0
        bump_type = "major"
        description = sys.argv[2] if len(sys.argv) > 2 else "major version"
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)

    version = f"{major}.{minor}.{bugfix}"
    write_version(version, bump_type, description)


if __name__ == "__main__":
    main()
