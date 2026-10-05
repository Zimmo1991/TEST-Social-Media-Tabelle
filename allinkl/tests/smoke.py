"""Run only against an isolated local PHP test database, never production."""
import base64
import http.cookiejar
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

BASE = os.environ.get("SOCIALFLOW_TEST_URL", "http://127.0.0.1:8766")
if urllib.parse.urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Smoke-Test darf ausschließlich gegen einen lokalen Testserver laufen.")
OWNER_EMAIL = "owner@example.test"
OWNER_PASSWORD = "TestPassword123!"


def client():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(opener, method, path, payload=None, multipart=None):
    headers = {}
    data = None
    if multipart is not None:
        boundary = "socialflow-test-" + uuid.uuid4().hex
        chunks = []
        for name, value in multipart.items():
            chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
        if payload is not None:
            filename, content, field = payload
            chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\nContent-Type: image/png\r\n\r\n".encode() + content + b"\r\n")
        data = b"".join(chunks) + f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    try:
        with opener.open(urllib.request.Request(BASE + path, data=data, headers=headers, method=method)) as response:
            raw = response.read()
            return response.status, json.loads(raw) if response.headers.get_content_type() == "application/json" else raw
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())


owner = client()
assert request(owner, "POST", "/api/auth/login", {"email": OWNER_EMAIL, "password": OWNER_PASSWORD})[0] == 200
table_id = "smoke-" + uuid.uuid4().hex[:10]
state = {"tables": [{"id": table_id, "name": "Testkunde", "weeks": {}}], "sharedTableLayoutEnabled": False}
assert request(owner, "PUT", "/api/planner-state", {"state": state})[0] == 200
assert request(owner, "GET", "/api/planner-state")[1]["state"]["tables"][0]["id"] == table_id
assert request(owner, "POST", "/api/planner-history", {"tableId": table_id, "tableName": "Testkunde", "snapshot": state})[0] == 201
assert request(owner, "GET", "/api/planner-history")[1]["entries"]

png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLytQAAAABJRU5ErkJggg==")
status, media = request(owner, "POST", "/api/planner-media", ("test.png", png, "media"), {"tableId": table_id})
assert status == 201, media
assert request(owner, "GET", media["media"]["url"])[0] == 200

customer_email = "customer-" + uuid.uuid4().hex[:8] + "@example.test"
status, created = request(owner, "POST", "/api/users", {"name": "Test Kunde", "email": customer_email, "password": "CustomerPassword123!", "tableIds": [table_id]})
assert status == 201, created
customer = client()
assert request(customer, "POST", "/api/auth/login", {"email": customer_email, "password": "CustomerPassword123!"})[0] == 200
assert request(customer, "GET", "/api/users")[0] == 403
assert request(customer, "GET", "/api/ai/config?tableId=" + table_id)[0] == 403
assert request(customer, "GET", "/api/planner-history")[0] == 403

with tempfile.TemporaryDirectory(prefix="socialflow-ai-test-") as folder:
    image_path = Path(folder) / "test.png"
    image_path.write_bytes(png)
    config = {"tableId": table_id, "tableName": "Testkunde", "enabled": True, "imageFolder": folder,
              "allowedWebsites": [], "pdfFiles": [], "tone": "freundlich", "forbiddenTerms": [], "notes": "",
              "fieldMapping": {"german": "text", "italian": "textItalian"}}
    assert request(owner, "PUT", "/api/ai/config", config)[0] == 200
    draft_request = {"tableId": table_id, "tableName": "Testkunde", "calendarYear": 2026, "weekNumber": 1,
                     "itemIndex": 0, "contentType": "post", "approved": False, "published": False}
    status, draft = request(owner, "POST", "/api/ai/prepare-draft", draft_request)
    assert status == 201, draft
    assert len(draft["draft"]["germanText"]) <= 250
    assert len(draft["draft"]["italianText"]) <= 250
    assert request(owner, "GET", draft["draft"]["imageUrl"])[0] == 200
    assert request(owner, "POST", "/api/ai/prepare-draft", draft_request)[0] == 409
    assert request(owner, "POST", "/api/ai/prepare-draft", {**draft_request, "approved": True})[0] == 409

status, publication = request(owner, "POST", "/api/publications", ("test.png", png, "media[]"),
    {"tableId": table_id, "tableName": "Testkunde", "calendarYear": "2026", "weekNumber": "1", "itemIndex": "0",
     "contentType": "post", "caption": "Test", "customerApproved": "false", "mainAdminApproved": "false"})
assert status == 201, publication
assert publication["publication"]["status"] == "draft"
status, published = request(owner, "POST", "/api/publications", ("test.png", png, "media[]"),
    {"tableId": table_id, "tableName": "Testkunde", "calendarYear": "2026", "weekNumber": "1", "itemIndex": "0",
     "contentType": "post", "caption": "Test", "customerApproved": "true", "mainAdminApproved": "true"})
assert status == 201, published
assert published["publication"]["status"] == "published"
assert published["publication"]["instagramMediaId"].startswith("dry-run-")
assert request(owner, "GET", "/api/publications?tableId=" + table_id)[0] == 200
assert request(owner, "DELETE", media["media"]["url"])[0] == 200
print("OK: Anmeldung, Tabellen, Verlauf, Medien, Rollen, KI-Entwurf und Instagram-Dry-Run")
