"""
Simulates the built `build:preview` extension calling the REMOTE preview API.
Every call hits https://2a64ea27-...preview.emergentagent.com/api — the same
URL the extension bundle uses when built with `yarn build:preview`.
"""
import io
import sys
import time

import requests

BASE = "https://2a64ea27-33c2-473c-a9a2-fbd58963d474.preview.emergentagent.com/api"
EMAIL = f"ext-preview-{int(time.time())}@example.com"
PASSWORD = "extpreview123"

TERMS = (
    "By accessing or using our Service, you agree to be bound by these Terms of "
    "Service and Privacy Policy. We collect personal data including your name, "
    "email address, phone number, IP address, device identifiers, browsing "
    "history, and precise geolocation. We may share this information with "
    "third-party advertisers, analytics providers, and affiliate partners. "
    "We reserve the right to modify these Terms at any time without prior notice. "
    "You hereby waive any right to participate in class-action litigation and "
    "agree to binding individual arbitration. The Service is provided AS-IS "
    "without warranties. We are not liable for any direct, indirect, incidental, "
    "or consequential damages. You grant us a perpetual, irrevocable, worldwide, "
    "royalty-free license to use, modify, distribute, and display any content "
    "you upload. Your account may be terminated at our sole discretion."
)


def step(n, label):
    print(f"\n───── {n}. {label} " + "─" * max(2, (60 - len(label))))


def ok(msg):
    print(f"  ✓ {msg}")


def fail(msg):
    print(f"  ✗ {msg}")
    sys.exit(1)


def main():
    s = requests.Session()

    step(1, "POST /api/signup")
    r = s.post(f"{BASE}/signup", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        fail(f"signup failed: {r.status_code} {r.text}")
    ok(f"account created: {EMAIL}")

    step(2, "POST /api/login")
    r = s.post(f"{BASE}/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    if r.status_code != 200:
        fail(f"login failed: {r.status_code} {r.text}")
    data = r.json()
    access, refresh = data["access"], data["refresh"]
    ok(f"got JWT (access {access[:20]}..., refresh {refresh[:20]}...)")

    auth = {"Authorization": f"Bearer {access}"}

    step(3, "GET /api/me")
    r = s.get(f"{BASE}/me", headers=auth, timeout=30)
    if r.status_code != 200:
        fail(f"me failed: {r.status_code} {r.text}")
    ok(f"user: {r.json()}")

    step(4, "POST /api/classify-page")
    r = s.post(f"{BASE}/classify-page", json={"text": TERMS}, headers=auth, timeout=30)
    if r.status_code != 200:
        fail(f"classify failed: {r.status_code} {r.text}")
    ok(f"{r.json()}")

    step(5, "POST /api/analyze-terms  (Scan page)")
    r = s.post(f"{BASE}/analyze-terms",
               json={"terms": TERMS, "document_url": "https://example.com/tos"},
               headers=auth, timeout=90)
    if r.status_code != 200:
        fail(f"analyze failed: {r.status_code} {r.text}")
    a = r.json()
    ok(f"risk_score={a['risk_score']}  items={len(a['result'])}")
    for i, row in enumerate(a["result"][:3], 1):
        print(f"     [{i}] {row['risktype'].upper():<6} {row['lineSummary']}")
    if len(a["result"]) > 3:
        print(f"     ... and {len(a['result']) - 3} more")

    step(6, "POST /api/upload-terms  (Upload document)")
    files = {"file": ("sample-tos.txt", io.BytesIO(TERMS.encode()), "text/plain")}
    form = {"masking_mode": "false"}
    r = s.post(f"{BASE}/upload-terms", files=files, data=form, headers=auth, timeout=90)
    if r.status_code != 200:
        fail(f"upload failed: {r.status_code} {r.text}")
    u = r.json()
    ok(f"parsed {len(u.get('terms_text',''))} chars  risk_score={u['risk_score']}  items={len(u['result'])}")

    step(7, "POST /api/upload-terms masking=true")
    files = {"file": ("sample-tos.txt",
                      io.BytesIO((TERMS + " Contact: support@acme.com or +1-415-555-0100.").encode()),
                      "text/plain")}
    form = {"masking_mode": "true"}
    r = s.post(f"{BASE}/upload-terms", files=files, data=form, headers=auth, timeout=90)
    if r.status_code != 200:
        fail(f"masked upload failed: {r.status_code} {r.text}")
    m = r.json()
    ok(f"masking_preview={m.get('masking_preview')}  notice_present={bool(m.get('notice'))}")
    print(f"     …{(m.get('terms_text') or '')[-100:]!r}")

    step(8, "POST /api/chatbot  (Anee Q&A)")
    r = s.post(f"{BASE}/chatbot",
               json={"message": "Can they change the terms without telling me?", "terms_text": TERMS},
               headers=auth, timeout=90)
    if r.status_code != 200:
        fail(f"chatbot failed: {r.status_code} {r.text}")
    reply = r.json().get("reply", "")
    ok(f"reply: {reply[:160]}{'…' if len(reply) > 160 else ''}")

    step(9, "POST /api/token/refresh")
    r = s.post(f"{BASE}/token/refresh", json={"refresh": refresh}, timeout=30)
    if r.status_code != 200:
        fail(f"refresh failed: {r.status_code} {r.text}")
    ok(f"new access: {r.json()['access'][:20]}...")

    step(10, "POST /api/logout")
    r = s.post(f"{BASE}/logout", json={"refresh": refresh}, headers=auth, timeout=30)
    if r.status_code != 200:
        fail(f"logout failed: {r.status_code} {r.text}")
    ok("logged out")

    print("\n══════════════════════════════════════════════════════════")
    print("  PREVIEW-API EXTENSION FLOWS PASSED  ✓")
    print(f"  Extension (build:preview) → {BASE}")
    print("══════════════════════════════════════════════════════════\n")


if __name__ == "__main__":
    main()
