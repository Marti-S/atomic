"""Token-authenticated loopback HTTP/1.1, one scorer and one queued request.

Cancelling a client drops queued work. A running GPU operation is NOT preempted;
its result is discarded, and the scorer stays occupied until it actually finishes.
No request bodies, response bodies, headers, or exception text are logged.
"""
import argparse
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import hmac
import os
import sys
import time

from contract import ContractError, MAX_REQUEST_BYTES, compact

@dataclass
class Job:
    raw: bytes
    deadline: float
    result: asyncio.Future
    cancelled: bool = False


class Service:
    def __init__(self, token, backend=None, timeout_seconds=2.0):
        if not isinstance(token, str) or len(token.encode()) < 32 or '\r' in token or '\n' in token:
            raise ValueError('invalid_service_configuration')
        if not 0 < timeout_seconds <= 2:
            raise ValueError('invalid_service_configuration')
        self.token, self.backend, self.timeout = token, backend, timeout_seconds
        self.queue = asyncio.Queue(maxsize=1)
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='decider-serial')
        self.worker = None
        self.connections = 0

    def start_worker(self):
        if self.worker is None:
            self.worker = asyncio.create_task(self.work())

    async def work(self):
        while True:
            job = await self.queue.get()
            try:
                if job.cancelled or time.monotonic() >= job.deadline:
                    continue
                try:
                    # Only this worker may enter the pool. Handler cancellation cannot start a second scorer.
                    result = await asyncio.get_running_loop().run_in_executor(self.pool, self.backend.infer, job.raw)
                except ContractError as error:
                    result = error
                except Exception:
                    result = ContractError('provider_unavailable', 503)
                if not job.cancelled and time.monotonic() < job.deadline and not job.result.done():
                    job.result.set_result(result)
            finally:
                self.queue.task_done()
                if not job.result.done():
                    job.result.cancel()

    def prune_cancelled(self):
        # Public Queue operations only. At most one queued job, no await or competing worker in this boundary.
        if self.queue.empty():
            return
        job = self.queue.get_nowait()
        self.queue.task_done()
        if job.cancelled or time.monotonic() >= job.deadline:
            job.result.cancel()
        else:
            self.queue.put_nowait(job)

    async def respond(self, writer, status, payload):
        body = compact(payload)
        if len(body) > 1048576:
            status, body = 503, b'{"code":"decision_invalid"}'
        reason = {200: 'OK', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found', 413: 'Content Too Large',
                  422: 'Unprocessable Content', 429: 'Too Many Requests', 503: 'Service Unavailable', 504: 'Gateway Timeout'}[status]
        writer.write(f'HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n'.encode() + body)
        await asyncio.wait_for(writer.drain(), 0.5)

    async def connection(self, reader, writer):
        self.connections += 1
        job, disconnected = None, None
        try:
            if self.connections > 16:
                await self.respond(writer, 429, {'code': 'provider_unavailable'})
                return
            header = await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 2)
            if len(header) > 8192:
                raise ContractError('decision_invalid', 400)
            try:
                lines = header.decode('ascii').split('\r\n')
                method, target, version = lines[0].split(' ')
                fields = {}
                for line in lines[1:-2]:
                    key, value = line.split(':', 1)
                    key = key.lower()
                    if not key or key in fields or key.strip() != key or line[0].isspace():
                        raise ValueError()
                    fields[key] = value.strip()
            except (UnicodeError, ValueError, IndexError):
                raise ContractError('decision_invalid', 400) from None
            if version != 'HTTP/1.1' or 'transfer-encoding' in fields:
                raise ContractError('decision_invalid', 400)
            expected = ('Bearer ' + self.token).encode()
            supplied = fields.get('authorization', '').encode()
            if not hmac.compare_digest(expected, supplied):
                await self.respond(writer, 401, {'code': 'unauthorized'})
                return
            if method == 'GET' and target == '/health/ready':
                if fields.get('content-length', '0') != '0':
                    raise ContractError('decision_invalid', 400)
                await self.respond(writer, 200 if self.backend else 503,
                                   self.backend.ready() if self.backend else {'ready': False, 'code': 'provider_unavailable'})
                return
            if method != 'POST' or target != '/v1/systemone':
                await self.respond(writer, 404, {'code': 'not_found'})
                return
            if not self.backend:
                await self.respond(writer, 503, {'code': 'provider_unavailable'})
                return
            length = fields.get('content-length', '')
            if not length.isascii() or not length.isdigit() or fields.get('content-type') != 'application/json':
                raise ContractError('decision_invalid', 400)
            length = int(length)
            if not 0 < length <= MAX_REQUEST_BYTES:
                raise ContractError('context_limit')
            raw = await asyncio.wait_for(reader.readexactly(length), 2)
            self.prune_cancelled()
            future = asyncio.get_running_loop().create_future()
            job = Job(raw, time.monotonic() + self.timeout, future)
            try:
                self.queue.put_nowait(job)
            except asyncio.QueueFull:
                await self.respond(writer, 429, {'code': 'provider_unavailable'})
                return
            # HTTP pipelining is intentionally unsupported. EOF or extra bytes invalidate this job.
            disconnected = asyncio.create_task(reader.read(1))
            done, _ = await asyncio.wait((future, disconnected), timeout=self.timeout, return_when=asyncio.FIRST_COMPLETED)
            if disconnected in done:
                job.cancelled = True
                return
            if future not in done or future.cancelled():
                job.cancelled = True
                await self.respond(writer, 504, {'code': 'provider_unavailable'})
                return
            result = future.result()
            if time.monotonic() >= job.deadline:
                await self.respond(writer, 504, {'code': 'provider_unavailable'})
            elif isinstance(result, ContractError):
                await self.respond(writer, result.status, {'code': result.code})
            else:
                await self.respond(writer, 200, result)
        except ContractError as error:
            try:
                await self.respond(writer, error.status, {'code': error.code})
            except Exception:
                pass
        except (Exception, asyncio.CancelledError):
            # Body-less, static failures. A closed/malformed peer needs no application log.
            pass
        finally:
            if job:
                job.cancelled = True
            self.prune_cancelled()
            if disconnected:
                disconnected.cancel()
            self.connections -= 1
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def close(self):
        if self.worker:
            self.worker.cancel()
            await asyncio.gather(self.worker, return_exceptions=True)
        self.pool.shutdown(wait=True, cancel_futures=True)


async def main(args):
    from backend import LocalDecider
    token = os.environ.get('ATOMIC_DECIDER_SERVICE_TOKEN', '')
    service = Service(token)
    server = await asyncio.start_server(service.connection, host=args.bind, port=args.port, limit=8192)
    try:
        # Listen with 503 readiness while loading/warming. No tool invocation ever initiates loading.
        service.backend = await asyncio.get_running_loop().run_in_executor(service.pool, LocalDecider, args.snapshot, args.manifest)
        service.start_worker()
        print('decider-investigation: ready', file=sys.stderr)
        async with server:
            await server.serve_forever()
    finally:
        server.close()
        await server.wait_closed()
        await service.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--bind', choices=('127.0.0.1', '::1'), default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if not 0 < args.port <= 65535:
        parser.error('invalid port')
    try:
        asyncio.run(main(args))
    except KeyboardInterrupt:
        pass
    except Exception:
        print('decider-investigation: startup_failed', file=sys.stderr)
        sys.exit(1)
