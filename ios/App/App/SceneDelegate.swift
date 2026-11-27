import UIKit
import WebKit
import Capacitor
import AuthenticationServices
import CryptoKit
import PhotosUI

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        // iPadOS 26부터는 '전체 화면 전용'(UIRequiresFullScreen)을 무시하고 창 크기를 줄일 수 있어요.
        // 막을 수는 없어서, 레이아웃이 깨지지 않는 최소 크기를 정해 그보다 작게는 못 줄이게 해요 (가장 작은 iPad mini 가로 1133×744 안쪽, 58~)
        windowScene.sizeRestrictions?.minimumSize = CGSize(width: 1024, height: 700)

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

    // 창 모드(iPadOS 26)에선 왼쪽 위에 창 단추(빨강·노랑·초록)가 생겨요. 그 자리만큼 웹 위 줄의 왼쪽 단추를 밀도록
    // 폭을 웹에 --win-left 로 알려요 (59~)
    private var winLeft: CGFloat = -1
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        updateWindowControlsInset()
    }
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        updateWindowControlsInset()
    }
    private func updateWindowControlsInset() {
        guard #available(iOS 26.0, *) else { return }
        // 60에서 '창이 화면과 같은 크기면 0'으로 막았더니 창 모드에서도 0이 돼 다시 겹쳤어요. 그 판단은 빼고,
        // 전체 화면의 작은 값(모서리 자리)은 웹이 30px 미만으로 걸러요 (61)
        let left = max(0, view.edgeInsets(for: .safeArea(cornerAdaptation: .horizontal)).left - view.safeAreaInsets.left)
        guard abs(left - winLeft) > 0.5 else { return }
        winLeft = left
        js("document.documentElement.style.setProperty('--win-left', '\(Int(left.rounded()))px'); window.lumenibWinInset && window.lumenibWinInset()")
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
        // 글씨 판 통로: 이게 있으면 웹은 다 쓴 글씨를 직접 그리지 않고 앱에 맡겨요 (11/24)
        webView?.configuration.userContentController.add(self, name: "lumenibCanvas")
        // 인용 끌 때 같이 가는 글씨를 앱이 옮길 수 있다는 표시 (웹은 이 통로가 있으면 noteCarry를 보내요, 11/25)
        webView?.configuration.userContentController.add(self, name: "lumenibCarry")
        // 두 손가락 확대 동안 종이 칸(웹 화면 포함)을 앱이 직접 키워요. 웹은 이 통로가 있으면 스스로 키우지 않아요 (11/25)
        webView?.configuration.userContentController.add(self, name: "lumenibPinch")
        // Apple로 로그인: 이 통로가 있으면 웹이 Apple 버튼을 보여 주고, 누르면 iPad 기본 Apple 로그인 창을 띄워요 (11/26)
        webView?.configuration.userContentController.add(self, name: "lumenibApple")
        // 구글 로그인: 구글은 앱 안 웹화면 로그인을 막아서, 시스템 로그인 창(ASWebAuthenticationSession)으로 열어요 (11/26)
        webView?.configuration.userContentController.add(self, name: "lumenibOAuth")
        // 카메라 권한 문구가 들어간 빌드라는 표시 (웹은 이게 있을 때만 "사진 찍기"를 보여 줘요, 11/26)
        webView?.configuration.userContentController.add(self, name: "lumenibCamera")
        // 위 탭 바·설정 버튼을 앱이 그려요 (iPad 기본 유리 모양). 웹은 이 통로가 있으면 자기 탭 바를 숨겨요 (11/26)
        webView?.configuration.userContentController.add(self, name: "lumenibTopBar")
        webView?.configuration.userContentController.add(self, name: "lumenibTopIcons") // 노트 쓰기 · 검색 버튼도 앱이 그려요 (47~)
        webView?.configuration.userContentController.add(self, name: "lumenibGlass") // 노트 쓰기 · 본문 고르기 위 버튼(뒤로 · 사이드바 · 완료 · 〈 홈)도 유리로 (48~)
        webView?.configuration.userContentController.add(self, name: "lumenibSearchField") // 검색 줄 글자 칸도 앱이 (49~)
        webView?.configuration.userContentController.add(self, name: "lumenibMenu") // 웹 단추에 iPad 기본 메뉴 · 사진 고르기도 iPad 기본 창 (50~)
        webView?.configuration.userContentController.add(self, name: "lumenibMenuButton") // 메뉴 단추 자체를 앱이 그려요 (55~)
        // 설정 화면에 보이는 버전: 앱이 실제 버전·빌드 번호를 알려줘요 (예전엔 웹에 1.0 (40)으로 고정, 56~)
        let ver = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0") + " (" + (Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "") + ")"
        webView?.configuration.userContentController.addUserScript(WKUserScript(source: "window.__lumenibVersion = '\(ver)'; window.__lumenibDim = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView?.evaluateJavaScript("window.__lumenibVersion = '\(ver)'; window.__lumenibDim = true;", completionHandler: nil)
        if let web = webView {
            topBar.frame = web.bounds
            topBar.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            topBar.onDimTap = { [weak self] in self?.js("window.lumenibDimTap && window.lumenibDimTap()") }
            topBar.onTap = { [weak self] act in self?.js("window.lumenibTopBar && window.lumenibTopBar('\(act)')") }
            topBar.onMenu = { [weak self] id in self?.menuPicked(id) }
            topBar.snapSource = web
            topBar.onMenuShown = { [weak self] act, open in self?.js("window.lumenibMenuShown && window.lumenibMenuShown('\(act)', \(open))") }
            topBar.onSearch = { [weak self] text, submit in
                guard let data = try? JSONSerialization.data(withJSONObject: [text]), let arr = String(data: data, encoding: .utf8) else { return }
                self?.js("window.lumenibSearchInput && window.lumenibSearchInput(\(arr)[0], \(submit))")
            }
            web.addSubview(topBar)
        }
        applyTheme(UserDefaults.standard.string(forKey: "themeMode") ?? "system") // 예전 "theme"(다크 기본) 값은 안 써요 (11/26)
        setupInk()
        // 앱처럼: 화면 전체가 끌리거나 튕기지 않게 (노트 종이 안의 스크롤은 그대로 돼요)
        // (isScrollEnabled = false 는 쓰면 안 돼요: 웹 안 스크롤 영역(노트 종이·성경 목록)과 확대까지 같이 멈춰요)
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
    }

    let topBar = NativeTopBar()

    // MARK: 노트 글씨 판 (다 쓴 글씨도 앱이 그려요, 11/24)
    private let noteInk = NoteInkView()
    private var noteInkOn = false
    /// 웹 종이 스크롤(화면 좌표 area)과 같은 자리의 스크롤 뷰를 찾아 글씨 판을 붙여요. 종이와 같이 스크롤돼요
    private var noteArea: CGRect = .zero
    private let pinchHost: UIView = { let v = UIView(); v.clipsToBounds = true; v.isUserInteractionEnabled = false; v.backgroundColor = .clear; return v }()
    private var pinchLifted = false
    // 확대하는 동안: 종이 칸을 사진 한 장으로 찍어(글씨 포함) 그 사진만 앱이 움직여요.
    // 웹 종이와 앱 글씨를 따로 움직이면 웹 화면이 한두 번 늦게 바뀌어 글씨가 딱 맞게 따라오지 않았어요 (11/24)
    private let pinchContent: UIView = { let v = UIView(); v.layer.anchorPoint = .zero; v.isUserInteractionEnabled = false; return v }()
    private var pinchSnap: UIView?
    private var pinchOff: CGPoint = .zero
    private var paperBg: UIColor = .white
    // 인용구를 끄는 동안에도 종이 스크롤 안 글씨 판이 안 보였어요(32에서도). 확대 때처럼 끄는 동안만 웹 위에 띄워 두고,
    // 끌면서 종이가 저절로 스크롤되면 글씨 판도 같이 옮겨요 (11/25)
    private var dragLand: DispatchWorkItem?
    private var dragOffObs: NSKeyValueObservation?
    private func liftForDrag() {
        dragLand?.cancel(); dragLand = nil
        guard !pinchLifted else { return }
        liftNoteInkForPinch(snapshot: false)
        guard pinchLifted, let sv = landScroll else { return }
        dragOffObs = sv.observe(\.contentOffset, options: [.new]) { [weak self] sv, _ in
            guard let self, self.pinchLifted, self.noteInk.superview === self.pinchContent else { return }
            CATransaction.begin(); CATransaction.setDisableActions(true)
            self.noteInk.frame.origin = CGPoint(x: -sv.contentOffset.x, y: -sv.contentOffset.y)
            CATransaction.commit()
        }
    }
    private func landAfterDrag() {
        dragLand?.cancel()
        guard pinchLifted else { return }
        // 놓은 뒤 웹이 다시 그린 화면이 올라올 때까지 아주 잠깐 띄운 채로 두었다가 붙여요
        let w = DispatchWorkItem { [weak self] in self?.dragOffObs = nil; self?.landNoteInk() }
        dragLand = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15, execute: w)
    }
    private func liftNoteInkForPinch(snapshot: Bool = true) {
        guard !pinchLifted, let web = webView, let sv = noteInk.superview as? UIScrollView else { return }
        landScroll = sv
        let f = sv.convert(sv.bounds, to: web)
        pinchOff = sv.contentOffset
        CATransaction.begin(); CATransaction.setDisableActions(true)
        pinchHost.frame = f
        pinchHost.backgroundColor = .clear
        if pinchHost.superview !== web { web.addSubview(pinchHost) }
        web.bringSubviewToFront(pinchHost)
        pinchHost.isHidden = false // 글씨 판을 옮기는 같은 순간에 보이게 (한 번 글씨가 다 사라져 보이던 것)
        if pinchContent.superview !== pinchHost { pinchHost.addSubview(pinchContent) }
        pinchContent.layer.transform = CATransform3DIdentity
        pinchContent.frame = pinchHost.bounds
        // 글씨 판을 띄워서 같이 움직이게 (사진 밖으로 새로 드러나는 장의 글씨용)
        let size = noteInk.frame.size
        noteInk.removeFromSuperview()
        pinchContent.addSubview(noteInk)
        noteInk.frame = CGRect(origin: CGPoint(x: -pinchOff.x, y: -pinchOff.y), size: size)
        // 지금 보이는 종이(장) 부분만 사진으로 찍어 글씨 판 위에 얹어요. 패널 테두리·모서리는 안 찍어서 그대로 있어요 (11/25)
        // 글씨 판을 종이 스크롤에서 뺀 다음에 찍어서 사진엔 웹 종이만 담기고, 글씨는 사진 위 글씨 판이 보여 줘요
        // (29: 사진을 찍은 뒤 글씨 판을 숨겼더니 사진에 글씨가 안 담겨 확대 중 글씨가 사라졌어요)
        pinchSnap?.removeFromSuperview(); pinchSnap = nil
        let vis = sv.bounds.intersection(noteInk.pagesBox)
        // snapshotView는 고정된 사진이 아니라 웹 화면을 실시간으로 비추는 거울이었어요. 웹이 따로 확대한 것까지 비쳐 인용구가 덜 따라왔어요 (11/25).
        // 지금 화면을 진짜 그림(비트맵)으로 한 번 그려 써요
        if snapshot, !vis.isNull, vis.width > 1, vis.height > 1 {
            // 글씨 판을 뺀 지금 모습을 화면에 먼저 반영한 뒤(afterScreenUpdates: true) 그려요.
            // false면 직전 화면(글씨 판이 아직 종이 안에 있던)을 찍어, 사진 속 글씨 + 띄운 글씨 판이 겹쳐 형광펜이 진해졌어요 (11/25 영상)
            CATransaction.commit(); CATransaction.flush()
            CATransaction.begin(); CATransaction.setDisableActions(true)
            let fmt = UIGraphicsImageRendererFormat.preferred()
            fmt.opaque = false
            let img = UIGraphicsImageRenderer(size: vis.size, format: fmt).image { _ in
                sv.drawHierarchy(in: CGRect(x: sv.bounds.minX - vis.minX, y: sv.bounds.minY - vis.minY, width: sv.bounds.width, height: sv.bounds.height), afterScreenUpdates: true)
            }
            let iv = UIImageView(image: img)
            iv.frame = vis.offsetBy(dx: -pinchOff.x, dy: -pinchOff.y) // 사진 자리 (pinchHost 좌표)
            pinchContent.insertSubview(iv, belowSubview: noteInk); pinchSnap = iv
        }
        pinchHost.isHidden = false
        CATransaction.commit()
        pinchLifted = true
    }
    /// t: [기준x, 기준y, 이동x, 이동y, 배율] (종이 스크롤 안쪽 좌표)
    private func pinchMove(_ t: [Double]) {
        guard t.count == 5 else { return }
        let ox = CGFloat(t[0]) - pinchOff.x, oy = CGFloat(t[1]) - pinchOff.y, z = CGFloat(t[4])
        let m = CGAffineTransform(translationX: ox + CGFloat(t[2]), y: oy + CGFloat(t[3])).scaledBy(x: z, y: z).translatedBy(x: -ox, y: -oy)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        pinchContent.layer.transform = CATransform3DMakeAffineTransform(m)
        CATransaction.commit()
    }
    private func dropPinchSnap() {
        pinchSnap?.removeFromSuperview(); pinchSnap = nil
        pinchContent.layer.transform = CATransform3DIdentity
    }
    private func landNoteInk() {
        guard pinchLifted else { return }
        pinchLifted = false
        dropPinchSnap()
        attachNoteInk(area: noteArea.isEmpty ? inkConfig.area : noteArea)
        pinchHost.isHidden = true
    }
    /// 확대할 때 사진이 줄어 드러나는 칸을 종이 칸 배경색으로 채워요
    private func readPaperBg() {
        webView?.evaluateJavaScript("(()=>{const e=document.querySelector('.right-panel.note')||document.body;return getComputedStyle(e).backgroundColor})()") { [weak self] r, _ in
            guard let s = r as? String else { return }
            let n = s.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).compactMap { Double($0) }
            guard n.count >= 3 else { return }
            let a = n.count >= 4 ? n[3] : 1
            if a < 0.5 { return }
            self?.paperBg = UIColor(red: n[0] / 255, green: n[1] / 255, blue: n[2] / 255, alpha: 1)
        }
    }
    /// 웹킷은 종이 스크롤의 층 목록을 통째로 새로 끼울 때가 있어요(확대·인용 끌기처럼 웹 층이 새로 생길 때).
    /// 그때 앱 글씨 판 층이 목록에서 빠져 글씨가 안 보였어요 (11/25). 빠지는 그 순간 바로 다시 끼워요
    private var inkLayerObs: NSKeyValueObservation?
    private weak var inkLayerHost: UIScrollView?
    private func watchInkLayer(_ sv: UIScrollView) {
        if inkLayerHost === sv, inkLayerObs != nil { return }
        inkLayerHost = sv
        inkLayerObs = sv.layer.observe(\.sublayers, options: []) { [weak self] _, _ in
            guard let self, self.noteInkOn, !self.pinchLifted, let host = self.inkLayerHost, self.noteInk.superview === host else { return }
            if self.noteInk.layer.superlayer !== host.layer || host.layer.sublayers?.last !== self.noteInk.layer {
                DispatchQueue.main.async { [weak self] in self?.reinsertInk() } // 웹킷이 바꾸는 도중엔 건드리지 않고 바로 다음에
                self.reinsertInk()
            }
        }
    }
    private func reinsertInk() {
        guard let host = inkLayerHost, noteInk.superview === host, !pinchLifted else { return }
        if noteInk.layer.superlayer === host.layer && host.layer.sublayers?.last === noteInk.layer { return }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        if noteInk.layer.superlayer !== host.layer { noteInk.removeFromSuperview(); host.addSubview(noteInk) }
        else { host.bringSubviewToFront(noteInk) }
        CATransaction.commit()
    }
    private func attachNoteInk(area: CGRect) {
        guard let web = webView, !area.isEmpty else { return }
        noteArea = area
        var best: UIScrollView?
        func walk(_ v: UIView) {
            if let sv = v as? UIScrollView, sv !== web.scrollView, best == nil {
                let f = sv.convert(sv.bounds, to: web)
                if abs(f.minX - area.minX) < 24 && abs(f.minY - area.minY) < 24 && abs(f.width - area.width) < 48 && abs(f.height - area.height) < 48 { best = sv }
            }
            if best == nil { v.subviews.forEach(walk) }
        }
        walk(web.scrollView)
        guard let sv = best else { return }
        if noteInk.superview !== sv || noteInk.layer.superlayer !== sv.layer { noteInk.removeFromSuperview(); sv.addSubview(noteInk) }
        watchInkLayer(sv)
        let size = CGSize(width: max(sv.contentSize.width, sv.bounds.width) + 2000, height: max(sv.contentSize.height, sv.bounds.height) + 4000)
        noteInk.frame = CGRect(origin: .zero, size: size)
        sv.bringSubviewToFront(noteInk)
        noteInkOn = true
        // 판을 붙이기 전에 받은 버튼 자리도 바로 비워요 (노트를 막 열었을 때 버튼 위로 글씨가 겹쳐 보이던 것)
        noteInk.setUIHoles(inkConfig.ui.map { (noteInk.convert($0.0, from: web), $0.1) })
    }
    // 손을 뗀 뒤: 웹이 새 배율로 종이를 다시 깔고 스크롤 자리를 옮기는 건 웹 화면이 실제로 바뀌는 순간(조금 뒤)에 보여요.
    // 앱이 먼저 바꾸면 한 번 깜빡이고, 축소 땐 글씨가 종이 밖에 잠깐 보였어요 (11/24).
    // 그래서 그 사이 온 소식은 모아 두었다가, 종이 스크롤의 크기·자리가 실제로 바뀌는 그 순간에 한꺼번에 반영해요
    private var landing = false
    private var landQueue: [[String: Any]] = []
    private var landObs: [NSKeyValueObservation] = []
    private var landTimer: DispatchWorkItem?
    private weak var landScroll: UIScrollView?
    private weak var zoomingSV: UIScrollView?
    private func beginLanding() {
        landing = true; landQueue = []
        landObs = []
        if let sv = landScroll {
            landObs = [sv.observe(\.contentSize, options: [.new, .old]) { [weak self] _, c in if c.newValue != c.oldValue { self?.finishLanding() } },
                       sv.observe(\.contentOffset, options: [.new, .old]) { [weak self] _, c in if c.newValue != c.oldValue { self?.finishLanding() } }]
        }
        landTimer?.cancel()
        let w = DispatchWorkItem { [weak self] in self?.finishLanding() } // 배율이 그대로라 바뀔 게 없을 때
        landTimer = w
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: w)
    }
    private func finishLanding() {
        guard landing else { return }
        landing = false
        landTimer?.cancel(); landTimer = nil
        let obs = landObs; landObs = []
        DispatchQueue.main.async { obs.forEach { $0.invalidate() } }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        noteInk.resetPinch()
        zoomingSV?.layer.sublayerTransform = CATransform3DIdentity; zoomingSV = nil
        let q = landQueue; landQueue = []
        for m in q { noteCanvasMessage(m) }
        landNoteInk()
        CATransaction.commit()
    }
    // 끄는 인용 상자·손잡이의 웹킷 층 (자리로 찾아요)
    private struct WeakLayer { weak var layer: CALayer? }
    private var carryRects: [CGRect] = []
    private var carryLayers: [WeakLayer] = []
    private var carryTries = 0
    private func findCarryLayers() {
        guard let sv = noteInk.superview as? UIScrollView ?? landScroll ?? inkLayerHost else { return }
        var found: [WeakLayer] = []
        for target in carryRects {
            // 그림자 때문에 층이 상자보다 조금 클 수 있어요: 상자를 품는 것 중 가장 작은 층
            var best: CALayer?, bestArea = CGFloat.infinity
            func walk(_ l: CALayer) {
                if l === noteInk.layer || l === pinchHost.layer { return }
                let r = l.convert(l.bounds, to: sv.layer)
                if r.insetBy(dx: -2, dy: -2).contains(target), r.width < target.width + 90, r.height < target.height + 90, l !== sv.layer {
                    let a = r.width * r.height
                    if a < bestArea { bestArea = a; best = l }
                }
                l.sublayers?.forEach(walk)
            }
            sv.layer.sublayers?.forEach(walk)
            if let b = best { found.append(WeakLayer(layer: b)) }
        }
        if found.count == carryRects.count { carryLayers = found }
    }
    private func noteCanvasMessage(_ b: [String: Any]) {
        let action = b["action"] as? String ?? ""
        if landing && action != "notePinch" && action != "noteClear" {
            landQueue.append(b)
            // 배율이 그대로면(예: 1배에서 더 줄이려 할 때) 종이 크기·스크롤이 안 바뀌어 기다릴 신호가 없어요.
            // 웹은 손 뗀 뒤 한두 화면 갱신 안에 원래 자리로 돌아가니 그만큼만 기다렸다 같이 돌아가요 (종이 밖에 글씨가 잠깐 남던 것, 11/24 영상)
            if action == "noteLayout", let sc = (b["scale"] as? NSNumber)?.doubleValue, abs(CGFloat(sc) - noteInk.scale) < 0.0001 {
                landTimer?.cancel()
                let w = DispatchWorkItem { [weak self] in self?.finishLanding() }
                landTimer = w
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.035, execute: w)
            }
            return
        }
        func rect(_ a: Any?) -> CGRect? {
            guard let a = a as? [Any], a.count >= 4 else { return nil }
            let v = a.map { ($0 as? NSNumber)?.doubleValue ?? 0 }
            return CGRect(x: v[0], y: v[1], width: v[2], height: v[3])
        }
        switch action {
        case "noteLayout":
            CATransaction.begin(); CATransaction.setDisableActions(true)
            if dragOffObs != nil, let area = rect(b["area"]) {
                // 인용을 끄는 중(다른 장으로 넘어가며 장이 늘어날 때 등): 띄운 채로 자리만 맞춰요
                noteArea = area
            } else {
                dropPinchSnap()
                pinchLifted = false
                if let area = rect(b["area"]) { attachNoteInk(area: area) }
                pinchHost.isHidden = true
            }
            CATransaction.commit()
            readPaperBg()
            let pages: [(Int, CGRect)] = (b["pages"] as? [[Any]] ?? []).compactMap { a in
                guard a.count >= 5, let i = (a[0] as? NSNumber)?.intValue, let r = rect(Array(a[1...])) else { return nil }
                return (i, r)
            }
            noteInk.layout(pages: pages, scale: CGFloat((b["scale"] as? NSNumber)?.doubleValue ?? 1))
        case "notePage":
            guard let i = (b["i"] as? NSNumber)?.intValue, let r = rect(b["rect"]) else { return }
            if noteInk.superview == nil, inkConfig.enabled { attachNoteInk(area: inkConfig.area) }
            let ids = (b["ids"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.intValue }
            let add = b["add"] as? [String: Any] ?? [:]
            // 방금 뗀 획이 판에 들어오면, 같은 화면 갱신 안에서 임시 획을 지워요 (둘이 겹쳐 잠깐 굵어 보이던 것)
            CATransaction.begin(); CATransaction.setDisableActions(true)
            // 방금 뗀 획이면 쓰는 동안 그린 그림 자체를 판으로 옮겨요 (교체 없음)
            let adopt = add.count == 1 && inkOverlay.hasPending ? inkOverlay.takeOldestPending() : nil
            var clip: [Int: [CGRect]] = [:]
            for (k, v) in b["clip"] as? [String: Any] ?? [:] {
                guard let id = Int(k), let arr = v as? [[Any]] else { continue }
                clip[id] = arr.compactMap { a in
                    let n = a.compactMap { ($0 as? NSNumber)?.doubleValue }
                    return n.count == 4 ? CGRect(x: n[0], y: n[1], width: n[2] - n[0], height: n[3] - n[1]) : nil
                }
            }
            noteInk.apply(page: i, ids: ids, add: add, rect: r, scale: CGFloat((b["scale"] as? NSNumber)?.doubleValue ?? 1), clip: clip, adopt: adopt, adoptFrom: inkOverlay)
            if adopt == nil && !add.isEmpty && inkOverlay.hasPending { inkOverlay.handOffOldest() }
            CATransaction.commit()
        case "noteHole":
            if !pinchLifted, noteInkOn, noteInk.window == nil || noteInk.layer.superlayer == nil { attachNoteInk(area: noteArea.isEmpty ? inkConfig.area : noteArea) } // 끄는 동안 종이 스크롤이 바뀌었으면 다시 붙여요
            guard let i = (b["i"] as? NSNumber)?.intValue else { noteInk.hole(page: -1, box: nil); landAfterDrag(); return }
            if noteInkOn { liftForDrag() }
            let n = (b["box"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue }
            noteInk.hole(page: i, box: n?.count == 4 ? CGRect(x: n![0], y: n![1], width: n![2] - n![0], height: n![3] - n![1]) : nil)
        case "noteCarry":
            let ids = (b["ids"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.intValue }
            if let i = (b["i"] as? NSNumber)?.intValue { noteInk.carryBegin(page: i, ids: ids) }
            carryRects = (b["rects"] as? [Any] ?? []).compactMap { rect($0) }
            carryLayers = []; carryTries = 0
        case "noteCarryMove":
            CATransaction.begin(); CATransaction.setDisableActions(true)
            noteInk.carryMove((b["t"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? [])
            // 인용 상자·손잡이 층도 같은 순간에 같은 만큼 옮겨요. 웹이 나중에 같은 값을 다시 넣어요 (웹만 기다리면 글씨보다 한두 화면 늦었어요, 11/25)
            if let pd = (b["p"] as? [Any])?.compactMap({ ($0 as? NSNumber)?.doubleValue }), pd.count == 2 {
                if carryLayers.count < carryRects.count, carryTries < 12 { carryTries += 1; findCarryLayers() } // 웹킷이 층을 만든 뒤에 찾혀요
                for l in carryLayers { l.layer?.transform = CATransform3DMakeTranslation(CGFloat(pd[0]), CGFloat(pd[1]), 0) }
            } else { carryRects = []; carryLayers = [] }
            CATransaction.commit()
        case "noteCarryEnd":
            noteInk.carryEnd(); carryRects = []; carryLayers = []
        case "notePinch":
            let t = (b["t"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue }
            if ((b["sv"] as? NSNumber)?.intValue ?? 0) == 1 {
                // 종이 스크롤 층 전체(웹 종이·인용·본문 + 앱 글씨 판)를 한 변환으로: 같은 순간에 같이 움직여서 어긋나거나 늦을 수 없어요
                if let t = t, t.count == 5 {
                    if landing { finishLanding() }
                    guard let sv = noteInk.superview as? UIScrollView else { return }
                    landScroll = sv; zoomingSV = sv
                    let a = CGPoint(x: sv.layer.bounds.midX, y: sv.layer.bounds.midY) // 층 변환의 기준점(가운데)
                    let z = CGFloat(t[4]), ox = CGFloat(t[0]), oy = CGFloat(t[1])
                    let m = CGAffineTransform(translationX: (1 - z) * (ox - a.x) + CGFloat(t[2]), y: (1 - z) * (oy - a.y) + CGFloat(t[3])).scaledBy(x: z, y: z)
                    CATransaction.begin(); CATransaction.setDisableActions(true)
                    sv.layer.sublayerTransform = CATransform3DMakeAffineTransform(m)
                    CATransaction.commit()
                } else { beginLanding() }
                return
            }
            if let t = t {
                if landing { finishLanding() }
                dragLand?.cancel(); dragLand = nil; dragOffObs = nil
                liftNoteInkForPinch()
                pinchMove(t)
            } else { beginLanding() } // 앱 글씨는 손 뗀 순간 모습 그대로 두었다가 웹과 같이 바꿔요
        case "noteClear":
            landing = false; landQueue = []; landObs = []; landTimer?.cancel()
            dropPinchSnap()
            inkLayerObs = nil; inkLayerHost = nil; dragOffObs = nil; dragLand?.cancel(); dragLand = nil
            noteInk.clearAll(); noteInk.removeFromSuperview(); noteInkOn = false; pinchLifted = false; pinchHost.isHidden = true
        default: break
        }
    }

    // MARK: 필기만 네이티브 (웹 노트 위에서 애플펜슬 펜·형광펜)
    private let inkOverlay = WebInkOverlay()
    // 펜을 떼지 않고 멈추면 웹의 도형 인식으로 도형 점을 받아 와요
    private func handleHold(_ pts: [SIMD3<Double>]) {
        let flat = pts.flatMap { [($0.x * 10).rounded() / 10, ($0.y * 10).rounded() / 10, ($0.z * 100).rounded() / 100] }
        guard let data = try? JSONSerialization.data(withJSONObject: flat), let json = String(data: data, encoding: .utf8) else { return }
        let scale = Double(inkConfig.scale)
        webView?.evaluateJavaScript("JSON.stringify(window.lumenibSnap ? window.lumenibSnap(\(json), \(scale)) : null)") { [weak self] r, _ in
            guard let self, let str = r as? String, let d = str.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
                  let arr = obj["pts"] as? [Double], arr.count >= 6 else { return }
            var list: [SIMD3<Double>] = []
            var i = 0
            while i + 2 < arr.count { list.append(SIMD3(arr[i], arr[i + 1], arr[i + 2])); i += 3 }
            var open: [CGPoint]? = nil
            if (obj["kind"] as? String) == "open", let v = obj["verts"] as? [Double], v.count >= 4 {
                open = stride(from: 0, to: v.count - 1, by: 2).map { CGPoint(x: v[$0], y: v[$0 + 1]) }
            }
            self.inkOverlay.applyShape(line: (obj["line"] as? Bool) ?? false, open: open, merge: (obj["merge"] as? Double) ?? 14, rot: (obj["rot"] as? Double) ?? 0, list)
        }
    }
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
    // 맨 위 제목줄(툴바·뒤로·완료)만: 종이·성경 목록 위의 펜슬은 건드리지 않아요
    func isTopBar(_ p: CGPoint) -> Bool { inkConfig.area.isEmpty ? p.y < 100 : p.y < inkConfig.area.minY - 4 }
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
                // 종이 스크롤은 손가락으로만 움직여요. 확대한 상태에서 펜슬로 쓰면 종이가 같이 끌려가던 것 (11/23)
                // (제스처를 끄면 웹킷이 펜슬 탭을 붙잡아서 안 되고, 펜슬만 빼 두는 건 괜찮아요)
                sv.panGestureRecognizer.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.direct.rawValue)]
            }
            v = cur.superview
        }
    }
    private var inkLastPoint: SIMD3<Double>?
    func inkBegin(_ p: SIMD3<Double>) {
        stopScrolling(at: CGPoint(x: p.x, y: p.y))
        relaying = inkConfig.relay
        inkLastPoint = p
        erasing = relaying && inkConfig.eraser && noteInk.superview != nil
        if erasing { noteInk.eraseBegin(); eraseNative(p) }
        lassoing = relaying && noteInk.superview != nil && inkConfig.startsNewLasso(CGPoint(x: p.x, y: p.y))
        if lassoing, let web = webView { noteInk.lassoBegin(noteInk.convert(CGPoint(x: p.x, y: p.y), from: web)) }
        if relaying { relay("down", [p]) } else { inkOverlay.begin(p) }
    }
    func inkMove(_ pts: [SIMD3<Double>], _ pred: [SIMD3<Double>]) {
        holdScrolls()
        if let l = pts.last { inkLastPoint = l }
        if erasing { pts.forEach(eraseNative) }
        if lassoing, let web = webView { noteInk.lassoAdd(pts.map { noteInk.convert(CGPoint(x: $0.x, y: $0.y), from: web) }) }
        if relaying { relay("move", pts) } else { inkOverlay.add(pts, predicted: pred) }
    }
    private var erasing = false
    private var lassoing = false
    private func eraseNative(_ p: SIMD3<Double>) {
        guard let web = webView else { return }
        let q = noteInk.convert(CGPoint(x: p.x, y: p.y), from: web)
        noteInk.erase(at: q, r: inkConfig.eraserR, whole: inkConfig.eraserWhole)
    }
    func inkCancel() { unlockScrolls(); if erasing { erasing = false; noteInk.eraseEnd() }; if lassoing { lassoing = false; noteInk.lassoEnd(after: 0) }; if relaying { relay("cancel", []) } else { inkOverlay.clear() } }
    // 지우개·올가미 펜슬 움직임을 웹에 넘기기.
    // 움직일 때마다 바로 보내면 웹이 처리하기 전에 계속 쌓여서, 펜을 뗀 뒤에도 한동안 밀린 걸 처리하느라 화면이 멈추고
    // 툴바 누름도 늦게 먹혔어요. 이제 앞의 묶음을 웹이 다 처리한 뒤에 그동안 모인 움직임을 한 번에 보내요
    private var relayInFlight = false
    private var relayPending: [SIMD3<Double>] = []
    private func relayJS(_ type: String, _ pts: [SIMD3<Double>]) -> String {
        let arr = pts.map { "[\(($0.x * 10).rounded() / 10),\(($0.y * 10).rounded() / 10),\(($0.z * 100).rounded() / 100)]" }.joined(separator: ",")
        let ring = type == "up" ? "" : "window.__nativeEraser=\(erasing ? 1 : 0);window.__nativeLasso=\(lassoing ? 1 : 0);" // 앱이 지우개 동그라미·올가미 선을 그리면 웹은 안 그려요
        return ring + "window.lumenibPointer && window.lumenibPointer('\(type)', [\(arr)]);"
    }
    private func pumpRelay() {
        guard !relayInFlight, !relayPending.isEmpty, let web = webView else { return }
        let pts = relayPending; relayPending = []
        relayInFlight = true
        web.evaluateJavaScript(relayJS("move", pts)) { [weak self] _, _ in self?.relayInFlight = false; self?.pumpRelay() }
    }
    private func relay(_ type: String, _ pts: [SIMD3<Double>]) {
        if type == "move" { relayPending += pts; pumpRelay(); return }
        // 시작·끝은 바로 보내요 (쌓여 있던 움직임을 먼저 붙여서 순서를 지켜요)
        var js = ""
        if !relayPending.isEmpty { js += relayJS("move", relayPending); relayPending = [] }
        js += relayJS(type, pts)
        webView?.evaluateJavaScript(js, completionHandler: nil)
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
        inkOverlay.onHold = { [weak self] pts in self?.handleHold(pts) }
    }

    func inkEnd() {
        unlockScrolls()
        if erasing { erasing = false; noteInk.eraseEnd() }
        if lassoing { lassoing = false; noteInk.lassoEnd() }
        if relaying { relay("up", [inkLastPoint ?? SIMD3(0, 0, 0.5)]); relaying = false; return }
        do {
            let q: Double = inkOverlay.shaped ? 100 : 10 // 도형(원)은 더 촘촘하게 (확대 시 지글거림)
            let pts = inkOverlay.pts.map { [($0.x * q).rounded() / q, ($0.y * q).rounded() / q, ($0.z * 100).rounded() / 100] }
            guard let data = try? JSONSerialization.data(withJSONObject: pts), let json = String(data: data, encoding: .utf8) else { inkOverlay.clear(); return }
            // 웹이 노트에 넣어 다시 그린 다음에 지워서 깜빡이지 않게
            let shaped = inkOverlay.shaped
            let kept = inkOverlay.commit()
            webView?.evaluateJavaScript("window.lumenibInk && window.lumenibInk(\(json), {shape: \(shaped)})") { [weak self] r, _ in
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
    // 웹 창 안의 슬라이더 자리에 띄우는 진짜 iPad 슬라이더. 한 창에 여러 개(형광펜 투명도·손떨림 보정)라 id별로 둬요 (11/23)
    private var webSliders: [String: (slider: UISlider, step: Double)] = [:]
    private func showWebSlider(_ b: [String: Any]) {
        guard let web = webView else { return }
        let r = anchorRect(b), id = b["id"] as? String ?? ""
        let sl = webSliders[id]?.slider ?? UISlider()
        sl.minimumValue = Float(b["min"] as? Double ?? 0); sl.maximumValue = Float(b["max"] as? Double ?? 100)
        sl.value = Float(b["value"] as? Double ?? 0)
        sl.tintColor = .lumenTextPrimary
        sl.overrideUserInterfaceStyle = .light // '더 보기' 계열 창은 늘 흰 바탕
        sl.frame = CGRect(x: r.minX, y: r.midY - 15, width: r.width, height: 30)
        sl.accessibilityIdentifier = id
        if webSliders[id] == nil {
            sl.addTarget(self, action: #selector(webSliderChanged(_:)), for: .valueChanged)
            sl.addTarget(self, action: #selector(webSliderDone(_:)), for: [.touchUpInside, .touchUpOutside, .touchCancel])
            web.addSubview(sl)
        }
        webSliders[id] = (sl, b["step"] as? Double ?? 1)
    }
    private func removeWebSlider(_ id: String?) {
        if let id = id, !id.isEmpty { webSliders[id]?.slider.removeFromSuperview(); webSliders[id] = nil; return }
        for (_, v) in webSliders { v.slider.removeFromSuperview() }
        webSliders = [:]
    }
    private func webSliderValue(_ s: UISlider) -> Double { let st = webSliders[s.accessibilityIdentifier ?? ""]?.step ?? 1; return (Double(s.value) / st).rounded() * st }
    @objc private func webSliderChanged(_ s: UISlider) { js("window.lumenibSlider && window.lumenibSlider('\(s.accessibilityIdentifier ?? "")', \(webSliderValue(s)), false)") }
    @objc private func webSliderDone(_ s: UISlider) { js("window.lumenibSlider && window.lumenibSlider('\(s.accessibilityIdentifier ?? "")', \(webSliderValue(s)), true)") }

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
    // 화면 모드: "system"(기본, iPad 설정 따름) · "light" · "dark" (11/26)
    // system이면 앱이 모드를 덮어쓰지 않아서 웹의 prefers-color-scheme가 iPad 설정을 그대로 따라가요
    private func applyTheme(_ t: String?) {
        let style: UIUserInterfaceStyle = t == "light" ? .light : t == "dark" ? .dark : .unspecified
        overrideUserInterfaceStyle = style
        view.window?.overrideUserInterfaceStyle = style
        updateThemeBackground()
    }
    private func updateThemeBackground() {
        let light = traitCollection.userInterfaceStyle != .dark
        let bg = light ? UIColor(red: 0xF7 / 255.0, green: 0xF7 / 255.0, blue: 0xF7 / 255.0, alpha: 1) : .black
        view.backgroundColor = bg
        webView?.backgroundColor = bg
        webView?.scrollView.backgroundColor = bg
        webView?.isOpaque = false
    }
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        updateThemeBackground()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if message.name == "lumenibCanvas" { noteCanvasMessage(body); return }
        if action == "appleSignIn" { startAppleSignIn(); return }
        if action == "oauth", let s = body["url"] as? String, let u = URL(string: s) { startWebAuth(u, scheme: (body["scheme"] as? String) ?? "lumenib"); return }
        if action == "topBar" {
            topBar.update(body); if let web = webView { web.bringSubviewToFront(topBar) }
            // 페이지를 새로 불러오면 --win-left가 지워져서, 위 줄 소식이 올 때 다시 넣어 줘요 (59~)
            if winLeft > 0, (body["winLeft"] as? NSNumber)?.doubleValue != Double(Int(winLeft.rounded())) { js("document.documentElement.style.setProperty('--win-left', '\(Int(winLeft.rounded()))px'); window.lumenibWinInset && window.lumenibWinInset()") }
            return
        }
        if action == "keepAwake" { UIApplication.shared.isIdleTimerDisabled = (body["value"] as? Bool) ?? false; return } // 노트 쓰는 동안 화면 켜 두기 (설정, 11/26)
        if action == "penSettings" { presentPenSettings(body); return }
        if action == "sizeSlider" { presentSizeSlider(body); return }
        if action == "slider" { showWebSlider(body); return }
        if action == "sliderRemove" { removeWebSlider(body["id"] as? String); return }
        if action == "inkDrawn" { inkOverlay.dropOldestPending(immediately: noteInkOn); return } // 글씨 판이 있으면 같은 그림이라 바로 바꿔요 (겹쳐 진해지지 않게)
        if action == "inkConfig" {
            let c = WebInkConfig(body)
            inkConfig = c
            inkOverlay.config = c
            if noteInk.superview != nil, let web = webView { noteInk.setUIHoles(c.ui.map { (noteInk.convert($0.0, from: web), $0.1) }) }
            return
        }
        if action == "theme", let t = body["value"] as? String {
            let mode = (body["mode"] as? String) ?? t // 새 웹은 mode(system/light/dark)를 같이 보내요
            UserDefaults.standard.set(mode, forKey: "themeMode")
            applyTheme(mode)
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
    private var tap: (touch: UITouch, at: CGPoint, time: TimeInterval)?

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
            } else if pencil.phase == .began, tracked == nil, b.isTopBar(pencil.location(in: web)), web.hitTest(pencil.location(in: web), with: nil)?.isDescendant(of: web.scrollView) == true {
                // (앱이 얹은 창·슬라이더 위를 누른 건 제외)
                // 종이 밖(툴바 등)을 펜슬로 톡 누른 것: 웹킷이 가끔 이 탭을 웹에 안 넘기거나 늦게 넘겨서(올가미 직후 등),
                // 닿는 순간 앱이 직접 알려요. 툴바 도구·색·굵기는 이걸로 바로 바뀌고, 나머지는 뗄 때 웹이 못 받았으면 대신 눌러요
                let at = pencil.location(in: web)
                tap = (pencil, at, event.timestamp)
                web.evaluateJavaScript("window.lumenibTap && window.lumenibTap(\(at.x), \(at.y), 'down')", completionHandler: nil)
            } else if let t = tap, t.touch === pencil, pencil.phase == .ended {
                let p = pencil.location(in: web)
                tap = nil
                if hypot(p.x - t.at.x, p.y - t.at.y) < 12, event.timestamp - t.time < 0.5 {
                    // 웹이 이미 받았으면 웹 쪽에서 무시해요 (window.lumenibTap)
                    web.evaluateJavaScript("window.lumenibTap && window.lumenibTap(\(t.at.x), \(t.at.y), 'up')", completionHandler: nil)
                }
            } else if let t = tap, t.touch === pencil, pencil.phase == .cancelled { tap = nil }
        }
        super.sendEvent(event)
    }
}


// MARK: - Apple로 로그인 (11/26)
// 앱 안에서는 iPad 기본 Apple 로그인 창을 써요. 받은 identity token을 웹에 넘기면
// 웹이 Supabase signInWithIdToken(provider: apple)으로 로그인해요. nonce는 원래 값은 웹에, 해시는 Apple에.
extension PencilBridgeViewController: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private static var appleRawNonce: String?

    func startAppleSignIn() {
        let raw = Self.randomNonce()
        Self.appleRawNonce = raw
        let req = ASAuthorizationAppleIDProvider().createRequest()
        req.requestedScopes = [.fullName, .email]
        req.nonce = SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
        let c = ASAuthorizationController(authorizationRequests: [req])
        c.delegate = self
        c.presentationContextProvider = self
        c.performRequests()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        view.window ?? UIWindow()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokData = cred.identityToken, let token = String(data: tokData, encoding: .utf8) else {
            sendApple(["error": "no_token"]); return
        }
        // 이름은 처음 로그인할 때만 와요. 한국식으로 성+이름
        let name = [cred.fullName?.familyName, cred.fullName?.givenName].compactMap { $0 }.joined()
        let code = cred.authorizationCode.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        sendApple(["token": token, "nonce": Self.appleRawNonce ?? "", "name": name, "code": code])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        sendApple(["error": canceled ? "cancel" : error.localizedDescription])
    }

    private func sendApple(_ d: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: d), let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.lumenibApple && window.lumenibApple(\(json))", completionHandler: nil)
    }

    private static func randomNonce(_ length: Int = 32) -> String {
        let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var out = ""
        while out.count < length {
            var b: UInt8 = 0
            if SecRandomCopyBytes(kSecRandomDefault, 1, &b) == errSecSuccess, Int(b) < chars.count * (256 / chars.count) {
                out.append(chars[Int(b) % chars.count])
            }
        }
        return out
    }
}


// MARK: - 구글 등 OAuth 로그인 (11/26)
// 구글은 WKWebView 안 로그인을 막아요(disallowed_useragent). 시스템 로그인 창으로 열고,
// lumenib://auth 로 돌아온 주소(PKCE code)를 웹에 넘기면 웹이 Supabase 세션으로 바꿔요.
extension PencilBridgeViewController: ASWebAuthenticationPresentationContextProviding {
    private static var webAuthSession: ASWebAuthenticationSession?

    func startWebAuth(_ url: URL, scheme: String) {
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
            Self.webAuthSession = nil
            var d: [String: Any] = [:]
            if let callback = callback { d["url"] = callback.absoluteString }
            else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { d["error"] = "cancel" }
            else { d["error"] = error?.localizedDescription ?? "oauth" }
            guard let data = try? JSONSerialization.data(withJSONObject: d), let json = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { self?.webView?.evaluateJavaScript("window.lumenibOAuth && window.lumenibOAuth(\(json))", completionHandler: nil) }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        Self.webAuthSession = session
        session.start()
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        view.window ?? UIWindow()
    }
}


// MARK: - 위 탭 바 · 설정 버튼 (iPad 기본 모양, 11/26)
// 웹은 탭 바 자리를 그대로 두고(안 보이게) 자리·글자·색을 보내요. 앱은 그 자리에 진짜 버튼과 유리 알약을 얹어요.
// 누르면 웹의 같은 버튼을 대신 눌러서, 화면 이동은 웹이 하던 그대로예요.
final class NativeTopBar: UIView {
    var onTap: ((String) -> Void)?
    var onSearch: ((String, Bool) -> Void)? // 검색창 글자 (입력 중 / 검색 누름)
    var onMenu: ((String) -> Void)? // iPad 기본 메뉴에서 고른 항목
    var onMenuShown: ((String, Bool) -> Void)? // 메뉴가 열릴 때 웹 단추를 숨기고, 닫히면 다시 보여요
    weak var snapSource: UIView? // 웹 화면 (메뉴 단추 모습을 찍어 와요)
    private var searchBox: UIView?
    private var searchField: UITextField?
    private let tabsBox = UIView()
    private let pill: UIView
    private var tabs: [(act: String, icon: String, btn: UIButton)] = []
    private var iconBtns: [String: UIButton] = [:] // 오른쪽 아이콘 버튼 (노트 쓰기 · 검색 · 설정)
    private var active = ""
    private var primary = UIColor.label, secondary = UIColor.secondaryLabel, iconColor = UIColor.label
    private var lastKey = ""
    var onDimTap: (() -> Void)?
    // 바텀시트·확인 창이 떠 있을 때 헤더 위에 덮는 어두운 막 (웹 막과 같은 색, 누르면 웹 막을 누른 것처럼 닫혀요, 66~)
    private let dimView = UIView()

    override init(frame: CGRect) {
        if #available(iOS 26.0, *) {
            let g = UIGlassEffect(style: .regular)
            g.isInteractive = true
            pill = UIVisualEffectView(effect: g)
        } else {
            pill = UIView()
        }
        super.init(frame: frame)
        backgroundColor = .clear
        isHidden = true
        pill.isUserInteractionEnabled = false
        tabsBox.addSubview(pill)
        addSubview(tabsBox)
        dimView.isHidden = true
        dimView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(dimTapped)))
        addSubview(dimView)
    }
    @objc private func dimTapped() { onDimTap?() }

    private func setDim(_ css: String?, _ h: CGFloat) {
        bringSubviewToFront(dimView)
        guard let c = Self.cssColor(css), h > 0 else {
            if !dimView.isHidden { dimView.isHidden = true; dimView.alpha = 0 }
            return
        }
        dimView.backgroundColor = c
        dimView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: h)
        dimView.autoresizingMask = [.flexibleWidth]
        if dimView.isHidden {
            dimView.alpha = 0; dimView.isHidden = false
            UIView.animate(withDuration: 0.15) { self.dimView.alpha = 1 } // 웹 막과 같이 0.15초
        }
    }
    required init?(coder: NSCoder) { fatalError() }

    // 버튼이 없는 곳은 웹이 그대로 받아요
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let v = super.hitTest(point, with: event)
        return (v === self || v === tabsBox) ? nil : v
    }

    static func icon(_ name: String, _ size: CGFloat) -> UIImage? { icon(name, CGSize(width: size, height: size)) }
    static func icon(_ name: String, _ size: CGSize) -> UIImage? {
        guard let img = UIImage(named: "nav-\(name)") else { return nil }
        let r = UIGraphicsImageRenderer(size: size)
        return r.image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }.withRenderingMode(.alwaysTemplate)
    }

    static func cssColor(_ s: String?) -> UIColor? {
        guard var s = s?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return nil }
        if s.hasPrefix("#") {
            s.removeFirst()
            if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
            guard s.count == 6 || s.count == 8, let v = UInt64(s, radix: 16) else { return nil }
            let a = s.count == 8 ? CGFloat(v & 0xff) / 255 : 1
            let rgb = s.count == 8 ? v >> 8 : v
            return UIColor(red: CGFloat((rgb >> 16) & 0xff) / 255, green: CGFloat((rgb >> 8) & 0xff) / 255, blue: CGFloat(rgb & 0xff) / 255, alpha: a)
        }
        let n = s.components(separatedBy: CharacterSet(charactersIn: "0123456789.").inverted).compactMap { Double($0) }
        guard n.count >= 3 else { return nil }
        return UIColor(red: n[0] / 255, green: n[1] / 255, blue: n[2] / 255, alpha: n.count > 3 ? n[3] : 1)
    }

    private static func rect(_ a: Any?) -> CGRect? {
        guard let a = a as? [Any], a.count == 4 else { return nil }
        let v = a.map { ($0 as? NSNumber)?.doubleValue ?? 0 }
        return CGRect(x: v[0], y: v[1], width: v[2], height: v[3])
    }

    func update(_ b: [String: Any]) {
        guard (b["show"] as? Bool) == true else { isHidden = true; lastKey = ""; setDim(nil, 0); return }
        defer { setDim(b["dim"] as? String, CGFloat((b["dimH"] as? NSNumber)?.doubleValue ?? 0)) }
        let box = Self.rect(b["box"]) ?? .zero // 탭 묶음이 없는 화면(노트 쓰기 · 본문 고르기)은 유리 버튼만 (48~)
        tabsBox.isHidden = box.width <= 0
        let dark = (b["dark"] as? Bool) ?? false
        overrideUserInterfaceStyle = dark ? .dark : .light
        let c = b["colors"] as? [String: Any] ?? [:]
        primary = Self.cssColor(c["primary"] as? String) ?? .label
        secondary = Self.cssColor(c["secondary"] as? String) ?? .secondaryLabel
        iconColor = Self.cssColor(c["icon"] as? String) ?? primary
        let pillColor = Self.cssColor(c["pill"] as? String) ?? .systemBackground
        let list = (b["tabs"] as? [[String: Any]]) ?? []
        let key = "\(list.map { ($0["act"] as? String ?? "") + ($0["label"] as? String ?? "") })\(dark)"
        if key != lastKey {
            tabs.forEach { $0.btn.removeFromSuperview() }
            tabs = list.map { t in
                let act = t["act"] as? String ?? "", btn = UIButton(type: .system)
                var cfg = UIButton.Configuration.plain()
                cfg.title = t["label"] as? String
                cfg.imagePadding = 6
                cfg.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 18)
                cfg.titleLineBreakMode = .byClipping
                cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { a in
                    var a = a; a.font = UIFont.systemFont(ofSize: 16, weight: .semibold); return a // 피그마 iPad 내비 글자 16 (11/27 다시)
                }
                btn.configuration = cfg
                btn.accessibilityLabel = t["label"] as? String
                btn.addAction(UIAction { [weak self] _ in self?.select(act, animated: true); self?.onTap?(act) }, for: .touchUpInside)
                tabsBox.addSubview(btn)
                return (act, t["icon"] as? String ?? "", btn)
            }
            lastKey = key
        }
        var x: CGFloat = 0
        for t in tabs where box.width > 0 {
            var cfg = t.btn.configuration ?? .plain()
            if cfg.image == nil { cfg.image = Self.icon("\(t.icon)-fill", 20); t.btn.configuration = cfg }
            // 피그마 iPad 내비(11/27): 탭 칸 높이 44 (웹 탭 칸 38의 가운데에 맞춰 위아래로 3씩)
            let w = ceil(t.btn.sizeThatFits(CGSize(width: 400, height: 44)).width)
            t.btn.frame = CGRect(x: x, y: 0, width: w, height: 44)
            x += w + 2
        }
        let total = max(0, x - 2)
        tabsBox.frame = CGRect(x: round(box.midX - total / 2), y: round(box.midY - 22), width: total, height: 44)
        if #available(iOS 26.0, *), let v = pill as? UIVisualEffectView {
            v.cornerConfiguration = .capsule() // 설정 버튼과 같은 맑은 유리 (색을 입히면 흰 알약처럼 보여서 안 입혀요, 45 피드백)
        } else {
            pill.backgroundColor = pillColor
        }
        // 오른쪽 아이콘 버튼: 웹이 보낸 것만 (노트 탭 = 노트 쓰기 · 검색 · 설정, 북마크 = 검색 · 설정, 홈·성경 = 설정)
        var icons = (b["icons"] as? [[String: Any]]) ?? []
        if icons.isEmpty, let g = b["gear"] { icons = [["act": "settings", "icon": "settings", "rect": g, "label": "설정"]] } // 예전 웹
        var seen = Set<String>()
        var hasField = false
        for it in icons {
            guard let act = it["act"] as? String, let r = Self.rect(it["rect"]) else { continue }
            if (it["kind"] as? String) == "field" { hasField = true; showSearchField(it, r); continue }
            seen.insert(act)
            if (it["kind"] as? String) == "menu" { if it["style"] != nil { seen.insert("styled:" + act) }; showMenuButton(act, it, r); continue }
            let btn: UIButton
            if let e = iconBtns[act] { btn = e } else {
                btn = UIButton(type: .system)
                btn.addAction(UIAction { [weak self] _ in self?.onTap?(act) }, for: .touchUpInside)
                addSubview(btn)
                iconBtns[act] = btn
            }
            btn.accessibilityLabel = it["label"] as? String
            btn.isHidden = false
            btn.frame = r
            let iconName = it["icon"] as? String ?? "", text = it["text"] as? String ?? ""
            let iw = CGFloat((it["iw"] as? NSNumber)?.doubleValue ?? 24), ih = CGFloat((it["ih"] as? NSNumber)?.doubleValue ?? iw)
            let img = iconName.isEmpty ? nil : Self.icon(iconName, CGSize(width: iw, height: ih))
            var cfg: UIButton.Configuration
            if #available(iOS 26.0, *) { cfg = .glass(); cfg.cornerStyle = .capsule } else { cfg = .plain() }
            cfg.image = img
            cfg.baseForegroundColor = text.isEmpty ? iconColor : primary
            if !text.isEmpty { // 글자 유리 버튼 (완료 · 〈 홈)
                cfg.title = text
                cfg.imagePadding = 6
                // 피그마 iPad 헤더(11/27): 글자 유리 버튼 높이 44, 좌우 16, 글자 17 SemiBold
                cfg.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16)
                cfg.titleLineBreakMode = .byClipping
                cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { a in
                    var a = a; a.font = UIFont.systemFont(ofSize: 17, weight: .semibold); return a
                }
            }
            btn.configuration = cfg
        }
        for (act, btn) in iconBtns where !seen.contains(act) { btn.isHidden = true }
        if !hasField { searchField?.resignFirstResponder(); searchBox?.removeFromSuperview(); searchBox = nil; searchField = nil }
        let was = isHidden
        isHidden = false
        if box.width <= 0 { pill.isHidden = true; active = ""; return }
        select((list.first { ($0["on"] as? Bool) == true }?["act"] as? String) ?? "", animated: !was && !active.isEmpty)
    }

    // 웹 단추 자리에 투명한 단추를 얹고, 누르면 iPad 기본 메뉴(UIMenu)가 떠요. 웹 단추 모양은 그대로 보여요 (11/27)
    private func showMenuButton(_ act: String, _ it: [String: Any], _ r: CGRect) {
        if let st = it["style"] as? [String: Any] { showStyledMenuButton(act, it, st, r); return }
        let btn: UIButton
        if let e = iconBtns[act] { btn = e } else {
            let mb = MenuButton(type: .custom)
            mb.backgroundColor = .clear
            mb.showsMenuAsPrimaryAction = true
            mb.adjustsImageWhenHighlighted = false
            // 누르는 순간 웹 단추 모습을 찍어 이 단추에 입혀요: iPad가 이 단추에서 메뉴를 펼치고(단추는 사라지고) 닫으면 다시 접어 넣어요 (11/27)
            mb.addAction(UIAction { [weak self, weak mb] _ in
                // 화면 전체를 그림으로 그리면 느려서(53), 그 자리만 화면에서 바로 떠 온 가벼운 복사 뷰를 얹어요 (54)
                guard let self, let mb, let src = self.snapSource else { return }
                mb.snap?.removeFromSuperview()
                let rr = mb.convert(mb.bounds, to: src)
                if let v = src.resizableSnapshotView(from: rr, afterScreenUpdates: false, withCapInsets: .zero) {
                    v.frame = mb.bounds; v.isUserInteractionEnabled = false
                    mb.addSubview(v); mb.snap = v
                }
            }, for: .touchDown)
            mb.onShown = { [weak self, weak mb] open in
                self?.onMenuShown?(act, open)
                if !open { mb?.snap?.removeFromSuperview(); mb?.snap = nil }
            }
            btn = mb
            addSubview(btn)
            iconBtns[act] = btn
        }
        btn.isHidden = false
        btn.frame = r
        btn.accessibilityLabel = it["label"] as? String
        let items = (it["items"] as? [[String: Any]]) ?? []
        btn.menu = UIMenu(children: items.map { m in
            let id = m["id"] as? String ?? ""
            let img = (m["sf"] as? String).flatMap { UIImage(systemName: $0) }
            let a = UIAction(title: m["title"] as? String ?? "", image: img) { [weak self, weak btn] _ in
                if id.hasPrefix("sort:") { DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self?.onMenu?(id) } } // 메뉴가 단추로 접히는 동안 글자가 바뀌지 않게 (54)
                else { self?.onMenu?(id) } // 사진 고르기 등은 바로 (53에선 메뉴가 완전히 끝날 때까지 기다려 느렸어요)
                _ = btn
            }
            if (m["on"] as? Bool) == true { a.state = .on } // 지금 고른 항목 체크 (51~)
            return a
        })
    }

    // 메뉴 단추를 앱이 직접 그려요 (55~): 웹 단추와 같은 글자·색·모양으로. 웹 단추는 숨겨 두고(늘), 덮어씌우거나 찍지 않아요.
    // 그래서 iPad가 이 진짜 단추에서 메뉴를 펼치고 접고, 깜빡이거나 겹쳐 보이지 않아요 (54 피드백: 사진 창 닫을 때 깜빡임, 정렬 화살표 두 개)
    private func showStyledMenuButton(_ act: String, _ it: [String: Any], _ st: [String: Any], _ r: CGRect) {
        let key = "styled:" + act
        let btn: UIButton
        if let e = iconBtns[key] { btn = e } else {
            btn = StyledMenuButton(type: .system)
            btn.showsMenuAsPrimaryAction = true
            addSubview(btn)
            iconBtns[key] = btn
        }
        btn.isHidden = false
        btn.frame = r
        btn.accessibilityLabel = it["label"] as? String
        let num = { (k: String, d: Double) -> CGFloat in CGFloat((st[k] as? NSNumber)?.doubleValue ?? d) }
        let fg = Self.cssColor(st["fg"] as? String) ?? primary
        var cfg = UIButton.Configuration.plain()
        cfg.title = st["text"] as? String
        cfg.baseForegroundColor = fg
        let bg = Self.cssColor(st["bg"] as? String)
        var bgc = UIBackgroundConfiguration.clear()
        if let bg, bg.cgColor.alpha > 0.01 { bgc.backgroundColor = bg }
        bgc.cornerRadius = min(num("radius", 0), r.height / 2)
        (btn as? StyledMenuButton)?.radius = bgc.cornerRadius
        cfg.background = bgc
        cfg.contentInsets = NSDirectionalEdgeInsets(top: 0, leading: num("pl", 8), bottom: 0, trailing: num("pr", 8))
        let fs = num("fs", 15), fw = num("fw", 600)
        let weight: UIFont.Weight = fw >= 700 ? .bold : fw >= 600 ? .semibold : fw >= 500 ? .medium : .regular
        cfg.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { a in var a = a; a.font = .systemFont(ofSize: fs, weight: weight); return a }
        cfg.titleLineBreakMode = .byClipping
        if (st["chevron"] as? Bool) == true {
            cfg.image = UIImage(systemName: "chevron.down", withConfiguration: UIImage.SymbolConfiguration(pointSize: fs * 0.62, weight: .semibold))
            cfg.imagePlacement = .trailing; cfg.imagePadding = 4
        }
        btn.configuration = cfg
        // 글꼴 폭이 웹과 조금 달라서, 글자가 잘리지 않게 앱이 잰 폭을 쓰고 웹 단추 가운데에 맞춰요
        let w = max(r.width, ceil(btn.sizeThatFits(CGSize(width: 600, height: r.height)).width))
        btn.frame = CGRect(x: round(r.midX - w / 2), y: r.minY, width: w, height: r.height)
        let items = (it["items"] as? [[String: Any]]) ?? []
        btn.menu = UIMenu(children: items.map { m in
            let id = m["id"] as? String ?? ""
            let img = (m["sf"] as? String).flatMap { UIImage(systemName: $0) }
            let a = UIAction(title: m["title"] as? String ?? "", image: img) { [weak self, weak btn] _ in
                // 사진 창은 메뉴가 단추로 다 돌아온 뒤에 띄워요. 바로 띄우면 단추가 메뉴로 떠오른 상태(글자 숨김)로 멈춰 있었어요 (57)
                if id.hasPrefix("photo-"), let sb = btn as? StyledMenuButton { sb.afterClose { self?.onMenu?(id) } }
                else { self?.onMenu?(id) }
            }
            if (m["on"] as? Bool) == true { a.state = .on }
            return a
        })
    }

    // 검색 줄 (피그마 Top Bar · 검색 iOS, 11/26): 유리 캡슐 안에 iPad 기본 글자 칸. 글자는 웹에 넘겨 결과를 그려요
    private func showSearchField(_ it: [String: Any], _ r: CGRect) {
        let fresh = searchBox == nil
        if fresh {
            let box: UIView
            if #available(iOS 26.0, *) {
                let g = UIGlassEffect(style: .regular); g.isInteractive = false
                let v = UIVisualEffectView(effect: g); v.cornerConfiguration = .capsule(); box = v
            } else {
                let v = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial)); v.clipsToBounds = true; box = v
            }
            let icon = UIImageView(image: Self.icon("search", 20)); icon.tag = 1
            let tf = UITextField()
            tf.font = .systemFont(ofSize: 16)
            tf.clearButtonMode = .whileEditing
            tf.returnKeyType = .search
            tf.autocorrectionType = .no
            tf.autocapitalizationType = .none
            tf.addAction(UIAction { [weak self, weak tf] _ in self?.onSearch?(tf?.text ?? "", false) }, for: .editingChanged)
            tf.addAction(UIAction { [weak self, weak tf] _ in tf?.resignFirstResponder(); self?.onSearch?(tf?.text ?? "", true) }, for: .editingDidEndOnExit)
            let content = (box as? UIVisualEffectView)?.contentView ?? box
            content.addSubview(icon); content.addSubview(tf)
            addSubview(box)
            searchBox = box; searchField = tf
        }
        guard let box = searchBox, let tf = searchField else { return }
        box.frame = r
        if #unavailable(iOS 26.0) { box.layer.cornerRadius = r.height / 2 }
        let content = (box as? UIVisualEffectView)?.contentView ?? box
        if let icon = content.viewWithTag(1) as? UIImageView { icon.frame = CGRect(x: 12, y: (r.height - 20) / 2, width: 20, height: 20); icon.tintColor = Self.cssColor(it["iconColor"] as? String) ?? secondary }
        tf.frame = CGRect(x: 40, y: 0, width: r.width - 40 - 10, height: r.height)
        tf.textColor = primary
        let ph = it["placeholder"] as? String ?? ""
        tf.attributedPlaceholder = NSAttributedString(string: ph, attributes: [.foregroundColor: Self.cssColor(it["phColor"] as? String) ?? UIColor.tertiaryLabel])
        let v = it["value"] as? String ?? ""
        if tf.text != v && tf.markedTextRange == nil { tf.text = v }
        if fresh && (it["focus"] as? Bool) == true { DispatchQueue.main.async { tf.becomeFirstResponder() } }
    }

    private func select(_ act: String, animated: Bool) {
        let changed = act != active
        active = act
        for t in tabs {
            let on = t.act == act
            var cfg = t.btn.configuration ?? .plain()
            cfg.image = Self.icon(on ? "\(t.icon)-fill" : t.icon, 20)
            cfg.baseForegroundColor = on ? primary : secondary
            t.btn.configuration = cfg
        }
        guard let target = tabs.first(where: { $0.act == act })?.btn else { pill.isHidden = true; return }
        // 고른 탭 유리 알약은 높이 44 (탭 칸 38보다 위아래 3씩 큼, 피그마 iPad 헤더 11/27)
        let f = target.frame.insetBy(dx: 0, dy: -max(0, (44 - target.frame.height) / 2))
        let place = { self.pill.frame = f; if #unavailable(iOS 26.0) { self.pill.layer.cornerRadius = f.height / 2 } }
        if pill.isHidden || !animated || !changed { pill.isHidden = false; UIView.performWithoutAnimation(place); return }
        UIView.animate(withDuration: 0.45, delay: 0, usingSpringWithDamping: 0.78, initialSpringVelocity: 0.4, options: [.allowUserInteraction, .beginFromCurrentState], animations: place)
    }
}


// MARK: - iPad 기본 메뉴에서 고른 것 · 사진 고르기 (11/27)
// 사진 바꾸기: 보관함은 iPad 기본 사진 고르기 창(PHPicker), 사진 찍기는 기본 카메라. 고른 사진은 정사각형 512 JPEG로 웹에 넘겨요
extension PencilBridgeViewController: PHPickerViewControllerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    func menuPicked(_ id: String) {
        switch id {
        case "photo-lib":
            var cfg = PHPickerConfiguration(photoLibrary: .shared())
            cfg.filter = .images; cfg.selectionLimit = 1
            let vc = PHPickerViewController(configuration: cfg)
            vc.delegate = self
            present(vc, animated: true)
        case "photo-cam":
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else { return }
            let vc = UIImagePickerController()
            vc.sourceType = .camera; vc.cameraDevice = .front; vc.delegate = self
            vc.modalPresentationStyle = .fullScreen
            present(vc, animated: true)
        default:
            js("window.lumenibMenuPick && window.lumenibMenuPick('\(id)')")
        }
    }

    public func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let p = results.first?.itemProvider, p.canLoadObject(ofClass: UIImage.self) else { return }
        js("window.lumenibPhotoBusy && window.lumenibPhotoBusy()")
        p.loadObject(ofClass: UIImage.self) { [weak self] obj, _ in
            guard let img = obj as? UIImage else { return }
            DispatchQueue.main.async { self?.sendPhoto(img) }
        }
    }

    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        if let img = info[.originalImage] as? UIImage { sendPhoto(img) }
    }
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { picker.dismiss(animated: true) }

    private func sendPhoto(_ img: UIImage) {
        let n: CGFloat = 512
        let w = img.size.width, h = img.size.height, side = min(w, h)
        guard side > 0 else { return }
        let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 1
        let out = UIGraphicsImageRenderer(size: CGSize(width: n, height: n), format: fmt).image { _ in
            let k = n / side
            img.draw(in: CGRect(x: -(w - side) / 2 * k, y: -(h - side) / 2 * k, width: w * k, height: h * k))
        }
        guard let data = out.jpegData(compressionQuality: 0.85) else { return }
        js("window.lumenibPhoto && window.lumenibPhoto('data:image/jpeg;base64,\(data.base64EncodedString())')")
    }
}


// 웹 단추 위에 얹는 iPad 기본 메뉴 단추: 메뉴가 열리고 닫히는 때를 알려요 (11/27)
final class MenuButton: UIButton {
    var onShown: ((Bool) -> Void)?
    var snap: UIView? // 누르는 순간 떠 온 웹 단추 모습
    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willDisplayMenuFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
        super.contextMenuInteraction(interaction, willDisplayMenuFor: configuration, animator: animator)
        onShown?(true)
    }
    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
        super.contextMenuInteraction(interaction, willEndFor: configuration, animator: animator)
        if let animator { animator.addCompletion { [weak self] in self?.onShown?(false) } } else { onShown?(false) }
    }
}


// 앱이 그리는 메뉴 단추 (56~): 메뉴가 열릴 때 단추 전체(바탕 포함)가 메뉴로 떠오르고, 닫히면 다시 단추로 돌아와요.
// 기본은 글자만 떠올라서, 검은 바탕 단추(사진 바꾸기)는 바탕만 남고 글자가 사라져 보였어요 (11/27)
final class StyledMenuButton: UIButton {
    var radius: CGFloat = 0
    private var pendingClose: (() -> Void)?
    /// 메뉴가 단추로 다 돌아온 뒤에 할 일 (0.6초 안에 안 끝나면 그냥 해요)
    func afterClose(_ f: @escaping () -> Void) {
        pendingClose = f
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.flushClose() }
    }
    private func flushClose() { let f = pendingClose; pendingClose = nil; f?() }
    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
        super.contextMenuInteraction(interaction, willEndFor: configuration, animator: animator)
        if let animator { animator.addCompletion { [weak self] in self?.flushClose() } } else { flushClose() }
    }
    private func whole() -> UITargetedPreview {
        let p = UIPreviewParameters()
        p.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: radius)
        p.backgroundColor = .clear
        return UITargetedPreview(view: self, parameters: p)
    }
    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? { whole() }
    override func contextMenuInteraction(_ interaction: UIContextMenuInteraction, previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration) -> UITargetedPreview? { whole() }
}
