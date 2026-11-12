# Changelog

## 2.0

- Supports GNOME Shell 49 to 51 (48 dropped)
- Focused window outline uses `is_maximized()` only

## 1.0

First public release.

- Accent color taken from the wallpaper (slideshows included), picked freely or taken from GNOME Settings, updated live
- Color type: 9 GNOME colors (same choice as libadwaita, live everywhere) or exact color
- GNOME Shell, GTK 3 (live), GTK 4 / libadwaita, Qt / KDE (Kdenlive included), GIMP
- Tinted app grid, focused window outline, title bars
- Selection in Files and in the file chooser uses the accent color
- Recolored folder icons, two-color themes (Tela-dracula…) included
- MangoHud, Wine, OpenRGB (shown only when installed)
- Flatpak permission in a single switch
- French translation
- Code following the EGO review best practices: small entry points with single-purpose modules (lib/ for the extension, prefs/ for the preferences), no external commands, full cleanup on disable
