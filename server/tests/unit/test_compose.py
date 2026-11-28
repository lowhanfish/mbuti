"""Mode penyusunan dan laporan (kontrak 20)."""

import io

from docx import Document

from app.services.engine import compose
from app.services.engine.prompts import response_schema, review_schema, system_prompt
from app.services.letters import render, report
from tests.unit.test_engine import role


def test_task_choice_overrides_the_role_mode():
    assert compose.effective("role", "free") == "free"
    assert compose.effective("complete", "free") == "complete"
    assert compose.effective(None, None) == "data"


def test_composed_items_are_cleaned_and_free_mode_never_stays_silent():
    items = [{"part": " Analisis\n", "note": "x" * 300}, {"part": ""}, "bukan butir"]

    assert compose.clean(items, "data", False) == []
    assert compose.clean(items, "complete", False) == [{"part": "Analisis", "note": "x" * 200}]
    assert compose.clean([], "complete", False) == []
    assert compose.clean(None, "free", False) == [compose.UNGROUNDED]
    assert compose.clean([], "free", True) == []


def test_other_modes_must_finish_and_list_what_they_made_up():
    strict, free = response_schema(False), response_schema(False, "free", True)

    assert "need_info" in strict["properties"]["status"]["enum"]
    assert "composed" not in strict["properties"]
    assert free["properties"]["status"]["enum"] == ["done"]
    assert "composed" in free["required"]
    assert "report" in free["properties"] and "letter" not in free["properties"]


def test_wanted_files_are_required_when_the_role_may_compose():
    free = response_schema(False, "free", True, ("report",))

    assert "report" in free["required"]
    assert "report" not in response_schema(False, "data", True, ("report",))["required"]
    assert review_schema("free")["properties"]["status"]["enum"] == ["done"]
    assert "need_info" in review_schema()["properties"]["status"]["enum"]
    text = system_prompt(role(), True, maker_mode="free")
    assert "bukan alasan berhenti" in text and "not_in_documents" not in text


def test_prompt_rules_follow_the_mode():
    strict = system_prompt(role())
    complete = system_prompt(role(), mode="complete")
    free = system_prompt(role(), with_sheet=True, mode="free")

    assert "not_in_documents" in strict and "`composed`" not in strict
    assert "tidak boleh dibuat" in complete and "NIP" in complete
    assert "contoh yang masuk akal" in free and compose.FREE_SHEET_RULE in free


def test_which_tasks_ask_for_a_report():
    assert report.asks_for_report("Susun laporan jaringan bulanan")
    assert report.asks_for_report("Rapat koordinasi. Buatkan notulen rapatnya")
    assert not report.asks_for_report("Buat surat pengantar laporan")
    assert not report.asks_for_report("Buatkan Excel laporan realisasi")
    assert not report.asks_for_report("Kapan batas laporan dikirim?")


def test_report_content_becomes_a_word_file():
    cleaned = report.clean_report(
        {
            "report_type": "Notulen",
            "title": "Notulen Rapat",
            "blocks": [
                {"type": "heading", "text": "Peserta"},
                {"type": "list", "items": ["Bidang Data", "Bidang Umum"]},
                {"type": "table", "rows": [["Hal", "Tindak lanjut"], ["Jaringan", "[nama]"]]},
                {"type": "tidak dikenal"},
            ],
        }
    )

    assert [b["type"] for b in cleaned["blocks"]] == ["heading", "list", "table"]
    assert report.clean_report({"blocks": [{"type": "heading", "text": "Kosong"}]}) is None
    docx = render.build_report(cleaned, cleaned["title"], render.Head(lines=("DINAS CONTOH",)))
    document = Document(io.BytesIO(docx))
    texts = [p.text for p in document.paragraphs]
    assert texts[0] == "DINAS CONTOH" and "NOTULEN RAPAT" in texts and "Peserta" in texts
    assert document.tables[0].rows[1].cells[1].text == "[nama]"
