using System;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace ArchMgmt
{
    /// <summary>
    /// The floating checklist: a small borderless window owned by Revit that sits in the top-right corner of the
    /// sheet or view that's open and follows it. (Revit's API has no way to draw controls on the drawing itself.)
    /// </summary>
    internal class OverlayWindow : Window
    {
        private const double PanelWidth = 300;
        private const double Gap = 14;
        public WebPane Pane { get; }
        private double _wantHeight = 30;
        private bool _closing;

        public OverlayWindow(IntPtr owner)
        {
            Title = "archMGMT checklist";
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.NoResize;
            ShowInTaskbar = false;
            ShowActivated = false;
            Topmost = false;
            Width = PanelWidth;
            Height = _wantHeight;
            WindowStartupLocation = WindowStartupLocation.Manual;
            Left = -10000; Top = -10000; // placed at the first idle moment
            Background = new SolidColorBrush(Color.FromRgb(0x1f, 0x2a, 0x2e));
            Pane = new WebPane(overlay: true);
            Content = Pane;
            new WindowInteropHelper(this).Owner = owner;
            Closing += (o, e) => { if (!_closing) { e.Cancel = true; App.Instance.SetOverlay(false); } };
        }

        public void Shutdown()
        {
            _closing = true;
            Pane.Shutdown();
            Close();
        }

        /// <summary>Hide while there's no view to sit on (or the checklist is turned off).</summary>
        public void Park()
        {
            if (IsVisible) Hide();
        }

        /// <summary>The page says how tall its content is.</summary>
        public void SetContentHeight(double height)
        {
            _wantHeight = Math.Max(26, Math.Min(480, height));
            if (Math.Abs(Height - _wantHeight) > 0.5) Height = _wantHeight;
        }

        /// <summary>Sit in the top-right corner of a view's window (screen pixels from Revit).</summary>
        public void Follow(int left, int top, int right, int bottom)
        {
            if (!IsVisible) Show();
            // Screen pixels → WPF units for the monitor this window is on.
            double sx = 1, sy = 1;
            var src = PresentationSource.FromVisual(this);
            if (src?.CompositionTarget != null)
            {
                var m = src.CompositionTarget.TransformFromDevice;
                sx = m.M11; sy = m.M22;
            }
            double viewW = (right - left) * sx, viewH = (bottom - top) * sy;
            if (viewW < PanelWidth + 2 * Gap || viewH < 80) { Park(); return; } // the view is too small to share
            double x = right * sx - PanelWidth - Gap, y = top * sy + Gap;
            double maxH = Math.Max(26, viewH - 2 * Gap);
            double h = Math.Min(_wantHeight, maxH);
            if (Math.Abs(Left - x) > 0.5) Left = x;
            if (Math.Abs(Top - y) > 0.5) Top = y;
            if (Math.Abs(Height - h) > 0.5) Height = h;
        }
    }
}
