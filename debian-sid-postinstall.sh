#!/usr/bin/env bash
# =============================================================================
#  debian-sid-postinstall.sh
#  Post-install setup for Debian forky/sid (testing/unstable) with GNOME
#
#  Copyright (C) 2026 colinsellens
#  SPDX-License-Identifier: GPL-3.0-or-later
#  This program is free software: you can redistribute it and/or modify it under
#  the terms of the GNU General Public License as published by the Free Software
#  Foundation, either version 3 of the License, or (at your option) any later
#  version. It comes with ABSOLUTELY NO WARRANTY. See the LICENSE file.
#
#   1) System update
#   2) Enable Debian's contrib, non-free and non-free-firmware sections
#   3) Media codecs (ffmpeg, GStreamer, VA-API, DVD, archive formats)
#   4) NVIDIA proprietary driver (DKMS; choose current / 470 branch)
#   5) Other drivers & firmware (Broadcom Wi-Fi, GPU/audio/Wi-Fi firmware, microcode)
#   6) Build tools (GCC, make, kernel headers, DKMS)
#   7) VMware Workstation Pro modules (vmmon/vmnet): build, sign, auto-rebuild
#   Extras:
#   8) Btrfs snapshots: snapper, snapshot around every apt run, optional grub-btrfs,
#      /home moved into its own subvolume
#   9) Flathub
#  10) Firmware updates via fwupd
#  11) GNOME tweaks: min/max buttons, AppIndicator, Dash to Dock, Extension Manager,
#      Accent Color Everywhere (bundled in extensions/ in this repo), plus the
#      extensions.gnome.org extensions listed in GNOME_EXTENSIONS, the desktop
#      background, custom keyboard shortcuts and the GNOME_SETTINGS table
#  12) Microsoft core fonts (Debian's ttf-mscorefonts-installer)
#  13) Gaming: Steam, Proton-GE, ProtonUp-Qt, Wine, Lutris, NTSYNC, GameMode,
#      MangoHud, gamescope
#   A) All of the above - snapshot first, firmware last
#   S) Software submenu: Brave Origin, qBittorrent, VLC, Bitwarden, Mullvad VPN,
#      VS Code, Claude Code, Extension Manager  (apt first, Flathub fallback)
#
#  Unattended: the steps don't stop to ask questions. Every choice is a setting
#  in the SETTINGS block below - edit it, or override one for a single run:
#      sudo OPT_GRUB_BTRFS=n ./debian-sid-postinstall.sh 8
#  Two exceptions: the NVIDIA driver is confirmed first (and only when an NVIDIA
#  card is detected), and with Secure Boot on, mokutil asks you to choose a
#  one-time key-enrolment password.
#  The menus show what is already installed, detected from the system.
#
#  Secure Boot: one signing key (the DKMS MOK key, /var/lib/dkms/mok.*) is shared
#  by the NVIDIA and Broadcom DKMS modules and the VMware modules, so you enrol
#  ONE key once.
#
#  Usage:  sudo ./debian-sid-postinstall.sh        (interactive menu)
#          sudo ./debian-sid-postinstall.sh A      (run everything)
#          sudo ./debian-sid-postinstall.sh 2 4    (run selected steps)
#          sudo ./debian-sid-postinstall.sh S      (go straight to the software menu)
#  No sudo on this machine? Run it as root:  su -c './debian-sid-postinstall.sh'
# =============================================================================

set -uo pipefail

LOG="/var/log/debian-sid-postinstall.log"
APT_DIR="${APT_DIR:-/etc/apt}"
DKMS_KEY="/var/lib/dkms/mok.key"
DKMS_CERT="/var/lib/dkms/mok.pub"
VMW_HELPER="/usr/local/sbin/vmware-modules-build"
VMW_HOOK="/etc/kernel/postinst.d/zz-vmware-modules"
VMW_HOOK_HEADERS="/etc/kernel/header_postinst.d/zz-vmware-modules"
VMW_SERVICE="/etc/systemd/system/vmware-modules-check.service"
VMW_PATCHED_SRC="/usr/local/src/vmware-host-modules"

# GNOME extensions shipped in this repo under extensions/<uuid>/. If the script
# is run on its own (without the rest of the repo), they're fetched from GitHub.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
REPO_TARBALL="https://github.com/colinsellens/debian-sid-postinstall/archive/refs/heads/main.tar.gz"
REPO_RAW="https://raw.githubusercontent.com/colinsellens/debian-sid-postinstall/main"
ACCENT_UUID="accent-color-everywhere@framagit.org"

# =============================================================================
#  SETTINGS  - y/n answers to everything the script would otherwise ask.
#  Edit here, or override per run:  sudo OPT_DASH_TO_DOCK=n ./debian-sid-postinstall.sh 11
# =============================================================================
OPT_FULL_UPGRADE="${OPT_FULL_UPGRADE:-n}"               #  1: y = 'apt full-upgrade' (may REMOVE packages mid-transition on sid); n = safe upgrade
OPT_BROADCOM_WL="${OPT_BROADCOM_WL:-n}"                 #  5: proprietary broadcom-sta Wi-Fi driver (only if a Broadcom chip is found)
OPT_GRUB_BTRFS="${OPT_GRUB_BTRFS:-y}"                   #  8: grub-btrfs (boot snapshots from the GRUB menu)
OPT_HOME_SUBVOLUME="${OPT_HOME_SUBVOLUME:-y}"           #  8: move /home into its own Btrfs subvolume at the next boot, so snapshots of / leave it out
OPT_APPLY_FIRMWARE="${OPT_APPLY_FIRMWARE:-y}"           # 10: apply firmware updates (n = only list them)
OPT_ACCENT_COLOR="${OPT_ACCENT_COLOR:-y}"               # 11: bundled Accent Color Everywhere extension
OPT_APPINDICATOR="${OPT_APPINDICATOR:-y}"               # 11: tray icons (AppIndicator extension)
OPT_DASH_TO_DOCK="${OPT_DASH_TO_DOCK:-y}"               # 11: Dash to Dock
OPT_MSFONTS_EULA="${OPT_MSFONTS_EULA:-y}"               # 12: y = you accept https://corefonts.sourceforge.net/eula.htm
OPT_STEAM_LICENCE="${OPT_STEAM_LICENCE:-y}"             # 13: y = you accept the Steam Install Agreement shown by Debian's steam-installer
OPT_PROTON_GE="${OPT_PROTON_GE:-y}"                     # 13: download the latest Proton-GE into Steam
GAMING_PACKAGES="${GAMING_PACKAGES-wine winetricks gamemode mangohud gamescope lutris steam-devices}"   # 13: installed alongside Steam
PROTON_GE_REPO="https://github.com/GloriousEggroll/proton-ge-custom"
OPT_BRAVE_LOCK_BITWARDEN="${OPT_BRAVE_LOCK_BITWARDEN:-n}"       # S: force-install Bitwarden in Brave (can't be switched off)
OPT_BRAVE_FLATHUB_FALLBACK="${OPT_BRAVE_FLATHUB_FALLBACK:-n}"   # S: if Brave Origin fails, install regular Brave from Flathub
OPT_REBOOT_WHEN_DONE="${OPT_REBOOT_WHEN_DONE:-y}"       # reboot automatically at the end if a step needs it
VMWARE_BUNDLE="${VMWARE_BUNDLE:-}"                      #  7: path to VMware-Workstation-*.bundle, used if VMware isn't installed yet
VMWARE_PATCHED_URL="${VMWARE_PATCHED_URL:-}"            #  7: git URL of patched vmmon/vmnet sources, used if the bundled ones don't build
DESKTOP_USER="${DESKTOP_USER:-}"                        # your login name; only needed when the script can't work it out (run as root without sudo)

# Extensions from extensions.gnome.org installed by step 11:  "ID | name"
# ID is the number in the extension's URL: extensions.gnome.org/extension/<ID>/…
# The build matching this GNOME Shell version is downloaded; delete a line to drop one.
GNOME_EXTENSIONS=(
  "19|User Themes"
  "517|Caffeine"
  "1319|GSConnect"
  "779|Clipboard Indicator"
  "2087|Desktop Icons NG (DING)"
  "3960|Transparent Top Bar (Adjustable transparency)"
)
EGO_STATE="/var/lib/debian-sid-postinstall/ego-extensions"   # "ID uuid" for each one installed

# Desktop background set by step 11: an image kept in this repo (empty = leave the background alone)
WALLPAPER="${WALLPAPER-wallpapers/forest-fog.jpg}"

# Custom keyboard shortcuts added by step 11:  "name | command | key combination"
CUSTOM_SHORTCUTS=(
  "Resources|gnome-system-monitor|<Control><Alt>Delete"
)

# GNOME settings applied by step 11, one per line:  "schema key value"
# Schemas of installed extensions work too (looked up in the extension's folder).
GNOME_SETTINGS=(
  "org.gnome.desktop.wm.preferences button-layout 'appmenu:minimize,maximize,close'"
  "org.gnome.desktop.peripherals.touchpad tap-to-click true"
  "org.gnome.desktop.peripherals.mouse speed 0.5"                                  # pointer speed 75% (range -1 … 1)
  "org.gnome.desktop.peripherals.touchpad speed 0.5"                               # same for the touchpad
  "org.gnome.desktop.interface color-scheme 'prefer-dark'"                         # dark style
  "org.gnome.desktop.session idle-delay 900"                                       # blank the screen after 15 minutes
  "org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'"       # no automatic suspend when plugged in
  "org.gnome.settings-daemon.plugins.media-keys logout ['<Control><Alt>l']"        # log out: Ctrl+Alt+L (frees Ctrl+Alt+Del)
  "org.gnome.desktop.interface show-battery-percentage true"
  "org.gnome.desktop.interface clock-show-weekday true"
  "org.gnome.desktop.interface enable-hot-corners false"
  "org.gnome.settings-daemon.plugins.color night-light-enabled true"
  "org.gtk.gtk4.Settings.FileChooser sort-directories-first true"
  "org.gtk.Settings.FileChooser sort-directories-first true"
  # Accent Color Everywhere - uncomment and edit (the extension's defaults are shown):
  # "org.gnome.shell.extensions.accent-color-everywhere source 'wallpaper'"       # or 'custom' / 'system'
  # "org.gnome.shell.extensions.accent-color-everywhere custom-color '#3584e4'"   # used when source is 'custom'
  # "org.gnome.shell.extensions.accent-color-everywhere gnome-palette true"       # false = exact colour
  # "org.gnome.shell.extensions.accent-color-everywhere target-border true"       # focused-window outline
  # "org.gnome.shell.extensions.accent-color-everywhere border-width 1"
)

NEED_REBOOT=0
MOK_PENDING=0
APT_FRESH=0
declare -A RESULT

# Keep apt and dpkg from stopping to ask things
export DEBIAN_FRONTEND=noninteractive
export APT_LISTCHANGES_FRONTEND=none
export NEEDRESTART_MODE=a

# ---------- output helpers ---------------------------------------------------
if [[ -t 1 ]]; then
  C_B=$'\e[1m'; C_G=$'\e[32m'; C_Y=$'\e[33m'; C_R=$'\e[31m'; C_C=$'\e[36m'; C_D=$'\e[2m'; C_0=$'\e[0m'
else
  C_B=; C_G=; C_Y=; C_R=; C_C=; C_D=; C_0=
fi
info() { echo "${C_C}==>${C_0} $*"; echo "[INFO] $*" >>"$LOG"; }
ok()   { echo "${C_G} ✔${C_0}  $*"; echo "[ OK ] $*" >>"$LOG"; }
warn() { echo "${C_Y} !${C_0}  $*"; echo "[WARN] $*" >>"$LOG"; }
err()  { echo "${C_R} ✘${C_0}  $*"; echo "[FAIL] $*" >>"$LOG"; }

# Run a non-interactive command, show output and append it to the log
run() {
  echo "+ $*" >>"$LOG"
  "$@" 2>&1 | tee -a "$LOG"
  return "${PIPESTATUS[0]}"
}

ask_yn() {  # ask_yn "Question" default(y/n)
  local q="$1" def="${2:-n}" ans
  local hint="[y/N]"; [[ $def == y ]] && hint="[Y/n]"
  read -rp "    $q $hint " ans
  ans="${ans:-$def}"
  [[ ${ans,,} == y* ]]
}

# Read a y/n setting from the SETTINGS block instead of asking.
opt() {  # opt OPT_NAME "what it controls"  -> true when the setting is y
  local v="${!1:-n}"
  if [[ ${v,,} == y* ]]; then info "$2: yes  ($1)"; return 0; fi
  info "$2: no  (set $1=y to enable)"; return 1
}

# true when every named package is installed
have() {
  local p
  for p in "$@"; do
    dpkg-query -W -f='${db:Status-Status}\n' "$p" 2>/dev/null | grep -qx installed || return 1
  done
}

# ---------- apt helpers --------------------------------------------------------
apt_get() { run apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold "$@"; }
apt_refresh() {   # refresh the package lists once per run (and again after a repo is added)
  [[ $APT_FRESH -eq 1 ]] && return 0
  apt_get update || { warn "apt update reported problems (see $LOG)."; return 1; }
  APT_FRESH=1
}
apt_install() { apt_refresh; apt_get install "$@"; }
# Install a list of packages; if the set fails (one bad name blocks apt), fall back to one at a time.
apt_install_tolerant() {   # apt_install_tolerant "pkg pkg …"  -> 0 if all installed
  local p rc=0
  # shellcheck disable=SC2086
  apt_install $1 && return 0
  warn "Installing them together failed - trying one at a time."
  for p in $1; do apt_install "$p" || { warn "$p could not be installed."; rc=1; }; done
  return $rc
}
preseed() { echo "$*" | debconf-set-selections 2>>"$LOG"; }   # answer a package's install-time question in advance

# ---------- pre-flight -------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  if command -v sudo >/dev/null; then exec sudo -E bash "$0" "$@"; fi
  echo "This script needs root, and sudo isn't installed. Run:  su -c '$0 $*'"; exit 1
fi
touch "$LOG"; chmod 600 "$LOG"
echo "===== $(date -Is) run started =====" >>"$LOG"

# shellcheck disable=SC1091
. /etc/os-release
if [[ ${ID:-} != debian ]]; then
  err "This is not Debian (ID=${ID:-unknown}). Aborting."; exit 1
fi
case "${VERSION_CODENAME:-}" in
  forky|sid) ;;
  *) warn "Written for Debian forky/sid; you are on '${VERSION_CODENAME:-${VERSION_ID:-unknown}}'. Some package names may differ." ;;
esac
ARCH="$(dpkg --print-architecture)"
command -v lspci >/dev/null || apt-get -y install pciutils >>"$LOG" 2>&1

# ---------- shared helpers ---------------------------------------------------
secure_boot_enabled() {
  command -v mokutil >/dev/null || apt-get -y install mokutil >>"$LOG" 2>&1
  mokutil --sb-state 2>/dev/null | grep -qi 'SecureBoot enabled'
}

# --- Debian archive sections (contrib, non-free, non-free-firmware) -----------
WANT_COMPONENTS="contrib non-free non-free-firmware"

# Print FILE with the wanted sections added to every Debian archive entry.
# Handles both formats: deb822 (*.sources) and one-line (sources.list / *.list).
transform_sources() {   # transform_sources FILE
  case $1 in
    *.sources)
      awk -v want="$WANT_COMPONENTS" '
        function flush(   i, k, nw, w, isdeb, line, s) {
          isdeb = 0
          for (i = 1; i <= n; i++) if (tolower(buf[i]) ~ /^uris:.*debian\.org/) isdeb = 1
          nw = split(want, w, " ")
          for (i = 1; i <= n; i++) {
            line = buf[i]
            if (isdeb && tolower(line) ~ /^components:/) {
              sub(/[ \t]+$/, "", line); s = " " line " "
              for (k = 1; k <= nw; k++) if (!index(s, " " w[k] " ")) line = line " " w[k]
            }
            print line
          }
          n = 0
        }
        /^[ \t]*$/ { flush(); print; next }
        { buf[++n] = $0 }
        END { flush() }' "$1" ;;
    *)
      awk -v want="$WANT_COMPONENTS" '
        /^[ \t]*deb cdrom:/ { print "# " $0 "   # disabled by debian-sid-postinstall (install media)"; next }
        /^[ \t]*deb(-src)?[ \t]/ && /debian\.org/ {
          nw = split(want, w, " "); line = $0; sub(/[ \t]+$/, "", line); s = " " line " "
          for (k = 1; k <= nw; k++) if (!index(s, " " w[k] " ")) line = line " " w[k]
          print line; next
        }
        { print }' "$1" ;;
  esac
}
debian_source_files() {   # every apt source file that lists the Debian archive
  local f
  for f in "$APT_DIR/sources.list" "$APT_DIR"/sources.list.d/*.list "$APT_DIR"/sources.list.d/*.sources; do
    [[ -f $f ]] && grep -qE 'debian\.org|^[ \t]*deb cdrom:' "$f" && echo "$f"
  done
}
components_enabled() {   # true when no Debian source file needs changing
  local f any=0
  while IFS= read -r f; do
    any=1
    transform_sources "$f" | cmp -s - "$f" || return 1
  done < <(debian_source_files)
  [[ $any -eq 1 ]]
}
require_components() {
  components_enabled || { info "Debian's contrib/non-free sections are needed first - enabling them."; step_components; }
}

# Make sure the DKMS module-signing key exists and queue MOK enrolment if needed.
# The same key signs the NVIDIA/Broadcom DKMS modules and the VMware modules.
ensure_signing_key() {
  apt_install dkms mokutil openssl || return 1
  if [[ ! -f $DKMS_CERT || ! -f $DKMS_KEY ]]; then
    info "Generating the DKMS module signing key…"
    dkms generate_mok >>"$LOG" 2>&1 || true
    if [[ ! -f $DKMS_CERT || ! -f $DKMS_KEY ]]; then
      # Same kind of key DKMS creates for itself on its first build
      install -d -m 0755 /var/lib/dkms
      openssl req -new -x509 -nodes -days 36500 -subj "/CN=DKMS module signing key" -newkey rsa:2048 \
        -keyout "$DKMS_KEY" -outform DER -out "$DKMS_CERT" >>"$LOG" 2>&1 || { err "Could not create the signing key"; return 1; }
      chmod 600 "$DKMS_KEY"
    fi
  fi
  if ! secure_boot_enabled; then
    info "Secure Boot is disabled - key created but enrolment not required."
    return 0
  fi
  local t; t="$(mokutil --test-key "$DKMS_CERT" 2>&1)"
  if grep -qi 'already enrolled' <<<"$t"; then
    ok "Signing key already enrolled in MOK."
  elif grep -qi 'enrollment request' <<<"$t"; then
    ok "Signing key enrolment already queued for next boot."; MOK_PENDING=1
  else
    echo
    echo "${C_B}    Secure Boot is ON. The signing key must be enrolled in MOK.${C_0}"
    echo "    Choose a short one-time password now; you'll type it ONCE at the"
    echo "    blue 'MOK management' screen on the next reboot (Enroll MOK → Continue → Yes)."
    echo "    Note: that screen usually uses a US keyboard layout."
    echo
    if mokutil --import "$DKMS_CERT"; then
      MOK_PENDING=1; NEED_REBOOT=1; ok "MOK enrolment queued."
    else
      err "mokutil --import failed"; return 1
    fi
  fi
}

gpu_lines() { lspci -nn | grep -Ei 'vga|3d controller|display controller'; }
newest_kernel() { find /boot -maxdepth 1 -name 'vmlinuz-*' -printf '%f\n' 2>/dev/null | sed 's/^vmlinuz-//' | sort -V | tail -1; }

# ---------- STEP 1: update ---------------------------------------------------
step_update() {
  APT_FRESH=0; apt_refresh || return 1
  if opt OPT_FULL_UPGRADE "Full upgrade (may remove packages if a sid transition needs it)"; then
    info "Upgrading the system with full-upgrade (this can take a while)…"
    apt_get full-upgrade || return 1
  else
    # Never removes anything: packages that would need a removal are held back and listed by apt
    info "Upgrading the system (this can take a while)…"
    apt_get upgrade --with-new-pkgs || return 1
    info "Anything apt listed as 'kept back' is waiting on a transition; run 'sudo apt full-upgrade' yourself to review it."
  fi
  apt_get autoremove || true
  local newest; newest="$(newest_kernel)"
  if [[ -n $newest && $newest != "$(uname -r)" ]]; then
    warn "A newer kernel ($newest) is installed than the one running - reboot when convenient."
    NEED_REBOOT=1
  fi
  ok "System updated."
}

# ---------- STEP 2: contrib / non-free / non-free-firmware ---------------------
step_components() {
  local f changed=0 any=0
  while IFS= read -r f; do
    any=1
    if ! transform_sources "$f" | cmp -s - "$f"; then
      [[ -e $f.bak ]] || cp -p "$f" "$f.bak"    # apt ignores *.bak files
      transform_sources "$f" >"$f.new" && cat "$f.new" >"$f" && rm -f "$f.new"
      info "Updated $f (original kept as ${f##*/}.bak)."; changed=1
    fi
  done < <(debian_source_files)
  [[ $any -eq 1 ]] || { err "No Debian archive entries found under $APT_DIR - not touching anything."; return 1; }
  if [[ $changed -eq 1 ]]; then APT_FRESH=0; else ok "contrib, non-free and non-free-firmware were already enabled."; fi
  apt_refresh || return 1
  ok "Debian's contrib, non-free and non-free-firmware sections are enabled."
}

# ---------- STEP 3: codecs ---------------------------------------------------
step_codecs() {
  require_components || return 1
  local rc=0

  info "Installing ffmpeg and the GStreamer plugin sets…"
  apt_install ffmpeg gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly gstreamer1.0-libav || { err "Core codec packages failed"; rc=1; }

  info "Installing archive formats and tools…"
  apt_install_tolerant "unrar 7zip cabextract lame vainfo" || warn "Some extras failed to install"

  info "DVD playback (libdvd-pkg downloads and builds libdvdcss)…"
  preseed "libdvd-pkg libdvd-pkg/first-install note"
  preseed "libdvd-pkg libdvd-pkg/post-invoke_hook-install boolean true"
  preseed "libdvd-pkg libdvd-pkg/build boolean true"
  if apt_install libdvd-pkg; then
    run dpkg-reconfigure -f noninteractive libdvd-pkg || warn "libdvdcss build did not finish - run: sudo dpkg-reconfigure libdvd-pkg"
  else
    warn "libdvd-pkg not installed - encrypted DVDs won't play."
  fi

  info "Hardware video decode (VA-API) - detecting GPU…"
  local gpus; gpus="$(gpu_lines)"; echo "$gpus" | sed 's/^/    /'
  if grep -qi intel <<<"$gpus"; then
    apt_install intel-media-va-driver-non-free || warn "intel-media-va-driver-non-free failed"
    apt_install i965-va-driver-shaders || true      # pre-Broadwell iGPUs
  fi
  if grep -Eqi 'amd|ati|radeon' <<<"$gpus" || grep -qi nvidia <<<"$gpus"; then
    # Debian's Mesa VA drivers are built with H.264/HEVC support - no swap needed
    apt_install mesa-va-drivers || warn "mesa-va-drivers failed"
  fi
  [[ $rc -eq 0 ]] && ok "Codecs installed. Check decode later with: vainfo"
  return $rc
}

# ---------- STEP 4: NVIDIA driver --------------------------------------------
step_nvidia() {
  local gpus br pkg v
  gpus="$(gpu_lines)"

  if grep -qi nvidia <<<"$gpus"; then
    echo "    NVIDIA GPU detected:"; grep -i nvidia <<<"$gpus" | sed 's/^/      /'
    # The one question this script asks - and only when a card is present
    ask_yn "Install the proprietary NVIDIA driver?" y || { warn "Skipping NVIDIA."; return 2; }
  else
    info "No NVIDIA GPU detected - nothing to install."; return 2
  fi
  require_components || return 1

  # nvidia-detect says which Debian driver package suits this card
  if apt_install nvidia-detect; then echo; nvidia-detect 2>&1 | sed 's/^/    /' | tee -a "$LOG"; echo; fi
  echo "    Choose driver branch (see the recommendation above):"
  echo "      1) Current  - nvidia-driver (recent cards)"
  echo "      2) 470      - nvidia-tesla-470-driver (GTX 6xx/7xx, Kepler)"
  echo "      s) Skip"
  read -rp "    Branch [1]: " br
  case "${br:-1}" in
    1) pkg="nvidia-driver" ;;
    2) pkg="nvidia-tesla-470-driver" ;;
    *) warn "Skipping NVIDIA."; return 2 ;;
  esac

  ensure_signing_key || return 1   # key must exist BEFORE DKMS builds
  apt_install "linux-headers-$ARCH" || true
  apt_install "linux-headers-$(uname -r)" || warn "No headers for the running kernel $(uname -r) - the module will build for the newest kernel only."
  apt_install "$pkg" firmware-misc-nonfree || return 1
  apt_install nvidia-vaapi-driver || true
  if v="$(modinfo -F version nvidia-current 2>/dev/null || modinfo -F version nvidia 2>/dev/null)"; then ok "NVIDIA module $v built."
  else warn "NVIDIA module not found yet - check 'dkms status' after rebooting."; fi
  NEED_REBOOT=1
}

# ---------- STEP 5: other drivers & firmware ---------------------------------
FIRMWARE_PACKAGES="firmware-linux firmware-linux-nonfree firmware-misc-nonfree firmware-amd-graphics firmware-intel-graphics firmware-nvidia-graphics firmware-sof-signed firmware-iwlwifi firmware-realtek firmware-atheros firmware-mediatek firmware-brcm80211"
step_drivers() {
  require_components || return 1
  local did=0 net ucode
  net="$(lspci -nn | grep -i 'network controller')"

  if grep -qi broadcom <<<"$net"; then
    did=1
    echo; echo "    Broadcom Wi-Fi detected:"; grep -i broadcom <<<"$net" | sed 's/^/      /'
    echo "    Only BCM43xx chips unsupported by brcmfmac/b43 need the 'wl' driver."
    if opt OPT_BROADCOM_WL "Proprietary Broadcom driver (broadcom-sta-dkms)"; then
      ensure_signing_key || return 1
      apt_install "linux-headers-$ARCH" broadcom-sta-dkms || return 1
      NEED_REBOOT=1
    fi
  fi

  info "Installing firmware…"
  apt_install_tolerant "$FIRMWARE_PACKAGES" || warn "Some firmware packages aren't available under those names - the rest were installed."
  if grep -qi 'GenuineIntel' /proc/cpuinfo; then ucode=intel-microcode; else ucode=amd64-microcode; fi
  apt_install "$ucode" || warn "$ucode not installed"

  [[ $did -eq 0 ]] && info "No Broadcom Wi-Fi needing the proprietary driver found."
  ok "Driver/firmware step complete."
}

# ---------- STEP 6: build tools ---------------------------------------------
step_devtools() {
  info "Installing GCC, make, DKMS and kernel headers…"
  apt_install build-essential dkms "linux-headers-$ARCH" libelf-dev dwarves git patch bc openssl || return 1
  # Headers for the *running* kernel too, if it's still in the archive
  apt_install "linux-headers-$(uname -r)" \
    || warn "Headers for the running kernel $(uname -r) not available - reboot into the newest kernel."
  if [[ -d /lib/modules/$(uname -r)/build ]]; then
    ok "Build tools ready for kernel $(uname -r)."
  else
    warn "No build tree for running kernel - reboot, then rerun step 7."
  fi
}

# ---------- STEP 7: VMware modules ------------------------------------------
write_vmware_helper() {
  install -d /usr/local/sbin
  cat >"$VMW_HELPER" <<'HELPER'
#!/usr/bin/env bash
# vmware-modules-build: build, install and sign vmmon/vmnet for one or more kernels.
# Usage: vmware-modules-build [--if-missing] [KVER ...]   (default: every kernel with a build tree)
# Source: patched tree in /usr/local/src/vmware-host-modules if present,
#         otherwise VMware's bundled /usr/lib/vmware/modules/source/*.tar
set -uo pipefail
LOG=/var/log/vmware-modules-build.log
KEY=/var/lib/dkms/mok.key
CERT=/var/lib/dkms/mok.pub
PATCHED=/usr/local/src/vmware-host-modules
BUNDLED=/usr/lib/vmware/modules/source
IF_MISSING=0
[[ ${1:-} == --if-missing ]] && { IF_MISSING=1; shift; }

kvers=("$@")
if [[ ${#kvers[@]} -eq 0 ]]; then
  for d in /lib/modules/*/build; do [[ -e $d ]] && kvers+=("$(basename "$(dirname "$d")")"); done
fi

build_one() {
  local kver=$1 tmp m ko signer fail=0
  if [[ $IF_MISSING -eq 1 && -f /lib/modules/$kver/misc/vmmon.ko && -f /lib/modules/$kver/misc/vmnet.ko ]]; then
    return 0
  fi
  [[ -d /lib/modules/$kver/build ]] || { echo "[$kver] no kernel headers, skipping"; return 1; }
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' RETURN
  if [[ -d $PATCHED/vmmon-only && -d $PATCHED/vmnet-only ]]; then
    cp -a "$PATCHED/vmmon-only" "$PATCHED/vmnet-only" "$tmp/"
    echo "[$kver] using patched sources from $PATCHED"
  elif [[ -f $BUNDLED/vmmon.tar && -f $BUNDLED/vmnet.tar ]]; then
    tar -xf "$BUNDLED/vmmon.tar" -C "$tmp" && tar -xf "$BUNDLED/vmnet.tar" -C "$tmp"
    echo "[$kver] using VMware bundled sources"
  else
    echo "[$kver] no VMware module sources found - is VMware Workstation installed?"; return 1
  fi
  # Debian keeps sign-file in the matching linux-kbuild package
  signer=/lib/modules/$kver/build/scripts/sign-file
  [[ -x $signer ]] || signer=$(find /usr/lib/linux-kbuild-*/scripts -name sign-file 2>/dev/null | sort -V | tail -1)
  for m in vmmon vmnet; do
    echo "[$kver] building $m…"
    if ! make -C "$tmp/$m-only" VM_UNAME="$kver" -j"$(nproc)" >>"$LOG" 2>&1; then
      echo "[$kver] $m FAILED to build (see $LOG)"; fail=1; continue
    fi
    ko=$(find "$tmp" -name "$m.ko" -print -quit)
    [[ -z $ko && -f $tmp/$m.o ]] && ko=$tmp/$m.o     # VMware's Makefile copies the .ko to ../$m.o
    [[ -n $ko ]] || { echo "[$kver] $m.ko not produced"; fail=1; continue; }
    install -D -m 0644 "$ko" "/lib/modules/$kver/misc/$m.ko"
    if [[ -f $KEY && -f $CERT && -n $signer && -x $signer ]]; then
      "$signer" sha256 "$KEY" "$CERT" "/lib/modules/$kver/misc/$m.ko" && echo "[$kver] $m signed"
    else
      echo "[$kver] $m NOT signed (no key or sign-file) - fine if Secure Boot is off"
    fi
  done
  depmod -a "$kver"
  return $fail
}

rc=0
for k in "${kvers[@]}"; do build_one "$k" 2>&1 | tee -a "$LOG"; [[ ${PIPESTATUS[0]} -eq 0 ]] || rc=1; done
running=$(uname -r)
if printf '%s\n' "${kvers[@]}" | grep -qx "$running" && [[ -f /lib/modules/$running/misc/vmmon.ko ]]; then
  modprobe -r vmnet vmmon 2>/dev/null; modprobe vmmon && modprobe vmnet || rc=1
fi
exit $rc
HELPER
  chmod 755 "$VMW_HELPER"
}

write_vmware_autorebuild() {
  # 1) Rebuild when a kernel or its headers are installed (Debian runs these hooks with the version as $1)
  local hook
  for hook in "$VMW_HOOK" "$VMW_HOOK_HEADERS"; do
    install -d "$(dirname "$hook")"
    cat >"$hook" <<HOOK
#!/bin/sh
# Rebuild + sign VMware vmmon/vmnet whenever a kernel (or its headers) is installed.
[ -n "\$1" ] || exit 0
[ -x $VMW_HELPER ] || exit 0
[ -d "/lib/modules/\$1/build" ] || exit 0      # headers not there yet - the headers hook or the boot check will do it
$VMW_HELPER --if-missing "\$1" >/dev/null 2>&1 || echo "vmware-modules: build failed for \$1 - see /var/log/vmware-modules-build.log" >&2
exit 0
HOOK
    chmod 755 "$hook"
  done

  # 2) Safety net at boot, in case the hooks ran before the headers were present
  cat >"$VMW_SERVICE" <<UNIT
[Unit]
Description=Build VMware vmmon/vmnet for the running kernel if missing
Before=vmware.service
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c '$VMW_HELPER --if-missing "\$(uname -r)"'

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable vmware-modules-check.service >>"$LOG" 2>&1
}

step_vmware() {
  if [[ ! -f /usr/lib/vmware/modules/source/vmmon.tar ]]; then
    warn "VMware Workstation Pro does not appear to be installed."
    local bundle="$VMWARE_BUNDLE"
    [[ -z $bundle ]] && { warn "Set VMWARE_BUNDLE to the installer's path to install it here - skipping."; return 2; }
    [[ -f $bundle ]] || { err "File not found: $bundle"; return 1; }
    info "Running the VMware installer (you'll need to accept its licence)…"
    sh "$bundle" || { err "VMware installer failed"; return 1; }
  fi

  # Prerequisites
  have build-essential && [[ -d /lib/modules/$(uname -r)/build ]] || step_devtools || return 1
  if secure_boot_enabled; then
    info "Secure Boot is enabled - modules will be signed."
  fi
  # Always create the key: harmless with SB off, and ready if you turn SB on later
  ensure_signing_key || return 1

  write_vmware_helper
  info "Building vmmon/vmnet for all installed kernels with headers…"
  if ! "$VMW_HELPER"; then
    warn "Build with VMware's bundled sources failed (common on brand-new kernels)."
    echo "    Set VMWARE_PATCHED_URL to a community-patched source tree (git) containing"
    echo "    vmmon-only/ and vmnet-only/. This is third-party kernel code - review it first."
    local url="$VMWARE_PATCHED_URL"
    if [[ -n $url ]]; then
      rm -rf "$VMW_PATCHED_SRC"
      run git clone --depth 1 "$url" "$VMW_PATCHED_SRC" || return 1
      "$VMW_HELPER" || { err "Patched build also failed - see /var/log/vmware-modules-build.log"; return 1; }
    else
      return 1
    fi
  fi

  write_vmware_autorebuild
  systemctl restart vmware.service >>"$LOG" 2>&1 || /etc/init.d/vmware restart >>"$LOG" 2>&1 || true

  if secure_boot_enabled && [[ $MOK_PENDING -eq 1 ]]; then
    warn "Modules are signed but the key isn't enrolled yet - VMware will work after the MOK reboot."
    NEED_REBOOT=1
  fi
  ok "VMware modules built$(secure_boot_enabled && echo ', signed') and set to rebuild on kernel updates."
}

# ---------- helpers for running things as the desktop user -------------------
# Who the desktop belongs to: the sudo caller, else DESKTOP_USER, else whoever logged in on this terminal.
desktop_user() {
  local u="${SUDO_USER:-}"
  [[ -z $u || $u == root ]] && u="$DESKTOP_USER"
  [[ -z $u || $u == root ]] && u="$(logname 2>/dev/null || true)"
  [[ -n $u && $u != root ]] && id "$u" >/dev/null 2>&1 && echo "$u"
}
user_home() { local u; u="$(desktop_user)" || return 1; getent passwd "$u" | cut -d: -f6; }
run_as() { local u=$1; shift; runuser -u "$u" -- "$@"; }   # run a command as another user (no sudo needed)
extension_installed() {   # extension_installed UUID - for the desktop user or system-wide
  local home
  if home="$(user_home)" && [[ -f $home/.local/share/gnome-shell/extensions/$1/metadata.json ]]; then
    return 0
  fi
  [[ -f /usr/share/gnome-shell/extensions/$1/metadata.json ]]
}
ego_uuid() { awk -v id="$1" '$1==id {print $2; exit}' "$EGO_STATE" 2>/dev/null; }   # uuid recorded for an EGO ID
as_user() {   # run a command inside the desktop user's session (for gsettings etc.)
  local u uid; u="$(desktop_user)" || return 1; uid="$(id -u "$u")"
  run_as "$u" env DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" \
    XDG_RUNTIME_DIR="/run/user/$uid" "$@"
}
flathub_enabled() { flatpak remotes --columns=name 2>/dev/null | grep -qx flathub; }

# ---------- STEP 8: Btrfs snapshots ------------------------------------------
SNAPPER_APT_HOOK="/etc/apt/apt.conf.d/80snapper"                 # shipped by Debian's snapper package
SNAPPER_APT_HOOK_OWN="/etc/apt/apt.conf.d/80postinstall-snapper" # written here only if that one is missing
# --- /home in its own subvolume -------------------------------------------------
# Debian's installer puts /home inside the root subvolume, so every snapshot of /
# drags your home folder along. This moves /home into its own subvolume (@home).
# The move itself runs once at the next boot, before anyone can log in, so no file
# in /home is in use while it happens.
HOME_MOVER="/usr/local/sbin/home-to-subvolume"
HOME_MOVER_UNIT="/etc/systemd/system/home-to-subvolume.service"

write_home_mover() {
  install -d /usr/local/sbin
  cat >"$HOME_MOVER" <<'MOVER'
#!/bin/sh
# home-to-subvolume: move /home into its own Btrfs subvolume (@home).
# Written by debian-sid-postinstall. Runs once, early at boot, then disables itself.
# Usage: home-to-subvolume [ROOT]     (ROOT defaults to / ; another path is for testing)
set -eu
ROOT="${1:-/}"
FSTAB="${FSTAB:-/etc/fstab}"
HOME_DIR="${ROOT%/}/home"
LOG="${LOG:-/var/log/home-to-subvolume.log}"
exec >>"$LOG" 2>&1
echo "== $(date) =="

finish() {   # nothing (more) to do: switch the boot-time service off
  if [ "$ROOT" = / ]; then systemctl disable home-to-subvolume.service >/dev/null 2>&1 || true; fi
  exit 0
}

[ "$(findmnt -n -o FSTYPE "$ROOT")" = btrfs ] || { echo "root is not Btrfs - nothing to do"; finish; }
[ -d "$HOME_DIR" ] || { echo "no $HOME_DIR - nothing to do"; finish; }
if mountpoint -q "$HOME_DIR"; then echo "$HOME_DIR is already a separate filesystem or subvolume"; finish; fi
if grep -Eq '^[^#]*[[:space:]]/home[[:space:]]' "$FSTAB"; then echo "$FSTAB already has a /home entry - leaving it alone"; finish; fi

dev="$(findmnt -n -o SOURCE "$ROOT" | sed 's/\[.*//')"
rootsub="$(findmnt -n -o FSROOT "$ROOT")"; [ "$rootsub" = / ] && rootsub=""
top="$(mktemp -d)"
trap 'umount "$top" 2>/dev/null || true; rmdir "$top" 2>/dev/null || true' EXIT
mount -o subvolid=5 "$dev" "$top"
old="$top$rootsub/home"
new="$top/@home"
mark="$top/@home.being-created"
[ -d "$old" ] || { echo "cannot see the current home folder at $old - stopping"; exit 1; }

# A half-made @home from an interrupted earlier attempt is ours to redo; anything else is not ours to touch
if [ -e "$new" ]; then
  if [ -e "$mark" ]; then btrfs subvolume delete "$new"
  else echo "a subvolume called @home already exists and was not made by this script - stopping"; exit 1; fi
fi
: >"$mark"
btrfs subvolume create "$new"

# Reflink copy: instant and takes no extra space, because both copies share the same data blocks
cp -a --reflink=always "$old/." "$new/"

count() { (cd "$1" && find . | wc -l); }
bytes() { (cd "$1" && find . -type f -printf '%s\n' | awk '{s+=$1} END {print s+0}'); }
if [ "$(count "$old")" != "$(count "$new")" ] || [ "$(bytes "$old")" != "$(bytes "$new")" ]; then
  echo "the copy does not match the original - leaving /home exactly as it was"; exit 1
fi

# Mount it like the root filesystem, but on the @home subvolume
uuid="$(findmnt -n -o UUID "$ROOT")"
opts="$(awk '$1 !~ /^#/ && $2 == "/" {print $4; exit}' "$FSTAB" | tr ',' '\n' | grep -Ev '^(subvol|subvolid)=' | paste -sd, -)"
[ -n "$opts" ] || opts=defaults
printf '%s\n' "UUID=$uuid  /home  btrfs  $opts,subvol=@home  0  0" >>"$FSTAB"
mount -o subvol=@home "$dev" "$HOME_DIR"
rm -f "$mark"

# The old copy is now hidden underneath the new mount; remove it so snapshots of / stop carrying it
if [ "$old" -ef "$new" ]; then echo "old and new are the same folder?! not deleting anything"; exit 1; fi
find "$old" -mindepth 1 -delete
echo "done: $HOME_DIR is now the @home subvolume"
if [ "$ROOT" = / ]; then systemctl daemon-reload || true; fi
finish
MOVER
  chmod 755 "$HOME_MOVER"
  cat >"$HOME_MOVER_UNIT" <<UNIT
[Unit]
Description=Move /home into its own Btrfs subvolume (one-off)
After=local-fs.target
Before=systemd-user-sessions.service display-manager.service
ConditionPathExists=$HOME_MOVER

[Service]
Type=oneshot
ExecStart=$HOME_MOVER

[Install]
WantedBy=multi-user.target
UNIT
}

home_is_separate() { mountpoint -q /home || grep -Eq '^[^#]*[[:space:]]/home[[:space:]]' /etc/fstab; }
home_move_pending() { [[ -f $HOME_MOVER_UNIT ]] && systemctl is-enabled home-to-subvolume.service >/dev/null 2>&1; }

setup_home_subvolume() {
  if home_is_separate; then ok "/home is already separate from the root subvolume."; return 0; fi
  write_home_mover
  systemctl daemon-reload
  run systemctl enable home-to-subvolume.service || { warn "Could not schedule the /home move."; return 1; }
  NEED_REBOOT=1
  ok "/home will be moved into its own subvolume at the next boot (log: /var/log/home-to-subvolume.log)."
  info "The baseline snapshot below still holds /home as it is now, should you ever need it back."
}

step_snapshots() {
  if [[ $(findmnt -n -o FSTYPE /) != btrfs ]]; then
    warn "Root filesystem is not Btrfs (Debian's installer defaults to ext4) - snapshots skipped."; return 2
  fi
  info "Installing snapper…"
  apt_install snapper || return 1
  apt_install btrfs-assistant || warn "btrfs-assistant (GUI for browsing/restoring snapshots) not installed"

  if ! snapper -c root get-config >/dev/null 2>&1; then
    run snapper -c root create-config / || return 1
  fi
  # Snapshots on apt runs only - no hourly timeline eating disk space
  run snapper -c root set-config TIMELINE_CREATE=no NUMBER_LIMIT=10 NUMBER_LIMIT_IMPORTANT=5 || true
  local u
  if u="$(desktop_user)"; then
    run snapper -c root set-config "ALLOW_USERS=$u" SYNC_ACL=yes || true
  fi
  run systemctl enable --now snapper-cleanup.timer || true

  # Snapshot around every apt run. Debian's snapper package brings its own apt hook;
  # only if that is missing do we add a simple one.
  if [[ -f $SNAPPER_APT_HOOK ]]; then
    ok "apt will snapshot / before and after every run (snapper's own hook)."
  else
    cat >"$SNAPPER_APT_HOOK_OWN" <<'HOOK'
// Take a snapper snapshot of / before every apt/dpkg run (added by debian-sid-postinstall)
DPkg::Pre-Invoke { "if [ -x /usr/bin/snapper ] && [ -e /etc/snapper/configs/root ]; then snapper -c root create -c number -d apt || true; fi"; };
HOOK
    ok "apt will snapshot / before every run."
  fi

  if opt OPT_HOME_SUBVOLUME "Give /home its own subvolume (done at the next boot)"; then
    setup_home_subvolume || warn "/home left inside the root subvolume."
  fi

  run snapper -c root create -c important -d "baseline before debian-sid-postinstall" \
    && ok "Baseline snapshot taken."

  echo
  echo "    grub-btrfs adds a snapshots submenu to GRUB so you can boot a snapshot"
  echo "    if an update breaks the desktop."
  if opt OPT_GRUB_BTRFS "Install grub-btrfs"; then
    if apt_install grub-btrfs; then
      ok "grub-btrfs installed from Debian."
    else
      warn "No grub-btrfs package - building it from upstream source (github.com/Antynea/grub-btrfs)."
      apt_install git make inotify-tools || return 1
      rm -rf /usr/local/src/grub-btrfs
      run git clone --depth 1 https://github.com/Antynea/grub-btrfs /usr/local/src/grub-btrfs || return 1
      run make -C /usr/local/src/grub-btrfs install || return 1
      ok "grub-btrfs installed from source."
    fi
    run update-grub || warn "update-grub reported errors"
    run systemctl enable --now grub-btrfsd || warn "grub-btrfsd service not started"
  fi
}

# ---------- STEP 9: Flathub --------------------------------------------------
step_flathub() {
  apt_install flatpak || return 1
  apt_install gnome-software-plugin-flatpak || warn "GNOME Software's Flatpak plugin not installed (Flatpak apps won't show in Software)"
  run flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo || return 1
  run flatpak remote-modify --enable flathub || true
  flathub_enabled && ok "Flathub enabled ($(flatpak remote-ls flathub --app --columns=application 2>/dev/null | wc -l) apps visible)."
}

# ---------- STEP 10: firmware ------------------------------------------------
step_firmware() {
  apt_install fwupd || return 1
  run fwupdmgr refresh --force || warn "Could not refresh LVFS metadata"
  echo
  local out; out="$(fwupdmgr get-updates 2>&1)"; echo "$out" | sed 's/^/    /'; echo "$out" >>"$LOG"
  if grep -Eqi 'no updat|no upgrades|no updatable' <<<"$out"; then
    ok "Firmware is up to date."; return 0
  fi
  if grep -qi discharging /sys/class/power_supply/BAT*/status 2>/dev/null; then
    warn "Running on battery - many firmware updates are refused. Plug into AC first."
  fi
  if opt OPT_APPLY_FIRMWARE "Apply the firmware updates listed above"; then
    fwupdmgr update -y --no-reboot-check || { err "fwupdmgr update failed"; return 1; }
    NEED_REBOOT=1
  else
    return 2
  fi
}

# ---------- STEP 11: GNOME tweaks -------------------------------------------
add_extension() {   # enable a GNOME extension for the desktop user (takes effect at next login)
  local uuid=$1 cur
  cur="$(as_user gsettings get org.gnome.shell enabled-extensions 2>/dev/null)" || return 1
  grep -q "'$uuid'" <<<"$cur" && return 0
  if [[ $cur == "@as []" || $cur == "[]" ]]; then cur="['$uuid']"; else cur="${cur%]}, '$uuid']"; fi
  as_user gsettings set org.gnome.shell enabled-extensions "$cur"
}

# Copy an unpacked extension (folder SRC containing metadata.json) into place
# for the desktop user, or system-wide if there is no desktop user.
deploy_extension() {   # deploy_extension UUID SRC
  local uuid=$1 src=$2 dest u home
  if u="$(desktop_user)"; then
    home="$(getent passwd "$u" | cut -d: -f6)"
    dest="$home/.local/share/gnome-shell/extensions/$uuid"
  else
    u=""; dest="/usr/share/gnome-shell/extensions/$uuid"
  fi

  if [[ -e $dest/.git ]]; then
    # A git checkout there is a working copy - never overwrite it
    warn "$dest is a git checkout - leaving it untouched."; return 0
  fi
  if [[ -n $u ]]; then
    run_as "$u" mkdir -p "$dest" || { err "Could not create $dest"; return 1; }
  else
    install -d "$dest"
  fi
  find "$dest" -mindepth 1 -delete            # clear any previous copy
  cp -r --preserve=mode,timestamps "$src/." "$dest/" || { err "Copy to $dest failed"; return 1; }
  if [[ -d $dest/schemas ]] && command -v glib-compile-schemas >/dev/null; then
    glib-compile-schemas "$dest/schemas" >>"$LOG" 2>&1 || warn "Could not recompile the extension's settings schema"
  fi
  [[ -n $u ]] && chown -R "$u:" "$dest"
  ok "Installed $uuid to $dest."
}

# Install one extension from extensions.gnome.org by the number in its URL.
install_ego_extension() {   # install_ego_extension ID "Name"
  local id=$1 name=$2 shellver json uuid url tmp rc=0
  uuid="$(ego_uuid "$id")"
  if [[ -n $uuid ]] && extension_installed "$uuid"; then
    ok "$name already installed."; EXT_ADD+=("$uuid"); return 0
  fi
  shellver="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -1)"
  [[ -n $shellver ]] || { err "Can't tell the GNOME Shell version - is gnome-shell installed?"; return 1; }
  command -v curl >/dev/null && command -v unzip >/dev/null || apt_install curl unzip || return 1

  info "$name: looking up the build for GNOME Shell $shellver…"
  json="$(curl -fsSL --retry 2 "https://extensions.gnome.org/extension-info/?pk=$id&shell_version=$shellver" 2>>"$LOG")" \
    || { warn "$name: extensions.gnome.org has no build for GNOME Shell $shellver (or can't be reached)."; return 1; }
  uuid="$(grep -oE '"uuid": *"[^"]+"' <<<"$json" | head -1 | cut -d'"' -f4)"
  url="$(grep -oE '"download_url": *"[^"]+"' <<<"$json" | head -1 | cut -d'"' -f4)"; url="${url//\\/}"
  if [[ ! $uuid =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$ || $url != /download-extension/* ]]; then
    err "$name: unexpected answer from extensions.gnome.org for ID $id."; return 1
  fi

  tmp="$(mktemp -d)"
  if curl -fsSL --retry 2 -o "$tmp/ext.zip" "https://extensions.gnome.org$url" 2>>"$LOG" \
     && unzip -q -o "$tmp/ext.zip" -d "$tmp/ext" >>"$LOG" 2>&1 \
     && grep -qF "\"$uuid\"" "$tmp/ext/metadata.json" 2>/dev/null; then
    deploy_extension "$uuid" "$tmp/ext" || rc=1
  else
    err "$name: download or unpack failed."; rc=1
  fi
  rm -rf "$tmp"
  [[ $rc -eq 0 ]] || return 1

  install -d "$(dirname "$EGO_STATE")"
  { grep -v "^$id " "$EGO_STATE" 2>/dev/null; echo "$id $uuid"; } >"$EGO_STATE.new" && mv "$EGO_STATE.new" "$EGO_STATE"
  EXT_ADD+=("$uuid")
}

# Install a GNOME extension bundled in this repo (extensions/<uuid>/).
install_bundled_extension() {
  local uuid=$1 src="$SCRIPT_DIR/extensions/$1" tmp="" shellver rc=0

  if [[ ! -f $src/metadata.json ]]; then
    info "extensions/$uuid is not next to this script - fetching it from GitHub…"
    command -v curl >/dev/null && command -v tar >/dev/null || apt_install curl tar || return 1
    tmp="$(mktemp -d)"
    if ! curl -fsSL --retry 3 "$REPO_TARBALL" \
         | tar -xz -C "$tmp" --strip-components=1 --wildcards "*/extensions/$uuid/*" 2>>"$LOG"; then
      err "Could not download $uuid from $REPO_TARBALL"; rm -rf "$tmp"; return 1
    fi
    src="$tmp/extensions/$uuid"
  fi
  if ! grep -q "\"uuid\": *\"$uuid\"" "$src/metadata.json" 2>/dev/null; then
    err "$src does not look like the $uuid extension."; [[ -n $tmp ]] && rm -rf "$tmp"; return 1
  fi

  # Warn (don't block) if this GNOME Shell version isn't one the extension declares
  shellver="$(gnome-shell --version 2>/dev/null | grep -oE '[0-9]+' | head -1)"
  if [[ -n $shellver ]] && ! grep -q "\"$shellver\"" "$src/metadata.json"; then
    warn "$uuid doesn't list GNOME Shell $shellver as supported - it may refuse to load."
  fi

  deploy_extension "$uuid" "$src" || rc=1
  [[ -n $tmp ]] && rm -rf "$tmp"
  return $rc
}

# Copy the WALLPAPER image from this repo into the user's backgrounds folder and set it.
install_wallpaper() {
  [[ -n $WALLPAPER ]] || return 0
  local src="$SCRIPT_DIR/$WALLPAPER" name="${WALLPAPER##*/}" u home dest tmp="" rc=0
  u="$(desktop_user)" && home="$(user_home)" || return 1
  if [[ ! -f $src ]]; then
    info "$WALLPAPER is not next to this script - fetching it from GitHub…"
    tmp="$(mktemp -d)"; src="$tmp/$name"
    curl -fsSL --retry 3 -o "$src" "$REPO_RAW/$WALLPAPER" 2>>"$LOG" \
      || { warn "Could not download the wallpaper - background left unchanged."; rm -rf "$tmp"; return 1; }
  fi
  dest="$home/.local/share/backgrounds/$name"
  if run_as "$u" mkdir -p "${dest%/*}" && install -m 0644 -o "$u" -g "$(id -gn "$u")" "$src" "$dest"; then
    if as_user gsettings set org.gnome.desktop.background picture-uri "'file://$dest'" >>"$LOG" 2>&1 \
       && as_user gsettings set org.gnome.desktop.background picture-uri-dark "'file://$dest'" >>"$LOG" 2>&1 \
       && as_user gsettings set org.gnome.desktop.background picture-options "'zoom'" >>"$LOG" 2>&1; then
      ok "Desktop background set to $dest."
    else
      warn "Wallpaper copied to $dest but could not be set (not in a GNOME session?)."; rc=1
    fi
  else
    warn "Could not copy the wallpaper to $dest."; rc=1
  fi
  [[ -n $tmp ]] && rm -rf "$tmp"
  return $rc
}

# Add the CUSTOM_SHORTCUTS table to GNOME's custom keyboard shortcuts.
# A shortcut with the same name is updated in place; others are left alone.
apply_custom_shortcuts() {
  local schema=org.gnome.settings-daemon.plugins.media-keys
  local base=/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings
  local row name cmd binding exe list p path i
  for row in "${CUSTOM_SHORTCUTS[@]}"; do
    IFS='|' read -r name cmd binding <<<"$row"
    [[ -n $name && -n $cmd && -n $binding ]] || { warn "Ignoring malformed shortcut: $row"; continue; }
    exe="${cmd%% *}"
    if ! command -v "$exe" >/dev/null; then
      # Debian packages are usually named after the command they provide
      apt_install "$exe" \
        || warn "'$exe' is not installed - the '$name' shortcut won't do anything until it is."
    fi
    list="$(as_user gsettings get "$schema" custom-keybindings 2>/dev/null)" \
      || { warn "Could not read the keyboard shortcuts (not in a GNOME session?)."; return 1; }
    path=""
    for p in $(grep -oE "$base/[^']+/" <<<"$list"); do
      if [[ "$(as_user gsettings get "$schema.custom-keybinding:$p" name 2>/dev/null)" == "'$name'" ]]; then path=$p; break; fi
    done
    if [[ -z $path ]]; then
      i=0; while grep -qF "$base/custom$i/" <<<"$list"; do i=$((i+1)); done
      path="$base/custom$i/"
      if [[ $list == "@as []" || $list == "[]" ]]; then list="['$path']"; else list="${list%]}, '$path']"; fi
      as_user gsettings set "$schema" custom-keybindings "$list" >>"$LOG" 2>&1 \
        || { warn "Could not add the '$name' shortcut."; continue; }
    fi
    if as_user gsettings set "$schema.custom-keybinding:$path" name "'$name'" >>"$LOG" 2>&1 \
       && as_user gsettings set "$schema.custom-keybinding:$path" command "'$cmd'" >>"$LOG" 2>&1 \
       && as_user gsettings set "$schema.custom-keybinding:$path" binding "'$binding'" >>"$LOG" 2>&1; then
      ok "Shortcut '$name': $binding runs '$cmd'."
    else
      warn "Could not set the '$name' shortcut."
    fi
  done
}

# Apply the GNOME_SETTINGS table for the desktop user.
apply_gnome_settings() {
  local line schema key value file home n=0 bad=0
  local -a args
  home="$(user_home)" || return 1
  for line in "${GNOME_SETTINGS[@]}"; do
    read -r schema key value <<<"$line"
    [[ -n $schema && -n $key && -n $value ]] || { warn "Ignoring malformed GNOME setting: $line"; continue; }
    args=()
    if [[ $schema == org.gnome.shell.extensions.* ]]; then
      # Extension schemas live in the extension's own folder, not the system one
      file="$(compgen -G "$home/.local/share/gnome-shell/extensions/*/schemas/$schema.gschema.xml" | head -1)"
      [[ -n $file ]] || file="$(compgen -G "/usr/share/gnome-shell/extensions/*/schemas/$schema.gschema.xml" | head -1)"
      [[ -n $file ]] && args=(--schemadir "${file%/*}")
    fi
    if as_user gsettings "${args[@]}" set "$schema" "$key" "$value" >>"$LOG" 2>&1; then
      n=$((n+1))
    else
      warn "Could not set $schema $key"; bad=$((bad+1))
    fi
  done
  if [[ $bad -eq 0 ]]; then ok "Applied $n GNOME settings."
  else warn "Applied $n GNOME settings, $bad failed (not in a GNOME session, or a key doesn't exist on this version)."; fi
}

step_gnome() {
  apt_install gnome-tweaks || return 1

  echo "    Accent Color Everywhere applies one accent colour (from the wallpaper, a"
  echo "    colour you pick, or GNOME Settings) to the Shell, GTK 3/4, Qt apps and icons."
  if opt OPT_ACCENT_COLOR "Bundled Accent Color Everywhere extension"; then
    install_bundled_extension "$ACCENT_UUID" && EXT_ADD+=("$ACCENT_UUID")
  fi

  if opt OPT_APPINDICATOR "AppIndicator support (tray icons for Discord, Nextcloud, Steam…)"; then
    apt_install gnome-shell-extension-appindicator && EXT_ADD+=("appindicatorsupport@rgcjonas.gmail.com")
  fi
  if opt OPT_DASH_TO_DOCK "Dash to Dock (always-visible dock)"; then
    apt_install gnome-shell-extension-dashtodock && EXT_ADD+=("dash-to-dock@micxgx.gmail.com")
  fi
  local row id name
  for row in "${GNOME_EXTENSIONS[@]}"; do
    IFS='|' read -r id name <<<"$row"
    install_ego_extension "$id" "$name" || warn "$name was not installed."
  done

  # Extension Manager: Debian packages it; Flathub is the fallback
  if ! apt_install gnome-shell-extension-manager; then
    flathub_enabled || step_flathub
    run flatpak install -y --noninteractive flathub com.mattjakeman.ExtensionManager \
      || warn "Extension Manager not installed"
  fi

  if desktop_user >/dev/null; then
    apply_gnome_settings
    apply_custom_shortcuts
    install_wallpaper
    local e; for e in "${EXT_ADD[@]}"; do add_extension "$e" || warn "Could not enable $e"; done
    [[ ${#EXT_ADD[@]} -gt 0 ]] && info "Extensions enable at your next log-in (Wayland can't reload the shell)."
  else
    warn "Can't tell whose desktop this is - run via sudo from your session, or set DESKTOP_USER=yourname."
  fi
  ok "GNOME tweaks done."
}
EXT_ADD=()

# ---------- STEP 12: Microsoft core fonts -----------------------------------
MSFONTS_FILE="/usr/share/fonts/truetype/msttcorefonts/Arial.ttf"
step_msfonts() {
  if have ttf-mscorefonts-installer && [[ -f $MSFONTS_FILE ]]; then ok "Microsoft core fonts already installed."; return 0; fi
  echo "    Installs Arial, Times New Roman, Verdana, Georgia, Courier New, Comic Sans,"
  echo "    Impact, Trebuchet, Andale Mono and Webdings using Debian's"
  echo "    ttf-mscorefonts-installer, which downloads the original font packages."
  echo "    They are covered by Microsoft's EULA: https://corefonts.sourceforge.net/eula.htm"
  opt OPT_MSFONTS_EULA "Microsoft core fonts EULA accepted" || return 2
  require_components || return 1

  preseed "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true"
  apt_install ttf-mscorefonts-installer || return 1
  if [[ -f $MSFONTS_FILE ]]; then
    ok "Microsoft core fonts installed."
  else
    warn "The installer package is in, but the font download didn't finish - re-run: sudo dpkg-reconfigure ttf-mscorefonts-installer"
    return 1
  fi
}

# ---------- STEP 13: gaming ---------------------------------------------------
# Where Proton-GE goes: Steam's own folder if Steam has been started before,
# otherwise the system-wide folder Steam also searches (so nothing is created
# in Steam's home folder before its first run).
STEAM_SYSTEM_COMPAT="/usr/local/share/steam/compatibilitytools.d"
steam_user_dir() {   # prints the user's Steam folder if one exists
  local home d; home="$(user_home)" || return 1
  for d in "$home/.steam/debian-installation" "$home/.local/share/Steam"; do
    [[ -d $d ]] && { echo "$d"; return 0; }
  done
  return 1
}

# Download the newest GE-Proton release, verified against the checksum published with it.
install_proton_ge() {
  local u ctd sdir tag base tmp name found="" top="" rc=0
  if u="$(desktop_user)" && sdir="$(steam_user_dir)"; then
    ctd="$sdir/compatibilitytools.d"
  else
    u=""; ctd="$STEAM_SYSTEM_COMPAT"
  fi
  command -v curl >/dev/null || apt_install curl || return 1

  # The "latest" page redirects to .../releases/tag/<name>
  tag="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$PROTON_GE_REPO/releases/latest" 2>>"$LOG")"; tag="${tag##*/}"
  if [[ ! $tag =~ ^GE-Proton[0-9]+-[0-9]+$ ]]; then
    warn "Could not work out the latest Proton-GE release (got '${tag:-nothing}')."; return 1
  fi
  if proton_ge_installed "$tag"; then ok "Proton-GE $tag already installed."; return 0; fi

  info "Downloading Proton-GE $tag (about 550 MB) into $ctd…"
  base="$PROTON_GE_REPO/releases/download/$tag"
  tmp="$(mktemp -d -p /var/tmp)"            # /var/tmp is on disk; /tmp may be RAM
  # Proton 11 onwards names its files per architecture (GE-Proton11-12-x86_64.tar.gz);
  # earlier releases have no suffix. Try the new name first.
  for name in "$tag-$(uname -m)" "$tag"; do
    if curl -fsSL --retry 3 -o "$tmp/$name.sha512sum" "$base/$name.sha512sum" 2>>"$LOG"; then found=$name; break; fi
  done
  if [[ -n $found ]] && curl -fsSL --retry 3 -o "$tmp/$found.tar.gz" "$base/$found.tar.gz" 2>>"$LOG"; then
    if (cd "$tmp" && sha512sum -c "$found.sha512sum" >>"$LOG" 2>&1); then
      top="$(tar -tzf "$tmp/$found.tar.gz" 2>/dev/null | head -1 | cut -d/ -f1)"   # folder the archive unpacks to
      if [[ $top == GE-Proton* ]] && install -d "$ctd" \
         && tar -xzf "$tmp/$found.tar.gz" -C "$ctd" --no-same-owner; then
        [[ -n $u ]] && chown -R "$u:" "$ctd"
      else
        err "Could not unpack Proton-GE into $ctd."; [[ $top == GE-Proton* ]] && rm -rf "${ctd:?}/$top"; rc=1
      fi
    else
      err "Proton-GE $tag failed its checksum - not installed."; rc=1
    fi
  else
    warn "Could not download Proton-GE $tag (see $LOG)."; rc=1
  fi
  rm -rf "$tmp"
  [[ $rc -eq 0 ]] && ok "Proton-GE $tag installed - pick it in Steam under Settings > Compatibility (restart Steam first)."
  return $rc
}

proton_ge_installed() {   # proton_ge_installed [TAG]  - any GE-Proton, or one particular release
  local pat="${1:-GE-Proton}" sdir
  compgen -G "$STEAM_SYSTEM_COMPAT/$pat*" >/dev/null && return 0
  sdir="$(steam_user_dir)" && compgen -G "$sdir/compatibilitytools.d/$pat*" >/dev/null
}

step_gaming() {
  require_components || return 1
  local u pkg rc=0

  # Steam and most Windows games are 32-bit
  if ! dpkg --print-foreign-architectures | grep -qx i386; then
    info "Enabling 32-bit (i386) packages…"
    run dpkg --add-architecture i386 || return 1
    APT_FRESH=0
  fi

  echo "    Debian's steam-installer shows the Steam Install Agreement when it installs."
  opt OPT_STEAM_LICENCE "Steam Install Agreement accepted" || { warn "Steam needs its licence accepted - skipping the gaming step."; return 2; }
  for pkg in steam steam-installer; do
    preseed "$pkg steam/question select I AGREE"
    preseed "$pkg steam/license note"
  done
  info "Installing Steam…"
  apt_install steam-installer || { err "Steam could not be installed."; return 1; }

  # With the proprietary NVIDIA driver, Steam needs the matching 32-bit libraries
  if have nvidia-driver; then pkg=nvidia-driver-libs:i386
  elif have nvidia-tesla-470-driver; then pkg=nvidia-tesla-470-driver-libs:i386
  else pkg=""; fi
  if [[ -n $pkg ]]; then
    apt_install "$pkg" || { warn "$pkg not installed - Steam games may not find the NVIDIA driver."; rc=1; }
  fi

  info "Installing gaming extras: $GAMING_PACKAGES"
  apt_install_tolerant "$GAMING_PACKAGES" || rc=1

  # NTSYNC: kernel-level Windows synchronisation, used automatically by current Proton-GE
  if modprobe ntsync 2>>"$LOG"; then
    echo ntsync >/etc/modules-load.d/ntsync.conf
    ok "NTSYNC kernel module loaded now and at every boot."
  else
    warn "This kernel has no ntsync module - Proton will use its older, slower method."
  fi

  # Where a gamemode group exists, only its members may change CPU governor and priorities
  if u="$(desktop_user)" && getent group gamemode >/dev/null; then
    if id -nG "$u" | tr ' ' '\n' | grep -qx gamemode; then :
    else run usermod -aG gamemode "$u" && info "Added $u to the gamemode group (takes effect at next log-in)."; fi
  fi

  # ProtonUp-Qt: GUI for adding, updating and removing Proton-GE versions later
  flathub_enabled || step_flathub
  run flatpak install -y --noninteractive flathub net.davidotek.pupgui2 || { warn "ProtonUp-Qt not installed."; rc=1; }

  if opt OPT_PROTON_GE "Install the latest Proton-GE"; then
    install_proton_ge || rc=1
  fi

  [[ $rc -eq 0 ]] && ok "Gaming set-up done. Per-game launch options: gamemoderun mangohud %command%"
  return $rc
}

# =============================================================================
#  SOFTWARE SUBMENU  (S)
#  Rule: apt first, Flathub as fallback - unless an app is Flathub-only.
# =============================================================================
declare -A SW_RESULT

# One line per app:   key | menu label | apt package(s) | Flathub app ID
#   apt is tried first, then Flathub; leave either field empty to skip it.
#   To add an ordinary app, add a line - nothing else is needed.
#   Optional hooks, picked up by name when they exist:
#     sw_pre_<key>       runs first (add a repo…); non-zero = skip the apt attempt
#     sw_post_<key>      runs after a successful install
#     sw_fallback_<key>  runs if neither apt nor Flathub worked
#     sw_status_<key>    extra "is it installed?" check for the menu
SOFTWARE=(
  "brave|Brave Origin + Bitwarden extension (policy)|brave-origin|"
  "qbittorrent|qBittorrent|qbittorrent|org.qbittorrent.qBittorrent"
  "vlc|VLC media player|vlc|org.videolan.VLC"
  "bitwarden|Bitwarden (Flathub)||com.bitwarden.desktop"
  "mullvad|Mullvad VPN (Mullvad repo)|mullvad-vpn|"
  "vscode|VS Code (Microsoft repo)|code|com.visualstudio.code"
  "claude_code|Claude Code (Anthropic repo)|claude-code|"
  "extmanager|Extension Manager|gnome-shell-extension-manager|com.mattjakeman.ExtensionManager"
)

# Generic installer: sw_install "Name" "apt packages" "flatpak app id"
sw_install() {
  local name=$1 pkgs=$2 fp=$3
  if [[ -n $pkgs ]]; then
    # shellcheck disable=SC2086
    if apt_install $pkgs; then ok "$name installed (apt)."; return 0; fi
    [[ -n $fp ]] && warn "$name: apt install failed - falling back to Flathub."
  fi
  if [[ -n $fp ]]; then
    flathub_enabled || step_flathub || return 1
    if run flatpak install -y --noninteractive flathub "$fp"; then ok "$name installed (Flathub)."; return 0; fi
  fi
  return 1
}

# Install one app from the SOFTWARE table, running its hooks if it has any.
sw_app() {
  local key=$1 name=$2 pkgs=$3 fp=$4
  if declare -F "sw_pre_$key" >/dev/null && ! "sw_pre_$key"; then pkgs=""; fi
  if sw_install "$name" "$pkgs" "$fp"; then
    if declare -F "sw_post_$key" >/dev/null; then "sw_post_$key"; fi
    return 0
  fi
  if declare -F "sw_fallback_$key" >/dev/null && "sw_fallback_$key"; then return 0; fi
  err "$name could not be installed."; return 1
}

# Is an app installed?  Prints a status token (see render_status).
sw_status() {
  local key=$1 pkgs=$2 fp=$3
  # shellcheck disable=SC2086
  if [[ -n $pkgs ]] && have $pkgs; then echo ok; return; fi
  if [[ -n $fp ]] && flatpak info "$fp" >/dev/null 2>&1; then echo ok; return; fi
  if declare -F "sw_status_$key" >/dev/null; then "sw_status_$key"; fi
}

# Fetch a file for apt (a signing key or a sources file) into place.
fetch_to() {   # fetch_to URL DEST
  command -v curl >/dev/null || apt_install curl || return 1
  install -d -m 0755 "$(dirname "$2")"
  curl -fsSL --retry 3 -o "$2.part" "$1" 2>>"$LOG" && mv "$2.part" "$2" && chmod 0644 "$2" \
    || { rm -f "$2.part"; return 1; }
}

# ----- Brave Origin (stable), from Brave's own apt repository -------------------
BRAVE_KEY_URL="https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg"
BRAVE_SOURCES_URL="https://brave-browser-apt-release.s3.brave.com/brave-browser.sources"
BRAVE_KEY="/usr/share/keyrings/brave-browser-archive-keyring.gpg"
BRAVE_SOURCES="$APT_DIR/sources.list.d/brave-browser-release.sources"

sw_pre_brave() {
  [[ -f $BRAVE_SOURCES && -f $BRAVE_KEY ]] && return 0
  info "Adding Brave's stable (release) repository…"
  fetch_to "$BRAVE_KEY_URL" "$BRAVE_KEY" && fetch_to "$BRAVE_SOURCES_URL" "$BRAVE_SOURCES" \
    || { err "Could not add the Brave repo."; rm -f "$BRAVE_SOURCES"; return 1; }
  APT_FRESH=0
}

# Install Chrome Web Store extensions into Brave via managed policy.
# Brave fetches and auto-updates them from the Web Store on next start.
BRAVE_POLICY_FILE="/etc/brave/policies/managed/postinstall-extensions.json"
BRAVE_EXTENSIONS=(
  "nngceckbapebfimnlniiiahkandclblb"   # Bitwarden Password Manager
)
sw_post_brave() {
  local mode="normal_installed" id first=1
  echo
  echo "    Adding the Bitwarden extension via Brave's managed policy."
  echo "    Brave will show 'Managed by your organisation' and the extension"
  echo "    can't be removed from inside Brave (edit/delete $BRAVE_POLICY_FILE instead)."
  if opt OPT_BRAVE_LOCK_BITWARDEN "Lock Bitwarden fully (can't even be switched off)"; then mode="force_installed"; fi
  install -d -m 0755 "$(dirname "$BRAVE_POLICY_FILE")"
  {
    echo '{'
    echo '  "ExtensionSettings": {'
    for id in "${BRAVE_EXTENSIONS[@]}"; do
      [[ $first -eq 1 ]] || echo ','
      first=0
      printf '    "%s": {\n      "installation_mode": "%s",\n      "update_url": "https://clients2.google.com/service/update2/crx"\n    }' "$id" "$mode"
    done
    echo
    echo '  }'
    echo '}'
  } >"$BRAVE_POLICY_FILE"
  chmod 0644 "$BRAVE_POLICY_FILE"
  if command -v python3 >/dev/null && ! python3 -m json.tool "$BRAVE_POLICY_FILE" >/dev/null 2>&1; then
    err "Policy file is not valid JSON - removing it."; rm -f "$BRAVE_POLICY_FILE"; return 1
  fi
  ok "Bitwarden extension queued ($mode) - it appears next time Brave starts (check brave://policy)."
}

sw_fallback_brave() {
  warn "Brave Origin could not be installed from Brave's repo."
  echo "    The only Flathub fallback is regular Brave (com.brave.Browser), NOT Brave Origin."
  opt OPT_BRAVE_FLATHUB_FALLBACK "Install regular Brave from Flathub instead" || return 1
  sw_install "Brave (Flathub)" "" com.brave.Browser || return 1
  warn "The Flatpak can't read host policies - add the Bitwarden extension from the Web Store yourself."
}

sw_status_brave() {
  flatpak info com.brave.Browser >/dev/null 2>&1 && echo "warn:regular Brave (Flathub), not Origin"
}

# ----- Bitwarden: Flathub-only. The official .deb has no repo, so apt never
#       updates it, whereas the Flathub build updates with 'flatpak update'.

# ----- Mullvad VPN (no official Flatpak, so no fallback) ------------------------
MULLVAD_KEY="/usr/share/keyrings/mullvad-keyring.asc"
MULLVAD_LIST="$APT_DIR/sources.list.d/mullvad.list"
sw_pre_mullvad() {
  [[ -f $MULLVAD_LIST && -f $MULLVAD_KEY ]] && return 0
  info "Adding Mullvad repository…"
  fetch_to https://repository.mullvad.net/deb/mullvad-keyring.asc "$MULLVAD_KEY" \
    || { err "Could not add the Mullvad repo."; return 1; }
  echo "deb [signed-by=$MULLVAD_KEY arch=$ARCH] https://repository.mullvad.net/deb/stable stable main" >"$MULLVAD_LIST"
  APT_FRESH=0
}

# ----- VS Code -----------------------------------------------------------------
VSCODE_KEY="/usr/share/keyrings/microsoft.asc"
VSCODE_SOURCES="$APT_DIR/sources.list.d/vscode.sources"
sw_pre_vscode() {
  # The 'code' package offers to add Microsoft's repo itself; say yes in advance so it doesn't stop to ask
  preseed "code code/add-microsoft-repo boolean true"
  [[ -f $VSCODE_SOURCES ]] && return 0
  info "Adding Microsoft VS Code repository…"
  fetch_to https://packages.microsoft.com/keys/microsoft.asc "$VSCODE_KEY" \
    || { err "Could not download Microsoft's signing key."; return 1; }
  cat >"$VSCODE_SOURCES" <<REPO
Types: deb
URIs: https://packages.microsoft.com/repos/code
Suites: stable
Components: main
Architectures: amd64,arm64,armhf
Signed-By: $VSCODE_KEY
REPO
  APT_FRESH=0
}

# ----- Claude Code -------------------------------------------------------------
CLAUDE_KEY="/etc/apt/keyrings/claude-code.asc"
CLAUDE_LIST="$APT_DIR/sources.list.d/claude-code.list"
sw_pre_claude_code() {
  local fpr_ok="31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE" tmp got
  [[ -f $CLAUDE_LIST && -f $CLAUDE_KEY ]] && return 0
  info "Adding Anthropic's Claude Code repository…"
  command -v gpg >/dev/null || apt_install gnupg || return 1
  tmp="$(mktemp -d)"
  if curl -fsSL -o "$tmp/claude-code.asc" https://downloads.claude.ai/keys/claude-code.asc 2>>"$LOG"; then
    got="$(gpg --show-keys --with-colons "$tmp/claude-code.asc" 2>/dev/null | awk -F: '/^fpr/{print $10; exit}')"
    if [[ $got == "$fpr_ok" ]]; then
      install -d -m 0755 "$(dirname "$CLAUDE_KEY")"
      install -m 0644 "$tmp/claude-code.asc" "$CLAUDE_KEY"
      echo "deb [signed-by=$CLAUDE_KEY] https://downloads.claude.ai/claude-code/apt/stable stable main" >"$CLAUDE_LIST"
      APT_FRESH=0
    else
      err "Claude Code signing key fingerprint mismatch (got '${got:-none}') - repo NOT added."
    fi
  else
    warn "Could not download the Claude Code signing key."
  fi
  rm -rf "$tmp"
  [[ -f $CLAUDE_LIST ]]
}

sw_fallback_claude_code() {
  # No Flatpak exists; the fallback is Anthropic's native per-user installer
  warn "apt install failed - falling back to Anthropic's native installer (per-user, ~/.local/bin)."
  local u; u="$(desktop_user)" || { err "Can't tell which user to install it for - set DESKTOP_USER=yourname."; return 1; }
  if as_user bash -c 'set -o pipefail; curl -fsSL https://claude.ai/install.sh | bash' 2>&1 | tee -a "$LOG"; [[ ${PIPESTATUS[0]} -eq 0 ]]; then
    ok "Claude Code installed for $u in ~/.local/bin (make sure that's on your PATH)."; return 0
  fi
  return 1
}

sw_status_claude_code() {
  local home; home="$(user_home)" || return 0
  [[ -x $home/.local/bin/claude ]] && echo ok
}

sw_run() {
  local i=$1 key label pkgs fp rc
  IFS='|' read -r key label pkgs fp <<<"${SOFTWARE[$i]}"
  echo; echo "${C_B}── Software: $label ──${C_0}"
  sw_app "$key" "$label" "$pkgs" "$fp"; rc=$?
  case $rc in
    0) SW_RESULT[$key]="${C_G}done${C_0}" ;;
    2) SW_RESULT[$key]="${C_Y}skipped${C_0}" ;;
    *) SW_RESULT[$key]="${C_R}FAILED${C_0}" ;;
  esac
}

software_menu() {
  local choice tok i key label pkgs fp st
  while true; do
    echo
    echo "${C_B}Software${C_0}   (apt first, Flathub fallback)"
    echo "────────────────────────────────────────────────────────────"
    for i in "${!SOFTWARE[@]}"; do
      IFS='|' read -r key label pkgs fp <<<"${SOFTWARE[$i]}"
      st="${SW_RESULT[$key]:-}"
      [[ -n $st ]] || st="$(render_status "$(sw_status "$key" "$pkgs" "$fp")")"
      printf "  %2d) %-56s %s\n" $((i+1)) "$label" "$st"
    done
    echo "   A) All of the above"
    echo "   B) Back to main menu"
    echo
    read -rp "Select app(s), e.g. 1 3 6, or A: " choice || return 0
    for tok in ${choice//,/ }; do
      case ${tok^^} in
        A) for i in "${!SOFTWARE[@]}"; do sw_run "$i"; done ;;
        B|Q) return 0 ;;
        *) if [[ $tok =~ ^[0-9]+$ ]] && (( tok >= 1 && tok <= ${#SOFTWARE[@]} )); then
             sw_run $((tok-1))
           else
             warn "Unknown option: $tok"
           fi ;;
      esac
    done
  done
}

# =============================================================================
#  STATUS  - what's already on this machine, shown in the menus.
#  Each status_<step> prints one token:  ok | na:<why> | warn:<note> | (nothing)
# =============================================================================
render_status() {
  case ${1:-} in
    ok)     echo "${C_G}✔ installed${C_0}" ;;
    na:*)   echo "${C_D}n/a - ${1#na:}${C_0}" ;;
    warn:*) echo "${C_Y}${1#warn:}${C_0}" ;;
  esac
}

accent_installed() { extension_installed "$ACCENT_UUID"; }

status_update() {     # can't tell "fully updated" offline - only flag a pending kernel reboot
  local newest; newest="$(newest_kernel)"
  [[ -n $newest && $newest != "$(uname -r)" ]] && echo "warn:reboot to use the newest kernel"
}
status_components() { components_enabled && echo ok; }
status_codecs()     { have ffmpeg gstreamer1.0-libav gstreamer1.0-plugins-ugly libdvd-pkg && echo ok; }
status_nvidia() {
  if have nvidia-driver || have nvidia-tesla-470-driver; then
    if modinfo nvidia-current >/dev/null 2>&1 || modinfo nvidia >/dev/null 2>&1 || modinfo nvidia-tesla-470 >/dev/null 2>&1; then echo ok
    else echo "warn:installed, module not built yet"; fi
  elif ! gpu_lines | grep -qi nvidia; then
    echo "na:no NVIDIA GPU"
  fi
}
status_drivers() {
  if lspci -nn | grep -i 'network controller' | grep -qi broadcom && [[ ${OPT_BROADCOM_WL,,} == y* ]] && ! have broadcom-sta-dkms; then
    echo "warn:Broadcom driver not installed"; return
  fi
  have firmware-linux firmware-misc-nonfree && { have intel-microcode || have amd64-microcode; } && echo ok
}
status_devtools() {
  have build-essential dkms "linux-headers-$ARCH" || return
  if [[ -d /lib/modules/$(uname -r)/build ]]; then echo ok; else echo "warn:no headers for the running kernel"; fi
}
status_vmware() {
  [[ -f /usr/lib/vmware/modules/source/vmmon.tar ]] || { echo "na:VMware not installed"; return; }
  local k; k="$(uname -r)"
  if [[ -f /lib/modules/$k/misc/vmmon.ko && -f /lib/modules/$k/misc/vmnet.ko && -x $VMW_HOOK ]]; then echo ok
  else echo "warn:modules not built for this kernel"; fi
}
status_snapshots() {
  [[ $(findmnt -n -o FSTYPE /) == btrfs ]] || { echo "na:root is not Btrfs"; return; }
  [[ -f /etc/snapper/configs/root ]] && [[ -f $SNAPPER_APT_HOOK || -f $SNAPPER_APT_HOOK_OWN ]] || return
  if home_move_pending; then echo "warn:reboot to move /home to its own subvolume"; else echo ok; fi
}
status_flathub()  { flathub_enabled && echo ok; }
status_firmware() { :; }   # needs a network check - only known after running the step
status_gnome() {
  have gnome-tweaks || return
  local row id name uuid missing=0
  [[ ${OPT_ACCENT_COLOR,,} == y* ]] && ! accent_installed && missing=1
  for row in "${GNOME_EXTENSIONS[@]}"; do
    IFS='|' read -r id name <<<"$row"
    uuid="$(ego_uuid "$id")"
    [[ -n $uuid ]] && extension_installed "$uuid" || missing=$((missing+1))
  done
  if [[ $missing -gt 0 ]]; then echo "warn:$missing extension(s) not installed"; else echo ok; fi
}
status_msfonts()  { have ttf-mscorefonts-installer && [[ -f $MSFONTS_FILE ]] && echo ok; }
status_gaming() {
  have steam-installer || return
  # shellcheck disable=SC2086
  have $GAMING_PACKAGES || { echo "warn:some gaming extras missing"; return; }
  if [[ ${OPT_PROTON_GE,,} == y* ]] && ! proton_ge_installed; then echo "warn:Proton-GE not installed"; return; fi
  echo ok
}

# ---------- menu -------------------------------------------------------------
STEPS=(update components codecs nvidia drivers devtools vmware snapshots flathub firmware gnome msfonts gaming)
LABELS=(
  "Update system (apt upgrade)"
  "Enable contrib, non-free and non-free-firmware"
  "Media codecs (ffmpeg, GStreamer, VA-API, DVD, rar/7z)"
  "NVIDIA proprietary driver (DKMS, choose branch)"
  "Other drivers & firmware (Broadcom, GPU/Wi-Fi/audio fw)"
  "Build tools (GCC, make, kernel headers, DKMS)"
  "VMware Workstation modules (build, sign, auto-rebuild)"
  "Btrfs snapshots (snapper, snapshot on every apt run)"
  "Flathub"
  "Firmware updates (fwupd / LVFS)"
  "GNOME tweaks (buttons, tray, accent colour, Ext. Mgr)"
  "Microsoft core fonts (Arial, Times, Verdana...)"
  "Gaming (Steam, Proton-GE, Wine, Lutris, GameMode, HUD)"
)
# Order used by 'A': snapshot first so there's a rollback point, firmware near the end
ALL_ORDER=(snapshots update components codecs nvidia drivers devtools vmware flathub gnome msfonts gaming firmware)

run_step() {
  local i=$1 name=${STEPS[$1]}
  echo; echo "${C_B}── Step $((i+1)): ${LABELS[$i]} ──${C_0}"
  "step_$name"; local rc=$?
  case $rc in
    0) RESULT[$name]="${C_G}done${C_0}" ;;
    2) RESULT[$name]="${C_Y}skipped${C_0}" ;;
    *) RESULT[$name]="${C_R}FAILED${C_0}" ;;
  esac
}

show_menu() {
  local sb="off" i name st; secure_boot_enabled && sb="ON"
  echo
  echo "${C_B}Debian ${VERSION_CODENAME:-sid} post-install${C_0}   kernel $(uname -r)   Secure Boot: $sb"
  echo "────────────────────────────────────────────────────────────"
  for i in "${!STEPS[@]}"; do
    name=${STEPS[$i]}
    [[ $i -eq 7 ]] && echo "  ── Extras ──"
    st="${RESULT[$name]:-}"                      # this run's result wins; otherwise detect
    [[ -n $st ]] || st="$(render_status "$("status_$name")")"
    printf "  %2d) %-56s %s\n" $((i+1)) "${LABELS[$i]}" "$st"
  done
  echo "   A) All of the above (takes a snapshot first)"
  echo "   S) Software…  (Brave, VLC, VS Code, Claude Code…)"
  echo "   Q) Quit"
  echo
}

handle_choice() {
  local tok
  for tok in ${1//,/ }; do
    case ${tok^^} in
      A) local n i
         for n in "${ALL_ORDER[@]}"; do
           for i in "${!STEPS[@]}"; do [[ ${STEPS[$i]} == "$n" ]] && run_step "$i"; done
         done ;;
      S) software_menu ;;
      Q) return 1 ;;
      *) if [[ $tok =~ ^[0-9]+$ ]] && (( tok >= 1 && tok <= ${#STEPS[@]} )); then
           run_step $((tok-1))
         else
           warn "Unknown option: $tok"
         fi ;;
    esac
  done
}

finish() {
  echo
  echo "${C_B}Summary${C_0}"
  for i in "${!STEPS[@]}"; do
    [[ -n ${RESULT[${STEPS[$i]}]:-} ]] && printf "  %-58s %s\n" "${LABELS[$i]}" "${RESULT[${STEPS[$i]}]}"
  done
  local key label rest
  for i in "${!SOFTWARE[@]}"; do
    IFS='|' read -r key label rest <<<"${SOFTWARE[$i]}"
    [[ -n ${SW_RESULT[$key]:-} ]] && printf "  %-58s %s\n" "$label" "${SW_RESULT[$key]}"
  done
  echo "  Log: $LOG"
  if [[ $MOK_PENDING -eq 1 ]]; then
    echo
    echo "${C_Y}${C_B}  On reboot you'll see a blue MOK Management screen:${C_0}"
    echo "    Enroll MOK → Continue → Yes → type the password you set → Reboot."
    echo "    If you miss it (it times out), run this script's step 4, 5 or 7 again."
  fi
  if [[ $NEED_REBOOT -eq 1 ]]; then
    if opt OPT_REBOOT_WHEN_DONE "Reboot now"; then systemctl reboot
    else warn "A reboot is needed to finish - reboot when convenient."; fi
  fi
}

# Non-interactive: arguments on the command line
if [[ $# -gt 0 ]]; then
  handle_choice "$*"; finish; exit 0
fi

while true; do
  show_menu
  read -rp "Select step(s), e.g. 1 3 5, or A: " choice || break
  handle_choice "$choice" || break
done
finish
