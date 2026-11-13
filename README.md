# Debian forky/sid post-install

My personal Debian sid setup with the GNOME desktop: one script that takes a fresh Debian forky/sid install to a finished desktop, covering updates, codecs, drivers, snapshots, software, gaming, GNOME extensions and settings.

It runs unattended. Every choice is a setting at the top of the script rather than a question, and the menus show what is already installed on the machine.

It is a port of [fedora45postinstall](https://github.com/colinsellens/fedora45postinstall) and does the same job using Debian's packages.

## Quick start

```bash
git clone https://github.com/colinsellens/debian-sid-postinstall.git
cd debian-sid-postinstall
sudo ./debian-sid-postinstall.sh
```

| Command | What it does |
|---|---|
| `sudo ./debian-sid-postinstall.sh` | Interactive menu |
| `sudo ./debian-sid-postinstall.sh A` | Run every step (1–13) |
| `sudo ./debian-sid-postinstall.sh 2 4` | Run selected steps |
| `sudo ./debian-sid-postinstall.sh S` | Open the software menu |

**Starting from Debian stable (trixie)?** Run the script anyway. It notices, and offers to convert the machine to forky (testing) or sid (unstable): it switches the apt sources, upgrades every package and reboots. Run it again afterwards for the set-up itself. See [Converting from stable](#converting-from-stable).

Run it from a terminal inside your own desktop session, so the GNOME step can apply extensions and settings to your user.

**No sudo?** If you set a root password during the Debian install, your user isn't in the sudo group. Run the script as root instead and tell it who you are:

```bash
su -c 'DESKTOP_USER=yourname ./debian-sid-postinstall.sh'
```

The script also works on its own, without the rest of the repo. In that case the bundled extension and wallpaper are downloaded from this repo on GitHub.

## Converting from stable

A fresh Debian install is usually stable (trixie), and everything here expects forky or sid. On stable, the script stops before the menu and asks two things: whether to convert, and to which.

| Choice | What it is |
|---|---|
| sid | Unstable: newest packages, occasional breakage |
| forky | Testing: a few days behind sid, calmer |

If you say yes, it:

1. Takes a snapshot first, if the root filesystem is Btrfs.
2. Points the Debian apt sources at your choice, keeping each original as a `.bak` file. sid has no security or updates suites, so those entries are switched off; for forky they are renamed.
3. Runs `apt update` and `apt full-upgrade`. This is the long part.
4. Asks you to press Enter to reboot. Run the script again afterwards.

If you say no, nothing is changed and the script exits.

Things to know:

- **Only do this on a fresh install.** The upgrade removes and replaces packages freely, and there is no way back to stable short of reinstalling.
- **If the upgrade stops partway**, the script tries one automatic repair. If that fails too, fix the error it shows and run the script again; it sees the half-finished conversion and picks the upgrade back up.
- **You can skip the conversion** by installing forky directly from a [Debian testing installer image](https://www.debian.org/devel/debian-installer/). The script then goes straight to the menu.

## What it does

| # | Step | Details |
|---|---|---|
| 1 | Update system | `apt upgrade`, without removing anything (see `OPT_FULL_UPGRADE`) |
| 2 | Debian sections | enables `contrib`, `non-free` and `non-free-firmware` |
| 3 | Media codecs | ffmpeg, GStreamer, VA-API hardware decode, DVD, rar/7z |
| 4 | NVIDIA driver | proprietary driver through DKMS; choose the current or 470 branch |
| 5 | Other drivers and firmware | Broadcom Wi-Fi, GPU/Wi-Fi/audio firmware, CPU microcode |
| 6 | Build tools | GCC, make, kernel headers, DKMS |
| 7 | VMware Workstation modules | builds and signs vmmon/vmnet, rebuilds on kernel updates |
| 8 | Btrfs snapshots | snapper, a snapshot around every apt run, grub-btrfs, `/home` in its own subvolume |
| 9 | Flathub | Flatpak plus the Flathub catalogue |
| 10 | Firmware updates | fwupd / LVFS |
| 11 | GNOME | extensions, settings, keyboard shortcuts, wallpaper |
| 12 | Microsoft core fonts | Arial, Times New Roman, Verdana and friends |
| 13 | Gaming | Steam, Proton-GE, Wine, Lutris and performance tools |

`A` runs them in a safe order: a snapshot first so there is a rollback point, firmware last. It does not include the software menu; run `S` for that.

With Secure Boot on, one signing key (the DKMS key) is shared by the NVIDIA, Broadcom and VMware modules, so you enrol a single key once.

Two Debian specifics:

- **Step 2 edits your apt sources.** It adds the three sections to every Debian archive entry, in either sources format, keeps the original as a `.bak` file, and disables any leftover install-media (`cdrom:`) entry.
- **Step 8 needs a Btrfs root.** Debian's installer defaults to ext4, in which case the step is skipped. To get Btrfs, use the installer's guided partitioning and change the root partition's "Use as" from ext4 to btrfs.
- **Step 8 moves `/home` into its own subvolume.** Debian's installer puts `/home` inside the root subvolume, so snapshots of `/` would include your home folder. The move runs once at the next boot, before anyone can log in, and is logged to `/var/log/home-to-subvolume.log`. It is skipped if `/home` is already separate.

## Software

The software menu (`S`) installs each app from apt first and falls back to Flathub where a Flatpak exists.

| App | Source |
|---|---|
| Brave Origin (stable) | Brave's apt repo, plus the Bitwarden extension through a managed policy |
| qBittorrent | Debian, Flathub fallback |
| VLC | Debian, Flathub fallback |
| Bitwarden | Flathub |
| Mullvad VPN | Mullvad's apt repo |
| VS Code | Microsoft's apt repo, Flathub fallback |
| Claude Code | Anthropic's apt repo (key fingerprint checked), native installer fallback |
| Extension Manager | Debian, Flathub fallback |

To add an app, add one line to the `SOFTWARE` table in the script:

```
"key|Menu label|apt package(s)|Flathub app ID"
```

Leave either the apt or Flathub field empty to skip it. An app that needs its own repo can define a `sw_pre_<key>` function; `sw_post_<key>`, `sw_fallback_<key>` and `sw_status_<key>` are also picked up by name.

## Gaming

Step 13 sets the machine up for games using Debian's packages. It does not replace the kernel or add third-party gaming repos.

| Item | Source | What it's for |
|---|---|---|
| Steam | Debian `steam-installer` (non-free), with 32-bit packages enabled | Uses the host's graphics drivers |
| Proton-GE | Latest [GE-Proton](https://github.com/GloriousEggroll/proton-ge-custom) release, checksum verified | Extra game compatibility |
| ProtonUp-Qt | Flathub | Add, update or remove Proton-GE versions later |
| Wine, winetricks | Debian | Windows apps outside Steam |
| Lutris | Debian | GOG, Epic, Battle.net and other non-Steam games |
| NTSYNC | The kernel's `ntsync` module, loaded at boot | Kernel-level Windows synchronisation, used automatically by current Proton-GE |
| GameMode | Debian | CPU governor and priority tweaks while a game runs |
| MangoHud | Debian | FPS and frame-time overlay |
| gamescope | Debian | Upscaling, frame limiting, fullscreen fixes |
| steam-devices | Debian | Controller support |

With the proprietary NVIDIA driver installed, the matching 32-bit NVIDIA libraries are added for Steam.

Proton-GE goes into Steam's own folder if Steam has been started before. Otherwise it goes into `/usr/local/share/steam/compatibilitytools.d`, which Steam also searches, so nothing is created in Steam's home folder before its first run.

After the step:

- Start Steam once and sign in, then choose Proton-GE under Settings > Compatibility.
- To use GameMode and MangoHud for a game, set its launch options to `gamemoderun mangohud %command%`.
- Keep game libraries on a Linux filesystem (ext4 or Btrfs). Proton games fail on NTFS and exFAT drives.

Change `GAMING_PACKAGES` in the settings block to add or drop packages, and set `OPT_PROTON_GE=n` to skip the Proton-GE download (about 550 MB). Re-running the step fetches a newer Proton-GE if one has been released.

## GNOME extensions

Step 11 installs and enables these. They take effect at your next log-in.

| Extension | Source |
|---|---|
| [Accent Color Everywhere](https://framagit.org/Fred6681/accent-color-everywhere) | Bundled in `extensions/` |
| AppIndicator (tray icons) | Debian package |
| Dash to Dock | Debian package |
| [User Themes](https://extensions.gnome.org/extension/19/user-themes/) | extensions.gnome.org |
| [Caffeine](https://extensions.gnome.org/extension/517/caffeine/) | extensions.gnome.org |
| [GSConnect](https://extensions.gnome.org/extension/1319/gsconnect/) | extensions.gnome.org |
| [Clipboard Indicator](https://extensions.gnome.org/extension/779/clipboard-indicator/) | extensions.gnome.org |
| [Desktop Icons NG (DING)](https://extensions.gnome.org/extension/2087/desktop-icons-ng-ding/) | extensions.gnome.org |
| [Transparent Top Bar (Adjustable transparency)](https://extensions.gnome.org/extension/3960/transparent-top-bar-adjustable-transparency/) | extensions.gnome.org |

Extension Manager and GNOME Tweaks are installed alongside them.

To add an extension from extensions.gnome.org, add one line to the `GNOME_EXTENSIONS` table, using the number from its URL:

```
"517|Caffeine"
```

The script downloads the build that matches your GNOME Shell version. If there isn't one, that extension is reported and skipped. Extensions already installed are skipped on later runs.

If the Accent Color Everywhere folder on the machine is a git checkout, the script leaves it untouched, so a working copy is never overwritten.

## Settings

Everything below lives in the `SETTINGS` block at the top of the script.

### GNOME settings applied by step 11

| Area | Setting |
|---|---|
| Appearance | Dark style |
| Appearance | Background set to `wallpapers/forest-fog.jpg` |
| Mouse and touchpad | Pointer speed 75%, tap to click |
| Power | Screen blanks after 15 minutes; no automatic suspend when plugged in |
| Keyboard | Log out is Ctrl+Alt+L |
| Keyboard | Custom shortcut "Resources": Ctrl+Alt+Del runs `gnome-system-monitor` |
| Windows | Minimise and maximise buttons |
| Top bar | Battery percentage, weekday in the clock, hot corner off |
| Display | Night light on |
| Files | Folders sorted before files |

Three tables control these:

- `GNOME_SETTINGS`: one `"schema key value"` line per setting. Settings belonging to an installed extension work too; examples for Accent Color Everywhere are included, commented out.
- `CUSTOM_SHORTCUTS`: one `"name | command | key combination"` line per shortcut. Existing shortcuts are kept.
- `WALLPAPER`: an image in this repo. Set it to empty to leave the background alone.

### Choices

Each is `y` or `n`. Override one for a single run without editing the script:

```bash
sudo OPT_GRUB_BTRFS=n ./debian-sid-postinstall.sh 8
```

| Setting | Default | Step | Meaning |
|---|---|---|---|
| `OPT_FULL_UPGRADE` | n | 1 | Use `apt full-upgrade`, which may remove packages during a sid transition. `n` uses a plain upgrade and leaves those packages held back for you to review |
| `OPT_BROADCOM_WL` | n | 5 | Proprietary Broadcom Wi-Fi driver, if a Broadcom chip is found |
| `OPT_GRUB_BTRFS` | y | 8 | grub-btrfs, so snapshots can be booted from GRUB |
| `OPT_HOME_SUBVOLUME` | y | 8 | Move `/home` into its own Btrfs subvolume at the next boot |
| `OPT_APPLY_FIRMWARE` | y | 10 | Apply firmware updates (`n` only lists them) |
| `OPT_ACCENT_COLOR` | y | 11 | Accent Color Everywhere extension |
| `OPT_APPINDICATOR` | y | 11 | AppIndicator tray icons |
| `OPT_DASH_TO_DOCK` | y | 11 | Dash to Dock |
| `OPT_MSFONTS_EULA` | y | 12 | You accept the [Microsoft core fonts EULA](https://corefonts.sourceforge.net/eula.htm) |
| `OPT_STEAM_LICENCE` | y | 13 | You accept the Steam Install Agreement that Debian's `steam-installer` shows |
| `OPT_PROTON_GE` | y | 13 | Download the latest Proton-GE |
| `OPT_BRAVE_LOCK_BITWARDEN` | n | S | Force-install Bitwarden in Brave so it can't be switched off |
| `OPT_BRAVE_FLATHUB_FALLBACK` | n | S | Install regular Brave from Flathub if Brave Origin fails |
| `OPT_REBOOT_WHEN_DONE` | y | end | Reboot automatically if a step needs it |
| `VMWARE_BUNDLE` | empty | 7 | Path to the VMware Workstation installer, used if VMware isn't installed |
| `VMWARE_PATCHED_URL` | empty | 7 | Git URL of patched vmmon/vmnet sources, used if the bundled ones don't build |
| `DESKTOP_USER` | empty | 11, 13 | Your login name, only needed when running as root without sudo |

## What still asks for input

- **NVIDIA driver:** a yes/no and the driver branch, and only when an NVIDIA card is detected. With no card the step is skipped.
- **Secure Boot:** if it is on, enrolling the signing key asks you to choose a one-time password. You type it once at the blue MOK screen on the next reboot. That screen times out, so be at the machine for that reboot or set `OPT_REBOOT_WHEN_DONE=n`.
- **VMware:** its own installer shows a licence if `VMWARE_BUNDLE` is set.

## Good to know

- **Status:** the menus show what is already installed, read from the system, so they are accurate after a reboot. Steps 1 and 10 stay blank because checking them needs the network.
- **Re-running is safe:** steps skip or refresh what is already there.
- **Log:** everything is written to `/var/log/debian-sid-postinstall.log`.
- **Packages come and go on forky/sid.** Where a list of packages is installed (firmware, gaming extras), anything Debian doesn't offer at that moment is skipped and named, and the rest still install. Re-run the step later to pick it up. Wine is a common example: it is sometimes out of testing for a while. Games are unaffected, because Steam (Proton) and Lutris bring their own Wine builds.
- **Other Debian releases:** the script warns but carries on; some package names may differ on stable.

## Licence

The script is free software, licensed under the [GNU General Public License v3.0 or later](LICENSE) (GPL-3.0-or-later).

The wallpaper is not covered by the GPL. `wallpapers/forest-fog.jpg` is ["aerial view of pine trees in mist"](https://unsplash.com/photos/aerial-view-of-pine-trees-in-mist-OYFHT4X5isg) by Dan Otis, used under the [Unsplash License](https://unsplash.com/license).

In short, for the script: you may use, study, change and share it. If you pass it on, changed or not, you must pass it on under the same licence, keep the copyright and licence notices, and make the source available. It comes with no warranty.

## Credits

- **colinsellens:** author and maintainer.
- **Claude** (Anthropic's AI model): wrote much of the script and this README, working with the author.
- **Fred6681:** [Accent Color Everywhere](https://framagit.org/Fred6681/accent-color-everywhere), bundled in `extensions/` under its own GPL-3.0-or-later licence.
- **Dan Otis** ([@danotis](https://unsplash.com/@danotis) on Unsplash): the wallpaper photo.
- The authors of the other extensions and apps this script installs.
