# Accent Color Everywhere

![Preview](screenshots/apercu.webp)

<br>

🇫🇷 [Version française](#version-française)

---

# English Version

A Plasma-like accent color for GNOME: taken from the wallpaper (slideshows included), picked freely or taken from GNOME Settings, then applied to the whole desktop and updated live.

## Settings

<img src="screenshots/preferences-en.png" alt="Settings" width="320">

## Color type

- **9 GNOME colors**: the color is snapped to the closest of the 9 colors offered by GNOME. It is the same everywhere and changes live in every application.
- **Exact color**: the color is closer to the wallpaper, but libadwaita applications only pick it up when they are restarted.

## Icons

- Themes using the `ColorScheme-Highlight` class (Tela, Breeze…): elements marked with this class take the accent color.
- Themes with fixed colors (Papirus…): folder hues are shifted toward the accent color, shades included.
- Two-color themes (Tela-dracula…): the main color, the secondary color or both, as you choose. This option only appears with this kind of theme.

## Limitations

- Qt applications and GIMP, when already open, must be restarted to change color.
- Flatpak applications: the switch in the settings must be turned on. It gives them read-only access to `gtk-3.0`, `gtk-4.0`, `kdeglobals` and icon themes. GTK 3 Flatpak applications do not follow live updates.
- A third-party Shell or GTK 3 theme may contain fixed colors that the extension does not replace.
- The extension stays active on the lock screen (`unlock-dialog`) so that it does not undo and reapply everything on each lock. It displays nothing there.
- Window corners are drawn by each application (libadwaita, GTK 3 and Qt differ), so the window outline may not match them all. For identical corners, use [Rounded Window Corners Reborn](https://extensions.gnome.org/extension/7048/rounded-window-corners-reborn/) with the same radius (15).

## Installation

```
git clone https://framagit.org/Fred6681/accent-color-everywhere.git ~/.local/share/gnome-shell/extensions/accent-color-everywhere@framagit.org
```

Log out and back in, then enable the extension.

Compatible with GNOME Shell 49 to 51.

## Technical details

| Target | Method |
|---|---|
| GNOME Shell | Copy of the active Shell theme with `-st-accent-color` replaced by the accent color, along with menu highlighting and the app grid tint |
| GTK 4 / libadwaita | `~/.config/gtk-4.0/accent-color-everywhere.css`, imported from `gtk.css`; the GNOME accent color is set to the closest of the 9 colors for live updates |
| GTK 3 | Copy of the active theme in `~/.local/share/themes` (live updates), or `~/.config/gtk-3.0/gtk.css` as a fallback; GIMP included |
| Qt / KDE | Full `AccentColorEverywhere` color scheme in `kdeglobals` (original values backed up), also applied to KDE applications with their own color scheme (Kdenlive…) |
| Icons | Derived `<Theme>-Accent` theme in `~/.local/share/icons`, inheriting from the original theme |
| Windows | Colored outline around the focused window |
| Games and hardware | MangoHud, Wine prefixes and OpenRGB (off by default, shown only when installed) |

## License

GPL-3.0-or-later

<br>

---

# Version française

*Couleur d'accentuation partout*

Une couleur d'accentuation à la façon de Plasma pour GNOME : tirée du fond d'écran (diaporamas compris), choisie librement ou reprise des Paramètres GNOME, puis appliquée à tout le bureau et mise à jour en direct.

## Réglages

<img src="screenshots/preferences-fr.png" alt="Réglages" width="320">

## Type de couleur

- **9 couleurs GNOME** : la couleur est ramenée à la plus proche des 9 couleurs proposées par GNOME. Elle est identique partout et change en direct dans toutes les applications.
- **Couleur exacte** : la couleur est plus fidèle au fond d'écran, mais les applications libadwaita ne la prennent qu'à leur relance.

## Icônes

- Thèmes utilisant la classe `ColorScheme-Highlight` (Tela, Breeze…) : les éléments marqués de cette classe prennent la couleur d'accentuation.
- Thèmes aux couleurs fixes (Papirus…) : les teintes des dossiers sont décalées vers la couleur d'accentuation, nuances comprises.
- Thèmes bicolores (Tela-dracula…) : au choix, la couleur principale, la couleur secondaire ou les deux. Cette option n'apparaît qu'avec ce type de thème.

## Limites

- Les applications Qt et GIMP, s'ils sont déjà ouverts, doivent être relancés pour changer de couleur.
- Applications Flatpak : il faut activer l'interrupteur prévu dans les réglages. Il leur donne un accès en lecture seule à `gtk-3.0`, `gtk-4.0`, `kdeglobals` et aux thèmes d'icônes. Les applications GTK 3 en Flatpak ne suivent pas la mise à jour en direct.
- Un thème Shell ou GTK 3 tiers peut contenir des couleurs fixes que l'extension ne remplace pas.
- L'extension reste active sur l'écran de verrouillage (`unlock-dialog`) pour ne pas tout annuler puis réappliquer à chaque verrouillage. Elle n'y affiche rien.
- Les coins des fenêtres sont dessinés par chaque application (libadwaita, GTK 3 et Qt diffèrent), le contour des fenêtres peut donc ne pas tous les épouser. Pour des coins identiques, utilisez [Rounded Window Corners Reborn](https://extensions.gnome.org/extension/7048/rounded-window-corners-reborn/) avec le même rayon (15).

## Installation

```
git clone https://framagit.org/Fred6681/accent-color-everywhere.git ~/.local/share/gnome-shell/extensions/accent-color-everywhere@framagit.org
```

Déconnectez-vous puis reconnectez-vous, et activez l'extension.

Compatible avec GNOME Shell 49 à 51.

## Détails techniques

| Cible | Méthode |
|---|---|
| GNOME Shell | Copie du thème Shell actif dans laquelle `-st-accent-color` est remplacé par la couleur d'accentuation, ainsi que la surbrillance des menus et la teinte de la grille d'applications |
| GTK 4 / libadwaita | `~/.config/gtk-4.0/accent-color-everywhere.css`, importé depuis `gtk.css` ; la couleur d'accentuation de GNOME est réglée sur la plus proche des 9 couleurs pour la mise à jour en direct |
| GTK 3 | Copie du thème actif dans `~/.local/share/themes` (mise à jour en direct), ou `~/.config/gtk-3.0/gtk.css` à défaut ; GIMP compris |
| Qt / KDE | Jeu de couleurs complet `AccentColorEverywhere` dans `kdeglobals` (valeurs d'origine sauvegardées), appliqué aussi aux applications KDE qui ont leur propre jeu de couleurs (Kdenlive…) |
| Icônes | Thème dérivé `<Thème>-Accent` dans `~/.local/share/icons`, qui hérite du thème d'origine |
| Fenêtres | Contour coloré autour de la fenêtre active |
| Jeux et matériel | MangoHud, préfixes Wine et OpenRGB (désactivés par défaut, affichés seulement s'ils sont installés) |

## Licence

GPL-3.0-or-later
