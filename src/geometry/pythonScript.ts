export const PYTHON_STUDIO_SOURCE = `"""
Similitude Studio — Standalone Desktop Geometry Application (PySide6)
=====================================================================
Run:
    pip install PySide6
    python similitude_studio.py
"""

import math
import sys
from dataclasses import dataclass, field
from typing import List, Tuple

from PySide6.QtCore import QPointF, QRectF, Qt, QTimer
from PySide6.QtGui import QColor, QPainter, QPainterPath, QPen, QPolygonF
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QColorDialog,
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QSlider,
    QVBoxLayout,
    QWidget,
)


@dataclass
class TwinConfig:
    scale: float = 1.35
    invert: bool = False
    rotation_deg: float = 0.0
    flip_x: bool = False
    flip_y: bool = False
    echo_count: int = 1
    color_hex: str = "#2563EB"
    fill_opacity: float = 0.24
    stroke_width: float = 2.6


@dataclass
class StudioModel:
    mode: str = "split"  # "split" | "homothety" | "overlay"
    tool: str = "brush"  # "brush" | "polygon"
    points: List[QPointF] = field(default_factory=list)
    is_closed: bool = True
    is_smooth: bool = True
    homothety_center: QPointF = field(default_factory=lambda: QPointF(-180.0, 15.0))
    twin: TwinConfig = field(default_factory=TwinConfig)


def polygon_signed_area(pts: List[QPointF]) -> float:
    if len(pts) < 3:
        return 0.0
    acc = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        acc += a.x() * b.y() - b.x() * a.y()
    return 0.5 * acc


def polygon_centroid(pts: List[QPointF]) -> QPointF:
    if not pts:
        return QPointF(0.0, 0.0)
    if len(pts) < 3:
        return QPointF(sum(p.x() for p in pts) / len(pts), sum(p.y() for p in pts) / len(pts))
    s = polygon_signed_area(pts)
    if abs(s) < 1e-3:
        return QPointF(sum(p.x() for p in pts) / len(pts), sum(p.y() for p in pts) / len(pts))
    cx = cy = 0.0
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        cross = a.x() * b.y() - b.x() * a.y()
        cx += (a.x() + b.x()) * cross
        cy += (a.y() + b.y()) * cross
    return QPointF(cx / (6.0 * s), cy / (6.0 * s))


def transform_point(p: QPointF, model: StudioModel, centroid: QPointF) -> QPointF:
    k = -model.twin.scale if model.twin.invert else model.twin.scale
    if model.mode == "split":
        v = p
        origin = QPointF(0.0, 0.0)
    elif model.mode == "homothety":
        origin = model.homothety_center
        v = p - origin
    else:
        origin = centroid
        v = p - origin

    vx = (-v.x() if model.twin.flip_x else v.x()) * k
    vy = (-v.y() if model.twin.flip_y else v.y()) * k
    rad = math.radians(model.twin.rotation_deg)
    c, s = math.cos(rad), math.sin(rad)
    return QPointF(origin.x() + vx * c - vy * s, origin.y() + vx * s + vy * c)


def build_smooth_path(pts: List[QPointF], closed: bool, smooth: bool) -> QPainterPath:
    path = QPainterPath()
    if not pts:
        return path
    if not smooth or len(pts) < 3:
        path.moveTo(pts[0])
        for p in pts[1:]:
            path.lineTo(p)
        if closed and len(pts) >= 3:
            path.closeSubpath()
        return path
    if closed:
        start_mid = QPointF(0.5 * (pts[-1].x() + pts[0].x()), 0.5 * (pts[-1].y() + pts[0].y()))
        path.moveTo(start_mid)
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            path.quadTo(a, QPointF(0.5 * (a.x() + b.x()), 0.5 * (a.y() + b.y())))
        path.closeSubpath()
    else:
        path.moveTo(pts[0])
        for i in range(1, len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            path.quadTo(a, QPointF(0.5 * (a.x() + b.x()), 0.5 * (a.y() + b.y())))
        path.lineTo(pts[-1])
    return path


class GeometryCanvas(QWidget):
    def __init__(self, model: StudioModel, on_change):
        super().__init__()
        self.model = model
        self.on_change = on_change
        self.live_stroke: List[QPointF] = []
        self.dragging_o = False
        self.setMouseTracking(True)

    def _boards(self) -> Tuple[QRectF, QRectF]:
        w, h = float(self.width()), float(self.height())
        if self.model.mode == "split":
            bw = (w - 56.0) * 0.5
            return QRectF(20, 16, bw, h - 32), QRectF(36 + bw, 16, bw, h - 32)
        return QRectF(20, 16, w - 40, h - 32), QRectF(20, 16, w - 40, h - 32)

    def mousePressEvent(self, event):
        left_b, _ = self._boards()
        pos = event.position()
        if self.model.mode == "homothety":
            o_s = left_b.center() + self.model.homothety_center
            if math.hypot(pos.x() - o_s.x(), pos.y() - o_s.y()) <= 14.0:
                self.dragging_o = True
                return
        if event.button() == Qt.MouseButton.LeftButton and left_b.contains(pos):
            wp = pos - left_b.center()
            if self.model.tool == "brush":
                self.live_stroke = [wp]
            else:
                self.model.is_smooth = False
                self.model.is_closed = True
                self.model.points.append(wp)
            self.on_change()
            self.update()

    def mouseMoveEvent(self, event):
        left_b, _ = self._boards()
        pos = event.position()
        if self.dragging_o:
            self.model.homothety_center = pos - left_b.center()
            self.update()
            return
        if self.live_stroke:
            wp = pos - left_b.center()
            if math.hypot(wp.x() - self.live_stroke[-1].x(), wp.y() - self.live_stroke[-1].y()) >= 3.5:
                self.live_stroke.append(wp)
                self.update()

    def mouseReleaseEvent(self, event):
        if self.dragging_o:
            self.dragging_o = False
            return
        if self.live_stroke:
            if len(self.live_stroke) >= 3:
                self.model.points = list(self.live_stroke)
                self.model.is_closed = True
                self.model.is_smooth = True
            self.live_stroke.clear()
            self.on_change()
            self.update()

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        p.fillRect(self.rect(), QColor("#F6F7F9"))
        left_b, right_b = self._boards()

        for b in ([left_b, right_b] if self.model.mode == "split" else [left_b]):
            p.setPen(QPen(QColor("#E2E8F0"), 1.2))
            p.setBrush(QColor("#FFFFFF"))
            p.drawRoundedRect(b, 16, 16)

        pts = self.live_stroke if self.live_stroke else self.model.points
        if not pts:
            return
        closed = False if self.live_stroke else self.model.is_closed
        smooth = True if self.live_stroke else self.model.is_smooth
        cent = polygon_centroid(pts)
        twin_pts = [transform_point(pt, self.model, cent) for pt in pts]

        if self.model.mode == "homothety":
            o_s = left_b.center() + self.model.homothety_center
            p.setPen(QPen(QColor("#D97706"), 1.1, Qt.PenStyle.DashLine))
            for a, b in zip(pts, twin_pts):
                p.drawLine(o_s, left_b.center() + a)
                p.drawLine(o_s, left_b.center() + b)
            p.setBrush(QColor("#D97706"))
            p.drawEllipse(o_s, 5.5, 5.5)

        src_screen = [left_b.center() + pt for pt in pts]
        p.setPen(QPen(QColor("#111827"), 2.3))
        p.setBrush(QColor(15, 23, 42, 24) if closed else Qt.BrushStyle.NoBrush)
        p.drawPath(build_smooth_path(src_screen, closed, smooth))

        tw_color = QColor(self.model.twin.color_hex)
        for m in range(self.model.twin.echo_count - 1, -1, -1):
            ratio = 0.77 ** m
            t_cent = polygon_centroid(twin_pts)
            echo_pts = [right_b.center() + t_cent + (pt - t_cent) * ratio for pt in twin_pts]
            col = QColor(tw_color)
            col.setAlphaF(1.0 if m == 0 else max(0.18, 0.55 * (0.72 ** m)))
            fill = QColor(col)
            fill.setAlphaF(self.model.twin.fill_opacity * (1.0 if m == 0 else 0.5))
            p.setPen(QPen(col, self.model.twin.stroke_width))
            p.setBrush(fill if closed else Qt.BrushStyle.NoBrush)
            p.drawPath(build_smooth_path(echo_pts, closed, smooth))


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Similitude Studio — Desktop Edition")
        self.resize(1320, 820)
        self.model = StudioModel()
        self.model.points = [QPointF(-95, 72), QPointF(-24, -96), QPointF(108, 56)]
        self.model.is_smooth = False

        root = QWidget()
        self.setCentralWidget(root)
        lay = QHBoxLayout(root)
        self.canvas = GeometryCanvas(self.model, self.update_metrics)
        lay.addWidget(self.canvas, 1)

        panel = QFrame()
        panel.setFixedWidth(290)
        p_lay = QVBoxLayout(panel)
        self.lbl_metrics = QLabel()
        p_lay.addWidget(self.lbl_metrics)

        mode_box = QComboBox()
        mode_box.addItems(["split", "homothety", "overlay"])
        mode_box.currentTextChanged.connect(lambda m: self._set_mode(m))
        p_lay.addWidget(mode_box)

        scale_sl = QSlider(Qt.Orientation.Horizontal)
        scale_sl.setRange(15, 250)
        scale_sl.setValue(135)
        scale_sl.valueChanged.connect(lambda v: self._set_scale(v / 100.0))
        p_lay.addWidget(QLabel("Scale Factor |k|"))
        p_lay.addWidget(scale_sl)

        rot_sl = QSlider(Qt.Orientation.Horizontal)
        rot_sl.setRange(-180, 180)
        rot_sl.setValue(0)
        rot_sl.valueChanged.connect(lambda v: self._set_rot(float(v)))
        p_lay.addWidget(QLabel("Rotation (deg)"))
        p_lay.addWidget(rot_sl)

        inv_cb = QCheckBox("Invert Scale (-k)")
        inv_cb.toggled.connect(lambda c: self._set_invert(c))
        p_lay.addWidget(inv_cb)

        col_btn = QPushButton("Choose Twin Color")
        col_btn.clicked.connect(self._pick_color)
        p_lay.addWidget(col_btn)

        clr_btn = QPushButton("Clear Canvas")
        clr_btn.clicked.connect(self._clear)
        p_lay.addWidget(clr_btn)
        p_lay.addStretch()

        lay.addWidget(panel)
        self.update_metrics()

    def _set_mode(self, m: str):
        self.model.mode = m
        self.canvas.update()

    def _set_scale(self, s: float):
        self.model.twin.scale = s
        self.update_metrics()
        self.canvas.update()

    def _set_rot(self, deg: float):
        self.model.twin.rotation_deg = deg
        self.canvas.update()

    def _set_invert(self, c: bool):
        self.model.twin.invert = c
        self.update_metrics()
        self.canvas.update()

    def _pick_color(self):
        c = QColorDialog.getColor(QColor(self.model.twin.color_hex), self)
        if c.isValid():
            self.model.twin.color_hex = c.name()
            self.canvas.update()

    def _clear(self):
        self.model.points.clear()
        self.update_metrics()
        self.canvas.update()

    def update_metrics(self):
        k = -self.model.twin.scale if self.model.twin.invert else self.model.twin.scale
        area = abs(polygon_signed_area(self.model.points)) if self.model.is_closed else 0.0
        self.lbl_metrics.setText(f"Scale k = {k:.2f}x\\nArea Ratio k^2 = {k*k:.2f}x\\nArea: {area:.1f} -> {area*k*k:.1f}")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    win = MainWindow()
    win.show()
    sys.exit(app.exec())
`;
