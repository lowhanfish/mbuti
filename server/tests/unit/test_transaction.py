"""Penerjemahan galat integritas PostgreSQL."""

import pytest
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import BadRequestException, ConflictException
from app.db.transaction import commit_or_raise_unique_conflict


class FakeDriverError(Exception):
    def __init__(self, sqlstate: str):
        super().__init__("rincian dari database")
        self.sqlstate = sqlstate


class FakeSession:
    def __init__(self, error: Exception):
        self.error = error
        self.rolled_back = False

    async def commit(self) -> None:
        raise self.error

    async def rollback(self) -> None:
        self.rolled_back = True


def integrity_error(sqlstate: str) -> IntegrityError:
    return IntegrityError("INSERT", {}, FakeDriverError(sqlstate))


async def test_unique_violation_becomes_conflict() -> None:
    session = FakeSession(integrity_error("23505"))

    with pytest.raises(ConflictException) as caught:
        await commit_or_raise_unique_conflict(session, "Email sudah dipakai.")

    assert caught.value.message == "Email sudah dipakai."
    assert session.rolled_back


async def test_other_integrity_error_becomes_bad_request() -> None:
    session = FakeSession(integrity_error("23503"))

    with pytest.raises(BadRequestException):
        await commit_or_raise_unique_conflict(session)

    assert session.rolled_back


async def test_unexpected_error_is_rolled_back_and_raised() -> None:
    session = FakeSession(RuntimeError("putus"))

    with pytest.raises(RuntimeError):
        await commit_or_raise_unique_conflict(session)

    assert session.rolled_back
