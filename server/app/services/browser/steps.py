"""Bentuk satu langkah alur dan keterangannya. Keterangan dibuat program, bukan model."""

SECRET_LABEL = {
    "username": "Username (brankas)",
    "password": "Password (brankas)",
    "totp": "Kode authenticator (brankas)",
    "otp": "Kode OTP (dari pemilik)",
}


def new_step(action: str, element: dict | None = None, **values) -> dict:
    target = None
    if element is not None:
        target = {key: element.get(key, "") for key in ("role", "name", "selector", "tag")}
    return {
        "action": action,
        "target": target,
        "source": "",
        "key": "",
        "text": "",
        "login": False,
        "risk": "none",
        "label": "",
        "shot": None,
        **values,
    }


def name_of(step: dict) -> str:
    target = step.get("target") or {}
    return target.get("name") or "tanpa nama"


def describe(step: dict) -> str:
    action, name = step["action"], name_of(step)
    if action == "open":
        return f"Buka {step['text']}"[:300]
    if action == "fill":
        return f"Isi kolom {name}"
    if action == "select":
        return f"Pilih di {name}"
    if action == "check":
        return f"Centang {name}"
    if action == "read":
        return f"Baca {step['label'] or name}"
    if (step.get("target") or {}).get("role") == "link":
        return f"Buka tautan {name}"
    return f"Tekan tombol {name}"


def value_label(step: dict, inputs: list[dict]) -> str:
    if step["source"] == "secret":
        return SECRET_LABEL.get(step["key"], "")
    if step["source"] == "input":
        label = next((i["label"] for i in inputs if i["key"] == step["key"]), step["key"])
        return f"Isian: {label}"
    if step["source"] == "text":
        return f"Isian tetap: {step['text']}"[:200]
    return ""


def view_action(step: dict) -> str:
    """Isian rahasia ditampilkan sebagai langkah masuk."""
    return "login" if step["source"] == "secret" else step["action"]


def approval_values(steps: list[dict], inputs: list[dict], given: dict[str, str]) -> list[dict]:
    """Yang akan terkirim: isian putaran dan isian tetap yang ditulis saat belajar."""
    values = [{"label": i["label"], "value": given.get(i["key"], "")} for i in inputs]
    values += [
        {"label": f"Isian tetap: {name_of(s)}", "value": s["text"]}
        for s in steps
        if s["source"] == "text" and not s["login"]
    ]
    return values
