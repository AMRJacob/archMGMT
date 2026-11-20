# archMGMT for Revit — Revit 2026 add-in

Adds **AMR › archMGMT** to Revit 2026 (the same AMR tab as Contours to Revit):

- **Sheet Tasks** shows or hides the archMGMT pane, docked at the right. It follows whatever is open: on a sheet it
  shows that sheet's tasks and subtasks for the phase you're working in; on a view it shows the view's task and the
  sheet it's placed on. Tick things off, see which are yours (accent bar, or *Only mine*), add tasks and subtasks,
  assign people and set dates. Everything is live with the archMGMT site and with everyone else's Revit.
- **Checklist on Sheet** shows or hides a small floating checklist in the top-right corner of the open sheet or view
  (also *Show on sheet* in the pane). It folds down to one line.
- **Right-click** a sheet or view in the Project Browser or the drawing › **archMGMT**: *Show tasks*, *Add or link
  sheets* (several at once), *Add a task…*.

The first time a model is opened, the pane asks which archMGMT project it belongs to (it suggests the one whose number
matches Revit's Project Number). After that everyone who opens the model gets the same project. Sheets are linked one
by one or all together (*All sheets › Add all*): a Revit sheet whose number matches an archMGMT sheet is linked to it;
the rest are added to the phase with their type's standard subtasks.

Nothing is written into the .rvt. Links are kept in archMGMT's database by Revit UniqueId (`tasks.revit_id`,
`projects.revit_models`), which is the same for everyone working in a shared model.

## Install (for coworkers)

Download **archMGMT-Revit-Setup.exe** from the
[latest release](https://github.com/AMRJacob/archMGMT/releases/latest) and run it. Revit can stay open; the add-in
loads the next time Revit starts. No admin rights: it installs for the current Windows user into
`%AppData%\Autodesk\Revit\Addins\2026` (`archMGMT.addin` + `archMGMT\<version>\`). Uninstall from Windows Settings › Apps.

- Windows may say the publisher is unknown (the installer isn't code-signed): **More info › Run anyway**.
- Revit asks once whether to load the unsigned add-in: **Always Load**.
- Sign in inside the pane with your archMGMT email and password (once; it's remembered).

## Updates

About 20 s after Revit starts (at most every 4 hours) the add-in checks this repository's releases, downloads a newer
installer and runs it silently. Each version installs into its own folder and the `.addin` is pointed at it, so
nothing Revit has loaded is overwritten and Revit is never closed; the new version loads at the next Revit start. The
pane's footer shows the version, says when a restart is needed, and has **Check for updates**. Turn off with
`"AutoUpdate": false` in `%AppData%\archMGMT-Revit\settings.json`.

The pane itself is the archMGMT web app (`#/revit`), so most changes arrive with the next site deploy and need no
installer at all.

## Releasing a new add-in version

Only needed when `revit-plugin/src` changes. Bump `revit-plugin/version.txt`; the **Revit plugin** workflow builds the
installer and publishes release `revit-vX.Y.Z`. The README's download link and every installed add-in take the newest
release.

## Messages (page ⇄ add-in)

Page → add-in: `hello`, `getModel`, `open` (a sheet or view by UniqueId), `setOverlay`, `showPane`, `overlaySize`,
`openUrl`, `checkUpdate`, `installUpdate`. Replies: `{ type: "reply", id, ok, result | error }`.
Add-in → page events: `viewChanged` (what's on screen), `modelChanged` (sheets added, renamed, placed; another model),
`command` (a right-click command and the selected sheets/views), `overlay`.

Test the page in an ordinary browser with `?host=mock` before the `#` (a pretend model; `window.revitMock`).

## Notes

- Revit 2026 loads its own WebView2 assemblies; the add-in references an older version and uses Revit's copy,
  falling back to the copy in `archMGMT\<version>\webview2`.
- The pane's sign-in is kept in `%LocalAppData%\archMGMT-Revit\WebView2`, separate from Chrome/Edge.
- Developer option: `settings.json` → `"Url"` points the pane at another copy of the web app.
- The floating checklist is a small window that follows the view's corner; Revit's API can't draw controls on the
  drawing itself. It hides when the view is too small or no project view is open.
