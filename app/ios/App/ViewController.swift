import UIKit
import WebKit

/// 用一个铺满屏幕的 WKWebView 跑 index.html，关掉滚动/长按/缩放，
/// 让网页看起来就是一个原生游戏。
final class ViewController: UIViewController, WKScriptMessageHandler {
    private var web: WKWebView!

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    override func viewDidLoad() {
        super.viewDidLoad()

        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.defaultWebpagePreferences.allowsContentJavaScript = true
        cfg.suppressesIncrementalRendering = false
        cfg.userContentController.add(self, name: "haptic")

        web = WKWebView(frame: .zero, configuration: cfg)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.02, green: 0.06, blue: 0.10, alpha: 1)
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.maximumZoomScale = 1
        web.scrollView.minimumZoomScale = 1
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsBackForwardNavigationGestures = false
        web.translatesAutoresizingMaskIntoConstraints = false
        if #available(iOS 16.4, *) { web.isInspectable = true }

        view.backgroundColor = web.backgroundColor
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        // 长按不要弹"拷贝/选择"
        let menu = UIMenuController.shared
        menu.isMenuVisible = false

        if let dir = Bundle.main.url(forResource: "www", withExtension: nil) {
            let index = dir.appendingPathComponent("index.html")
            web.loadFileURL(index, allowingReadAccessTo: dir)
        }
    }

    // 网页里可以 window.webkit.messageHandlers.haptic.postMessage(0) 触发震动
    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "haptic" else { return }
        let style = (message.body as? Int) ?? 0
        if style == 1 {
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        } else {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}
