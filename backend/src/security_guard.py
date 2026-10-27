"""Proteção contra robôs e varreduras: bloqueia scanners conhecidos, caminhos de sondagem e excesso de requisições."""
from __future__ import annotations

import ipaddress
import re
import time
from collections import defaultdict, deque

from starlette.responses import JSONResponse

# Ferramentas de varredura/ataque e copiadores de site. (Navegadores, extensão, Stripe e RevenueCat não entram aqui.)
BLOCKED_AGENTS = re.compile(
    r"sqlmap|nikto|nmap|masscan|nuclei|wpscan|gobuster|dirbuster|dirb/|feroxbuster|ffuf|wfuzz|acunetix|nessus|openvas|"
    r"burp|zgrab|zmap|shodan|censys|netsparker|arachni|havij|metasploit|hydra|httrack|webcopier|teleport|"
    r"scrapy|python-scrapy|go-http-client/1\.1 \(scanner\)|libwww-perl|nutch|masscan",
    re.I,
)
# Caminhos que só robôs de varredura pedem (a aplicação não tem nada disso).
PROBE_PATHS = re.compile(
    r"^/(?:\.env|\.git|\.svn|\.hg|\.aws|\.ssh|\.DS_Store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|"
    r"admin\.php|config\.php|shell|cgi-bin|vendor/phpunit|actuator|server-status|manager/html|solr|\.well-known/security\.txt\.bak|"
    r"backup|dump|db\.sql|database\.sql|id_rsa|docker-compose|Dockerfile|package\.json|composer\.json)",
    re.I,
)

WINDOW = 60.0
LIMIT_PER_MINUTE = 240       # por IP, para quem chega direto (sem ser o próprio site do ClipGringa)
PROBE_STRIKES = 6            # 404 seguidos em 1 minuto = suspeito
BAN_SECONDS = 600
_EXEMPT = ("/health",)


class Guard:
    def __init__(self) -> None:
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.strikes: dict[str, deque[float]] = defaultdict(deque)
        self.banned: dict[str, float] = {}

    def client_ip(self, request) -> str:
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip() if forwarded else ""
        return first or (request.client.host if request.client else "unknown")

    @staticmethod
    def internal(ip: str) -> bool:
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            return False
        return addr.is_private or addr.is_loopback

    def _trim(self, dq: deque, now: float) -> None:
        while dq and now - dq[0] > WINDOW:
            dq.popleft()

    def check(self, request, now: float | None = None) -> str | None:
        """Devolve o motivo do bloqueio ('scanner', 'probe', 'banned', 'rate') ou None."""
        now = time.monotonic() if now is None else now
        path = request.url.path
        if path in _EXEMPT:
            return None
        ip = self.client_ip(request)
        if ip in self.banned:
            if now < self.banned[ip]:
                return "banned"
            del self.banned[ip]
        if BLOCKED_AGENTS.search(request.headers.get("user-agent", "")):
            self.banned[ip] = now + BAN_SECONDS
            return "scanner"
        if PROBE_PATHS.match(path):
            self.banned[ip] = now + BAN_SECONDS
            return "probe"
        # O site do ClipGringa fala com a API pela rede interna; o limite vale para quem vem de fora.
        if not self.internal(ip):
            dq = self.hits[ip]
            self._trim(dq, now)
            dq.append(now)
            if len(dq) > LIMIT_PER_MINUTE:
                return "rate"
        return None

    def note_status(self, request, status: int, now: float | None = None) -> None:
        """Muitos 404 seguidos vindos de fora indicam varredura: bloqueia o IP por um tempo."""
        if status != 404:
            return
        ip = self.client_ip(request)
        if self.internal(ip):
            return
        now = time.monotonic() if now is None else now
        dq = self.strikes[ip]
        self._trim(dq, now)
        dq.append(now)
        if len(dq) >= PROBE_STRIKES:
            self.banned[ip] = now + BAN_SECONDS
            dq.clear()

    def sweep(self, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        for table in (self.hits, self.strikes):
            for ip in [k for k, dq in table.items() if not dq or now - dq[-1] > WINDOW]:
                del table[ip]
        for ip in [k for k, until in self.banned.items() if until < now]:
            del self.banned[ip]


guard = Guard()
_last_sweep = 0.0


async def security_middleware(request, call_next):
    global _last_sweep
    now = time.monotonic()
    if now - _last_sweep > 120:
        _last_sweep = now
        guard.sweep(now)
    reason = guard.check(request, now)
    if reason:
        status = 429 if reason in ("rate", "banned") else 403
        return JSONResponse({"detail": "Forbidden" if status == 403 else "Too many requests"}, status_code=status, headers={"Retry-After": "600"} if status == 429 else {})
    response = await call_next(request)
    guard.note_status(request, response.status_code)
    return response
