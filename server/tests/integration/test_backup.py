"""Cadangan lalu pulihkan pada database uji, seluruhnya di dalam transaksi yang dibatalkan."""

import uuid

import pytest

from app.services.backup import BackupError, dump, restore, tables
from scripts.cadangan import connect, prune

ORG, USER, MEMBER = (uuid.uuid4() for _ in range(3))
PARENT, CHILD = uuid.uuid4(), uuid.uuid4()


def _seed(conn) -> None:
    conn.execute(
        "INSERT INTO organizations (id, name, slug, description, sector, timezone, email, phone,"
        " address, website) VALUES (%s, %s, 'org-cadangan', %s, 'lainnya', 'Asia/Makassar',"
        " '', '', '', '')",
        (ORG, "Organisasi Cadangan", "baris\nbaru\tdan tab \\ garis miring"),
    )
    conn.execute(
        "INSERT INTO users (id, email, full_name, is_active, is_verified)"
        " VALUES (%s, 'cadangan@uji.test', 'Uji Cadangan', true, true)",
        (USER,),
    )
    # Anak ditulis sebelum induknya dikenal, dan anggota merujuk unit: dua rujukan tertunda
    conn.execute(
        "INSERT INTO units (id, organization_id, name, code, description, color, sort_order)"
        " VALUES (%s, %s, 'Induk', 'IND', '', 'violet', 0)",
        (PARENT, ORG),
    )
    conn.execute(
        "INSERT INTO units (id, organization_id, name, code, description, color, sort_order,"
        " parent_id) VALUES (%s, %s, 'Anak', 'ANK', '', 'violet', 1, %s)",
        (CHILD, ORG, PARENT),
    )
    conn.execute(
        "INSERT INTO memberships (id, organization_id, user_id, access_role, status, unit_id,"
        " joined_at) VALUES (%s, %s, %s, 'owner', 'active', %s, now())",
        (MEMBER, ORG, USER, CHILD),
    )
    for action in ("auth.masuk", "unit.buat"):
        conn.execute(
            "INSERT INTO audit_logs (id, organization_id, user_id, actor_name, actor_email,"
            " action, target, ip, request_id) VALUES (%s, %s, %s, 'Uji', 'u@uji.test', %s,"
            " '', '', '')",
            (uuid.uuid4(), ORG, USER, action),
        )


def _snapshot(conn) -> dict:
    return {
        t.name: sorted(str(row) for row in conn.execute(f'SELECT * FROM "{t.name}"').fetchall())
        for t in tables()
    }


def test_dump_and_restore_round_trip(tmp_path):
    uploads = tmp_path / "uploads"
    (uploads / str(ORG)).mkdir(parents=True)
    (uploads / str(ORG) / "berkas.md").write_bytes(b"isi berkas")
    archive = tmp_path / "arsip" / "mbuti-uji.tar.gz"

    conn = connect()
    try:
        assert conn.info.dbname.endswith("_test")
        _seed(conn)
        before = _snapshot(conn)

        meta = dump(conn, archive, uploads)
        assert meta["rows"]["units"] == 2 and meta["files"] == 1
        assert archive.stat().st_mode & 0o077 == 0

        with pytest.raises(BackupError, match="sudah berisi data"):
            restore(conn, archive, uploads)

        highest = conn.execute("SELECT MAX(seq) FROM audit_logs").fetchone()[0]
        names = ", ".join(f'"{t.name}"' for t in tables())
        conn.execute(f"TRUNCATE {names} RESTART IDENTITY CASCADE")
        target = tmp_path / "pulih"
        restore(conn, archive, target)

        assert _snapshot(conn) == before
        assert (target / str(ORG) / "berkas.md").read_bytes() == b"isi berkas"
        # Penomoran dilanjutkan, bukan diulang dari satu
        next_seq = conn.execute(
            "INSERT INTO audit_logs (id, actor_name, actor_email, action, target, ip,"
            " request_id) VALUES (%s, '', '', 'auth.gagal', '', '', '') RETURNING seq",
            (uuid.uuid4(),),
        ).fetchone()[0]
        assert next_seq == highest + 1
    finally:
        conn.rollback()
        conn.close()


def test_prune_keeps_the_newest(tmp_path):
    for day in (1, 2, 3):
        (tmp_path / f"mbuti-2026110{day}-020000.tar.gz").write_bytes(b"")
    (tmp_path / "catatan.txt").write_text("biarkan")

    removed = prune(tmp_path, 2)

    assert [p.name for p in removed] == ["mbuti-20261101-020000.tar.gz"]
    assert len(list(tmp_path.iterdir())) == 3
    assert prune(tmp_path, 0) == []
