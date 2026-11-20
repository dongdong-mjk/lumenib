import UIKit
import PencilKit

/// 필기감 비교용 네이티브 종이 (PencilKit).
/// 웹 노트 화면의 "네이티브 필기" 버튼으로 열려요. 성경 본문·인용 없이 줄 종이 + 펜 도구만 있어요.
/// 쓴 내용은 기기 안 파일 하나(native-ink.drawing)에 저장돼요.
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
        let title = UILabel()
        title.text = "네이티브 필기 시험"
        title.font = .systemFont(ofSize: 16, weight: .semibold)
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
        applyTool()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // 화면 폭에 맞춰 A4 종이를 세로로 이어 붙여요. 폭이 바뀌면(회전) 기존 필기를 같은 비율로 늘려요.
        let w = min(canvas.bounds.width - 40, 1100)
        guard w > 0 else { return }
        let newScale = w / pageW
        if let d = pending {
            pending = nil
            canvas.drawing = d.transformed(using: CGAffineTransform(scaleX: newScale, y: newScale))
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
        applyTool()
    }

    // MARK: 도구

    private func applyTool() {
        switch tool {
        case .pen: canvas.tool = PKInkingTool(.pen, color: penColor, width: penWidth * scale * 1.6)
        case .highlighter: canvas.tool = PKInkingTool(.marker, color: UIColor(hex: 0xFFE14D), width: 18 * scale)
        case .eraser: canvas.tool = PKEraserTool(.vector)
        case .lasso: canvas.tool = PKLassoTool()
        }
        for case let b as UIButton in toolStack.arrangedSubviews {
            let on = b.tag == tool.rawValue
            b.backgroundColor = on ? UIColor(white: 0, alpha: 0.08) : .clear
            b.tintColor = on ? .black : UIColor(white: 0, alpha: 0.55)
        }
        // 펜일 때만 색·굵기
        optionStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        guard tool == .pen else { return }
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

    @objc private func toolTapped(_ b: UIButton) { setTool(Tool(rawValue: b.tag) ?? .pen) }
    @objc private func colorTapped(_ b: UIButton) { penColor = penColors[b.tag]; applyTool() }
    @objc private func widthTapped(_ b: UIButton) { penWidth = penWidths[b.tag]; applyTool() }

    // MARK: 되돌리기

    @objc private func undoTapped() { canvas.undoManager?.undo(); refreshHistory() }
    @objc private func redoTapped() { canvas.undoManager?.redo(); refreshHistory() }
    private func refreshHistory() {
        undoButton.isEnabled = canvas.undoManager?.canUndo ?? false
        redoButton.isEnabled = canvas.undoManager?.canRedo ?? false
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
