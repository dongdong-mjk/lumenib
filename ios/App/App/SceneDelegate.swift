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
        if let box = panelBox, let web = webView {
            if box.convert(box.bounds, to: web).contains(p) { return false }
            closePanel()
        }
        webView?.evaluateJavaScript("window.lumenibCloseMenus && window.lumenibCloseMenus()", completionHandler: nil)
        return true
    }
    private var relaying = false
    // 굿노트처럼: 종이가 미끄러지듯 스크롤되는 중에 펜슬을 대면 스크롤을 그 자리에서 멈춰요
    // 펜슬이 닿아 있는 동안 스크롤 잠금.
    // 예전엔 스크롤 장치(제스처)를 껐다 켰는데, 그러면 웹킷이 다음 펜슬 터치를 붙잡아 둬서 툴바가 한동안 안 눌렸어요.
    // 이제 장치는 건드리지 않고, 손으로 끌려서 움직이면 원래 자리로 되돌려 놓기만 해요 (자동 스크롤처럼 코드로 움직이는 건 그대로 둬요)
    private var lockedScrolls: [(sv: UIScrollView, at: CGPoint)] = []
    func unlockScrollsIfIdle() { lockedScrolls = [] }
    private func unlockScrolls() { lockedScrolls = [] }
    private func holdScrolls() {
        for i in lockedScrolls.indices {
            let sv = lockedScrolls[i].sv
            if sv.isDragging || sv.isDecelerating { sv.setContentOffset(lockedScrolls[i].at, animated: false) }
            else { lockedScrolls[i].at = sv.contentOffset }
        }
    }
    private func stopScrolling(at p: CGPoint) {
        guard let web = webView else { return }
        var v = web.hitTest(p, with: nil)
        while let cur = v, cur !== web {
            if let sv = cur as? UIScrollView {
                if sv.isDecelerating || sv.isDragging { sv.setContentOffset(sv.contentOffset, animated: false) }
                // 펜슬이 종이에 닿아 있는 동안은 이 스크롤을 잠가요 (도구를 바꾼 직후 빠르게 쓰면 웹이 막기 전에 스크롤이 시작되곤 했어요)
                lockedScrolls.append((sv, sv.contentOffset))
            }
            v = cur.superview
        }
    }
    private var inkLastPoint: SIMD3<Double>?
    func inkBegin(_ p: SIMD3<Double>) {
        stopScrolling(at: CGPoint(x: p.x, y: p.y))
        relaying = inkConfig.relay
        inkLastPoint = p
        if relaying { relay("down", [p]) } else { inkOverlay.begin(p) }
    }
    func inkMove(_ pts: [SIMD3<Double>], _ pred: [SIMD3<Double>]) {
        holdScrolls()
        if let l = pts.last { inkLastPoint = l }
        if relaying { relay("move", pts) } else { inkOverlay.add(pts, predicted: pred) }
    }
    func inkCancel() { unlockScrolls(); if relaying { relay("cancel", []) } else { inkOverlay.clear() } }
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
        unlockScrolls()
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
    // 툴바의 '더 보기' 창(.tb-menu)과 같은 모양: 흰 바탕, 연한 테두리, 둥근 모서리 14, 그림자. 라이트/다크 상관없이 같아요.
    private var panel: UIViewController?
    private var panelBox: UIView?
    private var panelClosedAt: (Date, CGRect)?
    var panelFrameInWindow: CGRect? { panelBox.map { $0.convert($0.bounds, to: nil) } }

    func closePanel(touchAt p: CGPoint? = nil) {
        guard let vc = panel, let box = panelBox else { return }
        // 툴바 버튼을 다시 눌러 닫은 경우, 곧바로 오는 '열기' 요청은 무시하려고 기억해요
        if let p, let web = webView { panelClosedAt = (Date(), CGRect(origin: web.convert(p, from: nil), size: .zero)) } else { panelClosedAt = nil }
        vc.willMove(toParent: nil); box.removeFromSuperview(); vc.removeFromParent()
        panel = nil; panelBox = nil
    }

    private func presentPopover(_ vc: UIViewController, _ rect: CGRect) {
        guard let web = webView else { return }
        if let (t, r) = panelClosedAt, Date().timeIntervalSince(t) < 0.7, rect.insetBy(dx: -8, dy: -8).contains(r.origin) { panelClosedAt = nil; return }
        closePanel()
        vc.overrideUserInterfaceStyle = .light
        vc.loadViewIfNeeded() // 창 크기(preferredContentSize)는 화면을 만들 때 정해져요
        let W = vc.preferredContentSize.width, H0 = vc.preferredContentSize.height
        let box = UIView()
        box.layer.cornerRadius = 14
        box.layer.borderWidth = 1
        box.layer.borderColor = UIColor(hexString: "#e8e8e8").cgColor
        box.layer.shadowColor = UIColor.black.cgColor
        box.layer.shadowOpacity = 0.12; box.layer.shadowRadius = 8; box.layer.shadowOffset = CGSize(width: 0, height: 4)
        box.backgroundColor = .white
        let host = web.bounds
        let top = rect.maxY + 8
        let H = min(H0, host.height - top - 16)
        let x = min(max(16, rect.midX - W / 2), host.width - W - 16)
        box.frame = CGRect(x: x, y: top, width: W, height: H)
        addChild(vc)
        vc.view.frame = box.bounds
        vc.view.layer.cornerRadius = 14; vc.view.clipsToBounds = true
        box.addSubview(vc.view)
        web.addSubview(box)
        vc.didMove(toParent: self)
        panel = vc; panelBox = box
        // 먼저 자리를 다 잡아야 펜 종류 탭 선택이 옆에서 미끄러져 들어오지 않아요 (애니메이션 없이)
        UIView.performWithoutAnimation { box.layoutIfNeeded(); vc.view.setNeedsLayout(); vc.view.layoutIfNeeded(); vc.view.subviews.forEach { $0.layoutIfNeeded() } }
        box.alpha = 0; UIView.animate(withDuration: 0.15) { box.alpha = 1 }
    }
    // 웹 창 안의 슬라이더 자리에 진짜 iOS 슬라이더를 겹쳐 놓아요 (형광펜 투명도 등)
    private var webSlider: UISlider?
    private var webSliderInfo: (id: String, step: Double) = ("", 1)
    private func showWebSlider(_ b: [String: Any]) {
        guard let web = webView else { return }
        let r = anchorRect(b)
        let sl = webSlider ?? UISlider()
        sl.minimumValue = Float(b["min"] as? Double ?? 0); sl.maximumValue = Float(b["max"] as? Double ?? 100)
        sl.value = Float(b["value"] as? Double ?? 0)
        sl.tintColor = .lumenTextPrimary
        sl.overrideUserInterfaceStyle = .light // '더 보기' 계열 창은 늘 흰 바탕
        sl.frame = CGRect(x: r.minX, y: r.midY - 15, width: r.width, height: 30)
        webSliderInfo = (b["id"] as? String ?? "", b["step"] as? Double ?? 1)
        if webSlider == nil {
            sl.addTarget(self, action: #selector(webSliderChanged(_:)), for: .valueChanged)
            sl.addTarget(self, action: #selector(webSliderDone(_:)), for: [.touchUpInside, .touchUpOutside, .touchCancel])
            web.addSubview(sl); webSlider = sl
        }
    }
    private func webSliderValue(_ s: UISlider) -> Double { let st = webSliderInfo.step; return (Double(s.value) / st).rounded() * st }
    @objc private func webSliderChanged(_ s: UISlider) { js("window.lumenibSlider && window.lumenibSlider('\(webSliderInfo.id)', \(webSliderValue(s)), false)") }
    @objc private func webSliderDone(_ s: UISlider) { js("window.lumenibSlider && window.lumenibSlider('\(webSliderInfo.id)', \(webSliderValue(s)), true)") }

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
        if action == "slider" { showWebSlider(body); return }
        if action == "sliderRemove" { webSlider?.removeFromSuperview(); webSlider = nil; return }
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
        // 펜 설정·굵기 창이 열린 채로 도구를 바꾸면 창은 닫아요
        closePanel()
        js("window.lumenibCloseMenus && window.lumenibCloseMenus()")
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

    // 펜슬 터치는 여기서 보고 네이티브로 그리지만, 이벤트 자체는 항상 웹에도 그대로 보내요.
    // (예전엔 웹에 안 보냈더니 웹이 터치 상태를 잘못 기억해서 손가락 확대·버튼이 멈췄어요.
    //  웹은 네이티브가 그리는 동안 진짜 펜슬 입력을 무시해요: js/ink.js accept)
    override func sendEvent(_ event: UIEvent) {
        // 펜 설정·굵기 창 밖을 누르면 창을 닫아요 (손가락·펜슬 모두)
        if event.type == .touches, let b = bridge, let f = b.panelFrameInWindow, let all = event.allTouches,
           let t = all.first(where: { $0.phase == .began && !f.contains($0.location(in: nil)) }) {
            b.closePanel(touchAt: t.location(in: nil))
        }
        // 안전장치: 펜슬로 쓰는 중이 아닌데 스크롤이 잠겨 있으면 풀어요 (페이지가 멈추거나 확대가 안 되던 것)
        if event.type == .touches, tracked == nil, let b = bridge, let all = event.allTouches, all.contains(where: { $0.phase == .began }) { b.unlockScrollsIfIdle() }
        if event.type == .touches, let b = bridge, let web = b.webView, let all = event.allTouches,
           let pencil = all.first(where: { $0.type == .pencil }) {
            if let t = tracked, t === pencil {
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
            } else if pencil.phase == .began, tracked == nil, b.inkShouldTake(pencil.location(in: web)) {
                tracked = pencil
                b.inkBegin(point(pencil, in: web))
            }
        }
        super.sendEvent(event)
    }
}
