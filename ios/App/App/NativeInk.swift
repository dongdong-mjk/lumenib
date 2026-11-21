import UIKit
import PencilKit

/// 필기감 비교용 네이티브 종이.
/// 웹 노트 화면의 "네이티브 필기" 버튼으로 열려요. 성경 본문·인용 없이 줄 종이 + 펜 도구만 있어요.
/// 위쪽에서 두 엔진을 바꿔 가며 비교해요.
///  - lumenib 펜: 웹앱 필기 엔진을 Swift로 옮긴 것 (LumenInk.swift). 펜 종류 + 세부 설정(팁 선명도 등)이 웹과 같아요.
///  - 애플 펜: PencilKit 기본 펜 (세부 설정은 애플이 막아 둬서 없음)
/// 쓴 내용은 기기 안 파일(native-ink.drawing, native-ink-lumen.json)에 저장돼요.
final class NativeInkViewController: UIViewController, UIPencilInteractionDelegate, PKCanvasViewDelegate {

    // 웹 테스트 앱과 같은 A4 비율·줄 간격 (js/ink.js 의 PAGE_W, PAGE_H, LINE, MARGIN)
    private let pageW: CGFloat = 726, pageH: CGFloat = 1027, line: CGFloat = 33.68, margin: CGFloat = 18.7
    private let pageCount = 6

    private let canvas = PKCanvasView()
    private let paper = LinedPaperView()
    private var scale: CGFloat = 1
    private var pending: PKDrawing?

    private enum Tool: Int { case pen, highlighter, eraser, lasso }
    private var tool: Tool = .pen
    private var penColor = UIColor(hex: 0x111111)
    private var penWidth: CGFloat = 2.6
    private let penColors: [UIColor] = [UIColor(hex: 0x111111), UIColor(hex: 0x004CE5), UIColor(hex: 0xDC3333)]
    private let penWidths: [CGFloat] = [1.6, 2.6, 4]

    // 펜 종류 (웹앱과 같은 3가지, 기본 볼펜). PencilKit이 제공하는 펜으로 맞춰요.
    //  볼펜 = monoline(굵기 일정), 만년필 = fountainPen(필압·방향에 따라 굵기), 붓펜 = pen(필압 변화가 큰 기본 펜, 굵게)
    //  iPadOS 17 이전 기기는 셋 다 기본 pen으로 그려져요.
    private enum PenStyle: Int, CaseIterable { case ball, fountain, brush
        var name: String { ["볼펜", "만년필", "붓펜"][rawValue] }
    }
    private var penStyle: PenStyle = .ball

    // lumenib 펜 (직접 그리는 엔진)
    private enum Engine: Int { case lumen, apple }
    private var engine: Engine = .lumen
    private let inkView = LumenInkView()
    private var lumenStyle: LumenPenStyle = .ball
    private var lumenOpts: [LumenPenStyle: [String: Double]] = [:]
    private let penHex = ["#111111", "#004CE5", "#DC3333"]
    private var appleDrawing: PKDrawing?   // lumenib 펜일 때 잠깐 치워 두는 애플 펜 필기
    private var suppressSave = false
    private var settingsButton: UIButton?

    private static var lumenURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-ink-lumen.json")
    }

    private let toolStack = UIStackView()
    private let optionStack = UIStackView()
    private var undoButton: UIButton!
    private var redoButton: UIButton!

    private static var fileURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("native-ink.drawing")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .light
        view.backgroundColor = UIColor(hex: 0xF7F7F7)

        // 위쪽 막대: 닫기 · 제목 · 되돌리기 · 다시 하기
        let bar = UIView()
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)
        let close = textButton("닫기", #selector(closeTapped))
        let title = UISegmentedControl(items: ["lumenib 펜", "애플 펜"])
        title.selectedSegmentIndex = 0
        title.addTarget(self, action: #selector(engineChanged(_:)), for: .valueChanged)
        title.accessibilityLabel = "필기 엔진"

        undoButton = iconButton("arrow.uturn.backward", #selector(undoTapped), label: "되돌리기")
        redoButton = iconButton("arrow.uturn.forward", #selector(redoTapped), label: "다시 하기")
        let right = UIStackView(arrangedSubviews: [undoButton, redoButton])
        right.spacing = 8
        for v in [close, title, right] as [UIView] { v.translatesAutoresizingMaskIntoConstraints = false; bar.addSubview(v) }

        // 종이
        canvas.translatesAutoresizingMaskIntoConstraints = false
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .pencilOnly // 손가락은 스크롤, 펜슬만 필기 (웹 앱 기본값과 같음)
        canvas.alwaysBounceVertical = true
        canvas.delegate = self
        canvas.insertSubview(paper, at: 0)
        canvas.delaysContentTouches = false // 펜슬을 대자마자 바로 그리기 시작
        canvas.addSubview(inkView)
        inkView.onChange = { [weak self] in self?.lumenChanged() }
        view.addSubview(canvas)

        // 아래쪽 펜 툴바
        let tb = UIView()
        tb.translatesAutoresizingMaskIntoConstraints = false
        tb.backgroundColor = .white
        tb.layer.cornerRadius = 16
        tb.layer.shadowColor = UIColor.black.cgColor
        tb.layer.shadowOpacity = 0.12
        tb.layer.shadowRadius = 12
        tb.layer.shadowOffset = CGSize(width: 0, height: 4)
        view.addSubview(tb)
        toolStack.spacing = 4
        optionStack.spacing = 8
        optionStack.alignment = .center
        let sep = UIView()
        sep.backgroundColor = UIColor(white: 0, alpha: 0.12)
        sep.widthAnchor.constraint(equalToConstant: 1).isActive = true
        sep.heightAnchor.constraint(equalToConstant: 24).isActive = true
        let row = UIStackView(arrangedSubviews: [toolStack, sep, optionStack])
        row.spacing = 12
        row.alignment = .center
        row.translatesAutoresizingMaskIntoConstraints = false
        tb.addSubview(row)

        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: g.topAnchor),
            bar.leadingAnchor.constraint(equalTo: g.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: g.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 56),
            close.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            close.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            title.centerXAnchor.constraint(equalTo: bar.centerXAnchor),
            title.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            right.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            right.centerYAnchor.constraint(equalTo: bar.centerYAnchor),

            canvas.topAnchor.constraint(equalTo: bar.bottomAnchor),
            canvas.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            canvas.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            tb.centerXAnchor.constraint(equalTo: g.centerXAnchor),
            tb.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -16),
            row.topAnchor.constraint(equalTo: tb.topAnchor, constant: 8),
            row.bottomAnchor.constraint(equalTo: tb.bottomAnchor, constant: -8),
            row.leadingAnchor.constraint(equalTo: tb.leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: tb.trailingAnchor, constant: -12),
        ])

        for (t, name, label) in [(Tool.pen, "pencil.tip", "펜"), (.highlighter, "highlighter", "형광펜"), (.eraser, "eraser", "지우개"), (.lasso, "lasso", "올가미")] {
            let b = iconButton(name, #selector(toolTapped(_:)), label: label)
            b.tag = t.rawValue
            toolStack.addArrangedSubview(b)
        }

        // 펜슬 더블탭·스퀴즈 → iPad 설정의 동작
        let pencil = UIPencilInteraction()
        pencil.delegate = self
        view.addInteraction(pencil)

        // 저장은 종이 단위(화면 배율 1)로 해 두고, 화면 크기가 정해지면 배율을 곱해 불러와요
        if let data = try? Data(contentsOf: Self.fileURL), let d = try? PKDrawing(data: data) { pending = d }
        if let data = try? Data(contentsOf: Self.lumenURL), let st = try? JSONDecoder().decode([LumenStroke].self, from: data) { inkView.load(st) }
        applyEngine()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // 화면 폭에 맞춰 A4 종이를 세로로 이어 붙여요. 폭이 바뀌면(회전) 기존 필기를 같은 비율로 늘려요.
        let w = min(canvas.bounds.width - 40, 1100)
        guard w > 0 else { return }
        let newScale = w / pageW
        if let d = pending {
            pending = nil
            let scaled = d.transformed(using: CGAffineTransform(scaleX: newScale, y: newScale))
            suppressSave = true
            if engine == .lumen { appleDrawing = scaled } else { canvas.drawing = scaled }
            suppressSave = false
        } else if abs(newScale - scale) > 0.001, !canvas.drawing.strokes.isEmpty, paper.frame.width > 0 {
            let k = newScale / scale
            canvas.drawing = canvas.drawing.transformed(using: CGAffineTransform(scaleX: k, y: k))
        }
        scale = newScale
        let x = (canvas.bounds.width - w) / 2
        let h = pageH * scale
        let gap: CGFloat = 16
        let total = CGFloat(pageCount) * (h + gap) + 120 // 아래 툴바에 가리지 않게 여유
        paper.frame = CGRect(x: 0, y: 0, width: canvas.bounds.width, height: total)
        paper.configure(pageX: x, pageW: w, pageH: h, gap: gap, count: pageCount, line: line * scale, margin: margin * scale, top: 10 * scale)
        canvas.contentSize = CGSize(width: canvas.bounds.width, height: total)
        inkView.frame = paper.frame
        inkView.layout(scale: scale, originX: x)
        applyTool()
    }

    // MARK: 엔진 바꾸기 (lumenib 펜 ↔ 애플 펜)

    @objc private func engineChanged(_ c: UISegmentedControl) {
        engine = Engine(rawValue: c.selectedSegmentIndex) ?? .lumen
        applyEngine()
    }
    private func applyEngine() {
        let lumen = engine == .lumen
        suppressSave = true
        if lumen {
            if appleDrawing == nil && pending == nil { appleDrawing = canvas.drawing; canvas.drawing = PKDrawing() }
        } else if let d = appleDrawing {
            canvas.drawing = d; appleDrawing = nil
        }
        suppressSave = false
        canvas.drawingGestureRecognizer.isEnabled = !lumen
        // lumenib 펜일 때는 펜슬이 스크롤을 움직이지 않게 (손가락만 스크롤)
        let direct = NSNumber(value: UITouch.TouchType.direct.rawValue), pencil = NSNumber(value: UITouch.TouchType.pencil.rawValue)
        canvas.panGestureRecognizer.allowedTouchTypes = lumen ? [direct] : [direct, pencil]
        inkView.isHidden = !lumen
        if lumen && tool == .lasso { tool = .pen }
        applyTool()
        refreshHistory()
    }

    private func lumenChanged() {
        refreshHistory()
        if let data = try? JSONEncoder().encode(inkView.strokes) {
            DispatchQueue.global(qos: .utility).async { try? data.write(to: Self.lumenURL) }
        }
    }

    // MARK: 도구

    private func applyTool() {
        let ci = penColors.firstIndex(of: penColor) ?? 0
        inkView.penColor = penHex[ci]
        inkView.penWidth = Double(penWidth)
        inkView.penStyle = lumenStyle
        inkView.penOpts = lumenOpts
        switch tool {
        case .pen: inkView.tool = .pen
        case .highlighter: inkView.tool = .highlighter
        case .eraser, .lasso: inkView.tool = .eraser
        }
        switch tool {
        case .pen:
            var ink: PKInkingTool.InkType = .pen
            var w = penWidth * scale * 1.6
            if #available(iOS 17.0, *) {
                switch penStyle {
                case .ball: ink = .monoline
                case .fountain: ink = .fountainPen; w *= 1.3
                case .brush: ink = .pen; w *= 2.2
                }
            } else if penStyle == .brush { w *= 2.2 }
            canvas.tool = PKInkingTool(ink, color: penColor, width: w)
        case .highlighter: canvas.tool = PKInkingTool(.marker, color: UIColor(hex: 0xE8B517), width: 18 * scale)
        case .eraser: canvas.tool = PKEraserTool(.vector)
        case .lasso: canvas.tool = PKLassoTool()
        }
        for case let b as UIButton in toolStack.arrangedSubviews {
            b.isHidden = engine == .lumen && b.tag == Tool.lasso.rawValue // lumenib 펜 시험판에는 올가미가 아직 없어요
            let on = b.tag == tool.rawValue
            b.backgroundColor = on ? UIColor(white: 0, alpha: 0.08) : .clear
            b.tintColor = on ? .black : UIColor(white: 0, alpha: 0.55)
        }
        // 펜일 때만 색·굵기
        optionStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard tool == .pen else { return }
        if engine == .lumen {
            // 웹앱처럼 '펜 설정' (펜 종류 + 세부 설정). 펜 도구를 한 번 더 눌러도 열려요.
            let b = UIButton(type: .system)
            b.setTitle("\(lumenStyle.name) · 설정", for: .normal)
            b.setTitleColor(.black, for: .normal)
            b.titleLabel?.font = .systemFont(ofSize: 14, weight: .semibold)
            b.contentEdgeInsets = UIEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
            b.layer.cornerRadius = 10
            b.layer.borderWidth = 1
            b.layer.borderColor = UIColor(hex: 0xE8E8E8).cgColor
            b.addTarget(self, action: #selector(openPenSettings), for: .touchUpInside)
            settingsButton = b
            optionStack.addArrangedSubview(b)
        } else {
            let seg = UISegmentedControl(items: PenStyle.allCases.map(\.name))
            seg.selectedSegmentIndex = penStyle.rawValue
            seg.addTarget(self, action: #selector(styleChanged(_:)), for: .valueChanged)
            seg.accessibilityLabel = "펜 종류"
            optionStack.addArrangedSubview(seg)
        }
        let sep2 = UIView()
        sep2.backgroundColor = UIColor(white: 0, alpha: 0.12)
        sep2.widthAnchor.constraint(equalToConstant: 1).isActive = true
        sep2.heightAnchor.constraint(equalToConstant: 24).isActive = true
        optionStack.addArrangedSubview(sep2)
        for (i, c) in penColors.enumerated() {
            let b = UIButton(type: .system)
            b.tag = i
            b.backgroundColor = c
            b.layer.cornerRadius = 12
            b.layer.borderWidth = c == penColor ? 3 : 0
            b.layer.borderColor = UIColor(white: 0, alpha: 0.25).cgColor
            b.widthAnchor.constraint(equalToConstant: 24).isActive = true
            b.heightAnchor.constraint(equalToConstant: 24).isActive = true
            b.accessibilityLabel = "펜 색 \(i + 1)"
            b.addTarget(self, action: #selector(colorTapped(_:)), for: .touchUpInside)
            optionStack.addArrangedSubview(b)
        }
        for (i, w) in penWidths.enumerated() {
            let b = UIButton(type: .system)
            b.tag = i
            let dot = UIView()
            dot.isUserInteractionEnabled = false
            dot.backgroundColor = .black
            let d = 4 + w * 2
            dot.layer.cornerRadius = d / 2
            dot.translatesAutoresizingMaskIntoConstraints = false
            b.addSubview(dot)
            NSLayoutConstraint.activate([
                b.widthAnchor.constraint(equalToConstant: 36), b.heightAnchor.constraint(equalToConstant: 36),
                dot.widthAnchor.constraint(equalToConstant: d), dot.heightAnchor.constraint(equalToConstant: d),
                dot.centerXAnchor.constraint(equalTo: b.centerXAnchor), dot.centerYAnchor.constraint(equalTo: b.centerYAnchor),
            ])
            b.layer.cornerRadius = 8
            b.backgroundColor = w == penWidth ? UIColor(white: 0, alpha: 0.08) : .clear
            b.accessibilityLabel = "펜 굵기 \(i + 1)"
            b.addTarget(self, action: #selector(widthTapped(_:)), for: .touchUpInside)
            optionStack.addArrangedSubview(b)
        }
    }

    @objc private func toolTapped(_ b: UIButton) {
        let t = Tool(rawValue: b.tag) ?? .pen
        if t == .pen && tool == .pen && engine == .lumen { return openPenSettings() }
        setTool(t)
    }
    @objc private func openPenSettings() {
        let vc = LumenPenSettingsViewController(style: lumenStyle, opts: lumenOpts, color: inkView.penColor)
        vc.onChange = { [weak self] st, o in
            guard let self else { return }
            self.lumenStyle = st; self.lumenOpts = o
            self.inkView.penStyle = st; self.inkView.penOpts = o
            self.settingsButton?.setTitle("\(st.name) · 설정", for: .normal)
        }
        vc.modalPresentationStyle = .popover
        if let pop = vc.popoverPresentationController {
            pop.sourceView = settingsButton ?? view
            pop.sourceRect = (settingsButton ?? view).bounds
            pop.permittedArrowDirections = [.down, .up]
        }
        present(vc, animated: true)
    }
    @objc private func styleChanged(_ c: UISegmentedControl) { penStyle = PenStyle(rawValue: c.selectedSegmentIndex) ?? .ball; applyTool() }
    @objc private func colorTapped(_ b: UIButton) { penColor = penColors[b.tag]; applyTool() }
    @objc private func widthTapped(_ b: UIButton) { penWidth = penWidths[b.tag]; applyTool() }

    // MARK: 되돌리기

    @objc private func undoTapped() { if engine == .lumen { inkView.undo() } else { canvas.undoManager?.undo() }; refreshHistory() }
    @objc private func redoTapped() { if engine == .lumen { inkView.redo() } else { canvas.undoManager?.redo() }; refreshHistory() }
    private func refreshHistory() {
        guard undoButton != nil else { return }
        undoButton.isEnabled = engine == .lumen ? inkView.canUndo : (canvas.undoManager?.canUndo ?? false)
        redoButton.isEnabled = engine == .lumen ? inkView.canRedo : (canvas.undoManager?.canRedo ?? false)
    }

    // iPad 설정 > Apple Pencil 에서 고른 동작을 따라가요 (지우개 전환 · 이전 도구). 그 밖의 동작은 이 시험 화면에 없어요.
    private var previousTool: Tool = .eraser
    private func setTool(_ t: Tool) {
        guard t != tool else { return }
        previousTool = tool
        tool = t
        applyTool()
    }
    private func perform(_ action: String) {
        switch action {
        case "switchEraser": setTool(tool == .eraser ? (previousTool == .eraser ? .pen : previousTool) : .eraser)
        case "switchPrevious": setTool(previousTool)
        default: break
        }
    }
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        perform(PencilAction.name(UIPencilInteraction.preferredTapAction))
    }
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) {
        perform(PencilAction.name(UIPencilInteraction.preferredTapAction))
    }
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveSqueeze squeeze: UIPencilInteraction.Squeeze) {
        if squeeze.phase == .ended { perform(PencilAction.name(UIPencilInteraction.preferredSqueezeAction)) }
    }

    // MARK: 저장 · 닫기

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        refreshHistory()
        if suppressSave || engine == .lumen { return }
        let data = canvas.drawing.transformed(using: CGAffineTransform(scaleX: 1 / scale, y: 1 / scale)).dataRepresentation()
        DispatchQueue.global(qos: .utility).async { try? data.write(to: Self.fileURL) }
    }

    @objc private func closeTapped() { dismiss(animated: true) }

    // MARK: 버튼 만들기

    private func iconButton(_ symbol: String, _ action: Selector, label: String) -> UIButton {
        let b = UIButton(type: .system)
        b.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .medium)), for: .normal)
        b.tintColor = .black
        b.layer.cornerRadius = 10
        b.accessibilityLabel = label
        b.widthAnchor.constraint(equalToConstant: 44).isActive = true
        b.heightAnchor.constraint(equalToConstant: 44).isActive = true
        b.addTarget(self, action: action, for: .touchUpInside)
        return b
    }
    private func textButton(_ text: String, _ action: Selector) -> UIButton {
        let b = UIButton(type: .system)
        b.setTitle(text, for: .normal)
        b.setTitleColor(.black, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        b.addTarget(self, action: action, for: .touchUpInside)
        return b
    }
}

/// 줄 종이 (웹 테스트 앱의 lined 종이와 같은 간격). 큰 그림을 그리지 않고 레이어로 만들어 메모리를 아껴요.
final class LinedPaperView: UIView {
    override init(frame: CGRect) { super.init(frame: frame); backgroundColor = .clear; isUserInteractionEnabled = false }
    required init?(coder: NSCoder) { fatalError() }

    func configure(pageX: CGFloat, pageW: CGFloat, pageH: CGFloat, gap: CGFloat, count: Int, line: CGFloat, margin: CGFloat, top: CGFloat) {
        layer.sublayers?.forEach { $0.removeFromSuperlayer() }
        let path = UIBezierPath()
        for i in 0..<count {
            let y0 = CGFloat(i) * (pageH + gap) + gap
            let page = CALayer()
            page.frame = CGRect(x: pageX, y: y0, width: pageW, height: pageH)
            page.backgroundColor = UIColor.white.cgColor
            page.shadowColor = UIColor.black.cgColor
            page.shadowOpacity = 0.08
            page.shadowRadius = 4
            page.shadowOffset = CGSize(width: 0, height: 1)
            page.shadowPath = UIBezierPath(rect: page.bounds).cgPath
            layer.addSublayer(page)
            var y = y0 + top + line
            while y < y0 + pageH - 12 {
                path.append(UIBezierPath(rect: CGRect(x: pageX + margin, y: y, width: pageW - margin * 2, height: 1)))
                y += line
            }
        }
        let lines = CAShapeLayer()
        lines.path = path.cgPath
        lines.fillColor = UIColor(hex: 0xE4E4E4).cgColor
        layer.addSublayer(lines)
    }
}

extension UIColor {
    convenience init(hex: Int) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}
