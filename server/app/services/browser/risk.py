"""
Menggolongkan tombol dan kolom. Program yang menentukan, bukan model; penjaga jaringan
(`network.py`) menahan pengiriman yang lolos dari penggolongan ini.
"""

import re

PAYMENT = re.compile(
    r"\b(bayar|bayarkan|membayar|pembayaran|transfer|checkout|check out|top[ -]?up|pay|payment"
    r"|beli|purchase|donasi|donate)\b",
    re.IGNORECASE,
)
DELETE = re.compile(
    r"\b(hapus|hapuskan|menghapus|delete|remove|destroy|musnahkan|buang|trash)\b", re.IGNORECASE
)
SEND = re.compile(
    r"\b(kirim|kirimkan|mengirim|simpan|menyimpan|submit|save|send|publish|terbitkan|posting"
    r"|ajukan|setujui|approve|tolak|reject|unggah|upload)\b",
    re.IGNORECASE,
)
CARD_FIELD = re.compile(r"(card.?number|nomor.?kartu|\bcvv\b|\bcvc\b|\biban\b)", re.IGNORECASE)


def submits_form(element: dict) -> bool:
    """Tombol yang mengirim formulirnya bila ditekan."""
    if element.get("form") is None:
        return False
    tag, kind = element.get("tag"), element.get("type", "")
    if tag == "button":
        return kind in ("", "submit")
    return tag == "input" and kind in ("submit", "image")


def click_risk(element: dict) -> str:
    """`none`, `submit`, `delete`, atau `payment`."""
    name = element.get("name", "")
    role = element.get("role", "")
    if role in ("checkbox", "radio", "textbox", "combobox"):
        return "none"
    href = element.get("href", "")
    # Tautan biasa hanya berpindah halaman; tautan tanpa alamat bekerja seperti tombol
    is_button = role != "link" or href in ("", "#")
    if is_button and PAYMENT.search(name):
        return "payment"
    if DELETE.search(name):
        return "delete"
    if is_button and SEND.search(name):
        return "submit"
    form = element.get("form")
    if submits_form(element) and form.get("method") == "post":
        return "payment" if PAYMENT.search(form.get("action_path", "")) else "submit"
    return "none"


def is_card_field(element: dict) -> bool:
    return element.get("autocomplete", "").startswith("cc-") or bool(
        CARD_FIELD.search(f"{element.get('name', '')} {element.get('selector', '')}")
    )
