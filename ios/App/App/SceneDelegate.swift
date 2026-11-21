import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = InkWindow(windowScene: windowScene)
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

    // 툴바가 화면 맨 위(제목줄)에 있어서, 위쪽 가장자리의 시스템 동작(알림 센터·메뉴 막대 내리기)이
    // 손가락 터치를 먼저 가져가지 않게 해요. 시스템 동작은 한 번 더 끌어내리면 그대로 쓸 수 있어요.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { [.top] }


    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }

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
        // 앱처럼: 화면 전체가 끌리거나 튕기지 않게 (노트 종이 안의 스크롤은 그대로 돼요)
        // (isScrollEnabled = false 는 쓰면 안 돼요: 웹 안 스크롤 영역(노트 종이·성경 목록)과 확대까지 같이 멈춰요)
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
    }

    // MARK: 필기만 네이티브 (웹 노트 위에서 애플펜슬 펜·형광펜)
    private let inkOverlay = WebInkOverlay()
    private var inkConfig = WebInkConfig()

    // 창(InkWindow)이 애플펜슬 터치를 웹보다 먼저 받아서 여기로 넘겨요.
    // 펜·형광펜이고 종이 위에서 시작하면 true → 그 획은 웹에 안 가고 네이티브가 그려요.
    func inkShouldTake(_ p: CGPoint) -> Bool {
        guard inkConfig.allows(p) else { return false }
        // 펜 설정·굵기 창이 열려 있어도, 창 밖 종이에 펜슬을 대면 창을 닫고 바로 써요 (굿노트처럼)
        if let pv = presentedViewController {
            if let v = pv.view, let web = webView, v.convert(v.bounds, to: web).contains(p) { return false }
            pv.dismiss(animated: true)
        }
        webView?.evaluateJavaScript("window.lumenibCloseMenus && window.lumenibCloseMenus()", completionHandler: nil)
        return true
    }
    private var relaying = false
    private var inkLastPoint: SIMD3<Double>?
    func inkBegin(_ p: SIMD3<Double>) {
        relaying = inkConfig.relay
        inkLastPoint = p
        if relaying { relay("down", [p]) } else { inkOverlay.begin(p) }
    }
    func inkMove(_ pts: [SIMD3<Double>], _ pred: [SIMD3<Double>]) {
        if let l = pts.last { inkLastPoint = l }
        if relaying { relay("move", pts) } else { inkOverlay.add(pts, predicted: pred) }
    }
    func inkCancel() { if relaying { relay("cancel", []) } else { inkOverlay.clear() } }
    private func relay(_ type: String, _ pts: [SIMD3<Double>]) {
        let arr = pts.map { "[\(($0.x * 10).rounded() / 10),\(($0.y * 10).rounded() / 10),\(($0.z * 100).rounded() / 100)]" }.joined(separator: ",")
        webView?.evaluateJavaScript("window.lumenibPointer && window.lumenibPointer('\(type)', [\(arr)])", completionHandler: nil)
    }

    // 노트 종이 스크롤만 손가락으로만 스크롤되게 해요 (성경 목록 같은 다른 스크롤은 펜슬로도 돼요).
    // 그래야 올가미·지우개처럼 웹이 받는 펜슬 획이 도구를 바꾼 직후에도 스크롤로 바뀌지 않아요.
    func pencilNeverScrolls() {
        guard let web = webView else { return }
        let root = web.scrollView
        let fingers = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
        let both = [NSNumber(value: UITouch.TouchType.direct.rawValue), NSNumber(value: UITouch.TouchType.pencil.rawValue)]
        let area = inkConfig.enabled ? inkConfig.area : .zero
        func walk(_ v: UIView) {
            if let sv = v as? UIScrollView, sv !== root {
                let f = sv.convert(sv.bounds, to: web)
                // 웹이 알려 준 종이 영역과 거의 같은 스크롤 영역 = 노트 종이
                let isPaper = !area.isEmpty && abs(f.minX - area.minX) < 24 && abs(f.minY - area.minY) < 24 && abs(f.width - area.width) < 48 && abs(f.height - area.height) < 48
                let want = isPaper ? fingers : both
                if sv.panGestureRecognizer.allowedTouchTypes != want { sv.panGestureRecognizer.allowedTouchTypes = want }
            }
            v.subviews.forEach(walk)
        }
        walk(root)
    }

    private func setupInk() {
        guard let web = webView else { return }
        // 웹뷰 위에 고정 (웹뷰 안 스크롤과 상관없이 화면 좌표 그대로)
        inkOverlay.frame = web.bounds
        inkOverlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.addSubview(inkOverlay)
    }

    func inkEnd() {
        if relaying { relay("up", [inkLastPoint ?? SIMD3(0, 0, 0.5)]); relaying = false; return }
        do {
            let pts = inkOverlay.pts.map { [($0.x * 10).rounded() / 10, ($0.y * 10).rounded() / 10, ($0.z * 100).rounded() / 100] }
            guard let data = try? JSONSerialization.data(withJSONObject: pts), let json = String(data: data, encoding: .utf8) else { inkOverlay.clear(); return }
            // 웹이 노트에 넣어 다시 그린 다음에 지워서 깜빡이지 않게
            let kept = inkOverlay.commit()
            webView?.evaluateJavaScript("window.lumenibInk && window.lumenibInk(\(json))") { [weak self] r, _ in
                // 웹이 획을 못 받았으면(예: 종이 밖) 바로 지워요
                if (r as? Bool) == false { self?.inkOverlay.drop(kept) }
            }
            // 웹이 "다 그렸어요"(inkDrawn)를 보내면 지워요. 소식이 없어도 0.6초 뒤엔 지워요
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.inkOverlay.drop(kept) }
        }
    }

    // MARK: 펜 설정 · 굵기 창을 진짜 iPad 창(팝오버)으로

    private static let styleKeys = ["ball", "fountain", "brush"]
    private func anchorRect(_ b: [String: Any]) -> CGRect {
        let a = (b["anchor"] as? [Any])?.map { ($0 as? NSNumber)?.doubleValue ?? 0 } ?? [0, 0, 1, 1]
        return a.count == 4 ? CGRect(x: a[0], y: a[1], width: a[2], height: a[3]) : .zero
    }
    private func presentPopover(_ vc: UIViewController, _ rect: CGRect) {
        guard presentedViewController == nil, let web = webView else { return }
        vc.modalPresentationStyle = .popover
        if let pop = vc.popoverPresentationController {
            pop.sourceView = web
            pop.sourceRect = rect
            pop.permittedArrowDirections = [.down, .up]
        }
        present(vc, animated: true)
    }
    private func js(_ code: String) { webView?.evaluateJavaScript(code, completionHandler: nil) }

    private func presentPenSettings(_ b: [String: Any]) {
        let keys = Self.styleKeys
        let style = LumenPenStyle(rawValue: keys.firstIndex(of: b["style"] as? String ?? "") ?? 0) ?? .ball
        var opts: [LumenPenStyle: [String: Double]] = [:]
        for (k, v) in (b["opts"] as? [String: Any] ?? [:]) {
            guard let i = keys.firstIndex(of: k), let st = LumenPenStyle(rawValue: i) else { continue }
            opts[st] = (v as? [String: Any])?.compactMapValues { ($0 as? NSNumber)?.doubleValue } ?? [:]
        }
        let vc = LumenPenSettingsViewController(style: style, opts: opts, color: b["color"] as? String ?? "#111111")
        vc.onChange = { [weak self] st, o in
            let dict = o[st] ?? [:]
            guard let data = try? JSONSerialization.data(withJSONObject: dict), let json = String(data: data, encoding: .utf8) else { return }
            self?.js("window.lumenibSetPen('\(keys[st.rawValue])', \(json))")
        }
        presentPopover(vc, anchorRect(b))
    }

    private func presentSizeSlider(_ b: [String: Any]) {
        let t = b["tool"] as? String ?? "pen", idx = b["idx"] as? Int ?? 0
        let vc = LumenSizeSliderViewController(title: t == "pen" ? "펜 굵기" : t == "hl" ? "형광펜 굵기" : "지우개 크기",
                                               value: b["value"] as? Double ?? 2.6, min: b["min"] as? Double ?? 0.6, max: b["max"] as? Double ?? 10,
                                               step: t == "pen" ? 0.1 : 1, defaultValue: b["def"] as? Double ?? 2.6)
        vc.onChange = { [weak self] v, done in self?.js("window.lumenibSetSize('\(t)', \(idx), \(v), \(done))") }
        presentPopover(vc, anchorRect(b))
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
        if action == "penSettings" { presentPenSettings(body); return }
        if action == "sizeSlider" { presentSizeSlider(body); return }
        if action == "inkDrawn" { inkOverlay.dropOldestPending(); return }
        if action == "inkConfig" {
            let c = WebInkConfig(body)
            inkConfig = c
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

/// 애플펜슬 터치를 웹보다 먼저 가로채는 창.
/// 웹뷰 안의 제스처들이 펜슬 획을 중간에 끊어 버려서(점만 찍힘), 창 단계에서 받아 네이티브로 그려요.
final class InkWindow: UIWindow {
    private weak var tracked: UITouch?

    private var bridge: PencilBridgeViewController? { rootViewController as? PencilBridgeViewController }

    private func point(_ t: UITouch, in v: UIView) -> SIMD3<Double> {
        let p = t.preciseLocation(in: v)
        let f = t.maximumPossibleForce > 0 ? Double(t.force / t.maximumPossibleForce) : 0.5
        return SIMD3(Double(p.x), Double(p.y), min(1, max(0.05, f)))
    }

    // 펜슬로 쓰는 동안 손바닥·손가락이 새로 닿으면, 그 터치의 시작은 웹에 안 갔어요.
    // 그 뒤 움직임·떼기만 웹에 가면 웹이 터치 상태를 잘못 알아서 확대(두 손가락)가 멈췄어요. 그런 터치는 끝까지 웹에 안 보내요.
    private var swallowed = Set<UITouch>() // 터치 자체를 기억 (번호로 기억하면 새 터치가 같은 번호를 받아 잘못 삼켜졌어요)

    override func sendEvent(_ event: UIEvent) {
        if event.type == .touches, let a = event.allTouches, a.contains(where: { $0.type == .direct && $0.phase == .began }) { print("[touch] began fingers=\(a.filter { $0.type == .direct }.count) swallowed=\(swallowed.count) tracked=\(tracked != nil)") } // 임시 기록
        guard event.type == .touches, let b = bridge, let web = b.webView, let all = event.allTouches else { return super.sendEvent(event) }
        let pencil = all.first(where: { $0.type == .pencil })
        if let t = tracked, let pencil, t === pencil {
            for f in all where f.type != .pencil && f.phase == .began { swallowed.insert(f) }
            switch pencil.phase {
            case .moved, .stationary:
                b.inkMove((event.coalescedTouches(for: pencil) ?? [pencil]).map { point($0, in: web) },
                          (event.predictedTouches(for: pencil) ?? []).map { point($0, in: web) })
            case .ended:
                b.inkMove([point(pencil, in: web)], [])
                b.inkEnd(); tracked = nil
            case .cancelled:
                b.inkCancel(); tracked = nil
            default: break
            }
            passFingers(event, all)
            forget(all)
            return // 이 펜슬 획은 웹으로 보내지 않아요
        }
        if let pencil, pencil.phase == .began, tracked == nil, b.inkShouldTake(pencil.location(in: web)) {
            tracked = pencil
            for f in all where f.type != .pencil && f.phase == .began { swallowed.insert(f) }
            b.inkBegin(point(pencil, in: web))
            passFingers(event, all)
            return
        }
        // 웹이 시작을 못 본 손가락 터치만 움직이는 이벤트면 그대로 삼켜요
        if !swallowed.isEmpty {
            let changing = all.filter { $0.phase != .stationary }
            if !changing.isEmpty && changing.allSatisfy({ swallowed.contains($0) }) { forget(all); return }
        }
        forget(all)
        super.sendEvent(event)
    }

    // 펜슬보다 먼저 닿아 있던 손가락(손바닥)은 웹이 시작을 이미 봤어요. 그 손가락이 떼어질 때 웹에 꼭 알려야
    // 웹이 "손가락이 아직 있다"고 착각하지 않아요(그러면 다음 두 손가락 확대가 막혔어요). 그래서 이벤트를 웹에도 보내요.
    // (펜슬 획은 웹이 시작을 못 봐서 웹은 무시해요)
    private func passFingers(_ event: UIEvent, _ all: Set<UITouch>) {
        if all.contains(where: { $0.type != .pencil && !swallowed.contains($0) }) { super.sendEvent(event) }
    }

    private func forget(_ all: Set<UITouch>) {
        // 화면에 없는 터치와 끝난 터치는 잊어요 (남아 있으면 다음 손가락 터치가 웹에 안 가요)
        swallowed = swallowed.intersection(all).filter { $0.phase != .ended && $0.phase != .cancelled }
    }
}
