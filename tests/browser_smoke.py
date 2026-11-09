"""Functional browser checks with an in-memory GitHub API; never writes to GitHub."""
import base64
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:4173/long-journey/"
SEED = json.loads((ROOT / "tests/fixtures/initial-energy.json").read_text())
state = {"data": json.loads(json.dumps(SEED)), "revision": 1, "fail_put": False, "fail_read": False, "writes": 0}
errors = []


def api(route):
    request = route.request
    path = urlsplit(request.url).path
    headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, PUT, OPTIONS"}
    if request.method == "OPTIONS":
        route.fulfill(status=204, headers=headers)
        return
    if path.endswith("/long-journey"):
        route.fulfill(json={"permissions": {"push": True}}, headers=headers)
        return
    if request.method == "PUT":
        if state["fail_put"]:
            route.fulfill(status=403, json={"message": "Forbidden"}, headers=headers)
            return
        assert request.headers.get("authorization") == "Bearer smoke-test-token"
        body = request.post_data_json
        assert body["sha"] == f"revision-{state['revision']}"
        assert body["branch"] == "main"
        state["data"] = json.loads(base64.b64decode(body["content"]).decode())
        state["revision"] += 1
        state["writes"] += 1
        route.fulfill(json={"content": {"sha": f"revision-{state['revision']}"}}, headers=headers)
    else:
        if state["fail_read"]:
            route.fulfill(status=403, json={"message": "Rate limit"}, headers=headers)
            return
        content = base64.b64encode(json.dumps(state["data"], ensure_ascii=False).encode()).decode()
        route.fulfill(json={"encoding": "base64", "content": content, "sha": f"revision-{state['revision']}"}, headers=headers)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])

    def context(width=1440, height=1080):
        ctx = browser.new_context(viewport={"width": width, "height": height}, timezone_id="Asia/Shanghai", locale="zh-CN")
        ctx.route("https://api.github.com/**", api)
        ctx.route("**/long-journey/data/energy.json", lambda route: route.fulfill(json=SEED))
        page = ctx.new_page()
        page.clock.set_fixed_time("2026-11-09T10:00:00+08:00")
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("dialog", lambda dialog: dialog.accept())
        return ctx, page

    ctx, calendar = context()
    calendar.goto(BASE)
    expect(calendar.locator("#current-total")).to_have_text("6")
    expect(calendar.locator("#today-record-status")).to_have_text("今日尚未记录")
    expect(calendar.locator("[role=progressbar]")).to_have_attribute("aria-valuenow", "6")
    for day in range(2, 7):
        expect(calendar.locator(f'[data-date="2026-11-0{day}"] .day-circle')).to_have_class("day-circle school")
    expect(calendar.locator('[data-date="2026-11-07"] .day-circle')).to_have_text("+3")
    expect(calendar.locator('[data-date="2026-11-08"] .day-total')).to_have_text("6")
    calendar.locator('[data-date="2026-11-07"]').click()
    expect(calendar.locator("#day-dialog")).to_be_visible()
    expect(calendar.locator("#edit-day-link")).to_have_attribute("href", "edit/?date=2026-11-07")
    calendar.locator("#day-dialog [data-close]").click()
    calendar.locator("#next-month").click()
    expect(calendar.locator("#month-title")).to_have_text("2026 年 12 月")
    calendar.locator("#previous-month").click()
    (ROOT / "test-results").mkdir(exist_ok=True)
    calendar.screenshot(path=str(ROOT / "test-results/desktop.png"), full_page=True)

    edit_ctx, edit = context(390, 844)
    edit.goto(BASE + "edit?date=2026-11-06")
    expect(edit.locator("#entry-date")).to_have_value("2026-11-06")
    expect(edit.locator("#entry-fields")).to_be_enabled()
    edit.locator('[data-kind="home"]').click()
    edit.locator("#entry-amount").fill("2")
    note = '补记：休息一下 🌱 <img src=x onerror="alert(1)">'
    edit.locator("#entry-note").fill(note)
    expect(edit.locator("#preview-total")).to_have_text("2 分")
    edit.locator("#save-button").click()
    expect(edit.locator("#connect-dialog")).to_be_visible()
    assert state["writes"] == 0
    edit.locator("#github-token").fill("smoke-test-token")
    edit.locator("#verify-button").click()
    expect(edit.locator("#connect-dialog")).not_to_be_visible()
    expect(edit.locator("#connection-title")).to_contain_text("已连接")
    assert edit.evaluate('localStorage.getItem("long-journey:github-token")') is None
    assert edit.evaluate('sessionStorage.getItem("long-journey:github-token")') == "smoke-test-token"
    edit.locator("#save-button").click()
    expect(edit.locator("#save-status")).to_contain_text("已同步到云端")
    assert state["data"]["records"]["2026-11-06"]["note"] == note
    assert state["writes"] == 1

    # A second device reads the committed file, with no shared browser storage.
    calendar.reload()
    expect(calendar.locator("#current-total")).to_have_text("8")
    calendar.locator('[data-date="2026-11-06"]').click()
    expect(calendar.locator(".day-note")).to_have_text(note)
    assert calendar.locator("#day-detail img").count() == 0
    calendar.locator("#day-dialog [data-close]").click()

    # Changing the same day elsewhere cannot be silently overwritten.
    state["data"]["records"]["2026-11-06"]["amount"] = 9
    state["revision"] += 1
    edit.locator("#entry-amount").fill("5")
    edit.locator("#save-button").click()
    expect(edit.locator("#save-status")).to_contain_text("其他设备更新")
    assert state["data"]["records"]["2026-11-06"]["amount"] == 9
    assert state["writes"] == 1
    edit.locator("#refresh-data").click()
    expect(edit.locator("#entry-amount")).to_have_value("9")
    # Changes to other dates are merged and preserved.
    state["data"]["records"]["2026-11-08"]["note"] = "另一台设备的留言"
    state["revision"] += 1
    edit.locator("#entry-amount").fill("2")
    edit.locator("#save-button").click()
    expect(edit.locator("#save-status")).to_contain_text("已同步到云端")
    assert state["data"]["records"]["2026-11-08"]["note"] == "另一台设备的留言"

    # A failed write stays unsaved. Retry after the network permission is restored.
    edit.locator("#entry-date").fill("2026-11-09")
    edit.locator("#entry-date").dispatch_event("change")
    edit.locator('[data-kind="big"]').click()
    expect(edit.locator("#preview-circle")).to_have_text("零")
    expect(edit.locator("#preview-total")).to_have_text("0 分")
    state["fail_put"] = True
    edit.locator("#save-button").click()
    expect(edit.locator("#save-status")).to_contain_text("未确认同步")
    assert "2026-11-09" not in state["data"]["records"]
    state["fail_put"] = False
    edit.locator("#save-button").click()
    expect(edit.locator("#save-status")).to_contain_text("已同步到云端")
    calendar.reload()
    expect(calendar.locator("#current-total")).to_have_text("0")
    expect(calendar.locator("#today-record-status")).to_have_text("今日已记录")
    expect(calendar.locator('[data-date="2026-11-09"] .day-circle')).to_have_text("零")
    expect(calendar.locator('[data-date="2026-11-09"] .day-circle')).to_have_class("day-circle big")
    edit.screenshot(path=str(ROOT / "test-results/mobile-edit.png"), full_page=True)

    edit.locator("#delete-button").click()
    expect(edit.locator("#delete-dialog")).to_be_visible()
    edit.locator("#confirm-delete").click()
    expect(edit.locator("#save-status")).to_contain_text("已从云端删除")
    assert "2026-11-09" not in state["data"]["records"]
    calendar.reload()
    expect(calendar.locator("#current-total")).to_have_text("8")
    expect(calendar.locator("#today-record-status")).to_have_text("今日尚未记录")
    expect(calendar.locator('[data-date="2026-11-09"] .day-circle')).to_have_text("—")

    # Check no horizontal overflow at small phone, tablet, and desktop sizes.
    for width in [320, 390, 768, 1440]:
        for page in [calendar, edit]:
            page.set_viewport_size({"width": width, "height": 900})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (page.url, width)
    calendar.set_viewport_size({"width": 390, "height": 844})
    calendar.screenshot(path=str(ROOT / "test-results/mobile-calendar.png"), full_page=True)
    edit.locator("#disconnect-button").click()
    expect(edit.locator("#connection-title")).to_have_text("记录保存到 GitHub")
    assert edit.evaluate('sessionStorage.getItem("long-journey:github-token")') is None

    # On API failure, show the static version as a labelled fallback.
    state["fail_read"] = True
    calendar.reload()
    expect(calendar.locator("#load-status")).to_contain_text("可能不是最新记录")
    expect(calendar.locator("#current-total")).to_have_text("6")
    assert not errors, errors
    browser.close()

print("Browser checks passed: initial data, desktop/mobile, cloud save, second-device read, retroactive totals, reset, merge/conflict, failed save, delete, escaping, fallback.")
