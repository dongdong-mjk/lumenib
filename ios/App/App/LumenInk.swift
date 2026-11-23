import UIKit

// MARK: - 필기 엔진: perfect-freehand (js/vendor/perfect-freehand.js) 를 Swift로 옮긴 것
// 웹앱과 같은 계산이라 같은 설정이면 같은 모양이 나와요.

typealias V2 = SIMD2<Double>

enum Freehand {
    struct Point { var point: V2; var pressure: Double; var vector: V2; var distance: Double; var runningLength: Double }
    struct Options {
        var size: Double = 16
        var thinning: Double = 0.5
        var smoothing: Double = 0.5
        var streamline: Double = 0.5
        var easing: (Double) -> Double = { $0 }
        var taperStart: Double = 0
        var taperEnd: Double = 0
        var capStart = true
        var capEnd = true
        var last = false
    }

    private static let rotTotal = Double.pi + 0.0001
    private static func per(_ a: V2) -> V2 { V2(a.y, -a.x) }
    private static func dot(_ a: V2, _ b: V2) -> Double { a.x * b.x + a.y * b.y }
    private static func len(_ a: V2) -> Double { (a.x * a.x + a.y * a.y).squareRoot() }
    private static func uni(_ a: V2) -> V2 { let l = len(a); return l == 0 ? a : a / l }
    private static func dist2(_ a: V2, _ b: V2) -> Double { let d = a - b; return d.x * d.x + d.y * d.y }
    private static func lrp(_ a: V2, _ b: V2, _ t: Double) -> V2 { a + (b - a) * t }
    private static func rotAround(_ p: V2, _ c: V2, _ r: Double) -> V2 {
        let s = sin(r), co = cos(r), x = p.x - c.x, y = p.y - c.y
        return V2(x * co - y * s + c.x, x * s + y * co + c.y)
    }
    private static func radius(_ size: Double, _ thinning: Double, _ pressure: Double, _ easing: (Double) -> Double) -> Double {
        size * easing(0.5 - thinning * (0.5 - pressure))
    }

    /// 입력 점 [x, y, pressure] → 다듬은 점
    static func strokePoints(_ input: [SIMD3<Double>], _ o: Options) -> [Point] {
        if input.isEmpty { return [] }
        let t = 0.15 + (1 - o.streamline) * 0.85
        var pts = input
        if pts.count == 2 {
            let c = pts[1]; pts.removeLast()
            for i in 1..<5 { let p = lrp(V2(pts[0].x, pts[0].y), V2(c.x, c.y), Double(i) / 4); pts.append(SIMD3(p.x, p.y, c.z)) }
        }
        if pts.count == 1 { pts.append(SIMD3(pts[0].x + 1, pts[0].y + 1, pts[0].z)) }
        var out = [Point(point: V2(pts[0].x, pts[0].y), pressure: pts[0].z >= 0 ? pts[0].z : 0.25, vector: V2(1, 1), distance: 0, runningLength: 0)]
        var reached = false, running = 0.0
        var prev = out[0]
        let last = pts.count - 1
        for i in 1..<pts.count {
            let target = V2(pts[i].x, pts[i].y)
            let p = (o.last && i == last) ? target : lrp(prev.point, target, t)
            if p == prev.point { continue }
            let d = len(p - prev.point)
            running += d
            if i < last && !reached {
                if running < o.size { continue }
                reached = true
            }
            prev = Point(point: p, pressure: pts[i].z >= 0 ? pts[i].z : 0.5, vector: uni(prev.point - p), distance: d, runningLength: running)
            out.append(prev)
        }
        out[0].vector = out.count > 1 ? out[1].vector : V2(0, 0)
        return out
    }

    /// 다듬은 점 → 외곽선 다각형
    static func outline(_ e: [Point], _ o: Options) -> [V2] {
        let size = o.size
        if e.isEmpty || size <= 0 { return [] }
        let total = e[e.count - 1].runningLength
        let g = o.taperStart, T = o.taperEnd
        let te = pow(size * o.smoothing, 2)
        var left: [V2] = [], right: [V2] = []
        var m = radius(size, o.thinning, e[e.count - 1].pressure, o.easing)
        var firstRadius: Double?
        var X = e[0].vector
        var pl = e[0].point, pr = pl
        var tl = pl, tr = pr
        var isSharp = false
        let easeStart: (Double) -> Double = { $0 * (2 - $0) }
        let easeEnd: (Double) -> Double = { let r = $0 - 1; return r * r * r + 1 }
        let n = e.count
        for r in 0..<n {
            let pt = e[r]
            let o2 = pt.point, s = pt.vector, I = pt.runningLength
            if r < n - 1 && total - I < 3 { continue }
            if o.thinning != 0 { m = radius(size, o.thinning, pt.pressure, o.easing) } else { m = size / 2 }
            if firstRadius == nil { firstRadius = m }
            let le = I < g ? easeStart(I / g) : 1
            let fe = total - I < T ? easeEnd((total - I) / T) : 1
            m = max(0.01, m * min(le, fe))
            let next = (r < n - 1 ? e[r + 1] : e[r]).vector
            let Y = r < n - 1 ? dot(s, next) : 1
            let be = dot(s, X) < 0 && !isSharp
            let ne = Y < 0
            if be || ne {
                let v = per(X) * m
                var w = 0.0
                while w <= 1 {
                    tl = rotAround(o2 - v, o2, rotTotal * w); left.append(tl)
                    tr = rotAround(o2 + v, o2, rotTotal * -w); right.append(tr)
                    w += 1.0 / 13
                }
                pl = tl; pr = tr
                if ne { isSharp = true }
                continue
            }
            isSharp = false
            if r == n - 1 {
                let v = per(s) * m
                left.append(o2 - v); right.append(o2 + v)
                continue
            }
            let off = per(lrp(next, s, Y)) * m
            tl = o2 - off
            if r <= 1 || dist2(pl, tl) > te { left.append(tl); pl = tl }
            tr = o2 + off
            if r <= 1 || dist2(pr, tr) > te { right.append(tr); pr = tr }
            X = s
        }
        let P = e[0].point
        let k = n > 1 ? e[n - 1].point : e[0].point + V2(1, 1)
        var startCap: [V2] = [], endCap: [V2] = []
        if n == 1 {
            if !(g != 0 || T != 0) || o.last {
                let start = P + uni(per(P - k)) * -(firstRadius ?? m)
                var pts: [V2] = []
                var s = 1.0 / 13
                while s <= 1 { pts.append(rotAround(start, P, rotTotal * 2 * s)); s += 1.0 / 13 }
                return pts
            }
        } else {
            if !(g != 0 || (T != 0 && n == 1)), !right.isEmpty, !left.isEmpty {
                if o.capStart {
                    var s = 1.0 / 13
                    while s <= 1 { startCap.append(rotAround(right[0], P, rotTotal * s)); s += 1.0 / 13 }
                } else {
                    let i = left[0] - right[0], a = i * 0.5, b = i * 0.51
                    startCap += [P - a, P - b, P + b, P + a]
                }
            }
            let rr = per(-e[n - 1].vector)
            if T != 0 || (g != 0 && n == 1) {
                endCap.append(k)
            } else if o.capEnd {
                let st = k + rr * m
                var s = 1.0 / 29
                while s < 1 { endCap.append(rotAround(st, k, rotTotal * 3 * s)); s += 1.0 / 29 }
            } else {
                endCap += [k + rr * m, k + rr * (m * 0.99), k - rr * (m * 0.99), k - rr * m]
            }
        }
        return left + endCap + right.reversed() + startCap
    }
}

// MARK: - 펜 종류 · 세부 설정 (js/ink.js 의 styleOpts 와 같은 값)

enum LumenPenStyle: Int, CaseIterable, Codable {
    case ball, fountain, brush
    var name: String { ["볼펜", "만년필", "붓펜"][rawValue] }
    var desc: String { ["누르는 힘과 상관없이 같은 굵기", "세게 누르면 굵게, 살살 쓰면 가늘게", "굵기 차이가 크고 끝이 붓처럼 가늘어져요"][rawValue] }
    /// 이 펜에서 쓰는 세부 설정 (굿노트: 필압 조절·평평함은 만년필만)
    var options: [LumenPenOption] {
        switch self {
        case .ball: return [.stab]
        case .fountain: return [.sharp, .pressure, .flat, .stab]
        case .brush: return [.sharp, .stab]
        }
    }
}

enum LumenPenOption: String, CaseIterable, Codable {
    case sharp, pressure, flat, stab
    var title: String { ["sharp": "팁 선명도", "pressure": "필압 민감도", "flat": "평평함", "stab": "손떨림 보정"][rawValue]! }
    var hint: String {
        ["sharp": "획의 시작과 끝이 둥글게 ↔ 뾰족하게", "pressure": "누르는 힘에 따라 굵기가 덜 ↔ 많이 바뀜",
         "flat": "펜촉이 둥글게 ↔ 납작하게 (긋는 방향에 따라 굵기가 달라져요)", "stab": "손 떨림을 덜 ↔ 많이 다듬어 줌"][rawValue]!
    }
    var defaultValue: Double { self == .flat ? 0 : 50 }
}

struct LumenStroke: Codable {
    enum Tool: Int, Codable { case pen, highlighter }
    var tool: Tool
    var style: LumenPenStyle
    var opts: [String: Double]
    var color: String   // #RRGGBB
    var width: Double   // 종이 단위
    var pts: [Double]   // x, y, pressure 반복 (종이 단위)
}

private let REF_SIZE = 2.6 * 1.25

struct LumenStyleParams { var scale: Double; var thinning: Double; var taper: Double; var stream: Double; var flat: Double; var sigma: Double = 0; var smooth: Double = 0.6 }

func lumenParams(_ st: LumenPenStyle, _ po: [String: Double]) -> LumenStyleParams {
    let v = { (k: LumenPenOption) in po[k.rawValue] ?? k.defaultValue }
    // 손떨림 보정 (웹 styleOpts 와 같음): 선 끝은 펜촉에 바로 붙고, 지나온 부분을 앞뒤 점과 고르게 다듬어요
    // 0%면 쓰는 그대로 (굿노트처럼): 지연(stream)·외곽 다듬기(smooth)도 보정 값에 맞춰요. 50%가 예전 기본값 (웹과 같음, 11/23)
    let stream = (v(.stab) / 100) * 0.3, sigma = po["_raw"] != nil ? 0 : max(1, (v(.stab) / 100) * 6) // 도형(_raw)은 다듬지 않아요. 보정 0%여도 아주 약하게(1) (웹과 같음)
    var r = lumenParamsBody(st, v, stream, sigma)
    r.smooth = 0.3 + (v(.stab) / 100) * 0.6
    return r
}
private func lumenParamsBody(_ st: LumenPenStyle, _ v: (LumenPenOption) -> Double, _ stream: Double, _ sigma: Double) -> LumenStyleParams {
    switch st {
    case .ball: return .init(scale: 1, thinning: 0, taper: 0, stream: stream, flat: 0, sigma: sigma)
    case .fountain:
        let flat = v(.flat) / 100
        return .init(scale: 1, thinning: max(0.2 + (v(.pressure) / 100) * 0.8, 0.85 * flat), taper: (v(.sharp) / 100) * 12, stream: stream, flat: flat, sigma: sigma)
    case .brush: return .init(scale: 1.4, thinning: 0.8, taper: (v(.sharp) / 100) * 26, stream: stream, flat: 0, sigma: sigma)
    }
}

/// 펜 획 → 종이 단위 외곽선 경로 (웹의 drawStroke 와 같은 계산)
func lumenCleanPenEnd(_ pts: [SIMD3<Double>]) -> [SIMD3<Double>] {
    if pts.count < 4 { return pts }
    let gap = REF_SIZE * 0.12
    var out = [pts[0]]
    for i in 1..<pts.count {
        let l = out[out.count - 1], q = pts[i]
        if hypot(q.x - l.x, q.y - l.y) >= gap { out.append(q) }
    }
    if out.count < 4 { return out.count >= 2 ? out : pts }
    let n = out.count
    func len(_ a: SIMD3<Double>, _ b: SIMD3<Double>) -> Double { hypot(b.x - a.x, b.y - a.y) }
    var j = n - 1, d = 0.0
    while j > 0 && d < REF_SIZE * 0.8 { d += len(out[j - 1], out[j]); j -= 1 }
    var i0 = j; d = 0
    while i0 > 0 && d < REF_SIZE * 1.2 { d += len(out[i0 - 1], out[i0]); i0 -= 1 }
    let dx = out[j].x - out[i0].x, dy = out[j].y - out[i0].y, dl = hypot(dx, dy)
    if dl < 1e-6 { return out }
    var cut = n, back = 0.0
    var m = n - 1
    while m > j {
        let sx = out[m].x - out[m - 1].x, sy = out[m].y - out[m - 1].y
        let sl = max(hypot(sx, sy), 1e-9)
        if (sx * dx + sy * dy) / (dl * sl) < 0.5 { back += sl; cut = m } else { break } // 60° 넘게 꺾인 끝 (웹과 같음)
        m -= 1
    }
    return back > 0 && back < REF_SIZE * 0.8 && cut > 2 ? Array(out[0..<cut]) : out
}

func lumenPenPath(_ s: LumenStroke, live: Bool) -> CGPath {
    let o = lumenParams(s.style, s.opts)
    if s.opts["_raw"] != nil, s.pts.count >= 6 {
        // 도형: 필압 없이 고른 굵기, 모서리는 둥글게 (웹 drawStroke 의 s.sh 와 같음)
        let line = CGMutablePath()
        line.move(to: CGPoint(x: s.pts[0], y: s.pts[1]))
        var i = 3
        while i + 1 < s.pts.count { line.addLine(to: CGPoint(x: s.pts[i], y: s.pts[i + 1])); i += 3 }
        let w = s.width * 1.25 * o.scale * (1 - o.thinning * 0.5)
        return line.copy(strokingWithWidth: CGFloat(w), lineCap: .round, lineJoin: .round, miterLimit: 10)
    }
    let size = s.width * 1.25 * o.scale, k = REF_SIZE / size
    var pts: [SIMD3<Double>] = []
    var i = 0
    while i + 2 < s.pts.count {
        pts.append(SIMD3(s.pts[i] * k, s.pts[i + 1] * k, s.style == .ball ? 0.5 : s.pts[i + 2]))
        i += 3
    }
    pts = lumenCleanPenEnd(pts) // 펜을 멈출 때 끝에 몰린 점·되돌아온 잔떨림 정리 (웹 cleanPenEnd 와 같음, 11/23)
    if s.style != .ball, !pts.isEmpty, s.opts["_raw"] == nil {
        // 시작 힘 보정 (웹 startPressure 와 같음): 누르는 순간부터 제 굵기로
        let K = min(6, pts.count)
        var m = 0.0
        for i in 0..<K { m = max(m, pts[i].z) }
        for i in 0..<K { pts[i].z = max(pts[i].z, m) }
    }
    if o.sigma >= 0.5, pts.count >= 3 {
        // 지나온 점을 앞뒤로 고르게 다듬기 (웹 gaussSmooth 와 같음)
        let n = pts.count, R = Int(ceil(o.sigma * 2)), src = pts
        for i in 1..<(n - 1) {
            let r = min(R, i, n - 1 - i)
            var sx = 0.0, sy = 0.0, sw = 0.0
            for j in -r...r { let w = exp(-Double(j * j) / (2 * o.sigma * o.sigma)); sx += src[i + j].x * w; sy += src[i + j].y * w; sw += w }
            pts[i].x = sx / sw; pts[i].y = sy / sw
        }
        // 누르는 힘도 앞뒤와 살짝 섞어요 (웹 smoothPressure 와 같음)
        let z = pts.map { $0.z }
        for i in 1..<(n - 1) { pts[i].z = (z[i - 1] + 2 * z[i] + z[i + 1]) / 4 }
    }
    if o.flat > 0 {
        // 평평함: 45° 기울어진 납작한 펜촉처럼 긋는 방향에 따라 굵기
        let nib = -Double.pi / 4, n = pts.count
        let f: [Double] = (0..<n).map { j in
            let a = pts[max(0, j - 2)], b = pts[min(n - 1, j + 2)]
            if a == b { return 0.6 }
            return 0.05 + 0.95 * abs(sin(atan2(b.y - a.y, b.x - a.x) - nib))
        }
        for j in 0..<n { pts[j].z = pts[j].z * (1 - o.flat) + f[j] * o.flat }
    }
    var opt = Freehand.Options()
    opt.size = REF_SIZE; opt.thinning = o.thinning; opt.smoothing = o.smooth
    opt.streamline = o.stream // 쓰는 중에도 완성본과 같은 보정 (떼는 순간 선 모양이 바뀌던 것)
    opt.easing = { sin($0 * Double.pi / 2) }
    opt.taperStart = o.taper; opt.taperEnd = live ? 0 : o.taper
    opt.last = !live
    let outline = Freehand.outline(Freehand.strokePoints(pts, opt), opt).map { $0 / k }
    let path = CGMutablePath()
    guard let first = outline.first else { return path }
    path.move(to: CGPoint(x: first.x, y: first.y))
    for j in 1..<outline.count {
        let a = outline[j], b = outline[(j + 1) % outline.count]
        path.addQuadCurve(to: CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2), control: CGPoint(x: a.x, y: a.y))
    }
    path.closeSubpath()
    return path
}

/// 형광펜: 끝이 납작한 선 (시작·끝의 흔들린 점은 빼고, 웹의 hlPoints 와 같음)
func lumenHighlighterPath(_ s: LumenStroke) -> CGPath {
    var P: [V2] = []
    var i = 0
    while i + 2 < s.pts.count { P.append(V2(s.pts[i], s.pts[i + 1])); i += 3 }
    let path = CGMutablePath()
    guard let a = P.first, let z = P.last else { return path }
    var q = [a]
    let near = s.width * 0.5
    if P.count >= 3 {
        for p in P.dropFirst().dropLast() {
            if (p - a).magnitude < near || (p - z).magnitude < near { continue }
            if (p - q[q.count - 1]).magnitude < 1.5 { continue }
            q.append(p)
        }
    }
    q.append(z)
    path.move(to: CGPoint(x: q[0].x, y: q[0].y))
    if q.count > 2 {
        for j in 1..<(q.count - 1) {
            let m = (q[j] + q[j + 1]) / 2
            path.addQuadCurve(to: CGPoint(x: m.x, y: m.y), control: CGPoint(x: q[j].x, y: q[j].y))
        }
    }
    path.addLine(to: CGPoint(x: q[q.count - 1].x, y: q[q.count - 1].y))
    return path
}

private extension SIMD2 where Scalar == Double { var magnitude: Double { (x * x + y * y).squareRoot() } }

/// 형광펜 (웹 노트 위, 11/23): 웹 js/ink.js 의 hlSmooth + hlCurve 와 같은 계산이라 쓰는 중과 웹이 그린 완성본이 같아요.
/// 지나온 거리 기준 가우시안(양 끝 고정) → 점 사이 2차 곡선. k = 종이 단위 → 화면 배율
func lumenHlTrimEnds(_ X: inout [Double], _ Y: inout [Double], w: Double) {
    let lim = w * 0.7, look = w * 1.5
    func trim(_ rev: Bool) {
        let n = X.count
        if n < 4 { return }
        func at(_ i: Int) -> Int { rev ? n - 1 - i : i }
        var j = 0, d = 0.0
        while j < n - 1 && d < lim { d += hypot(X[at(j + 1)] - X[at(j)], Y[at(j + 1)] - Y[at(j)]); j += 1 }
        var i0 = j; d = 0
        while i0 < n - 1 && d < look { d += hypot(X[at(i0 + 1)] - X[at(i0)], Y[at(i0 + 1)] - Y[at(i0)]); i0 += 1 }
        let dx = X[at(j)] - X[at(i0)], dy = Y[at(j)] - Y[at(i0)], dl = hypot(dx, dy)
        if dl < 1e-6 || i0 == j { return }
        var cut = 0
        var k = j
        while k > 0 {
            let sx = X[at(k - 1)] - X[at(k)], sy = Y[at(k - 1)] - Y[at(k)], sl = max(hypot(sx, sy), 1e-9)
            if (sx * dx + sy * dy) / (dl * sl) < 0.5 { cut = k; break }
            k -= 1
        }
        if cut > 0 {
            if rev { X.removeLast(cut); Y.removeLast(cut) } else { X.removeFirst(cut); Y.removeFirst(cut) }
        }
    }
    trim(false); trim(true)
}

func lumenHlWebPath(_ flat: [Double], stab: Double, k: Double, shaped: Bool, hlWidth: Double = 12) -> CGPath {
    let path = CGMutablePath()
    var X: [Double] = [], Y: [Double] = []
    var i = 0
    while i + 1 < flat.count {
        let x = flat[i], y = flat[i + 1]
        if shaped || X.isEmpty || hypot(x - X[X.count - 1], y - Y[Y.count - 1]) >= 0.8 * k || i + 3 >= flat.count { X.append(x); Y.append(y) }
        i += 3
    }
    guard !X.isEmpty else { return path }
    if !shaped { lumenHlTrimEnds(&X, &Y, w: hlWidth) } // 끝 뭉침·흰 틈 (웹 hlTrimEnds 와 같음)
    if shaped {
        path.move(to: CGPoint(x: X[0], y: Y[0]))
        for j in 1..<max(1, X.count) { path.addLine(to: CGPoint(x: X[j], y: Y[j])) }
        return path
    }
    let m = X.count
    var S = [0.0]
    for j in 1..<max(1, m) where m > 1 { S.append(S[j - 1] + hypot(X[j] - X[j - 1], Y[j] - Y[j - 1])) }
    let sig = (4 + max(0, min(100, stab)) / 100 * 18) * k
    let total = S[m - 1]
    var qx: [Double] = [], qy: [Double] = []
    var lo = 0
    for j in 0..<m {
        let sg = min(sig, S[j] / 2, (total - S[j]) / 2)
        if sg < 0.05 * k { qx.append(X[j]); qy.append(Y[j]); continue }
        let r = sg * 2.5
        while S[lo] < S[j] - r { lo += 1 }
        var sx = 0.0, sy = 0.0, sw = 0.0
        var t = lo
        while t < m && S[t] <= S[j] + r { let d = S[t] - S[j], w = exp(-(d * d) / (2 * sg * sg)); sx += X[t] * w; sy += Y[t] * w; sw += w; t += 1 }
        qx.append(sx / sw); qy.append(sy / sw)
    }
    path.move(to: CGPoint(x: qx[0], y: qy[0]))
    if qx.count == 1 { path.addLine(to: CGPoint(x: qx[0] + 0.01, y: qy[0])); return path }
    if qx.count > 2 {
        for j in 1..<(qx.count - 1) {
            path.addQuadCurve(to: CGPoint(x: (qx[j] + qx[j + 1]) / 2, y: (qy[j] + qy[j + 1]) / 2), control: CGPoint(x: qx[j], y: qy[j]))
        }
    }
    path.addLine(to: CGPoint(x: qx[qx.count - 1], y: qy[qy.count - 1]))
    return path
}

// MARK: - 필기 화면: 애플펜슬 입력을 받아 직접 그려요

/// 스크롤 뷰 안 종이 위에 올라가는 투명한 필기 판.
/// 좌표는 종이 단위(폭 726)로 저장하고, 화면 배율(scale)과 종이 왼쪽 위치(originX)로 그려요.
final class LumenInkView: UIView {
    enum Tool { case pen, highlighter, eraser }

    var tool: Tool = .pen
    var penStyle: LumenPenStyle = .ball
    var penOpts: [LumenPenStyle: [String: Double]] = [:]
    var penColor = "#111111"
    var penWidth = 2.6
    var hlColor = "#E8B517"
    var hlWidth = 18.0
    var hlAlpha: CGFloat = 0.42
    var onChange: (() -> Void)?

    private(set) var strokes: [LumenStroke] = []
    private var undoStack: [[LumenStroke]] = []
    private var redoStack: [[LumenStroke]] = []
    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    private var scale: CGFloat = 1
    private var originX: CGFloat = 0
    private let committedLayer = CALayer()
    private let liveLayer = CAShapeLayer()
    private var current: LumenStroke?
    private var eraseBefore: [LumenStroke]?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        isMultipleTouchEnabled = false
        layer.addSublayer(committedLayer)
        layer.addSublayer(liveLayer)
    }
    required init?(coder: NSCoder) { fatalError() }

    func layout(scale: CGFloat, originX: CGFloat) {
        self.scale = scale; self.originX = originX
        committedLayer.frame = bounds
        liveLayer.frame = bounds
        redrawAll()
    }

    private var transform2: CGAffineTransform { CGAffineTransform(translationX: originX, y: 0).scaledBy(x: scale, y: scale) }

    private func layerFor(_ s: LumenStroke, live: Bool = false) -> CAShapeLayer {
        let l = CAShapeLayer()
        configure(l, s, live: live)
        return l
    }
    private func configure(_ l: CAShapeLayer, _ s: LumenStroke, live: Bool) {
        var t = transform2
        let color = UIColor(hexString: s.color)
        if s.tool == .highlighter {
            l.path = lumenHighlighterPath(s).copy(using: &t)
            l.fillColor = nil
            l.strokeColor = color.withAlphaComponent(hlAlpha).cgColor
            l.lineWidth = s.width * scale
            l.lineCap = .round; l.lineJoin = .round // 굿노트처럼 끝이 부드럽게
            l.compositingFilter = "multiplyBlendMode"
            l.zPosition = -1
        } else {
            l.path = lumenPenPath(s, live: live).copy(using: &t)
            l.fillColor = color.cgColor
            l.strokeColor = nil
            l.compositingFilter = nil
            l.zPosition = 0
        }
        l.frame = bounds
    }

    func redrawAll() {
        CATransaction.begin(); CATransaction.setDisableActions(true)
        committedLayer.sublayers?.forEach { $0.removeFromSuperlayer() }
        for s in strokes { committedLayer.addSublayer(layerFor(s)) }
        liveLayer.path = nil
        CATransaction.commit()
    }

    // MARK: 입력 (애플펜슬만 필기, 손가락은 스크롤)

    private func pagePoint(_ t: UITouch) -> SIMD3<Double> {
        let p = t.preciseLocation(in: self)
        let force = t.maximumPossibleForce > 0 ? Double(t.force / t.maximumPossibleForce) : 0.5
        return SIMD3(Double((p.x - originX) / scale), Double(p.y / scale), min(1, max(0.05, force)))
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first, t.type == .pencil else { return super.touchesBegan(touches, with: event) }
        let p = pagePoint(t)
        switch tool {
        case .eraser:
            eraseBefore = strokes
            erase(at: p)
        case .pen, .highlighter:
            let hl = tool == .highlighter
            current = LumenStroke(tool: hl ? .highlighter : .pen, style: penStyle, opts: penOpts[penStyle] ?? [:],
                                  color: hl ? hlColor : penColor, width: hl ? hlWidth : penWidth,
                                  pts: [round1(p.x), round1(p.y), hl ? 0.5 : round2(p.z)])
            drawLive(predicted: [])
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first, t.type == .pencil else { return super.touchesMoved(touches, with: event) }
        let coalesced = event?.coalescedTouches(for: t) ?? [t]
        if tool == .eraser {
            for c in coalesced { erase(at: pagePoint(c)) }
            return
        }
        guard current != nil else { return }
        for c in coalesced { add(pagePoint(c)) }
        // 펜 끝을 미리 예측한 점까지 그려서 손을 따라오는 느낌을 줄여요 (저장은 안 해요)
        let predicted = (event?.predictedTouches(for: t) ?? []).map { pagePoint($0) }
        drawLive(predicted: predicted)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first, t.type == .pencil else { return super.touchesEnded(touches, with: event) }
        finish()
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard let t = touches.first, t.type == .pencil else { return super.touchesCancelled(touches, with: event) }
        finish()
    }

    override func touchesEstimatedPropertiesUpdated(_ touches: Set<UITouch>) {}

    private func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
    private func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }

    private func add(_ p: SIMD3<Double>) {
        guard var s = current else { return }
        let n = s.pts.count
        let dx = p.x - s.pts[n - 3], dy = p.y - s.pts[n - 2]
        if dx * dx + dy * dy < 0.6 { return }
        s.pts += [round1(p.x), round1(p.y), s.tool == .highlighter ? 0.5 : round2(p.z)]
        current = s
    }

    private func drawLive(predicted: [SIMD3<Double>]) {
        guard var s = current else { return }
        for p in predicted { s.pts += [p.x, p.y, s.tool == .highlighter ? 0.5 : p.z] }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        configure(liveLayer, s, live: true)
        CATransaction.commit()
    }

    private func finish() {
        if tool == .eraser {
            if let before = eraseBefore, before.count != strokes.count { pushUndo(before); onChange?() }
            eraseBefore = nil
            return
        }
        guard var s = current else { return }
        current = nil
        if s.pts.count == 3 { s.pts += [s.pts[0] + 0.3, s.pts[1] + 0.3, s.pts[2]] }
        pushUndo(strokes)
        strokes.append(s)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        committedLayer.addSublayer(layerFor(s))
        liveLayer.path = nil
        CATransaction.commit()
        onChange?()
    }

    private func erase(at p: SIMD3<Double>) {
        let r = 10.0
        let before = strokes.count
        strokes.removeAll { s in
            let rr = r + s.width / 2
            var i = 0
            while i + 1 < s.pts.count {
                let dx = s.pts[i] - p.x, dy = s.pts[i + 1] - p.y
                if dx * dx + dy * dy <= rr * rr { return true }
                i += 3
            }
            return false
        }
        if strokes.count != before { redrawAll() }
    }

    // MARK: 되돌리기 · 저장

    private func pushUndo(_ s: [LumenStroke]) {
        undoStack.append(s)
        if undoStack.count > 60 { undoStack.removeFirst() }
        redoStack.removeAll()
    }
    func undo() { guard let s = undoStack.popLast() else { return }; redoStack.append(strokes); strokes = s; redrawAll(); onChange?() }
    func redo() { guard let s = redoStack.popLast() else { return }; undoStack.append(strokes); strokes = s; redrawAll(); onChange?() }

    func load(_ s: [LumenStroke]) { strokes = s; redrawAll() }
}

extension UIColor {
    convenience init(hexString: String) {
        let h = Int(hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        self.init(red: CGFloat((h >> 16) & 0xFF) / 255, green: CGFloat((h >> 8) & 0xFF) / 255, blue: CGFloat(h & 0xFF) / 255, alpha: 1)
    }
}

// MARK: - 펜 설정 창 (웹앱의 '펜 설정'과 같은 구성)

final class LumenPenSettingsViewController: UIViewController {
    var style: LumenPenStyle
    var opts: [LumenPenStyle: [String: Double]]
    var color: String
    var onChange: ((LumenPenStyle, [LumenPenStyle: [String: Double]]) -> Void)?

    private let preview = CAShapeLayer()
    private let previewBox = LayoutNotifyingView()
    private let stack = UIStackView()

    init(style: LumenPenStyle, opts: [LumenPenStyle: [String: Double]], color: String) {
        self.style = style; self.opts = opts; self.color = color
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white // 앱의 라이트/다크를 따라가요
        view.tintColor = .label // 디자인 규칙: 포인트 색 없이 검정(다크는 흰색)
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        // 만년필처럼 항목이 많으면 창보다 길어져서 스크롤되게 해요
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.alwaysBounceVertical = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 20), // 위 여백
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -16),
            stack.leadingAnchor.constraint(equalTo: scroll.frameLayoutGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: scroll.frameLayoutGuide.trailingAnchor, constant: -16),
        ])
        preferredContentSize = CGSize(width: 296, height: 480)
        build()
    }

    private func value(_ k: LumenPenOption) -> Double { opts[style]?[k.rawValue] ?? k.defaultValue }
    private weak var resetButton: UIButton?
    private weak var segControl: UISegmentedControl?
    // 탭 선택은 실제 크기가 정해진 뒤 애니메이션 없이 넣어요 (처음 열 때 옆에서 미끄러져 들어오던 것)
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if let seg = segControl, seg.bounds.width > 0, seg.selectedSegmentIndex != style.rawValue {
            UIView.performWithoutAnimation { seg.selectedSegmentIndex = style.rawValue; seg.layoutIfNeeded() }
        }
        drawPreview()
    }
    // 지금 펜 종류의 값이 모두 기본값이면 '기본값으로'를 꺼 둬요
    private var isDefault: Bool { style.options.allSatisfy { value($0) == $0.defaultValue } }

    private func build() {
        stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
        let title = UILabel(); title.text = "펜 설정"; title.font = .systemFont(ofSize: 15, weight: .semibold); title.textColor = .lumenTextPrimary
        stack.addArrangedSubview(title)

        previewBox.onLayout = { [weak self] in self?.drawPreview() } // 실제 크기가 정해진 뒤 다시 그려요 (처음 열 때 샘플이 찌그러지던 것)
        previewBox.backgroundColor = .white // 미리보기는 종이처럼 흰 바탕
        previewBox.layer.cornerRadius = 10
        previewBox.heightAnchor.constraint(equalToConstant: 64).isActive = true
        previewBox.layer.addSublayer(preview)
        stack.addArrangedSubview(previewBox)

        let seg = UISegmentedControl(items: LumenPenStyle.allCases.map(\.name))
        seg.addTarget(self, action: #selector(styleChanged(_:)), for: .valueChanged)
        stack.addArrangedSubview(seg)
        segControl = seg
        let desc = UILabel(); desc.text = style.desc; desc.font = .systemFont(ofSize: 12); desc.textColor = .lumenTextSecondary; desc.numberOfLines = 0
        stack.addArrangedSubview(desc)

        for k in style.options {
            let head = UIStackView()
            let name = UILabel(); name.text = k.title; name.font = .systemFont(ofSize: 13, weight: .semibold); name.textColor = .lumenTextPrimary
            let val = UILabel(); val.text = "\(Int(value(k)))%"; val.font = .monospacedDigitSystemFont(ofSize: 13, weight: .medium); val.textColor = .lumenTextPrimary
            val.tag = 1000 + LumenPenOption.allCases.firstIndex(of: k)!
            head.addArrangedSubview(name); head.addArrangedSubview(UIView()); head.addArrangedSubview(val)
            let slider = UISlider(); slider.minimumValue = 0; slider.maximumValue = 100; slider.value = Float(value(k))
            slider.tag = LumenPenOption.allCases.firstIndex(of: k)!
            slider.addTarget(self, action: #selector(sliderChanged(_:)), for: .valueChanged)
            let hint = UILabel(); hint.text = k.hint; hint.font = .systemFont(ofSize: 12); hint.textColor = .lumenTextSecondary; hint.numberOfLines = 0
            let box = UIStackView(arrangedSubviews: [head, slider, hint]); box.axis = .vertical; box.spacing = 2
            stack.addArrangedSubview(box)
        }
        let reset = UIButton(type: .system); reset.setTitle("기본값으로", for: .normal)
        reset.setTitleColor(.lumenTextPrimary, for: .normal); reset.setTitleColor(.tertiaryLabel, for: .disabled)
        reset.contentHorizontalAlignment = .leading
        reset.isEnabled = !isDefault
        resetButton = reset
        reset.addTarget(self, action: #selector(resetTapped), for: .touchUpInside)
        stack.addArrangedSubview(reset)
        view.layoutIfNeeded()
        if let seg = segControl, seg.bounds.width > 0 { UIView.performWithoutAnimation { seg.selectedSegmentIndex = style.rawValue; seg.layoutIfNeeded() } }
        drawPreview()
    }


    private func drawPreview() {
        let w = Double(previewBox.bounds.width), h = Double(previewBox.bounds.height)
        guard w > 0 else { return }
        // 웹의 미리보기처럼 누르는 힘이 바뀌는 물결
        let cycles = max(1, Int((w / h / 1.6).rounded()))
        let N = 40 * cycles
        var pts: [Double] = []
        let sx = 726.0 / w * 0.35 // 종이 단위로: 미리보기는 실제보다 크게 보이도록
        for i in 0...N {
            let t = Double(i) / Double(N)
            pts += [(12 + t * (w - 24)) * sx, (h / 2 + sin(t * .pi * 2 * Double(cycles)) * (h / 2 - 12)) * sx, 0.25 + 0.65 * sin(t * .pi)]
        }
        let s = LumenStroke(tool: .pen, style: style, opts: opts[style] ?? [:], color: color, width: 2.6, pts: pts)
        var t = CGAffineTransform(scaleX: CGFloat(1 / sx), y: CGFloat(1 / sx))
        preview.path = lumenPenPath(s, live: false).copy(using: &t)
        preview.fillColor = UIColor(hexString: color).cgColor
        preview.frame = previewBox.bounds
    }

    @objc private func styleChanged(_ c: UISegmentedControl) {
        style = LumenPenStyle(rawValue: c.selectedSegmentIndex) ?? .ball
        onChange?(style, opts); build()
    }
    @objc private func sliderChanged(_ s: UISlider) {
        let k = LumenPenOption.allCases[s.tag]
        let v = (Double(s.value) / 5).rounded() * 5
        var o = opts[style] ?? [:]; o[k.rawValue] = v; opts[style] = o
        (view.viewWithTag(1000 + s.tag) as? UILabel)?.text = "\(Int(v))%"
        drawPreview()
        resetButton?.isEnabled = !isDefault
        onChange?(style, opts)
    }
    @objc private func resetTapped() {
        // 빈 값을 보내면 웹이 예전 값을 그대로 두어서, 기본값을 하나하나 적어 보내요
        var o: [String: Double] = [:]
        for k in style.options { o[k.rawValue] = k.defaultValue }
        opts[style] = o
        onChange?(style, opts); build()
    }
}

// MARK: - 웹 노트 위에서 쓰는 네이티브 필기 (필기만 네이티브)
// 웹 노트 화면은 그대로 두고, 애플펜슬로 펜·형광펜을 쓸 때만 이 레이어가 바로 그려요.
// 펜을 떼면 점들(웹 화면 좌표)을 웹으로 넘기고(window.lumenibInk), 웹이 노트에 넣어 그리면 이 레이어를 지워요.

struct WebInkConfig {
    var enabled = false
    var tool: LumenStroke.Tool = .pen
    var relay = false          // 지우개 · 올가미: 네이티브는 그리지 않고 펜슬 움직임만 웹에 넘겨요
    var color = "#111111"
    var width = 2.6            // 종이 단위
    var style: LumenPenStyle = .ball
    var opts: [String: Double] = [:]
    var hlAlpha: CGFloat = 0.42
    var hlStab: Double = 60    // 형광펜 손떨림 보정 (웹 settings.hlStab)
    var scale: CGFloat = 1     // 웹 종이 배율 (종이 단위 → 화면)
    var area: CGRect = .zero   // 필기할 수 있는 곳 (웹 화면 좌표)
    var exclude: [CGRect] = [] // 툴바처럼 필기하면 안 되는 곳
    var pages: [CGRect] = []   // 종이 한 장씩의 자리 (임시 선을 이 안으로 잘라요)

    init() {}
    init(_ b: [String: Any]) {
        enabled = b["enabled"] as? Bool ?? false
        let t = b["tool"] as? String ?? "pen"
        tool = t == "hl" ? .highlighter : .pen
        relay = t == "eraser" || t == "lasso" // 형광펜은 다시 앱이 바로 그려요 (펜처럼 매끄럽게, 11/23). 곱하기로 글씨 밑에 깔리는 모습은 같게
        hlStab = b["hlStab"] as? Double ?? 60
        color = b["color"] as? String ?? color
        width = b["width"] as? Double ?? width
        style = LumenPenStyle.allCases.first { ["ball", "fountain", "brush"][$0.rawValue] == (b["style"] as? String) } ?? .ball
        opts = (b["opts"] as? [String: Any])?.compactMapValues { ($0 as? NSNumber)?.doubleValue } ?? [:]
        hlAlpha = CGFloat(b["hlAlpha"] as? Double ?? 0.42)
        scale = CGFloat(b["scale"] as? Double ?? 1)
        let r = { (a: Any?) -> CGRect? in
            guard let a = a as? [Any], a.count == 4 else { return nil }
            let v = a.map { ($0 as? NSNumber)?.doubleValue ?? 0 }
            return CGRect(x: v[0], y: v[1], width: v[2], height: v[3])
        }
        area = r(b["area"]) ?? .zero
        exclude = (b["exclude"] as? [Any] ?? []).compactMap(r)
        pages = (b["pages"] as? [Any] ?? []).compactMap(r)
    }
    func allows(_ p: CGPoint) -> Bool { enabled && area.contains(p) && !exclude.contains { $0.contains(p) } }
}

/// 애플펜슬 터치만 받는 제스처. 펜·형광펜일 때 종이 위에서 시작한 획을 가져가고(웹에는 안 보냄), 아니면 바로 포기해서 웹이 받게 해요.
final class PencilInkGestureRecognizer: UIGestureRecognizer {
    var config = WebInkConfig()
    var onBegin: ((SIMD3<Double>) -> Void)?
    var onMove: (([SIMD3<Double>], [SIMD3<Double>]) -> Void)?
    var onEnd: (() -> Void)?
    var onCancel: (() -> Void)?
    private var touch: UITouch?

    override init(target: Any?, action: Selector?) {
        super.init(target: target, action: action)
        allowedTouchTypes = [NSNumber(value: UITouch.TouchType.pencil.rawValue)]
        cancelsTouchesInView = true
        delaysTouchesBegan = true
    }

    private func point(_ t: UITouch) -> SIMD3<Double> {
        let p = t.preciseLocation(in: view)
        let f = t.maximumPossibleForce > 0 ? Double(t.force / t.maximumPossibleForce) : 0.5
        return SIMD3(Double(p.x), Double(p.y), min(1, max(0.05, f)))
    }

    var moves = 0
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        moves = 0
        if let t = touches.first { print("[ink] touchesBegan type=\(t.type.rawValue) at=\(t.location(in: view)) allows=\(config.allows(t.location(in: view)))") }
        guard touch == nil, let t = touches.first, config.allows(t.location(in: view)) else {
            if touch == nil { state = .failed }
            return
        }
        touch = t
        state = .began
        onBegin?(point(t))
    }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let t = touch, touches.contains(t) else { return }
        moves += 1
        let pts = (event.coalescedTouches(for: t) ?? [t]).map(point)
        let pred = (event.predictedTouches(for: t) ?? []).map(point)
        onMove?(pts, pred)
        state = .changed
    }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let t = touch, touches.contains(t) else { return }
        print("[ink] ended moves=\(moves) state=\(state.rawValue)")
        onMove?([point(t)], [])
        onEnd?()
        state = .ended
    }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        guard let t = touch, touches.contains(t) else { return }
        print("[ink] cancelled moves=\(moves)")
        onCancel?()
        state = .cancelled
    }
    override func reset() { if touch != nil { print("[ink] reset moves=\(moves) state=\(state.rawValue)") }; super.reset(); touch = nil }
    // 웹뷰의 스크롤·제스처와 함께 인식 (손가락 스크롤은 그대로)
    override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}

/// 웹뷰 위에 얹는 투명한 그림 레이어 (진행 중인 한 획만)
final class WebInkOverlay: UIView {
    private let live = CAShapeLayer()
    var config = WebInkConfig()
    private(set) var pts: [SIMD3<Double>] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = .clear
        layer.addSublayer(live)
    }
    required init?(coder: NSCoder) { fatalError() }
    override func layoutSubviews() { super.layoutSubviews(); live.frame = bounds }

    // ---- 그리고 멈추면 도형 (굿노트처럼) ----
    // 펜을 떼지 않고 0.5초 멈추면 onHold 로 알려요. 도형이 되면 누른 채로 움직여 크기·각도(직선은 끝점)를 바꿔요
    var onHold: (([SIMD3<Double>]) -> Void)?
    private var holdTimer: Timer?
    private var holdAnchor: CGPoint = .zero
    private(set) var shaped = false
    private var shapeLine = false, shapeBase: [SIMD3<Double>] = [], shapeC = CGPoint.zero, shapeRef = CGPoint.zero
    private var shapeOpen: [CGPoint]? = nil, shapeMerge: Double = 14, shapeRot: Double = 0, shapeJoined = false
    private var drawOpts: [String: Double] { shaped ? config.opts.merging(["_raw": 1]) { a, _ in a } : config.opts }
    private func armHold(_ p: CGPoint) {
        holdAnchor = p
        holdTimer?.invalidate()
        holdTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { [weak self] _ in
            guard let self, !self.shaped, self.pts.count > 3 else { return }
            self.onHold?(self.pts)
        }
    }
    func applyShape(line: Bool, open: [CGPoint]? = nil, merge: Double = 14, rot: Double = 0, _ list: [SIMD3<Double>]) {
        guard !list.isEmpty, let last = pts.last else { return }
        shaped = true; shapeLine = line; shapeBase = list; shapeOpen = open; shapeMerge = merge; shapeRot = rot; shapeJoined = false
        let n = Double(list.count)
        shapeC = line ? CGPoint(x: list[0].x, y: list[0].y) : CGPoint(x: list.reduce(0) { $0 + $1.x } / n, y: list.reduce(0) { $0 + $1.y } / n)
        shapeRef = CGPoint(x: last.x, y: last.y)
        pts = list
        UIImpactFeedbackGenerator(style: .light).impactOccurred() // 도형이 됐다는 작은 진동
        redraw(predicted: [])
    }
    private func shapeAt(_ p: CGPoint) -> [SIMD3<Double>] {
        let c = shapeC, z = shapeBase.first?.z ?? 0.5
        if let vs0 = shapeOpen, vs0.count >= 2 {
            // 열린 꺾은선: 마지막 꼭짓점이 펜을 따라오고, 시작점에 가까이 가면 붙어서 닫혀요 (웹 shapeAt 과 같음)
            var vs = Array(vs0.dropLast())
            let s0 = vs[0]
            // 시작점에 한 번 붙으면 계속 붙어 있고, 그다음엔 붙은 꼭짓점(시작=끝)만 펜을 따라가요 (웹 shapeAt 과 같음, 11/23)
            if !shapeJoined && hypot(p.x - s0.x, p.y - s0.y) < shapeMerge { shapeJoined = true }
            if shapeJoined { vs[0] = p; vs.append(p) } else { vs.append(p) }
            var out: [SIMD3<Double>] = []
            for i in 0..<(vs.count - 1) {
                let a = vs[i], b = vs[i + 1], n = max(2, Int(ceil(hypot(b.x - a.x, b.y - a.y) / 6)))
                for j in (i == 0 ? 0 : 1)...n { let t = Double(j) / Double(n); out.append(SIMD3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z)) }
            }
            return out
        }
        if shapeLine {
            // 수평·수직에서 8° 안쪽이면 딱 맞춰요 (웹 axisSnap 과 같음)
            var e = p
            let dx = p.x - c.x, dy = p.y - c.y, L = hypot(dx, dy), t = atan2(dy, dx)
            for k in [0, Double.pi / 2, Double.pi, -Double.pi / 2, -Double.pi] where abs(t - k) < 8 * Double.pi / 180 {
                e = CGPoint(x: c.x + L * cos(k).rounded(), y: c.y + L * sin(k).rounded()); break
            }
            return (0...24).map { i in let t = Double(i) / 24; return SIMD3(c.x + (e.x - c.x) * t, c.y + (e.y - c.y) * t, z) }
        }
        // 닫힌 도형·원 (굿노트처럼, 웹 stretchShape 와 같음): 테두리 상자에서 펜 쪽 모서리를 잡고 대각선 반대 모서리는 고정
        let cs = cos(shapeRot), sn = sin(shapeRot)
        func toL(_ x: Double, _ y: Double) -> (Double, Double) { (x * cs + y * sn, -x * sn + y * cs) }
        var x0 = Double.infinity, x1 = -Double.infinity, y0 = Double.infinity, y1 = -Double.infinity
        for q in shapeBase { let (u, v) = toL(q.x, q.y); x0 = min(x0, u); x1 = max(x1, u); y0 = min(y0, v); y1 = max(y1, v) }
        let R = toL(shapeRef.x, shapeRef.y), Pn = toL(p.x, p.y)
        let hx = R.0 >= (x0 + x1) / 2 ? x1 : x0, hy = R.1 >= (y0 + y1) / 2 ? y1 : y0
        let ax = hx == x1 ? x0 : x1, ay = hy == y1 ? y0 : y1
        func lim(_ v: Double) -> Double { (v < 0 ? -1 : 1) * min(40, max(0.02, abs(v))) }
        let W = hx - ax, H = hy - ay
        var sx: Double? = abs(W) > 4 ? (Pn.0 - (R.0 - hx) - ax) / W : nil, sy: Double? = abs(H) > 4 ? (Pn.1 - (R.1 - hy) - ay) / H : nil
        if sx == nil { sx = sy ?? 1 }; if sy == nil { sy = sx }
        let kx = lim(sx!), ky = lim(sy!)
        _ = c
        return shapeBase.map { q in
            let (u, v) = toL(q.x, q.y); let X = ax + (u - ax) * kx, Y = ay + (v - ay) * ky
            return SIMD3(X * cs - Y * sn, X * sn + Y * cs, q.z)
        }
    }

    func begin(_ p: SIMD3<Double>) {
        shaped = false; holdTimer?.invalidate(); armHold(CGPoint(x: p.x, y: p.y))
        // 쓰기 시작한 종이 밖으로 나간 부분은 웹처럼 잘라서 안 보이게 해요 (노트 밖까지 선이 보였다 사라지던 것)
        let pt = CGPoint(x: p.x, y: p.y)
        let page = config.pages.first { $0.contains(pt) }
        clipRect = (page ?? config.area).intersection(config.area.isEmpty ? (page ?? .infinite) : config.area)
        CATransaction.begin(); CATransaction.setDisableActions(true) // 시작할 때 어떤 애니메이션도 없이 바로 보이게
        live.mask = clipMask()
        CATransaction.commit()
        pts = [p]; redraw(predicted: [])
    }
    private var clipRect: CGRect = .null
    private func clipMask() -> CALayer? {
        guard !clipRect.isNull, !clipRect.isInfinite, !clipRect.isEmpty else { return nil }
        let m = CALayer(); m.backgroundColor = UIColor.black.cgColor; m.frame = clipRect
        return m
    }
    func add(_ list: [SIMD3<Double>], predicted: [SIMD3<Double>]) {
        if shaped {
            if let p = list.last { pts = shapeAt(CGPoint(x: p.x, y: p.y)); redraw(predicted: []) }
            return
        }
        if let p = list.last, hypot(p.x - holdAnchor.x, p.y - holdAnchor.y) > 3 { armHold(CGPoint(x: p.x, y: p.y)) }
        for p in list {
            if let l = pts.last { let dx = p.x - l.x, dy = p.y - l.y; if dx * dx + dy * dy < 0.25 { continue } }
            pts.append(p)
        }
        redraw(predicted: predicted)
    }
    // 펜을 뗀 획은 웹이 노트에 그릴 때까지 잠깐 남겨 둬요 (바로 지우면 한 번 깜빡였어요)
    private var pending: [CAShapeLayer] = []
    @discardableResult func commit() -> CAShapeLayer {
        let l = CAShapeLayer()
        l.frame = live.frame
        l.path = live.path; l.fillColor = live.fillColor; l.strokeColor = live.strokeColor
        if config.tool != .highlighter, !pts.isEmpty {
            // 펜을 뗀 뒤 모양(끝 가늘어짐 포함)으로 바꿔 둬요. 웹이 그린 선과 똑같아서 넘어갈 때 달라 보이지 않아요
            var flat: [Double] = []
            for p in pts { flat += [p.x, p.y, p.z] }
            let st = LumenStroke(tool: config.tool, style: config.style, opts: drawOpts, color: config.color,
                                 width: config.width * Double(config.scale), pts: flat)
            l.path = lumenPenPath(st, live: false)
        }
        if config.tool == .highlighter, !pts.isEmpty {
            // 펜을 뗀 모양(예측 점 없이)으로 바꿔 둬요. 웹이 그릴 완성본과 같아요
            var flat: [Double] = []
            for p in pts { flat += [p.x, p.y, 0.5] }
            l.path = lumenHlWebPath(flat, stab: config.hlStab, k: Double(config.scale), shaped: shaped, hlWidth: config.width * Double(config.scale))
        }
        l.lineWidth = live.lineWidth; l.lineCap = live.lineCap; l.lineJoin = live.lineJoin
        l.compositingFilter = live.compositingFilter
        l.mask = clipMask()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        layer.insertSublayer(l, below: live)
        live.path = nil
        CATransaction.commit()
        pending.append(l)
        pts = []
        holdTimer?.invalidate(); shaped = false
        return l
    }
    /// 웹이 다 그렸다고 알려 주면 가장 오래된 남겨 둔 획을 지워요
    func dropOldestPending() {
        guard !pending.isEmpty else { return }
        let l = pending.removeFirst()
        // 형광펜은 반투명이라 웹 획과 겹치는 순간 진해졌다 옅어져서 깜빡여 보였어요. 아주 짧게 흐려지며 사라지게 해요
        if l.compositingFilter != nil { // 웹 획이 서서히 나타나는 동안(0.16초) 같이 서서히 사라져요
            CATransaction.begin()
            CATransaction.setCompletionBlock { l.removeFromSuperlayer() }
            let a = CABasicAnimation(keyPath: "opacity"); a.fromValue = 1; a.toValue = 0; a.duration = 0.16
            l.opacity = 0; l.add(a, forKey: "fade")
            CATransaction.commit()
        } else {
            // 웹 그림이 화면에 실제로 올라오기까지 조금 걸릴 때가 있어서, 아주 잠깐 겹쳐 둔 뒤 지워요 (펜은 불투명해서 겹쳐도 티가 안 나요)
            // 바로 지우면 웹 그림이 늦게 올라올 때 사라졌다 나타나고, 그대로 겹쳐 두면 가장자리가 겹쳐 살짝 굵어 보여요.
            // 그래서 겹치는 동안 앱 쪽 선을 서서히 옅게 해서 지워요
            CATransaction.begin()
            CATransaction.setCompletionBlock { l.removeFromSuperlayer() }
            let a = CABasicAnimation(keyPath: "opacity"); a.fromValue = 1; a.toValue = 0; a.duration = 0.16
            a.timingFunction = CAMediaTimingFunction(name: .easeOut)
            l.opacity = 0; l.add(a, forKey: "fade")
            CATransaction.commit()
        }
    }
    func drop(_ l: CAShapeLayer) { if let i = pending.firstIndex(of: l) { pending.remove(at: i); remove(l) } }
    private func remove(_ l: CAShapeLayer) {
        CATransaction.begin(); CATransaction.setDisableActions(true); l.removeFromSuperlayer(); CATransaction.commit()
    }
    func clear() {
        pts = []; holdTimer?.invalidate(); shaped = false
        CATransaction.begin(); CATransaction.setDisableActions(true); live.path = nil; CATransaction.commit()
    }

    private func redraw(predicted: [SIMD3<Double>]) {
        // 화면 좌표 그대로 그려요: 굵기만 종이 배율을 곱하면 웹에서 그린 것과 같은 모양
        var flat: [Double] = []
        for p in pts + predicted { flat += [p.x, p.y, config.tool == .highlighter ? 0.5 : p.z] }
        let s = LumenStroke(tool: config.tool, style: config.style, opts: drawOpts, color: config.color,
                            width: config.width * Double(config.scale), pts: flat)
        CATransaction.begin(); CATransaction.setDisableActions(true)
        let color = UIColor(hexString: config.color)
        if config.tool == .highlighter {
            live.path = lumenHlWebPath(flat, stab: config.hlStab, k: Double(config.scale), shaped: shaped, hlWidth: config.width * Double(config.scale))
            live.fillColor = nil
            live.strokeColor = color.withAlphaComponent(config.hlAlpha).cgColor
            live.lineWidth = CGFloat(s.width)
            live.lineCap = .round; live.lineJoin = .round
            live.compositingFilter = "multiplyBlendMode"
        } else {
            live.path = lumenPenPath(s, live: true)
            live.fillColor = color.cgColor
            live.strokeColor = nil
            live.compositingFilter = nil
        }
        CATransaction.commit()
    }
}

// MARK: - 굵기 슬라이더 창 (웹 노트에서 고른 굵기를 한 번 더 누르면, 진짜 iPad 슬라이더로)

final class LumenSizeSliderViewController: UIViewController {
    private let titleText: String, minV: Double, maxV: Double, step: Double, defaultV: Double
    private var value: Double
    var onChange: ((Double, Bool) -> Void)?   // (값, 다 바꿨는지)
    private let slider = UISlider()
    private let valueLabel = UILabel()

    init(title: String, value: Double, min: Double, max: Double, step: Double, defaultValue: Double) {
        titleText = title; self.value = value; minV = min; maxV = max; self.step = step; defaultV = defaultValue
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError() }

    private func fmt(_ v: Double) -> String { step < 1 ? String(format: "%.1f", v) : String(Int(v.rounded())) }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        view.tintColor = .label // 디자인 규칙: 포인트 색 없이 검정(다크는 흰색)
        let title = UILabel(); title.text = titleText; title.font = .systemFont(ofSize: 15, weight: .semibold); title.textColor = .lumenTextPrimary
        slider.minimumValue = Float(minV); slider.maximumValue = Float(maxV); slider.value = Float(value)
        slider.addTarget(self, action: #selector(changed), for: .valueChanged)
        slider.addTarget(self, action: #selector(done), for: [.touchUpInside, .touchUpOutside, .touchCancel])
        valueLabel.text = fmt(value); valueLabel.font = .monospacedDigitSystemFont(ofSize: 13, weight: .medium); valueLabel.textColor = .lumenTextPrimary
        valueLabel.widthAnchor.constraint(equalToConstant: 36).isActive = true
        valueLabel.textAlignment = .right
        let row = UIStackView(arrangedSubviews: [slider, valueLabel]); row.spacing = 12; row.alignment = .center
        let reset = UIButton(type: .system); reset.setTitle("기본값으로", for: .normal); reset.contentHorizontalAlignment = .leading
        reset.addTarget(self, action: #selector(resetTapped), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [title, row, reset]); stack.axis = .vertical; stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
        ])
        preferredContentSize = CGSize(width: 280, height: 140)
    }
    @objc private func changed() {
        value = (Double(slider.value) / step).rounded() * step
        valueLabel.text = fmt(value)
        onChange?(value, false)
    }
    @objc private func done() { onChange?(value, true) }
    @objc private func resetTapped() { value = defaultV; slider.setValue(Float(value), animated: true); valueLabel.text = fmt(value); onChange?(value, true) }
}


// 피그마·웹과 같은 색 토큰 (css/app.css): 라이트 / 다크
extension UIColor {
    private static func lumen(_ light: String, _ dark: String) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? UIColor(hexString: dark) : UIColor(hexString: light) }
    }
    static let lumenPanel = lumen("#ffffff", "#1e1e1e")          // bg/panel
    static let lumenTextPrimary = lumen("#111111", "#fafafa")    // text/primary
    static let lumenTextSecondary = lumen("#555555", "#b5b5b5")  // text/secondary
}

/// 크기가 바뀔 때마다 알려 주는 뷰 (펜 설정 미리보기용)
final class LayoutNotifyingView: UIView {
    var onLayout: (() -> Void)?
    private var last: CGSize = .zero
    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.size != last { last = bounds.size; onLayout?() }
    }
}
