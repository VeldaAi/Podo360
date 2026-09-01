#!/usr/bin/env python3
"""Podo360 AI photo alignment.

Given two photos of the same wound (before/after), compute similarity
transforms that CENTER THE WOUND (0-point) IN BOTH IMAGES on a common
canvas, at matching scale/orientation, so blend overlays line up almost
exactly — the wound stays in the same spot while dragging the divider.

Alignment strategy (priority):
  1. AI mask centroid — if both images have an ai_overlay wound mask, the
     wound's center of mass is the "0 point". Compute centroid + bounding-box
     scale + principal-axis rotation from each mask and align on those.
  2. ORB feature matching fallback — if masks are missing, match ORB
     keypoints with RANSAC homography; use the centroid of matched
     keypoints as the "similar point" 0-point in each image; if enough
     inliers, use the affine estimate, else fall back to plain center+scale.
  3. center fallback — resize both to fit the canvas and center them.

Input (argv): JSON string
  {
    "before": "/abs/path/before.jpg",
    "after":  "/abs/path/after.jpg",
    "before_mask": "/abs/path/mask1.png" | null,
    "after_mask":  "/abs/path/mask2.png" | null,
    "max_dim": 900            # optional, downscale for speed
  }

Output (stdout): JSON
  {
    "ok": true,
    "aligned_before_b64": "data:image/jpeg;base64,...",  # before centered on wound
    "aligned_after_b64":  "data:image/jpeg;base64,...",  # after centered on wound
    "aligned_b64": "data:image/jpeg;base64,...",         # alias of aligned_after (back-compat)
    "before_center": [x, y],   # wound 0-point on canvas (== canvas center)
    "after_center":  [x, y],   # wound 0-point on canvas (== canvas center)
    "scale": 1.24, "angle": -3.2, "tx": 12.0, "ty": -8.0,
    "method": "mask" | "orb" | "center",
    "canvas_size": [w, h],
    "before_size": [w, h],     # canvas size (for frontend % math)
    "after_size": [w, h],      # canvas size
    "conf": 0.87
  }
"""
import sys, json, base64
import numpy as np
import cv2

def load_img(path, max_dim=900):
    img = cv2.imread(path)
    if img is None:
        return None
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        s = max_dim / float(max(h, w))
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img

def load_mask(path):
    """Return a binary mask (0/255 uint8) + original dims from a PNG path."""
    if not path:
        return None
    m = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if m is None:
        return None
    _, m = cv2.threshold(m, 20, 255, cv2.THRESH_BINARY)
    return m

def mask_geom(mask):
    """Centroid (cx, cy), bbox (w, h), principal-axis angle (deg) of the mask."""
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    M = cv2.moments(c)
    if M["m00"] == 0:
        return None
    cx = M["m10"] / M["m00"]
    cy = M["m01"] / M["m00"]
    x, y, w, h = cv2.boundingRect(c)
    # principal axis via PCA on contour points
    pts = c.reshape(-1, 2).astype(np.float32)
    mean, eigvec, eigval = cv2.PCACompute2(pts, None, maxComponents=2)
    angle = np.degrees(np.arctan2(eigvec[0][1], eigvec[0][0]))
    return {"cx": cx, "cy": cy, "w": w, "h": h, "angle": angle}

def orb_align(before, after):
    """Try ORB + RANSAC homography; return dict with H + matched-point
    centroids + conf, or None."""
    orb = cv2.ORB_create(2000)
    k1, d1 = orb.detectAndCompute(before, None)
    k2, d2 = orb.detectAndCompute(after, None)
    if d1 is None or d2 is None or len(k1) < 8 or len(k2) < 8:
        return None
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    matches = bf.knnMatch(d1, d2, k=2)
    good = [m for m, n in matches if m.distance < 0.75 * n.distance] if matches else []
    if len(good) < 8:
        return None
    src = np.float32([k1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([k2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, inl = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
    if H is None or inl is None or inl.sum() < 8:
        return None
    inl_mask = inl.ravel().astype(bool)
    conf = float(inl.sum()) / len(good)
    # matched-point centroids = the "similar point" 0-point in each image
    c1 = src[inl_mask].reshape(-1, 2).mean(axis=0)
    c2 = dst[inl_mask].reshape(-1, 2).mean(axis=0)
    # scale from matched-point spread ratio (robust to outlier homography)
    d1_ = np.linalg.norm(src[inl_mask].reshape(-1, 2) - c1, axis=1)
    d2_ = np.linalg.norm(dst[inl_mask].reshape(-1, 2) - c2, axis=1)
    spread1 = float(np.median(d1_)) or 1.0
    spread2 = float(np.median(d2_)) or 1.0
    # H maps before->after (src=before kp, dst=after kp); we want after->before
    Hinv = np.linalg.inv(H)
    s = np.sqrt(max(abs(np.linalg.det(Hinv[:2, :2])), 1e-6))
    ang = np.degrees(np.arctan2(Hinv[1, 0], Hinv[0, 0]))
    return {"H": Hinv, "conf": conf, "scale": s, "angle": ang,
            "before_pt": c1.tolist(), "after_pt": c2.tolist(),
            "spread_before": spread1, "spread_after": spread2}

def center_both(before, after, params, canvas=None):
    """Build two similarity (2x3) matrices that map each image's wound
    0-point to the CANVAS CENTER. params has before_pt/after_pt in each
    image's pixel space + before_w/after_w (mask bbox widths) or spread.
    Returns (aligned_before, aligned_after, M_b, M_a, scale, angle, tx, ty)."""
    bh, bw = before.shape[:2]
    ah, aw = after.shape[:2]
    if canvas is None:
        # common canvas: square-ish, sized from the larger image
        cw = max(bw, aw)
        ch = max(bh, ah)
    else:
        cw, ch = canvas
    # scale the AFTER so its wound bbox/spread matches the BEFORE's
    if params.get("after_w") and params.get("before_w"):
        sc = params["before_w"] / float(params["after_w"])
    elif params.get("spread_after") and params.get("spread_before"):
        sc = params["spread_before"] / float(params["spread_after"])
    else:
        sc = min(cw / float(aw), ch / float(ah)) if aw and ah else 1.0
    sc = max(0.2, min(sc, 5.0))
    rot = np.radians(params.get("angle", 0.0))
    # center of canvas = target for BOTH wounds
    cc = np.float32([cw / 2.0, ch / 2.0])
    # BEFORE: translate its 0-point to canvas center (no scale/rotation)
    pb = np.float32(params["before_pt"])
    M_b = np.float32([[1, 0, cc[0] - pb[0]], [0, 1, cc[1] - pb[1]]])
    # AFTER: scale+rotate about its 0-point, then translate to canvas center
    pa = np.float32(params["after_pt"])
    R = np.array([[np.cos(rot) * sc, -np.sin(rot) * sc],
                  [np.sin(rot) * sc, np.cos(rot) * sc]], dtype=np.float32)
    t = cc - R @ pa
    M_a = np.hstack([R, t.reshape(-1, 1)])
    aligned_before = cv2.warpAffine(before, M_b, (cw, ch), flags=cv2.INTER_LINEAR,
                                    borderMode=cv2.BORDER_CONSTANT, borderValue=(20, 22, 28))
    aligned_after = cv2.warpAffine(after, M_a, (cw, ch), flags=cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_CONSTANT, borderValue=(20, 22, 28))
    return aligned_before, aligned_after, M_b, M_a, sc, np.degrees(rot)

def main():
    cfg = json.loads(sys.argv[1])
    before = load_img(cfg["before"], cfg.get("max_dim", 900))
    after = load_img(cfg["after"], cfg.get("max_dim", 900))
    if before is None or after is None:
        print(json.dumps({"ok": False, "error": "image load failed"}))
        return
    bm = load_mask(cfg.get("before_mask"))
    am = load_mask(cfg.get("after_mask"))

    def clean(d):
        return json.loads(json.dumps(d, default=lambda o: float(o) if isinstance(o, (np.floating, np.integer)) else str(o)))

    bh, bw = before.shape[:2]
    ah, aw = after.shape[:2]
    cw, ch = max(bw, aw), max(bh, ah)
    out = clean({"ok": False, "canvas_size": [cw, ch],
                 "before_size": [cw, ch], "after_size": [cw, ch]})

    params = None
    method = None
    conf = 0.0

    # 1) mask-based alignment
    if bm is not None and am is not None:
        bg, ag = mask_geom(bm), mask_geom(am)
        if bg and ag:
            # Rotation from PCA is only stable when the wound is clearly
            # elongated (bbox aspect ratio high); round-ish wounds make PCA
            # arbitrary (any angle is "right"), so skip rotation for them.
            def elong(g):
                return max(g["w"], g["h"]) / float(max(1, min(g["w"], g["h"])))
            eb, ea = elong(bg), elong(ag)
            rot_deg = (bg["angle"] - ag["angle"]) if (eb > 1.5 and ea > 1.5) else 0.0
            params = {"before_pt": [bg["cx"], bg["cy"]], "after_pt": [ag["cx"], ag["cy"]],
                      "before_w": bg["w"], "after_w": ag["w"], "angle": rot_deg}
            method, conf = "mask", 0.9

    # 2) ORB feature fallback
    if params is None:
        o = orb_align(before, after)
        if o:
            params = {"before_pt": o["before_pt"], "after_pt": o["after_pt"],
                      "spread_before": o["spread_before"], "spread_after": o["spread_after"],
                      "angle": o["angle"]}
            method, conf = "orb", o["conf"]

    # 3) plain center fallback
    if params is None:
        params = {"before_pt": [bw / 2.0, bh / 2.0], "after_pt": [aw / 2.0, ah / 2.0],
                  "before_w": min(bw, bh) * 0.5, "after_w": min(aw, ah) * 0.5, "angle": 0.0}
        method, conf = "center", 0.3

    alb, ala, M_b, M_a, sc, ang = center_both(before, after, params, canvas=(cw, ch))
    okb, bufb = cv2.imencode(".jpg", alb, [cv2.IMWRITE_JPEG_QUALITY, 88])
    oka, bufa = cv2.imencode(".jpg", ala, [cv2.IMWRITE_JPEG_QUALITY, 88])
    b64b = "data:image/jpeg;base64," + base64.b64encode(bufb.tobytes()).decode()
    b64a = "data:image/jpeg;base64," + base64.b64encode(bufa.tobytes()).decode()
    out.update({
        "ok": True, "method": method, "conf": round(conf, 3),
        "aligned_before_b64": b64b, "aligned_after_b64": b64a, "aligned_b64": b64a,
        "before_center": [cw / 2.0, ch / 2.0], "after_center": [cw / 2.0, ch / 2.0],
        "scale": round(sc, 4), "angle": round(ang, 2),
        "tx": round(float(M_a[0, 2]), 2), "ty": round(float(M_a[1, 2]), 2),
    })
    print(json.dumps(clean(out)))

if __name__ == "__main__":
    main()
