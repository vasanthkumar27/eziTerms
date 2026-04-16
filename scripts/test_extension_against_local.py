"""
Simulates what the built EziTerms Chrome extension does when VITE_USE_AWS=false.
Every call here hits the *local* backend at http://localhost:8000/api — the
exact URLs that `extension/dist/src/sidepanel.js` uses.
"""
import io
import json
import sys
import time

import requests

BASE = "http://localhost:8000/api"
EMAIL = f"ext-local-{int(time.time())}@example.com"
PASSWORD = "extlocal123"

# Sample T&C text — long + looks like legalese so the TF-IDF classifier
# classifies it as a T&C page.
TERMS = (
    "By accessing or using our Service, you agree to be bound by these Terms of "
    "Service and Privacy Policy. We collect personal data including your name, "
    "email address, phone number, IP address, device identifiers, browsing "
    "history, and precise geolocation. We may share this information with "
    "third-party advertisers, analytics providers, and affiliate partners for "
    "marketing purposes. We reserve the right to modify these Terms at any "
    "time without prior notice. You hereby waive any right to participate in "
    "class-action litigation and agree to binding individual arbitration. The "
    "Service is provided AS-IS without warranties of any kind. We are not "
    "liable for any direct, indirect, incidental, or consequential damages. "
    "You grant us a perpetual, irrevocable, worldwide, royalty-free license to "
    "use, modify, distribute, and display any content you upload. Your account "
    "may be terminated at our sole discretion without notice or refund."
)

NEWS_TEXT = (
    "The city council voted unanimously on Tuesday to approve the new public "
    "library renovation budget. Construction is expected to begin next month. "
    "Residents expressed enthusiasm about expanded children's programming and "
    "extended hours. The mayor praised the project as a cornerstone of community "
    "investment and lifelong learning for all ages."
)


def step(n, label):
    print(f"\n───── {n}. {label} " + "─" * (60 - len(label)))


def ok(msg):
    print(f"  ✓ {msg}")


def fail(msg):
    print(f"  ✗ {msg}")
    sys.exit(1)


def main():
    s = requests.Session()

    # 1. Signup
    step(1, "POST /api/signup")
    r = s.post(f"{BASE}/signup", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        fail(f"signup failed: {r.status_code} {r.text}")
    ok(f"account created: {EMAIL}")

    # 2. Login
    step(2, "POST /api/login")
    r = s.post(f"{BASE}/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        fail(f"login failed: {r.status_code} {r.text}")
    data = r.json()
    access, refresh = data["access"], data["refresh"]
    ok(f"got JWT (access: {access[:22]}..., refresh: {refresh[:22]}...)")

    auth = {"Authorization": f"Bearer {access}"}

    # 3. /me sanity
    step(3, "GET /api/me")
    r = s.get(f"{BASE}/me", headers=auth)
    if r.status_code != 200:
        fail(f"me failed: {r.status_code} {r.text}")
    ok(f"user: {r.json()}")

    # 4. Classify page (T&C)
    step(4, "POST /api/classify-page  (T&C text)")
    r = s.post(f"{BASE}/classify-page", json={"text": TERMS}, headers=auth)
    if r.status_code != 200:
        fail(f"classify failed: {r.status_code} {r.text}")
    c = r.json()
    ok(f"is_tc_page={c['is_tc_page']} prob={c['probability']}")
    if not c["is_tc_page"]:
        fail("expected T&C to be classified true")

    # 5. Classify page (non-T&C)
    step(5, "POST /api/classify-page  (news text)")
    r = s.post(f"{BASE}/classify-page", json={"text": NEWS_TEXT}, headers=auth)
    if r.status_code != 200:
        fail(f"classify failed: {r.status_code} {r.text}")
    c = r.json()
    ok(f"is_tc_page={c['is_tc_page']} prob={c['probability']}")

    # 6. Analyze terms (what "Scan page" calls after classification)
    step(6, "POST /api/analyze-terms  (the Scan page flow)")
    r = s.post(
        f"{BASE}/analyze-terms",
        json={"terms": TERMS, "document_url": "https://example.com/tos"},
        headers=auth,
        timeout=60,
    )
    if r.status_code != 200:
        fail(f"analyze failed: {r.status_code} {r.text}")
    a = r.json()
    ok(f"risk_score={a['risk_score']}  items={len(a['result'])}")
    for i, row in enumerate(a["result"][:3], 1):
        print(f"     [{i}] {row['risktype'].upper():<6} {row['lineSummary']}")
    if len(a["result"]) > 3:
        print(f"     ... and {len(a['result']) - 3} more")

    # 7. Upload terms (the Upload document flow)
    step(7, "POST /api/upload-terms  (Upload document flow)")
    txt = io.BytesIO(TERMS.encode("utf-8"))
    files = {"file": ("sample-tos.txt", txt, "text/plain")}
    form = {"masking_mode": "false"}
    r = s.post(f"{BASE}/upload-terms", files=files, data=form, headers=auth, timeout=60)
    if r.status_code != 200:
        fail(f"upload failed: {r.status_code} {r.text}")
    u = r.json()
    ok(f"upload parsed: terms_text={len(u.get('terms_text',''))} chars  risk_score={u['risk_score']}  items={len(u['result'])}")

    # 8. Upload terms WITH masking preview (what masking toggle does)
    step(8, "POST /api/upload-terms masking_mode=true  (mask preview)")
    txt2 = io.BytesIO(
        (TERMS + " Contact us at support@acme.com or call +1-415-555-0100.").encode("utf-8")
    )
    files = {"file": ("sample-tos.txt", txt2, "text/plain")}
    form = {"masking_mode": "true"}
    r = s.post(f"{BASE}/upload-terms", files=files, data=form, headers=auth, timeout=60)
    if r.status_code != 200:
        fail(f"upload-masked failed: {r.status_code} {r.text}")
    m = r.json()
    ok(f"masking_preview={m.get('masking_preview')} notice={bool(m.get('notice'))}")
    snippet = (m.get("terms_text") or "")[-120:]
    print(f"     …{snippet!r}")

    # 9. Chatbot (Anee tab)
    step(9, "POST /api/chatbot  (Anee Q&A)")
    r = s.post(
        f"{BASE}/chatbot",
        json={"message": "Can the company change the terms without telling me?", "terms_text": TERMS},
        headers=auth,
        timeout=60,
    )
    if r.status_code != 200:
        fail(f"chatbot failed: {r.status_code} {r.text}")
    reply = r.json().get("reply", "")
    ok(f"reply ({len(reply)} chars): {reply[:180]}{'…' if len(reply) > 180 else ''}")

    # 10. Token refresh (what 401 handlers trigger)
    step(10, "POST /api/token/refresh")
    r = s.post(f"{BASE}/token/refresh", json={"refresh": refresh})
    if r.status_code != 200:
        fail(f"refresh failed: {r.status_code} {r.text}")
    refreshed = r.json()
    ok(f"new access: {refreshed['access'][:22]}...")

    # 11. Logout
    step(11, "POST /api/logout")
    r = s.post(f"{BASE}/logout", json={"refresh": refresh}, headers=auth)
    if r.status_code != 200:
        fail(f"logout failed: {r.status_code} {r.text}")
    ok("logged out")

    # 12. Confirm old access token is rejected after logout
    step(12, "GET /api/me  (after logout – should be 401)")
    r = s.get(f"{BASE}/me", headers=auth)
    if r.status_code == 401:
        ok("old access token correctly rejected")
    else:
        print(f"  ! unexpected {r.status_code} {r.text}")

    print("\n══════════════════════════════════════════════════════════")
    print("  ALL EXTENSION-FACING API FLOWS PASSED  ✓")
    print("  Extension → http://localhost:8000/api is fully functional")
    print("══════════════════════════════════════════════════════════\n")


if __name__ == "__main__":
    main()
