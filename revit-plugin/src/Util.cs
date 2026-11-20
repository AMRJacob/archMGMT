using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ArchMgmt
{
    internal static class Json
    {
        public static readonly JsonSerializerOptions Options = new()
        {
            DefaultIgnoreCondition = JsonIgnoreCondition.Never,
            NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals,
        };

        public static string Str(this JsonElement e, string name)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v)) return null;
            return v.ValueKind switch
            {
                JsonValueKind.String => v.GetString(),
                JsonValueKind.Number => v.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                _ => v.GetRawText(),
            };
        }

        public static double Num(this JsonElement e, string name, double fallback = double.NaN)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v)) return fallback;
            if (v.ValueKind == JsonValueKind.Number) return v.GetDouble();
            if (v.ValueKind == JsonValueKind.String && double.TryParse(v.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d)) return d;
            return fallback;
        }

        public static bool Bool(this JsonElement e, string name, bool fallback = false)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v)) return fallback;
            return v.ValueKind == JsonValueKind.True || (v.ValueKind != JsonValueKind.False && fallback);
        }

        public static IEnumerable<JsonElement> Arr(this JsonElement e, string name)
        {
            if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v) || v.ValueKind != JsonValueKind.Array) yield break;
            foreach (var x in v.EnumerateArray()) yield return x;
        }
    }

    /// <summary>Per-user settings, in %AppData%\archMGMT-Revit\settings.json.</summary>
    internal class Settings
    {
        /// <summary>Developer option: another copy of the web app (blank = the live site).</summary>
        public string Url { get; set; }
        /// <summary>Turn off GPU drawing in the built-in browser, in case a graphics driver garbles the pane.</summary>
        public bool CompatibleRendering { get; set; }
        /// <summary>Install new add-in versions in the background (they load the next time Revit starts).</summary>
        public bool AutoUpdate { get; set; } = true;
        public string LastUpdateCheck { get; set; }
        /// <summary>The floating checklist on the sheet was on when Revit last closed.</summary>
        public bool Overlay { get; set; }

        private static string FilePath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "archMGMT-Revit", "settings.json");

        public static Settings Load()
        {
            try { return File.Exists(FilePath) ? JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath)) ?? new Settings() : new Settings(); }
            catch { return new Settings(); }
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(FilePath));
                File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch { /* ignore */ }
        }
    }
}
