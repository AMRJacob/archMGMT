using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace ArchMgmt
{
    /// <summary>What the page needs to know about the model: its identity, its sheets with the views on them, and what's open.</summary>
    internal static class ModelInfo
    {
        public static object Get(UIApplication app)
        {
            var uidoc = app.ActiveUIDocument;
            var doc = uidoc?.Document;
            if (doc == null || doc.IsFamilyDocument || doc.ProjectInformation == null)
                return new Dictionary<string, object> { ["open"] = false, ["modelId"] = "", ["title"] = doc?.Title ?? "", ["number"] = "", ["name"] = "", ["sheets"] = new object[0], ["active"] = null };

            var sheets = new List<object>();
            foreach (var s in new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).Cast<ViewSheet>().Where(x => !x.IsPlaceholder && !x.IsTemplate))
            {
                var views = new List<object>();
                foreach (var id in s.GetAllPlacedViews())
                {
                    if (doc.GetElement(id) is View v)
                        views.Add(new Dictionary<string, object> { ["id"] = v.UniqueId, ["name"] = v.Name, ["type"] = v.ViewType.ToString() });
                }
                sheets.Add(new Dictionary<string, object> { ["id"] = s.UniqueId, ["number"] = s.SheetNumber ?? "", ["name"] = s.Name ?? "", ["views"] = views });
            }
            var info = doc.ProjectInformation;
            return new Dictionary<string, object>
            {
                ["open"] = true,
                // The same for everyone in a shared model, and it travels with the file.
                ["modelId"] = info.UniqueId,
                ["title"] = doc.Title ?? "",
                ["number"] = info.Number ?? "",
                ["name"] = info.Name ?? "",
                ["sheets"] = sheets,
                ["active"] = Active(doc, SafeActiveView(uidoc)),
            };
        }

        private static View SafeActiveView(UIDocument uidoc)
        {
            try { return uidoc.ActiveView; } catch { return null; }
        }

        /// <summary>The view on screen: a sheet, a view (with the sheets it's placed on), or nothing useful.</summary>
        public static object Active(Document doc, View view)
        {
            if (doc == null || view == null || doc.IsFamilyDocument) return null;
            if (view is ViewSheet sheet)
                return new Dictionary<string, object> { ["id"] = sheet.UniqueId, ["name"] = sheet.Name ?? "", ["kind"] = "sheet", ["number"] = sheet.SheetNumber ?? "", ["sheetIds"] = new string[0] };
            switch (view.ViewType)
            {
                case ViewType.ProjectBrowser:
                case ViewType.SystemBrowser:
                case ViewType.Internal:
                case ViewType.Undefined:
                    return new Dictionary<string, object> { ["id"] = view.UniqueId, ["name"] = view.Name ?? "", ["kind"] = "none", ["sheetIds"] = new string[0] };
            }
            var on = new List<string>();
            foreach (var vp in new FilteredElementCollector(doc).OfClass(typeof(Viewport)).Cast<Viewport>().Where(x => x.ViewId == view.Id))
            {
                var s = doc.GetElement(vp.SheetId);
                if (s != null && !on.Contains(s.UniqueId)) on.Add(s.UniqueId);
            }
            if (view is ViewSchedule)
            {
                foreach (var inst in new FilteredElementCollector(doc).OfClass(typeof(ScheduleSheetInstance)).Cast<ScheduleSheetInstance>().Where(x => x.ScheduleId == view.Id))
                {
                    var s = doc.GetElement(inst.OwnerViewId);
                    if (s != null && !on.Contains(s.UniqueId)) on.Add(s.UniqueId);
                }
            }
            return new Dictionary<string, object> { ["id"] = view.UniqueId, ["name"] = view.Name ?? "", ["kind"] = "view", ["sheetIds"] = on };
        }

        /// <summary>Open a sheet or view (by UniqueId) in Revit.</summary>
        public static object Open(UIApplication app, string uniqueId)
        {
            var uidoc = app.ActiveUIDocument;
            if (uidoc == null) throw new InvalidOperationException("No project is open in Revit.");
            var view = string.IsNullOrEmpty(uniqueId) ? null : uidoc.Document.GetElement(uniqueId) as View;
            if (view == null) throw new InvalidOperationException("That sheet or view isn't in this model (it may have been deleted, or belongs to another model).");
            if (uidoc.ActiveView?.Id != view.Id) uidoc.RequestViewChange(view);
            return true;
        }
    }
}
