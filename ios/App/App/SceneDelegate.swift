import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = PencilBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// 웹앱 화면 + 애플펜슬 더블탭(2세대·Pro)·스퀴즈(Pro).
/// iPad 설정 > Apple Pencil 에서 고른 동작(지우개로 전환, 이전 도구, 색상 팔레트 등)을 웹앱에 넘겨 그대로 따라 한다.
/// 웹 쪽 함수는 js/app.js 의 window.lumenibPencil(kind, action).
class PencilBridgeViewController: CAPBridgeViewController, UIPencilInteractionDelegate, WKScriptMessageHandler {

    override func viewDidLoad() {
        super.viewDidLoad()
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        view.addInteraction(pencil)
    }

    // 웹에서 window.webkit.messageHandlers.lumenibNative.postMessage({ action: 'openInk' }) 로 네이티브 화면을 열어요.
    // 웹은 이 통로가 있을 때만(=앱 안에서만) "네이티브 필기" 버튼을 보여 줘요.
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        webView?.configuration.userContentController.add(self, name: "lumenibNative")
        applyTheme(UserDefaults.standard.string(forKey: "theme"))
        setupInk()
    }

    // MARK: 필기만 네이티브 (웹 노트 위에서 애플펜슬 펜·형광펜)
    private let inkOverlay = WebInkOverlay()
    private let inkGesture = PencilInkGestureRecognizer(target: nil, action: nil)

    private func setupInk() {
        guard let web = webView else { return }
        // 웹뷰 위에 고정 (웹뷰 안 스크롤과 상관없이 화면 좌표 그대로)
        inkOverlay.frame = web.bounds
        inkOverlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.addSubview(inkOverlay)
        web.addGestureRecognizer(inkGesture)
        inkGesture.onBegin = { [weak self] p in self?.inkOverlay.begin(p) }
        inkGesture.onMove = { [weak self] pts, pred in self?.inkOverlay.add(pts, predicted: pred) }
        inkGesture.onCancel = { [weak self] in self?.inkOverlay.clear() }
        inkGesture.onEnd = { [weak self] in
            guard let self else { return }
            let pts = self.inkOverlay.pts.map { [($0.x * 10).rounded() / 10, ($0.y * 10).rounded() / 10, ($0.z * 100).rounded() / 100] }
            guard let data = try? JSONSerialization.data(withJSONObject: pts), let json = String(data: data, encoding: .utf8) else { self.inkOverlay.clear(); return }
            // 웹이 노트에 넣어 다시 그린 다음에 지워서 깜빡이지 않게
            self.webView?.evaluateJavaScript("window.lumenibInk && window.lumenibInk(\(json))") { [weak self] _, _ in
                DispatchQueue.main.async { self?.inkOverlay.clear() }
            }
        }
    }

    // 웹앱의 화면 모드(라이트/다크)를 기억해서, 앱을 켤 때 웹이 뜨기 전 바탕색도 맞춰요
    private func applyTheme(_ t: String?) {
        let light = t == "light"
        let bg = light ? UIColor(red: 0xF7 / 255.0, green: 0xF7 / 255.0, blue: 0xF7 / 255.0, alpha: 1) : .black
        view.backgroundColor = bg
        webView?.backgroundColor = bg
        webView?.scrollView.backgroundColor = bg
        webView?.isOpaque = false
        overrideUserInterfaceStyle = light ? .light : .dark
        view.window?.overrideUserInterfaceStyle = light ? .light : .dark
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if action == "inkConfig" {
            let c = WebInkConfig(body)
            inkGesture.config = c
            inkOverlay.config = c
            return
        }
        if action == "theme", let t = body["value"] as? String {
            UserDefaults.standard.set(t, forKey: "theme")
            applyTheme(t)
            return
        }
        guard action == "openInk", presentedViewController == nil else { return }
        let vc = NativeInkViewController()
        vc.modalPresentationStyle = .fullScreen
        present(vc, animated: true)
    }

    private func sendToWeb(_ kind: String, _ action: String) {
        guard action != "ignore" else { return }
        let js = """
        (function (k, a) {
          if (window.lumenibPencil) return window.lumenibPencil(k, a);
          if (a !== 'undo') return;
          var b = document.querySelector('[data-act="undo"]');
          if (b && !b.disabled) b.click();
        })('\(kind)', '\(action)');
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // iOS 17.4 이하
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        sendToWeb("doubleTap", PencilAction.name(UIPencilInteraction.preferredTapAction))
    }

    // iOS 17.5 이상: 더블탭
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        sendToWeb("doubleTap", PencilAction.name(UIPencilInteraction.preferredTapAction))
    }

    // iOS 17.5 이상: Pencil Pro 스퀴즈 (꽉 쥐었다 놓을 때 한 번)
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        guard squeeze.phase == .ended else { return }
        sendToWeb("squeeze", PencilAction.name(UIPencilInteraction.preferredSqueezeAction))
    }
}

/// iPad 설정의 펜슬 동작을 웹으로 넘길 이름으로
enum PencilAction {
    static func name(_ a: UIPencilPreferredAction) -> String {
        switch a {
        case .ignore: return "ignore"
        case .switchEraser: return "switchEraser"
        case .switchPrevious: return "switchPrevious"
        case .showColorPalette: return "showColorPalette"
        default: break
        }
        if #available(iOS 16.0, *), a == .showInkAttributes { return "showInkAttributes" }
        if #available(iOS 17.5, *) {
            if a == .showContextualPalette { return "showContextualPalette" }
            if a == .runSystemShortcut { return "ignore" } // 단축어는 iPad가 직접 실행
        }
        return "ignore"
    }
}
