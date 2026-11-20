using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Media.Imaging;
using Autodesk.Revit.Attributes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Events;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Events;

namespace ArchMgmt
{
    /// <summary>
    /// archMGMT in Revit: a docked pane and an optional floating checklist, both showing the web app's /revit page,
    /// which follows the sheet or view that's open. The add-in only reads the model (sheets, views, what's active)
    /// and opens views on request; links between Revit sheets and archMGMT sheets are kept in archMGMT's database
    /// by Revit UniqueId, so nothing is written into the .rvt.
    /// </summary>
    public class App : IExternalApplication
    {
        public static App Instance { get; private set; }
        public static string AddinDir { get; private set; }
        public static string Version => typeof(App).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";
        public static string RevitVersion { get; private set; } = "";
        public static readonly DockablePaneId PaneId = new DockablePaneId(new Guid("3cee4dca-9161-4048-b3fe-d7cfbd6bd0ce"));

        internal Jobs Jobs { get; private set; }
        internal IntPtr MainWindow { get; private set; }
        private UIControlledApplication _app;
        private WebPane _pane;
        private OverlayWindow _overlay;
        private string _lastDocKey;
        private readonly Stopwatch _sinceFollow = Stopwatch.StartNew();

        public Result OnStartup(UIControlledApplication app)
        {
            Instance = this;
            _app = app;
            AddinDir = Path.GetDirectoryName(typeof(App).Assembly.Location);
            RevitVersion = $"{app.ControlledApplication.VersionNumber} ({app.ControlledApplication.SubVersionNumber})";
            MainWindow = app.MainWindowHandle;
            WebView2Assemblies.Register(AddinDir);
            Jobs = new Jobs();

            _pane = new WebPane(overlay: false);
            app.RegisterDockablePane(PaneId, "archMGMT", _pane);

            // The office's shared tab: Contours to Revit makes it too, whichever loads first.
            try { app.CreateRibbonTab("AMR"); } catch { /* tab already exists (another AMR tool) */ }
            var panel = app.GetRibbonPanels("AMR").FirstOrDefault(p => p.Name == "archMGMT") ?? app.CreateRibbonPanel("AMR", "archMGMT");
            var asm = typeof(App).Assembly.Location;
            var tasks = new PushButtonData("ArchMgmtPane", "Sheet\nTasks", asm, typeof(TogglePane).FullName)
            {
                ToolTip = "Show or hide the archMGMT pane: the tasks for the sheet or view you have open.",
                LongDescription = "The pane follows the sheet or view on screen. Tick tasks off as you work, see which are yours, add sheets and tasks to archMGMT, and assign and schedule them. Changes show on the archMGMT site, and for everyone else, straight away.",
                AvailabilityClassName = typeof(AlwaysAvailable).FullName,
                LargeImage = Icon("tasks32.png"),
                Image = Icon("tasks16.png"),
            };
            tasks.SetContextualHelp(new ContextualHelp(ContextualHelpType.Url, "https://amrjacob.github.io/archMGMT/"));
            panel.AddItem(tasks);
            var over = new PushButtonData("ArchMgmtOverlay", "Checklist\non Sheet", asm, typeof(ToggleOverlay).FullName)
            {
                ToolTip = "Show or hide a small floating checklist in the corner of the sheet you have open.",
                AvailabilityClassName = typeof(AlwaysAvailable).FullName,
                LargeImage = Icon("overlay32.png"),
                Image = Icon("overlay16.png"),
            };
            panel.AddItem(over);

            try { app.RegisterContextMenu(typeof(App).FullName, new SheetMenu()); }
            catch (Exception ex) { Debug.WriteLine(ex); }

            Updater.StartBackground();
            app.ViewActivated += OnViewActivated;
            app.Idling += OnIdling;
            app.ControlledApplication.DocumentChanged += OnDocumentChanged;
            app.ControlledApplication.DocumentClosed += OnDocumentClosed;
            return Result.Succeeded;
        }

        public Result OnShutdown(UIControlledApplication app)
        {
            app.ViewActivated -= OnViewActivated;
            app.Idling -= OnIdling;
            app.ControlledApplication.DocumentChanged -= OnDocumentChanged;
            app.ControlledApplication.DocumentClosed -= OnDocumentClosed;
            try { _overlay?.Shutdown(); } catch { /* ignore */ }
            try { _pane?.Shutdown(); } catch { /* ignore */ }
            return Result.Succeeded;
        }

        // ---------- pane and floating checklist ----------

        internal void ShowPane()
        {
            try { var p = _app.GetDockablePane(PaneId); if (!p.IsShown()) p.Show(); }
            catch (Exception ex) { Debug.WriteLine(ex); }
        }

        internal void TogglePaneShown()
        {
            var p = _app.GetDockablePane(PaneId);
            if (p.IsShown()) p.Hide(); else p.Show();
        }

        internal bool OverlayOn { get; private set; }

        /// <summary>Turn the floating checklist on or off (remembered for next time).</summary>
        internal bool SetOverlay(bool on)
        {
            var s = Settings.Load();
            if (s.Overlay != on) { s.Overlay = on; s.Save(); }
            OverlayOn = on;
            if (on)
            {
                if (_overlay == null) _overlay = new OverlayWindow(MainWindow);
                _followNow = true; // placed and shown at the next idle moment, where Revit's API can be read
            }
            else _overlay?.Park();
            Broadcast("overlay", on);
            return on;
        }

        internal void SetOverlayHeight(double height) => _overlay?.SetContentHeight(height);

        /// <summary>Send an event to the pane and the floating checklist.</summary>
        internal void Broadcast(string name, object data)
        {
            _pane?.PostEvent(name, data);
            _overlay?.Pane.PostEvent(name, data);
        }

        /// <summary>A right-click command aimed at sheets or views: open the pane and hand it over.</summary>
        internal void SendCommand(string name, List<string> ids)
        {
            ShowPane();
            _pane?.PostEvent("command", new Dictionary<string, object> { ["name"] = name, ["ids"] = ids }, keepUntilReady: true);
        }

        // ---------- Revit events ----------

        private bool _followNow;

        private void OnViewActivated(object sender, ViewActivatedEventArgs e)
        {
            try
            {
                var doc = e.Document;
                var key = doc == null ? "" : doc.PathName + "|" + doc.Title;
                if (key != _lastDocKey)
                {
                    _lastDocKey = key;
                    Broadcast("modelChanged", null); // another model: the page reads it afresh
                }
                else Broadcast("viewChanged", ModelInfo.Active(doc, e.CurrentActiveView));

                // The floating checklist comes back on its own when it was on last time.
                if (_overlay == null && doc != null && !doc.IsFamilyDocument && Settings.Load().Overlay) SetOverlay(true);
                _followNow = true;
            }
            catch (Exception ex) { Debug.WriteLine(ex); }
        }

        private void OnDocumentChanged(object sender, DocumentChangedEventArgs e)
        {
            try
            {
                var doc = e.GetDocument();
                if (doc == null || doc.IsFamilyDocument) return;
                bool sheets = e.GetDeletedElementIds().Count > 0;
                if (!sheets)
                {
                    foreach (var id in e.GetAddedElementIds().Concat(e.GetModifiedElementIds()))
                    {
                        var el = doc.GetElement(id);
                        if (el is ViewSheet || el is Viewport || el is ProjectInfo || el is ScheduleSheetInstance) { sheets = true; break; }
                    }
                }
                if (sheets) Broadcast("modelChanged", null);
            }
            catch (Exception ex) { Debug.WriteLine(ex); }
        }

        private void OnDocumentClosed(object sender, DocumentClosedEventArgs e)
        {
            _lastDocKey = null;
            Broadcast("modelChanged", null);
        }

        /// <summary>Keeps the floating checklist in the corner of the view that's open (Revit's API can only be read here).</summary>
        private void OnIdling(object sender, IdlingEventArgs e)
        {
            if (_overlay == null || !OverlayOn) return;
            if (!_followNow && _sinceFollow.ElapsedMilliseconds < 400) return;
            _followNow = false;
            _sinceFollow.Restart();
            try
            {
                var uiapp = sender as UIApplication;
                var uidoc = uiapp?.ActiveUIDocument;
                var view = uidoc?.ActiveView;
                if (view == null || uidoc.Document.IsFamilyDocument) { _overlay.Park(); return; }
                var uiv = uidoc.GetOpenUIViews().FirstOrDefault(v => v.ViewId == view.Id);
                if (uiv == null) { _overlay.Park(); return; }
                var r = uiv.GetWindowRectangle();
                _overlay.Follow(r.Left, r.Top, r.Right, r.Bottom);
            }
            catch (Exception ex) { Debug.WriteLine(ex); }
        }

        private static BitmapSource Icon(string name)
        {
            try
            {
                var s = typeof(App).Assembly.GetManifestResourceStream("ArchMgmt.Resources." + name);
                if (s == null) return null;
                return BitmapFrame.Create(s, BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
            }
            catch { return null; }
        }
    }

    // ---------- ribbon and right-click commands ----------

    [Transaction(TransactionMode.Manual)]
    public class TogglePane : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try { App.Instance.TogglePaneShown(); return Result.Succeeded; }
            catch (Exception ex) { message = ex.Message; return Result.Failed; }
        }
    }

    [Transaction(TransactionMode.Manual)]
    public class ToggleOverlay : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try { App.Instance.SetOverlay(!App.Instance.OverlayOn); return Result.Succeeded; }
            catch (Exception ex) { message = ex.Message; return Result.Failed; }
        }
    }

    /// <summary>Right-click commands: the sheets and views selected (in the Project Browser or the drawing), or else the open view.</summary>
    public abstract class SheetCommand : IExternalCommand
    {
        protected abstract string Name { get; }

        public Result Execute(ExternalCommandData commandData, ref string message, ElementSet elements)
        {
            try
            {
                var uidoc = commandData.Application.ActiveUIDocument;
                if (uidoc == null) { message = "Open a project first."; return Result.Cancelled; }
                var doc = uidoc.Document;
                var ids = new List<string>();
                foreach (var id in uidoc.Selection.GetElementIds())
                {
                    var el = doc.GetElement(id);
                    if (el is Viewport vp) el = doc.GetElement(vp.ViewId);
                    if (el is View v && !v.IsTemplate && !ids.Contains(v.UniqueId)) ids.Add(v.UniqueId);
                }
                if (ids.Count == 0 && uidoc.ActiveView != null) ids.Add(uidoc.ActiveView.UniqueId);
                App.Instance.SendCommand(Name, ids);
                return Result.Succeeded;
            }
            catch (Exception ex) { message = ex.Message; return Result.Failed; }
        }
    }

    [Transaction(TransactionMode.Manual)] public class ShowTasks : SheetCommand { protected override string Name => "show"; }
    [Transaction(TransactionMode.Manual)] public class AddSheets : SheetCommand { protected override string Name => "add"; }
    [Transaction(TransactionMode.Manual)] public class AddTask : SheetCommand { protected override string Name => "task"; }

    /// <summary>Adds an archMGMT flyout to Revit's right-click menus (drawing area and Project Browser).</summary>
    public class SheetMenu : IContextMenuCreator
    {
        public void BuildContextMenu(ContextMenu menu)
        {
            var asm = typeof(App).Assembly.Location;
            var sub = new ContextMenu();
            var show = new CommandMenuItem("Show tasks", typeof(ShowTasks).FullName, asm);
            show.SetAvailabilityClassName(typeof(ProjectOpen).FullName);
            sub.AddItem(show);
            var add = new CommandMenuItem("Add or link sheets", typeof(AddSheets).FullName, asm);
            add.SetAvailabilityClassName(typeof(ProjectOpen).FullName);
            sub.AddItem(add);
            var task = new CommandMenuItem("Add a task…", typeof(AddTask).FullName, asm);
            task.SetAvailabilityClassName(typeof(ProjectOpen).FullName);
            sub.AddItem(task);
            menu.AddItem(new SeparatorItem());
            menu.AddItem(new SubMenuItem("archMGMT", sub));
        }
    }

    /// <summary>The buttons work with no model open too (the pane says so).</summary>
    public class AlwaysAvailable : IExternalCommandAvailability
    {
        public bool IsCommandAvailable(UIApplication app, CategorySet selected) => true;
    }

    public class ProjectOpen : IExternalCommandAvailability
    {
        public bool IsCommandAvailable(UIApplication app, CategorySet selected)
        {
            try { var d = app.ActiveUIDocument?.Document; return d != null && !d.IsFamilyDocument; }
            catch { return false; }
        }
    }

    /// <summary>
    /// Revit 2026 ships its own WebView2 assemblies. Use whatever is already loaded, else Revit's copy, else ours
    /// (kept in a "webview2" subfolder so the default loader never picks our older copy over Revit's).
    /// </summary>
    internal static class WebView2Assemblies
    {
        private static string _ours;
        internal static bool UsingOurCopy { get; private set; }
        internal static string LoadedFrom { get; private set; } = "";

        public static void Register(string addinDir)
        {
            _ours = Path.Combine(addinDir, "webview2");
            AppDomain.CurrentDomain.AssemblyResolve += Resolve;
        }

        private static Assembly Resolve(object sender, ResolveEventArgs args)
        {
            var name = new AssemblyName(args.Name).Name;
            if (name == null || !name.StartsWith("Microsoft.Web.WebView2", StringComparison.OrdinalIgnoreCase)) return null;
            var loaded = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => string.Equals(a.GetName().Name, name, StringComparison.OrdinalIgnoreCase));
            if (loaded != null) { LoadedFrom = SafeLocation(loaded); return loaded; }
            var revitDir = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule?.FileName ?? "");
            foreach (var dir in new[] { revitDir, _ours })
            {
                if (string.IsNullOrEmpty(dir)) continue;
                var f = Path.Combine(dir, name + ".dll");
                if (!File.Exists(f)) continue;
                UsingOurCopy = dir == _ours;
                LoadedFrom = f;
                return Assembly.LoadFrom(f);
            }
            return null;
        }

        internal static string OurFolder => _ours;

        private static string SafeLocation(Assembly a) { try { return a.Location; } catch { return ""; } }
    }
}
