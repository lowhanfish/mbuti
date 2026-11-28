"""
Pengaman jaringan.

`AddressProxy`: semua sambungan peramban (termasuk pengalihan dan sumber daya halaman)
lewat perantara lokal yang menyelesaikan nama host, menolak alamat jaringan internal, lalu
menyambung ke alamat yang sudah diperiksa, sehingga DNS tidak bisa ditukar di tengah jalan.

`RequestGate`: hanya mengizinkan permintaan yang mengubah data saat masuk atau pada langkah
yang disetujui, dan menolak halaman di luar alamat terdaftar.
"""

import asyncio
import contextlib
import ipaddress
import socket
from collections.abc import Iterator
from urllib.parse import urlsplit

from app.core.config import settings
from app.services.vault.addresses import DEFAULT_PORTS, origin_of

READ_METHODS = {"GET", "HEAD", "OPTIONS"}
BUFFER = 65536
HEADER_LIMIT = 65536
FORBIDDEN = b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"


def request_origin(url: str) -> str:
    """Asal sebuah permintaan; kosong bila tidak bisa dibaca dengan pasti."""
    parts = urlsplit(url)
    scheme = {"ws": "http", "wss": "https"}.get(parts.scheme, parts.scheme)
    if scheme not in DEFAULT_PORTS or not parts.hostname:
        return ""
    netloc = parts.netloc.rsplit("@", 1)[-1]
    try:
        return origin_of(f"{scheme}://{netloc}/")
    except ValueError:
        return ""


def is_public(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%")[0])
    except ValueError:
        return False
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return ip.is_global and not ip.is_multicast


def local_targets(origins: frozenset[str]) -> set[tuple[str, int]]:
    """
    Alamat internal yang tetap boleh: hanya di luar produksi, dan hanya yang terdaftar di
    brankas (mis. aplikasi tiruan di localhost).
    """
    if settings.APP_ENV == "production":
        return set()
    found = set()
    for origin in origins:
        parts = urlsplit(origin)
        found.add((parts.hostname, parts.port or DEFAULT_PORTS[parts.scheme]))
    return found


async def resolve_allowed(host: str, port: int, local: set[tuple[str, int]]) -> str | None:
    """Alamat IP yang boleh disambungi, atau None."""
    try:
        found = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (OSError, UnicodeError):
        return None
    addresses = [item[4][0] for item in found]
    if not addresses:
        return None
    if (host.lower(), port) in local:
        return addresses[0]
    # Satu saja alamat internal sudah cukup untuk menolak
    return addresses[0] if all(is_public(a) for a in addresses) else None


class AddressProxy:
    """Perantara HTTP sederhana di 127.0.0.1, satu per sesi peramban."""

    def __init__(self, origins: frozenset[str]):
        self._local = local_targets(origins)
        self._server: asyncio.Server | None = None
        self._tasks: set[asyncio.Task] = set()
        self.refused: list[str] = []

    async def __aenter__(self) -> "AddressProxy":
        self._server = await asyncio.start_server(self._accept, "127.0.0.1", 0, limit=HEADER_LIMIT)
        return self

    async def __aexit__(self, *_) -> None:
        self._server.close()
        for task in list(self._tasks):
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self._server.sockets[0].getsockname()[1]}"

    async def _accept(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        self._tasks.add(task)
        try:
            await self._serve(reader, writer)
        except (OSError, ValueError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
            pass
        finally:
            self._tasks.discard(task)
            writer.close()

    async def _serve(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        head = await reader.readuntil(b"\r\n\r\n")
        lines = head.decode("latin-1").split("\r\n")
        method, target, version = lines[0].split(" ", 2)
        tunnel = method == "CONNECT"
        parts = urlsplit(f"//{target}" if tunnel else target)
        host, port = parts.hostname, parts.port or (443 if tunnel else 80)
        address = await resolve_allowed(host, port, self._local) if host else None
        if address is None or (not tunnel and parts.scheme != "http"):
            self.refused.append(host or "")
            writer.write(
                b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            )
            await writer.drain()
            return
        upstream_reader, upstream = await asyncio.open_connection(address, port)
        try:
            if tunnel:
                writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
                await writer.drain()
            else:
                path = parts.path or "/"
                if parts.query:
                    path = f"{path}?{parts.query}"
                headers = [
                    line
                    for line in lines[1:]
                    if line
                    and line.split(":", 1)[0].lower() not in ("proxy-connection", "connection")
                ]
                # Satu permintaan per sambungan, agar tiap tujuan selalu diperiksa
                request = [f"{method} {path} {version}", *headers, "Connection: close", "", ""]
                upstream.write("\r\n".join(request).encode("latin-1"))
            await asyncio.gather(_pipe(reader, upstream), _pipe(upstream_reader, writer))
        finally:
            upstream.close()


async def _pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    with contextlib.suppress(OSError):
        while data := await reader.read(BUFFER):
            writer.write(data)
            await writer.drain()
    writer.close()


class RequestGate:
    """Dipasang pada context peramban. Nilai bawaannya: hanya membaca."""

    def __init__(self, origins: frozenset[str]):
        self.origins = origins
        self._permitted = False
        # Permintaan mengubah data ke aplikasi: yang ditahan dan yang diteruskan
        self.blocked_writes = 0
        self.writes = 0
        self.failed_status: int | None = None
        self.blocked_pages: list[str] = []

    @contextlib.contextmanager
    def permit(self) -> Iterator[None]:
        self._permitted = True
        try:
            yield
        finally:
            self._permitted = False

    def reset(self) -> None:
        self.blocked_writes = self.writes = 0
        self.failed_status = None
        self.blocked_pages = []

    async def handle(self, route) -> None:
        request = route.request
        origin = request_origin(request.url)
        registered = origin in self.origins
        if request.is_navigation_request() and request.frame.parent_frame is None:
            if not registered:
                self.blocked_pages.append(origin)
                await route.abort()
                return
        if request.method.upper() not in READ_METHODS:
            if not (self._permitted and registered):
                # Pengiriman ke pihak lain (mis. analitik) ditahan tanpa dihitung
                if registered:
                    self.blocked_writes += 1
                await route.abort()
                return
            self.writes += 1
        await route.continue_()

    def saw_response(self, response) -> None:
        if (
            response.request.method.upper() not in READ_METHODS
            and response.status >= 400
            and request_origin(response.url) in self.origins
        ):
            self.failed_status = response.status

    async def refuse_socket(self, socket_route) -> None:
        # WebSocket bisa mengubah data tanpa terlihat penjaga; belum didukung
        await socket_route.close()
