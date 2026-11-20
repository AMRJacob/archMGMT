using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Autodesk.Revit.UI;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace ArchMgmt
{
    /// <summary>
    /// The web app's Revit page in a WebView2: used as the docked pane and inside the floating checklist.
    /// Page ⇄ add-in messages: the page posts { id, type, ... }; this replies { type:"reply", id, ok, result|error }
    /// and sends { type:"event", event, data } when something changes in Revit.
    /// </summary>
    internal class WebPane : UserControl, IDockablePaneProvider
    {
        public const string DefaultUrl = "https://amrjacob.github.io/archMGMT/";
        private static Task<CoreWebView2Environment> _env; // one browser profile for the pane and the checklist (one sign-in)

        private readonly bool _overlay;
        private readonly Grid _root = new Grid();
        private readonly TextBlock _message = new TextBlock { Margin = new Thickness(14), TextWrapping = TextWrapping.Wrap, FontSize = 12.5 };
        private WebView2 _web;
        private bool _started;
        private bool _ready; // the page has said hello
        private readonly List<string> _waiting = new List<string>(); // events kept for a page that hasn't loaded yet

        public WebPane(bool overlay)
        {
            _overlay = overlay;
            Background = new SolidColorBrush(Color.FromRgb(0xf7, 0xf6, 0xf2));
            _message.Foreground = new SolidColorBrush(Color.FromRgb(0x6b, 0x71, 0x78));
            _message.Text = overlay ? "" : "Loading archMGMT…";
            _root.Children.Add(_message);
            Content = _root;
            MinWidth = overlay ? 0 : 280;
            Loaded += async (o, e) => { if (!_started) { _started = true; await InitWebView(); } };
        }

        public void SetupDockablePane(DockablePaneProviderData data)
        {
            data.FrameworkElement = this;
            data.InitialState = new DockablePaneState { DockPosition = DockPosition.Right };
            data.VisibleByDefault = true;
        }

        public void Shutdown()
        {
            try { _web?.Dispose(); } catch { /* ignore */ }
        }

        private static string BaseUrl
        {
            get
            {
                var u = Settings.Load().Url;
                return string.IsNullOrWhiteSpace(u) ? DefaultUrl : u.Trim();
            }
        }

        /// <summary>…/archMGMT/?host=revit#/revit, with ?mode=overlay for the floating checklist.</summary>
        private string Url
        {
            get
            {
                var b = BaseUrl;
                var hash = b.IndexOf('#');
                if (hash >= 0) b = b.Substring(0, hash);
                b += (b.Contains("?") ? "&" : "?") + "host=revit";
                return b + "#/revit" + (_overlay ? "?mode=overlay" : "");
            }
        }

        private static Task<CoreWebView2Environment> BrowserEnvironment()
        {
            if (_env != null) return _env;
            // Our copy of WebView2.Core needs our WebView2Loader.dll (Revit's copy finds Revit's loader itself).
            if (WebView2Assemblies.UsingOurCopy)
            {
                try { CoreWebView2Environment.SetLoaderDllFolderPath(WebView2Assemblies.OurFolder); } catch { /* already set */ }
            }
            var data = Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "archMGMT-Revit", "WebView2");
            Directory.CreateDirectory(data);
            var opts = new CoreWebView2EnvironmentOptions();
            if (Settings.Load().CompatibleRendering) opts.AdditionalBrowserArguments = "--disable-gpu --disable-gpu-compositing";
            return _env = CoreWebView2Environment.CreateAsync(null, data, opts);
        }

        private async Task InitWebView()
        {
            try
            {
                var env = await BrowserEnvironment();
                _web = new WebView2();
                _root.Children.Add(_web);
                await _web.EnsureCoreWebView2Async(env);
                var core = _web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = true;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = !_overlay;
                core.WebMessageReceived += OnMessage;
                core.NewWindowRequested += (o, e) =>
                {
                    // Links that open a new tab go to the default browser.
                    e.Handled = true;
                    OpenExternal(e.Uri);
                };
                core.NavigationCompleted += (o, e) =>
                {
                    if (e.IsSuccess) { _message.Visibility = Visibility.Collapsed; _web.Visibility = Visibility.Visible; }
                    else
                    {
                        _message.Visibility = Visibility.Visible;
                        _message.Text = _overlay ? "archMGMT couldn't load." : "Couldn't load archMGMT (" + e.WebErrorStatus + "). Check the internet connection, then hide and show this pane (AMR › Sheet Tasks).\n\n" + BaseUrl;
                        _web.Visibility = Visibility.Collapsed;
                    }
                };
                _web.Source = new Uri(Url);
            }
            catch (Exception ex)
            {
                _started = false; // try again the next time the pane is shown
                _message.Visibility = Visibility.Visible;
                _message.Text = "The built-in browser (Microsoft Edge WebView2) could not start:\n\n" + ex.Message +
                    "\n\nWindows 10/11 normally includes it. If it is missing, install the \"WebView2 Runtime\" from Microsoft. archMGMT also works in any browser: " + DefaultUrl;
            }
        }

        internal static void OpenExternal(string uri)
        {
            if (string.IsNullOrEmpty(uri) || !(uri.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || uri.StartsWith("http://", StringComparison.OrdinalIgnoreCase))) return;
            try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true }); } catch { /* ignore */ }
        }

        /// <summary>Tell the page something changed in Revit. With keepUntilReady, it's held for a page still loading.</summary>
        public void PostEvent(string name, object data, bool keepUntilReady = false)
        {
            var json = JsonSerializer.Serialize(new Dictionary<string, object> { ["type"] = "event", ["event"] = name, ["data"] = data }, Json.Options);
            if (!_ready || _web?.CoreWebView2 == null)
            {
                if (keepUntilReady) _waiting.Add(json);
                return;
            }
            PostJson(json);
        }

        private void PostJson(string json)
        {
            try
            {
                if (Dispatcher.CheckAccess()) _web.CoreWebView2.PostWebMessageAsJson(json);
                else Dispatcher.BeginInvoke(new Action(() => { try { _web.CoreWebView2.PostWebMessageAsJson(json); } catch { /* closed */ } }));
            }
            catch (Exception ex) { Debug.WriteLine(ex); }
        }

        private void Reply(JsonElement id, bool ok, object result, string error)
        {
            var msg = new Dictionary<string, object> { ["type"] = "reply", ["id"] = id.ValueKind == JsonValueKind.Undefined ? null : (object)id, ["ok"] = ok };
            if (ok) msg["result"] = result; else msg["error"] = error;
            PostJson(JsonSerializer.Serialize(msg, Json.Options));
        }

        private async void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            JsonElement msg;
            try { using var d = JsonDocument.Parse(e.WebMessageAsJson); msg = d.RootElement.Clone(); }
            catch { return; }
            var id = msg.TryGetProperty("id", out var idEl) ? idEl.Clone() : default;
            var type = msg.Str("type");
            try
            {
                object result = await Handle(type, msg);
                Reply(id, true, result, null);
                if (type == "getModel" && _waiting.Count > 0)
                {
                    // The page is up and has the model: hand over anything that was waiting (a right-click command).
                    var held = _waiting.ToArray();
                    _waiting.Clear();
                    foreach (var j in held) PostJson(j);
                }
            }
            catch (Exception ex) { Reply(id, false, null, Describe(ex)); }
        }

        private static string Describe(Exception ex)
        {
            while (ex is AggregateException a && a.InnerException != null) ex = a.InnerException;
            while (ex is System.Reflection.TargetInvocationException t && t.InnerException != null) ex = t.InnerException;
            return ex.Message;
        }

        private async Task<object> Handle(string type, JsonElement msg)
        {
            switch (type)
            {
                case "hello":
                    _ready = true;
                    return new Dictionary<string, object>
                    {
                        ["host"] = "revit",
                        ["version"] = App.Version,
                        ["revit"] = App.RevitVersion,
                        ["webview2"] = WebView2Assemblies.LoadedFrom,
                        ["update"] = Updater.Status(),
                        ["overlay"] = App.Instance.OverlayOn,
                    };
                case "getModel":
                    _ready = true;
                    return await App.Instance.Jobs.Run(app => ModelInfo.Get(app));
                case "open":
                    return await App.Instance.Jobs.Run(app => ModelInfo.Open(app, msg.Str("id")));
                case "setOverlay":
                    return App.Instance.SetOverlay(msg.Bool("on"));
                case "showPane":
                    App.Instance.ShowPane();
                    return true;
                case "overlaySize":
                    if (_overlay) App.Instance.SetOverlayHeight(msg.Num("height", 0));
                    return true;
                case "openUrl":
                    OpenExternal(msg.Str("url"));
                    return true;
                case "checkUpdate":
                    return await Updater.Check(force: true);
                case "installUpdate":
                    return await Updater.Install();
                default:
                    throw new InvalidOperationException("Unknown request: " + type);
            }
        }
    }
}
